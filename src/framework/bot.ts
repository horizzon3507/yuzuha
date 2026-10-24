import { AsyncLocalStorage } from 'node:async_hooks';
import { setMaxListeners } from 'node:events';
import { Client, Events, Message } from '@fluxerjs/core';
import type { ClientEventName } from '@fluxerjs/core';
import { FluxerTransport, incoming } from '../adapter.js';
import { FluxerResources } from '../infrastructure/fluxer/resources.js';
import type { Resources } from '../ports/resources.js';
import { CommandContext } from '../context.js';
import type { Command } from '../context.js';
import { defineCommand } from '../commands/definition.js';
import type { NativeCommandDefinition } from '../commands/definition.js';
import type { ArgumentSchema } from '../commands/builders.js';
import type { IncomingMessage, Store, Transport } from '../contracts.js';
import { GuardError, PartialModerationError, YuzuhaError } from '../errors.js';
import { registerBuiltins } from '../functions.js';
import { Runtime, defaultLimits, text } from '../runtime.js';
import { JsonStore, defaultDataPath } from '../store.js';
import { CommandRegistry } from './command-registry.js';
import type { CompiledCommand } from './command-registry.js';
import { runMiddleware } from './middleware.js';
import type { DispatchResult, Middleware, YuzuhaOptions, YuzuhaPlugin } from './options.js';
import { RateLimits } from './rate-limits.js';
import { reportError, userError } from './reporting.js';
import { route, validatePrefixes } from './routing.js';
import { defineEvent, NativeEvents } from './events.js';
import type { NativeEvent, NativeListener } from './events.js';
import { ScheduleExecutionError, Scheduler } from '../services/scheduler.js';
import type { ScheduleRecord } from '../domain/state.js';
import { HttpService } from '../services/http.js';
import { emitLog } from './logging.js';
import { cancellationError } from '../services/cancellation.js';
import { EventContext } from '../commands/event-context.js';
import { adaptScriptEvent, validateScriptEvent } from './script-events.js';
import type { ScriptEventDefinition } from './script-events.js';
import type { Program } from '../scripting/ast.js';
import type { MusicManager } from '../services/music.js';
import type { NativeVoice } from '../ports/voice.js';

type RoutedCommand = { compiled: CompiledCommand; input: string; prefix: string };
const ignored: Promise<DispatchResult> = Promise.resolve('ignored');

export class Yuzuha {
  readonly client: Client;
  readonly transport: Transport;
  readonly store: Store;
  readonly resources: Resources;
  readonly scheduler?: Scheduler;
  readonly http?: HttpService;
  readonly music?: MusicManager;
  readonly voice?: NativeVoice;
  readonly runtime: Runtime;
  private readonly registry: CommandRegistry;
  private readonly middleware: Middleware[] = [];
  private readonly plugins = new Set<string>();
  private readonly limits: RateLimits;
  private readonly active = new Set<Promise<unknown>>();
  private readonly shutdown = new AbortController();
  private readonly events: NativeEvents;
  private readonly execution = new AsyncLocalStorage<boolean>();
  private listening = false;
  private functionsReady = false;
  private closing = false;
  private closeTask?: Promise<void>;
  private loginTask?: Promise<void>;
  private loginAbort?: AbortController;
  private readonly listener: (message: Message) => void;
  private readonly gatewayErrors = new WeakSet<Error>();
  private readonly gatewayReports = new Set<Promise<void>>();
  private readonly errorListener = (error: Error): void => {
    if (this.gatewayErrors.delete(error)) return;
    this.reportGatewayError(error);
  };
  private readonly shardErrorListener = (_shardID: number, error: Error): void => {
    // The SDK emits shardError followed synchronously by error for the same failure.
    this.gatewayErrors.add(error);
    queueMicrotask(() => this.gatewayErrors.delete(error));
    this.reportGatewayError(error);
  };
  private reportGatewayError(error: Error): void {
    const task = this.execution.run(true, () => reportError(this.options, error));
    this.gatewayReports.add(task);
    void task.then(() => this.gatewayReports.delete(task), () => this.gatewayReports.delete(task));
  }
  private prefixSource?: string | string[];
  private prefixes: string[] = [];
  private readonly contextCooldown = (key: string, duration: number) => this.limits.cooldown(key, duration);
  private readonly contextHelp = () => this.help();

