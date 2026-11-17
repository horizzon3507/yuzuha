import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { CaseRecord, ModerationAction } from '../../domain/moderation.js';
import type { JsonValue, ScheduleExecutionRecord, ScheduleRecord, State } from '../../domain/state.js';
import { variableKey } from '../../domain/state.js';
import { isState, decodeState } from '../../domain/state-validation.js';
import { variableIdentity, variableNameKey } from '../../domain/variable-query.js';
import { StoreError } from '../../shared/errors.js';

export const SQLITE_SCHEMA_VERSION = 3;

export const SCHEMA_V3_TABLES = [
  'yuzuha_meta',
  'yuzuha_variables',
  'yuzuha_raw_variables',
  'yuzuha_cases',
  'yuzuha_schedules',
  'yuzuha_schedule_history',
] as const;

export const SCHEMA_V3_DDL = `
  CREATE TABLE IF NOT EXISTS yuzuha_meta (
    id INTEGER PRIMARY KEY CHECK (id=1),
    schema_version INTEGER NOT NULL DEFAULT 3,
    has_expirations INTEGER NOT NULL DEFAULT 0,
    has_history INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS yuzuha_variables (
    scope TEXT NOT NULL,
    subject TEXT NOT NULL,
    name_key TEXT NOT NULL,
    name_json TEXT NOT NULL,
    value_json TEXT NOT NULL,
    expires_at INTEGER,
    PRIMARY KEY (scope, subject, name_key)
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS yuzuha_raw_variables (
    key TEXT PRIMARY KEY,
    value_json TEXT,
    expires_at INTEGER
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS yuzuha_cases (
    guild_id TEXT NOT NULL,
    id INTEGER NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    channel_id TEXT,
    channel_id_present INTEGER NOT NULL DEFAULT 0,
    duration INTEGER,
    enabled INTEGER,
    PRIMARY KEY (guild_id, id)
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS yuzuha_schedules (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    command TEXT NOT NULL,
    input TEXT NOT NULL,
    due INTEGER NOT NULL,
    interval_ms INTEGER,
    attempts INTEGER NOT NULL,
    running_at INTEGER,
    paused INTEGER NOT NULL DEFAULT 0,
    claim_id TEXT,
    max_attempts INTEGER,
    retry_delay_ms INTEGER,
    retry_backoff REAL,
    priority INTEGER NOT NULL DEFAULT 0,
    retry_jitter REAL,
    cron TEXT,
    timezone TEXT,
    missed_run TEXT,
    present_fields INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS yuzuha_schedules_due_idx ON yuzuha_schedules (paused, running_at, due);
  CREATE TABLE IF NOT EXISTS yuzuha_schedule_history (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL,
    task_json TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER NOT NULL,
    status TEXT NOT NULL,
    retryable INTEGER NOT NULL,
    error_code TEXT
  );
`;

export const LEGACY_V2_CLEANUP_SQL = `
  DROP TRIGGER IF EXISTS yuzuha_variables_dirty;
  DROP TABLE IF EXISTS yuzuha_variable_index;
  DROP TABLE IF EXISTS yuzuha_variable_index_meta;
  DROP TABLE IF EXISTS yuzuha_state;
`;

export interface SQLiteMeta {
  schemaVersion: number;
  hasExpirations: boolean;
  hasHistory: boolean;
}

export interface SQLiteStatements {
  selectMeta: StatementSync;
  selectVariables: StatementSync;
  selectRawVariables: StatementSync;
  selectCases: StatementSync;
  selectSchedules: StatementSync;
  selectHistory: StatementSync;
  upsertMeta: StatementSync;
  insertVariable: StatementSync;
  insertRawVariable: StatementSync;
  insertCase: StatementSync;
  insertSchedule: StatementSync;
  insertHistory: StatementSync;
  selectScopedVariable: StatementSync;
  selectRawVariable: StatementSync;
  queryVariables: StatementSync;
}

