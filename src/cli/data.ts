import type { Store } from '../ports/store.js';
import { decodeState } from '../domain/state-validation.js';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { JsonStore } from '../infrastructure/storage/json.js';
import { SQLiteStore } from '../infrastructure/storage/sqlite.js';
import { StateMaintenance } from '../services/state-maintenance.js';
import { YuzuhaError } from '../errors.js';
import type { CLIArguments } from './arguments.js';

async function readonlySQLite(path: string): Promise<Store> {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const row = db.prepare('SELECT value FROM yuzuha_state WHERE id=1').get();
    const state = decodeState(String(row?.['value']));
    return { read: async reader => reader(structuredClone(state)),
      update: async () => { throw new YuzuhaError('STORE_READONLY', 'Operação exige um store gravável.'); } };
  } finally { db.close(); }
}

export async function dataCommand(options: Extract<CLIArguments, { action: 'data' }>): Promise<unknown> {
  const path = resolve(options.input), extension = extname(path).toLowerCase();
  if (!['.json', '.sqlite', '.db'].includes(extension)) throw new YuzuhaError('DATA_FORMAT', 'Store deve terminar em .json, .sqlite ou .db.');
  if (!(await stat(path)).isFile()) throw new YuzuhaError('DATA_FORMAT', 'Informe um arquivo de estado existente.');
  const write = options.operation === 'cleanup' || (options.operation === 'restore' && options.apply);
  const store: Store = extension === '.json' ? new JsonStore(path) : write ? new SQLiteStore(path) : await readonlySQLite(path);
  const maintenance = new StateMaintenance(store);
  try {
    if (options.operation === 'stats') return await maintenance.stats();
    if (options.operation === 'cleanup') return await maintenance.cleanupExpired({ limit: options.limit, cursor: options.cursor });
    if (options.operation === 'backup') {
      const backup = await maintenance.backup();
      if (!options.file) return backup;
      await writeFile(resolve(options.file), `${JSON.stringify(backup, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      return { written: resolve(options.file), version: backup.version };
    }
    const backupPath = resolve(options.file!);
    if (!(await stat(backupPath)).isFile() || (await stat(backupPath)).size > 50_000_000) throw new YuzuhaError('BACKUP_INVALID', 'Backup deve ser arquivo JSON de até 50000000 bytes.');
    let value: unknown;
    try { value = JSON.parse(await readFile(backupPath, 'utf8')); }
    catch (cause) { throw new YuzuhaError('BACKUP_INVALID', 'Backup deve ser JSON válido.', { cause }); }
    return await maintenance.restore(value, { policy: options.policy ?? 'replace', dryRun: !options.apply });
  } finally { await store.close?.(); }
}
