import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { JsonValue, State } from '../../domain/state.js';
import { ConfigError, StoreError } from '../../shared/errors.js';
import { MemoryStore } from './memory.js';
import type { PreparedTransaction } from './memory.js';
import { defaultDataPath } from './paths.js';
import { createUndoRecord, rollbackUndoRecord } from './snapshot.js';
import type { UndoRecord } from './snapshot.js';
import { decodeState, isPlainRecord } from './state.js';

const MAX_FLUSH_MS = 2_147_483_647;

export interface JsonStoreTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface JsonStoreOptions {
  /** Coalescing window in ms before flushing dirty state to disk. Default: 0 (coalesces concurrent queued writes and flushes before resolving). */
  flushMs?: number;
  /** Formats JSON with 2-space indentation and trailing newline. Default: false (compact JSON). */
  pretty?: boolean;
  /** Optional callback invoked if a timer-triggered background flush fails. */
  onError?: (error: unknown) => void;
  /** Optional timer hooks for deterministic testing. */
  timers?: JsonStoreTimers;
}

interface ImmediateBatch {
  undo: UndoRecord;
  hasOperations: boolean;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}

const DEFAULT_TIMERS: JsonStoreTimers = {
  setTimeout: (fn, ms) => {
    const handle = setTimeout(fn, ms);
    handle.unref?.();
    return handle;
  },
  clearTimeout: handle => clearTimeout(handle as never),
};

function closedError(): StoreError {
  return new StoreError('STORE_CLOSED', 'O store JSON está fechado.');
}

function createImmediateBatch(): ImmediateBatch {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.catch(() => {});
  return { undo: createUndoRecord(), hasOperations: false, promise, resolve, reject };
}

function resolveOptions(options?: JsonStoreOptions): {
  flushMs: number;
  pretty: boolean;
  onError?: (error: unknown) => void;
  timers: JsonStoreTimers;
} {
  if (options === undefined) return { flushMs: 0, pretty: false, timers: DEFAULT_TIMERS };
  if (!isPlainRecord(options)) {
    throw new ConfigError('JSON_STORE_OPTIONS', 'Opções do JsonStore inválidas.');
  }
  const typed = options as JsonStoreOptions;
  const flushMs = typed.flushMs === undefined ? 0 : typed.flushMs;
  if (typeof flushMs !== 'number' || !Number.isSafeInteger(flushMs) || flushMs < 0 || flushMs > MAX_FLUSH_MS) {
    throw new ConfigError('JSON_STORE_OPTIONS', `flushMs deve ser um inteiro entre 0 e ${MAX_FLUSH_MS}.`);
  }
  const pretty = typed.pretty === undefined ? false : typed.pretty;
  if (typeof pretty !== 'boolean') {
    throw new ConfigError('JSON_STORE_OPTIONS', 'pretty deve ser booleano.');
  }
  if (typed.onError !== undefined && typeof typed.onError !== 'function') {
    throw new ConfigError('JSON_STORE_OPTIONS', 'onError deve ser uma função.');
  }
  const timers = typed.timers === undefined ? DEFAULT_TIMERS : typed.timers;
  if (!timers || typeof timers !== 'object'
    || typeof timers.setTimeout !== 'function' || typeof timers.clearTimeout !== 'function') {
    throw new ConfigError('JSON_STORE_OPTIONS', 'timers deve implementar setTimeout e clearTimeout.');
  }
  return { flushMs, pretty, onError: typed.onError, timers };
}

export class JsonStore extends MemoryStore {
  private loaded = false;
  private closing = false;
  private closed = false;
  private dirty = false;
  private flushTimer?: unknown;
  private hasFlushTimer = false;
  private closeTask?: Promise<void>;
  private queuedImmediateUpdates = 0;
  private currentImmediateBatch?: ImmediateBatch;
  private readonly flushMs: number;
  private readonly pretty: boolean;
  private readonly onError?: (error: unknown) => void;
  private readonly timers: JsonStoreTimers;

  constructor(public readonly path = defaultDataPath(), options?: JsonStoreOptions) {
    super();
    const resolved = resolveOptions(options);
    this.flushMs = resolved.flushMs;
    this.pretty = resolved.pretty;
    this.onError = resolved.onError;
    this.timers = resolved.timers;
  }

