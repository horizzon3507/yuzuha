import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Payload } from '../domain/messages.js';
import type { ScriptEventData } from '../domain/events.js';
import type { CaseRecord, ModerationAction, ModerationOptions } from '../domain/moderation.js';
import type { JsonValue, VariableScope } from '../domain/state.js';
import { DEFAULT_LOCALE, defaultTranslator, validateLocale } from '../domain/i18n.js';
import type { MessageTranslator } from '../domain/i18n.js';
import type { Store } from '../ports/store.js';
import type { Transport } from '../ports/transport.js';
import type { NativeAccess } from '../ports/native.js';
import type { BotShard } from '../ports/sharding.js';
import type { Resources } from '../ports/resources.js';
import { assertServiceKey } from '../ports/services.js';
import type { ServiceKey, ServiceLookup } from '../ports/services.js';
import type { Scheduler } from '../services/scheduler.js';
import { sendStreamAttachment } from '../services/attachments.js';
import type { StreamAttachmentOptions } from '../services/attachments.js';
import { bindHttp } from '../services/http.js';
import type { HttpService } from '../services/http.js';
import { AuthorizationService, MemberMemo, requireGuild } from '../services/authorization.js';
import { CaseService } from '../services/cases.js';
import { ModerationService } from '../services/moderation.js';
import { VariableService } from '../services/variables.js';
import type { DataTransaction, VariableOptions } from '../services/variables.js';
import { NativeModeration } from '../services/native-moderation.js';
import { ScopedData } from '../services/native-data.js';
import type { NativeData } from '../services/native-data.js';
import { bindAuthorizedResources } from '../services/resource-authorization.js';
import { createCdn } from '../domain/cdn.js';
import { MemberService } from '../services/members.js';
import type { MusicManager } from '../services/music.js';
import type { NativeVoice } from '../ports/voice.js';
import type { CanvasConfig } from '../domain/canvas.js';
import type { CanvasRenderer } from '../ports/canvas.js';
import { CanvasService } from '../services/canvas.js';
import { GuardError, PartialModerationError, YuzuhaError } from '../shared/errors.js';
import { hasAsyncArguments, parseArguments, parseArgumentsAsync, parseFlags, parseFlagsAsync, tokenize } from './arguments.js';
import type { ArgumentTypeRegistry } from './arguments.js';
import { commandUsage } from './help.js';
import { ArgumentBag } from './typed-arguments.js';
import { resolveCooldown } from './definition.js';
import type { ArgumentDefinition, Command, CooldownOptions, CooldownScope } from './definition.js';

export interface SendOptions { ttlMs?: number }

/**
 * Interface extensível via declaration merging (`declare module 'yuzuha' { interface YuzuhaLocals { ... } }`)
 * para dados locais tipados por execução em `ctx.locals`.
 */
export interface YuzuhaLocals {}

export interface ContextOptions {
  message: IncomingMessage;
  transport: Transport;
  store: Store;
  command: Command;
  flagLookup?: ReadonlyMap<string, ArgumentDefinition>;
  argumentTypes?: ArgumentTypeRegistry;
  lineage?: readonly Command[];
  prefix?: string;
  input?: string;
  cooldown: (key: string, duration: number, maxUses?: number) => number | Promise<number>;
  now?: () => number;
  help?: (command?: string, prefix?: string) => string;
  locale?: string;
  translator?: MessageTranslator;
  native?: NativeAccess;
  shard?: BotShard;
  resources?: Resources;
  resourcesInjected?: boolean;
  scheduler?: Scheduler;
  http?: HttpService;
  music?: MusicManager;
  voice?: NativeVoice;
  canvas?: { renderer: CanvasRenderer; config?: CanvasConfig };
  signal?: AbortSignal;
  executionID?: string;
  event?: Readonly<ScriptEventData>;
  messageAvailable?: boolean;
  deleteLater?: (channelID: string, messageID: string, ttlMs: number) => void;
  /** Mapa nome → emoji do bot, compartilhado por referência. */
  emoji?: Record<string, string>;
  cdn?: import('../domain/cdn.js').Cdn;
  disableResourceAuthorization?: boolean;
  actor?: { guildID: string; authorID: string };
  isOwner?: (userID: string) => boolean;
  isDevGuild?: (guildID: string) => boolean;
  services?: ServiceLookup;
}

