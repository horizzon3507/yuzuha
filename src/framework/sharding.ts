import type { Client, ClientOptions } from '@fluxerjs/core';
import { ConfigError, YuzuhaError } from '../shared/errors.js';
import type {
  BotShard,
  ShardBroadcastOptions,
  ShardInfo,
  ShardRespawnOptions,
  ShardSchedulerMode,
} from '../ports/sharding.js';

export type {
  BotShard,
  ShardBroadcastOptions,
  ShardInfo,
  ShardRespawnOptions,
  ShardSchedulerMode,
};

export const MAX_SHARD_COUNT = 16_384;

export interface ShardClientUtilLike {
  readonly id?: number;
  readonly ids: readonly number[];
  readonly count: number;
  broadcastEval<T>(
    fn: (client: any, context?: unknown) => T | Promise<T>,
    options?: ShardBroadcastOptions,
  ): Promise<T[]>;
  fetchClientValues(prop: string): Promise<unknown[]>;
  respawn(options?: ShardRespawnOptions): Promise<void>;
  notifyReady?(): void;
}

export interface ShardingOptions {
  leaderShardID?: number;
  schedulerMode?: ShardSchedulerMode;
  ids?: readonly number[];
  count?: number;
  shardUtil?: ShardClientUtilLike;
  env?: NodeJS.ProcessEnv;
}

export interface OptionalShardingModule {
  attachShardClientUtil(client: unknown): ShardClientUtilLike;
  ShardingManager: new (file: string, options: Record<string, unknown>) => {
    readonly shardCount: number;
    readonly shards: Map<number, unknown>;
    spawn(amount?: number | 'auto'): Promise<Map<number, unknown>>;
    destroy(): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): unknown;
    off(event: string, listener: (...args: any[]) => void): unknown;
  };
}

const notifiedShardUtils = new WeakSet<object>();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertShardCount(count: unknown, label: string): number {
  if (!Number.isSafeInteger(count) || (count as number) < 1 || (count as number) > MAX_SHARD_COUNT) {
    throw new ConfigError('SHARDING_OPTIONS', `${label} deve ser inteiro entre 1 e ${MAX_SHARD_COUNT}.`);
  }
  return count as number;
}

function assertShardIds(ids: unknown, maxExclusive: number | undefined, label: string): readonly number[] {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ConfigError('SHARDING_OPTIONS', `${label} deve ser uma lista não vazia de inteiros.`);
  }
  const seen = new Set<number>();
  const normalized: number[] = [];
  const limit = maxExclusive ?? MAX_SHARD_COUNT;
  for (const raw of ids) {
    if (!Number.isSafeInteger(raw) || (raw as number) < 0 || (raw as number) >= limit) {
      throw new ConfigError('SHARDING_OPTIONS', `${label} deve conter inteiros válidos dentro do intervalo de shards.`);
    }
    const id = raw as number;
    if (seen.has(id)) {
      throw new ConfigError('SHARDING_OPTIONS', `${label} não pode conter IDs de shard duplicados.`);
    }
    seen.add(id);
    normalized.push(id);
  }
  return Object.freeze(normalized);
}

function assertShardUtil(util: unknown): ShardClientUtilLike {
  if (!util || typeof util !== 'object' || Array.isArray(util)) {
    throw new ConfigError('SHARDING_OPTIONS', 'shardUtil deve ser uma instância compatível com ShardClientUtil.');
  }
  const candidate = util as Partial<Record<keyof ShardClientUtilLike, unknown>>;
  assertShardCount(candidate.count, 'shardUtil.count');
  assertShardIds(candidate.ids, candidate.count as number, 'shardUtil.ids');
  if (candidate.id !== undefined && (!Number.isSafeInteger(candidate.id) || (candidate.id as number) < 0)) {
    throw new ConfigError('SHARDING_OPTIONS', 'shardUtil.id deve ser um inteiro não negativo.');
  }
  for (const method of ['broadcastEval', 'fetchClientValues', 'respawn'] as const) {
    if (typeof candidate[method] !== 'function') {
      throw new ConfigError('SHARDING_OPTIONS', `shardUtil.${method} deve ser uma função.`);
    }
  }
  if (candidate.notifyReady !== undefined && typeof candidate.notifyReady !== 'function') {
    throw new ConfigError('SHARDING_OPTIONS', 'shardUtil.notifyReady deve ser uma função quando informado.');
  }
  return util as ShardClientUtilLike;
}

