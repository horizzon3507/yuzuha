import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { setMaxListeners } from 'node:events';
import { Client, Events, Message } from '@fluxerjs/core';
import type { ClientEventName, ClientEvents, DiscoveryOrigin } from '@fluxerjs/core';
import { FluxerTransport, MemberCache, incoming } from '../adapter.js';
import { FluxerResources } from '../infrastructure/fluxer/resources.js';
import type { Resources } from '../ports/resources.js';
import { CommandContext } from '../context.js';
import type { Command, ContextOptions } from '../context.js';
import { createLocaleProbeContext } from '../commands/context.js';
import { resolveMessagesConfig } from '../domain/i18n.js';
import type { MessageTranslator, ResolvedMessages } from '../domain/i18n.js';
import { defineCommand } from '../commands/definition.js';
import type { NativeCommandDefinition } from '../commands/definition.js';
import { assertCustomArgumentTypeName } from '../commands/arguments.js';
import type { CustomArgumentType } from '../commands/arguments.js';
import type { ArgumentSchema } from '../commands/builders.js';
import type { IncomingMessage, Payload, Store, Transport } from '../contracts.js';
import { ConfigError, GuardError, PartialModerationError, YuzuhaError } from '../errors.js';
import { JsonStore, defaultDataPath } from '../store.js';
import { CommandRegistry, functionsRequired } from './command-registry.js';
import type { CompiledCommand } from './command-registry.js';
import { runMiddleware } from './middleware.js';
import type {
  AsyncYuzuhaPlugin, DestroyOptions, DispatchResult, Middleware, SignalHandlerOptions, UnknownCommandContext, YuzuhaOptions, YuzuhaPlugin,
} from './options.js';
import { MemoryRateLimiter, resolveRateLimitOptions } from './rate-limits.js';
import type { RateLimiter } from '../ports/rate-limiter.js';
import { ConcurrencyLimiter } from './concurrency.js';
import { reportError, resolveErrorReply } from './reporting.js';
import { route } from './routing.js';
import { DynamicPrefixCache, ValidatedPrefixCache, prefixCacheKey, validatePrefixCacheOptions } from './prefix-cache.js';
import { adaptClientEvent, defineEvent, NativeEvents, validateContextEvent } from './events.js';
import type { ContextEventDefinition, NativeEvent, NativeListener } from './events.js';
import { ServiceContainer } from './services.js';
import type { ServiceKey } from './services.js';
import { ScheduleExecutionError, Scheduler, validateLock } from '../services/scheduler.js';
import { StateMaintenance } from '../services/state-maintenance.js';
import type { CleanupResult } from '../services/state-maintenance.js';
import type { ScheduleRecord } from '../domain/state.js';
import { HttpService } from '../services/http.js';
import { createCdn } from '../domain/cdn.js';
import { emitLog } from './logging.js';
import type { GatewayLogEvent } from './logging.js';
import type { HealthReport, HealthStatus } from './health.js';
import { assertMetricsSink, emitMetric } from './metrics.js';
import { currentExecution, isExecutionOwner, runInExecution } from './execution.js';
import { cancellationError } from '../services/cancellation.js';
import { resolvePolicy } from '../services/retry.js';
import { EventContext } from '../commands/event-context.js';
import type { EventContextOptions } from '../commands/event-context.js';
import { adaptScriptEvent, validateScriptEvent } from './script-events.js';
import type { ScriptEventDefinition } from './script-events.js';
import type { ScriptEngine } from '../ports/script-engine.js';
import type { MusicManager } from '../services/music.js';
import type { NativeVoice } from '../ports/voice.js';
import { VoiceStateTracker } from '../services/voice-states.js';
import { attachVoiceStates } from './voice-states.js';
import { buildPresenceUpdateOptions } from '../infrastructure/fluxer/resources/users.js';
import type { PresenceInput } from '../ports/resources/common.js';
import { validatePresenceInput } from '../ports/resources/common.js';
import { startPresenceRotation, validatePresenceRotationOptions } from './presence.js';
import type { ActivePresenceRotation, PresenceRotationOptions } from './presence.js';
import { CacheSweepersController, validateCacheSweeperOptions } from './cache-sweepers.js';
import { assertClientOptions, validateDiscoveryOptions } from './discovery.js';
import { canvasRenderer } from '../infrastructure/canvas/render.js';
import {
  attachClientShardIfNeeded,
  getAttachedShardClientUtil,
  hasShardingProcessEnv,
  isShardingChildProcess,
  notifyClientShardReady,
  resolveBotShard,
  resolveShardSchedulerMode,
  shouldStartShardedJobs,
} from './sharding.js';
import type { BotShard, ShardClientUtilLike, ShardSchedulerMode } from './sharding.js';

type RoutedCommand = { kind: 'command'; compiled: CompiledCommand; input: string; prefix: string }
  | { kind: 'unknown'; unknown: UnknownCommandContext };
const ignored: Promise<DispatchResult> = Promise.resolve('ignored');

interface InstalledPlugin {
  readonly name: string;
  readonly dependsOn: readonly string[];
  readonly teardown?: (bot: Yuzuha) => void | Promise<void>;
  readonly commands: CompiledCommand[];
  readonly middlewares: Middleware[];
  readonly eventDisposers: (() => void)[];
  readonly serviceKeys: ServiceKey<unknown>[];
  readonly argumentTypeNames: string[];
  readonly functionNames: string[];
}

function validateHooks(hooks: YuzuhaOptions['hooks']): void {
  if (hooks === undefined) return;
  const prototype = hooks === null || typeof hooks !== 'object' || Array.isArray(hooks) ? undefined : Object.getPrototypeOf(hooks);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ConfigError('OPTIONS', 'hooks deve ser um objeto.');
  }
  for (const key of ['onCooldown', 'onDenied', 'onUnknownCommand'] as const) {
    if (hooks[key] !== undefined && typeof hooks[key] !== 'function') {
      throw new ConfigError('OPTIONS', `hooks.${key} deve ser uma função.`);
    }
  }
}

function resolveIdSet(input: unknown, field: string): ReadonlySet<string> {
  if (input === undefined) return new Set();
  if (!Array.isArray(input) || input.some(item => typeof item !== 'string' || !item || item.trim() !== item)) {
    throw new ConfigError('OPTIONS', `${field} deve ser uma lista de IDs não vazios sem espaços nas pontas.`);
  }
  return new Set(input);
}

function emojiRegistry(input: Record<string, string> | undefined): Record<string, string> {
  const registry: Record<string, string> = Object.create(null);
  if (input === undefined) return registry;
  const prototype = input === null || typeof input !== 'object' ? undefined : Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ConfigError('EMOJI_OPTIONS', 'emoji deve ser um objeto nome → texto.');
  }
  for (const [name, value] of Object.entries(input)) {
    if (!name || typeof value !== 'string' || !value) {
      throw new ConfigError('EMOJI_OPTIONS', 'emoji deve mapear nomes não vazios para textos não vazios.');
    }
    registry[name] = value;
  }
  return registry;
}

const DEFAULT_SWEEP_INTERVAL_MS = 60_000;
const MIN_SWEEP_INTERVAL_MS = 100;
const MAX_SWEEP_INTERVAL_MS = 86_400_000;
const DEFAULT_SWEEP_BATCH = 500;
const MAX_SWEEP_BATCH = 10_000;

function resolveVariableSweepOptions(input: YuzuhaOptions['variables']): { intervalMs: number | false; batch: number } {
  if (input === false) return { intervalMs: false, batch: DEFAULT_SWEEP_BATCH };
  if (input === undefined) return { intervalMs: DEFAULT_SWEEP_INTERVAL_MS, batch: DEFAULT_SWEEP_BATCH };
  const prototype = input === null || typeof input !== 'object' || Array.isArray(input) ? undefined : Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ConfigError('VARIABLE_SWEEP_OPTIONS', 'Opções de limpeza de variáveis inválidas.');
  }
  const intervalMs = input.sweepIntervalMs === undefined ? DEFAULT_SWEEP_INTERVAL_MS : input.sweepIntervalMs;
  if (intervalMs !== false && (!Number.isSafeInteger(intervalMs) || intervalMs < MIN_SWEEP_INTERVAL_MS || intervalMs > MAX_SWEEP_INTERVAL_MS)) {
    throw new ConfigError('VARIABLE_SWEEP_OPTIONS', `sweepIntervalMs deve ser false ou inteiro entre ${MIN_SWEEP_INTERVAL_MS} e ${MAX_SWEEP_INTERVAL_MS}.`);
  }
  const batch = input.sweepBatch === undefined ? DEFAULT_SWEEP_BATCH : input.sweepBatch;
  if (!Number.isSafeInteger(batch) || batch < 1 || batch > MAX_SWEEP_BATCH) {
    throw new ConfigError('VARIABLE_SWEEP_OPTIONS', `sweepBatch deve ser inteiro entre 1 e ${MAX_SWEEP_BATCH}.`);
  }
  return { intervalMs, batch };
}

function assertEngine(engine: unknown): ScriptEngine {
  const candidate = engine as Partial<Record<keyof ScriptEngine, unknown>> | null | undefined;
  if (!candidate || (['compile', 'execute', 'functions', 'registerAll', 'fork', 'text'] as const).some(key => typeof candidate[key] !== 'function')) {
    throw new ConfigError('ENGINE_INVALID', 'Engine de function mode inválido: precisa de compile, execute, functions, registerAll, fork e text.');
  }
  if (candidate.unregisterAll !== undefined && typeof candidate.unregisterAll !== 'function') {
    throw new ConfigError('ENGINE_INVALID', 'engine.unregisterAll deve ser uma função quando informado.');
  }
  return engine as ScriptEngine;
}

function assertLogger(logger: YuzuhaOptions['logger']): void {
  if (logger === undefined || logger === false) return;
  if (!logger || typeof logger !== 'object' || Array.isArray(logger)) {
    throw new ConfigError('LOGGER_OPTIONS', 'logger deve ser false ou um objeto com métodos info, warn e error.');
  }
  const candidate = logger as unknown as Record<string, unknown>;
  for (const method of ['info', 'warn', 'error'] as const) {
    if (typeof candidate[method] !== 'function') {
      throw new ConfigError('LOGGER_OPTIONS', `logger precisa do método ${method} como função.`);
    }
  }
  for (const optional of ['debug', 'child'] as const) {
    if (candidate[optional] !== undefined && typeof candidate[optional] !== 'function') {
      throw new ConfigError('LOGGER_OPTIONS', `logger.${optional} deve ser uma função quando informado.`);
    }
  }
}

function resolveGatewayLogOptions(input: YuzuhaOptions['gatewayLogs']): { readonly debug: boolean } | undefined {
  if (input === undefined || input === false) return undefined;
  if (input === true) return { debug: false };
  const prototype = input === null || typeof input !== 'object' || Array.isArray(input) ? undefined : Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ConfigError('GATEWAY_LOG_OPTIONS', 'gatewayLogs deve ser um booleano ou objeto de opções.');
  }
  const options = input as { debug?: unknown };
  if (options.debug !== undefined && typeof options.debug !== 'boolean') {
    throw new ConfigError('GATEWAY_LOG_OPTIONS', 'gatewayLogs.debug deve ser um booleano.');
  }
  return { debug: options.debug === true };
}

