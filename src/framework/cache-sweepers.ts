import { randomUUID } from 'node:crypto';
import { ConfigError } from '../errors.js';
import type { CacheResources, MemberSweepInput, MessageSweepInput, UserSweepInput } from '../ports/resources/cache.js';

export interface MessageCacheSweeperOptions extends MessageSweepInput {
  intervalMs: number;
}

export interface MemberCacheSweeperOptions extends MemberSweepInput {
  intervalMs: number;
}

export interface UserCacheSweeperOptions extends UserSweepInput {
  intervalMs: number;
}

export interface CacheSweeperOptions {
  messages?: false | MessageCacheSweeperOptions;
  members?: false | MemberCacheSweeperOptions;
  users?: false | UserCacheSweeperOptions;
}

const MIN_CACHE_SWEEP_INTERVAL_MS = 100;
const MAX_CACHE_SWEEP_INTERVAL_MS = 86_400_000;
const ALLOWED_BUCKETS = new Set(['messages', 'members', 'users']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertInterval(value: unknown, bucket: string): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < MIN_CACHE_SWEEP_INTERVAL_MS
    || value > MAX_CACHE_SWEEP_INTERVAL_MS
  ) {
    throw new ConfigError(
      'CACHE_SWEEPER_OPTIONS',
      `cacheSweepers.${bucket}.intervalMs deve ser inteiro entre ${MIN_CACHE_SWEEP_INTERVAL_MS} e ${MAX_CACHE_SWEEP_INTERVAL_MS}.`,
    );
  }
  return value;
}

function assertOptionalKeep(value: unknown, bucket: string): void {
  if (value !== undefined && typeof value !== 'function') {
    throw new ConfigError('CACHE_SWEEPER_OPTIONS', `cacheSweepers.${bucket}.keep deve ser uma função.`);
  }
}

function assertOptionalSnowflakeOrId(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new ConfigError('CACHE_SWEEPER_OPTIONS', `${field} deve ser um texto não vazio.`);
  }
  return value;
}

export interface ValidatedCacheSweepers {
  messages?: MessageCacheSweeperOptions;
  members?: MemberCacheSweeperOptions;
  users?: UserCacheSweeperOptions;
}

export function validateCacheSweeperOptions(input: false | CacheSweeperOptions | undefined): ValidatedCacheSweepers | undefined {
  if (input === undefined || input === false) return undefined;
  if (!isPlainObject(input)) {
    throw new ConfigError('CACHE_SWEEPER_OPTIONS', 'cacheSweepers deve ser false ou um objeto de configuração.');
  }
  for (const key of Object.keys(input)) {
    if (!ALLOWED_BUCKETS.has(key)) {
      throw new ConfigError('CACHE_SWEEPER_OPTIONS', `Bucket desconhecido em cacheSweepers: ${key}.`);
    }
  }

  const resolved: ValidatedCacheSweepers = {};

  if (input.messages !== undefined && input.messages !== false) {
    if (!isPlainObject(input.messages)) {
      throw new ConfigError('CACHE_SWEEPER_OPTIONS', 'cacheSweepers.messages deve ser false ou um objeto.');
    }
    const intervalMs = assertInterval(input.messages.intervalMs, 'messages');
    assertOptionalKeep(input.messages.keep, 'messages');
    const channelID = assertOptionalSnowflakeOrId(input.messages.channelID, 'cacheSweepers.messages.channelID');
    const maxAgeMs = input.messages.maxAgeMs;
    if (maxAgeMs !== undefined && (typeof maxAgeMs !== 'number' || !Number.isSafeInteger(maxAgeMs) || maxAgeMs < 0)) {
      throw new ConfigError('CACHE_SWEEPER_OPTIONS', 'cacheSweepers.messages.maxAgeMs deve ser um inteiro não negativo.');
    }
    resolved.messages = {
      intervalMs,
      ...(channelID !== undefined ? { channelID } : {}),
      ...(maxAgeMs !== undefined ? { maxAgeMs } : {}),
      ...(input.messages.keep !== undefined ? { keep: input.messages.keep as MessageSweepInput['keep'] } : {}),
    };
  }

  if (input.members !== undefined && input.members !== false) {
    if (!isPlainObject(input.members)) {
      throw new ConfigError('CACHE_SWEEPER_OPTIONS', 'cacheSweepers.members deve ser false ou um objeto.');
    }
    const intervalMs = assertInterval(input.members.intervalMs, 'members');
    assertOptionalKeep(input.members.keep, 'members');
    const guildID = assertOptionalSnowflakeOrId(input.members.guildID, 'cacheSweepers.members.guildID');
    resolved.members = {
      intervalMs,
      ...(guildID !== undefined ? { guildID } : {}),
      ...(input.members.keep !== undefined ? { keep: input.members.keep as MemberSweepInput['keep'] } : {}),
    };
  }

  if (input.users !== undefined && input.users !== false) {
    if (!isPlainObject(input.users)) {
      throw new ConfigError('CACHE_SWEEPER_OPTIONS', 'cacheSweepers.users deve ser false ou um objeto.');
    }
    const intervalMs = assertInterval(input.users.intervalMs, 'users');
    assertOptionalKeep(input.users.keep, 'users');
    resolved.users = {
      intervalMs,
      ...(input.users.keep !== undefined ? { keep: input.users.keep as UserSweepInput['keep'] } : {}),
    };
  }

  return resolved.messages || resolved.members || resolved.users ? resolved : undefined;
}

