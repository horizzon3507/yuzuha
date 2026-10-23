import type { MusicAudioStream } from '../../ports/music.js';
import { abortable, cancellationError } from '../../services/cancellation.js';
import { YuzuhaError } from '../../shared/errors.js';

export async function openAudioStream(options: {
  url: URL; password: string; fetch: typeof globalThis.fetch; timeout: number; idleTimeout: number;
  controller: AbortController; signal: AbortSignal; release: () => void;
}): Promise<MusicAudioStream> {
  const { controller, signal } = options;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let closed = false, consumed = false, timedOut = false;
  let closeTask: Promise<void> | undefined;
  const close = (): Promise<void> => {
    if (closeTask) return closeTask;
    closed = true; signal.removeEventListener('abort', onAbort); controller.abort(); options.release();
    closeTask = (async () => { await reader?.cancel().catch(() => {}); })();
    return closeTask;
  };
  const onAbort = () => { if (!closed) void close(); };
  signal.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeout);
  timeout.unref();
  try {
    if (signal.aborted) throw cancellationError();
    const fetching = options.fetch(options.url, { headers: { Authorization: options.password }, redirect: 'error', signal });
    void fetching.then(response => { if (signal.aborted && !response.body?.locked) void response.body?.cancel().catch(() => {}); }, () => {});
    const response = await abortable(fetching, signal);
    if (!response.ok || response.headers.get('x-yuzuha-audio-version') !== '1' || !/^audio\/webm(?:;|$)/i.test(response.headers.get('content-type') ?? '')) {
      await response.body?.cancel().catch(() => {});
      const code = response.status === 404 ? 'LAVALINK_AUDIO_PLUGIN' : response.status === 409 ? 'LAVALINK_AUDIO_BUSY'
        : response.status === 429 ? 'LAVALINK_AUDIO_LIMIT' : response.status === 401 || response.status === 403 ? 'LAVALINK_AUDIO_AUTH' : 'LAVALINK_AUDIO_PROTOCOL';
      throw new YuzuhaError(code,
        response.status === 404 ? 'Instale o plugin yuzuha-audio no Lavalink 4.2.2 para transmitir áudio ao Fluxer.' : `Saída de áudio incompatível (HTTP ${response.status}).`);
    }
    reader = response.body?.getReader();
    if (!reader) throw new YuzuhaError('LAVALINK_AUDIO_PROTOCOL', 'A saída de áudio não possui um corpo de resposta.');
    const activeReader = reader;
    return {
      format: 'webm-opus', close,
      data: {
        async *[Symbol.asyncIterator]() {
          if (consumed) throw new YuzuhaError('LAVALINK_AUDIO_CONSUMED', 'O áudio já possui um consumidor.');
          consumed = true;
          try {
            while (!closed) {
              const idle = setTimeout(() => { timedOut = true; controller.abort(); }, options.idleTimeout);
              idle.unref();
              let part: ReadableStreamReadResult<Uint8Array>;
              try { part = await abortable(activeReader.read(), signal); }
              finally { clearTimeout(idle); }
              if (part.done) break;
              if (part.value.byteLength > 1_048_576) throw new YuzuhaError('LAVALINK_AUDIO_LIMIT', 'Bloco de áudio excede 1 MiB.');
              yield part.value;
            }
          } catch (error) {
            if (closed && !timedOut) return;
            if (timedOut) throw new YuzuhaError('LAVALINK_AUDIO_TIMEOUT', 'A saída de áudio parou de fornecer dados.');
            if (signal.aborted) throw cancellationError();
            throw error instanceof YuzuhaError ? error : new YuzuhaError('LAVALINK_AUDIO_CONNECTION', 'A conexão de áudio com o Lavalink foi interrompida.');
          } finally { await close(); activeReader.releaseLock(); }
        },
      },
    };
  } catch (error) {
    const cancelled = signal.aborted;
    await close();
    if (timedOut) throw new YuzuhaError('LAVALINK_AUDIO_TIMEOUT', 'O Lavalink não abriu a saída de áudio no prazo.');
    if (cancelled) throw cancellationError();
    throw error instanceof YuzuhaError ? error : new YuzuhaError('LAVALINK_AUDIO_CONNECTION', 'Não foi possível abrir a saída de áudio do Lavalink.');
  } finally { clearTimeout(timeout); }
}
