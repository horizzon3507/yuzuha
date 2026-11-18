/** Active mutual-exclusion lease for a key held via {@link Lock}. */
export interface LockLease {
  readonly key: string;
  readonly token?: string;
  /** Releases the lease when still owned by this holder. */
  release(): void | Promise<void>;
  /** Extends the lease TTL; returns true if still held by this lease, false otherwise. */
  renew?(ttlMs: number): boolean | Promise<boolean>;
}

/** Mutual-exclusion lock port for cross-process coordination (e.g. scheduler task claims). */
export interface Lock {
  /** Attempts to acquire an exclusive lease for `ttlMs` ms; returns null if already held. */
  acquire(key: string, ttlMs: number): LockLease | null | Promise<LockLease | null>;
  close?(): Promise<void>;
}
