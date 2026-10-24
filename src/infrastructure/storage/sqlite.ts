import { variableIdentity, variableNameKey, variablePage } from '../../domain/variable-query.js';
import type { VariableQuery, VariablePage } from '../../domain/variable-query.js';
import type { JsonValue } from '../../domain/state.js';
import { cloneValue } from '../../shared/clone.js';
import { chmod, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { State, Store } from '../../contracts.js';
import { YuzuhaError } from '../../errors.js';
import { defaultDataPath } from './paths.js';
import { TransactionQueue } from './queue.js';
import { assertState, assertSynchronous, decodeState, emptyState } from './state.js';

export class SQLiteStore implements Store {
  private database?: DatabaseSync;
  private selectState?: StatementSync;
  private updateState?: StatementSync;
  private closed = false;
  private readonly queue = new TransactionQueue();
  constructor(public readonly path = defaultDataPath().replace(/\.json$/, '.sqlite')) {}

  private async open(): Promise<DatabaseSync> {
    if (this.closed) throw new YuzuhaError('STORE_CLOSED', 'O store SQLite está fechado.');
    if (this.database) return this.database;
    if (this.path !== ':memory:') await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(this.path);
    try {
      if (this.path !== ':memory:') await chmod(this.path, 0o600);
      db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS yuzuha_state (id INTEGER PRIMARY KEY CHECK (id=1), value TEXT NOT NULL);');
      db.prepare('INSERT OR IGNORE INTO yuzuha_state (id, value) VALUES (1, ?)').run(JSON.stringify(emptyState()));
      db.exec(`
        CREATE TABLE IF NOT EXISTS yuzuha_variable_index (
          scope TEXT NOT NULL, subject TEXT NOT NULL, name_key TEXT NOT NULL,
          name_json TEXT NOT NULL, value_json TEXT NOT NULL, expires_at INTEGER,
          PRIMARY KEY (scope, subject, name_key)
        ) WITHOUT ROWID;
        CREATE TABLE IF NOT EXISTS yuzuha_variable_index_meta (id INTEGER PRIMARY KEY CHECK (id=1), dirty INTEGER NOT NULL);
        INSERT OR IGNORE INTO yuzuha_variable_index_meta VALUES (1, 1);
        CREATE TRIGGER IF NOT EXISTS yuzuha_variables_dirty AFTER UPDATE OF value ON yuzuha_state
        BEGIN UPDATE yuzuha_variable_index_meta SET dirty=1 WHERE id=1; END;
      `);
      this.selectState = db.prepare('SELECT value FROM yuzuha_state WHERE id=1');
      this.updateState = db.prepare('UPDATE yuzuha_state SET value=? WHERE id=1');
      this.database = db;
      return db;
    } catch (error) { db.close(); throw error; }
  }

  private state(db: DatabaseSync): State {
    const row = this.selectState!.get();
    return decodeState(String(row?.['value']));
  }

  read<T>(reader: (state: Readonly<State>) => T): Promise<T> {
    return this.queue.run(async () => reader(this.state(await this.open())));
  }

  update<T>(writer: (state: State) => T): Promise<T> {
    return this.queue.run(async () => {
      const db = await this.open();
      db.exec('BEGIN IMMEDIATE');
      try {
        const state = this.state(db), value = writer(state);
        assertSynchronous(value);
        assertState(state);
        const result = cloneValue(value);
        this.updateState!.run(JSON.stringify(state));
        db.exec('COMMIT');
        return result;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    });
  }

  queryVariables(query: VariableQuery, clock: () => number): Promise<VariablePage> {
    return this.queue.run(async () => {
      const db = await this.open();
      db.exec('BEGIN IMMEDIATE');
      try {
        if (db.prepare('SELECT dirty FROM yuzuha_variable_index_meta WHERE id=1').get()!['dirty']) {
          const state = this.state(db);
          db.exec('DELETE FROM yuzuha_variable_index');
          const insert = db.prepare('INSERT INTO yuzuha_variable_index VALUES (?, ?, ?, ?, ?, ?)');
          for (const [key, value] of Object.entries(state.variables)) {
            const parts = variableIdentity(key);
            if (!parts) continue;
            insert.run(parts[0], parts[1], variableNameKey(parts[2]), JSON.stringify(parts[2]), JSON.stringify(value), state.variableExpirations?.[key] ?? null);
          }
          db.exec('UPDATE yuzuha_variable_index_meta SET dirty=0 WHERE id=1');
        }
        const now = clock(), prefix = variableNameKey(query.prefix);
        const rows = db.prepare(`SELECT name_json, value_json, expires_at FROM yuzuha_variable_index
          WHERE scope=? AND subject=? AND name_key>=? AND name_key<? AND name_key>?
          AND (expires_at IS NULL OR expires_at>?) ORDER BY name_key LIMIT ?`)
          .all(query.scope, query.subject, prefix, prefix + 'g', query.after === undefined ? '' : variableNameKey(query.after), now, query.limit + 1);
        const result = variablePage(rows.map(row => ({ name: JSON.parse(String(row['name_json'])) as string,
          value: JSON.parse(String(row['value_json'])) as JsonValue,
          ttlMs: row['expires_at'] === null ? -1 : Number(row['expires_at']) - now })), query.limit);
        db.exec('COMMIT');
        return result;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    });
  }

  close(): Promise<void> {
    return this.queue.run(async () => { this.database?.close(); this.database = undefined; this.selectState = undefined; this.updateState = undefined; this.closed = true; });
  }
}