function assertRateLimiter(limiter: YuzuhaOptions['rateLimiter']): RateLimiter | undefined {
  if (limiter === undefined) return undefined;
  if (!limiter || typeof limiter !== 'object' || Array.isArray(limiter)) {
    throw new ConfigError('RATE_LIMIT_OPTIONS', 'rateLimiter deve ser um objeto com os métodos cooldown e duplicate.');
  }
  const candidate = limiter as unknown as Record<string, unknown>;
  for (const method of ['cooldown', 'duplicate'] as const) {
    if (typeof candidate[method] !== 'function') {
      throw new ConfigError('RATE_LIMIT_OPTIONS', `rateLimiter precisa do método ${method} como função.`);
    }
  }
  if (candidate.close !== undefined && typeof candidate.close !== 'function') {
    throw new ConfigError('RATE_LIMIT_OPTIONS', 'rateLimiter.close deve ser uma função quando informado.');
  }
  return limiter;
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return (typeof value === 'object' || typeof value === 'function')
    && value !== null
    && typeof (value as PromiseLike<T>).then === 'function';
}

const MAX_SHUTDOWN_TIMEOUT_MS = 600_000;

export function resolveDestroyTimeout(options?: DestroyOptions): number | undefined {
  if (options === undefined) return undefined;
  const prototype = options === null || typeof options !== 'object' || Array.isArray(options)
    ? undefined : Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ConfigError('SHUTDOWN_OPTIONS', 'Opções de encerramento inválidas.');
  }
  if (options.timeoutMs === undefined) return undefined;
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > MAX_SHUTDOWN_TIMEOUT_MS) {
    throw new ConfigError('SHUTDOWN_OPTIONS', `timeoutMs deve ser inteiro entre 1 e ${MAX_SHUTDOWN_TIMEOUT_MS}.`);
  }
  return options.timeoutMs;
}

export class Yuzuha {
  readonly client: Client;
  readonly transport: Transport;
  readonly store: Store;
  readonly resources: Resources;
  private readonly resourcesInjected: boolean;
  readonly scheduler?: Scheduler;
  readonly http?: HttpService;
  readonly music?: MusicManager;
  readonly voice?: NativeVoice;
  readonly voiceStates: VoiceStateTracker;
  private detachVoiceStates?: () => void;
  private presenceRotation?: ActivePresenceRotation;
  private readonly cacheSweepers?: CacheSweepersController;
  private readonly discoveryOrigin?: DiscoveryOrigin;
  private discoveryResolved = false;
  private shardState?: BotShard;
  private readonly shardSchedulerMode: ShardSchedulerMode;
  private readonly explicitShardUtil?: ShardClientUtilLike;
  private readonly shardingEnv?: NodeJS.ProcessEnv;
  private scriptEngine?: ScriptEngine;
  private readonly registry: CommandRegistry;
  private readonly customArgumentTypes = new Map<string, CustomArgumentType<unknown>>();
  private readonly middleware: Middleware[] = [];
  private readonly plugins = new Map<string, InstalledPlugin>();
  private readonly installingPlugins = new Map<string, InstalledPlugin>();
  private readonly uninstallingPlugins = new Set<string>();
  private readonly pluginScope = new AsyncLocalStorage<InstalledPlugin | undefined>();
  private readonly services = new ServiceContainer();
  private readonly limits: RateLimiter;
  private readonly ownsRateLimiter: boolean;
  private lastRateLimitEvictLog?: number;
  private readonly active = new Set<Promise<unknown>>();
  private readonly abortedScheduleExecutions = new Set<string>();
  private readonly shutdown = new AbortController();
  private reliability: import('../services/retry.js').Reliability = {};
  private timers: NonNullable<YuzuhaOptions['timers']> = { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: () => {} };
  private readonly pendingTimers = new Set<unknown>();
  private cdnService: import('../domain/cdn.js').Cdn = createCdn();
  private readonly emojiMap: Record<string, string>;
  private readonly messagesRuntime: ResolvedMessages;
  private readonly memberCache?: MemberCache;
  private detachMemberCache?: () => void;
  private readonly concurrencyLimiter?: ConcurrencyLimiter;
  private readonly maintenance: StateMaintenance;
  private readonly sweepIntervalMs: number | false;
  private readonly sweepBatch: number;
  private sweepCursor: string | null = null;
  private sweepTimer?: unknown;
  private hasSweepTimer = false;
  private sweepGeneration = 0;
  private sweepTask?: Promise<void>;
  private readonly events: NativeEvents;
  private readonly signalDisposers = new Set<() => void>();
  private listening = false;
  private closing = false;
  private closeTask?: Promise<void>;
  private loginTask?: Promise<void>;
  private loginAbort?: AbortController;
  private readonly listener: (message: Message) => void;
  private readonly gatewayErrors = new WeakSet<Error>();
  private readonly gatewayReports = new Set<Promise<void>>();
  private readonly gatewayLogConfig?: { readonly debug: boolean };
  private detachGatewayLogs?: () => void;
  private readonly errorListener = (error: Error): void => {
    if (this.gatewayErrors.delete(error)) return;
    this.reportGatewayError(error, 'error');
  };
  private readonly shardErrorListener = (_shardID: number, error: Error): void => {
    // The SDK emits shardError followed synchronously by error for the same failure.
    this.gatewayErrors.add(error);
    queueMicrotask(() => this.gatewayErrors.delete(error));
    this.reportGatewayError(error, 'shardError');
  };
  private reportGatewayError(error: Error, event: 'error' | 'shardError'): void {
    const task = runInExecution(
      this,
      { executionID: randomUUID(), source: 'gateway' },
      () => reportError(this.options, error, undefined, { source: 'gateway', event }),
    );
    this.gatewayReports.add(task);
    void task.then(() => this.gatewayReports.delete(task), () => this.gatewayReports.delete(task));
  }
  private emitGatewayLog(trigger: string, build: (executionID: string) => GatewayLogEvent): void {
    if (!this.hasLogSink) return;
    const executionID = randomUUID();
    const task = runInExecution(
      this,
      { executionID, source: 'gateway', event: trigger },
      () => emitLog(this.options, build(executionID)),
    );
    this.gatewayReports.add(task);
    void task.then(() => this.gatewayReports.delete(task), () => this.gatewayReports.delete(task));
  }
  private attachGatewayLogs(allowClosing = false): void {
    if (!this.gatewayLogConfig || this.detachGatewayLogs || (this.closing && !allowClosing)) return;
    const onReady = (): void => {
      this.emitGatewayLog(Events.Ready, executionID => ({ event: 'gateway.ready', executionID }));
    };
    const onResumed = (): void => {
      this.emitGatewayLog(Events.Resumed, executionID => ({ event: 'gateway.resumed', executionID }));
    };
    const onShardReady = (shardID: number): void => {
      this.emitGatewayLog(Events.ShardReady, executionID => ({ event: 'gateway.shard_ready', shardID, executionID }));
    };
    const onShardResumed = (shardID: number): void => {
      this.emitGatewayLog(Events.ShardResumed, executionID => ({ event: 'gateway.shard_resumed', shardID, executionID }));
    };
    const onShardReconnecting = (shardID: number): void => {
      this.emitGatewayLog(Events.ShardReconnecting, executionID => ({ event: 'gateway.shard_reconnecting', shardID, executionID }));
    };
    const onShardDisconnect = (shardID: number, closeCode: number): void => {
      this.emitGatewayLog(Events.ShardDisconnect, executionID => ({ event: 'gateway.shard_disconnect', shardID, closeCode, executionID }));
    };
    const onShardingRequired = (payload: { shardId: number; numShards: number }): void => {
      this.emitGatewayLog(Events.ShardingRequired, executionID => ({
        event: 'gateway.sharding_required',
        shardID: payload.shardId,
        numShards: payload.numShards,
        executionID,
      }));
    };
    const onWarn = (message: unknown): void => {
      this.emitGatewayLog('warn', executionID => ({
        event: 'sdk.warn',
        message: typeof message === 'string' ? message : String(message),
        executionID,
      }));
    };
    const onDebug = this.gatewayLogConfig.debug
      ? (message: string): void => {
        this.emitGatewayLog(Events.Debug, executionID => ({
          event: 'sdk.debug',
          message: typeof message === 'string' ? message : String(message),
          executionID,
        }));
      }
      : undefined;

    this.client.on(Events.Ready, onReady);
    this.client.on(Events.Resumed, onResumed);
    this.client.on(Events.ShardReady, onShardReady);
    this.client.on(Events.ShardResumed, onShardResumed);
    this.client.on(Events.ShardReconnecting, onShardReconnecting);
    this.client.on(Events.ShardDisconnect, onShardDisconnect);
    this.client.on(Events.ShardingRequired, onShardingRequired);
    this.client.on('warn', onWarn);
    if (onDebug) this.client.on(Events.Debug, onDebug);

    let detached = false;
    this.detachGatewayLogs = () => {
      if (detached) return;
      detached = true;
      this.detachGatewayLogs = undefined;
      this.client.off(Events.Ready, onReady);
      this.client.off(Events.Resumed, onResumed);
      this.client.off(Events.ShardReady, onShardReady);
      this.client.off(Events.ShardResumed, onShardResumed);
      this.client.off(Events.ShardReconnecting, onShardReconnecting);
      this.client.off(Events.ShardDisconnect, onShardDisconnect);
      this.client.off(Events.ShardingRequired, onShardingRequired);
      this.client.off('warn', onWarn);
      if (onDebug) this.client.off(Events.Debug, onDebug);
    };
  }
  private readonly validatedPrefixes = new ValidatedPrefixCache();
  private readonly dynamicPrefixCache?: DynamicPrefixCache;
  private readonly allowBots: boolean;
  private readonly mentionPrefix: boolean;
  private lastMentionBase?: string[];
  private lastMentionBotID?: string;
  private lastMentionCombined?: string[];
  private readonly ownerIDs: ReadonlySet<string>;
  private readonly devGuildIDs: ReadonlySet<string>;
  private readonly contextCooldown = (key: string, duration: number, maxUses?: number) =>
    maxUses === undefined ? this.limits.cooldown(key, duration) : this.limits.cooldown(key, duration, maxUses);
  private readonly contextHelp = (command?: string, prefix = '') => this.help(command, prefix);
  private readonly contextDeleteLater = (channelID: string, messageID: string, ttlMs: number) => this.deleteLater(channelID, messageID, ttlMs);
  private readonly contextIsOwner = (userID: string) => this.isOwner(userID);
  private readonly contextIsDevGuild = (guildID: string) => this.devGuildIDs.has(guildID);
  private readonly canvasContext: ContextOptions['canvas'];

  private get hasLogSink(): boolean { return Boolean(this.options.onLog || this.options.logger); }

  private trackActive(task: Promise<unknown>): void {
    this.active.add(task);
    emitMetric(this.options.metrics, m => m.onActiveExecutions?.(this.active.size));
  }

  private untrackActive(task: Promise<unknown>): void {
    if (!this.active.delete(task)) return;
    emitMetric(this.options.metrics, m => m.onActiveExecutions?.(this.active.size));
  }

