import { YuzuhaError } from '../errors.js';
import type { RateLimitOptions } from './options.js';

export type RateLimitsOptions = RateLimitOptions & {
  now?: () => number;
  onEvict?: () => void;
};

const DEFAULT_MAX_COOLDOWNS = 100_000;
const DEFAULT_ON_COOLDOWN_CAPACITY = 'evict' as const;
const DEFAULT_MAX_DEDUPE = 100_000;
const DEFAULT_DEDUPE_WINDOW_MS = 60_000;

function positiveInt(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new YuzuhaError('RATE_LIMIT_OPTIONS', `${field} deve ser um inteiro positivo.`);
  }
  return value as number;
}

export function resolveRateLimitOptions(input: unknown): Required<RateLimitOptions> {
  if (input === undefined) {
    return {
      maxCooldowns: DEFAULT_MAX_COOLDOWNS,
      onCooldownCapacity: DEFAULT_ON_COOLDOWN_CAPACITY,
      maxDedupe: DEFAULT_MAX_DEDUPE,
      dedupeWindowMs: DEFAULT_DEDUPE_WINDOW_MS,
    };
  }
  const prototype = input === null || typeof input !== 'object' || Array.isArray(input) ? undefined : Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new YuzuhaError('RATE_LIMIT_OPTIONS', 'Opções de rateLimits inválidas.');
  }
  const raw = input as RateLimitOptions;
  const maxCooldowns = raw.maxCooldowns === undefined ? DEFAULT_MAX_COOLDOWNS : positiveInt(raw.maxCooldowns, 'maxCooldowns');
  const onCooldownCapacity = raw.onCooldownCapacity === undefined ? DEFAULT_ON_COOLDOWN_CAPACITY : raw.onCooldownCapacity;
  if (onCooldownCapacity !== 'evict' && onCooldownCapacity !== 'throw') {
    throw new YuzuhaError('RATE_LIMIT_OPTIONS', "onCooldownCapacity deve ser 'evict' ou 'throw'.");
  }
  const maxDedupe = raw.maxDedupe === undefined ? DEFAULT_MAX_DEDUPE : positiveInt(raw.maxDedupe, 'maxDedupe');
  const dedupeWindowMs = raw.dedupeWindowMs === undefined ? DEFAULT_DEDUPE_WINDOW_MS : positiveInt(raw.dedupeWindowMs, 'dedupeWindowMs');
  return { maxCooldowns, onCooldownCapacity, maxDedupe, dedupeWindowMs };
}

export class RateLimits {
  private readonly now: () => number;
  private readonly onEvict?: () => void;
  private readonly maxCooldowns: number;
  private readonly onCooldownCapacity: 'evict' | 'throw';
  private readonly maxDedupe: number;
  private readonly dedupeWindowMs: number;
  private currentBucket = new Map<string, number>();
  private previousBucket = new Map<string, number>();
  private nextBucketRotation?: number;
  private readonly cooldowns = new Map<string, number>();
  private nextSweep = 0;
  private nextExpiration = Infinity;

  constructor(nowOrOptions?: (() => number) | RateLimitsOptions) {
    if (typeof nowOrOptions === 'function' || nowOrOptions === undefined) {
      this.now = nowOrOptions ?? Date.now;
      const resolved = resolveRateLimitOptions(undefined);
      this.maxCooldowns = resolved.maxCooldowns;
      this.onCooldownCapacity = resolved.onCooldownCapacity;
      this.maxDedupe = resolved.maxDedupe;
      this.dedupeWindowMs = resolved.dedupeWindowMs;
      return;
    }
    const resolved = resolveRateLimitOptions(nowOrOptions);
    if (nowOrOptions.now !== undefined && typeof nowOrOptions.now !== 'function') {
      throw new YuzuhaError('RATE_LIMIT_OPTIONS', 'now deve ser uma função.');
    }
    if (nowOrOptions.onEvict !== undefined && typeof nowOrOptions.onEvict !== 'function') {
      throw new YuzuhaError('RATE_LIMIT_OPTIONS', 'onEvict deve ser uma função.');
    }
    this.now = nowOrOptions.now ?? Date.now;
    this.onEvict = nowOrOptions.onEvict;
    this.maxCooldowns = resolved.maxCooldowns;
    this.onCooldownCapacity = resolved.onCooldownCapacity;
    this.maxDedupe = resolved.maxDedupe;
    this.dedupeWindowMs = resolved.dedupeWindowMs;
  }

  private sweep(time: number, force = false): void {
    if (time < this.nextExpiration || (!force && time < this.nextSweep)) return;
    this.nextExpiration = Infinity;
    for (const [key, until] of this.cooldowns) {
      if (until <= time) this.cooldowns.delete(key);
      else this.nextExpiration = Math.min(this.nextExpiration, until);
    }
    this.nextSweep = time + 1000;
  }

  private evictSoonestCooldown(): void {
    let victimKey: string | undefined;
    let victimUntil = Infinity;
    let next = Infinity;
    for (const [entryKey, entryUntil] of this.cooldowns) {
      if (victimKey === undefined || entryUntil < victimUntil) {
        next = victimUntil;
        victimUntil = entryUntil;
        victimKey = entryKey;
      } else if (entryUntil < next) {
        next = entryUntil;
      }
    }
    if (victimKey !== undefined) {
      this.cooldowns.delete(victimKey);
      this.nextExpiration = next;
      this.onEvict?.();
    }
  }

  duplicate(channelID: string, messageID: string): boolean {
    const time = this.now();
    if (this.nextBucketRotation === undefined) {
      this.nextBucketRotation = time + this.dedupeWindowMs;
    } else if (time >= this.nextBucketRotation) {
      this.previousBucket = time >= this.nextBucketRotation + this.dedupeWindowMs ? new Map() : this.currentBucket;
      this.currentBucket = new Map();
      this.nextBucketRotation = time + this.dedupeWindowMs;
    }
    const key = `${channelID.length}:${channelID}${messageID}`;
    const existing = this.currentBucket.get(key) ?? this.previousBucket.get(key);
    if (existing !== undefined && existing > time) return true;
    if (!this.currentBucket.has(key)) {
      this.previousBucket.delete(key);
      while (this.currentBucket.size + this.previousBucket.size >= this.maxDedupe) {
        if (this.previousBucket.size > 0) {
          const oldest = this.previousBucket.keys().next().value;
          if (oldest !== undefined) this.previousBucket.delete(oldest);
        } else {
          const oldest = this.currentBucket.keys().next().value;
          if (oldest === undefined) break;
          this.currentBucket.delete(oldest);
        }
      }
    }
    this.currentBucket.set(key, time + this.dedupeWindowMs);
    return false;
  }

  cooldown(key: string, duration: number): number {
    const time = this.now();
    const remaining = (this.cooldowns.get(key) ?? 0) - time;
    if (remaining > 0) return remaining;
    this.sweep(time);
    if (this.cooldowns.size >= this.maxCooldowns && !this.cooldowns.has(key)) {
      this.sweep(time, true);
      if (this.cooldowns.size >= this.maxCooldowns) {
        if (this.onCooldownCapacity === 'throw') {
          throw new YuzuhaError('COOLDOWN_CAPACITY', 'Capacidade de cooldown excedida.');
        }
        this.evictSoonestCooldown();
      }
    }
    const until = time + duration;
    this.cooldowns.set(key, until);
    if (until < this.nextExpiration) this.nextExpiration = until;
    return 0;
  }
}
