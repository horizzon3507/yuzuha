import { randomUUID } from 'node:crypto';
import { setMaxListeners } from 'node:events';
import { Client, Events, Message } from '@fluxerjs/core';
import type { ClientEventName, ClientEvents } from '@fluxerjs/core';
import { FluxerTransport, MemberCache, incoming } from '../adapter.js';
import { FluxerResources } from '../infrastructure/fluxer/resources.js';
import type { Resources } from '../ports/resources.js';
import { CommandContext } from '../context.js';
import type { Command, ContextOptions } from '../context.js';
import { defineCommand } from '../commands/definition.js';
import type { NativeCommandDefinition } from '../commands/definition.js';
import type { ArgumentSchema } from '../commands/builders.js';
import type { IncomingMessage, Payload, Store, Transport } from '../contracts.js';
import { ConfigError, GuardError, PartialModerationError, YuzuhaError } from '../errors.js';
import { JsonStore, defaultDataPath } from '../store.js';
import { CommandRegistry, functionsRequired } from './command-registry.js';
import type { CompiledCommand } from './command-registry.js';
import { runMiddleware } from './middleware.js';
import type { DispatchResult, Middleware, UnknownCommandContext, YuzuhaOptions, YuzuhaPlugin } from './options.js';
import { RateLimits, resolveRateLimitOptions } from './rate-limits.js';
import { ConcurrencyLimiter } from './concurrency.js';
import { reportError, resolveErrorReply } from './reporting.js';
import { route } from './routing.js';
import { DynamicPrefixCache, ValidatedPrefixCache, prefixCacheKey, validatePrefixCacheOptions } from './prefix-cache.js';
import { defineEvent, NativeEvents } from './events.js';
import type { ContextEventDefinition, NativeEvent, NativeListener } from './events.js';
import { ScheduleExecutionError, Scheduler } from '../services/scheduler.js';
import { StateMaintenance } from '../services/state-maintenance.js';
import type { CleanupResult } from '../services/state-maintenance.js';
import type { ScheduleRecord } from '../domain/state.js';
import { HttpService } from '../services/http.js';
import { createCdn } from '../domain/cdn.js';
import { emitLog } from './logging.js';
import { currentExecution, isExecutionOwner, runInExecution } from './execution.js';
import { cancellationError } from '../services/cancellation.js';
import { resolvePolicy } from '../services/retry.js';
import { EventContext } from '../commands/event-context.js';
import { adaptScriptEvent, scriptEventNames, validateScriptEvent } from './script-events.js';
import type { ScriptEventDefinition } from './script-events.js';
import type { ScriptEngine } from '../ports/script-engine.js';
import type { MusicManager } from '../services/music.js';
import type { NativeVoice } from '../ports/voice.js';
import { canvasRenderer } from '../infrastructure/canvas/render.js';

type RoutedCommand = { kind: 'command'; compiled: CompiledCommand; input: string; prefix: string }
  | { kind: 'unknown'; unknown: UnknownCommandContext };
const ignored: Promise<DispatchResult> = Promise.resolve('ignored');

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

export class Yuzuha {
  readonly client: Client;
  readonly transport: Transport;
  readonly store: Store;
  readonly resources: Resources;
  readonly scheduler?: Scheduler;
  readonly http?: HttpService;
  readonly music?: MusicManager;
  readonly voice?: NativeVoice;
  private scriptEngine?: ScriptEngine;
  private readonly registry: CommandRegistry;
  private readonly middleware: Middleware[] = [];
  private readonly plugins = new Set<string>();
  private readonly limits: RateLimits;
  private lastRateLimitEvictLog?: number;
  private readonly active = new Set<Promise<unknown>>();
  private readonly shutdown = new AbortController();
  private reliability: import('../services/retry.js').Reliability = {};
  private timers: NonNullable<YuzuhaOptions['timers']> = { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: () => {} };
  private readonly pendingTimers = new Set<unknown>();
  private cdnService: import('../domain/cdn.js').Cdn = createCdn();
  private readonly emojiMap: Record<string, string>;
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
  private listening = false;
  private closing = false;
  private closeTask?: Promise<void>;
  private loginTask?: Promise<void>;
  private loginAbort?: AbortController;
  private readonly listener: (message: Message) => void;
  private readonly gatewayErrors = new WeakSet<Error>();
  private readonly gatewayReports = new Set<Promise<void>>();
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
  private readonly validatedPrefixes = new ValidatedPrefixCache();
  private readonly dynamicPrefixCache?: DynamicPrefixCache;
  private readonly contextCooldown = (key: string, duration: number) => this.limits.cooldown(key, duration);
  private readonly contextHelp = () => this.help();
  private readonly contextDeleteLater = (channelID: string, messageID: string, ttlMs: number) => this.deleteLater(channelID, messageID, ttlMs);
  private readonly canvasContext: ContextOptions['canvas'];