export function validateShardingOptions(input: boolean | ShardingOptions | undefined): ShardingOptions | false | undefined {
  if (input === undefined || input === false) return input;
  if (input === true) return {};
  if (!isPlainObject(input)) {
    throw new ConfigError('SHARDING_OPTIONS', 'sharding deve ser booleano ou um objeto de opções.');
  }
  if (input.leaderShardID !== undefined) {
    if (typeof input.leaderShardID !== 'number' || !Number.isSafeInteger(input.leaderShardID) || input.leaderShardID < 0 || input.leaderShardID >= MAX_SHARD_COUNT) {
      throw new ConfigError('SHARDING_OPTIONS', `leaderShardID deve ser inteiro entre 0 e ${MAX_SHARD_COUNT - 1}.`);
    }
  }
  if (input.schedulerMode !== undefined && input.schedulerMode !== 'leader' && input.schedulerMode !== 'all' && input.schedulerMode !== 'disabled') {
    throw new ConfigError('SHARDING_OPTIONS', "schedulerMode deve ser 'leader', 'all' ou 'disabled'.");
  }
  const count = input.count !== undefined ? assertShardCount(input.count, 'sharding.count') : undefined;
  if (input.ids !== undefined) {
    assertShardIds(input.ids, count, 'sharding.ids');
  }
  if (input.shardUtil !== undefined) {
    assertShardUtil(input.shardUtil);
  }
  if (input.env !== undefined && (!input.env || typeof input.env !== 'object' || Array.isArray(input.env))) {
    throw new ConfigError('SHARDING_OPTIONS', 'sharding.env deve ser um objeto de ambiente.');
  }
  return input;
}

export function hasShardingProcessEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.FLUXER_SHARD_IDS?.trim()
    || env.FLUXER_SHARD_COUNT?.trim()
    || env.FLUXER_SHARD_PROCESS_ID?.trim(),
  );
}

export function isShardingChildProcess(
  env: NodeJS.ProcessEnv = process.env,
  hasIpc: boolean = typeof process.send === 'function',
): boolean {
  return hasIpc && hasShardingProcessEnv(env);
}

function parseEnvShardState(env: NodeJS.ProcessEnv): { id: number; ids: readonly number[]; count: number } {
  const rawCount = env.FLUXER_SHARD_COUNT?.trim();
  const parsedCount = rawCount === undefined || rawCount === ''
    ? undefined
    : (/^\d+$/.test(rawCount) ? Number(rawCount) : NaN);
  const count = parsedCount !== undefined ? assertShardCount(parsedCount, 'FLUXER_SHARD_COUNT') : undefined;

  const rawIds = env.FLUXER_SHARD_IDS?.trim();
  let ids: readonly number[];
  if (rawIds === undefined || rawIds === '') {
    ids = Object.freeze([0]);
  } else {
    const parts = rawIds.split(',').map(part => part.trim());
    if (parts.some(part => !/^\d+$/.test(part))) {
      throw new ConfigError('SHARDING_OPTIONS', 'FLUXER_SHARD_IDS deve conter inteiros separados por vírgula.');
    }
    const numeric = parts.map(part => Number(part));
    const effectiveMax = count ?? Math.max(...numeric) + 1;
    ids = assertShardIds(numeric, effectiveMax, 'FLUXER_SHARD_IDS');
  }

  const finalCount = count ?? Math.max(1, ...ids.map(item => item + 1));
  if (ids.some(item => item >= finalCount)) {
    throw new ConfigError('SHARDING_OPTIONS', 'FLUXER_SHARD_IDS contém shard fora de FLUXER_SHARD_COUNT.');
  }

  const rawProcessId = env.FLUXER_SHARD_PROCESS_ID?.trim();
  let id = ids[0] ?? 0;
  if (rawProcessId !== undefined && rawProcessId !== '') {
    if (!/^\d+$/.test(rawProcessId)) {
      throw new ConfigError('SHARDING_OPTIONS', 'FLUXER_SHARD_PROCESS_ID deve ser um inteiro não negativo.');
    }
    const parsedId = Number(rawProcessId);
    if (!Number.isSafeInteger(parsedId) || parsedId < 0 || parsedId >= MAX_SHARD_COUNT) {
      throw new ConfigError('SHARDING_OPTIONS', 'FLUXER_SHARD_PROCESS_ID fora do intervalo permitido.');
    }
    id = parsedId;
  }
  return { id, ids, count: finalCount };
}