export class CommandContext {
  private executionKey?: string;
  private localVars?: Map<string, unknown>;
  readonly locals: YuzuhaLocals = {} as YuzuhaLocals;
  private argumentsBag?: ArgumentBag;
  private flagsBag?: ArgumentBag;
  private nativeMod?: NativeModeration;
  private nativeData?: NativeData;
  private memberService?: MemberService;
  readonly signal: AbortSignal;
  readonly now: () => number;
  readonly tokens: string[];
  lastCase?: CaseRecord;
  private moderationApplied = false;
  private readonly sourceMessage: IncomingMessage;
  readonly event?: Readonly<ScriptEventData>;
  private readonly messageAvailable: boolean;
  private readonly deleteLaterFn?: (channelID: string, messageID: string, ttlMs: number) => void;
  private cdnService = createCdn();
  private readonly emojiMap: Record<string, string> = {};
  private disableResourceAuthorization = false;
  private readonly actor?: { guildID: string; authorID: string };
  private readonly checkOwner?: (userID: string) => boolean;
  private readonly checkDevGuild?: (guildID: string) => boolean;
  readonly transport: Transport;
  readonly store: Store;
  readonly shard?: BotShard;
  readonly command: Command;
  private readonly flagLookup?: ReadonlyMap<string, ArgumentDefinition>;
  private readonly argumentTypes?: ArgumentTypeRegistry;
  readonly input: string;
  readonly help: (command?: string, prefix?: string) => string;
  readonly locale: string;
  readonly t: MessageTranslator;
  private readonly claimCooldown: ContextOptions['cooldown'];
  private readonly lineage: readonly Command[];
  private readonly prefix: string;
  private authorizationService?: AuthorizationService;
  private moderationService?: ModerationService;
  private memberMemo?: MemberMemo;
  private caseService?: CaseService;
  private variableService?: VariableService;
  private readonly scope: { guildID: string; authorID: string };
  private readonly native?: NativeAccess;
  private readonly nativeResources?: Resources;
  readonly hasInjectedResources: boolean;
  private readonly schedulerService?: Scheduler;
  private readonly httpService?: HttpService;
  private readonly musicService?: MusicManager;
  private readonly voiceService?: NativeVoice;
  private readonly canvasRenderer?: CanvasRenderer;
  private readonly canvasConfig?: CanvasConfig;
  private canvasService?: CanvasService;
  private scopedHttp?: HttpService;
  private scopedResources?: Resources;
  private readonly serviceLookup?: ServiceLookup;

  constructor(options: ContextOptions) {
    const skipTokenize = skipNextTokenize;
    skipNextTokenize = false;
    this.executionKey = options.executionID;
    this.sourceMessage = options.message;
    this.event = options.event ? Object.freeze({ ...options.event }) : undefined;
    this.messageAvailable = options.messageAvailable ?? true;
    this.actor = options.actor;
    this.scope = { guildID: this.guildID, authorID: this.authorID };
    this.transport = options.transport;
    this.store = options.store;
    this.deleteLaterFn = options.deleteLater;
    this.command = options.command;
    this.flagLookup = options.flagLookup;
    this.argumentTypes = options.argumentTypes;
    this.lineage = options.lineage ?? [options.command];
    this.prefix = options.prefix ?? '';
    this.input = options.input ?? '';
    this.locale = options.locale !== undefined ? validateLocale(options.locale, 'locale') : DEFAULT_LOCALE;
    this.t = options.translator ?? defaultTranslator;
    if (skipTokenize) {
      this.tokens = [];
    } else {
      try { this.tokens = tokenize(this.input, this.t); }
      catch (error) {
        if (error instanceof GuardError) {
          throw new GuardError(`${error.message}\n${this.t('usageLine', commandUsage(this.command, this.prefix, this.t))}`, error.reason);
        }
        throw error;
      }
    }
    this.claimCooldown = options.cooldown;
    this.help = options.help ?? (() => '');
    this.native = options.native;
    this.shard = options.shard;
    this.schedulerService = options.scheduler;
    this.signal = options.signal ?? new AbortController().signal;
    this.now = options.now ?? Date.now;
    this.httpService = options.http;
    this.musicService = options.music;
    this.voiceService = options.voice;
    this.cdnService = options.cdn ?? createCdn();
    this.emojiMap = options.emoji ?? {};
    this.disableResourceAuthorization = options.disableResourceAuthorization === true;
    this.checkOwner = options.isOwner;
    this.checkDevGuild = options.isDevGuild;
    this.canvasRenderer = options.canvas?.renderer;
    this.canvasConfig = options.canvas?.config;
    this.nativeResources = options.resources;
    this.hasInjectedResources = options.resourcesInjected ?? (options.resources !== undefined);
    this.serviceLookup = options.services;
  }

