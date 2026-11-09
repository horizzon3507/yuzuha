import type { DispatchResult, YuzuhaOptions } from './options.js';
import type { SchedulerEvent } from '../services/scheduler.js';

type LogEvent = SchedulerEvent | {
  event: 'command.start' | 'command.finish' | 'event.start' | 'event.finish' | 'error'
    | 'transport.retry' | 'message.ttl_failed' | 'authorization.disabled';
  executionID?: string;
  command?: string;
  outcome?: DispatchResult;
  durationMs?: number;
  errorCode?: string;
  attempt?: number;
  messageID?: string;
  channelID?: string;
};
export type LogRecord = Readonly<{ timestamp: string } & LogEvent>;

export async function emitLog(options: Pick<YuzuhaOptions, 'onLog'>, record: LogEvent): Promise<void> {
  if (!options.onLog) return;
  try { await options.onLog(Object.freeze({ ...record, timestamp: new Date().toISOString() }) as LogRecord); }
  catch { console.error('[yuzuha] LOG_HANDLER_FAILED'); }
}