type LooseClientShardOptions = ClientOptions & {
  shards?: number | readonly number[];
};

function hasClientShardOptions(options: LooseClientShardOptions | undefined): boolean {
  if (!options || typeof options !== 'object') return false;
  return options.shardCount !== undefined
    || options.totalShards !== undefined
    || options.shardIds !== undefined
    || options.shardList !== undefined
    || options.shards !== undefined;
}

function parseClientShardState(options: LooseClientShardOptions): { ids: readonly number[]; count: number; dynamicAuto: boolean } {
  const rawCount = options.shardCount ?? options.totalShards;
  const rawIds = options.shardIds
    ?? options.shardList
    ?? (Array.isArray(options.shards) ? options.shards : typeof options.shards === 'number' ? [options.shards] : undefined);

  if (rawCount === 'auto') {
    const ids = rawIds !== undefined ? assertShardIds(rawIds, undefined, 'clientOptions.shardIds') : Object.freeze([0]);
    const fallbackCount = Math.max(1, ...ids.map(item => item + 1));
    return { ids, count: fallbackCount, dynamicAuto: rawIds === undefined };
  }

  const count = rawCount !== undefined ? assertShardCount(rawCount, 'clientOptions.shardCount') : undefined;
  if (rawIds !== undefined) {
    const inferredCount = count ?? Math.max(1, ...(Array.isArray(rawIds) ? rawIds.map(n => (typeof n === 'number' ? n + 1 : 1)) : [1]));
    const validatedCount = assertShardCount(inferredCount, 'clientOptions.shardCount');
    const ids = assertShardIds(rawIds, validatedCount, 'clientOptions.shardIds');
    return { ids, count: validatedCount, dynamicAuto: false };
  }

  const finalCount = count ?? 1;
  const allIds = Object.freeze(Array.from({ length: finalCount }, (_, index) => index));
  return { ids: allIds, count: finalCount, dynamicAuto: false };
}

export function getAttachedShardClientUtil(client: Client): ShardClientUtilLike | undefined {
  const candidate = (client as unknown as { shard?: unknown }).shard;
  if (!candidate || typeof candidate !== 'object') return undefined;
  return assertShardUtil(candidate);
}

/** Calcula o shard proprietário de um servidor pela fórmula do gateway Fluxer: `(BigInt(guildID) >> 22n) % BigInt(count)`. */
export function shardIdForGuild(guildID: string, count: number): number {
  if (typeof guildID !== 'string' || !/^\d+$/.test(guildID)) {
    throw new YuzuhaError('SHARDING_OPTIONS', 'guildID deve ser um snowflake numérico.');
  }
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_SHARD_COUNT) {
    throw new YuzuhaError('SHARDING_OPTIONS', `count deve ser inteiro entre 1 e ${MAX_SHARD_COUNT}.`);
  }
  return Number((BigInt(guildID) >> 22n) % BigInt(count));
}

function readClientProperty(client: Client, prop: string): unknown {
  if (typeof prop !== 'string' || !prop.trim()) {
    throw new YuzuhaError('SHARDING_OPTIONS', 'prop deve ser um caminho de propriedade não vazio.');
  }
  return prop.split('.').reduce<unknown>((current, segment) => {
    if (!segment) throw new YuzuhaError('SHARDING_OPTIONS', 'prop contém segmento vazio.');
    if (current === null || current === undefined) return undefined;
    return (current as Record<string, unknown>)[segment];
  }, client);
}

