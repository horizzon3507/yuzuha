import { ConfigError } from '../errors.js';
import type { DispatchResult, ErrorSource, YuzuhaOptions } from './options.js';
import type { SchedulerEvent } from '../services/scheduler.js';

export type LogMethod = {
  (obj: Record<string, unknown>, msg?: string): void;
  (msg: string): void;
};

export interface YuzuhaLogger {
  debug?: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
  child?: (bindings: Record<string, unknown>) => YuzuhaLogger;
}

export type ConsoleLogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<ConsoleLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function bindConsoleLogger(minRank: number, bindings?: Record<string, unknown>): YuzuhaLogger {
  const emit = (method: ConsoleLogLevel, rank: number): LogMethod =>
    (objOrMsg: Record<string, unknown> | string, msg?: string): void => {
      if (rank < minRank) return;
      if (typeof objOrMsg === 'string') {
        if (bindings) console[method](objOrMsg, bindings);
        else if (msg !== undefined) console[method](objOrMsg, msg);
        else console[method](objOrMsg);
        return;
      }
      const payload = bindings ? { ...bindings, ...objOrMsg } : objOrMsg;
      if (msg !== undefined) console[method](msg, payload);
      else console[method](payload);
    };

  return {
    debug: emit('debug', 0),
    info: emit('info', 1),
    warn: emit('warn', 2),
    error: emit('error', 3),
    child(extra: Record<string, unknown>): YuzuhaLogger {
      if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
        throw new ConfigError('LOGGER_OPTIONS', 'Bindings de logger.child devem ser um objeto.');
      }
      return bindConsoleLogger(minRank, bindings ? { ...bindings, ...extra } : { ...extra });
    },
  };
}

/** Cria um logger estruturado sobre `console` com nível mínimo configurável (padrão `'info'`). */
export function createConsoleLogger(options?: { level?: ConsoleLogLevel }): YuzuhaLogger {
  if (options !== undefined && (!options || typeof options !== 'object' || Array.isArray(options))) {
    throw new ConfigError('LOGGER_OPTIONS', 'Opções de createConsoleLogger inválidas.');
  }
  const level = options?.level ?? 'info';
  if (!(level in LEVEL_RANK) || !Object.hasOwn(LEVEL_RANK, level)) {
    throw new ConfigError('LOGGER_OPTIONS', 'level deve ser debug, info, warn ou error.');
  }
  return bindConsoleLogger(LEVEL_RANK[level]);
}

export type GatewayLogEvent =
  | { event: 'gateway.ready' | 'gateway.resumed'; executionID?: string }
  | { event: 'gateway.shard_ready' | 'gateway.shard_resumed' | 'gateway.shard_reconnecting'; shardID: number; executionID?: string }
  | { event: 'gateway.shard_disconnect'; shardID: number; closeCode: number; executionID?: string }
  | { event: 'gateway.sharding_required'; shardID: number; numShards: number; executionID?: string }
  | { event: 'sdk.warn' | 'sdk.debug'; message: string; executionID?: string };

export type LogEvent = SchedulerEvent | {
  event: 'command.start' | 'command.finish' | 'event.start' | 'event.finish' | 'error'
    | 'transport.retry' | 'message.ttl_failed' | 'authorization.disabled' | 'dispatch.dropped' | 'rate_limit.evicted' | 'shutdown.timeout'
    | GatewayLogEvent['event'];
  executionID?: string;
  command?: string;
  outcome?: DispatchResult;
  durationMs?: number;
  errorCode?: string;
  source?: ErrorSource;
  trigger?: string;
  attempt?: number;
  delayMs?: number;
  messageID?: string;
  channelID?: string;
  guildID?: string;
  reason?: 'concurrency';
  pending?: number;
  shardID?: number;
  closeCode?: number;
  numShards?: number;
  message?: string;
};
export type LogRecord = Readonly<{ timestamp: string } & LogEvent>;

const EVENT_LEVEL: Record<LogEvent['event'], ConsoleLogLevel> = {
  error: 'error',
  'schedule.error': 'error',
  'transport.retry': 'warn',
  'message.ttl_failed': 'warn',
  'authorization.disabled': 'warn',
  'dispatch.dropped': 'warn',
  'rate_limit.evicted': 'warn',
  'shutdown.timeout': 'warn',
  'gateway.shard_reconnecting': 'warn',
  'gateway.shard_disconnect': 'warn',
  'gateway.sharding_required': 'warn',
  'sdk.warn': 'warn',
  'gateway.ready': 'info',
  'gateway.resumed': 'info',
  'gateway.shard_ready': 'info',
  'gateway.shard_resumed': 'info',
  'schedule.start': 'info',
  'schedule.finish': 'info',
  'sdk.debug': 'debug',
  'command.start': 'debug',
  'command.finish': 'debug',
  'event.start': 'debug',
  'event.finish': 'debug',
};

export async function emitLog(options: Pick<YuzuhaOptions, 'onLog' | 'logger'>, record: LogEvent): Promise<void> {
  if (!options.onLog && !options.logger) return;
  const entry = Object.freeze({ ...record, timestamp: new Date().toISOString() }) as LogRecord;
  if (options.onLog) {
    try { await options.onLog(entry); }
    catch {
      if (options.logger) {
        try { options.logger.error({ code: 'LOG_HANDLER_FAILED' }, '[yuzuha]'); }
        catch { console.error('[yuzuha] LOG_HANDLER_FAILED'); }
      } else {
        console.error('[yuzuha] LOG_HANDLER_FAILED');
      }
    }
  }
  if (options.logger) {
    const level = EVENT_LEVEL[record.event];
    const { event, ...fields } = entry;
    try {
      if (level === 'debug') options.logger.debug?.(fields, event);
      else options.logger[level](fields, event);
    } catch {}
  }
}