  constructor(public readonly options: YuzuhaOptions = {}) {
    setMaxListeners(0, this.shutdown.signal);
    this.limits = new RateLimits(options.now);
    this.client = options.client ?? new Client(options.clientOptions);
    this.transport = options.transport ?? new FluxerTransport(this.client);
    this.resources = options.resources ?? new FluxerResources(this.client);
    this.store = options.store ?? new JsonStore(defaultDataPath(options.name));
    this.scheduler = options.scheduler === false ? undefined : options.scheduler ?? new Scheduler(this.store,
      (task, signal) => this.runScheduled(task, signal), {
        now: options.now,
        onEvent: event => this.execution.run(true, () => emitLog(this.options, event)),
        onError: error => this.execution.run(true, () => reportError(this.options, error)),
      });
    this.http = options.http === false ? undefined : options.http ?? new HttpService();
    this.music = options.music;
    this.voice = options.voice;
    this.runtime = new Runtime({ ...defaultLimits, ...options.limits });
    this.registry = new CommandRegistry(this.runtime, () => this.enableFunctions(), command => {
      if (command.http) (this.http ?? new HttpService()).withPolicy(command.http);
    });
    this.events = new NativeEvents(this.client, work => this.scheduleEvent(work));
    if (typeof options.prefix !== 'function') this.resolvePrefixes(options.prefix ?? '!');
    this.listener = message => { void this.handle(incoming(message)).catch(error => reportError(this.options, error)); };
    this.client.on(Events.Error, this.errorListener);
    this.client.on(Events.ShardError, this.shardErrorListener);
  }

