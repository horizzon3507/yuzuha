import type { JsonValue, ScheduleExecutionRecord, ScheduleRecord, State } from './state.js';
import type { CaseRecord } from './moderation.js';
import { StoreError } from '../shared/errors.js';
import { assertTimezone, parseCron } from './cron.js';

const MODERATION_ACTIONS = new Set(['ban', 'kick', 'timeout', 'unban', 'move', 'mute', 'deafen']);
const HISTORY_STATUSES = new Set(['success', 'retrying', 'failed']);
const KNOWN_STATE_KEYS = new Set(['schema', 'variables', 'variableExpirations', 'cases', 'schedules', 'scheduleHistory']);

export function emptyState(): State { return { schema: 2, variables: {}, cases: {}, schedules: [] }; }

/** Returns true for plain objects with Object.prototype or null prototype. */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function json(value: unknown, ancestors?: Set<object>): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (ancestors?.has(value)) return false;
  if (!Array.isArray(value) && !isPlainRecord(value)) return false;
  const active = ancestors ?? new Set<object>();
  active.add(value);
  let valid = true;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) { valid = false; break; }
    }
  }
  if (valid) valid = Object.values(value).every(item => json(item, active));
  active.delete(value);
  return valid;
}

/** Validates a single JSON-compatible variable value without scanning sibling keys. */
export function validateVariableValue(value: unknown): value is JsonValue {
  return json(value);
}

