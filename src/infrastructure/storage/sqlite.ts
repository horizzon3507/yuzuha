import { variableIdentity, variableNameKey, variablePage } from '../../domain/variable-query.js';
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
import {
  ensureSchemaV3,
  parseStoredJson,
  prepareSQLiteStatements,
  readNormalizedState,
  writeNormalizedState,
} from './sqlite-schema.js';
import type { SQLiteStatements } from './sqlite-schema.js';
import { assertState, assertSynchronous } from './state.js';

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
        const state = readNormalizedState(db, this.statements), value = writer(state);
        assertSynchronous(value);
        assertState(state);
        const result = cloneValue(value);
        writeNormalizedState(db, state, this.statements);
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

  close(): Promise<void> {
    return this.queue.run(async () => {
      this.statements = undefined;
      this.database?.close();
      this.database = undefined;
      this.closed = true;
    });
  }
}
