import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Payload } from '../domain/messages.js';
import type { ScriptEventData } from '../domain/events.js';
import type { CaseRecord, ModerationAction, ModerationOptions } from '../domain/moderation.js';
import type { JsonValue, VariableScope } from '../domain/state.js';
import { parseDuration } from '../domain/values.js';
import type { Store } from '../ports/store.js';
import type { Transport } from '../ports/transport.js';
import type { NativeAccess } from '../ports/native.js';
import type { Resources } from '../ports/resources.js';
import type { Scheduler } from '../services/scheduler.js';
import { bindHttp } from '../services/http.js';
import type { HttpService } from '../services/http.js';
import { AuthorizationService, requireGuild } from '../services/authorization.js';
import { CaseService } from '../services/cases.js';
import { ModerationService } from '../services/moderation.js';
import { VariableService } from '../services/variables.js';
import type { DataTransaction, VariableOptions } from '../services/variables.js';
import { NativeModeration } from '../services/native-moderation.js';
import { ScopedData } from '../services/native-data.js';
import type { NativeData } from '../services/native-data.js';
import { bindAuthorizedResources } from '../services/resource-authorization.js';
import { MemberService } from '../services/members.js';
import { GuardError, PartialModerationError, YuzuhaError } from '../shared/errors.js';
import { parseArguments, tokenize } from './arguments.js';
import { ArgumentBag } from './typed-arguments.js';
import type { Command } from './definition.js';

export interface ContextOptions {
  message: IncomingMessage;
  transport: Transport;
  store: Store;
  command: Command;
  input?: string;
  cooldown: (key: string, duration: number) => number;
  help?: () => string;
  native?: NativeAccess;
  resources?: Resources;
  scheduler?: Scheduler;
  http?: HttpService;
  signal?: AbortSignal;
  executionID?: string;
  event?: Readonly<ScriptEventData>;
  messageAvailable?: boolean;
  actor?: { guildID: string; authorID: string };
}

export class CommandContext {
  private executionKey?: string;
  readonly vars = new Map<string, unknown>();
  readonly args = new ArgumentBag();
  readonly mod: NativeModeration;
  readonly data: NativeData;
  readonly members: MemberService;
  readonly signal: AbortSignal;
  readonly tokens: string[];
  lastCase?: CaseRecord;
  private moderationApplied = false;
  private readonly sourceMessage: IncomingMessage;
  readonly event?: Readonly<ScriptEventData>;
  private readonly messageAvailable: boolean;
  private readonly actor?: { guildID: string; authorID: string };
  readonly transport: Transport;
  readonly store: Store;
  readonly command: Command;
  readonly input: string;
  readonly help: () => string;
  private readonly claimCooldown: ContextOptions['cooldown'];
  private readonly authorization: AuthorizationService;
  private readonly moderation: ModerationService;
  private readonly cases: CaseService;
  private readonly variables: VariableService;
  private readonly native?: NativeAccess;
  private readonly nativeResources?: Resources;
  private readonly schedulerService?: Scheduler;
  private readonly httpService?: HttpService;
  private scopedHttp?: HttpService;
  private scopedResources?: Resources;

  constructor(options: ContextOptions) {
    this.executionKey = options.executionID;
    this.sourceMessage = options.message;
    this.event = options.event ? Object.freeze({ ...options.event }) : undefined;
    this.messageAvailable = options.messageAvailable ?? true;
    this.actor = options.actor;
    this.transport = options.transport;
    this.store = options.store;
    this.command = options.command;
    this.input = options.input ?? '';
    this.tokens = tokenize(this.input);
    this.claimCooldown = options.cooldown;
    this.help = options.help ?? (() => '');
    this.native = options.native;
    this.schedulerService = options.scheduler;
    this.signal = options.signal ?? new AbortController().signal;
    this.httpService = options.http;
    this.nativeResources = options.resources;
    const scope = { guildID: this.guildID, authorID: this.authorID };
    this.authorization = new AuthorizationService(this.transport, scope);
    this.moderation = new ModerationService(this.transport, this.store, scope);
    this.cases = new CaseService(this.store);
    this.variables = new VariableService(this.store, scope);
    this.members = new MemberService(this.transport, scope, () => this.resources.users);
    this.mod = new NativeModeration((action, target, reason, moderationOptions) =>
      this.moderate(action, target, reason, moderationOptions));
    this.data = Object.freeze({
      guild: new ScopedData(this.variables, 'guild'),
      user: new ScopedData(this.variables, 'user'),
      userFor: (id: string) => new ScopedData(this.variables.forUser(id), 'user'),
      global: new ScopedData(this.variables, 'global'),
      transaction: <T>(writer: (data: DataTransaction) => T) => this.variables.transaction(writer),
    });
  }

