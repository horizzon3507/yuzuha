import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { REST } from '@fluxerjs/rest';
import type { Yuzuha } from '../bot.js';
import { ConfigError } from '../errors.js';
import {
  MAX_SHARD_COUNT,
  getAttachedShardClientUtil,
  isShardingChildProcess,
  loadOptionalSharding,
  notifyClientShardReady,
} from '../framework/sharding.js';
import type { OptionalShardingModule, ShardClientUtilLike } from '../framework/sharding.js';
import { exists, findConfig, loadEnvironment } from './config.js';
import type { RunnerTarget } from './runner.js';

export { isShardingChildProcess, notifyClientShardReady };

const DEFAULT_GUILDS_PER_SHARD = 1_500;
const GUILD_PAGE_LIMIT = 200;

export interface RestGuildReader {
  get(route: string): Promise<unknown>;
}

export interface ShardingSupervisorManager {
  readonly shardCount: number;
  readonly shards: Map<number, unknown>;
  spawn(amount?: number | 'auto'): Promise<Map<number, unknown>>;
  destroy(): Promise<void>;
  on(event: string, listener: (...args: any[]) => void): unknown;
  off(event: string, listener: (...args: any[]) => void): unknown;
}

export interface ShardingSupervisorManagerOptions {
  token: string;
  totalShards: number | 'auto';
  shardsPerProcess?: number;
  shardArgs: string[];
  execArgv?: string[];
  fetchGuildCount?: () => Promise<number>;
}

export interface ShardedSupervisorOptions {
  input?: string;
  configPath?: string;
  shards: number | 'auto';
  shardsPerProcess?: number;
  entryFile?: string;
  env?: NodeJS.ProcessEnv;
  target?: Pick<NodeJS.Process, 'on' | 'once' | 'off'> | RunnerTarget;
  signal?: AbortSignal;
  waitForShutdown?: boolean;
  rest?: RestGuildReader;
  fetchGuildCount?: () => Promise<number>;
  importer?: () => Promise<OptionalShardingModule>;
  createManager?: (file: string, options: ShardingSupervisorManagerOptions) => ShardingSupervisorManager;
  onReady?: (manager: ShardingSupervisorManager) => void;
  onLog?: (message: string) => void;
  onErrorLog?: (message: string) => void;
}

export interface ChildShardingOptions {
  env?: NodeJS.ProcessEnv;
  hasIpc?: boolean;
  importer?: () => Promise<OptionalShardingModule>;
}

export function resolveCliEntrypoint(): string {
  const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
  return fileURLToPath(new URL(`../cli${extension}`, import.meta.url));
}

export async function fetchBotGuildCount(
  token: string,
  options?: { rest?: RestGuildReader; api?: string; version?: string },
): Promise<number> {
  const rest = options?.rest ?? new REST({
    ...(options?.api ? { api: options.api } : {}),
    ...(options?.version ? { version: options.version } : {}),
  }).setToken(token);

  let total = 0;
  let after: string | undefined;
  const maxTotal = MAX_SHARD_COUNT * DEFAULT_GUILDS_PER_SHARD;
  for (;;) {
    const query = after
      ? `?limit=${GUILD_PAGE_LIMIT}&after=${encodeURIComponent(after)}`
      : `?limit=${GUILD_PAGE_LIMIT}`;
    const page = await rest.get(`/users/@me/guilds${query}`);
    if (!Array.isArray(page) || page.length === 0) break;
    total += page.length;
    const last = page[page.length - 1] as { id?: unknown } | undefined;
    if (typeof last?.id !== 'string' || page.length < GUILD_PAGE_LIMIT || total > maxTotal) break;
    after = last.id;
  }
  return total;
}

async function loadSupervisorEnv(directory: string, env: NodeJS.ProcessEnv): Promise<void> {
  if (env === process.env) {
    await loadEnvironment(directory);
    return;
  }
  const envFile = join(directory, '.env');
  if (!(await exists(envFile))) return;
  for (const [key, value] of Object.entries(parseEnv(await readFile(envFile, 'utf8')))) {
    env[key] ??= value;
  }
}

