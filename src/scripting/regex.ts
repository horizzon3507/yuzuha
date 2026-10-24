import { Worker } from 'node:worker_threads';
import { YuzuhaError } from '../errors.js';

export interface RegexInput {
  operation: 'test' | 'match' | 'replace';
  text: string;
  pattern: string;
  flags?: string;
  replacement?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}
export interface RegexMatch {
  value: string;
  index: number;
  captures: (string | null)[];
  groups: Record<string, string | null> | null;
}
type Result = string | boolean | RegexMatch[];
type Reply = { value: Result } | { error: { code: string; message: string } };
let active = 0;

export async function runRegex(input: RegexInput): Promise<Result> {
  const timeout = input.timeoutMs ?? 500;
  if (!Number.isSafeInteger(timeout) || timeout < 10 || timeout > 2000) throw new YuzuhaError('REGEX_TIMEOUT', 'Prazo de regex deve ser de 10 a 2000 ms.');
  if (input.text.length > 100_000 || input.pattern.length > 512 || (input.replacement?.length ?? 0) > 1000)
    throw new YuzuhaError('EXECUTION_LIMIT', 'Regex excede limites de texto (100000), padrão (512) ou substituição (1000).');
  const flags = input.flags ?? '';
  if (!/^[gimsu]*$/.test(flags) || new Set(flags).size !== flags.length) throw new YuzuhaError('REGEX_FLAGS', 'Flags aceitas, sem repetição: g, i, m, s, u.');
  if (input.signal?.aborted) throw new YuzuhaError('EXECUTION_ABORTED', 'Regex cancelada.');
  if (active >= 4) throw new YuzuhaError('EXECUTION_LIMIT', 'Limite de quatro regex simultâneas atingido.');
  const worker = new Worker(new URL('./regex-worker.mjs', import.meta.url), {
    workerData: { operation: input.operation, text: input.text, pattern: input.pattern, flags, replacement: input.replacement ?? '' },
    execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8, stackSizeMb: 1 },
  });
  active++;
  return new Promise<Result>((resolve, reject) => {
    let settled = false;
    const finish = async (error?: Error, value?: Result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener('abort', abort);
      try { await worker.terminate(); }
      catch (cause) { error ??= new YuzuhaError('REGEX_WORKER', 'Não foi possível encerrar o worker de regex.', { cause }); }
      finally {
        active--;
        worker.removeAllListeners();
        if (error) reject(error); else resolve(value!);
      }
    };
    const abort = () => { void finish(new YuzuhaError('EXECUTION_ABORTED', 'Regex cancelada.')); };
    const timer = setTimeout(() => { void finish(new YuzuhaError('EXECUTION_LIMIT', 'Regex excedeu o prazo de execução.')); }, timeout);
    worker.once('message', (reply: Reply) => {
      if ('error' in reply) void finish(new YuzuhaError(reply.error.code, reply.error.message));
      else void finish(undefined, reply.value);
    });
    worker.once('error', error => { void finish(new YuzuhaError('REGEX_WORKER', 'Falha no worker de regex.', { cause: error })); });
    worker.once('exit', () => { if (!settled) void finish(new YuzuhaError('REGEX_WORKER', 'Worker encerrado sem resultado.')); });
    input.signal?.addEventListener('abort', abort, { once: true });
    if (input.signal?.aborted) abort();
  });
}