  private get memo(): MemberMemo { return this.memberMemo ??= new MemberMemo(this.transport); }
  private get authorization(): AuthorizationService { return this.authorizationService ??= new AuthorizationService(this.transport, this.scope, this.memo, this.t); }
  private get moderation(): ModerationService { return this.moderationService ??= new ModerationService(this.transport, this.store, this.scope, this.memo, this.t); }
  private get cases(): CaseService { return this.caseService ??= new CaseService(this.store); }
  private get variables(): VariableService { return this.variableService ??= new VariableService(this.store, this.scope, this.now, this.t); }
  get members(): MemberService { return this.memberService ??= new MemberService(this.transport, this.scope, () => this.resources.users, this.t); }
  get vars(): Map<string, unknown> { return this.localVars ??= new Map(); }
  get args(): ArgumentBag { return this.argumentsBag ??= new ArgumentBag(this.t); }
  get flags(): ArgumentBag { return this.flagsBag ??= new ArgumentBag(this.t); }
  async guildFeatures(): Promise<string[]> {
    const info = await this.resources.users.guild(this.requireGuild());
    if (!info.features) throw new YuzuhaError('NATIVE_UNAVAILABLE', 'O recurso de servidor não fornece features.');
    return [...info.features];
  }

  async leaveGuild(): Promise<void> {
    const guildID = await this.authorization.requireGuildDeparture();
    if (!this.resources.users.leaveGuild) throw new YuzuhaError('NATIVE_UNAVAILABLE', 'O recurso de servidor não implementa leaveGuild.');
    await this.resources.users.leaveGuild(guildID);
  }
  get cdn() { return this.cdnService; }
  /** Mapa nome → emoji configurado no bot (`YuzuhaOptions.emoji`). */
  get emoji(): Record<string, string> { return this.emojiMap; }

  get<T>(key: ServiceKey<T>): T {
    assertServiceKey(key);
    if (!this.serviceLookup) {
      throw new YuzuhaError('SERVICE_MISSING', `Serviço não registrado: ${key.description}.`);
    }
    return this.serviceLookup.get(key);
  }

  resolve<T>(key: ServiceKey<T>): T | undefined {
    assertServiceKey(key);
    return this.serviceLookup?.resolve(key);
  }

  get mod(): NativeModeration {
    return this.nativeMod ??= new NativeModeration(
      (action, target, reason, options) => this.moderate(action, target, reason, options),
      (action, targetID) => this.moderation.canModerate(action, targetID));
  }
  get data(): NativeData {
    return this.nativeData ??= Object.freeze({
      guild: new ScopedData(this.variables, 'guild'), user: new ScopedData(this.variables, 'user'),
      global: new ScopedData(this.variables, 'global'),
      userFor: (id: string) => new ScopedData(this.variables.forUser(id), 'user'),
      transaction: <T>(writer: (data: DataTransaction) => T) => this.variables.transaction(writer),
    });
  }