function readLiveWsShardState(client: Client): { ids: readonly number[]; count: number } | undefined {
  try {
    const ws = client.ws;
    const count = ws.getShardCount();
    if (!Number.isSafeInteger(count) || count < 1) return undefined;
    const map = ws.getShards?.();
    const keys = map && map.size > 0
      ? [...map.keys()].sort((a, b) => a - b)
      : Array.from({ length: count }, (_, index) => index);
    return { ids: Object.freeze(keys), count };
  } catch {
    return undefined;
  }
}

class RuntimeBotShard implements BotShard {
  private readonly leaderShardID: number;
  private readonly staticIds: readonly number[];
  private readonly staticCount: number;
  private readonly staticId?: number;
  private readonly dynamicAuto: boolean;
  private readonly explicitShardUtil?: ShardClientUtilLike;

  constructor(
    private readonly client: Client,
    config: {
      leaderShardID: number;
      ids: readonly number[];
      count: number;
      id?: number;
      dynamicAuto?: boolean;
      shardUtil?: ShardClientUtilLike;
    },
  ) {
    this.leaderShardID = config.leaderShardID;
    this.staticIds = config.ids;
    this.staticCount = config.count;
    this.staticId = config.id;
    this.dynamicAuto = config.dynamicAuto ?? false;
    this.explicitShardUtil = config.shardUtil;
  }

  private get util(): ShardClientUtilLike | undefined {
    return this.explicitShardUtil ?? getAttachedShardClientUtil(this.client);
  }

  get ids(): readonly number[] {
    const util = this.util;
    if (util) return Object.freeze([...util.ids]);
    if (this.dynamicAuto) {
      const live = readLiveWsShardState(this.client);
      if (live) return live.ids;
    }
    return this.staticIds;
  }

  get count(): number {
    const util = this.util;
    if (util) return util.count;
    if (this.dynamicAuto) {
      const live = readLiveWsShardState(this.client);
      if (live) return live.count;
    }
    return this.staticCount;
  }

  get id(): number {
    const util = this.util;
    if (util) return typeof util.id === 'number' ? util.id : (util.ids[0] ?? 0);
    if (this.staticId !== undefined) return this.staticId;
    return this.ids[0] ?? 0;
  }

  get isLeader(): boolean {
    return this.ids.includes(this.leaderShardID);
  }

  shardIdForGuild(guildID: string): number {
    return shardIdForGuild(guildID, this.count);
  }

  async broadcastEval<T>(
    fn: (client: Client, context?: unknown) => T | Promise<T>,
    options?: ShardBroadcastOptions,
  ): Promise<T[]> {
    if (typeof fn !== 'function') {
      throw new YuzuhaError('SHARDING_OPTIONS', 'broadcastEval exige uma função.');
    }
    if (options !== undefined && !isPlainObject(options)) {
      throw new YuzuhaError('SHARDING_OPTIONS', 'Opções de broadcastEval inválidas.');
    }
    const util = this.util;
    if (util) return util.broadcastEval(fn, options);
    return [await fn(this.client, options?.context)];
  }

  async fetchClientValues(prop: string): Promise<unknown[]> {
    if (typeof prop !== 'string' || !prop.trim() || prop.split('.').some(part => !part)) {
      throw new YuzuhaError('SHARDING_OPTIONS', 'prop deve ser um caminho de propriedade não vazio.');
    }
    const util = this.util;
    if (util) return util.fetchClientValues(prop);
    return [readClientProperty(this.client, prop)];
  }

  async respawn(options?: ShardRespawnOptions): Promise<void> {
    if (options !== undefined) {
      if (!isPlainObject(options)) {
        throw new YuzuhaError('SHARDING_OPTIONS', 'Opções de respawn inválidas.');
      }
      if (options.delay !== undefined && (typeof options.delay !== 'number' || !Number.isSafeInteger(options.delay) || options.delay < 0)) {
        throw new YuzuhaError('SHARDING_OPTIONS', 'delay deve ser um inteiro não negativo.');
      }
    }
    const util = this.util;
    if (!util) {
      throw new YuzuhaError('SHARDING_UNAVAILABLE', 'respawn exige execução sob um ShardingManager.');
    }
    await util.respawn(options);
  }
}

