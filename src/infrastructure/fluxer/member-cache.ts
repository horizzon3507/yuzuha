import type { ModerationMember } from '../../domain/moderation.js';
import { YuzuhaError } from '../../shared/errors.js';

export interface MemberCacheOptions {
  ttlMs: number;
  max?: number;
  now?: () => number;
}

const MAX_TTL_MS = 3_600_000;
const DEFAULT_MAX_ENTRIES = 10_000;
const MAX_ENTRIES_LIMIT = 1_000_000;

interface CacheEntry {
  value: ModerationMember;
  expiresAt: number;
}

function cacheKey(guildID: string, userID: string, channelID?: string): string {
  return `${guildID}\0${userID}\0${channelID ?? ''}`;
}

/** Bounded LRU+TTL cache of resolved ModerationMember snapshots for FluxerTransport. */
export class MemberCache {
  private readonly ttlMs: number;
  private readonly max: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, CacheEntry>();

  constructor(options: MemberCacheOptions) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new YuzuhaError('MEMBER_CACHE_OPTIONS', 'Opções do cache de membros inválidas.');
    }
    if (!Number.isInteger(options.ttlMs) || options.ttlMs < 1 || options.ttlMs > MAX_TTL_MS) {
      throw new YuzuhaError('MEMBER_CACHE_OPTIONS', `ttlMs do cache de membros deve ser um inteiro entre 1 e ${MAX_TTL_MS}.`);
    }
    const max = options.max ?? DEFAULT_MAX_ENTRIES;
    if (!Number.isInteger(max) || max < 1 || max > MAX_ENTRIES_LIMIT) {
      throw new YuzuhaError('MEMBER_CACHE_OPTIONS', `max do cache de membros deve ser um inteiro entre 1 e ${MAX_ENTRIES_LIMIT}.`);
    }
    if (options.now !== undefined && typeof options.now !== 'function') {
      throw new YuzuhaError('MEMBER_CACHE_OPTIONS', 'now do cache de membros deve ser uma função.');
    }
    this.ttlMs = options.ttlMs;
    this.max = max;
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.entries.size;
  }

  get(guildID: string, userID: string, channelID?: string): ModerationMember | undefined {
    const key = cacheKey(guildID, userID, channelID);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return structuredClone(entry.value);
  }

  set(guildID: string, userID: string, member: ModerationMember, channelID?: string): void {
    const key = cacheKey(guildID, userID, channelID);
    const now = this.now();
    if (this.entries.has(key)) {
      this.entries.delete(key);
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
    this.entries.set(key, { value: structuredClone(member), expiresAt: now + this.ttlMs });
  }

  invalidateMember(guildID: string, userID: string): void {
    for (const key of this.entries.keys()) {
      const [entryGuild, entryUser] = key.split('\0');
      if (entryGuild === guildID && entryUser === userID) this.entries.delete(key);
    }
  }

  invalidateGuild(guildID: string): void {
    for (const key of this.entries.keys()) {
      const [entryGuild] = key.split('\0');
      if (entryGuild === guildID) this.entries.delete(key);
    }
  }

  invalidateChannel(channelID: string): void {
    if (!channelID) return;
    for (const key of this.entries.keys()) {
      const [, , entryChannel] = key.split('\0');
      if (entryChannel === channelID) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
