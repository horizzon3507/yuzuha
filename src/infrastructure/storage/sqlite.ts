import { cloneValue } from '../../shared/clone.js';
import { chmod, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { State, Store } from '../../contracts.js';
import { YuzuhaError } from '../../errors.js';
import { defaultDataPath } from './paths.js';
import { TransactionQueue } from './queue.js';
import { assertState, assertSynchronous, decodeState, emptyState } from './state.js';

export class SQLiteStore implements Store {
  private database?: DatabaseSync;
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
      this.database = db;
      return db;
    } catch (error) { db.close(); throw error; }
  }

  private state(db: DatabaseSync): State {
    const row = db.prepare('SELECT value FROM yuzuha_state WHERE id=1').get();
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
        db.prepare('UPDATE yuzuha_state SET value=? WHERE id=1').run(JSON.stringify(state));
        db.exec('COMMIT');
        return result;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    });
  }

  close(): Promise<void> {
    return this.queue.run(async () => { this.database?.close(); this.database = undefined; this.closed = true; });
  }
}