export async function runShardedSupervisor(options: ShardedSupervisorOptions): Promise<void> {
  const configPath = options.configPath ? resolve(options.configPath) : await findConfig(options.input);
  const info = await stat(configPath);
  if (!info.isFile()) {
    throw new ConfigError('CONFIG_INVALID', 'Informe um arquivo de configuração válido para yuzuha run --shards.');
  }

  const env = options.env ?? process.env;
  await loadSupervisorEnv(dirname(configPath), env);
  const token = env.FLUXER_BOT_TOKEN?.trim();
  if (!token) {
    throw new ConfigError('TOKEN_MISSING', 'Defina FLUXER_BOT_TOKEN.');
  }

  const entryFile = options.entryFile ?? resolveCliEntrypoint();
  const managerOptions: ShardingSupervisorManagerOptions = {
    token,
    totalShards: options.shards,
    ...(options.shardsPerProcess !== undefined ? { shardsPerProcess: options.shardsPerProcess } : {}),
    shardArgs: ['run', configPath],
    ...(options.shards === 'auto'
      ? {
        fetchGuildCount: options.fetchGuildCount ?? (() => fetchBotGuildCount(token, { rest: options.rest })),
      }
      : {}),
  };

  const manager: ShardingSupervisorManager = options.createManager
    ? options.createManager(entryFile, managerOptions)
    : await (async () => {
      const sharding = await loadOptionalSharding(options.importer);
      return new sharding.ShardingManager(entryFile, managerOptions as unknown as Record<string, unknown>);
    })();

  const target = (options.target ?? process) as RunnerTarget;
  const logInfo = options.onLog ?? ((msg: string) => console.log(msg));
  const logError = options.onErrorLog ?? ((msg: string) => console.error(msg));

  let closeTask: Promise<void> | undefined;
  let resolveStopped!: () => void;
  const stopped = new Promise<void>(resolvePromise => { resolveStopped = resolvePromise; });
  let crashing = false;

  const onManagerError = (error: unknown) => {
    logError(error instanceof Error ? error.message : String(error));
  };

  const detach = (): void => {
    target.off('SIGINT', onSignal);
    target.off('SIGTERM', onSignal);
    target.off('unhandledRejection', onRejection);
    target.off('uncaughtException', onException);
    options.signal?.removeEventListener('abort', onSignal);
    manager.off('error', onManagerError);
  };

  const close = (): Promise<void> => {
    closeTask ??= (async () => {
      detach();
      try {
        await manager.destroy();
      } finally {
        resolveStopped();
      }
    })();
    return closeTask;
  };

  const onSignal = (): void => {
    void close().catch(() => { process.exitCode = 1; });
  };
  const onFatal = (error: unknown): void => {
    if (crashing) return;
    crashing = true;
    process.exitCode = 1;
    logError(error instanceof Error ? error.message : String(error));
    void close().catch(() => { process.exitCode = 1; });
  };
  const onRejection = (reason: unknown): void => { onFatal(reason); };
  const onException = (error: Error): void => { onFatal(error); };

  target.once('SIGINT', onSignal);
  target.once('SIGTERM', onSignal);
  target.on('unhandledRejection', onRejection);
  target.on('uncaughtException', onException);
  manager.on('error', onManagerError);
  if (options.signal) {
    if (options.signal.aborted) onSignal();
    else options.signal.addEventListener('abort', onSignal, { once: true });
  }

  try {
    if (closeTask) {
      await closeTask;
      return;
    }
    await manager.spawn(options.shards);
    if (closeTask) {
      await closeTask;
      return;
    }
    logInfo(`Supervisor Yuzuha ativo (${manager.shardCount} shards).`);
    options.onReady?.(manager);
    if (options.waitForShutdown === false) {
      detach();
      return;
    }
    await stopped;
  } catch (error) {
    const interrupted = closeTask !== undefined;
    await close();
    if (!interrupted) throw error;
  }
}

export async function prepareShardedChildRun(
  bot: Yuzuha,
  options?: ChildShardingOptions,
): Promise<ShardClientUtilLike | undefined> {
  const env = options?.env ?? process.env;
  if (!isShardingChildProcess(env, options?.hasIpc) || bot.options.sharding === false) {
    return undefined;
  }
  const existing = getAttachedShardClientUtil(bot.client);
  if (existing) return existing;
  const sharding = await loadOptionalSharding(options?.importer);
  return sharding.attachShardClientUtil(bot.client);
}
