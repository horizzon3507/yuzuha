import type { MessagesResources } from '../ports/resources/messages.js';
import { YuzuhaError } from '../shared/errors.js';
import { abortable } from './cancellation.js';

export interface StreamAttachmentOptions {
  name: string;
  description?: string;
  content?: string;
  maxBytes?: number;
  timeoutMs?: number;
}

export async function sendStreamAttachment(messages: MessagesResources, channelID: string, source: ReadableStream<Uint8Array>,
  options: StreamAttachmentOptions, signal?: AbortSignal): Promise<string> {
  const name = options?.name;
  if (typeof name !== 'string' || !name.trim() || name.length > 255
    || /[\r\n]/.test(name)) throw new YuzuhaError('ATTACHMENT_NAME', 'Nome de anexo deve ter de 1 a 255 caracteres, sem quebras de linha.');
  const { description, content } = options;
  const maxBytes = options.maxBytes ?? 10_000_000, timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 10_000_000
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new YuzuhaError('ATTACHMENTS', 'maxBytes deve ser de 1 a 10000000 e timeoutMs de 1 a 30000.');
  if (signal?.aborted) throw new YuzuhaError('EXECUTION_ABORTED', 'Anexo cancelado.');
  const reader = source.getReader(), chunks: Uint8Array[] = [];
  const controller = new AbortController();
  const combined = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let size = 0, count = 0;
  try {
    for (;;) {
      const next = await abortable(reader.read(), combined);
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) throw new YuzuhaError('ATTACHMENTS', 'Stream deve fornecer Uint8Array.');
      size += next.value.byteLength;
      if (size > maxBytes || ++count > 10_000) throw new YuzuhaError('EXECUTION_LIMIT', 'Anexo excede o limite de bytes ou chunks.');
      chunks.push(new Uint8Array(next.value));
    }
    if (combined.aborted) throw new YuzuhaError('EXECUTION_ABORTED', 'Anexo cancelado.');
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new YuzuhaError('ATTACHMENT_TIMEOUT', 'Leitura do anexo excedeu o prazo.');
    throw error;
  } finally {
    clearTimeout(timer);
    // A custom source may not settle its cancellation promise; cleanup cannot hold the command open.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return messages.sendBytes(channelID, [{ data, name, description }], content);
}
