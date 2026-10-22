import type { JsonValue, State } from './state.js';
import { YuzuhaError } from '../shared/errors.js';
import { assertTimezone, parseCron } from './cron.js';

export function emptyState(): State { return { schema: 2, variables: {}, cases: {}, schedules: [] }; }

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function json(value: unknown, ancestors = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  if (!Array.isArray(value) && !record(value)) return false;
  ancestors.add(value);
  let valid = true;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) { valid = false; break; }
    }
  }
  if (valid) valid = Object.values(value).every(item => json(item, ancestors));
  ancestors.delete(value);
  return valid;
}

function cases(value: unknown): boolean {
  if (!record(value)) return false;
  return Object.entries(value).every(([guildID, list]) => Array.isArray(list)
    && list.every((item: unknown, index: number) => record(item)
      && item['id'] === index + 1 && item['guildID'] === guildID
      && ['ban', 'kick', 'timeout', 'unban', 'move', 'mute', 'deafen'].includes(String(item['action']))
      && typeof item['targetID'] === 'string' && typeof item['moderatorID'] === 'string'
      && typeof item['reason'] === 'string' && typeof item['createdAt'] === 'string'
      && Number.isFinite(Date.parse(item['createdAt']))
      && (item['channelID'] === undefined || item['channelID'] === null || typeof item['channelID'] === 'string')
      && (item['enabled'] === undefined || typeof item['enabled'] === 'boolean')
      && (item['duration'] === undefined || (typeof item['duration'] === 'number'
        && Number.isSafeInteger(item['duration']) && item['duration'] > 0))));
}

function schedules(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.every(item => {
    if (!record(item)) return false;
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
    if (item['retryJitter'] !== undefined && (typeof item['retryJitter'] !== 'number' || !Number.isFinite(item['retryJitter']) || item['retryJitter'] < 0 || item['retryJitter'] > 1)) return false;
    if (item['cron'] !== undefined) {
      if (typeof item['cron'] !== 'string' || typeof item['timezone'] !== 'string' || item['interval'] !== undefined
        || (item['missedRun'] !== undefined && item['missedRun'] !== 'skip' && item['missedRun'] !== 'run-once')) return false;
      try { parseCron(item['cron']); assertTimezone(item['timezone']); } catch { return false; }
    } else if (item['timezone'] !== undefined || item['missedRun'] !== undefined) return false;
    return true;
  });
}

function isLegacyState(value: unknown): value is { variables: Record<string, JsonValue>; cases: Record<string, State['cases'][string]> } {
  return record(value) && json(value) && value['schema'] === 1
    && record(value['variables']) && cases(value['cases']);
}

export function isState(value: unknown): value is State {
  if (!record(value) || !json(value) || value['schema'] !== 2
    || !record(value['variables']) || !record(value['cases'])) return false;
  if (!cases(value['cases'])) return false;
  const expirations = value['variableExpirations'];
  if (expirations !== undefined && (!record(expirations)
    || !Object.values(expirations).every(expiry => typeof expiry === 'number' && Number.isSafeInteger(expiry) && expiry >= 0))) return false;
  const history = value['scheduleHistory'];
  if (history !== undefined && (!Array.isArray(history) || !history.every(item => record(item)
    && typeof item['id'] === 'string' && schedules([item['task']])
    && typeof item['startedAt'] === 'number' && Number.isFinite(item['startedAt'])
    && typeof item['finishedAt'] === 'number' && Number.isFinite(item['finishedAt'])
    && ['success', 'retrying', 'failed'].includes(String(item['status']))
    && typeof item['retryable'] === 'boolean'
    && (item['errorCode'] === undefined || typeof item['errorCode'] === 'string')))) return false;
  return schedules(value['schedules']);
}

export function assertState(value: unknown): asserts value is State {
  if (!isState(value)) throw new YuzuhaError('STORE_INVALID', 'A transação produziu estado inválido; nenhuma alteração foi salva.');
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
    throw new YuzuhaError('STORE_CORRUPT', 'Estado inválido. Preserve os dados e restaure um backup; eles não foram sobrescritos.', { cause });
  }
}

export { assertSynchronous } from './state.js';
