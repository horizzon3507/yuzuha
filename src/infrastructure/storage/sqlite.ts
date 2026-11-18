import { variableNameKey, variablePage } from '../../domain/variable-query.js';
import type { VariableQuery, VariablePage } from '../../domain/variable-query.js';
import type { JsonValue } from '../../domain/state.js';
import { cloneValue } from '../../shared/clone.js';
import { chmod, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { State, Store } from '../../contracts.js';
import { StoreError } from '../../errors.js';
import { defaultDataPath } from './paths.js';
import { TransactionQueue } from './queue.js';
import { ensureSchemaV3, parseStoredJson, readNormalizedState, writeNormalizedState } from './sqlite-schema.js';
import { assertState, assertSynchronous } from './state.js';

export class SQLiteStore implements Store {
  private database?: DatabaseSync;
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
      this.database = db;
      return db;
    } catch (error) { db.close(); throw error; }
  }

  read<T>(reader: (state: Readonly<State>) => T): Promise<T> {
    return this.queue.run(async () => {
      const db = await this.open();
      db.exec('BEGIN');
      let state: State;
      try {
        state = readNormalizedState(db);
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
        const state = readNormalizedState(db), value = writer(state);
        assertSynchronous(value);
        assertState(state);
        const result = cloneValue(value);
        writeNormalizedState(db, state);
        db.exec('COMMIT');
        return result;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    });
  }

  queryVariables(query: VariableQuery, clock: () => number): Promise<VariablePage> {
    return this.queue.run(async () => {
      const db = await this.open();
      const now = clock(), prefix = variableNameKey(query.prefix);
      const rows = db.prepare(`SELECT name_json, value_json, expires_at FROM yuzuha_variables
        WHERE scope=? AND subject=? AND name_key>=? AND name_key<? AND name_key>?
        AND (expires_at IS NULL OR expires_at>?) ORDER BY name_key LIMIT ?`)
        .all(query.scope, query.subject, prefix, prefix + 'g', query.after === undefined ? '' : variableNameKey(query.after), now, query.limit + 1);
      return variablePage(rows.map(row => ({
        name: parseStoredJson(String(row['name_json'])) as string,
        value: parseStoredJson(String(row['value_json'])) as JsonValue,
        ttlMs: row['expires_at'] === null ? -1 : Number(row['expires_at']) - now,
      })), query.limit);
    });
  }

  close(): Promise<void> {
    return this.queue.run(async () => { this.database?.close(); this.database = undefined; this.closed = true; });
  }
}