  constructor(public readonly options: YuzuhaOptions = {}) {
    setMaxListeners(0, this.shutdown.signal);
    assertLogger(options.logger);
    assertMetricsSink(options.metrics);
    this.gatewayLogConfig = resolveGatewayLogOptions(options.gatewayLogs);
    if (options.context !== undefined && typeof options.context !== 'function') {
      throw new ConfigError('OPTIONS', 'context deve ser uma função.');
    }
    if (options.errorReply !== undefined && typeof options.errorReply !== 'function') {
      throw new ConfigError('OPTIONS', 'errorReply deve ser uma função.');
    }
    if (options.helpRenderer !== undefined && typeof options.helpRenderer !== 'function') {
      throw new ConfigError('OPTIONS', 'helpRenderer deve ser uma função.');
    }
    if (options.allowBots !== undefined && typeof options.allowBots !== 'boolean') {
      throw new ConfigError('OPTIONS', 'allowBots deve ser um booleano.');
    }
    if (options.mentionPrefix !== undefined && typeof options.mentionPrefix !== 'boolean') {
      throw new ConfigError('OPTIONS', 'mentionPrefix deve ser um booleano.');
    }
    this.allowBots = options.allowBots === true;
    this.mentionPrefix = options.mentionPrefix === true;
    validateHooks(options.hooks);
    if (options.locale !== undefined && typeof options.locale !== 'string' && typeof options.locale !== 'function') {
      throw new ConfigError('MESSAGES_OPTIONS', 'locale deve ser texto ou função.');
    }
    this.messagesRuntime = resolveMessagesConfig(options.messages, typeof options.locale === 'string' ? options.locale : undefined);
    if (options.gate !== undefined && typeof options.gate !== 'function') {
      throw new ConfigError('OPTIONS', 'gate deve ser uma função.');
    }
    this.ownerIDs = resolveIdSet(options.owners, 'owners');
    this.devGuildIDs = resolveIdSet(options.devGuilds, 'devGuilds');
    const rateLimitOptions = resolveRateLimitOptions(options.rateLimits);
    const customRateLimiter = assertRateLimiter(options.rateLimiter);
    const lock = validateLock(options.lock);
    this.ownsRateLimiter = customRateLimiter === undefined;
    this.limits = customRateLimiter ?? new MemoryRateLimiter({
      ...rateLimitOptions,
      now: options.now,
      onEvict: () => {
        if (!this.hasLogSink) return;
        const time = (this.options.now ?? Date.now)();
        if (this.lastRateLimitEvictLog === undefined || time - this.lastRateLimitEvictLog >= 10_000) {
          this.lastRateLimitEvictLog = time;
          void emitLog(this.options, { event: 'rate_limit.evicted' });
        }
      },
    });
    const retryPolicy = resolvePolicy(options.retry);
    const clientOptions = assertClientOptions(options.clientOptions);
    this.discoveryOrigin = validateDiscoveryOptions(options.discovery, options.client, clientOptions);
    try {
      this.client = options.client ?? new Client(clientOptions);
    } catch (error) {
      throw error instanceof ConfigError
        ? error
        : new ConfigError('OPTIONS', error instanceof Error ? error.message : 'clientOptions inválido.', { cause: error });
    }
    this.shardState = resolveBotShard(this.client, options.sharding, clientOptions);
    this.shardSchedulerMode = resolveShardSchedulerMode(options.sharding, lock !== undefined);
    if (options.sharding && typeof options.sharding === 'object') {
      this.explicitShardUtil = options.sharding.shardUtil;
      this.shardingEnv = options.sharding.env;
    }
    this.reliability = { retry: retryPolicy, signal: this.shutdown.signal,
      onRetry: (attempt, _error, delayMs) => {
        emitMetric(this.options.metrics, m => m.onTransportRetry?.({ attempt, delayMs }));
        if (!this.hasLogSink) return;
        const executionID = currentExecution()?.executionID;
        void emitLog(this.options, {
          event: 'transport.retry',
          attempt,
          delayMs,
          ...(executionID !== undefined ? { executionID } : {}),
        });
      } };
    if (options.memberCache !== undefined && options.memberCache !== false) {
      const cacheOptions = options.memberCache && typeof options.memberCache === 'object' && !Array.isArray(options.memberCache)
        ? { ...options.memberCache, now: options.memberCache.now ?? options.now }
        : options.memberCache;
      this.memberCache = new MemberCache(cacheOptions);
    }
    this.cdnService = createCdn(options.cdn?.mediaBase);
    this.transport = options.transport ?? new FluxerTransport(this.client, this.reliability, this.memberCache);
    if (this.memberCache && !options.transport && this.transport instanceof FluxerTransport) {
      this.detachMemberCache = this.transport.attachCacheInvalidation(this.client);
    }
    this.resources = options.resources ?? new FluxerResources(this.client, this.cdnService, this.reliability, options.now);
    this.resourcesInjected = options.resources !== undefined || options.transport === undefined;
    this.canvasContext = { renderer: canvasRenderer, config: options.canvas };
    this.emojiMap = emojiRegistry(options.emoji);
    if (options.concurrency !== undefined) {
      this.concurrencyLimiter = new ConcurrencyLimiter(options.concurrency);
    }
    const prefixCacheOptions = validatePrefixCacheOptions(options.prefixCache);
    if (prefixCacheOptions && typeof options.prefix === 'function') {
      this.dynamicPrefixCache = new DynamicPrefixCache(prefixCacheOptions, options.now);
    }
    const sweepOptions = resolveVariableSweepOptions(options.variables);
    this.sweepIntervalMs = sweepOptions.intervalMs;
    this.sweepBatch = sweepOptions.batch;
    const validatedCacheSweepers = validateCacheSweeperOptions(options.cacheSweepers);
    if (options.unsafeDisableResourceAuthorization && this.hasLogSink)
      void emitLog(this.options, { event: 'authorization.disabled' });
    this.timers = options.timers ?? { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms).unref(), clearTimeout: (handle: unknown) => clearTimeout(handle as never) };
    if (validatedCacheSweepers) {
      this.cacheSweepers = new CacheSweepersController(validatedCacheSweepers, {
        getCache: () => this.resources.cache,
        timers: this.timers,
        isClosing: () => this.closing,
        runScoped: (executionID, fn) => runInExecution(this, { executionID, source: 'scheduler' }, fn),
        onError: error => reportError(this.options, error, undefined, { source: 'scheduler' }),
      });
    }
    this.store = options.store ?? new JsonStore(defaultDataPath(options.name));
    this.maintenance = new StateMaintenance(this.store, options.now);
    this.scheduler = options.scheduler === false ? undefined : options.scheduler ?? new Scheduler(this.store,
      (task, signal) => this.runScheduled(task, signal), {
        now: options.now,
        timers: this.timers,
        lock,
        onEvent: event => {
          if (event.event === 'schedule.finish') {
            const wasCancelled = (event.executionID !== undefined && this.abortedScheduleExecutions.delete(event.executionID))
              || event.errorCode === 'SCHEDULE_ABORTED'
              || event.errorCode === 'EXECUTION_ABORTED'
              || event.errorCode === 'ABORTED';
            const outcome = event.status === 'success'
              ? 'completed'
              : wasCancelled ? 'cancelled' : 'failed';
            emitMetric(this.options.metrics, m => m.onSchedule?.({
              outcome,
              ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
            }));
          }
          if (!this.hasLogSink) return;
          return runInExecution(this, {
            executionID: event.executionID ?? randomUUID(),
            source: 'scheduler',
          }, () => emitLog(this.options, event));
        },
        onError: error => runInExecution(this, {
          executionID: currentExecution()?.executionID ?? randomUUID(),
          source: 'scheduler',
        }, () => reportError(this.options, error, undefined, { source: 'scheduler' })),
      });
    this.http = options.http === false ? undefined : options.http ?? new HttpService();
    this.music = options.music;
    this.voice = options.voice;
    this.voiceStates = new VoiceStateTracker();
    this.detachVoiceStates = attachVoiceStates(this.client, this.voiceStates);
    if (options.engine !== undefined) this.scriptEngine = assertEngine(options.engine);
    this.registry = new CommandRegistry(() => this.scriptEngine, command => {
      if (command.http) (this.http ?? new HttpService()).withPolicy(command.http);
    });
    this.events = new NativeEvents(this.client, (work, event) => this.scheduleEvent(work, event));
    if (typeof options.prefix !== 'function') this.resolvePrefixes(options.prefix ?? '!');
    this.listener = message => {
      if (this.closing || (!this.allowBots && message.author.bot) || message.author.id === this.transport.botID) return;
      if (typeof this.options.prefix !== 'function') {
        let prefixes: string[];
        try { prefixes = this.effectivePrefixes(this.options.prefix ?? '!'); }
        catch (error) { void reportError(this.options, error, undefined, { source: 'event', event: 'messageCreate' }); return; }
        if (!prefixes.some(prefix => message.content.startsWith(prefix))) return;
      }
      void this.handle(incoming(message)).catch(error => reportError(this.options, error, undefined, { source: 'event', event: 'messageCreate' }));
    };
    this.client.on(Events.Error, this.errorListener);
    this.client.on(Events.ShardError, this.shardErrorListener);
    this.attachGatewayLogs();
  }

  /** Cria um bot resolvendo os endpoints da instância via `Client.fromDiscovery`. */
  static async fromDiscovery(
    origin: DiscoveryOrigin,
    options: Omit<YuzuhaOptions, 'client' | 'discovery'> = {},
    connectOptions?: { signal?: AbortSignal },
  ): Promise<Yuzuha> {
    const rawOptions = options as YuzuhaOptions;
    const clientOptions = assertClientOptions(rawOptions.clientOptions);
    const validatedOrigin = validateDiscoveryOptions(origin, rawOptions.client, clientOptions)!;
    validateCacheSweeperOptions(rawOptions.cacheSweepers);
    const { instance: _omit, ...sdkOptions } = clientOptions ?? {};
    const client = await Client.fromDiscovery(
      validatedOrigin,
      clientOptions ? sdkOptions : undefined,
      connectOptions,
    );
    try {
      return new Yuzuha({ ...options, client });
    } catch (error) {
      await client.destroy().catch(() => {});
      throw error;
    }
  }

  private async replaceClient(nextClient: Client): Promise<void> {
    const previous = this.client;
    previous.off(Events.Error, this.errorListener);
    previous.off(Events.ShardError, this.shardErrorListener);
    this.detachGatewayLogs?.();
    this.detachMemberCache?.();
    this.detachMemberCache = undefined;
    this.memberCache?.clear();
    this.detachVoiceStates?.();
    this.detachVoiceStates = undefined;
    this.voiceStates.clear();

    this.events.rebind(nextClient);
    (this as { client: Client }).client = nextClient;
    this.shardState = resolveBotShard(nextClient, this.options.sharding, this.options.clientOptions);
    nextClient.on(Events.Error, this.errorListener);
    nextClient.on(Events.ShardError, this.shardErrorListener);
    this.attachGatewayLogs();

    if (!this.options.cdn?.mediaBase) {
      const discoveredMedia = nextClient.instance?.endpoints?.media;
      if (typeof discoveredMedia === 'string' && discoveredMedia.startsWith('https://')) {
        try { this.cdnService = createCdn(discoveredMedia); } catch { /* preserva CDN padrão */ }
      }
    }
    if (!this.options.transport) {
      const nextTransport = new FluxerTransport(nextClient, this.reliability, this.memberCache);
      (this as { transport: Transport }).transport = nextTransport;
      if (this.memberCache) {
        this.detachMemberCache = nextTransport.attachCacheInvalidation(nextClient);
      }
    }
    if (!this.options.resources) {
      (this as { resources: Resources }).resources = new FluxerResources(nextClient, this.cdnService, this.reliability, this.options.now);
    }
    this.detachVoiceStates = attachVoiceStates(nextClient, this.voiceStates);
    this.discoveryResolved = true;
    await previous.destroy().catch(() => {});
  }

  /** Engine de function mode instalado, quando presente. */
  get engine(): ScriptEngine | undefined { return this.scriptEngine; }

  /** Contexto de shard configurado ou anexado ao client, quando presente. */
  get shard(): BotShard | undefined {
    if (this.shardState) return this.shardState;
    if (this.options.sharding !== false && getAttachedShardClientUtil(this.client)) {
      this.shardState = resolveBotShard(this.client, this.options.sharding, this.options.clientOptions);
    }
    return this.shardState;
  }

  /** Mapa nome → emoji compartilhado com `ctx.emoji`; mutações são visíveis imediatamente. */
  get emoji(): Record<string, string> { return this.emojiMap; }

  /** Verifica se `userID` pertence aos donos configurados em `options.owners`. */
  isOwner(userID: string): boolean {
    return typeof userID === 'string' && userID.length > 0 && this.ownerIDs.has(userID);
  }

  /** Instala o motor de function mode; exigido por comandos com `code` e eventos de script. */
  useEngine(engine: ScriptEngine): this {
    if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
    if (this.scriptEngine) throw new YuzuhaError('ENGINE_INSTALLED', 'O bot já tem um engine de function mode.');
    this.scriptEngine = assertEngine(engine);
    return this;
  }

  use(middleware: Middleware): this {
    if (typeof middleware !== 'function') throw new YuzuhaError('MIDDLEWARE', 'Middleware deve ser uma função.');
    const activePlugin = this.pluginScope.getStore();
    if (activePlugin) {
      const owned: Middleware = (ctx, next) => middleware(ctx, next);
      this.middleware.push(owned);
      activePlugin.middlewares.push(owned);
    } else {
      this.middleware.push(middleware);
    }
    return this;
  }

  /** Registra um tipo customizado de argumento disponível para `arg.custom<T>(name)`. */
  argumentType<T = unknown>(name: string, definition: CustomArgumentType<T>): this {
    if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
    const validatedName = assertCustomArgumentTypeName(name);
    if (this.customArgumentTypes.has(validatedName)) {
      throw new YuzuhaError('ARGUMENT_TYPE', `Tipo de argumento já registrado: ${validatedName}.`);
    }
    if (!definition || typeof definition !== 'object' || typeof definition.parse !== 'function') {
      throw new YuzuhaError('ARGUMENT_TYPE', `Definição inválida para o tipo de argumento ${validatedName}: parse deve ser uma função.`);
    }
    if (definition.description !== undefined && typeof definition.description !== 'string') {
      throw new YuzuhaError('ARGUMENT_TYPE', `Descrição inválida para o tipo de argumento ${validatedName}.`);
    }
    this.customArgumentTypes.set(validatedName, Object.freeze({
      parse: (raw: string, ctx: CommandContext) => definition.parse(raw, ctx),
      ...(definition.description !== undefined ? { description: definition.description } : {}),
    }));
    this.pluginScope.getStore()?.argumentTypeNames.push(validatedName);
    return this;
  }

  provide<T>(key: ServiceKey<T>, value: T): this {
    if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
    this.services.provide(key, value);
    this.pluginScope.getStore()?.serviceKeys.push(key);
    return this;
  }

  hasService(key: ServiceKey<unknown>): boolean {
    return this.services.has(key);
  }

  get<T>(key: ServiceKey<T>): T {
    return this.services.get(key);
  }

  resolve<T>(key: ServiceKey<T>): T | undefined {
    return this.services.resolve(key);
  }

  plugin(plugin: AsyncYuzuhaPlugin): Promise<this>;
  plugin(plugin: YuzuhaPlugin): this;
  plugin(plugin: YuzuhaPlugin): this | Promise<this> {
    if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
    if (!plugin || typeof plugin !== 'object' || typeof plugin.name !== 'string' || !plugin.name
      || this.plugins.has(plugin.name) || this.installingPlugins.has(plugin.name)) {
      throw new YuzuhaError('PLUGIN_DUPLICATE', 'Plugin sem nome ou já instalado.');
    }
    if (plugin.setup !== undefined && typeof plugin.setup !== 'function') {
      throw new ConfigError('OPTIONS', 'plugin.setup deve ser uma função.');
    }
    if (plugin.teardown !== undefined && typeof plugin.teardown !== 'function') {
      throw new ConfigError('OPTIONS', 'plugin.teardown deve ser uma função.');
    }
    const dependsOn = plugin.dependsOn === undefined ? [] : plugin.dependsOn;
    if (!Array.isArray(dependsOn) || dependsOn.some(dep => typeof dep !== 'string' || !dep)) {
      throw new YuzuhaError('PLUGIN_DEPENDENCY', `Lista dependsOn inválida no plugin ${plugin.name}.`);
    }
    const unmet = dependsOn.filter(dep => !this.plugins.has(dep) || this.uninstallingPlugins.has(dep));
    if (unmet.length) {
      throw new YuzuhaError(
        'PLUGIN_DEPENDENCY',
        `O plugin ${plugin.name} requer plugins não instalados: ${unmet.join(', ')}.`,
      );
    }
    if ((plugin.middleware ?? []).some(item => typeof item !== 'function')) {
      throw new YuzuhaError('PLUGIN_MIDDLEWARE', 'Middleware de plugin inválido.');
    }
    const pending = [...plugin.commands ?? []], inspected = new Set<Command>();
    let hasScript = Boolean(plugin.scriptEvents?.length);
    while (pending.length && !hasScript) {
      const command = pending.pop()!;
      if (!command || inspected.has(command)) continue;
      inspected.add(command);
      hasScript = typeof command.code === 'string';
      if (Array.isArray(command.subcommands)) pending.push(...command.subcommands);
    }
    if (hasScript || plugin.functions?.length) {
      if (!this.scriptEngine) throw functionsRequired();
    }
    const stagedEngine = this.scriptEngine?.fork();
    stagedEngine?.registerAll(plugin.functions ?? []);
    const commitCommands = this.registry.prepare(plugin.commands ?? [], stagedEngine);
    for (const event of plugin.events ?? []) this.events.validate(event);
    const contextEvents = (plugin.contextEvents ?? []).map(event => ({
      prepared: this.prepareContextEvent(event),
      identity: event,
    }));
    const scriptEvents = (plugin.scriptEvents ?? []).map(event => this.prepareScriptEvent(event, stagedEngine));

    const record: InstalledPlugin = {
      name: plugin.name,
      dependsOn: [...new Set(dependsOn)],
      teardown: plugin.teardown,
      commands: [],
      middlewares: [],
      eventDisposers: [],
      serviceKeys: [],
      argumentTypeNames: [],
      functionNames: [],
    };

    if (plugin.functions?.length) {
      this.scriptEngine?.registerAll(plugin.functions);
      record.functionNames.push(...plugin.functions.map(fn => fn.name));
    }
    const committedCommands = commitCommands();
    if (this.scriptEngine) {
      const rebind = (entry: CompiledCommand): void => {
        if (entry.programEngine === stagedEngine) entry.programEngine = this.scriptEngine;
        for (const child of new Set(entry.children.values())) rebind(child);
      };
      for (const entry of committedCommands) rebind(entry);
    }
    record.commands.push(...committedCommands);
    for (const mw of plugin.middleware ?? []) {
      const owned: Middleware = (ctx, next) => mw(ctx, next);
      this.middleware.push(owned);
      record.middlewares.push(owned);
    }
    for (const event of plugin.events ?? []) record.eventDisposers.push(this.events.add(event));
    for (const item of contextEvents) record.eventDisposers.push(this.events.add(item.prepared, item.identity));
    for (const event of scriptEvents) record.eventDisposers.push(this.events.add(event));

    if (!plugin.setup) {
      this.plugins.set(record.name, record);
      return this;
    }

    const rollback = (): void => {
      this.installingPlugins.delete(record.name);
      this.cleanupPluginArtifacts(record);
    };

    this.installingPlugins.set(record.name, record);
    let setupResult: void | Promise<void>;
    try {
      setupResult = this.pluginScope.run(record, () => plugin.setup!(this));
    } catch (error) {
      rollback();
      throw error;
    }

    if (!isPromiseLike(setupResult)) {
      this.installingPlugins.delete(record.name);
      this.plugins.set(record.name, record);
      return this;
    }

    const installTask = Promise.resolve(setupResult).then(
      () => {
        if (this.closing) {
          rollback();
          throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
        }
        this.installingPlugins.delete(record.name);
        this.plugins.set(record.name, record);
        return this;
      },
      error => {
        rollback();
        throw error;
      },
    );
    const tracked = installTask.then(() => undefined, () => undefined);
    this.trackActive(tracked);
    void tracked.then(() => this.untrackActive(tracked));
    return installTask;
  }

  async unplugin(name: string): Promise<void> {
    if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
    if (typeof name !== 'string' || !name) {
      throw new YuzuhaError('PLUGIN_NOT_FOUND', 'Plugin não encontrado.');
    }
    const record = this.plugins.get(name);
    if (!record || this.uninstallingPlugins.has(name)) {
      throw new YuzuhaError('PLUGIN_NOT_FOUND', `Plugin não encontrado: ${name}.`);
    }
    const dependents: string[] = [];
    for (const [otherName, other] of this.plugins) {
      if (otherName !== name && !this.uninstallingPlugins.has(otherName) && other.dependsOn.includes(name)) {
        dependents.push(otherName);
      }
    }
    for (const [otherName, other] of this.installingPlugins) {
      if (otherName !== name && other.dependsOn.includes(name)) {
        dependents.push(otherName);
      }
    }
    if (dependents.length) {
      throw new YuzuhaError(
        'PLUGIN_DEPENDENCY',
        `Não é possível remover o plugin ${name}; exigido por: ${dependents.join(', ')}.`,
      );
    }
    this.uninstallingPlugins.add(name);
    const work = (async () => {
      try {
        await this.pluginScope.run(undefined, () => record.teardown?.(this));
      } finally {
        this.uninstallingPlugins.delete(name);
        this.plugins.delete(name);
        this.cleanupPluginArtifacts(record);
      }
    })();
    const tracked = work.then(() => undefined, () => undefined);
    this.trackActive(tracked);
    try {
      await work;
    } finally {
      this.untrackActive(tracked);
    }
  }

  private cleanupPluginArtifacts(record: InstalledPlugin): void {
    for (let index = record.eventDisposers.length - 1; index >= 0; index--) {
      record.eventDisposers[index]!();
    }
    for (let index = record.middlewares.length - 1; index >= 0; index--) {
      const position = this.middleware.indexOf(record.middlewares[index]!);
      if (position >= 0) this.middleware.splice(position, 1);
    }
    for (let index = record.commands.length - 1; index >= 0; index--) {
      this.registry.remove(record.commands[index]!);
    }
    if (record.functionNames.length) {
      this.scriptEngine?.unregisterAll?.(record.functionNames);
    }
    for (let index = record.argumentTypeNames.length - 1; index >= 0; index--) {
      this.customArgumentTypes.delete(record.argumentTypeNames[index]!);
    }
    for (let index = record.serviceKeys.length - 1; index >= 0; index--) {
      this.services.delete(record.serviceKeys[index]!);
    }
  }

  private async teardownPlugins(): Promise<void> {
    const installed = [...this.plugins.values()].reverse();
    for (const record of installed) {
      try {
        await this.pluginScope.run(undefined, () => record.teardown?.(this));
      } catch (error) {
        await reportError(this.options, error, undefined, {
          source: 'hook',
          event: `plugin.teardown:${record.name}`,
        });
      } finally {
        this.plugins.delete(record.name);
        this.cleanupPluginArtifacts(record);
      }
    }
  }

  command<const S extends ArgumentSchema = {}, const F extends ArgumentSchema = {}>(command: NativeCommandDefinition<S, F>): this;
  command(command: Command): this;
  command(command: Command | NativeCommandDefinition<ArgumentSchema, ArgumentSchema>): this {
    const entry = this.registry.add(defineCommand(command as NativeCommandDefinition<ArgumentSchema, ArgumentSchema>));
    this.pluginScope.getStore()?.commands.push(entry);
    return this;
  }
  load(directory: string, replace = true): Promise<void> { return this.registry.load(directory, replace ? 'replace' : 'append'); }
  reload(directory: string): Promise<void> { return this.registry.load(directory, 'reload'); }
  listCommands(): Command[] { return this.registry.list(); }
  help(command?: string, prefix = '', locale?: string): string {
    return this.registry.help(command, prefix, this.messagesRuntime.translatorFor(locale), this.options.helpRenderer);
  }
  get signal(): AbortSignal { return this.shutdown.signal; }
  deleteLater(channelID: string, messageID: string, ttlMs: number): void {
    const capturedExecutionID = currentExecution()?.executionID;
    const handle = this.timers.setTimeout(() => {
      this.pendingTimers.delete(handle);
      void this.transport.delete(channelID, messageID).catch(error => {
        if (!this.hasLogSink) return;
        const executionID = capturedExecutionID ?? currentExecution()?.executionID;
        void emitLog(this.options, {
          event: 'message.ttl_failed',
          messageID,
          channelID,
          ...(executionID !== undefined ? { executionID } : {}),
          errorCode: (error as { code?: string }).code,
        });
      });
    }, ttlMs);
    this.pendingTimers.add(handle);
  }

  /** Executa um lote incremental de limpeza de variáveis expiradas no store. */
  async sweepVariables(): Promise<CleanupResult> {
    if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
    const work = this.maintenance.cleanupExpired({ limit: this.sweepBatch, cursor: this.sweepCursor });
    const tracked = work.then(() => undefined, () => undefined);
    this.trackActive(tracked);
    try {
      const result = await work;
      this.sweepCursor = result.cursor;
      return result;
    } finally {
      this.untrackActive(tracked);
    }
  }

  private clearVariableSweepTimer(): void {
    this.sweepGeneration++;
    if (!this.hasSweepTimer) return;
    this.timers.clearTimeout(this.sweepTimer);
    this.sweepTimer = undefined;
    this.hasSweepTimer = false;
  }

  private startVariableSweep(): void {
    if (this.sweepIntervalMs === false || this.hasSweepTimer || this.sweepTask || this.closing) return;
    const intervalMs = this.sweepIntervalMs;
    const generation = this.sweepGeneration;
    const schedule = (): void => {
      if (this.closing || generation !== this.sweepGeneration || this.hasSweepTimer) return;
      let fired = false;
      const handle = this.timers.setTimeout(() => {
        fired = true;
        if (this.sweepTimer === handle) {
          this.sweepTimer = undefined;
          this.hasSweepTimer = false;
        }
        if (this.closing || generation !== this.sweepGeneration) return;
        const work = runInExecution(this, { executionID: randomUUID(), source: 'scheduler' }, async () => {
          try { await this.sweepVariables(); }
          catch (error) { await reportError(this.options, error, undefined, { source: 'scheduler' }); }
        }).finally(() => {
          if (this.sweepTask === work) this.sweepTask = undefined;
          if (!this.closing && generation === this.sweepGeneration) schedule();
        });
        this.sweepTask = work;
      }, intervalMs);
      if (!fired && !this.closing && generation === this.sweepGeneration) {
        this.sweepTimer = handle;
        this.hasSweepTimer = true;
      }
    };
    schedule();
  }

  private async stopVariableSweep(): Promise<void> {
    this.clearVariableSweepTimer();
    await this.sweepTask;
  }

  /** Inicia os sweepers periódicos de cache configurados em `cacheSweepers` e retorna um removedor idempotente. */
  startCacheSweepers(): () => void {
    if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
    return this.cacheSweepers?.start() ?? (() => {});
  }

  /** Para os sweepers periódicos de cache e aguarda qualquer limpeza em andamento. */
  async stopCacheSweepers(): Promise<void> {
    await this.cacheSweepers?.drain();
  }

  isReady(): boolean { return this.client.isReady(); }
  get uptime(): number | null { return this.client.uptime; }
  assertReady(): void {
    try { this.client.assertReady(); }
    catch { throw new YuzuhaError('BOT_NOT_READY', 'O bot ainda não está pronto.'); }
  }

  /** Retorna um relatório imutável do estado operacional atual do bot. */
  health(): HealthReport {
    const closing = this.closing;
    const ready = !closing && this.isReady();
    const status: HealthStatus = closing ? 'closed' : ready ? 'ok' : 'starting';
    const uptimeMs = closing || !ready ? null : this.uptime;
    return Object.freeze({
      status,
      ready,
      closing,
      uptimeMs,
      activeExecutions: this.active.size,
      schedulerRunning: Boolean(this.scheduler?.isRunning),
      timestamp: (this.options.now ?? Date.now)(),
    });
  }

  /** Define a presença do bot (status, lista de atividades, custom status e flag AFK). */
  async setPresence(input: PresenceInput): Promise<void> {
    if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
    const validated = validatePresenceInput(input);
    try {
      await this.resources.users.setPresence(validated);
    } catch (error) {
      if (
        error instanceof YuzuhaError
        && error.code === 'NATIVE_UNAVAILABLE'
        && this.options.resources !== undefined
        && this.client.user
      ) {
        this.client.user.setPresence(buildPresenceUpdateOptions(validated));
        return;
      }
      throw error;
    }
  }

  /** Rotaciona periodicamente a presença do bot usando `this.timers` e retorna um removedor idempotente. */
  rotatePresence(options: PresenceRotationOptions): () => void {
    if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
    const config = validatePresenceRotationOptions(options);
    this.presenceRotation?.stop();
    const rotation = startPresenceRotation({
      bot: this,
      config,
      timers: this.timers,
      isClosing: () => this.closing,
      applyPresence: input => this.setPresence(input),
      runScoped: (executionID, fn) => runInExecution(this, { executionID, source: 'scheduler' }, fn),
      onError: error => reportError(this.options, error, undefined, { source: 'scheduler' }),
    });
    this.presenceRotation = rotation;
    return () => {
      rotation.stop();
      if (this.presenceRotation === rotation) this.presenceRotation = undefined;
    };
  }

  private addEvent(event: NativeEvent, identity?: unknown): void {
    const dispose = identity === undefined ? this.events.add(event) : this.events.add(event, identity);
    this.pluginScope.getStore()?.eventDisposers.push(dispose);
  }

  on<K extends ClientEventName>(event: K, listener: NativeListener<K>): this {
    this.addEvent(defineEvent({ event, run: listener }), listener); return this;
  }
  once<K extends ClientEventName>(event: K, listener: NativeListener<K>): this {
    this.addEvent(defineEvent({ event, once: true, run: listener }), listener); return this;
  }
  off<K extends ClientEventName>(event: K, listener: NativeListener<K> | ContextEventDefinition<K> | NativeEvent): this {
    this.events.off(event, listener); return this;
  }
  event(event: NativeEvent): this { this.addEvent(event); return this; }

  contextEvent<K extends ClientEventName>(definition: ContextEventDefinition<K>): this {
    if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
    this.addEvent(this.prepareContextEvent(definition), definition);
    return this;
  }

  private prepareContextEvent<K extends ClientEventName>(definition: ContextEventDefinition<K>): NativeEvent {
    validateContextEvent(definition as unknown as ContextEventDefinition<ClientEventName>);
    const event = definition.event;
    const once = definition.once ?? false;
    const channelID = definition.channelID;
    const actorID = definition.actorID;
    const ignoreBots = definition.ignoreBots;
    const http = definition.http !== undefined ? structuredClone(definition.http) : undefined;
    const run = definition.run;
    if (http) (this.http ?? new HttpService()).withPolicy(http);
    return {
      event,
      once,
      invoke: async (args: unknown[]) => {
        const typedArgs = args as ClientEvents[K];
        const source = adaptClientEvent(event, typedArgs);
        if ((ignoreBots ?? true) && source.event.userBot) return;
        const baseEventOptions: EventContextOptions<K> = {
          ...source,
          eventArgs: typedArgs,
          channelID,
          actorID,
          policy: http,
          transport: this.transport,
          store: this.store,
          shard: this.shard,
          native: { client: this.client, message: source.message?.raw instanceof Message ? source.message.raw : undefined },
          resources: this.resources,
          resourcesInjected: this.resourcesInjected,
          argumentTypes: this.customArgumentTypes,
          scheduler: this.scheduler,
          http: this.http,
          music: this.music,
          voice: this.voice,
          voiceStates: this.voiceStates,
          canvas: this.canvasContext,
          now: this.options.now,
          help: this.contextHelp,
          cdn: this.cdnService,
          disableResourceAuthorization: this.options.unsafeDisableResourceAuthorization === true,
          cooldown: this.contextCooldown,
          signal: this.shutdown.signal,
          emoji: this.emojiMap,
          deleteLater: this.contextDeleteLater,
          isOwner: this.contextIsOwner,
          isDevGuild: this.contextIsDevGuild,
          services: this.services,
          locale: this.messagesRuntime.defaultLocale,
          translator: this.messagesRuntime.defaultTranslator,
        };
        const prelim = new EventContext<K>(baseEventOptions);
        await runInExecution(this, {
          executionID: prelim.executionID,
          source: 'event',
          event,
          guildID: prelim.guildID || undefined,
          channelID: prelim.channelID || undefined,
          userID: prelim.authorID || undefined,
        }, async () => {
          let ctx = prelim;
          try {
            if (typeof this.options.locale === 'function') {
              const resolvedLocale = await this.resolveEventLocale(baseEventOptions, prelim.executionID);
              if (this.closing || this.shutdown.signal.aborted) return;
              ctx = new EventContext<K>({
                ...baseEventOptions,
                executionID: prelim.executionID,
                locale: resolvedLocale.locale,
                translator: resolvedLocale.translator,
                help: (cmd, pfx = '') => this.registry.help(cmd, pfx, resolvedLocale.translator, this.options.helpRenderer),
              });
            }
            if (this.options.context) {
              await this.options.context(ctx);
              if (this.shutdown.signal.aborted) throw cancellationError();
            }
            await run(ctx, ...typedArgs);
          } catch (error) {
            await reportError(this.options, error, ctx, { source: 'event', event, executionID: prelim.executionID });
          }
        });
      },
    };
  }

  private async resolveEventLocale<K extends ClientEventName>(
    options: EventContextOptions<K>,
    executionID: string,
  ): Promise<{ readonly locale: string; readonly translator: MessageTranslator }> {
    if (typeof this.options.locale !== 'function') {
      return { locale: this.messagesRuntime.defaultLocale, translator: this.messagesRuntime.defaultTranslator };
    }
    const event = options.event;
    const probe = new EventContext<K>({
      ...options,
      executionID,
      message: options.message ?? {
        id: `event-${executionID}`,
        content: '',
        authorID: event.userID ?? '',
        authorName: event.userName ?? '',
        authorBot: event.userBot,
        channelID: options.channelID ?? event.channelID ?? '',
        guildID: event.guildID ?? undefined,
        mentions: [],
      },
    });
    return this.messagesRuntime.resolve(await this.options.locale(probe));
  }

  scriptEvent(definition: ScriptEventDefinition): this {
    if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
    if (!this.scriptEngine) throw functionsRequired();
    this.addEvent(this.prepareScriptEvent(definition));
    return this;
  }
  private prepareScriptEvent(definition: ScriptEventDefinition, engine = this.scriptEngine): NativeEvent {
    if (!engine) throw functionsRequired();
    validateScriptEvent(definition);
    const options = structuredClone(definition);
    if (options.http) (this.http ?? new HttpService()).withPolicy(options.http);
    const program = engine.compile(options.code, `<event:${options.event}>`);
    return { event: options.event, once: options.once ?? false, invoke: args => this.runScriptEvent(options, program, args, this.scriptEngine ?? engine) };
  }
  private async runScriptEvent(definition: ScriptEventDefinition, program: unknown, args: unknown[], engine: ScriptEngine): Promise<void> {
    const source = adaptScriptEvent(definition.event, args);
    if ((definition.ignoreBots ?? true) && source.event.userBot) return;
    const signal = this.shutdown.signal;
    const baseEventOptions: EventContextOptions<ScriptEventDefinition['event']> = {
      ...source,
      eventArgs: args as ClientEvents[ScriptEventDefinition['event']],
      channelID: definition.channelID,
      actorID: definition.actorID,
      policy: definition.http,
      transport: this.transport,
      store: this.store,
      shard: this.shard,
      native: { client: this.client, message: source.message?.raw instanceof Message ? source.message.raw : undefined },
      resources: this.resources,
      resourcesInjected: this.resourcesInjected,
      argumentTypes: this.customArgumentTypes,
      scheduler: this.scheduler, http: this.http, music: this.music, voice: this.voice, voiceStates: this.voiceStates,
      canvas: this.canvasContext, now: this.options.now, help: this.contextHelp, cooldown: this.contextCooldown, signal,
      cdn: this.cdnService, disableResourceAuthorization: this.options.unsafeDisableResourceAuthorization === true, emoji: this.emojiMap,
      deleteLater: this.contextDeleteLater, isOwner: this.contextIsOwner, isDevGuild: this.contextIsDevGuild,
      services: this.services, locale: this.messagesRuntime.defaultLocale, translator: this.messagesRuntime.defaultTranslator };
    const prelim = new EventContext(baseEventOptions);
    await runInExecution(this, {
      executionID: prelim.executionID,
      source: 'event',
      event: definition.event,
      guildID: prelim.guildID || undefined,
      channelID: prelim.channelID || undefined,
      userID: prelim.authorID || undefined,
    }, async () => {
      const started = this.hasLogSink ? performance.now() : 0;
      let outcome: DispatchResult = 'success';
      let ctx = prelim;
      try {
        if (typeof this.options.locale === 'function') {
          const resolvedLocale = await this.resolveEventLocale(baseEventOptions, prelim.executionID);
          if (this.closing || signal.aborted) throw cancellationError();
          ctx = new EventContext({ ...baseEventOptions, executionID: prelim.executionID,
            locale: resolvedLocale.locale, translator: resolvedLocale.translator,
            help: (cmd, pfx = '') => this.registry.help(cmd, pfx, resolvedLocale.translator, this.options.helpRenderer) });
        }
        if (this.hasLogSink) await emitLog(this.options, { event: 'event.start', executionID: ctx.executionID, command: ctx.command.name });
        if (this.options.context) {
          await this.options.context(ctx);
          if (signal.aborted) throw cancellationError();
        }
        const output = engine.text(await engine.execute(program, ctx)).trim();
        if (output) {
          if (!ctx.channelID) throw new GuardError(ctx.t('eventChannelRequired'), 'INVALID_ARGUMENT');
          await ctx.send(output, ctx.channelID);
        }
      } catch (error) {
        outcome = error instanceof GuardError ? 'guarded' : 'error';
        await reportError(this.options, error, ctx, { source: 'event', event: definition.event, executionID: ctx.executionID });
      } finally {
        if (this.hasLogSink) await emitLog(this.options, { event: 'event.finish', executionID: ctx.executionID,
          command: ctx.command.name, outcome, durationMs: performance.now() - started });
      }
    });
  }

  private scheduleEvent(work: () => unknown | Promise<unknown>, event: ClientEventName): void {
    if (this.closing) return;
    const task = runInExecution(this, { executionID: randomUUID(), source: 'event', event }, async () => {
      try { await Promise.resolve().then(work); }
      catch (error) { await reportError(this.options, error, undefined, { source: 'event', event }); }
    });
    this.trackActive(task);
    void task.then(() => this.untrackActive(task), () => this.untrackActive(task));
  }

  private async runScheduled(task: ScheduleRecord, signal: AbortSignal): Promise<void> {
    const executionID = task.claimID ?? randomUUID();
    if (this.closing || signal.aborted) {
      this.abortedScheduleExecutions.add(executionID);
      throw cancellationError();
    }
    return runInExecution(this, {
      executionID,
      source: 'scheduler',
      command: task.command,
      guildID: task.guildID,
      channelID: task.channelID,
      userID: task.authorID,
    }, async () => {
      const prefixes = typeof this.options.prefix === 'function'
        ? await this.resolveDynamicPrefixes({ channelID: task.channelID, guildID: task.guildID } as IncomingMessage, this.options.prefix, signal)
        : this.resolvePrefixes(this.options.prefix ?? '!');
      if (!prefixes) {
        this.abortedScheduleExecutions.add(executionID);
        throw cancellationError();
      }
      const prefix = prefixes[0] ?? '!';
      const suffix = task.input ? ` ${task.input}` : '';
      let retryable = true, cause: unknown;
      const outcome = await this.handleMessage({ id: `schedule-${task.id}-${task.claimID ?? Date.now()}`, content: `${prefix}${task.command}${suffix}`,
        authorID: task.authorID, authorName: 'Scheduler', authorBot: false,
        channelID: task.channelID, guildID: task.guildID, mentions: [] }, (error, ctx) => {
        cause = error; retryable = !(error instanceof GuardError || error instanceof PartialModerationError) && !ctx?.hasModerationEffect;
      }, signal, executionID, true);
      if (
        this.closing
        || signal.aborted
        || (cause instanceof YuzuhaError && (cause.code === 'EXECUTION_ABORTED' || cause.code === 'ABORTED' || cause.code === 'SCHEDULE_ABORTED'))
      ) {
        this.abortedScheduleExecutions.add(executionID);
      }
      if (outcome !== 'success') throw new ScheduleExecutionError(outcome === 'error' && retryable, cause);
    });
  }

  private shouldStartBackgroundJobs(): boolean {
    return shouldStartShardedJobs(this.shard, this.shardSchedulerMode);
  }

  /** @internal Prepara o bot quando o ciclo de login do Client é conduzido por YuzuhaCluster. */
  bindClusterRuntime(): void {
    if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
    if (this.listening) return;
    if (this.memberCache && !this.detachMemberCache && !this.options.transport && this.transport instanceof FluxerTransport) {
      this.detachMemberCache = this.transport.attachCacheInvalidation(this.client);
    }
    this.attachGatewayLogs();
    if (!this.detachVoiceStates) {
      this.detachVoiceStates = attachVoiceStates(this.client, this.voiceStates);
    }
    if (this.shouldStartBackgroundJobs()) {
      this.scheduler?.start();
      this.startVariableSweep();
    }
    this.cacheSweepers?.start();
    this.client.on(Events.MessageCreate, this.listener);
    this.listening = true;
  }

  login(token?: string): Promise<void> {
    if (this.closing) return Promise.reject(new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.'));
    const env = this.shardingEnv ?? process.env;
    const resolvedToken = token !== undefined
      ? token
      : (env.FLUXER_BOT_TOKEN?.trim() ? env.FLUXER_BOT_TOKEN : (hasShardingProcessEnv(env) ? env.FLUXER_TOKEN : env.FLUXER_BOT_TOKEN));
    if (!resolvedToken?.trim()) {
      this.detachGatewayLogs?.();
      this.detachVoiceStates?.();
      this.detachVoiceStates = undefined;
      this.voiceStates.clear();
      return Promise.reject(new ConfigError('TOKEN_MISSING', 'Defina FLUXER_BOT_TOKEN.'));
    }
    if (this.loginTask) return this.loginTask;
    this.loginAbort = new AbortController();
    const signal = this.loginAbort.signal;
    const task = (async () => {
      if (this.discoveryOrigin !== undefined && !this.discoveryResolved) {
        const { instance: _omit, ...sdkOptions } = this.options.clientOptions ?? {};
        const discovered = await Client.fromDiscovery(
          this.discoveryOrigin,
          this.options.clientOptions ? sdkOptions : undefined,
          { signal },
        );
        if (this.closing) {
          await discovered.destroy().catch(() => {});
          throw new YuzuhaError('BOT_CLOSED', 'O bot foi encerrado durante o login.');
        }
        await this.replaceClient(discovered);
      }
      if (this.memberCache && !this.detachMemberCache && !this.options.transport && this.transport instanceof FluxerTransport) {
        this.detachMemberCache = this.transport.attachCacheInvalidation(this.client);
      }
      this.attachGatewayLogs();
      if (!this.detachVoiceStates) {
        this.detachVoiceStates = attachVoiceStates(this.client, this.voiceStates);
      }
      if (this.shouldStartBackgroundJobs()) {
        this.scheduler?.start();
        this.startVariableSweep();
      }
      this.cacheSweepers?.start();
      this.client.on(Events.MessageCreate, this.listener);
      this.listening = true;
      const needsAutoAttach = this.options.sharding !== false
        && !this.explicitShardUtil
        && !getAttachedShardClientUtil(this.client)
        && isShardingChildProcess(env);
      if (needsAutoAttach) {
        await attachClientShardIfNeeded(this.client, { env });
      }
      await this.client.login(resolvedToken, { signal });
      if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot foi encerrado durante o login.');
      notifyClientShardReady(this.client, this.explicitShardUtil);
    })().catch(async error => {
      if (this.listening) {
        this.client.off(Events.MessageCreate, this.listener);
        this.listening = false;
      }
      this.scheduler?.stop();
      await this.scheduler?.drain();
      await this.stopVariableSweep();
      await this.cacheSweepers?.drain();
      await this.presenceRotation?.drain();
      this.presenceRotation = undefined;
      if (this.discoveryOrigin !== undefined) this.discoveryResolved = false;
      const needsErrorListener = !this.client.listeners(Events.Error).includes(this.errorListener);
      const needsShardListener = !this.client.listeners(Events.ShardError).includes(this.shardErrorListener);
      const needsGatewayLogs = Boolean(this.gatewayLogConfig && !this.detachGatewayLogs);
      if (needsErrorListener) this.client.on(Events.Error, this.errorListener);
      if (needsShardListener) this.client.on(Events.ShardError, this.shardErrorListener);
      if (needsGatewayLogs) this.attachGatewayLogs(true);
      for (const handle of this.pendingTimers) this.timers.clearTimeout(handle);
      this.pendingTimers.clear();
      try { await this.client.destroy(); }
      finally {
        if (needsErrorListener) this.client.off(Events.Error, this.errorListener);
        if (needsShardListener) this.client.off(Events.ShardError, this.shardErrorListener);
        this.detachGatewayLogs?.();
        this.detachMemberCache?.();
        this.detachMemberCache = undefined;
        this.memberCache?.clear();
        this.detachVoiceStates?.();
        this.detachVoiceStates = undefined;
        this.voiceStates.clear();
        await Promise.allSettled([...this.gatewayReports]);
      }
      throw error;
    });
    this.loginTask = task;
    void task.catch(() => { if (this.loginTask === task) this.loginTask = undefined; });
    return task;
  }

  private disposeSignals(): void {
    for (const dispose of [...this.signalDisposers]) dispose();
  }

  /** Instala handlers de sinais do processo para encerrar o bot de forma controlada e retorna um removedor idempotente. */
  handleSignals(options?: SignalHandlerOptions): () => void {
    if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
    if (options !== undefined) {
      const prototype = options === null || typeof options !== 'object' || Array.isArray(options)
        ? undefined : Object.getPrototypeOf(options);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new ConfigError('SHUTDOWN_OPTIONS', 'Opções de tratamento de sinais inválidas.');
      }
    }
    const timeoutMs = resolveDestroyTimeout(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : undefined);
    const rawSignals = options?.signals === undefined ? (['SIGINT', 'SIGTERM'] as const) : options.signals;
    if (!Array.isArray(rawSignals) || rawSignals.length === 0 || rawSignals.some(sig => typeof sig !== 'string' || !sig)) {
      throw new ConfigError('SHUTDOWN_OPTIONS', 'signals deve ser uma lista não vazia de nomes de sinais.');
    }
    const uniqueSignals = [...new Set(rawSignals)];
    const rawTarget = options?.target ?? process;
    if (!rawTarget || typeof (rawTarget as { on?: unknown }).on !== 'function' || typeof (rawTarget as { off?: unknown }).off !== 'function') {
      throw new ConfigError('SHUTDOWN_OPTIONS', 'target deve implementar on e off.');
    }
    if (options?.onExit !== undefined && typeof options.onExit !== 'function') {
      throw new ConfigError('SHUTDOWN_OPTIONS', 'onExit deve ser uma função.');
    }
    const target = rawTarget as {
      on(event: string, listener: (...args: unknown[]) => void): unknown;
      off(event: string, listener: (...args: unknown[]) => void): unknown;
    };
    const onExit = options?.onExit;
    let disposed = false;
    const onSignal = (): void => {
      dispose();
      void this.destroy(timeoutMs !== undefined ? { timeoutMs } : undefined).then(
        () => { onExit?.(0); },
        () => { onExit?.(1); },
      );
    };
    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      this.signalDisposers.delete(dispose);
      for (const sig of uniqueSignals) target.off(sig, onSignal);
    };
    for (const sig of uniqueSignals) target.on(sig, onSignal);
    this.signalDisposers.add(dispose);
    return dispose;
  }

  destroy(options?: DestroyOptions): Promise<void> {
    let timeoutMs: number | undefined;
    try { timeoutMs = resolveDestroyTimeout(options); }
    catch (error) { return Promise.reject(error); }
    this.disposeSignals();
    if (this.closeTask) return isExecutionOwner(this) ? Promise.resolve() : this.closeTask;
    this.closing = true;
    this.shutdown.abort();
    this.loginAbort?.abort();
    this.scheduler?.stop();
    this.clearVariableSweepTimer();
    this.cacheSweepers?.stop();
    this.presenceRotation?.stop();
    this.concurrencyLimiter?.close();
    this.dynamicPrefixCache?.close();
    this.events.close();
    if (this.listening) this.client.off(Events.MessageCreate, this.listener);
    this.listening = false;
    this.closeTask = (async () => {
      const drainWork = Promise.allSettled([...this.active])
        .then(() => this.scheduler?.drain())
        .then(() => Promise.allSettled([
          ...(this.sweepTask ? [this.sweepTask] : []),
          ...(this.cacheSweepers ? [this.cacheSweepers.drain()] : []),
          ...(this.presenceRotation ? [this.presenceRotation.drain()] : []),
        ]))
        .then(() => { this.presenceRotation = undefined; });
      if (timeoutMs !== undefined) {
        let deadlineHandle: unknown;
        let timedOut = false;
        let settled = false;
        const deadline = new Promise<void>(resolve => {
          deadlineHandle = this.timers.setTimeout(() => {
            if (!settled) {
              timedOut = true;
              resolve();
            }
          }, timeoutMs);
        });
        try {
          await Promise.race([
            drainWork.then(() => { settled = true; }),
            deadline,
          ]);
        } finally {
          this.timers.clearTimeout(deadlineHandle);
        }
        if (timedOut && this.hasLogSink) {
          await emitLog(this.options, { event: 'shutdown.timeout', pending: this.active.size });
        }
      } else {
        await drainWork;
      }
      try {
        await this.teardownPlugins();
        const results = await Promise.allSettled([this.music?.close(), this.voice?.close()]);
        const failures = results.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
        if (failures.length) throw new AggregateError(failures.map(item => item.reason), 'Falha ao encerrar música ou voz.');
      }
      finally {
        for (const handle of this.pendingTimers) this.timers.clearTimeout(handle);
        this.pendingTimers.clear();
        try { await this.client.destroy(); }
        finally {
          this.client.off(Events.Error, this.errorListener);
          this.client.off(Events.ShardError, this.shardErrorListener);
          this.detachGatewayLogs?.();
          this.detachMemberCache?.();
          this.detachMemberCache = undefined;
          this.memberCache?.clear();
          this.detachVoiceStates?.();
          this.detachVoiceStates = undefined;
          this.voiceStates.clear();
          await Promise.allSettled([...this.gatewayReports]);
          try {
            if (!this.options.store) await this.store.close?.();
          } finally {
            if (this.ownsRateLimiter) await this.limits.close?.();
          }
        }
      }
    })();
    return isExecutionOwner(this) ? Promise.resolve() : this.closeTask;
  }

  /** Limpa o cache de prefixos dinâmicos para um servidor ou para todo o bot. */
  invalidatePrefix(guildID?: string): void {
    this.dynamicPrefixCache?.invalidate(guildID);
  }

  handle(message: IncomingMessage): Promise<DispatchResult> {
    return this.handleMessage(message);
  }

  private resolvePrefixes(source: string | string[]): string[] {
    return this.validatedPrefixes.resolve(source);
  }

  private effectivePrefixes(source: string | string[]): string[] {
    const base = this.resolvePrefixes(source);
    if (!this.mentionPrefix) return base;
    const botID = this.transport.botID;
    if (!botID || /\s/.test(botID)) return base;
    if (this.lastMentionBase === base && this.lastMentionBotID === botID && this.lastMentionCombined) {
      return this.lastMentionCombined;
    }
    const combined = [...base];
    for (const mention of [`<@!${botID}>`, `<@${botID}>`]) {
      if (!combined.includes(mention)) combined.push(mention);
    }
    combined.sort((a, b) => b.length - a.length);
    this.lastMentionBase = base;
    this.lastMentionBotID = botID;
    this.lastMentionCombined = combined;
    return combined;
  }

  private async resolveDynamicPrefixes(
    message: IncomingMessage,
    resolver: (message: IncomingMessage) => string | string[] | Promise<string | string[]>,
    signal: AbortSignal,
  ): Promise<string[] | undefined> {
    if (!this.dynamicPrefixCache) {
      const configured = await resolver(message);
      if (this.closing || signal.aborted) return undefined;
      return this.resolvePrefixes(configured);
    }
    const cacheKey = prefixCacheKey(message);
    const cached = this.dynamicPrefixCache.get(cacheKey);
    if (cached) return cached;
    const token = this.dynamicPrefixCache.captureToken(cacheKey);
    try {
      const configured = await resolver(message);
      if (this.closing || signal.aborted) return undefined;
      const validated = this.resolvePrefixes(configured);
      this.dynamicPrefixCache.setIfCurrent(token, validated);
      return validated;
    } finally {
      this.dynamicPrefixCache.releaseToken(token);
    }
  }

  private finishRoute(
    routed: { name: string; input: string; prefix: string },
    resolved: ReturnType<CommandRegistry['resolve']>,
    message: IncomingMessage,
    duplicated: boolean,
  ): RoutedCommand | undefined {
    if (duplicated) return undefined;
    if (!resolved) {
      return {
        kind: 'unknown',
        unknown: Object.freeze({
          name: routed.name,
          input: routed.input,
          prefix: routed.prefix,
          message,
          locale: this.messagesRuntime.defaultLocale,
          t: this.messagesRuntime.defaultTranslator,
        }),
      };
    }
    return { kind: 'command', ...resolved, prefix: routed.prefix };
  }

  private resolveRoute(
    message: IncomingMessage,
    configured: string | string[],
  ): RoutedCommand | undefined | Promise<RoutedCommand | undefined> {
    const routed = route(message.content, this.effectivePrefixes(configured));
    if (!routed) return undefined;
    const resolved = this.registry.resolve(routed.name, routed.input);
    if (!resolved && !this.options.hooks?.onUnknownCommand) return undefined;
    const duplicated = this.limits.duplicate(message.channelID, message.id);
    if (typeof duplicated === 'boolean') return this.finishRoute(routed, resolved, message, duplicated);
    if (isPromiseLike(duplicated)) {
      return Promise.resolve(duplicated).then(flag => this.finishRoute(routed, resolved, message, Boolean(flag)));
    }
    return this.finishRoute(routed, resolved, message, Boolean(duplicated));
  }

  private handleMessage(message: IncomingMessage, onFailure?: (error: unknown, ctx?: CommandContext) => void, parentSignal?: AbortSignal, executionID?: string, taskExecution = false): Promise<DispatchResult> {
    if (this.closing || (!this.allowBots && message.authorBot) || message.authorID === this.transport.botID) return ignored;
    let pendingGate: Promise<boolean> | undefined;
    if (!taskExecution && this.options.gate) {
      try {
        const allowed = this.options.gate(message);
        if (isPromiseLike(allowed)) {
          pendingGate = Promise.resolve(allowed);
        } else if (!allowed || this.closing) {
          return ignored;
        }
      } catch (error) {
        const resolvedExecutionID = executionID ?? randomUUID();
        const task = runInExecution(this, {
          executionID: resolvedExecutionID,
          source: 'command',
          guildID: message.guildID,
          channelID: message.channelID,
          userID: message.authorID,
        }, async (): Promise<DispatchResult> => {
          await reportError(this.options, error, undefined, { source: 'hook', event: 'gate', executionID: resolvedExecutionID });
          return 'ignored';
        });
        this.trackActive(task);
        void task.then(() => this.untrackActive(task), () => this.untrackActive(task));
        return task;
      }
    }
    let routed: RoutedCommand | undefined;
    let pendingRoute: Promise<RoutedCommand | undefined> | undefined;
    if (!pendingGate) {
      const prefixes = typeof this.options.prefix !== 'function'
        ? (this.options.prefix ?? '!')
        : this.dynamicPrefixCache?.get(prefixCacheKey(message));
      if (prefixes !== undefined) {
        let candidate: RoutedCommand | undefined | Promise<RoutedCommand | undefined>;
        try { candidate = this.resolveRoute(message, prefixes); }
        catch (error) { return Promise.reject(error); }
        if (!candidate) return ignored;
        if (isPromiseLike(candidate)) pendingRoute = candidate;
        else routed = candidate;
      }
    }
    const signal = parentSignal ? AbortSignal.any([this.shutdown.signal, parentSignal]) : this.shutdown.signal;
    const resolvedExecutionID = executionID ?? randomUUID();
    const source = taskExecution ? 'scheduler' : 'command';
    const run = () => this.dispatch(message, signal, onFailure, resolvedExecutionID, source, routed, pendingRoute, pendingGate);
    const task = routed
      ? run()
      : runInExecution(this, {
        executionID: resolvedExecutionID,
        source,
        guildID: message.guildID,
        channelID: message.channelID,
        userID: message.authorID,
      }, run);
    this.trackActive(task);
    void task.then(() => this.untrackActive(task), () => this.untrackActive(task));
    return task;
  }

  private async runUnknownCommand(info: UnknownCommandContext, message: IncomingMessage, signal: AbortSignal): Promise<void> {
    const hook = this.options.hooks?.onUnknownCommand;
    if (!hook || this.closing || signal.aborted) return;
    let activeInfo = info;
    if (typeof this.options.locale === 'function') {
      try {
        const resolvedLocale = this.messagesRuntime.resolve(await this.options.locale(info));
        activeInfo = Object.freeze({ ...info, locale: resolvedLocale.locale, t: resolvedLocale.translator });
      } catch (error) {
        await reportError(this.options, error, undefined, { source: 'hook', event: 'onUnknownCommand' });
        return;
      }
      if (this.closing || signal.aborted) return;
    }
    let reply: Payload | string | null | void;
    try { reply = await hook(activeInfo); }
    catch (error) { await reportError(this.options, error, undefined, { source: 'hook', event: 'onUnknownCommand' }); return; }
    if (signal.aborted || reply === undefined || reply === null) return;
    try { await this.transport.reply(message, typeof reply === 'string' ? { content: reply } : reply); }
    catch (replyError) { await reportError(this.options, replyError, undefined, { source: 'hook', event: 'onUnknownCommand' }); }
  }

  private async dispatch(
    message: IncomingMessage,
    signal: AbortSignal,
    onFailure: ((error: unknown, ctx?: CommandContext) => void) | undefined,
    executionID: string,
    source: 'command' | 'scheduler',
    resolved?: RoutedCommand,
    pendingRoute?: Promise<RoutedCommand | undefined>,
    pendingGate?: Promise<boolean>,
  ): Promise<DispatchResult> {
    if (pendingGate) {
      let allowed: boolean;
      try {
        allowed = Boolean(await pendingGate);
      } catch (error) {
        await reportError(this.options, error, undefined, { source: 'hook', event: 'gate', executionID });
        return 'ignored';
      }
      if (!allowed || this.closing || signal.aborted) return 'ignored';
    }
    if (!resolved) {
      if (pendingRoute) {
        resolved = await pendingRoute;
        if (this.closing || signal.aborted) return 'ignored';
      } else {
        const prefixes = typeof this.options.prefix === 'function'
          ? await this.resolveDynamicPrefixes(message, this.options.prefix, signal)
          : this.resolvePrefixes(this.options.prefix ?? '!');
        if (!prefixes || this.closing || signal.aborted) return 'ignored';
        const candidate = this.resolveRoute(message, prefixes);
        resolved = isPromiseLike(candidate) ? await candidate : candidate;
        if (this.closing || signal.aborted) return 'ignored';
      }
    }
    if (!resolved) return 'ignored';
    if (resolved.kind === 'unknown') {
      const unknown = resolved.unknown;
      await runInExecution(this, {
        executionID,
        source,
        command: unknown.name,
        guildID: message.guildID,
        channelID: message.channelID,
        userID: message.authorID,
      }, () => this.runUnknownCommand(unknown, message, signal));
      return 'ignored';
    }
    const { compiled, prefix } = resolved;
    return runInExecution(this, {
      executionID,
      source,
      command: compiled.command.name,
      guildID: message.guildID,
      channelID: message.channelID,
      userID: message.authorID,
    }, async () => {
      let releaseSlot: (() => void) | undefined;
      try {
        if (this.concurrencyLimiter) {
          const acquired = await this.concurrencyLimiter.acquire(message.guildID, signal);
          if (!acquired) {
            if (!this.closing && !signal.aborted) {
              emitMetric(this.options.metrics, m => m.onDispatchDropped?.({
                reason: 'concurrency',
                ...(message.guildID ? { guildID: message.guildID } : {}),
              }));
              if (this.hasLogSink) {
                await emitLog(this.options, {
                  event: 'dispatch.dropped',
                  reason: 'concurrency',
                  guildID: message.guildID,
                  channelID: message.channelID,
                });
              }
            }
            return 'ignored';
          }
          releaseSlot = acquired;
          if (this.closing || signal.aborted) return 'ignored';
        }
        let ctx: CommandContext | undefined;
        let activeLocale = this.messagesRuntime.defaultLocale;
        let activeTranslator = this.messagesRuntime.defaultTranslator;
        let outcome: 'success' | 'guarded' | 'error' = 'success';
        const needsTiming = this.hasLogSink || Boolean(this.options.metrics);
        const started = needsTiming ? performance.now() : 0;
        try {
          const baseContextOptions: ContextOptions = { message, transport: this.transport, store: this.store, command: compiled.command,
            flagLookup: compiled.flagLookup, argumentTypes: this.customArgumentTypes,
            input: resolved.input, prefix, lineage: compiled.lineage,
            help: this.contextHelp, cooldown: this.contextCooldown,
            native: { client: this.client, message: message.raw instanceof Message ? message.raw : undefined },
            shard: this.shard,
            resources: this.resources, resourcesInjected: this.resourcesInjected,
            scheduler: this.scheduler, http: this.http, music: this.music, voice: this.voice, voiceStates: this.voiceStates,
            canvas: this.canvasContext, now: this.options.now, signal, executionID,
            cdn: this.cdnService, disableResourceAuthorization: this.options.unsafeDisableResourceAuthorization === true, emoji: this.emojiMap,
            deleteLater: this.contextDeleteLater, isOwner: this.contextIsOwner, isDevGuild: this.contextIsDevGuild,
            services: this.services, locale: activeLocale, translator: activeTranslator };
          if (typeof this.options.locale === 'function') {
            const probe = createLocaleProbeContext(baseContextOptions);
            const dynamicLocale = await this.options.locale(probe);
            if (this.closing || signal.aborted) throw cancellationError();
            const resolvedLocale = this.messagesRuntime.resolve(dynamicLocale);
            activeLocale = resolvedLocale.locale;
            activeTranslator = resolvedLocale.translator;
          }
          ctx = new CommandContext({ ...baseContextOptions, locale: activeLocale, translator: activeTranslator,
            help: (cmd, pfx = '') => this.registry.help(cmd, pfx, activeTranslator, this.options.helpRenderer) });
          if (this.hasLogSink) await emitLog(this.options, { event: 'command.start', executionID: ctx.executionID, command: ctx.command.name });
          if (signal.aborted) throw cancellationError();
          if (this.options.context) {
            await this.options.context(ctx);
            if (signal.aborted) throw cancellationError();
          }
          await ctx.prepare();
          const current = ctx;
          for (const check of compiled.command.checks ?? []) {
            const result = await check(current);
            if (result === false || typeof result === 'string') {
              throw new GuardError(typeof result === 'string' ? result : current.t('checkFailed'), 'CHECK_FAILED');
            }
          }
          const execute = async () => {
            if (compiled.program) {
              const programEngine = (compiled as { programEngine?: ScriptEngine }).programEngine ?? this.scriptEngine!;
              const output = programEngine.text(await programEngine.execute(compiled.program, current)).trim();
              if (output) await current.reply(output);
            } else if (compiled.command.run) await compiled.command.run(current);
            else {
              throw new GuardError(
                `${resolved.input ? `${current.t('unknownSubcommand')}\n` : ''}${current.help(compiled.command.name, prefix)}`,
                'INVALID_ARGUMENT',
              );
            }
          };
          const local = compiled.command.middleware ?? [];
          if (this.middleware.length) await runMiddleware(local.length ? [...this.middleware, ...local] : this.middleware, current, execute);
          else if (local.length) await runMiddleware(local, current, execute);
          else await execute();
        } catch (error) {
          onFailure?.(error, ctx);
          outcome = error instanceof GuardError ? 'guarded' : 'error';
          if (!signal.aborted) {
            const reply = await resolveErrorReply(this.options, error, ctx, activeTranslator);
            if (reply !== null && !signal.aborted) {
              try {
                await (ctx ? ctx.reply(reply) : this.transport.reply(message, typeof reply === 'string' ? { content: reply } : reply));
              } catch (replyError) {
                await reportError(this.options, replyError, ctx, { source: 'command' });
              }
            }
          }
          if (!(error instanceof GuardError)) await reportError(this.options, error, ctx, { source: 'command' });
        }
        if (ctx && this.options.onCommand) {
          try { await this.options.onCommand(ctx, outcome); }
          catch (error) { await reportError(this.options, error, ctx, { source: 'command' }); }
        }
        const durationMs = needsTiming ? Math.max(0, performance.now() - started) : 0;
        const commandName = ctx?.command.name ?? compiled.command.name;
        emitMetric(this.options.metrics, m => m.onCommand?.({
          command: commandName,
          outcome,
          durationMs,
        }));
        if (ctx && this.hasLogSink) await emitLog(this.options, { event: 'command.finish', executionID: ctx.executionID,
          command: ctx.command.name, outcome, durationMs });
        return outcome;
      } finally {
        releaseSlot?.();
      }
    });
  }
}

export { Yuzuha as Bot };
