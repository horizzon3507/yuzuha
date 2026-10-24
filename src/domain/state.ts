import type { CaseRecord } from './moderation.js';
import { YuzuhaError } from '../shared/errors.js';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type VariableScope = 'global' | 'guild' | 'user';

export interface ScheduleRecord {
  id: string;
  guildID: string;
  channelID: string;
  authorID: string;
  command: string;
  input: string;
  due: number;
  interval?: number;
  attempts: number;
  priority?: number;
  runningAt?: number | null;
  paused?: boolean;
  maxAttempts?: number;
  retryDelayMs?: number;
  retryBackoff?: number;
  retryJitter?: number;
  cron?: string;
  timezone?: string;
  missedRun?: 'skip' | 'run-once';
  claimID?: string | null;
}

export interface ScheduleExecutionRecord {
  id: string;
  task: ScheduleRecord;
  startedAt: number;
  finishedAt: number;
  status: 'success' | 'retrying' | 'failed';
  errorCode?: string;
  retryable: boolean;
}

export interface State {
  schema: 2;
  variables: Record<string, JsonValue>;
  variableExpirations?: Record<string, number>;
  cases: Record<string, CaseRecord[]>;
  schedules: ScheduleRecord[];
  scheduleHistory?: ScheduleExecutionRecord[];
}

export function variableKey(scope: string, id: string, name: string): string {
  if (!name || name.length > 128) throw new YuzuhaError('VARIABLE_KEY', 'Variável deve ter de 1 a 128 caracteres.');
  return JSON.stringify([scope, id, name]);
}

export function assertSynchronous(value: unknown): void {
  if (value && (typeof value === 'object' || typeof value === 'function') && 'then' in value) {
    void Promise.resolve(value).catch(() => {});
    throw new YuzuhaError('STORE_ASYNC', 'Callbacks de transação devem ser síncronos.');
  }
}
