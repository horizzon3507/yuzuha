import { randomUUID } from 'node:crypto';
import { ConfigError } from '../errors.js';
import type { Lock, LockLease } from '../ports/lock.js';

export interface MemoryLockOptions {
  now?: () => number;
}

interface LockEntry {
  readonly token: string;
  expiresAt: number;
}

function isPlainObject(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertKey(key: string): void {
  if (typeof key !== 'string' || key.length === 0) {
    throw new ConfigError('LOCK_OPTIONS', 'A chave do lock deve ser um texto não vazio.');
  }
}

function assertTtl(ttlMs: number): void {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) {
    throw new ConfigError('LOCK_OPTIONS', 'ttlMs do lock deve ser um inteiro positivo.');
  }
}

/** In-memory TTL-based mutual-exclusion implementation of {@link Lock} with token-checked leases. */
export class MemoryLock implements Lock {
  private readonly now: () => number;
  private readonly entries = new Map<string, LockEntry>();
  private nextExpiration = Infinity;

  constructor(options: MemoryLockOptions = {}) {
    if (!isPlainObject(options)) {
      throw new ConfigError('LOCK_OPTIONS', 'Opções de lock inválidas.');
    }
    if (options.now !== undefined && typeof options.now !== 'function') {
      throw new ConfigError('LOCK_OPTIONS', 'now deve ser uma função.');
    }
    this.now = options.now ?? Date.now;
  }

  private sweep(time: number): void {
    if (time < this.nextExpiration) return;
    this.nextExpiration = Infinity;
    for (const [entryKey, entry] of this.entries) {
      if (time >= entry.expiresAt) this.entries.delete(entryKey);
      else if (entry.expiresAt < this.nextExpiration) this.nextExpiration = entry.expiresAt;
    }
  }

  acquire(key: string, ttlMs: number): LockLease | null {
    assertKey(key);
    assertTtl(ttlMs);
    const time = this.now();
    const existing = this.entries.get(key);
    if (existing !== undefined) {
      if (time < existing.expiresAt) return null;
      this.entries.delete(key);
    }
    this.sweep(time);
    const token = randomUUID();
    const expiresAt = time + ttlMs;
    const entry: LockEntry = { token, expiresAt };
    this.entries.set(key, entry);
    if (expiresAt < this.nextExpiration) this.nextExpiration = expiresAt;
    return {
      key,
      token,
      release: () => {
        const current = this.entries.get(key);
        if (current?.token === token) this.entries.delete(key);
      },
      renew: (renewTtlMs: number): boolean => {
        assertTtl(renewTtlMs);
        const currentTime = this.now();
        const current = this.entries.get(key);
        if (!current || current.token !== token) return false;
        if (currentTime >= current.expiresAt) {
          this.entries.delete(key);
          return false;
        }
        const nextExpiresAt = currentTime + renewTtlMs;
        current.expiresAt = nextExpiresAt;
        if (nextExpiresAt < this.nextExpiration) this.nextExpiration = nextExpiresAt;
        return true;
      },
    };
  }

  async close(): Promise<void> {
    this.entries.clear();
    this.nextExpiration = Infinity;
  }
}