  /** Ativa o function mode (parser, evaluator e builtins) antes de usar `code`. */
  enableFunctions(): this {
    if (!this.functionsReady) {
      registerBuiltins(this.runtime);
      this.functionsReady = true;
    }
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
    if (hasScript) this.enableFunctions();
    const stagedRuntime = new Runtime(this.runtime.limits);
    stagedRuntime.registerAll([...this.runtime.functions(), ...(plugin.functions ?? [])]);
    const commitCommands = this.registry.prepare(plugin.commands ?? [], stagedRuntime);
    for (const event of plugin.events ?? []) this.events.validate(event);
    const scriptEvents = (plugin.scriptEvents ?? []).map(event => this.prepareScriptEvent(event, stagedRuntime));
    this.runtime.registerAll(plugin.functions ?? []);
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

  scriptEvent(definition: ScriptEventDefinition): this {
    if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
    this.enableFunctions();
    this.events.add(this.prepareScriptEvent(definition));
    return this;
  }
  private prepareScriptEvent(definition: ScriptEventDefinition, runtime = this.runtime): NativeEvent {
    validateScriptEvent(definition);
    const options = structuredClone(definition);
    if (options.http) (this.http ?? new HttpService()).withPolicy(options.http);
    const program = runtime.compile(options.code, `<event:${options.event}>`);
    return { event: options.event, once: options.once ?? false, invoke: args => this.runScriptEvent(options, program, args) };
  }
  private async runScriptEvent(definition: ScriptEventDefinition, program: Program, args: unknown[]): Promise<void> {
    const source = adaptScriptEvent(definition.event, args);
    if ((definition.ignoreBots ?? true) && source.event.userBot) return;
    const signal = this.shutdown.signal;
    const ctx = new EventContext({ ...source, channelID: definition.channelID, actorID: definition.actorID,
      policy: definition.http, transport: this.transport, store: this.store, resources: this.resources,
      scheduler: this.scheduler, http: this.http, music: this.music, voice: this.voice, now: this.options.now, cooldown: this.contextCooldown, signal });
    const started = this.options.onLog ? performance.now() : 0;
    let outcome: DispatchResult = 'success';
    try {
      if (this.options.onLog) await emitLog(this.options, { event: 'event.start', executionID: ctx.executionID, command: ctx.command.name });
      const output = text(await this.runtime.execute(program, ctx)).trim();
      if (output) {
        if (!ctx.channelID) throw new GuardError('Defina um canal para a saída deste evento.');
        await ctx.send(output, ctx.channelID);
      }
    } catch (error) {
      outcome = error instanceof GuardError ? 'guarded' : 'error';
      await reportError(this.options, error, ctx);
    } finally {
      if (this.options.onLog) await emitLog(this.options, { event: 'event.finish', executionID: ctx.executionID,
        command: ctx.command.name, outcome, durationMs: performance.now() - started });
    }
  }

  private scheduleEvent(work: () => unknown | Promise<unknown>): void {
    if (this.closing) return;
    const task = this.execution.run(true, async () => {
      try { await Promise.resolve().then(work); } catch (error) { await reportError(this.options, error); }
    });
    this.active.add(task);
    void task.then(() => this.active.delete(task), () => this.active.delete(task));
  }

  private async runScheduled(task: ScheduleRecord, signal: AbortSignal): Promise<void> {
    if (this.closing || signal.aborted) throw cancellationError();
    const configured = typeof this.options.prefix === 'function'
      ? await this.options.prefix({ channelID: task.channelID, guildID: task.guildID } as IncomingMessage)
      : this.options.prefix ?? '!';
    const prefixes = this.resolvePrefixes(configured);
    const prefix = (Array.isArray(prefixes) ? prefixes[0] : prefixes) ?? '!';
    const suffix = task.input ? ` ${task.input}` : '';
    let retryable = true, cause: unknown;
    const outcome = await this.handleMessage({ id: `schedule-${task.id}-${task.claimID ?? Date.now()}`, content: `${prefix}${task.command}${suffix}`,
      authorID: task.authorID, authorName: 'Scheduler', authorBot: false,
      channelID: task.channelID, guildID: task.guildID, mentions: [] }, (error, ctx) => {
      cause = error; retryable = !(error instanceof GuardError || error instanceof PartialModerationError) && !ctx?.hasModerationEffect;
    }, signal, task.claimID ?? undefined);
    if (outcome !== 'success') throw new ScheduleExecutionError(outcome === 'error' && retryable, cause);
  }

  login(token = process.env.FLUXER_BOT_TOKEN): Promise<void> {
    if (this.closing) return Promise.reject(new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.'));
    if (!token?.trim()) return Promise.reject(new YuzuhaError('TOKEN_MISSING', 'Defina FLUXER_BOT_TOKEN.'));
    if (this.loginTask) return this.loginTask;
    this.scheduler?.start();
    this.client.on(Events.MessageCreate, this.listener);
    this.listening = true;
    this.loginAbort = new AbortController();
    const task = this.client.login(token, { signal: this.loginAbort.signal }).then(() => {
      if (this.closing) throw new YuzuhaError('BOT_CLOSED', 'O bot foi encerrado durante o login.');
    }).catch(async error => {
      this.client.off(Events.MessageCreate, this.listener); this.listening = false;
      this.scheduler?.stop();
      await this.scheduler?.drain();
      const needsErrorListener = !this.client.listeners(Events.Error).includes(this.errorListener);
      const needsShardListener = !this.client.listeners(Events.ShardError).includes(this.shardErrorListener);
      if (needsErrorListener) this.client.on(Events.Error, this.errorListener);
      if (needsShardListener) this.client.on(Events.ShardError, this.shardErrorListener);
      try { await this.client.destroy(); }
      finally {
        if (needsErrorListener) this.client.off(Events.Error, this.errorListener);
        if (needsShardListener) this.client.off(Events.ShardError, this.shardErrorListener);
        await Promise.allSettled([...this.gatewayReports]);
      }
      throw error;
    });
    this.loginTask = task;
    void task.catch(() => { if (this.loginTask === task) this.loginTask = undefined; });
    return task;
  }

  destroy(): Promise<void> {
    if (this.closeTask) return this.execution.getStore() ? Promise.resolve() : this.closeTask;
    this.closing = true;
    this.shutdown.abort();
    this.loginAbort?.abort();
    this.scheduler?.stop();
    this.events.close();
    if (this.listening) this.client.off(Events.MessageCreate, this.listener);
    this.listening = false;
    this.closeTask = (async () => {
      await Promise.allSettled([...this.active]);
      await this.scheduler?.drain();
      try {
        const results = await Promise.allSettled([this.music?.close(), this.voice?.close()]);
        const failures = results.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
        if (failures.length) throw new AggregateError(failures.map(item => item.reason), 'Falha ao encerrar música ou voz.');
      }
      finally {
        try { await this.client.destroy(); }
        finally {
          this.client.off(Events.Error, this.errorListener);
          this.client.off(Events.ShardError, this.shardErrorListener);
          await Promise.allSettled([...this.gatewayReports]);
          if (!this.options.store) await this.store.close?.();
        }
      }
    })();
    return this.execution.getStore() ? Promise.resolve() : this.closeTask;
  }

  handle(message: IncomingMessage): Promise<DispatchResult> {
    return this.handleMessage(message);
  }

  private resolvePrefixes(source: string | string[]): string[] {
    const previous = this.prefixSource;
    if (typeof source === 'string' && source === previous) return this.prefixes;
    if (Array.isArray(source) && Array.isArray(previous) && source.length === previous.length) {
      let same = true;
      for (let index = 0; index < source.length; index++) if (source[index] !== previous[index]) { same = false; break; }
      if (same) return this.prefixes;
    }
    const prefixes = validatePrefixes(source);
    this.prefixSource = Array.isArray(source) ? [...source] : source;
    return this.prefixes = prefixes;
  }

  private resolveCommand(message: IncomingMessage, configured: string | string[]): RoutedCommand | undefined {
    const routed = route(message.content, this.resolvePrefixes(configured));
    if (!routed) return;
    const resolved = this.registry.resolve(routed.name, routed.input);
    if (!resolved || this.limits.duplicate(message.channelID, message.id)) return;
    return { ...resolved, prefix: routed.prefix };
  }

  private handleMessage(message: IncomingMessage, onFailure?: (error: unknown, ctx?: CommandContext) => void, parentSignal?: AbortSignal, executionID?: string): Promise<DispatchResult> {
    if (this.closing || message.authorBot || message.authorID === this.transport.botID) return ignored;
    let routed: RoutedCommand | undefined;
    if (typeof this.options.prefix !== 'function') {
      try { routed = this.resolveCommand(message, this.options.prefix ?? '!'); }
      catch (error) { return Promise.reject(error); }
      if (!routed) return ignored;
    }
    const signal = parentSignal ? AbortSignal.any([this.shutdown.signal, parentSignal]) : this.shutdown.signal;
    const task = this.execution.run(true, () => this.dispatch(message, signal, onFailure, executionID, routed));
    this.active.add(task);
    void task.then(() => this.active.delete(task), () => this.active.delete(task));
    return task;
  }

  private async dispatch(message: IncomingMessage, signal: AbortSignal, onFailure?: (error: unknown, ctx?: CommandContext) => void, executionID?: string, resolved?: RoutedCommand): Promise<DispatchResult> {
    if (!resolved) {
      const configured = typeof this.options.prefix === 'function' ? await this.options.prefix(message) : this.options.prefix ?? '!';
      if (this.closing || signal.aborted) return 'ignored';
      resolved = this.resolveCommand(message, configured);
    }
    if (!resolved) return 'ignored';
    const { compiled, prefix } = resolved;
    let ctx: CommandContext | undefined;
    let outcome: DispatchResult = 'success';
    const started = this.options.onLog ? performance.now() : 0;
    try {
      ctx = new CommandContext({ message, transport: this.transport, store: this.store, command: compiled.command,
        input: resolved.input, prefix, lineage: compiled.lineage,
        help: this.contextHelp, cooldown: this.contextCooldown,
        native: { client: this.client, message: message.raw instanceof Message ? message.raw : undefined },
        resources: this.resources, scheduler: this.scheduler, http: this.http, music: this.music, voice: this.voice, now: this.options.now, signal, executionID });
      if (this.options.onLog) await emitLog(this.options, { event: 'command.start', executionID: ctx.executionID, command: ctx.command.name });
      if (signal.aborted) throw cancellationError();
      await ctx.prepare();
      const current = ctx;
      for (const check of compiled.command.checks ?? []) {
        const result = await check(current);
        if (result === false || typeof result === 'string') throw new GuardError(typeof result === 'string' ? result : 'Você não pode executar este comando.');
      }
      const execute = async () => {
        if (compiled.program) {
          const output = text(await this.runtime.execute(compiled.program, current)).trim();
          if (output) await current.reply(output);
        } else if (compiled.command.run) await compiled.command.run(current);
        else throw new GuardError(`${resolved.input ? 'Subcomando desconhecido.\n' : ''}${this.help(compiled.command.name, prefix)}`);
      };
      const local = compiled.command.middleware ?? [];
      if (this.middleware.length) await runMiddleware(local.length ? [...this.middleware, ...local] : this.middleware, current, execute);
      else if (local.length) await runMiddleware(local, current, execute);
      else await execute();
    } catch (error) {
      onFailure?.(error, ctx);
      outcome = error instanceof GuardError ? 'guarded' : 'error';
      try { if (!signal.aborted) await this.transport.reply(message, { content: userError(error, ctx) }); }
      catch (replyError) { await reportError(this.options, replyError, ctx); }
      if (!(error instanceof GuardError)) await reportError(this.options, error, ctx);
    }
    if (ctx && this.options.onCommand) {
      try { await this.options.onCommand(ctx, outcome); }
      catch (error) { await reportError(this.options, error, ctx); }
    }
    if (ctx && this.options.onLog) await emitLog(this.options, { event: 'command.finish', executionID: ctx.executionID,
      command: ctx.command.name, outcome, durationMs: performance.now() - started });
    return outcome;
  }
}

export { Yuzuha as Bot };