export function resolveBotShard(
  client: Client,
  shardingInput: boolean | ShardingOptions | undefined,
  clientOptions?: ClientOptions,
): BotShard | undefined {
  const validated = validateShardingOptions(shardingInput);
  if (validated === false) return undefined;

  const env = validated?.env ?? process.env;
  const leaderShardID = validated?.leaderShardID ?? 0;
  const attached = validated?.shardUtil ?? getAttachedShardClientUtil(client);

  if (attached) {
    return new RuntimeBotShard(client, {
      leaderShardID,
      ids: Object.freeze([...attached.ids]),
      count: attached.count,
      id: attached.id,
      shardUtil: validated?.shardUtil,
    });
  }

  if (validated?.ids !== undefined || validated?.count !== undefined) {
    const count = validated.count ?? Math.max(1, ...(validated.ids ?? [0]).map(id => id + 1));
    const ids = validated.ids
      ? assertShardIds(validated.ids, count, 'sharding.ids')
      : Object.freeze(Array.from({ length: count }, (_, index) => index));
    return new RuntimeBotShard(client, { leaderShardID, ids, count });
  }

  if (hasShardingProcessEnv(env)) {
    const parsed = parseEnvShardState(env);
    return new RuntimeBotShard(client, {
      leaderShardID,
      ids: parsed.ids,
      count: parsed.count,
      id: parsed.id,
    });
  }

  const effectiveClientOptions = (clientOptions ?? (client as unknown as { options?: LooseClientShardOptions }).options) as LooseClientShardOptions | undefined;
  if (hasClientShardOptions(effectiveClientOptions)) {
    const parsed = parseClientShardState(effectiveClientOptions!);
    return new RuntimeBotShard(client, {
      leaderShardID,
      ids: parsed.ids,
      count: parsed.count,
      dynamicAuto: parsed.dynamicAuto,
    });
  }

  if (validated !== undefined) {
    return new RuntimeBotShard(client, {
      leaderShardID,
      ids: Object.freeze([0]),
      count: 1,
      id: 0,
    });
  }

  return undefined;
}

export function resolveShardSchedulerMode(
  shardingInput: boolean | ShardingOptions | undefined,
  hasDistributedLock: boolean,
): ShardSchedulerMode {
  if (shardingInput && typeof shardingInput === 'object' && shardingInput.schedulerMode !== undefined) {
    return shardingInput.schedulerMode;
  }
  return hasDistributedLock ? 'all' : 'leader';
}

export function shouldStartShardedJobs(
  shard: BotShard | undefined,
  schedulerMode: ShardSchedulerMode,
): boolean {
  if (schedulerMode === 'disabled') return false;
  if (!shard || shard.count <= 1) return true;
  if (schedulerMode === 'all') return true;
  return shard.isLeader;
}

export async function loadOptionalSharding(
  importer?: () => Promise<OptionalShardingModule>,
): Promise<OptionalShardingModule> {
  try {
    if (importer) return await importer();
    const packageName: string = '@fluxerjs/sharding';
    return await import(packageName) as OptionalShardingModule;
  } catch (cause) {
    throw new ConfigError(
      'SHARDING_UNAVAILABLE',
      'Instale o peer opcional @fluxerjs/sharding para usar supervisão de shards por processo.',
      { cause },
    );
  }
}

export async function attachClientShardIfNeeded(
  client: Client,
  options?: {
    shardUtil?: ShardClientUtilLike;
    env?: NodeJS.ProcessEnv;
    importer?: () => Promise<OptionalShardingModule>;
  },
): Promise<ShardClientUtilLike | undefined> {
  if (options?.shardUtil) return options.shardUtil;
  const existing = getAttachedShardClientUtil(client);
  if (existing) return existing;
  if (!isShardingChildProcess(options?.env ?? process.env)) return undefined;
  const sharding = await loadOptionalSharding(options?.importer);
  return sharding.attachShardClientUtil(client);
}

export function notifyClientShardReady(
  client: Client,
  explicitUtil?: ShardClientUtilLike,
): void {
  const util = explicitUtil ?? getAttachedShardClientUtil(client);
  if (!util || typeof util.notifyReady !== 'function') return;
  if (notifiedShardUtils.has(util)) return;
  notifiedShardUtils.add(util);
  util.notifyReady();
}
