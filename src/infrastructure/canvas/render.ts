import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { YuzuhaError } from '../../shared/errors.js';
import { CANVAS_LIMITS, inspectCanvasImage, type CanvasFormat, type CanvasResult, type CanvasScene } from '../../domain/canvas.js';
import type { CanvasRenderer } from '../../ports/canvas.js';
import { acquireImageProcess } from '../process-budget.js';

type WorkerReply = { result: { data: Uint8Array; format: CanvasFormat; width: number; height: number } }
  | { error: { code: string; message: string } };

function abortError(signal: AbortSignal): Error {
  const reason = signal.reason;
  return reason instanceof Error ? reason : new YuzuhaError('EXECUTION_ABORTED', 'Renderização cancelada.');
}

function validateScene(scene: CanvasScene): void {
  const width = scene.width * scene.scale, height = scene.height * scene.scale;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width > CANVAS_LIMITS.maxPhysicalDimension || height > CANVAS_LIMITS.maxPhysicalDimension
    || width * height > CANVAS_LIMITS.maxPixels) throw new YuzuhaError('CANVAS_OPTIONS', 'Dimensões físicas excedem os limites do Canvas.');
  for (const operation of scene.operations) {
    const sources = operation.type === 'image' || operation.type === 'avatar' ? [operation.source]
      : operation.type === 'badges' ? operation.items.flatMap(item => item.icon ? [item.icon] : []) : [];
    for (const source of sources) {
      if (!(source instanceof Uint8Array)) throw new YuzuhaError('CANVAS_PROCESS', 'Cena enviada sem resolver seus assets.');
      inspectCanvasImage(source);
    }
  }
  for (const font of scene.fonts) {
    if (!(font.source instanceof Uint8Array)) throw new YuzuhaError('CANVAS_PROCESS', 'Cena enviada sem resolver suas fontes.');
  }
}

export const canvasRenderer: CanvasRenderer = Object.freeze({
  async render(scene: CanvasScene, options: import('../../domain/canvas.js').CanvasRenderRequestOptions): Promise<CanvasResult> {
    validateScene(scene);
    if (options.signal?.aborted) throw abortError(options.signal);
    const release = acquireImageProcess();
    let child: ChildProcess;
    try {
      child = fork(new URL('./worker.mjs', import.meta.url), [], {
        serialization: 'advanced', execArgv: ['--max-old-space-size=128'],
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: { ...process.env, VIPS_CONCURRENCY: '1' },
      });
    } catch (cause) {
      release();
      throw new YuzuhaError('CANVAS_PROCESS', 'Não foi possível iniciar o processo de Canvas.', { cause });
    }
    return new Promise<CanvasResult>((resolve, reject) => {
      let result: Extract<WorkerReply, { result: unknown }>['result'] | undefined;
      let failure: Error | undefined;
      let settled = false;
      const stop = (error?: Error) => {
        if (error) failure ??= error;
        if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      };
      const abort = () => stop(abortError(options.signal!));
      const timer = setTimeout(() => stop(new YuzuhaError('EXECUTION_LIMIT', 'Renderização excedeu o prazo configurado.')),
        options.timeoutMs);
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        child.removeAllListeners();
        release();
        if (failure) { reject(failure); return; }
        if (!result) { reject(new YuzuhaError('CANVAS_PROCESS', 'Processo de Canvas terminou sem resultado.')); return; }
        try {
          if (!(result.data instanceof Uint8Array) || result.data.byteLength > CANVAS_LIMITS.maxOutputBytes
            || result.format !== 'png' && result.format !== 'jpeg' && result.format !== 'webp') {
            throw new YuzuhaError('CANVAS_PROCESS', 'Processo retornou uma imagem inválida.');
          }
          const decoded = inspectCanvasImage(result.data);
          const expectedWidth = scene.width * scene.scale, expectedHeight = scene.height * scene.scale;
          if (result.width !== expectedWidth || result.height !== expectedHeight || decoded.width !== expectedWidth || decoded.height !== expectedHeight
            || decoded.format !== result.format) throw new YuzuhaError('CANVAS_PROCESS', 'Dimensões ou formato da saída não correspondem à cena.');
          resolve({ data: new Uint8Array(result.data), format: result.format, width: result.width, height: result.height });
        } catch (error) { reject(error); }
      };
      child.once('message', (reply: WorkerReply) => {
        if (!reply || typeof reply !== 'object') { stop(new YuzuhaError('CANVAS_PROCESS', 'Resposta inválida do processo de Canvas.')); return; }
        if ('error' in reply) {
          const code = ['CANVAS_DEPENDENCY', 'CANVAS_INPUT', 'CANVAS_OPTIONS', 'CANVAS_PROCESS', 'EXECUTION_LIMIT'].includes(reply.error.code)
            ? reply.error.code : 'CANVAS_PROCESS';
          stop(new YuzuhaError(code, reply.error.message));
        } else result = reply.result;
      });
      child.once('error', error => stop(new YuzuhaError('CANVAS_PROCESS', 'Falha no processo de Canvas.', { cause: error })));
      child.once('close', finish);
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) abort();
      if (failure) return;
      child.send({ scene, renderOptions: { format: options.format, quality: options.quality, matte: options.matte } }, error => {
        if (error) stop(new YuzuhaError('CANVAS_PROCESS', 'Falha ao enviar a cena ao processo de Canvas.', { cause: error }));
      });
    });
  },
});