  private get hasLogSink(): boolean { return Boolean(this.options.onLog || this.options.logger); }

  constructor(public readonly options: YuzuhaOptions = {}) {
    setMaxListeners(0, this.shutdown.signal);
    assertLogger(options.logger);
    if (options.errorReply !== undefined && typeof options.errorReply !== 'function') {
      throw new ConfigError('OPTIONS', 'errorReply deve ser uma função.');
    }
    validateHooks(options.hooks);
    const rateLimitOptions = resolveRateLimitOptions(options.rateLimits);
    this.limits = new RateLimits({
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
    this.client = options.client ?? new Client(options.clientOptions);
    this.reliability = { retry: retryPolicy, signal: this.shutdown.signal,
      onRetry: (attempt, _error, delayMs) => {
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
    this.transport = options.transport ?? new FluxerTransport(this.client, this.reliability, this.memberCache);
    if (this.memberCache && !options.transport && this.transport instanceof FluxerTransport) {
      this.detachMemberCache = this.transport.attachCacheInvalidation(this.client);
    }
    this.resources = options.resources ?? new FluxerResources(this.client, this.cdnService, this.reliability);
    this.cdnService = createCdn(options.cdn?.mediaBase);
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
    if (options.unsafeDisableResourceAuthorization && this.hasLogSink)
      void emitLog(this.options, { event: 'authorization.disabled' });
    this.timers = options.timers ?? { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms).unref(), clearTimeout: (handle: unknown) => clearTimeout(handle as never) };
    this.store = options.store ?? new JsonStore(defaultDataPath(options.name));
    this.maintenance = new StateMaintenance(this.store, options.now);
    this.scheduler = options.scheduler === false ? undefined : options.scheduler ?? new Scheduler(this.store,
      (task, signal) => this.runScheduled(task, signal), {
        now: options.now,
        timers: this.timers,
        onEvent: event => {
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
    if (options.engine !== undefined) this.scriptEngine = assertEngine(options.engine);
    this.registry = new CommandRegistry(() => this.scriptEngine, command => {
      if (command.http) (this.http ?? new HttpService()).withPolicy(command.http);
    });
    this.events = new NativeEvents(this.client, (work, event) => this.scheduleEvent(work, event));
    if (typeof options.prefix !== 'function') this.resolvePrefixes(options.prefix ?? '!');
    this.listener = message => {
      if (this.closing || message.author.bot || message.author.id === this.transport.botID) return;
      if (typeof this.options.prefix !== 'function') {
        let prefixes: string[];
        try { prefixes = this.resolvePrefixes(this.options.prefix ?? '!'); }
        catch (error) { void reportError(this.options, error, undefined, { source: 'event', event: 'messageCreate' }); return; }
        if (!prefixes.some(prefix => message.content.startsWith(prefix))) return;
      }
      void this.handle(incoming(message)).catch(error => reportError(this.options, error, undefined, { source: 'event', event: 'messageCreate' }));
    };
    this.client.on(Events.Error, this.errorListener);
    this.client.on(Events.ShardError, this.shardErrorListener);
  }

  /** Engine de function mode instalado, quando presente. */
  get engine(): ScriptEngine | undefined { return this.scriptEngine; }

  /** Mapa nome → emoji compartilhado com `ctx.emoji`; mutações são visíveis imediatamente. */
  get emoji(): Record<string, string> { return this.emojiMap; }

  /** Instala o motor de function mode; exigido por comandos com `code` e eventos de script. */
  useEngine(engine: ScriptEngine): this {
    if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
    if (this.scriptEngine) throw new YuzuhaError('ENGINE_INSTALLED', 'O bot já tem um engine de function mode.');
    this.scriptEngine = assertEngine(engine);
    return this;
  }

  use(middleware: Middleware): this {
    if (typeof middleware !== 'function') throw new YuzuhaError('MIDDLEWARE', 'Middleware deve ser uma função.');
    this.middleware.push(middleware); return this;
  }
  plugin(plugin: YuzuhaPlugin): this {
    if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
    if (!plugin.name || this.plugins.has(plugin.name)) throw new YuzuhaError('PLUGIN_DUPLICATE', 'Plugin sem nome ou já instalado.');
    if ((plugin.middleware ?? []).some(item => typeof item !== 'function')) throw new YuzuhaError('PLUGIN_MIDDLEWARE', 'Middleware de plugin inválido.');
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
    const scriptEvents = (plugin.scriptEvents ?? []).map(event => this.prepareScriptEvent(event, stagedEngine));
    this.scriptEngine?.registerAll(plugin.functions ?? []);
    commitCommands();
    this.middleware.push(...(plugin.middleware ?? []));
    for (const event of plugin.events ?? []) this.events.add(event);
    for (const event of scriptEvents) this.events.add(event);
    this.plugins.add(plugin.name);
    return this;
  }

  command<const S extends ArgumentSchema = {}, const F extends ArgumentSchema = {}>(command: NativeCommandDefinition<S, F>): this;
  command(command: Command): this;
  command(command: Command | NativeCommandDefinition<ArgumentSchema, ArgumentSchema>): this {
    this.registry.add(defineCommand(command as NativeCommandDefinition<ArgumentSchema, ArgumentSchema>));
    return this;
  }
  load(directory: string, replace = true): Promise<void> { return this.registry.load(directory, replace ? 'replace' : 'append'); }
  reload(directory: string): Promise<void> { return this.registry.load(directory, 'reload'); }
  listCommands(): Command[] { return this.registry.list(); }
  help(command?: string, prefix = ''): string { return this.registry.help(command, prefix); }
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
    this.active.add(tracked);
    try {
      const result = await work;
      this.sweepCursor = result.cursor;
      return result;
    } finally {
      this.active.delete(tracked);
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

  isReady(): boolean { return this.client.isReady(); }
  get uptime(): number | null { return this.client.uptime; }
  assertReady(): void {
    try { this.client.assertReady(); }
    catch { throw new YuzuhaError('BOT_NOT_READY', 'O bot ainda não está pronto.'); }
  }

  on<K extends ClientEventName>(event: K, listener: NativeListener<K>): this {
    this.events.add(defineEvent({ event, run: listener }), listener); return this;
  }
  once<K extends ClientEventName>(event: K, listener: NativeListener<K>): this {
    this.events.add(defineEvent({ event, once: true, run: listener }), listener); return this;
  }
  off<K extends ClientEventName>(event: K, listener: NativeListener<K>): this {
    this.events.off(event, listener); return this;
  }
  event(event: NativeEvent): this { this.events.add(event); return this; }

  contextEvent<K extends import('../domain/events.js').ScriptEventName>(definition: ContextEventDefinition<K>): this {
    if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
    if (!scriptEventNames.includes(definition.event) || typeof definition.run !== 'function' || (definition.once !== undefined && typeof definition.once !== 'boolean')
      || (definition.ignoreBots !== undefined && typeof definition.ignoreBots !== 'boolean')
      || [definition.channelID, definition.actorID].some(id => id !== undefined && (typeof id !== 'string' || !/^\d+$/.test(id)))) {
      throw new YuzuhaError('EVENT', 'Evento com contexto ou opções inválidos.');
    }
    if (definition.http) (this.http ?? new HttpService()).withPolicy(definition.http);
    this.events.add({ event: definition.event, once: definition.once ?? false, invoke: async (args: unknown[]) => {
      const source = adaptScriptEvent(definition.event, args);
      if ((definition.ignoreBots ?? true) && source.event.userBot) return;
      const ctx = new EventContext({ ...source, channelID: definition.channelID, actorID: definition.actorID,
        policy: definition.http, transport: this.transport, store: this.store, resources: this.resources,
        scheduler: this.scheduler, http: this.http, music: this.music, voice: this.voice,
        canvas: this.canvasContext, now: this.options.now,
        cdn: this.cdnService, disableResourceAuthorization: this.options.unsafeDisableResourceAuthorization === true,
        cooldown: this.contextCooldown, signal: this.shutdown.signal, emoji: this.emojiMap,
        deleteLater: this.contextDeleteLater });
      await runInExecution(this, {
        executionID: ctx.executionID,
        source: 'event',
        event: definition.event,
        guildID: ctx.guildID || undefined,
        channelID: ctx.channelID || undefined,
        userID: ctx.authorID || undefined,
      }, async () => {
        try { await definition.run(ctx, ...args as ClientEvents[K]); }
        catch (error) { await reportError(this.options, error, ctx, { source: 'event', event: definition.event, executionID: ctx.executionID }); }
      });
    } });
    return this;
  }

  scriptEvent(definition: ScriptEventDefinition): this {
    if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
    if (!this.scriptEngine) throw functionsRequired();
    this.events.add(this.prepareScriptEvent(definition));
    return this;
  }
  private prepareScriptEvent(definition: ScriptEventDefinition, engine = this.scriptEngine): NativeEvent {
    if (!engine) throw functionsRequired();
    validateScriptEvent(definition);
    const options = structuredClone(definition);
    if (options.http) (this.http ?? new HttpService()).withPolicy(options.http);
    const program = engine.compile(options.code, `<event:${options.event}>`);
    return { event: options.event, once: options.once ?? false, invoke: args => this.runScriptEvent(options, program, args, engine) };
  }
  private async runScriptEvent(definition: ScriptEventDefinition, program: unknown, args: unknown[], engine: ScriptEngine): Promise<void> {
    const source = adaptScriptEvent(definition.event, args);
    if ((definition.ignoreBots ?? true) && source.event.userBot) return;
    const signal = this.shutdown.signal;
    const ctx = new EventContext({ ...source, channelID: definition.channelID, actorID: definition.actorID,
      policy: definition.http, transport: this.transport, store: this.store, resources: this.resources,
      scheduler: this.scheduler, http: this.http, music: this.music, voice: this.voice,
      canvas: this.canvasContext, now: this.options.now, cooldown: this.contextCooldown, signal,
      cdn: this.cdnService, disableResourceAuthorization: this.options.unsafeDisableResourceAuthorization === true, emoji: this.emojiMap,
      deleteLater: this.contextDeleteLater });
    await runInExecution(this, {
      executionID: ctx.executionID,
      source: 'event',
      event: definition.event,
      guildID: ctx.guildID || undefined,
      channelID: ctx.channelID || undefined,
      userID: ctx.authorID || undefined,
    }, async () => {
      const started = this.hasLogSink ? performance.now() : 0;
      let outcome: DispatchResult = 'success';
      try {
        if (this.hasLogSink) await emitLog(this.options, { event: 'event.start', executionID: ctx.executionID, command: ctx.command.name });
        const output = engine.text(await engine.execute(program, ctx)).trim();
        if (output) {
          if (!ctx.channelID) throw new GuardError('Defina um canal para a saída deste evento.', 'INVALID_ARGUMENT');
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
    this.active.add(task);
    void task.then(() => this.active.delete(task), () => this.active.delete(task));
  }

  private async runScheduled(task: ScheduleRecord, signal: AbortSignal): Promise<void> {
    if (this.closing || signal.aborted) throw cancellationError();
    const executionID = task.claimID ?? randomUUID();
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
      if (!prefixes) throw cancellationError();
      const prefix = prefixes[0] ?? '!';
      const suffix = task.input ? ` ${task.input}` : '';
      let retryable = true, cause: unknown;
      const outcome = await this.handleMessage({ id: `schedule-${task.id}-${task.claimID ?? Date.now()}`, content: `${prefix}${task.command}${suffix}`,
        authorID: task.authorID, authorName: 'Scheduler', authorBot: false,
        channelID: task.channelID, guildID: task.guildID, mentions: [] }, (error, ctx) => {
        cause = error; retryable = !(error instanceof GuardError || error instanceof PartialModerationError) && !ctx?.hasModerationEffect;
      }, signal, executionID, true);
      if (outcome !== 'success') throw new ScheduleExecutionError(outcome === 'error' && retryable, cause);
    });
  }

  login(token = process.env.FLUXER_BOT_TOKEN): Promise<void> {
    if (this.closing) return Promise.reject(new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.'));
    if (!token?.trim()) return Promise.reject(new ConfigError('TOKEN_MISSING', 'Defina FLUXER_BOT_TOKEN.'));
    if (this.loginTask) return this.loginTask;
    if (this.memberCache && !this.detachMemberCache && !this.options.transport && this.transport instanceof FluxerTransport) {
      this.detachMemberCache = this.transport.attachCacheInvalidation(this.client);
    }
    this.scheduler?.start();
    this.startVariableSweep();
    this.client.on(Events.MessageCreate, this.listener);
    this.listening = true;
    this.loginAbort = new AbortController();
    const task = this.client.login(token, { signal: this.loginAbort.signal }).then(() => {
      if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot foi encerrado durante o login.');
    }).catch(async error => {
      this.client.off(Events.MessageCreate, this.listener); this.listening = false;
      this.scheduler?.stop();
      await this.scheduler?.drain();
      await this.stopVariableSweep();
      const needsErrorListener = !this.client.listeners(Events.Error).includes(this.errorListener);
      const needsShardListener = !this.client.listeners(Events.ShardError).includes(this.shardErrorListener);
      if (needsErrorListener) this.client.on(Events.Error, this.errorListener);
      if (needsShardListener) this.client.on(Events.ShardError, this.shardErrorListener);
      for (const handle of this.pendingTimers) this.timers.clearTimeout(handle);
      this.pendingTimers.clear();
      try { await this.client.destroy(); }
      finally {
        if (needsErrorListener) this.client.off(Events.Error, this.errorListener);
        if (needsShardListener) this.client.off(Events.ShardError, this.shardErrorListener);
        this.detachMemberCache?.();
        this.detachMemberCache = undefined;
        this.memberCache?.clear();
        await Promise.allSettled([...this.gatewayReports]);
      }
      throw error;
    });
    this.loginTask = task;
    void task.catch(() => { if (this.loginTask === task) this.loginTask = undefined; });
    return task;
  }

  destroy(): Promise<void> {
    if (this.closeTask) return isExecutionOwner(this) ? Promise.resolve() : this.closeTask;
    this.closing = true;
    this.shutdown.abort();
    this.loginAbort?.abort();
    this.scheduler?.stop();
    this.clearVariableSweepTimer();
    this.concurrencyLimiter?.close();
    this.dynamicPrefixCache?.close();
    this.events.close();
    if (this.listening) this.client.off(Events.MessageCreate, this.listener);
    this.listening = false;
    this.closeTask = (async () => {
      await Promise.allSettled([...this.active]);
      await this.scheduler?.drain();
      await Promise.allSettled(this.sweepTask ? [this.sweepTask] : []);
      try {
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
          this.detachMemberCache?.();
          this.detachMemberCache = undefined;
          this.memberCache?.clear();
          await Promise.allSettled([...this.gatewayReports]);
          if (!this.options.store) await this.store.close?.();
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

  private resolveRoute(message: IncomingMessage, configured: string | string[]): RoutedCommand | undefined {
    const routed = route(message.content, this.resolvePrefixes(configured));
    if (!routed) return;
    const resolved = this.registry.resolve(routed.name, routed.input);
    if (!resolved) {
      if (!this.options.hooks?.onUnknownCommand || this.limits.duplicate(message.channelID, message.id)) return;
      return { kind: 'unknown', unknown: Object.freeze({ name: routed.name, input: routed.input, prefix: routed.prefix, message }) };
    }
    if (this.limits.duplicate(message.channelID, message.id)) return;
    return { kind: 'command', ...resolved, prefix: routed.prefix };
  }

  private handleMessage(message: IncomingMessage, onFailure?: (error: unknown, ctx?: CommandContext) => void, parentSignal?: AbortSignal, executionID?: string, taskExecution = false): Promise<DispatchResult> {
    if (this.closing || message.authorBot || message.authorID === this.transport.botID) return ignored;
    let routed: RoutedCommand | undefined;
    if (typeof this.options.prefix !== 'function') {
      try { routed = this.resolveRoute(message, this.options.prefix ?? '!'); }
      catch (error) { return Promise.reject(error); }
      if (!routed) return ignored;
    } else if (this.dynamicPrefixCache) {
      const cached = this.dynamicPrefixCache.get(prefixCacheKey(message));
      if (cached) {
        routed = this.resolveRoute(message, cached);
        if (!routed) return ignored;
      }
    }
    const signal = parentSignal ? AbortSignal.any([this.shutdown.signal, parentSignal]) : this.shutdown.signal;
    const resolvedExecutionID = executionID ?? randomUUID();
    const source = taskExecution ? 'scheduler' : 'command';
    const run = () => this.dispatch(message, signal, onFailure, resolvedExecutionID, source, routed);
    const task = routed
      ? run()
      : runInExecution(this, {
        executionID: resolvedExecutionID,
        source,
        guildID: message.guildID,
        channelID: message.channelID,
        userID: message.authorID,
      }, run);
    this.active.add(task);
    void task.then(() => this.active.delete(task), () => this.active.delete(task));
    return task;
  }

  private async runUnknownCommand(info: UnknownCommandContext, message: IncomingMessage, signal: AbortSignal): Promise<void> {
    const hook = this.options.hooks?.onUnknownCommand;
    if (!hook || this.closing || signal.aborted) return;
    let reply: Payload | string | null | void;
    try { reply = await hook(info); }
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
  ): Promise<DispatchResult> {
    if (!resolved) {
      const prefixes = typeof this.options.prefix === 'function'
        ? await this.resolveDynamicPrefixes(message, this.options.prefix, signal)
        : this.resolvePrefixes(this.options.prefix ?? '!');
      if (!prefixes || this.closing || signal.aborted) return 'ignored';
      resolved = this.resolveRoute(message, prefixes);
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
            if (!this.closing && !signal.aborted && this.hasLogSink) {
              await emitLog(this.options, {
                event: 'dispatch.dropped',
                reason: 'concurrency',
                guildID: message.guildID,
                channelID: message.channelID,
              });
            }
            return 'ignored';
          }
          releaseSlot = acquired;
          if (this.closing || signal.aborted) return 'ignored';
        }
        let ctx: CommandContext | undefined;
        let outcome: DispatchResult = 'success';
        const started = this.hasLogSink ? performance.now() : 0;
        try {
          ctx = new CommandContext({ message, transport: this.transport, store: this.store, command: compiled.command,
            flagLookup: compiled.flagLookup, input: resolved.input, prefix, lineage: compiled.lineage,
            help: this.contextHelp, cooldown: this.contextCooldown,
            native: { client: this.client, message: message.raw instanceof Message ? message.raw : undefined },
            resources: this.resources, scheduler: this.scheduler, http: this.http, music: this.music, voice: this.voice,
            canvas: this.canvasContext, now: this.options.now, signal, executionID,
            cdn: this.cdnService, disableResourceAuthorization: this.options.unsafeDisableResourceAuthorization === true, emoji: this.emojiMap,
            deleteLater: this.contextDeleteLater });
          if (this.hasLogSink) await emitLog(this.options, { event: 'command.start', executionID: ctx.executionID, command: ctx.command.name });
          if (signal.aborted) throw cancellationError();
          await ctx.prepare();
          const current = ctx;
          for (const check of compiled.command.checks ?? []) {
            const result = await check(current);
            if (result === false || typeof result === 'string') throw new GuardError(typeof result === 'string' ? result : 'Você não pode executar este comando.', 'CHECK_FAILED');
          }
          const execute = async () => {
            if (compiled.program) {
              const programEngine = (compiled as { programEngine?: ScriptEngine }).programEngine ?? this.scriptEngine!;
              const output = programEngine.text(await programEngine.execute(compiled.program, current)).trim();
              if (output) await current.reply(output);
            } else if (compiled.command.run) await compiled.command.run(current);
            else throw new GuardError(`${resolved.input ? 'Subcomando desconhecido.\n' : ''}${this.help(compiled.command.name, prefix)}`, 'INVALID_ARGUMENT');
          };
          const local = compiled.command.middleware ?? [];
          if (this.middleware.length) await runMiddleware(local.length ? [...this.middleware, ...local] : this.middleware, current, execute);
          else if (local.length) await runMiddleware(local, current, execute);
          else await execute();
        } catch (error) {
          onFailure?.(error, ctx);
          outcome = error instanceof GuardError ? 'guarded' : 'error';
          if (!signal.aborted) {
            const reply = await resolveErrorReply(this.options, error, ctx);
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
        if (ctx && this.hasLogSink) await emitLog(this.options, { event: 'command.finish', executionID: ctx.executionID,
          command: ctx.command.name, outcome, durationMs: performance.now() - started });
        return outcome;
      } finally {
        releaseSlot?.();
      }
    });
  }
}

export { Yuzuha as Bot };