export function prepareSQLiteStatements(db: DatabaseSync): SQLiteStatements {
  return {
    selectMeta: db.prepare('SELECT schema_version, has_expirations, has_history FROM yuzuha_meta WHERE id=1'),
    selectVariables: db.prepare('SELECT scope, subject, name_json, value_json, expires_at FROM yuzuha_variables'),
    selectRawVariables: db.prepare('SELECT key, value_json, expires_at FROM yuzuha_raw_variables'),
    selectCases: db.prepare('SELECT guild_id, id, action, target_id, moderator_id, reason, created_at, channel_id, channel_id_present, duration, enabled FROM yuzuha_cases ORDER BY guild_id, id'),
    selectSchedules: db.prepare('SELECT * FROM yuzuha_schedules ORDER BY rowid ASC'),
    selectHistory: db.prepare('SELECT id, task_json, started_at, finished_at, status, retryable, error_code FROM yuzuha_schedule_history ORDER BY seq ASC'),
    upsertMeta: db.prepare('INSERT OR REPLACE INTO yuzuha_meta (id, schema_version, has_expirations, has_history) VALUES (1, ?, ?, ?)'),
    insertVariable: db.prepare('INSERT INTO yuzuha_variables (scope, subject, name_key, name_json, value_json, expires_at) VALUES (?, ?, ?, ?, ?, ?)'),
    insertRawVariable: db.prepare('INSERT INTO yuzuha_raw_variables (key, value_json, expires_at) VALUES (?, ?, ?)'),
    insertCase: db.prepare('INSERT INTO yuzuha_cases (guild_id, id, action, target_id, moderator_id, reason, created_at, channel_id, channel_id_present, duration, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    insertSchedule: db.prepare(`INSERT INTO yuzuha_schedules (
      id, guild_id, channel_id, author_id, command, input, due, interval_ms, attempts,
      running_at, paused, claim_id, max_attempts, retry_delay_ms, retry_backoff,
      priority, retry_jitter, cron, timezone, missed_run, present_fields
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    insertHistory: db.prepare('INSERT INTO yuzuha_schedule_history (id, task_json, started_at, finished_at, status, retryable, error_code) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    selectScopedVariable: db.prepare(
      'SELECT value_json FROM yuzuha_variables WHERE scope=? AND subject=? AND name_key=? AND (expires_at IS NULL OR expires_at>?)',
    ),
    selectRawVariable: db.prepare(
      'SELECT value_json FROM yuzuha_raw_variables WHERE key=? AND value_json IS NOT NULL AND (expires_at IS NULL OR expires_at>?)',
    ),
    queryVariables: db.prepare(`SELECT name_json, value_json, expires_at FROM yuzuha_variables
      WHERE scope=? AND subject=? AND name_key>=? AND name_key<? AND name_key>?
      AND (expires_at IS NULL OR expires_at>?) ORDER BY name_key LIMIT ?`),
  };
}

export const SCHEDULE_FIELD_RUNNING_AT = 1;
export const SCHEDULE_FIELD_CLAIM_ID = 2;
export const SCHEDULE_FIELD_PAUSED = 4;
export const SCHEDULE_FIELD_PRIORITY = 8;

export function corruptStoreError(cause?: unknown): StoreError {
  return new StoreError(
    'STORE_CORRUPT',
    'Estado inválido. Preserve os dados e restaure um backup; eles não foram sobrescritos.',
    cause === undefined ? undefined : { cause },
  );
}

export function setOwnProperty<T extends object>(target: T, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
}

export function parseStoredJson(raw: string): unknown {
  try { return JSON.parse(raw); }
  catch (cause) { throw corruptStoreError(cause); }
}

export function listYuzuhaTables(db: DatabaseSync): Set<string> {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'yuzuha_%'").all();
  return new Set(rows.map(row => String(row['name'])));
}

export function readSQLiteMeta(db: DatabaseSync, stmt?: StatementSync): SQLiteMeta {
  const row = (stmt ?? db.prepare('SELECT schema_version, has_expirations, has_history FROM yuzuha_meta WHERE id=1')).get();
  if (!row || Number(row['schema_version']) !== SQLITE_SCHEMA_VERSION) throw corruptStoreError();
  return {
    schemaVersion: SQLITE_SCHEMA_VERSION,
    hasExpirations: Number(row['has_expirations']) !== 0,
    hasHistory: Number(row['has_history']) !== 0,
  };
}

export function schedulePresentFields(task: ScheduleRecord): number {
  let mask = 0;
  if (Object.hasOwn(task, 'runningAt') && task.runningAt !== undefined) mask |= SCHEDULE_FIELD_RUNNING_AT;
  if (Object.hasOwn(task, 'claimID') && task.claimID !== undefined) mask |= SCHEDULE_FIELD_CLAIM_ID;
  if (Object.hasOwn(task, 'paused') && task.paused !== undefined) mask |= SCHEDULE_FIELD_PAUSED;
  if (Object.hasOwn(task, 'priority') && task.priority !== undefined) mask |= SCHEDULE_FIELD_PRIORITY;
  return mask;
}

export function hydrateCaseRow(row: Record<string, unknown>): CaseRecord {
  const record: CaseRecord = {
    id: Number(row['id']),
    guildID: String(row['guild_id']),
    action: String(row['action']) as ModerationAction,
    targetID: String(row['target_id']),
    moderatorID: String(row['moderator_id']),
    reason: String(row['reason']),
    createdAt: String(row['created_at']),
  };
  if (row['duration'] !== null && row['duration'] !== undefined) record.duration = Number(row['duration']);
  if (row['channel_id'] !== null && row['channel_id'] !== undefined) record.channelID = String(row['channel_id']);
  else if (Number(row['channel_id_present'] ?? 0) !== 0) record.channelID = null;
  if (row['enabled'] !== null && row['enabled'] !== undefined) record.enabled = Number(row['enabled']) !== 0;
  return record;
}

export function hydrateScheduleRow(row: Record<string, unknown>): ScheduleRecord {
  const mask = Number(row['present_fields'] ?? 0);
  const record: ScheduleRecord = {
    id: String(row['id']),
    guildID: String(row['guild_id']),
    channelID: String(row['channel_id']),
    authorID: String(row['author_id']),
    command: String(row['command']),
    input: String(row['input']),
    due: Number(row['due']),
    attempts: Number(row['attempts']),
  };
  if (row['interval_ms'] !== null && row['interval_ms'] !== undefined) record.interval = Number(row['interval_ms']);
  if (row['running_at'] !== null && row['running_at'] !== undefined) record.runningAt = Number(row['running_at']);
  else if ((mask & SCHEDULE_FIELD_RUNNING_AT) !== 0) record.runningAt = null;
  if (Number(row['paused'] ?? 0) !== 0) record.paused = true;
  else if ((mask & SCHEDULE_FIELD_PAUSED) !== 0) record.paused = false;
  if (row['claim_id'] !== null && row['claim_id'] !== undefined) record.claimID = String(row['claim_id']);
  else if ((mask & SCHEDULE_FIELD_CLAIM_ID) !== 0) record.claimID = null;
  if (row['max_attempts'] !== null && row['max_attempts'] !== undefined) record.maxAttempts = Number(row['max_attempts']);
  if (row['retry_delay_ms'] !== null && row['retry_delay_ms'] !== undefined) record.retryDelayMs = Number(row['retry_delay_ms']);
  if (row['retry_backoff'] !== null && row['retry_backoff'] !== undefined) record.retryBackoff = Number(row['retry_backoff']);
  if (Number(row['priority'] ?? 0) !== 0) record.priority = Number(row['priority']);
  else if ((mask & SCHEDULE_FIELD_PRIORITY) !== 0) record.priority = 0;
  if (row['retry_jitter'] !== null && row['retry_jitter'] !== undefined) record.retryJitter = Number(row['retry_jitter']);
  if (row['cron'] !== null && row['cron'] !== undefined) record.cron = String(row['cron']);
  if (row['timezone'] !== null && row['timezone'] !== undefined) record.timezone = String(row['timezone']);
  if (row['missed_run'] !== null && row['missed_run'] !== undefined) record.missedRun = String(row['missed_run']) as 'skip' | 'run-once';
  return record;
}

export function hydrateHistoryRow(row: Record<string, unknown>): ScheduleExecutionRecord {
  const entry: ScheduleExecutionRecord = {
    id: String(row['id']),
    task: parseStoredJson(String(row['task_json'])) as ScheduleRecord,
    startedAt: Number(row['started_at']),
    finishedAt: Number(row['finished_at']),
    status: String(row['status']) as ScheduleExecutionRecord['status'],
    retryable: Number(row['retryable']) !== 0,
  };
  if (row['error_code'] !== null && row['error_code'] !== undefined) entry.errorCode = String(row['error_code']);
  return entry;
}

export function readNormalizedState(db: DatabaseSync, statements?: SQLiteStatements): State {
  const meta = readSQLiteMeta(db, statements?.selectMeta);
  const variables: Record<string, JsonValue> = {};
  const expirations: Record<string, number> = {};
  let hasAnyExpiration = false;

  const selectVariables = statements?.selectVariables ?? db.prepare('SELECT scope, subject, name_json, value_json, expires_at FROM yuzuha_variables');
  for (const row of selectVariables.all()) {
    const scope = String(row['scope']), subject = String(row['subject']);
    const name = parseStoredJson(String(row['name_json']));
    if (!['global', 'guild', 'user'].includes(scope) || typeof name !== 'string' || !name || name.length > 128) {
      throw corruptStoreError();
    }
    const key = variableKey(scope, subject, name);
    setOwnProperty(variables, key, parseStoredJson(String(row['value_json'])) as JsonValue);
    if (row['expires_at'] !== null && row['expires_at'] !== undefined) {
      setOwnProperty(expirations, key, Number(row['expires_at']));
      hasAnyExpiration = true;
    }
  }

  const selectRawVariables = statements?.selectRawVariables ?? db.prepare('SELECT key, value_json, expires_at FROM yuzuha_raw_variables');
  for (const row of selectRawVariables.all()) {
    const key = String(row['key']);
    if (row['value_json'] !== null && row['value_json'] !== undefined) {
      setOwnProperty(variables, key, parseStoredJson(String(row['value_json'])) as JsonValue);
    }
    if (row['expires_at'] !== null && row['expires_at'] !== undefined) {
      setOwnProperty(expirations, key, Number(row['expires_at']));
      hasAnyExpiration = true;
    }
  }

  const cases: Record<string, CaseRecord[]> = {};
  const selectCases = statements?.selectCases ?? db.prepare('SELECT guild_id, id, action, target_id, moderator_id, reason, created_at, channel_id, channel_id_present, duration, enabled FROM yuzuha_cases ORDER BY guild_id, id');
  for (const row of selectCases.all()) {
    const record = hydrateCaseRow(row);
    let list = Object.hasOwn(cases, record.guildID) ? cases[record.guildID] : undefined;
    if (!list) {
      list = [];
      setOwnProperty(cases, record.guildID, list);
    }
    list.push(record);
  }

  const selectSchedules = statements?.selectSchedules ?? db.prepare('SELECT * FROM yuzuha_schedules ORDER BY rowid ASC');
  const selectHistory = statements?.selectHistory ?? db.prepare('SELECT id, task_json, started_at, finished_at, status, retryable, error_code FROM yuzuha_schedule_history ORDER BY seq ASC');
  const schedules = selectSchedules.all().map(hydrateScheduleRow);
  const history = selectHistory.all().map(hydrateHistoryRow);

  const state: State = { schema: 2, variables, cases, schedules };
  if (meta.hasExpirations || hasAnyExpiration) state.variableExpirations = expirations;
  if (meta.hasHistory || history.length > 0) state.scheduleHistory = history;
  if (!isState(state)) throw corruptStoreError();
  return state;
}

export function writeNormalizedState(db: DatabaseSync, state: Readonly<State>, statements?: SQLiteStatements): void {
  const seenScheduleIDs = new Set<string>();
  for (const task of state.schedules) {
    if (seenScheduleIDs.has(task.id)) {
      throw new StoreError('STORE_INVALID', 'A transação produziu estado inválido; nenhuma alteração foi salva.');
    }
    seenScheduleIDs.add(task.id);
  }

  const expirations = state.variableExpirations ?? {};
  const upsertMeta = statements?.upsertMeta ?? db.prepare('INSERT OR REPLACE INTO yuzuha_meta (id, schema_version, has_expirations, has_history) VALUES (1, ?, ?, ?)');
  upsertMeta.run(SQLITE_SCHEMA_VERSION, state.variableExpirations !== undefined ? 1 : 0, state.scheduleHistory !== undefined ? 1 : 0);

  db.exec('DELETE FROM yuzuha_variables; DELETE FROM yuzuha_raw_variables; DELETE FROM yuzuha_cases; DELETE FROM yuzuha_schedules; DELETE FROM yuzuha_schedule_history;');

  const insertScopedVar = statements?.insertVariable ?? db.prepare('INSERT INTO yuzuha_variables (scope, subject, name_key, name_json, value_json, expires_at) VALUES (?, ?, ?, ?, ?, ?)');
  const insertRawVar = statements?.insertRawVariable ?? db.prepare('INSERT INTO yuzuha_raw_variables (key, value_json, expires_at) VALUES (?, ?, ?)');
  for (const [key, value] of Object.entries(state.variables)) {
    const expiry = Object.hasOwn(expirations, key) ? expirations[key]! : null;
    const parts = variableIdentity(key);
    if (parts) {
      insertScopedVar.run(parts[0], parts[1], variableNameKey(parts[2]), JSON.stringify(parts[2]), JSON.stringify(value), expiry);
    } else {
      insertRawVar.run(key, JSON.stringify(value), expiry);
    }
  }
  for (const [key, expiry] of Object.entries(expirations)) {
    if (!Object.hasOwn(state.variables, key)) insertRawVar.run(key, null, expiry);
  }

  const insertCase = statements?.insertCase ?? db.prepare('INSERT INTO yuzuha_cases (guild_id, id, action, target_id, moderator_id, reason, created_at, channel_id, channel_id_present, duration, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const list of Object.values(state.cases)) {
    for (const item of list) {
      insertCase.run(
        item.guildID,
        item.id,
        item.action,
        item.targetID,
        item.moderatorID,
        item.reason,
        item.createdAt,
        item.channelID ?? null,
        item.channelID !== undefined ? 1 : 0,
        item.duration ?? null,
        item.enabled === undefined ? null : (item.enabled ? 1 : 0),
      );
    }
  }

  const insertSchedule = statements?.insertSchedule ?? db.prepare(`INSERT INTO yuzuha_schedules (
    id, guild_id, channel_id, author_id, command, input, due, interval_ms, attempts,
    running_at, paused, claim_id, max_attempts, retry_delay_ms, retry_backoff,
    priority, retry_jitter, cron, timezone, missed_run, present_fields
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const item of state.schedules) {
    insertSchedule.run(
      item.id,
      item.guildID,
      item.channelID,
      item.authorID,
      item.command,
      item.input,
      item.due,
      item.interval ?? null,
      item.attempts,
      item.runningAt ?? null,
      item.paused ? 1 : 0,
      item.claimID ?? null,
      item.maxAttempts ?? null,
      item.retryDelayMs ?? null,
      item.retryBackoff ?? null,
      item.priority ?? 0,
      item.retryJitter ?? null,
      item.cron ?? null,
      item.timezone ?? null,
      item.missedRun ?? null,
      schedulePresentFields(item),
    );
  }

  const insertHistory = statements?.insertHistory ?? db.prepare('INSERT INTO yuzuha_schedule_history (id, task_json, started_at, finished_at, status, retryable, error_code) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const item of state.scheduleHistory ?? []) {
    insertHistory.run(
      item.id,
      JSON.stringify(item.task),
      item.startedAt,
      item.finishedAt,
      item.status,
      item.retryable ? 1 : 0,
      item.errorCode ?? null,
    );
  }
}

function verifySchemaV3(db: DatabaseSync, tables: ReadonlySet<string>): void {
  for (const required of SCHEMA_V3_TABLES) {
    if (!tables.has(required)) throw corruptStoreError();
  }
  readSQLiteMeta(db);
}

export function ensureSchemaV3(db: DatabaseSync): void {
  const initialTables = listYuzuhaTables(db);
  if (initialTables.has('yuzuha_meta')) {
    verifySchemaV3(db, initialTables);
    return;
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const tables = listYuzuhaTables(db);
    if (tables.has('yuzuha_meta')) {
      verifySchemaV3(db, tables);
    } else if (tables.has('yuzuha_state')) {
      const row = db.prepare('SELECT value FROM yuzuha_state WHERE id=1').get();
      if (!row) throw corruptStoreError();
      const state = decodeState(String(row['value']));
      db.exec(SCHEMA_V3_DDL);
      writeNormalizedState(db, state);
      db.exec(LEGACY_V2_CLEANUP_SQL);
    } else if (tables.size > 0) {
      throw corruptStoreError();
    } else {
      db.exec(SCHEMA_V3_DDL);
      db.prepare('INSERT INTO yuzuha_meta (id, schema_version, has_expirations, has_history) VALUES (1, ?, 0, 0)')
        .run(SQLITE_SCHEMA_VERSION);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