  get message(): IncomingMessage {
    if (!this.messageAvailable) throw new GuardError('Este evento não fornece uma mensagem completa. Use os campos de evento e um canal explícito.');
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
    const source = bindAuthorizedResources(this.nativeResources, this.transport, { guildID: this.guildID, authorID: this.authorID }), collectors = source.collectors;
    return this.scopedResources = { users: source.users, roles: source.roles, channels: source.channels,
      messages: source.messages, webhooks: source.webhooks, expressions: source.expressions,
      threads: source.threads, invites: source.invites, collectors: {
        awaitMessage: (channelID, input) => collectors.awaitMessage(channelID, { ...input,
          signal: input.signal ? AbortSignal.any([this.signal, input.signal]) : this.signal }),
        awaitReaction: (channelID, messageID, emojis, timeMs, userID, signal) => collectors.awaitReaction(
          channelID, messageID, emojis, timeMs, userID, signal ? AbortSignal.any([this.signal, signal]) : this.signal),
      } };
  }
  get scheduler(): Scheduler {
    if (!this.schedulerService) throw new YuzuhaError('NATIVE_UNAVAILABLE', 'O agendador não foi fornecido a este contexto.');
    return this.schedulerService;
  }
  get http(): HttpService {
    if (!this.httpService) throw new YuzuhaError('NATIVE_UNAVAILABLE', 'O serviço HTTP não foi fornecido a este contexto.');
    return this.scopedHttp ??= bindHttp(this.command.http ? this.httpService.withPolicy(this.command.http) : this.httpService, this.signal);
  }
  requireGuild(): string { return requireGuild(this.guildID); }

  assert(condition: unknown, message: string): void {
    if (!condition) throw new GuardError(message);
  }

  reply(payload: string | Payload): Promise<string> {
    return this.transport.reply(this.message, typeof payload === 'string' ? { content: payload } : payload);
  }

  send(payload: string | Payload, channelID = this.message.channelID): Promise<string> {
    return this.transport.send(channelID, typeof payload === 'string' ? { content: payload } : payload);
  }

  edit(messageID: string, payload: string | Payload, channelID = this.message.channelID): Promise<void> {
    return this.transport.edit(channelID, messageID, typeof payload === 'string' ? { content: payload } : payload);
  }

  delete(messageID: string, channelID = this.message.channelID): Promise<void> {
    return this.transport.delete(channelID, messageID);
  }

  react(emoji: string, messageID = this.message.id, channelID = this.message.channelID): Promise<void> {
    return this.transport.react(channelID, messageID, emoji);
  }

  requirePermission(name: string, bot = false, message?: string): Promise<void> {
    return this.authorization.requirePermission(name, bot, message);
  }

  cooldown(duration: string | number, message?: string): void {
    const key = JSON.stringify([this.guildID, this.message.channelID, this.authorID, this.command.name]);
    const remaining = this.claimCooldown(key, parseDuration(duration));
    if (remaining > 0) throw new GuardError((message ?? 'Aguarde {remaining} antes de usar novamente.')
      .replaceAll('{remaining}', `${Math.ceil(remaining / 1000)}s`));
  }

  async prepare(): Promise<void> {
    if (this.command.guildOnly) this.requireGuild();
    for (const permission of this.command.permissions ?? []) await this.requirePermission(permission);
    for (const permission of this.command.botPermissions ?? []) await this.requirePermission(permission, true);
    for (const [name, value] of parseArguments(this.command.args ?? [], this.tokens)) this.args.set(name, value);
    if (this.command.cooldown !== undefined) this.cooldown(this.command.cooldown);
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
