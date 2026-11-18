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
  deleteVariable: StatementSync;
  insertRawVariable: StatementSync;
  deleteRawVariable: StatementSync;
  insertCase: StatementSync;
  deleteCase: StatementSync;
  insertSchedule: StatementSync;
  updateSchedule: StatementSync;
  deleteSchedule: StatementSync;
  insertHistory: StatementSync;
  deleteHistorySeq: StatementSync;
  selectScopedVariable: StatementSync;
  selectRawVariable: StatementSync;
  queryVariables: StatementSync;
  selectNextDue: StatementSync;
  countRunningSchedules: StatementSync;
  selectDueSchedules: StatementSync;
  updateScheduleDue: StatementSync;
  claimSchedule: StatementSync;
  selectStaleSchedules: StatementSync;
  recoverSchedule: StatementSync;
}

export function prepareSQLiteStatements(db: DatabaseSync): SQLiteStatements {
  return {
    selectMeta: db.prepare('SELECT schema_version, has_expirations, has_history FROM yuzuha_meta WHERE id=1'),
    selectVariables: db.prepare('SELECT scope, subject, name_key, name_json, value_json, expires_at FROM yuzuha_variables'),
    selectRawVariables: db.prepare('SELECT key, value_json, expires_at FROM yuzuha_raw_variables'),
    selectCases: db.prepare('SELECT guild_id, id, action, target_id, moderator_id, reason, created_at, channel_id, channel_id_present, duration, enabled FROM yuzuha_cases ORDER BY guild_id, id'),
    selectSchedules: db.prepare('SELECT * FROM yuzuha_schedules ORDER BY rowid ASC'),
    selectHistory: db.prepare('SELECT seq, id, task_json, started_at, finished_at, status, retryable, error_code FROM yuzuha_schedule_history ORDER BY seq ASC'),
    upsertMeta: db.prepare('INSERT OR REPLACE INTO yuzuha_meta (id, schema_version, has_expirations, has_history) VALUES (1, ?, ?, ?)'),
    insertVariable: db.prepare('INSERT OR REPLACE INTO yuzuha_variables (scope, subject, name_key, name_json, value_json, expires_at) VALUES (?, ?, ?, ?, ?, ?)'),
    deleteVariable: db.prepare('DELETE FROM yuzuha_variables WHERE scope=? AND subject=? AND name_key=?'),
    insertRawVariable: db.prepare('INSERT OR REPLACE INTO yuzuha_raw_variables (key, value_json, expires_at) VALUES (?, ?, ?)'),
    deleteRawVariable: db.prepare('DELETE FROM yuzuha_raw_variables WHERE key=?'),
    insertCase: db.prepare('INSERT OR REPLACE INTO yuzuha_cases (guild_id, id, action, target_id, moderator_id, reason, created_at, channel_id, channel_id_present, duration, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    deleteCase: db.prepare('DELETE FROM yuzuha_cases WHERE guild_id=? AND id=?'),
    insertSchedule: db.prepare(`INSERT INTO yuzuha_schedules (
      id, guild_id, channel_id, author_id, command, input, due, interval_ms, attempts,
      running_at, paused, claim_id, max_attempts, retry_delay_ms, retry_backoff,
      priority, retry_jitter, cron, timezone, missed_run, present_fields
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    updateSchedule: db.prepare(`UPDATE yuzuha_schedules SET
      guild_id=?, channel_id=?, author_id=?, command=?, input=?, due=?, interval_ms=?, attempts=?,
      running_at=?, paused=?, claim_id=?, max_attempts=?, retry_delay_ms=?, retry_backoff=?,
      priority=?, retry_jitter=?, cron=?, timezone=?, missed_run=?, present_fields=?
      WHERE id=?`),
    deleteSchedule: db.prepare('DELETE FROM yuzuha_schedules WHERE id=?'),
    insertHistory: db.prepare('INSERT INTO yuzuha_schedule_history (id, task_json, started_at, finished_at, status, retryable, error_code) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    deleteHistorySeq: db.prepare('DELETE FROM yuzuha_schedule_history WHERE seq=?'),
    selectScopedVariable: db.prepare(
      'SELECT value_json FROM yuzuha_variables WHERE scope=? AND subject=? AND name_key=? AND (expires_at IS NULL OR expires_at>?)',
    ),
    selectRawVariable: db.prepare(
      'SELECT value_json FROM yuzuha_raw_variables WHERE key=? AND value_json IS NOT NULL AND (expires_at IS NULL OR expires_at>?)',
    ),
    queryVariables: db.prepare(`SELECT name_json, value_json, expires_at FROM yuzuha_variables
      WHERE scope=? AND subject=? AND name_key>=? AND name_key<? AND name_key>?
      AND (expires_at IS NULL OR expires_at>?) ORDER BY name_key LIMIT ?`),
    selectNextDue: db.prepare('SELECT MIN(due) AS next_due FROM yuzuha_schedules WHERE paused=0 AND running_at IS NULL'),
    countRunningSchedules: db.prepare('SELECT COUNT(*) AS count FROM yuzuha_schedules WHERE running_at IS NOT NULL'),
    selectDueSchedules: db.prepare('SELECT * FROM yuzuha_schedules WHERE paused=0 AND running_at IS NULL AND due<=? ORDER BY priority DESC, due ASC, rowid ASC'),
    updateScheduleDue: db.prepare('UPDATE yuzuha_schedules SET due=? WHERE id=? AND paused=0 AND running_at IS NULL'),
    claimSchedule: db.prepare('UPDATE yuzuha_schedules SET due=?, running_at=?, claim_id=?, present_fields=(present_fields | ?) WHERE id=? AND paused=0 AND running_at IS NULL AND due<=?'),
    selectStaleSchedules: db.prepare('SELECT id, claim_id FROM yuzuha_schedules WHERE running_at IS NOT NULL AND running_at<?'),
    recoverSchedule: db.prepare('UPDATE yuzuha_schedules SET running_at=NULL, claim_id=NULL, present_fields=(present_fields | ?) WHERE id=? AND running_at IS NOT NULL AND running_at<?'),
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

export interface NormalizedBaseline {
  hasExpirations: boolean;
  hasHistory: boolean;
  scopedVars: Map<string, { scope: string; subject: string; nameKey: string; valueJson: string; expiresAt: number | null }>;
  rawVars: Map<string, { valueJson: string | null; expiresAt: number | null }>;
  cases: Map<string, { guildID: string; id: number; signature: string }>;
  schedules: { id: string; signature: string }[];
  history: { seq: number; signature: string }[];
}

function caseSignature(item: CaseRecord): string {
  return JSON.stringify([
    item.action,
    item.targetID,
    item.moderatorID,
    item.reason,
    item.createdAt,
    item.channelID === undefined ? null : item.channelID,
    item.channelID !== undefined ? 1 : 0,
    item.duration ?? null,
    item.enabled === undefined ? null : (item.enabled ? 1 : 0),
  ]);
}

function scheduleSignature(item: ScheduleRecord): string {
  return JSON.stringify([
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
  ]);
}

function historySignature(item: ScheduleExecutionRecord): string {
  return JSON.stringify([
    item.id,
    item.task,
    item.startedAt,
    item.finishedAt,
    item.status,
    item.retryable ? 1 : 0,
    item.errorCode ?? null,
  ]);
}

export function readNormalizedStateWithBaseline(
  db: DatabaseSync,
  statements?: SQLiteStatements,
): { state: State; baseline: NormalizedBaseline } {
  const meta = readSQLiteMeta(db, statements?.selectMeta);
  const variables: Record<string, JsonValue> = {};
  const expirations: Record<string, number> = {};
  const scopedVars: NormalizedBaseline['scopedVars'] = new Map();
  const rawVars: NormalizedBaseline['rawVars'] = new Map();
  const casesBaseline: NormalizedBaseline['cases'] = new Map();
  const schedulesBaseline: NormalizedBaseline['schedules'] = [];
  const historyBaseline: NormalizedBaseline['history'] = [];
  let hasAnyExpiration = false;

  const selectVariables = statements?.selectVariables
    ?? db.prepare('SELECT scope, subject, name_key, name_json, value_json, expires_at FROM yuzuha_variables');
  for (const row of selectVariables.all()) {
    const scope = String(row['scope']), subject = String(row['subject']);
    const name = parseStoredJson(String(row['name_json']));
    if (!['global', 'guild', 'user'].includes(scope) || typeof name !== 'string' || !name || name.length > 128) {
      throw corruptStoreError();
    }
    const key = variableKey(scope, subject, name);
    const valueJson = String(row['value_json']);
    const expiresAt = row['expires_at'] === null || row['expires_at'] === undefined ? null : Number(row['expires_at']);
    setOwnProperty(variables, key, parseStoredJson(valueJson) as JsonValue);
    if (expiresAt !== null) {
      setOwnProperty(expirations, key, expiresAt);
      hasAnyExpiration = true;
    }
    scopedVars.set(key, {
      scope,
      subject,
      nameKey: row['name_key'] === undefined ? variableNameKey(name) : String(row['name_key']),
      valueJson,
      expiresAt,
    });
  }

  const selectRawVariables = statements?.selectRawVariables ?? db.prepare('SELECT key, value_json, expires_at FROM yuzuha_raw_variables');
  for (const row of selectRawVariables.all()) {
    const key = String(row['key']);
    const valueJson = row['value_json'] === null || row['value_json'] === undefined ? null : String(row['value_json']);
    const expiresAt = row['expires_at'] === null || row['expires_at'] === undefined ? null : Number(row['expires_at']);
    if (valueJson !== null) setOwnProperty(variables, key, parseStoredJson(valueJson) as JsonValue);
    if (expiresAt !== null) {
      setOwnProperty(expirations, key, expiresAt);
      hasAnyExpiration = true;
    }
    rawVars.set(key, { valueJson, expiresAt });
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
    casesBaseline.set(JSON.stringify([record.guildID, record.id]), {
      guildID: record.guildID,
      id: record.id,
      signature: caseSignature(record),
    });
  }

  const selectSchedules = statements?.selectSchedules ?? db.prepare('SELECT * FROM yuzuha_schedules ORDER BY rowid ASC');
  const selectHistory = statements?.selectHistory ?? db.prepare('SELECT seq, id, task_json, started_at, finished_at, status, retryable, error_code FROM yuzuha_schedule_history ORDER BY seq ASC');
  const schedules = selectSchedules.all().map(row => {
    const item = hydrateScheduleRow(row);
    schedulesBaseline.push({ id: item.id, signature: scheduleSignature(item) });
    return item;
  });
  const history = selectHistory.all().map(row => {
    const entry = hydrateHistoryRow(row);
    historyBaseline.push({ seq: Number(row['seq']), signature: historySignature(entry) });
    return entry;
  });

  const state: State = { schema: 2, variables, cases, schedules };
  if (meta.hasExpirations || hasAnyExpiration) state.variableExpirations = expirations;
  if (meta.hasHistory || history.length > 0) state.scheduleHistory = history;
  if (!isState(state)) throw corruptStoreError();
  return {
    state,
    baseline: {
      hasExpirations: meta.hasExpirations,
      hasHistory: meta.hasHistory,
      scopedVars,
      rawVars,
      cases: casesBaseline,
      schedules: schedulesBaseline,
      history: historyBaseline,
    },
  };
}

export function readNormalizedState(db: DatabaseSync, statements?: SQLiteStatements): State {
  return readNormalizedStateWithBaseline(db, statements).state;
}

function runInsertSchedule(stmt: StatementSync, item: ScheduleRecord): void {
  stmt.run(
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

function runUpdateSchedule(stmt: StatementSync, item: ScheduleRecord): void {
  stmt.run(
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
    item.id,
  );
}

function syncVariables(
  db: DatabaseSync,
  state: Readonly<State>,
  statements: SQLiteStatements | undefined,
  baseline: NormalizedBaseline | undefined,
): void {
  const expirations = state.variableExpirations ?? {};
  const insertScoped = statements?.insertVariable
    ?? db.prepare('INSERT OR REPLACE INTO yuzuha_variables (scope, subject, name_key, name_json, value_json, expires_at) VALUES (?, ?, ?, ?, ?, ?)');
  const insertRaw = statements?.insertRawVariable
    ?? db.prepare('INSERT OR REPLACE INTO yuzuha_raw_variables (key, value_json, expires_at) VALUES (?, ?, ?)');

  if (!baseline) {
    db.exec('DELETE FROM yuzuha_variables; DELETE FROM yuzuha_raw_variables;');
    for (const [key, value] of Object.entries(state.variables)) {
      const expiry = Object.hasOwn(expirations, key) ? expirations[key]! : null;
      const parts = variableIdentity(key);
      if (parts) {
        insertScoped.run(parts[0], parts[1], variableNameKey(parts[2]), JSON.stringify(parts[2]), JSON.stringify(value), expiry);
      } else {
        insertRaw.run(key, JSON.stringify(value), expiry);
      }
    }
    for (const [key, expiry] of Object.entries(expirations)) {
      if (!Object.hasOwn(state.variables, key)) insertRaw.run(key, null, expiry);
    }
    return;
  }

  const seenScoped = new Set<string>();
  const seenRaw = new Set<string>();
  for (const [key, value] of Object.entries(state.variables)) {
    const expiry = Object.hasOwn(expirations, key) ? expirations[key]! : null;
    const valueJson = JSON.stringify(value);
    const parts = variableIdentity(key);
    if (parts) {
      seenScoped.add(key);
      const prev = baseline.scopedVars.get(key);
      if (!prev || prev.valueJson !== valueJson || prev.expiresAt !== expiry) {
        insertScoped.run(parts[0], parts[1], variableNameKey(parts[2]), JSON.stringify(parts[2]), valueJson, expiry);
      }
    } else {
      seenRaw.add(key);
      const prev = baseline.rawVars.get(key);
      if (!prev || prev.valueJson !== valueJson || prev.expiresAt !== expiry) {
        insertRaw.run(key, valueJson, expiry);
      }
    }
  }
  for (const [key, expiry] of Object.entries(expirations)) {
    if (Object.hasOwn(state.variables, key)) continue;
    seenRaw.add(key);
    const prev = baseline.rawVars.get(key);
    if (!prev || prev.valueJson !== null || prev.expiresAt !== expiry) {
      insertRaw.run(key, null, expiry);
    }
  }

  const deleteScoped = statements?.deleteVariable
    ?? db.prepare('DELETE FROM yuzuha_variables WHERE scope=? AND subject=? AND name_key=?');
  for (const [key, prev] of baseline.scopedVars) {
    if (!seenScoped.has(key)) deleteScoped.run(prev.scope, prev.subject, prev.nameKey);
  }
  const deleteRaw = statements?.deleteRawVariable ?? db.prepare('DELETE FROM yuzuha_raw_variables WHERE key=?');
  for (const key of baseline.rawVars.keys()) {
    if (!seenRaw.has(key)) deleteRaw.run(key);
  }
}

function syncCases(
  db: DatabaseSync,
  state: Readonly<State>,
  statements: SQLiteStatements | undefined,
  baseline: NormalizedBaseline | undefined,
): void {
  const insertCase = statements?.insertCase
    ?? db.prepare('INSERT OR REPLACE INTO yuzuha_cases (guild_id, id, action, target_id, moderator_id, reason, created_at, channel_id, channel_id_present, duration, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  if (!baseline) {
    db.exec('DELETE FROM yuzuha_cases;');
    for (const list of Object.values(state.cases)) {
      for (const item of list) {
        insertCase.run(
          item.guildID, item.id, item.action, item.targetID, item.moderatorID, item.reason, item.createdAt,
          item.channelID ?? null, item.channelID !== undefined ? 1 : 0,
          item.duration ?? null, item.enabled === undefined ? null : (item.enabled ? 1 : 0),
        );
      }
    }
    return;
  }

  const seen = new Set<string>();
  for (const list of Object.values(state.cases)) {
    for (const item of list) {
      const mapKey = JSON.stringify([item.guildID, item.id]);
      seen.add(mapKey);
      const signature = caseSignature(item);
      if (baseline.cases.get(mapKey)?.signature === signature) continue;
      insertCase.run(
        item.guildID, item.id, item.action, item.targetID, item.moderatorID, item.reason, item.createdAt,
        item.channelID ?? null, item.channelID !== undefined ? 1 : 0,
        item.duration ?? null, item.enabled === undefined ? null : (item.enabled ? 1 : 0),
      );
    }
  }
  const deleteCase = statements?.deleteCase ?? db.prepare('DELETE FROM yuzuha_cases WHERE guild_id=? AND id=?');
  for (const [mapKey, prev] of baseline.cases) {
    if (!seen.has(mapKey)) deleteCase.run(prev.guildID, prev.id);
  }
}

function syncSchedules(
  db: DatabaseSync,
  schedules: readonly ScheduleRecord[],
  statements: SQLiteStatements | undefined,
  baseline: NormalizedBaseline | undefined,
): void {
  const insertSchedule = statements?.insertSchedule ?? db.prepare(`INSERT INTO yuzuha_schedules (
    id, guild_id, channel_id, author_id, command, input, due, interval_ms, attempts,
    running_at, paused, claim_id, max_attempts, retry_delay_ms, retry_backoff,
    priority, retry_jitter, cron, timezone, missed_run, present_fields
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  if (!baseline) {
    db.exec('DELETE FROM yuzuha_schedules;');
    for (const item of schedules) runInsertSchedule(insertSchedule, item);
    return;
  }

  const prevByID = new Map<string, { index: number; signature: string }>();
  for (let i = 0; i < baseline.schedules.length; i++) {
    const entry = baseline.schedules[i]!;
    prevByID.set(entry.id, { index: i, signature: entry.signature });
  }

  // Delta-sync preserves rowid order only when retained IDs stay ordered before newly appended IDs.
  let lastIndex = -1;
  let seenNew = false;
  let canDelta = true;
  const nextIDs = new Set<string>();
  for (const item of schedules) {
    nextIDs.add(item.id);
    const prev = prevByID.get(item.id);
    if (prev) {
      if (seenNew || prev.index <= lastIndex) {
        canDelta = false;
        break;
      }
      lastIndex = prev.index;
    } else {
      seenNew = true;
    }
  }

  if (!canDelta) {
    db.exec('DELETE FROM yuzuha_schedules;');
    for (const item of schedules) runInsertSchedule(insertSchedule, item);
    return;
  }

  const deleteSchedule = statements?.deleteSchedule ?? db.prepare('DELETE FROM yuzuha_schedules WHERE id=?');
  for (const prev of baseline.schedules) {
    if (!nextIDs.has(prev.id)) deleteSchedule.run(prev.id);
  }
  const updateSchedule = statements?.updateSchedule ?? db.prepare(`UPDATE yuzuha_schedules SET
    guild_id=?, channel_id=?, author_id=?, command=?, input=?, due=?, interval_ms=?, attempts=?,
    running_at=?, paused=?, claim_id=?, max_attempts=?, retry_delay_ms=?, retry_backoff=?,
    priority=?, retry_jitter=?, cron=?, timezone=?, missed_run=?, present_fields=?
    WHERE id=?`);
  for (const item of schedules) {
    const prev = prevByID.get(item.id);
    if (!prev) runInsertSchedule(insertSchedule, item);
    else if (prev.signature !== scheduleSignature(item)) runUpdateSchedule(updateSchedule, item);
  }
}

function syncHistory(
  db: DatabaseSync,
  history: readonly ScheduleExecutionRecord[],
  statements: SQLiteStatements | undefined,
  baseline: NormalizedBaseline | undefined,
): void {
  const insertHistory = statements?.insertHistory
    ?? db.prepare('INSERT INTO yuzuha_schedule_history (id, task_json, started_at, finished_at, status, retryable, error_code) VALUES (?, ?, ?, ?, ?, ?, ?)');
  if (!baseline || history.length === 0) {
    if (!baseline || baseline.history.length > 0) db.exec('DELETE FROM yuzuha_schedule_history;');
    for (const item of history) {
      insertHistory.run(item.id, JSON.stringify(item.task), item.startedAt, item.finishedAt, item.status, item.retryable ? 1 : 0, item.errorCode ?? null);
    }
    return;
  }

  const prev = baseline.history;
  const nextSignatures = history.map(historySignature);
  let overlapOffset = prev.length;
  for (let offset = 0; offset < prev.length; offset++) {
    const remaining = prev.length - offset;
    if (remaining > history.length) continue;
    let matches = true;
    for (let i = 0; i < remaining; i++) {
      if (prev[offset + i]!.signature !== nextSignatures[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      overlapOffset = offset;
      break;
    }
  }

  if (overlapOffset === prev.length && prev.length > 0) {
    db.exec('DELETE FROM yuzuha_schedule_history;');
    for (const item of history) {
      insertHistory.run(item.id, JSON.stringify(item.task), item.startedAt, item.finishedAt, item.status, item.retryable ? 1 : 0, item.errorCode ?? null);
    }
    return;
  }

  const deleteSeq = statements?.deleteHistorySeq ?? db.prepare('DELETE FROM yuzuha_schedule_history WHERE seq=?');
  for (let i = 0; i < overlapOffset; i++) deleteSeq.run(prev[i]!.seq);
  const kept = prev.length - overlapOffset;
  for (let i = kept; i < history.length; i++) {
    const item = history[i]!;
    insertHistory.run(item.id, JSON.stringify(item.task), item.startedAt, item.finishedAt, item.status, item.retryable ? 1 : 0, item.errorCode ?? null);
  }
}

export function writeNormalizedState(
  db: DatabaseSync,
  state: Readonly<State>,
  statements?: SQLiteStatements,
  baseline?: NormalizedBaseline,
): void {
  const seenScheduleIDs = new Set<string>();
  for (const task of state.schedules) {
    if (seenScheduleIDs.has(task.id)) {
      throw new StoreError('STORE_INVALID', 'A transação produziu estado inválido; nenhuma alteração foi salva.');
    }
    seenScheduleIDs.add(task.id);
  }

  const hasExpirations = state.variableExpirations !== undefined;
  const hasHistory = state.scheduleHistory !== undefined;
  if (!baseline || baseline.hasExpirations !== hasExpirations || baseline.hasHistory !== hasHistory) {
    const upsertMeta = statements?.upsertMeta
      ?? db.prepare('INSERT OR REPLACE INTO yuzuha_meta (id, schema_version, has_expirations, has_history) VALUES (1, ?, ?, ?)');
    upsertMeta.run(SQLITE_SCHEMA_VERSION, hasExpirations ? 1 : 0, hasHistory ? 1 : 0);
  }

  syncVariables(db, state, statements, baseline);
  syncCases(db, state, statements, baseline);
  syncSchedules(db, state.schedules, statements, baseline);
  syncHistory(db, state.scheduleHistory ?? [], statements, baseline);
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
