import { nextCron } from '../../domain/cron.js';
import { variableIdentity, variableNameKey, variablePage } from '../../domain/variable-query.js';
import type { VariableQuery, VariablePage } from '../../domain/variable-query.js';
import type { JsonValue, ScheduleRecord } from '../../domain/state.js';
import type { CaseRecord } from '../../domain/moderation.js';
import type { VariableAccess, StoredVariable } from '../../ports/store.js';
import { validateCaseRecord, validateExpiration, validateVariableValue } from '../../domain/state-validation.js';
import { cloneValue } from '../../shared/clone.js';
import { chmod, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type {
  ScheduleClaimRequest,
  ScheduleClaimResult,
  ScheduleRecoveryResult,
  State,
  Store,
} from '../../contracts.js';
import { StoreError } from '../../errors.js';
import { defaultDataPath } from './paths.js';
import { TransactionQueue } from './queue.js';
import {
  SCHEDULE_FIELD_CLAIM_ID,
  SCHEDULE_FIELD_RUNNING_AT,
  ensureSchemaV3,
  hydrateScheduleRow,
  parseStoredJson,
  prepareSQLiteStatements,
  readNormalizedState,
  readNormalizedStateWithBaseline,
  writeNormalizedState,
} from './sqlite-schema.js';
import type { SQLiteStatements } from './sqlite-schema.js';
import { assertState, assertSynchronous } from './state.js';

function readNextDue(statements: SQLiteStatements): number | null {
  const row = statements.selectNextDue.get();
  return row?.['next_due'] === null || row?.['next_due'] === undefined ? null : Number(row['next_due']);
}

export class SQLiteStore implements Store {
  private database?: DatabaseSync;
  private statements?: SQLiteStatements;
  private closed = false;
  private readonly queue = new TransactionQueue();
  constructor(public readonly path = defaultDataPath().replace(/\.json$/, '.sqlite')) {}

  private async open(): Promise<DatabaseSync> {
    if (this.closed) throw new StoreError('STORE_CLOSED', 'O store SQLite está fechado.');
    if (this.database) return this.database;
    if (this.path !== ':memory:') await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(this.path);
    try {
      if (this.path !== ':memory:') await chmod(this.path, 0o600);
      db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
      ensureSchemaV3(db);
      this.statements = prepareSQLiteStatements(db);
      this.database = db;
      return db;
    } catch (error) {
      this.statements = undefined;
      db.close();
      throw error;
    }
  }

  read<T>(reader: (state: Readonly<State>) => T): Promise<T> {
    return this.queue.run(async () => {
      const db = await this.open();
      db.exec('BEGIN');
      let state: State;
      try {
        state = readNormalizedState(db, this.statements);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return reader(state);
    });
  }

  update<T>(writer: (state: State) => T): Promise<T> {
    return this.queue.run(async () => {
      const db = await this.open();
      db.exec('BEGIN IMMEDIATE');
      try {
        const { state, baseline } = readNormalizedStateWithBaseline(db, this.statements);
        const value = writer(state);
        assertSynchronous(value);
        assertState(state);
        const result = cloneValue(value);
        writeNormalizedState(db, state, this.statements, baseline);
        db.exec('COMMIT');
        return result;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    });
  }

  readVariable(key: string, clock: () => number): Promise<JsonValue | undefined> {
    return this.queue.run(async () => {
      await this.open();
      const now = clock();
      const parts = variableIdentity(key);
      const row = parts
        ? this.statements!.selectScopedVariable.get(parts[0], parts[1], variableNameKey(parts[2]), now)
        : this.statements!.selectRawVariable.get(key, now);
      if (!row) return undefined;
      return parseStoredJson(String(row['value_json'])) as JsonValue;
    });
  }

  private variableAccess(): VariableAccess {
    const stmts = this.statements!;
    return {
      get: key => {
        const parts = variableIdentity(key);
        const row = parts ? stmts.selectVariableEntry.get(parts[0], parts[1], variableNameKey(parts[2]))
          : stmts.selectRawVariableEntry.get(key);
        if (!row || row['value_json'] === null) return undefined;
        return { value: parseStoredJson(String(row['value_json'])) as JsonValue,
          expiresAt: row['expires_at'] === null ? null : Number(row['expires_at']) };
      },
      set: (key, value, expiry) => {
        if (!validateVariableValue(value) || (expiry !== null && !validateExpiration(expiry))) {
          throw new StoreError('STORE_INVALID', 'A transação produziu estado inválido; nenhuma alteração foi salva.');
        }
        const parts = variableIdentity(key);
        if (expiry !== null) stmts.markExpirations.run();
        if (parts) {
          stmts.deleteRawVariable.run(key);
          stmts.insertVariable.run(parts[0], parts[1], variableNameKey(parts[2]), JSON.stringify(parts[2]), JSON.stringify(value), expiry);
        } else stmts.insertRawVariable.run(key, JSON.stringify(value), expiry);
      },
      delete: key => {
        const parts = variableIdentity(key);
        if (parts) stmts.deleteVariable.run(parts[0], parts[1], variableNameKey(parts[2]));
        stmts.deleteRawVariable.run(key);
      },
    };
  }

  updateVariables<T>(writer: (variables: VariableAccess) => T): Promise<T> {
    return this.queue.run(async () => {
      const db = await this.open();
      db.exec('BEGIN IMMEDIATE');
      let active = true;
      const access = this.variableAccess();
      const check = () => {
        if (!active) throw new StoreError('TRANSACTION_CLOSED', 'A transação já terminou.');
      };
      try {
        const value = writer({
          get: key => { check(); return access.get(key); },
          set: (key, value, expiry) => { check(); access.set(key, value, expiry); },
          delete: key => { check(); access.delete(key); },
        });
        active = false;
        assertSynchronous(value);
        const result = cloneValue(value);
        db.exec('COMMIT');
        return result;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      finally { active = false; }
    });
  }

  readVariableEntry(key: string, clock: () => number): Promise<StoredVariable | undefined> {
    return this.queue.run(async () => {
      await this.open();
      const now = clock(), entry = this.variableAccess().get(key);
      return entry && (entry.expiresAt === null || entry.expiresAt > now) ? entry : undefined;
    });
  }

  appendCase(input: Omit<CaseRecord, 'id' | 'createdAt'>, createdAt: string): Promise<CaseRecord> {
    return this.queue.run(async () => {
      const db = await this.open();
      db.exec('BEGIN IMMEDIATE');
      try {
        const id = Number(this.statements!.nextCaseID.get(input.guildID)!['id']);
        const record: CaseRecord = { id, guildID: input.guildID, action: input.action, targetID: input.targetID,
          moderatorID: input.moderatorID, reason: input.reason, createdAt };
        if (input.duration !== undefined) record.duration = input.duration;
        if (input.channelID !== undefined) record.channelID = input.channelID;
        if (input.enabled !== undefined) record.enabled = input.enabled;
        if (!validateCaseRecord(input.guildID, record, id)) {
          throw new StoreError('STORE_INVALID', 'A transação produziu estado inválido; nenhuma alteração foi salva.');
        }
        const result = cloneValue(record);
        this.statements!.insertCase.run(record.guildID, id, record.action, record.targetID, record.moderatorID,
          record.reason, createdAt, record.channelID ?? null, record.channelID !== undefined ? 1 : 0,
          record.duration ?? null, record.enabled === undefined ? null : Number(record.enabled));
        db.exec('COMMIT');
        return result;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    });
  }

  queryVariables(query: VariableQuery, clock: () => number): Promise<VariablePage> {
    return this.queue.run(async () => {
      await this.open();
      const now = clock(), prefix = variableNameKey(query.prefix);
      const rows = this.statements!.queryVariables.all(
        query.scope,
        query.subject,
        prefix,
        prefix + 'g',
        query.after === undefined ? '' : variableNameKey(query.after),
        now,
        query.limit + 1,
      );
      return variablePage(rows.map(row => ({
        name: parseStoredJson(String(row['name_json'])) as string,
        value: parseStoredJson(String(row['value_json'])) as JsonValue,
        ttlMs: row['expires_at'] === null || row['expires_at'] === undefined ? -1 : Number(row['expires_at']) - now,
      })), query.limit);
    });
  }

  claimDueSchedules(request: ScheduleClaimRequest): Promise<ScheduleClaimResult> {
    return this.queue.run(async () => {
      const db = await this.open();
      if (request.canClaim && !request.canClaim()) return { claimed: [], nextDue: null };
      const stmts = this.statements!;
      if (!Number.isSafeInteger(request.limit) || request.limit < 1) {
        return { claimed: [], nextDue: readNextDue(stmts) };
      }
      const { now, globalConcurrency } = request;

      // Read-only precheck avoids acquiring a write lock when idle or saturated.
      db.exec('BEGIN');
      try {
        if (globalConcurrency !== undefined && Number(stmts.countRunningSchedules.get()!['count']) >= globalConcurrency) {
          const nextDue = readNextDue(stmts);
          db.exec('COMMIT');
          return { claimed: [], nextDue };
        }
        const preview = stmts.selectDueSchedules.all(now);
        if (preview.length === 0) {
          const nextDue = readNextDue(stmts);
          db.exec('COMMIT');
          return { claimed: [], nextDue };
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      if (request.canClaim && !request.canClaim()) return { claimed: [], nextDue: null };

      db.exec('BEGIN IMMEDIATE');
      try {
        let remaining = request.limit;
        if (globalConcurrency !== undefined) {
          const active = Number(stmts.countRunningSchedules.get()!['count']);
          remaining = Math.min(remaining, Math.max(0, globalConcurrency - active));
        }
        const claimed: ScheduleRecord[] = [];
        if (remaining > 0) {
          const mask = SCHEDULE_FIELD_RUNNING_AT | SCHEDULE_FIELD_CLAIM_ID;
          for (const row of stmts.selectDueSchedules.all(now)) {
            const task = hydrateScheduleRow(row);
            if (task.cron !== undefined && task.attempts === 0 && task.missedRun === 'skip' && task.due + 60_000 <= now) {
              const skippedDue = nextCron(task.cron, task.timezone!, Math.floor(now / 60_000) * 60_000 - 1);
              if (skippedDue > now) {
                stmts.updateScheduleDue.run(skippedDue, task.id);
                continue;
              }
              task.due = skippedDue;
            }
            const claimID = request.createClaimID();
            const result = stmts.claimSchedule.run(task.due, now, claimID, mask, task.id, now);
            if (Number(result.changes) === 1) {
              task.runningAt = now;
              task.claimID = claimID;
              claimed.push(task);
              if (claimed.length >= remaining) break;
            }
          }
        }
        const nextDue = readNextDue(stmts);
        db.exec('COMMIT');
        return { claimed, nextDue };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    });
  }

  recoverSchedules(cutoffRunningAt: number, activeClaimIDs: ReadonlySet<string>): Promise<ScheduleRecoveryResult> {
    return this.queue.run(async () => {
      const db = await this.open();
      const stmts = this.statements!;
      const hasStale = stmts.selectStaleSchedules.all(cutoffRunningAt)
        .some(row => row['claim_id'] === null || !activeClaimIDs.has(String(row['claim_id'])));
      if (!hasStale) return { freed: 0, nextDue: null };

      db.exec('BEGIN IMMEDIATE');
      try {
        const mask = SCHEDULE_FIELD_RUNNING_AT | SCHEDULE_FIELD_CLAIM_ID;
        let freed = 0;
        for (const row of stmts.selectStaleSchedules.all(cutoffRunningAt)) {
          const claimID = row['claim_id'] === null || row['claim_id'] === undefined ? '' : String(row['claim_id']);
          if (activeClaimIDs.has(claimID)) continue;
          const result = stmts.recoverSchedule.run(mask, String(row['id']), cutoffRunningAt);
          freed += Number(result.changes);
        }
        const nextDue = freed > 0 ? readNextDue(stmts) : null;
        db.exec('COMMIT');
        return { freed, nextDue };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    });
  }

  close(): Promise<void> {
    return this.queue.run(async () => {
      this.statements = undefined;
      this.database?.close();
      this.database = undefined;
      this.closed = true;
    });
  }
}
