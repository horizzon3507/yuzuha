import { YuzuhaError } from '../shared/errors.js';

export interface RetryPolicy {
  requests?: number;
  delayMs?: number;
}

export interface Reliability {
  retry?: false | RetryPolicy;
  signal?: AbortSignal;
  onRetry?: (attempt: number, error: unknown) => void;
}

const TRANSIENT_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND',
  'EPIPE', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT']);
const CONNECT_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT']);

function codeOf(error: unknown): string | undefined {
  const candidate = error as { code?: unknown; cause?: { code?: unknown } } | null | undefined;
  if (typeof candidate?.code === 'string') return candidate.code;
  if (typeof candidate?.cause?.code === 'string') return candidate.cause.code;
  return undefined;
}

export function isTransientError(error: unknown): boolean {
  const code = codeOf(error);
  return code !== undefined && TRANSIENT_CODES.has(code);
}

export function isUndeliveredSend(error: unknown): boolean {
  const code = codeOf(error);
  return code !== undefined && CONNECT_CODES.has(code);
}

export function isNotFound(error: unknown): boolean {
  const candidate = error as { code?: unknown; status?: unknown } | null | undefined;
  return candidate?.status === 404 || candidate?.code === 10008 || candidate?.code === 10007;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || (error as { code?: unknown }).code === 'ABORT_ERR')
    || error instanceof YuzuhaError && error.code === 'EXECUTION_ABORTED';
}

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) { await new Promise(resolve => setTimeout(resolve, ms)); return; }
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason instanceof Error ? signal.reason : new YuzuhaError('EXECUTION_ABORTED', 'Execução abortada.')); return; }
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(signal.reason instanceof Error ? signal.reason : new YuzuhaError('EXECUTION_ABORTED', 'Execução abortada.')); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function resolvePolicy(retry: false | RetryPolicy | undefined): Required<RetryPolicy> | false {
  if (retry === false) return false;
  return { requests: retry?.requests ?? 1, delayMs: retry?.delayMs ?? 750 };
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, reliability: Reliability = {},
  safe: (error: unknown) => boolean = isTransientError): Promise<T> {
  const policy = resolvePolicy(reliability.retry);
  if (policy === false) return fn(0);
  let attempt = 0;
  for (;;) {
    try { return await fn(attempt); }
    catch (error) {
      if (reliability.signal?.aborted || isAbortError(error) || attempt >= policy.requests || !safe(error)) throw error;
      attempt += 1;
      reliability.onRetry?.(attempt, error);
      await sleep(policy.delayMs, reliability.signal);
    }
  }
}