  get message(): IncomingMessage {
    if (!this.messageAvailable) throw new GuardError(this.t('eventMessageUnavailable'), 'GENERIC');
    return this.sourceMessage;
  }
  get authorID(): string { return this.actor?.authorID ?? this.sourceMessage.authorID; }
  get authorName(): string { return this.event?.userName ?? this.sourceMessage.authorName; }
  get channelID(): string { return this.sourceMessage.channelID; }
  get executionID(): string { return this.executionKey ??= randomUUID(); }
  get hasModerationEffect(): boolean { return this.moderationApplied; }
  get guildID(): string { return this.actor?.guildID ?? this.sourceMessage.guildID ?? ''; }
  get client(): NativeAccess['client'] {
    if (!this.native) throw new YuzuhaError('NATIVE_UNAVAILABLE', 'O client nativo não foi fornecido a este contexto.');
    return this.native.client;
  }
  get nativeMessage(): NativeAccess['message'] { return this.native?.message; }
  /** Recursos nativos usados por funções de script e comandos. */
  get resources(): Resources {
    if (!this.nativeResources) throw new YuzuhaError('NATIVE_UNAVAILABLE', 'Os recursos nativos não foram fornecidos a este contexto.');
    if (this.scopedResources) return this.scopedResources;
    const source = this.disableResourceAuthorization ? this.nativeResources
      : bindAuthorizedResources(this.nativeResources, this.transport, this.scope, this.memo, this.t);
    const collectors = source.collectors;
    return this.scopedResources = { users: source.users, roles: source.roles, channels: source.channels,
      messages: source.messages, webhooks: source.webhooks, expressions: source.expressions,
      threads: source.threads, invites: source.invites, gateway: source.gateway,
      instance: source.instance, self: source.self, cache: source.cache, collectors: {
        awaitMessage: (channelID, input) => collectors.awaitMessage(channelID, { ...input,
          signal: input.signal ? AbortSignal.any([this.signal, input.signal]) : this.signal }),
        awaitReaction: (channelID, messageID, emojis, timeMs, userID, signal) => collectors.awaitReaction(
          channelID, messageID, emojis, timeMs, userID, signal ? AbortSignal.any([this.signal, signal]) : this.signal),
        collectMessages: (channelID, input) => collectors.collectMessages(channelID, { ...input,
          signal: input.signal ? AbortSignal.any([this.signal, input.signal]) : this.signal }),
        collectReactions: (channelID, input) => collectors.collectReactions(channelID, { ...input,
          signal: input.signal ? AbortSignal.any([this.signal, input.signal]) : this.signal }),
      } };
  }
  get scheduler(): Scheduler {
    if (!this.schedulerService) throw new YuzuhaError('NATIVE_UNAVAILABLE', 'O agendador não foi fornecido a este contexto.');
    return this.schedulerService;
  }
  get music(): MusicManager {
    if (!this.musicService) throw new YuzuhaError('NATIVE_UNAVAILABLE', 'O gerenciador de música não foi fornecido a este contexto.');
    return this.musicService;
  }
  get voice(): NativeVoice {
    if (!this.voiceService) throw new YuzuhaError('NATIVE_UNAVAILABLE', 'O serviço de voz não foi fornecido a este contexto.');
    return this.voiceService;
  }
  get canvas(): CanvasService {
    if (!this.canvasRenderer) throw new YuzuhaError('NATIVE_UNAVAILABLE', 'O renderer de Canvas não foi fornecido a este contexto.');
    return this.canvasService ??= new CanvasService({ renderer: this.canvasRenderer, ...this.canvasConfig,
      signal: this.signal, http: this.httpService ? this.http : undefined,
      channelID: this.channelID, messages: this.resources.messages });
  }
  get http(): HttpService {
    if (!this.httpService) throw new YuzuhaError('NATIVE_UNAVAILABLE', 'O serviço HTTP não foi fornecido a este contexto.');
    return this.scopedHttp ??= bindHttp(this.command.http ? this.httpService.withPolicy(this.command.http) : this.httpService, this.signal);
  }
  requireGuild(): string { return requireGuild(this.guildID, this.t); }

  /** Verifica se o autor desta execução pertence aos donos configurados no bot. */
  isOwner(): boolean {
    return Boolean(this.authorID) && (this.checkOwner?.(this.authorID) ?? false);
  }

  assert(condition: unknown, message: string): void {
    if (!condition) throw new GuardError(message, 'GENERIC');
  }

  reply(payload: string | Payload, options?: SendOptions): Promise<string> {
    if (this.commandMessageDeleted) return this.send(payload, undefined, options);
    validateTtl(options, this.t);
    return this.sendVia(this.transport.reply(this.message, typeof payload === 'string' ? { content: payload } : payload),
      this.message.channelID, options);
  }

  send(payload: string | Payload, channelID = this.message.channelID, options?: SendOptions): Promise<string> {
    validateTtl(options, this.t);
    return this.sendVia(this.transport.send(channelID, typeof payload === 'string' ? { content: payload } : payload), channelID, options);
  }
  private commandMessageDeleted = false;
  async deleteCommandMessage(): Promise<void> {
    try { await this.transport.delete(this.message.channelID, this.message.id); }
    catch (error) {
      const candidate = error as { status?: number; code?: number | string } | null | undefined;
      if (candidate?.status !== 404 && candidate?.code !== 10008 && candidate?.code !== 'NOT_FOUND') throw error;
    }
    this.commandMessageDeleted = true;
  }
  private async sendVia(pending: Promise<string>, channelID: string, options?: SendOptions): Promise<string> {
    const ttlMs = options?.ttlMs;
    const id = await pending;
    if (ttlMs !== undefined) this.deleteLater(channelID, id, ttlMs);
    return id;
  }
  private deleteLater(channelID: string, messageID: string, ttlMs: number): void {
    this.deleteLaterFn?.(channelID, messageID, ttlMs);
  }

