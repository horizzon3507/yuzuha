import { ConfigError } from '../errors.js';

export interface ConcurrencyOptions {
  max?: number;
  perGuild?: number;
  maxPending?: number;
}

interface Waiter {
  guildKey: string | undefined;
  signal: AbortSignal;
  resolve: (release: (() => void) | null) => void;
  cleanup: () => void;
}

function isPlainObject(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Bounds simultaneous command dispatches globally and per guild with fair FIFO wakeup. */
export class ConcurrencyLimiter {
  private readonly max?: number;
  private readonly perGuild?: number;
  private readonly maxPending?: number;
  private activeTotal = 0;
  private readonly activePerGuild = new Map<string, number>();
  private readonly waiters: Waiter[] = [];
  private closed = false;

  constructor(options: ConcurrencyOptions = {}) {
    if (!isPlainObject(options)) {
      throw new ConfigError('CONCURRENCY_OPTIONS', 'Opções de concorrência inválidas.');
    }
    if (options.max !== undefined && (!Number.isSafeInteger(options.max) || options.max < 1)) {
      throw new ConfigError('CONCURRENCY_OPTIONS', 'max de concorrência deve ser um inteiro seguro maior ou igual a 1.');
    }
    if (options.perGuild !== undefined && (!Number.isSafeInteger(options.perGuild) || options.perGuild < 1)) {
      throw new ConfigError('CONCURRENCY_OPTIONS', 'perGuild de concorrência deve ser um inteiro seguro maior ou igual a 1.');
    }
    if (options.maxPending !== undefined && (!Number.isSafeInteger(options.maxPending) || options.maxPending < 0)) {
      throw new ConfigError('CONCURRENCY_OPTIONS', 'maxPending de concorrência deve ser um inteiro seguro maior ou igual a 0.');
    }
    this.max = options.max;
    this.perGuild = options.perGuild;
    this.maxPending = options.maxPending;
  }

  get active(): number {
    return this.activeTotal;
  }

  get pending(): number {
    return this.waiters.length;
  }

  acquire(guildID: string | undefined, signal: AbortSignal): Promise<(() => void) | null> {
    if (this.closed || signal.aborted) return Promise.resolve(null);
    const guildKey = guildID ? guildID : undefined;
    if (this.canStart(guildKey)) return Promise.resolve(this.grant(guildKey));
    if (this.maxPending !== undefined && this.waiters.length >= this.maxPending) return Promise.resolve(null);

    return new Promise<(() => void) | null>(resolve => {
      const onAbort = () => {
        const index = this.waiters.indexOf(waiter);
        if (index !== -1) this.waiters.splice(index, 1);
        cleanup();
        resolve(null);
      };
      const cleanup = () => {
        signal.removeEventListener('abort', onAbort);
      };
      const waiter: Waiter = { guildKey, signal, resolve, cleanup };
      signal.addEventListener('abort', onAbort, { once: true });
      this.waiters.push(waiter);
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const pending = this.waiters.splice(0);
    for (const waiter of pending) {
      waiter.cleanup();
      waiter.resolve(null);
    }
  }

  private canStart(guildKey: string | undefined): boolean {
    if (this.closed) return false;
    if (this.max !== undefined && this.activeTotal >= this.max) return false;
    if (this.perGuild !== undefined && guildKey !== undefined && (this.activePerGuild.get(guildKey) ?? 0) >= this.perGuild) {
      return false;
    }
    return true;
  }

  private grant(guildKey: string | undefined): () => void {
    this.activeTotal++;
    if (guildKey !== undefined) {
      this.activePerGuild.set(guildKey, (this.activePerGuild.get(guildKey) ?? 0) + 1);
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.releaseSlot(guildKey);
    };
  }

  private releaseSlot(guildKey: string | undefined): void {
    this.activeTotal--;
    if (guildKey !== undefined) {
      const next = (this.activePerGuild.get(guildKey) ?? 0) - 1;
      if (next <= 0) this.activePerGuild.delete(guildKey);
      else this.activePerGuild.set(guildKey, next);
    }
    for (let index = 0; index < this.waiters.length; index++) {
      const waiter = this.waiters[index]!;
      if (waiter.signal.aborted) {
        this.waiters.splice(index, 1);
        waiter.cleanup();
        waiter.resolve(null);
        index--;
        continue;
      }
      if (!this.canStart(waiter.guildKey)) continue;
      this.waiters.splice(index, 1);
      waiter.cleanup();
      waiter.resolve(this.grant(waiter.guildKey));
      break;
    }
  }
}
