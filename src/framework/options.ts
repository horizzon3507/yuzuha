import type { Client, ClientOptions } from '@fluxerjs/core';
import type { Yuzuha } from './bot.js';
import type { Command, CommandContext, HelpRenderContext, HelpRenderer } from '../context.js';
import type { IncomingMessage, Payload, Store, Transport } from '../contracts.js';
import type { GuardError } from '../errors.js';
import type { ScriptEngine, ScriptFunctionDefinition } from '../ports/script-engine.js';
import type { Lock } from '../ports/lock.js';
import type { MetricsSink } from '../ports/metrics.js';
import type { RateLimiter } from '../ports/rate-limiter.js';
import type { Resources } from '../ports/resources.js';
import type { HttpService } from '../services/http.js';
import type { Scheduler } from '../services/scheduler.js';
import type { ContextEventDefinition, NativeEvent } from './events.js';
import type { LogRecord, YuzuhaLogger } from './logging.js';
import type { ScriptEventDefinition } from './script-events.js';
import type { MusicManager } from '../services/music.js';
import type { NativeVoice } from '../ports/voice.js';
import type { CanvasConfig } from '../domain/canvas.js';
import type { MemberCacheOptions } from '../infrastructure/fluxer/member-cache.js';
import type { ConcurrencyOptions } from './concurrency.js';
import type { PrefixCacheOptions } from './prefix-cache.js';
import type { ShardingOptions } from './sharding.js';
import type { TransportRetryPolicy } from '../services/retry.js';
import type {
  LocaleMessagesConfig,
  MessageCatalog,
  MessageOverrides,
  MessagesConfig,
  MessageTranslator,
} from '../domain/i18n.js';

export type {
  ConcurrencyOptions,
  HelpRenderContext,
  HelpRenderer,
  PrefixCacheOptions,
  ShardingOptions,
  LocaleMessagesConfig,
  MessageCatalog,
  MessageOverrides,
  MessagesConfig,
  MessageTranslator,
};

export type DispatchResult = 'ignored' | 'success' | 'guarded' | 'error';
export type MessageGate = (message: IncomingMessage) => boolean | Promise<boolean>;
export type ErrorReplyResult = Payload | string | null | undefined;
export interface UnknownCommandContext {
  readonly name: string;
  readonly input: string;
  readonly prefix: string;
  readonly message: IncomingMessage;
  readonly locale: string;
  readonly t: MessageTranslator;
}
export type LocaleResolver = (ctx: CommandContext | UnknownCommandContext) => string | Promise<string>;
export type LocaleOption = string | LocaleResolver;
export interface YuzuhaHooks {
  onCooldown?: (remainingMs: number, ctx: CommandContext, error: GuardError) => ErrorReplyResult | void | Promise<ErrorReplyResult | void>;
  onDenied?: (error: GuardError, ctx: CommandContext) => ErrorReplyResult | void | Promise<ErrorReplyResult | void>;
  onUnknownCommand?: (info: UnknownCommandContext) => Payload | string | null | void | Promise<Payload | string | null | void>;
}
export type ErrorSource = 'command' | 'event' | 'gateway' | 'scheduler' | 'hook';
export interface ErrorReportInfo {
  readonly source: ErrorSource;
  readonly event?: string;
  readonly ctx?: CommandContext;
  readonly executionID?: string;
}
export type Middleware = (ctx: CommandContext, next: () => Promise<void>) => Promise<void>;
export interface YuzuhaPlugin {
  name: string;
  dependsOn?: readonly string[];
  functions?: ScriptFunctionDefinition[];
  middleware?: Middleware[];
  commands?: Command[];
  events?: NativeEvent[];
  contextEvents?: readonly ContextEventDefinition<any>[];
  scriptEvents?: ScriptEventDefinition[];
  setup?: (bot: Yuzuha) => void | Promise<void>;
  teardown?: (bot: Yuzuha) => void | Promise<void>;
}
export interface AsyncYuzuhaPlugin extends YuzuhaPlugin {
  setup: (bot: Yuzuha) => Promise<void>;
}
export interface VariableSweepOptions {
  sweepIntervalMs?: number | false;
  sweepBatch?: number;
}
export interface RateLimitOptions {
  maxCooldowns?: number;
  onCooldownCapacity?: 'evict' | 'throw';
  maxDedupe?: number;
  dedupeWindowMs?: number;
}
export interface DestroyOptions {
  timeoutMs?: number;
}
export interface GatewayLogOptions {
  debug?: boolean;
}
export interface SignalHandlerTarget {
  on(event: string, listener: (...args: any[]) => void): unknown;
  off(event: string, listener: (...args: any[]) => void): unknown;
}
export interface SignalHandlerOptions {
  signals?: readonly NodeJS.Signals[];
  timeoutMs?: number;
  target?: Pick<NodeJS.Process, 'on' | 'off'> | SignalHandlerTarget;
  onExit?: (code: number) => void;
}
export interface YuzuhaOptions {
  prefix?: string | string[] | ((message: IncomingMessage) => string | string[] | Promise<string | string[]>);
  mentionPrefix?: boolean;
  allowBots?: boolean;
  owners?: readonly string[];
  devGuilds?: readonly string[];
  gate?: MessageGate;
  client?: Client;
  clientOptions?: ClientOptions;
  transport?: Transport;
  resources?: Resources;
  store?: Store;
  name?: string;
  /** Clock shared by cooldowns, variable TTLs and the default scheduler. */
  now?: () => number;
  engine?: ScriptEngine;
  scheduler?: Scheduler | false;
  lock?: Lock;
  http?: HttpService | false;
  music?: MusicManager;
  voice?: NativeVoice;
  canvas?: CanvasConfig;
  context?: (ctx: CommandContext) => void | Promise<void>;
  onError?: (error: unknown, ctx: CommandContext | undefined, info: ErrorReportInfo) => void | Promise<void>;
  errorReply?: (error: unknown, ctx?: CommandContext) => ErrorReplyResult | Promise<ErrorReplyResult>;
  helpRenderer?: HelpRenderer;
  hooks?: YuzuhaHooks;
  onCommand?: (ctx: CommandContext, outcome: DispatchResult) => void | Promise<void>;
  onLog?: (record: LogRecord) => void | Promise<void>;
  logger?: YuzuhaLogger | false;
  metrics?: MetricsSink;
  gatewayLogs?: boolean | GatewayLogOptions;
  retry?: false | TransportRetryPolicy;
  timers?: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void };
  cdn?: { mediaBase?: string };
  /** Mapa nome → emoji copiado para um registro sem protótipo, exposto como `bot.emoji` e `ctx.emoji` (mapa vivo). */
  emoji?: Record<string, string>;
  messages?: Partial<MessageCatalog> | MessageOverrides | LocaleMessagesConfig;
  locale?: LocaleOption;
  memberCache?: false | MemberCacheOptions;
  prefixCache?: false | PrefixCacheOptions;
  variables?: false | VariableSweepOptions;
  concurrency?: ConcurrencyOptions;
  rateLimits?: RateLimitOptions;
  rateLimiter?: RateLimiter;
  sharding?: boolean | ShardingOptions;
  unsafeDisableResourceAuthorization?: boolean;
}