  sendStream(source: ReadableStream<Uint8Array>, options: StreamAttachmentOptions, channelID = this.message.channelID): Promise<string> {
    return sendStreamAttachment(this.resources.messages, channelID, source, options, this.signal);
  }

  edit(messageID: string, payload: string | Payload, channelID = this.message.channelID): Promise<void> {
    return this.transport.edit(channelID, messageID, typeof payload === 'string' ? { content: payload } : payload);
  }

  delete(messageID: string, channelID = this.message.channelID): Promise<void> {
    return this.transport.delete(channelID, messageID);
  }

  /** Agenda a exclusão de uma mensagem após `ttlMs`; par agendado de {@link delete}. */
  expire(messageID: string, ttlMs: number, channelID = this.message.channelID): void {
    assertTtl(ttlMs, this.t);
    this.deleteLater(channelID, messageID, ttlMs);
  }

  /** Apaga as últimas `count` mensagens do canal (1 a 1000), incluindo a mensagem do comando fora da contagem. */
  async purge(count: number, options?: { of?: string }): Promise<{ deleted: number; via: 'bulk' | 'each' }> {
    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      throw new GuardError(this.t('purgeInvalidCount'), 'INVALID_ARGUMENT');
    }
    if (!this.resources.messages.purge) {
      throw new YuzuhaError('NATIVE_UNAVAILABLE', 'O recurso de mensagens não implementa purge.');
    }
    const result = await this.resources.messages.purge(this.channelID, {
      limit: count, authorID: options?.of, include: [this.message.id] });
    return { deleted: result.deleted, via: result.via };
  }

  react(emoji: string, messageID = this.message.id, channelID = this.message.channelID): Promise<void> {
    return this.transport.react(channelID, messageID, emoji);
  }

  requirePermission(name: string, bot = false, message?: string): Promise<void> {
    return this.authorization.requirePermission(name, bot, message);
  }

  private cooldownKey(commandName: string, scope?: CooldownScope): string {
    switch (scope) {
      case 'user':
        return JSON.stringify(['user', this.authorID, commandName]);
      case 'channel':
        return JSON.stringify(['channel', this.channelID, commandName]);
      case 'guild':
        return JSON.stringify(['guild', this.guildID || this.channelID, commandName]);
      case 'global':
        return JSON.stringify(['global', commandName]);
      default:
        return JSON.stringify([this.guildID, this.channelID, this.authorID, commandName]);
    }
  }

  cooldown(duration: string | number | CooldownOptions, message?: string): void | Promise<void> {
    const resolved = resolveCooldown(duration);
    const enforce = (ms: number): void => {
      if (ms > 0) {
        const formatted = `${Math.ceil(ms / 1000)}s`;
        const text = message !== undefined
          ? message.replaceAll('{remaining}', formatted)
          : this.t('cooldown', formatted, ms);
        throw new GuardError(text, 'COOLDOWN', { remainingMs: ms });
      }
    };
    const claim = (): void | Promise<void> => {
      const key = this.cooldownKey(this.command.name, resolved.scope);
      const remaining = resolved.uses === undefined
        ? this.claimCooldown(key, resolved.durationMs)
        : this.claimCooldown(key, resolved.durationMs, resolved.uses);
      if (typeof remaining === 'number') {
        enforce(remaining);
        return;
      }
      return Promise.resolve(remaining).then(enforce);
    };
    if (resolved.bypass) {
      const bypassed = resolved.bypass(this);
      if (isPromiseLike(bypassed)) {
        return Promise.resolve(bypassed).then(skip => skip ? undefined : claim());
      }
      if (bypassed) return;
    }
    return claim();
  }

  async prepare(): Promise<void> {
    if (this.command.ownerOnly && !this.isOwner()) {
      throw new GuardError(this.t('ownerOnly'), 'OWNER_ONLY');
    }
    if (this.command.devOnly && (!this.guildID || !this.checkDevGuild?.(this.guildID))) {
      throw new GuardError(this.t('devOnly'), 'DEV_ONLY');
    }
    if (this.command.guildOnly) this.requireGuild();
    const authorPerms = this.command.permissions ?? [];
    const botPerms = this.command.botPermissions ?? [];
    if (authorPerms.length && botPerms.length && this.guildID && this.authorID) {
      const [authorResult, botResult] = await Promise.allSettled([
        this.memo.get(this.guildID, this.authorID),
        this.memo.get(this.guildID, this.transport.botID),
      ]);
      if (authorResult.status === 'rejected') throw authorResult.reason;
      for (const permission of authorPerms) await this.requirePermission(permission);
      if (botResult.status === 'rejected') throw botResult.reason;
      for (const permission of botPerms) await this.requirePermission(permission, true);
    } else {
      for (const permission of authorPerms) await this.requirePermission(permission);
      for (const permission of botPerms) await this.requirePermission(permission, true);
    }
    try {
      if (this.command.flags !== undefined) {
        const parsed = hasAsyncArguments(this.command.flags)
          ? await parseFlagsAsync(this.command.flags, this.tokens, { lookup: this.flagLookup, ctx: this, argumentTypes: this.argumentTypes, translator: this.t })
          : parseFlags(this.command.flags, this.tokens, { lookup: this.flagLookup, ctx: this, argumentTypes: this.argumentTypes, translator: this.t });
        for (const [name, value] of parsed.flags) this.flags.set(name, value);
        this.tokens.splice(0, this.tokens.length, ...parsed.tokens);
      }
      if (this.command.args?.length) {
        const parsedArgs = hasAsyncArguments(this.command.args)
          ? await parseArgumentsAsync(this.command.args, this.tokens, { ctx: this, argumentTypes: this.argumentTypes, translator: this.t })
          : parseArguments(this.command.args, this.tokens, { ctx: this, argumentTypes: this.argumentTypes, translator: this.t });
        for (const [name, value] of parsedArgs) this.args.set(name, value);
      }
    } catch (error) {
      if (error instanceof GuardError) {
        throw new GuardError(
          `${error.message}\n${this.t('usageLine', commandUsage(this.command, this.prefix, this.t))}`,
          error.reason,
          { cause: error, ...(error.remainingMs !== undefined ? { remainingMs: error.remainingMs } : {}) },
        );
      }
      throw error;
    }
    for (const command of this.lineage) {
      if (command.cooldown === undefined) continue;
      const resolved = resolveCooldown(command.cooldown);
      if (resolved.bypass) {
        const bypassed = resolved.bypass(this);
        if (isPromiseLike(bypassed) ? await bypassed : bypassed) continue;
      }
      const key = this.cooldownKey(command.name, resolved.scope);
      const raw = resolved.uses === undefined
        ? this.claimCooldown(key, resolved.durationMs)
        : this.claimCooldown(key, resolved.durationMs, resolved.uses);
      const remaining = typeof raw === 'number' ? raw : await raw;
      if (remaining > 0) {
        throw new GuardError(
          this.t('cooldown', `${Math.ceil(remaining / 1000)}s`, remaining),
          'COOLDOWN',
          { remainingMs: remaining },
        );
      }
    }
  }

  async moderate(action: ModerationAction, target: string, reason: string, options: ModerationOptions = {}): Promise<CaseRecord | undefined> {
    try {
      const record = await this.moderation.execute(action, target, reason, options);
      this.moderationApplied = true;
      if (record) this.lastCase = record;
      return record;
    } catch (error) {
      if (error instanceof PartialModerationError) this.moderationApplied = true;
      throw error;
    }
  }

  case(id: number): Promise<CaseRecord | undefined> { return this.cases.find(this.requireGuild(), id); }

  variable(scope: VariableScope, name: string, fallback: JsonValue = null): Promise<JsonValue> {
    return this.variables.get(scope, name, fallback);
  }

  setVariable(scope: VariableScope, name: string, value: JsonValue, options?: VariableOptions): Promise<void> {
    return this.variables.set(scope, name, value, options);
  }

  deleteVariable(scope: VariableScope, name: string): Promise<void> {
    return this.variables.delete(scope, name);
  }
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return (typeof value === 'object' || typeof value === 'function')
    && value !== null
    && typeof (value as PromiseLike<T>).then === 'function';
}

let skipNextTokenize = false;

export function createLocaleProbeContext(options: ContextOptions): CommandContext {
  skipNextTokenize = true;
  try { return new CommandContext(options); }
  finally { skipNextTokenize = false; }
}

function assertTtl(ttlMs: number, t: MessageTranslator = defaultTranslator): void {
  if (!Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 86_400_000) {
    throw new GuardError(t('invalidTtlMs'), 'INVALID_ARGUMENT');
  }
}

function validateTtl(options: SendOptions | undefined, t: MessageTranslator = defaultTranslator): void {
  if (options?.ttlMs !== undefined) assertTtl(options.ttlMs, t);
}