/** Validates a variable expiration epoch timestamp in safe non-negative integer ms. */
export function validateExpiration(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Validates the entire variables map. */
export function validateVariables(value: unknown): value is Record<string, JsonValue> {
  return isPlainRecord(value) && json(value);
}

/** Validates the entire variableExpirations map. */
export function validateVariableExpirations(value: unknown): value is Record<string, number> {
  return isPlainRecord(value) && Object.values(value).every(validateExpiration);
}

function isCaseRecord(guildID: string, item: unknown, index: number): item is CaseRecord {
  return isPlainRecord(item)
    && item['id'] === index + 1 && item['guildID'] === guildID
    && typeof item['action'] === 'string' && MODERATION_ACTIONS.has(item['action'])
    && typeof item['targetID'] === 'string' && typeof item['moderatorID'] === 'string'
    && typeof item['reason'] === 'string' && typeof item['createdAt'] === 'string'
    && Number.isFinite(Date.parse(item['createdAt']))
    && (item['channelID'] === undefined || item['channelID'] === null || typeof item['channelID'] === 'string')
    && (item['enabled'] === undefined || typeof item['enabled'] === 'boolean')
    && (item['duration'] === undefined || (typeof item['duration'] === 'number'
      && Number.isSafeInteger(item['duration']) && item['duration'] > 0));
}

/** Validates a single guild's moderation case list without scanning other guilds. */
export function validateCasesForGuild(guildID: string, list: unknown): list is CaseRecord[] {
  return Array.isArray(list) && json(list) && list.every((item, index) => isCaseRecord(guildID, item, index));
}

/** Validates the full cases map across all guilds. */
export function validateCases(value: unknown): value is Record<string, CaseRecord[]> {
  return isPlainRecord(value) && Object.entries(value).every(([guildID, list]) => validateCasesForGuild(guildID, list));
}

function isScheduleFields(item: unknown): item is ScheduleRecord {
  if (!isPlainRecord(item)) return false;
  if (typeof item['id'] !== 'string' || typeof item['guildID'] !== 'string'
    || typeof item['channelID'] !== 'string' || typeof item['authorID'] !== 'string'
    || typeof item['command'] !== 'string' || typeof item['input'] !== 'string') return false;
  if (typeof item['due'] !== 'number' || !Number.isFinite(item['due'])) return false;
  if (item['interval'] !== undefined && (typeof item['interval'] !== 'number'
    || !Number.isFinite(item['interval']) || item['interval'] <= 0)) return false;
  if (typeof item['attempts'] !== 'number' || !Number.isInteger(item['attempts']) || item['attempts'] < 0) return false;
  if (item['runningAt'] !== undefined && item['runningAt'] !== null
    && (typeof item['runningAt'] !== 'number' || !Number.isFinite(item['runningAt']))) return false;
  if (item['paused'] !== undefined && typeof item['paused'] !== 'boolean') return false;
  if (item['claimID'] !== undefined && item['claimID'] !== null && typeof item['claimID'] !== 'string') return false;
  if (item['maxAttempts'] !== undefined && (!Number.isSafeInteger(item['maxAttempts']) || Number(item['maxAttempts']) < 1 || Number(item['maxAttempts']) > 100)) return false;
  if (item['retryDelayMs'] !== undefined && (!Number.isSafeInteger(item['retryDelayMs']) || Number(item['retryDelayMs']) < 1)) return false;
  if (item['retryBackoff'] !== undefined && (typeof item['retryBackoff'] !== 'number' || item['retryBackoff'] < 1 || item['retryBackoff'] > 10)) return false;
  if (item['priority'] !== undefined && (typeof item['priority'] !== 'number' || !Number.isSafeInteger(item['priority']) || item['priority'] < -1000 || item['priority'] > 1000)) return false;
  if (item['retryJitter'] !== undefined && (typeof item['retryJitter'] !== 'number' || !Number.isFinite(item['retryJitter']) || item['retryJitter'] < 0 || item['retryJitter'] > 1)) return false;
  if (item['cron'] !== undefined) {
    if (typeof item['cron'] !== 'string' || typeof item['timezone'] !== 'string' || item['interval'] !== undefined
      || (item['missedRun'] !== undefined && item['missedRun'] !== 'skip' && item['missedRun'] !== 'run-once')) return false;
    try { parseCron(item['cron']); assertTimezone(item['timezone']); } catch { return false; }
  } else if (item['timezone'] !== undefined || item['missedRun'] !== undefined) return false;
  return true;
}

/** Validates a single ScheduleRecord including JSON structural invariants. */
export function validateScheduleRecord(item: unknown): item is ScheduleRecord {
  return isPlainRecord(item) && json(item) && isScheduleFields(item);
}

/** Validates the schedules array slice. */
export function validateSchedules(value: unknown): value is ScheduleRecord[] {
  return Array.isArray(value) && json(value) && value.every(isScheduleFields);
}

function isScheduleHistoryFields(item: unknown): item is ScheduleExecutionRecord {
  return isPlainRecord(item)
    && typeof item['id'] === 'string' && isScheduleFields(item['task'])
    && typeof item['startedAt'] === 'number' && Number.isFinite(item['startedAt'])
    && typeof item['finishedAt'] === 'number' && Number.isFinite(item['finishedAt'])
    && typeof item['status'] === 'string' && HISTORY_STATUSES.has(item['status'])
    && typeof item['retryable'] === 'boolean'
    && (item['errorCode'] === undefined || typeof item['errorCode'] === 'string');
}

/** Validates a single ScheduleExecutionRecord including JSON structural invariants. */
export function validateScheduleHistoryEntry(item: unknown): item is ScheduleExecutionRecord {
  return isPlainRecord(item) && json(item) && isScheduleHistoryFields(item);
}

/** Validates the scheduleHistory array slice. */
export function validateScheduleHistory(value: unknown): value is ScheduleExecutionRecord[] {
  return Array.isArray(value) && json(value) && value.every(isScheduleHistoryFields);
}

function isLegacyState(value: unknown): value is { variables: Record<string, JsonValue>; cases: Record<string, State['cases'][string]> } {
  return isPlainRecord(value) && json(value) && value['schema'] === 1
    && isPlainRecord(value['variables']) && validateCases(value['cases']);
}

export function isState(value: unknown): value is State {
  if (!isPlainRecord(value) || value['schema'] !== 2) return false;
  for (const [key, entry] of Object.entries(value)) {
    if (!KNOWN_STATE_KEYS.has(key) && !json(entry)) return false;
  }
  if (!validateVariables(value['variables']) || !validateCases(value['cases'])) return false;
  if (Object.hasOwn(value, 'variableExpirations') && !validateVariableExpirations(value['variableExpirations'])) return false;
  if (Object.hasOwn(value, 'scheduleHistory') && !validateScheduleHistory(value['scheduleHistory'])) return false;
  return validateSchedules(value['schedules']);
}

export function assertState(value: unknown): asserts value is State {
  if (!isState(value)) throw new StoreError('STORE_INVALID', 'A transação produziu estado inválido; nenhuma alteração foi salva.');
}

export function decodeState(content: string): State {
  try {
    const value: unknown = JSON.parse(content);
    if (isState(value)) return value;
    if (isLegacyState(value)) {
      return { schema: 2, variables: { ...(value['variables'] as Record<string, JsonValue>) },
        cases: { ...(value['cases'] as State['cases']) }, schedules: [] };
    }
    throw new Error('Schema ou conteúdo inválido.');
  } catch (cause) {
    throw new StoreError('STORE_CORRUPT', 'Estado inválido. Preserve os dados e restaure um backup; eles não foram sobrescritos.', { cause });
  }
}

export { assertSynchronous } from './state.js';
