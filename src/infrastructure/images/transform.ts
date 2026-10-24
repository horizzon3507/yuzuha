import { fork } from 'node:child_process';
import { YuzuhaError } from '../../shared/errors.js';

export interface ImageTransform {
  format?: 'png' | 'jpeg' | 'webp';
  width?: number;
  height?: number;
  fit?: 'inside' | 'contain' | 'cover';
  rotate?: 0 | 90 | 180 | 270;
  grayscale?: boolean;
  quality?: number;
}
export interface ImageOptions { timeoutMs?: number; signal?: AbortSignal }
export interface ImageResult { data: Uint8Array; format: 'png' | 'jpeg' | 'webp'; width: number; height: number }
type Reply = { result: ImageResult } | { error: { code: string; message: string } };
let active = 0;

export async function transformImage(data: Uint8Array, transform: ImageTransform = {}, options: ImageOptions = {}): Promise<ImageResult> {
  if (!(data instanceof Uint8Array) || !data.byteLength || data.byteLength > 10_000_000) throw new YuzuhaError('IMAGE_INPUT', 'Imagem deve conter de 1 byte a 10 MB.');
  if (!transform || typeof transform !== 'object' || Array.isArray(transform)
    || Object.keys(transform).some(key => !['format', 'width', 'height', 'fit', 'rotate', 'grayscale', 'quality'].includes(key))
    || (transform.format !== undefined && !['png', 'jpeg', 'webp'].includes(transform.format))
    || (transform.fit !== undefined && !['inside', 'contain', 'cover'].includes(transform.fit))
    || (transform.rotate !== undefined && ![0, 90, 180, 270].includes(transform.rotate))
    || (transform.grayscale !== undefined && typeof transform.grayscale !== 'boolean')
    || (transform.quality !== undefined && (!Number.isSafeInteger(transform.quality) || transform.quality < 1 || transform.quality > 100))
    || [transform.width, transform.height].some(size => size !== undefined && (!Number.isSafeInteger(size) || size < 1 || size > 4096))) {
    throw new YuzuhaError('IMAGE_OPTIONS', 'Transformação inválida; dimensões de 1 a 4096, quality de 1 a 100.');
  }
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 30_000) throw new YuzuhaError('IMAGE_OPTIONS', 'Prazo deve ser de 10 a 30000 ms.');
  if (options.signal?.aborted) throw new YuzuhaError('EXECUTION_ABORTED', 'Imagem cancelada.');
  if (active >= 2) throw new YuzuhaError('EXECUTION_LIMIT', 'Limite de duas imagens simultâneas atingido.');
  const child = fork(new URL('./worker.mjs', import.meta.url), [], {
    serialization: 'advanced', execArgv: ['--max-old-space-size=128'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { ...process.env, VIPS_CONCURRENCY: '1' },
  });
  active++;
  return new Promise<ImageResult>((resolve, reject) => {
    let result: ImageResult | undefined, failure: Error | undefined, settled = false;
    const stop = (error?: Error) => {
      if (settled) return;
      if (error) failure ??= error;
      child.kill('SIGKILL');
    };
    const abort = () => stop(new YuzuhaError('EXECUTION_ABORTED', 'Imagem cancelada.'));
    const timer = setTimeout(() => stop(new YuzuhaError('EXECUTION_LIMIT', 'Imagem excedeu o prazo.')), timeoutMs);
    const finish = () => {
      if (settled) return;
      settled = true; clearTimeout(timer); options.signal?.removeEventListener('abort', abort); active--;
      child.removeAllListeners();
      if (failure) reject(failure);
      else if (result) resolve(result);
      else reject(new YuzuhaError('IMAGE_PROCESS', 'Processo de imagem encerrado sem resultado.'));
    };
    child.once('message', (reply: Reply) => {
      if ('error' in reply) stop(new YuzuhaError(reply.error.code, reply.error.message));
      else { result = reply.result; stop(); }
    });
    child.once('error', error => { failure = new YuzuhaError('IMAGE_PROCESS', 'Falha no processo de imagem.', { cause: error }); });
    child.once('close', finish);
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    child.send({ data: new Uint8Array(data), transform }, error => { if (error) stop(new YuzuhaError('IMAGE_PROCESS', 'Falha no envio da imagem.', { cause: error })); });
  });
}
