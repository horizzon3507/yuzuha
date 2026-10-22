import { AsyncLocalStorage } from 'node:async_hooks';
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

export class Yuzuha {
  readonly client: Client;
  readonly transport: Transport;
  readonly store: Store;
  readonly resources: Resources;
  readonly scheduler?: Scheduler;
  readonly http?: HttpService;
  readonly runtime: Runtime;
  private readonly registry: CommandRegistry;
  private readonly middleware: Middleware[] = [];
  private readonly plugins = new Set<string>();
  private readonly limits: RateLimits;
  private readonly active = new Set<Promise<unknown>>();
  private readonly controllers = new Set<AbortController>();
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

  constructor(public readonly options: YuzuhaOptions = {}) {
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
    this.runtime = new Runtime({ ...defaultLimits, ...options.limits });
    this.registry = new CommandRegistry(this.runtime, () => this.enableFunctions(), command => {
      if (command.http) (this.http ?? new HttpService()).withPolicy(command.http);
    });
    this.events = new NativeEvents(this.client, work => this.scheduleEvent(work));
    if (typeof options.prefix !== 'function') validatePrefixes(options.prefix ?? '!');
    this.listener = message => { void this.handle(incoming(message)).catch(error => reportError(this.options, error)); };
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
    const controller = new AbortController(); this.controllers.add(controller);
    if (this.closing) controller.abort();
    const ctx = new EventContext({ ...source, channelID: definition.channelID, actorID: definition.actorID,
      policy: definition.http, transport: this.transport, store: this.store, resources: this.resources,
      scheduler: this.scheduler, http: this.http, now: this.options.now, cooldown: (key, duration) => this.limits.cooldown(key, duration), signal: controller.signal });
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
      this.controllers.delete(controller);
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
    void task.finally(() => this.active.delete(task)).catch(() => {});
  }

  private async runScheduled(task: ScheduleRecord, signal: AbortSignal): Promise<void> {
    if (this.closing || signal.aborted) throw cancellationError();
    const configured = typeof this.options.prefix === 'function'
      ? await this.options.prefix({ channelID: task.channelID, guildID: task.guildID } as IncomingMessage)
      : this.options.prefix ?? '!';
    const prefixes = validatePrefixes(configured);
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
      await this.client.destroy();
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
    for (const controller of this.controllers) controller.abort();
    this.scheduler?.stop();
    this.events.close();
    if (this.listening) this.client.off(Events.MessageCreate, this.listener);
    this.listening = false;
    this.closeTask = (async () => {
      await Promise.allSettled([...this.active]);
      await this.scheduler?.drain();
      await this.client.destroy();
      if (!this.options.store) await this.store.close?.();
    })();
    return this.execution.getStore() ? Promise.resolve() : this.closeTask;
  }

  handle(message: IncomingMessage): Promise<DispatchResult> {
    return this.handleMessage(message);
  }

  private handleMessage(message: IncomingMessage, onFailure?: (error: unknown, ctx?: CommandContext) => void, parentSignal?: AbortSignal, executionID?: string): Promise<DispatchResult> {
    if (this.closing) return Promise.resolve('ignored');
    const controller = new AbortController();
    this.controllers.add(controller);
    const task = this.execution.run(true, () => this.dispatch(message, parentSignal ? AbortSignal.any([controller.signal, parentSignal]) : controller.signal, onFailure, executionID));
    this.active.add(task);
    void task.finally(() => { this.active.delete(task); this.controllers.delete(controller); }).catch(() => {});
    return task;
  }

  private async dispatch(message: IncomingMessage, signal: AbortSignal, onFailure?: (error: unknown, ctx?: CommandContext) => void, executionID?: string): Promise<DispatchResult> {
    if (message.authorBot || message.authorID === this.transport.botID) return 'ignored';
    const configured = typeof this.options.prefix === 'function' ? await this.options.prefix(message) : this.options.prefix ?? '!';
    const routed = route(message.content, validatePrefixes(configured));
    if (!routed) return 'ignored';
    const resolved = this.registry.resolve(routed.name, routed.input);
    if (!resolved || this.limits.duplicate(message.channelID, message.id)) return 'ignored';
    const { compiled } = resolved;
    let ctx: CommandContext | undefined;
    let outcome: DispatchResult = 'success';
    const started = this.options.onLog ? performance.now() : 0;
    try {
      ctx = new CommandContext({ message, transport: this.transport, store: this.store, command: compiled.command,
        input: resolved.input, prefix: routed.prefix, lineage: compiled.lineage,
        help: () => this.help(), cooldown: (key, duration) => this.limits.cooldown(key, duration),
        native: { client: this.client, message: message.raw instanceof Message ? message.raw : undefined },
        resources: this.resources, scheduler: this.scheduler, http: this.http, now: this.options.now, signal, executionID });
      if (this.options.onLog) await emitLog(this.options, { event: 'command.start', executionID: ctx.executionID, command: ctx.command.name });
      if (signal.aborted) throw cancellationError();
      await ctx.prepare();
      const current = ctx;
      for (const check of compiled.command.checks ?? []) {
        const result = await check(current);
        if (result === false || typeof result === 'string') throw new GuardError(typeof result === 'string' ? result : 'Você não pode executar este comando.');
      }
      await runMiddleware([...this.middleware, ...(compiled.command.middleware ?? [])], current, async () => {
        if (compiled.program) {
          const output = text(await this.runtime.execute(compiled.program, current)).trim();
          if (output) await current.reply(output);
        } else if (compiled.command.run) await compiled.command.run(current);
        else throw new GuardError(`${resolved.input ? 'Subcomando desconhecido.\n' : ''}${this.help(compiled.command.name, routed.prefix)}`);
      });
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
