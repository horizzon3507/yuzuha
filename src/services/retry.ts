import { ConfigError, YuzuhaError } from '../shared/errors.js';

export interface TransportRetryPolicy {
  requests?: number;
  delayMs?: number;
  backoff?: number;
  maxDelayMs?: number;
  jitter?: number;
  retryOn?: (error: unknown, attempt: number) => boolean;
  random?: () => number;
}
export type RetryPolicy = TransportRetryPolicy;

export interface ResolvedRetryPolicy {
  requests: number;
  delayMs: number;
  backoff: number;
  maxDelayMs: number;
  jitter: number;
  retryOn?: (error: unknown, attempt: number) => boolean;
  random?: () => number;
}

export interface Reliability {
  retry?: false | TransportRetryPolicy;
  signal?: AbortSignal;
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
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

const DEFAULT_RETRY_POLICY = {
  requests: 1,
  delayMs: 750,
  backoff: 2,
  maxDelayMs: 30_000,
  jitter: 0,
} as const;

export function resolvePolicy(retry: false | TransportRetryPolicy | undefined): ResolvedRetryPolicy | false {
  if (retry === false) return false;
  if (retry !== undefined) {
    const prototype = retry === null || typeof retry !== 'object' || Array.isArray(retry) ? undefined : Object.getPrototypeOf(retry);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new ConfigError('RETRY_OPTIONS', 'Opções de retry inválidas.');
    }
  }
  const requests = retry?.requests ?? DEFAULT_RETRY_POLICY.requests;
  const delayMs = retry?.delayMs ?? DEFAULT_RETRY_POLICY.delayMs;
  const backoff = retry?.backoff ?? DEFAULT_RETRY_POLICY.backoff;
  const maxDelayMs = retry?.maxDelayMs ?? DEFAULT_RETRY_POLICY.maxDelayMs;
  const jitter = retry?.jitter ?? DEFAULT_RETRY_POLICY.jitter;
  if (!Number.isSafeInteger(requests) || requests < 0) {
    throw new ConfigError('RETRY_OPTIONS', 'requests deve ser um inteiro não negativo.');
  }
  if (!Number.isFinite(delayMs) || delayMs <= 0) {
    throw new ConfigError('RETRY_OPTIONS', 'delayMs deve ser um número finito maior que zero.');
  }
  if (!Number.isFinite(maxDelayMs) || maxDelayMs <= 0) {
    throw new ConfigError('RETRY_OPTIONS', 'maxDelayMs deve ser um número finito maior que zero.');
  }
  if (!Number.isFinite(backoff) || backoff < 1) {
    throw new ConfigError('RETRY_OPTIONS', 'backoff deve ser um número finito maior ou igual a 1.');
  }
  if (!Number.isFinite(jitter) || jitter < 0 || jitter > 1) {
    throw new ConfigError('RETRY_OPTIONS', 'jitter deve estar entre 0 e 1.');
  }
  if (retry?.retryOn !== undefined && typeof retry.retryOn !== 'function') {
    throw new ConfigError('RETRY_OPTIONS', 'retryOn deve ser uma função.');
  }
  if (retry?.random !== undefined && typeof retry.random !== 'function') {
    throw new ConfigError('RETRY_OPTIONS', 'random deve ser uma função.');
  }
  return {
    requests,
    delayMs,
    backoff,
    maxDelayMs,
    jitter,
    ...(retry?.retryOn ? { retryOn: retry.retryOn } : {}),
    ...(retry?.random ? { random: retry.random } : {}),
  };
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, reliability: Reliability = {},
  safe: (error: unknown) => boolean = isTransientError): Promise<T> {
  const policy = resolvePolicy(reliability.retry);
  if (policy === false) return fn(0);
  const shouldRetry = policy.retryOn ?? ((err: unknown) => safe(err));
  let attempt = 0;
  for (;;) {
    try { return await fn(attempt); }
    catch (error) {
      if (reliability.signal?.aborted || isAbortError(error) || attempt >= policy.requests) throw error;
      const nextAttempt = attempt + 1;
      if (!shouldRetry(error, nextAttempt)) throw error;
      attempt = nextAttempt;
      const raw = Math.min(policy.maxDelayMs, policy.delayMs * (policy.backoff ** (attempt - 1)));
      let delay = raw;
      if (policy.jitter > 0) {
        const rand = (policy.random ?? Math.random)();
        if (!Number.isFinite(rand) || rand < 0 || rand > 1) {
          throw new ConfigError('RETRY_OPTIONS', 'A fonte de jitter deve retornar um número entre 0 e 1.');
        }
        delay = Math.min(policy.maxDelayMs, Math.max(1, Math.round(raw * (1 + (2 * rand - 1) * policy.jitter))));
      }
      reliability.onRetry?.(attempt, error, delay);
      await sleep(delay, reliability.signal);
    }
  }
}
