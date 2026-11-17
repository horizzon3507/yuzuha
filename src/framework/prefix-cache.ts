import type { IncomingMessage } from '../contracts.js';
import { ConfigError } from '../errors.js';
import { validatePrefixes } from './routing.js';

export interface PrefixCacheOptions {
  ttlMs: number;
  max?: number;
}

export interface NormalizedPrefixCacheOptions {
  ttlMs: number;
  max: number;
}

const MAX_TTL_MS = 3_600_000;
const DEFAULT_MAX_ENTRIES = 5_000;
const MAX_ENTRIES_LIMIT = 100_000;
const ARRAY_LRU_LIMIT = 256;

function isPlainObject(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function validatePrefixCacheOptions(options: false | PrefixCacheOptions | undefined): NormalizedPrefixCacheOptions | undefined {
  if (options === undefined || options === false) return undefined;
  if (!isPlainObject(options)) {
    throw new ConfigError('PREFIX_CACHE_OPTIONS', 'Opções de cache de prefixo inválidas.');
  }
  if (!Number.isSafeInteger(options.ttlMs) || options.ttlMs < 1 || options.ttlMs > MAX_TTL_MS) {
    throw new ConfigError('PREFIX_CACHE_OPTIONS', `ttlMs do cache de prefixo deve ser um inteiro seguro entre 1 e ${MAX_TTL_MS}.`);
  }
  const max = options.max === undefined ? DEFAULT_MAX_ENTRIES : options.max;
  if (!Number.isSafeInteger(max) || max < 1 || max > MAX_ENTRIES_LIMIT) {
    throw new ConfigError('PREFIX_CACHE_OPTIONS', `max do cache de prefixo deve ser um inteiro seguro entre 1 e ${MAX_ENTRIES_LIMIT}.`);
  }
  return { ttlMs: options.ttlMs, max };
}

export function prefixCacheKey(message: Pick<IncomingMessage, 'guildID' | 'channelID'>): string {
  return message.guildID ? `g:${message.guildID}` : `dm:${message.channelID}`;
}

/** Bounded 256-entry LRU cache of validated, sorted and frozen prefix arrays. */
export class ValidatedPrefixCache {
  private readonly entries = new Map<string, string[]>();
  private readonly frozenArrays = new WeakSet<readonly string[]>();

  get size(): number {
    return this.entries.size;
  }

  resolve(source: string | string[]): string[] {
    if (Array.isArray(source) && this.frozenArrays.has(source)) return source;
    let key: string;
    if (typeof source === 'string') {
      key = `s:${source}`;
    } else if (Array.isArray(source)) {
      for (let index = 0; index < source.length; index++) {
        if (typeof source[index] !== 'string') return validatePrefixes(source);
      }
      key = `a:${JSON.stringify(source)}`;
    } else {
      return validatePrefixes(source);
    }

    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached;
    }

    const validated = Object.freeze(validatePrefixes(source)) as string[];
    this.frozenArrays.add(validated);
    if (this.entries.size >= ARRAY_LRU_LIMIT) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, validated);
    return validated;
  }
}

interface DynamicEntry {
  value: string[];
  expiresAt: number;
}

export interface PrefixLookupToken {
  readonly key: string;
  readonly globalEpoch: number;
  readonly keyEpoch: number;
}

/** Bounded LRU+TTL cache for dynamic per-guild/DM prefixes with epoch-guarded population. */
export class DynamicPrefixCache {
  private readonly ttlMs: number;
  private readonly max: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, DynamicEntry>();
  private readonly inFlight = new Map<string, number>();
  private readonly keyEpochs = new Map<string, number>();
  private globalEpoch = 0;
  private closed = false;

  constructor(options: NormalizedPrefixCacheOptions, now: () => number = Date.now) {
    this.ttlMs = options.ttlMs;
    this.max = options.max;
    this.now = now;
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string): string[] | undefined {
    if (this.closed) return undefined;
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  captureToken(key: string): PrefixLookupToken {
    this.inFlight.set(key, (this.inFlight.get(key) ?? 0) + 1);
    return {
      key,
      globalEpoch: this.globalEpoch,
      keyEpoch: this.keyEpochs.get(key) ?? 0,
    };
  }

  setIfCurrent(token: PrefixLookupToken, value: string[]): boolean {
    if (this.closed) return false;
    if (token.globalEpoch !== this.globalEpoch) return false;
    if ((this.keyEpochs.get(token.key) ?? 0) !== token.keyEpoch) return false;
    const now = this.now();
    if (this.entries.has(token.key)) {
      this.entries.delete(token.key);
    } else if (this.entries.size >= this.max) {
      for (const [candidateKey, candidate] of this.entries) {
        if (now >= candidate.expiresAt) this.entries.delete(candidateKey);
        if (this.entries.size < this.max) break;
      }
      while (this.entries.size >= this.max) {
        const oldest = this.entries.keys().next().value;
        if (oldest === undefined) break;
        this.entries.delete(oldest);
      }
    }
    this.entries.set(token.key, { value, expiresAt: now + this.ttlMs });
    return true;
  }

  releaseToken(token: PrefixLookupToken): void {
    if (this.closed || token.globalEpoch !== this.globalEpoch) return;
    const next = (this.inFlight.get(token.key) ?? 0) - 1;
    if (next <= 0) {
      this.inFlight.delete(token.key);
      this.keyEpochs.delete(token.key);
    } else {
      this.inFlight.set(token.key, next);
    }
  }

  invalidate(guildID?: string): void {
    if (guildID === undefined) {
      this.globalEpoch++;
      this.entries.clear();
      this.inFlight.clear();
      this.keyEpochs.clear();
      return;
    }
    const key = `g:${guildID}`;
    this.entries.delete(key);
    if ((this.inFlight.get(key) ?? 0) > 0) {
      this.keyEpochs.set(key, (this.keyEpochs.get(key) ?? 0) + 1);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.globalEpoch++;
    this.entries.clear();
    this.inFlight.clear();
    this.keyEpochs.clear();
  }
}