interface BucketRunner {
  intervalMs: number;
  run: () => Promise<number>;
  timer?: unknown;
  hasTimer: boolean;
  task?: Promise<void>;
}

export class CacheSweepersController {
  private readonly runners: BucketRunner[] = [];
  private active = false;
  private generation = 0;

  constructor(
    config: ValidatedCacheSweepers,
    private readonly params: {
      getCache: () => CacheResources;
      timers: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void };
      isClosing: () => boolean;
      runScoped: (executionID: string, fn: () => Promise<void>) => Promise<void>;
      onError: (error: unknown) => Promise<void>;
    },
  ) {
    if (config.messages) {
      const { intervalMs, ...sweepInput } = config.messages;
      this.runners.push({
        intervalMs,
        hasTimer: false,
        run: () => params.getCache().sweepMessages(sweepInput),
      });
    }
    if (config.members) {
      const { intervalMs, ...sweepInput } = config.members;
      this.runners.push({
        intervalMs,
        hasTimer: false,
        run: () => params.getCache().sweepMembers(sweepInput),
      });
    }
    if (config.users) {
      const { intervalMs, ...sweepInput } = config.users;
      this.runners.push({
        intervalMs,
        hasTimer: false,
        run: () => params.getCache().sweepUsers(sweepInput),
      });
    }
  }

  start(): () => void {
    if (this.params.isClosing() || this.runners.length === 0) return () => {};
    if (!this.active) {
      this.active = true;
      const gen = this.generation;
      for (const runner of this.runners) {
        this.scheduleRunner(runner, gen);
      }
    }
    let disposed = false;
    const stopGen = this.generation;
    return () => {
      if (disposed) return;
      disposed = true;
      if (this.generation === stopGen) this.stop();
    };
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.generation++;
    for (const runner of this.runners) {
      if (runner.hasTimer) {
        this.params.timers.clearTimeout(runner.timer);
        runner.timer = undefined;
        runner.hasTimer = false;
      }
    }
  }

  async drain(): Promise<void> {
    this.stop();
    const tasks = this.runners.map(runner => runner.task).filter((item): item is Promise<void> => item !== undefined);
    if (tasks.length > 0) await Promise.allSettled(tasks);
  }

  private scheduleRunner(runner: BucketRunner, gen: number): void {
    if (!this.active || this.params.isClosing() || gen !== this.generation || runner.hasTimer || runner.task) return;
    let fired = false;
    const handle = this.params.timers.setTimeout(() => {
      fired = true;
      if (runner.timer === handle) {
        runner.timer = undefined;
        runner.hasTimer = false;
      }
      if (!this.active || this.params.isClosing() || gen !== this.generation) return;
      const work = this.params.runScoped(randomUUID(), async () => {
        try {
          await runner.run();
        } catch (error) {
          if (!this.params.isClosing()) await this.params.onError(error);
        }
      }).finally(() => {
        if (runner.task === work) runner.task = undefined;
        if (this.active && !this.params.isClosing() && gen === this.generation) {
          this.scheduleRunner(runner, gen);
        }
      });
      runner.task = work;
    }, runner.intervalMs);
    if (!fired && this.active && !this.params.isClosing() && gen === this.generation) {
      runner.timer = handle;
      runner.hasTimer = true;
    }
  }
}