  protected override async load(): Promise<void> {
    if (this.loaded) return;
    let content: string;
    try { content = await readFile(this.path, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') { this.loaded = true; return; }
      throw error;
    }
    this.state = decodeState(content);
    this.loaded = true;
  }

  protected override async prepareAccess(): Promise<void> {
    await this.load();
    if (this.currentImmediateBatch) {
      const batch = this.currentImmediateBatch;
      this.currentImmediateBatch = undefined;
      await this.flushImmediateBatchSafe(batch);
    }
  }

  protected override async commit(state: State): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    const serialized = this.pretty ? `${JSON.stringify(state, null, 2)}\n` : JSON.stringify(state);
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(serialized); await file.sync(); }
      finally { await file.close(); }
      await rename(temporary, this.path);
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    }
  }

  private clearFlushTimer(): void {
    if (!this.hasFlushTimer) return;
    this.timers.clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    this.hasFlushTimer = false;
  }

  private scheduleFlush(): void {
    if (this.hasFlushTimer || this.closing || this.closed) return;
    this.hasFlushTimer = true;
    let settledSync = false;
    const handle = this.timers.setTimeout(() => {
      settledSync = true;
      if (this.flushTimer === handle) {
        this.hasFlushTimer = false;
        this.flushTimer = undefined;
      }
      if (this.closing || this.closed || !this.dirty) return;
      void this.flushFromTimer();
    }, this.flushMs);
    if (!settledSync && !this.closing && !this.closed) {
      this.flushTimer = handle;
    } else if (settledSync) {
      this.hasFlushTimer = false;
    }
  }

  private async flushFromTimer(): Promise<void> {
    try {
      await this.queue.run(async () => {
        if (this.closed || !this.dirty) return;
        await this.commit(this.state);
        this.dirty = false;
      });
    } catch (error) {
      try { this.onError?.(error); } catch {}
    }
  }

  private async flushImmediateBatch(batch: ImmediateBatch): Promise<void> {
    try {
      await this.commit(this.state);
      batch.resolve();
    } catch (error) {
      rollbackUndoRecord(this.state, batch.undo);
      batch.reject(error);
      throw error;
    }
  }

  private async flushImmediateBatchSafe(batch: ImmediateBatch): Promise<void> {
    try { await this.flushImmediateBatch(batch); } catch {}
  }

  override read<T>(reader: (state: Readonly<State>) => T): Promise<T> {
    if (this.closing || this.closed) return Promise.reject(closedError());
    return super.read(reader);
  }

  override readVariable(key: string, now: () => number): Promise<JsonValue | undefined> {
    if (this.closing || this.closed) return Promise.reject(closedError());
    return super.readVariable(key, now);
  }

  override readVariableEntry(key: string, now: () => number) {
    if (this.closing || this.closed) return Promise.reject(closedError());
    return super.readVariableEntry(key, now);
  }

  override update<T>(writer: (state: State) => T): Promise<T> {
    if (this.closing || this.closed) return Promise.reject(closedError());

    if (this.flushMs > 0) {
      return this.queue.run(async () => {
        await this.load();
        const { result, pending } = this.prepareTransaction(writer);
        this.applyPreparedTransaction(pending);
        this.dirty = true;
        this.scheduleFlush();
        return result;
      });
    }

    this.queuedImmediateUpdates++;
    const step = this.queue.run(async () => {
      this.queuedImmediateUpdates--;
      let batch = this.currentImmediateBatch;
      if (!batch) {
        batch = createImmediateBatch();
        this.currentImmediateBatch = batch;
      }

      let prepared: PreparedTransaction<T>;
      try {
        await this.load();
        prepared = this.prepareTransaction(writer);
      } catch (error) {
        if (this.queuedImmediateUpdates === 0 && this.currentImmediateBatch === batch) {
          this.currentImmediateBatch = undefined;
          if (batch.hasOperations) await this.flushImmediateBatchSafe(batch);
        }
        throw error;
      }

      this.applyPreparedTransaction(prepared.pending, batch.undo);
      batch.hasOperations = true;

      if (this.queuedImmediateUpdates === 0 && this.currentImmediateBatch === batch) {
        this.currentImmediateBatch = undefined;
        await this.flushImmediateBatch(batch);
        return { result: prepared.result, batch: undefined as ImmediateBatch | undefined };
      }

      return { result: prepared.result, batch };
    });

    return step.then(async ({ result, batch }) => {
      if (batch) await batch.promise;
      return result;
    });
  }

  /** Persists any pending dirty state atomically to disk immediately. */
  flush(): Promise<void> {
    if (this.closing || this.closed) return Promise.reject(closedError());
    this.clearFlushTimer();
    return this.queue.run(async () => {
      if (this.closed) throw closedError();
      if (this.currentImmediateBatch) {
        const batch = this.currentImmediateBatch;
        this.currentImmediateBatch = undefined;
        await this.flushImmediateBatch(batch);
        return;
      }
      if (!this.dirty) return;
      await this.commit(this.state);
      this.dirty = false;
    });
  }

  /** Flushes pending dirty state, clears timers, and prevents future reads or writes. */
  close(): Promise<void> {
    if (this.closeTask) return this.closeTask;
    this.closing = true;
    this.clearFlushTimer();
    this.closeTask = this.queue.run(async () => {
      try {
        if (this.currentImmediateBatch) {
          const batch = this.currentImmediateBatch;
          this.currentImmediateBatch = undefined;
          await this.flushImmediateBatch(batch);
        } else if (this.dirty) {
          await this.commit(this.state);
          this.dirty = false;
        }
      } finally {
        this.closed = true;
        this.clearFlushTimer();
      }
    });
    return this.closeTask;
  }
}
