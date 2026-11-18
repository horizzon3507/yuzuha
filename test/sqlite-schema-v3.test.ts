import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SQLiteStore, StateMaintenance, StoreError } from '../src/index.js';
import type { State } from '../src/index.js';
import { variableKey } from '../src/domain/state.js';
import { dataCommand } from '../src/cli/data.js';
import { SCHEMA_V3_TABLES } from '../src/infrastructure/storage/sqlite-schema.js';

function createLegacyV2Db(path: string, payload: unknown): void {
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      CREATE TABLE yuzuha_state (id INTEGER PRIMARY KEY CHECK (id=1), value TEXT NOT NULL);
      CREATE TABLE yuzuha_variable_index (
        scope TEXT NOT NULL, subject TEXT NOT NULL, name_key TEXT NOT NULL,
        name_json TEXT NOT NULL, value_json TEXT NOT NULL, expires_at INTEGER,
        PRIMARY KEY (scope, subject, name_key)
      ) WITHOUT ROWID;
      CREATE TABLE yuzuha_variable_index_meta (id INTEGER PRIMARY KEY CHECK (id=1), dirty INTEGER NOT NULL);
      INSERT INTO yuzuha_variable_index_meta VALUES (1, 1);
      CREATE TRIGGER yuzuha_variables_dirty AFTER UPDATE OF value ON yuzuha_state
      BEGIN UPDATE yuzuha_variable_index_meta SET dirty=1 WHERE id=1; END;
    `);
    db.prepare('INSERT INTO yuzuha_state (id, value) VALUES (1, ?)').run(JSON.stringify(payload));
  } finally {
    db.close();
  }
}

function richState(): State {
  const variables: Record<string, State['variables'][string]> = {
    [variableKey('global', '', 'prefix')]: '!',
    [variableKey('guild', '100', 'welcome')]: { text: 'olá', tags: [1, 2] },
    [variableKey('user', '42', 'score')]: 900,
    count: 12,
    total: 99,
    '': 'empty-raw',
  };
  Object.defineProperty(variables, '__proto__', {
    value: { safe: true },
    writable: true,
    enumerable: true,
    configurable: true,
  });

  const variableExpirations: Record<string, number> = {
    [variableKey('guild', '100', 'welcome')]: 20_000,
    count: 5_000,
    orphan_only: 0,
  };

  return {
    schema: 2,
    variables,
    variableExpirations,
    cases: {
      '100': [
        {
          id: 1,
          guildID: '100',
          action: 'ban',
          targetID: '200',
          moderatorID: '1',
          reason: 'spam',
          createdAt: '2026-10-20T12:00:00.000Z',
          duration: 3600,
          channelID: null,
          enabled: false,
        },
        {
          id: 2,
          guildID: '100',
          action: 'mute',
          targetID: '201',
          moderatorID: '1',
          reason: 'flood',
          createdAt: '2026-10-20T12:05:00.000Z',
          channelID: '300',
          enabled: true,
        },
      ],
    },
    schedules: [
      {
        id: 'task-1',
        guildID: '100',
        channelID: '300',
        authorID: '1',
        command: 'ping',
        input: 'hi',
        due: 50_000,
        interval: 10_000,
        attempts: 1,
        priority: 0,
        runningAt: null,
        paused: false,
        maxAttempts: 4,
        retryDelayMs: 500,
        retryBackoff: 1.5,
        retryJitter: 0,
        claimID: null,
      },
      {
        id: 'task-2',
        guildID: '100',
        channelID: '300',
        authorID: '2',
        command: 'cron',
        input: '',
        due: 60_000,
        attempts: 0,
        priority: 10,
        paused: true,
        cron: '0 * * * *',
        timezone: 'UTC',
        missedRun: 'skip',
      },
    ],
    scheduleHistory: [
      {
        id: 'run-1',
        task: {
          id: 'task-old',
          guildID: '100',
          channelID: '300',
          authorID: '1',
          command: 'ping',
          input: '',
          due: 1000,
          attempts: 0,
        },
        startedAt: 1000,
        finishedAt: 1020,
        status: 'success',
        retryable: false,
      },
      {
        id: 'run-2',
        task: {
          id: 'task-err',
          guildID: '100',
          channelID: '300',
          authorID: '1',
          command: 'warn',
          input: 'x',
          due: 2000,
          attempts: 2,
        },
        startedAt: 2000,
        finishedAt: 2050,
        status: 'failed',
        errorCode: 'API_ERROR',
        retryable: true,
      },
    ],
  };
}

test('schema v3 cria tabelas normalizadas, sem artefatos v2, e preserva roundtrip completo', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'yuzuha-v3-schema-'));
  const path = join(dir, 'state.sqlite');
  const store = new SQLiteStore(path);
  let reopened: SQLiteStore | undefined;
  t.after(async () => {
    await store.close();
    await reopened?.close();
    await rm(dir, { recursive: true, force: true });
  });

  const expected = richState();
  await store.update(state => {
    state.variables = expected.variables;
    state.variableExpirations = expected.variableExpirations;
    state.cases = expected.cases;
    state.schedules = expected.schedules;
    state.scheduleHistory = expected.scheduleHistory;
  });

  const raw = new DatabaseSync(path, { readOnly: true });
  try {
    const tables = new Set(
      raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => String(r['name'])),
    );
    for (const name of SCHEMA_V3_TABLES) assert.ok(tables.has(name), `faltou tabela ${name}`);
    assert.equal(tables.has('yuzuha_state'), false);
    assert.equal(tables.has('yuzuha_variable_index'), false);
    assert.equal(tables.has('yuzuha_variable_index_meta'), false);
    const triggers = raw.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all();
    assert.deepEqual(triggers, []);

    const meta = raw.prepare('SELECT schema_version, has_expirations, has_history FROM yuzuha_meta WHERE id=1').get();
    assert.deepEqual({ ...meta }, { schema_version: 3, has_expirations: 1, has_history: 1 });
    assert.equal(Number(raw.prepare('SELECT COUNT(*) AS c FROM yuzuha_variables').get()!['c']), 3);
    assert.equal(Number(raw.prepare('SELECT COUNT(*) AS c FROM yuzuha_raw_variables').get()!['c']), 5);
    assert.equal(Number(raw.prepare('SELECT COUNT(*) AS c FROM yuzuha_cases').get()!['c']), 2);
    assert.equal(Number(raw.prepare('SELECT COUNT(*) AS c FROM yuzuha_schedules').get()!['c']), 2);
    assert.equal(Number(raw.prepare('SELECT COUNT(*) AS c FROM yuzuha_schedule_history').get()!['c']), 2);
  } finally {
    raw.close();
  }

  await store.close();
  reopened = new SQLiteStore(path);
  const actual = await reopened.read(s => s);
  assert.deepEqual(actual, expected);
  assert.equal(Object.hasOwn(actual.variables, '__proto__'), true);

  // Preserva ausência vs vazio de campos opcionais (variableExpirations / scheduleHistory)
  await reopened.update(s => {
    delete s.variableExpirations;
    delete s.scheduleHistory;
  });
  const withoutOptionals = await reopened.read(s => s);
  assert.equal('variableExpirations' in withoutOptionals, false);
  assert.equal('scheduleHistory' in withoutOptionals, false);

  await reopened.update(s => {
    s.variableExpirations = {};
    s.scheduleHistory = [];
  });
  const emptyOptionals = await reopened.read(s => s);
  assert.deepEqual(emptyOptionals.variableExpirations, {});
  assert.deepEqual(emptyOptionals.scheduleHistory, []);
});

test('migra banco schema v2 (e payload schema 1) para v3 na abertura e suporta CLI readonly sem alterar bytes', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'yuzuha-v2-migrate-'));
  const v2Path = join(dir, 'legacy-v2.sqlite');
  const s1Path = join(dir, 'legacy-s1.sqlite');
  let storeV2: SQLiteStore | undefined;
  let concurrentV2: SQLiteStore | undefined;
  let storeS1: SQLiteStore | undefined;
  t.after(async () => {
    await storeV2?.close();
    await concurrentV2?.close();
    await storeS1?.close();
    await rm(dir, { recursive: true, force: true });
  });

  const expected = richState();
  createLegacyV2Db(v2Path, expected);
  const beforeBytes = await readFile(v2Path);

  // Inspeção CLI read-only deve ler v2 sem migrar nem alterar bytes
  const stats = await dataCommand({
    action: 'data',
    input: v2Path,
    operation: 'stats',
    json: true,
    apply: false,
  }) as { variables: number; cases: number; schedules: number; historyEntries: number; orphanExpirations: number };
  assert.equal(stats.variables, 7);
  assert.equal(stats.cases, 2);
  assert.equal(stats.schedules, 2);
  assert.equal(stats.historyEntries, 2);
  assert.equal(stats.orphanExpirations, 1);

  const backupPath = join(dir, 'v2-backup.json');
  await dataCommand({
    action: 'data',
    input: v2Path,
    operation: 'backup',
    file: backupPath,
    json: true,
    apply: false,
  });
  assert.deepEqual(await readFile(v2Path), beforeBytes);

  // Abertura concorrente em SQLiteStore migra v2 -> v3 atomicamente
  storeV2 = new SQLiteStore(v2Path);
  concurrentV2 = new SQLiteStore(v2Path);
  const [a, b] = await Promise.all([storeV2.read(s => s), concurrentV2.read(s => s)]);
  assert.deepEqual(a, expected);
  assert.deepEqual(b, expected);

  const rawAfter = new DatabaseSync(v2Path, { readOnly: true });
  try {
    const tables = new Set(
      rawAfter.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => String(r['name'])),
    );
    assert.equal(tables.has('yuzuha_state'), false);
    assert.equal(tables.has('yuzuha_variable_index'), false);
    assert.equal(tables.has('yuzuha_variable_index_meta'), false);
    assert.ok(tables.has('yuzuha_meta'));
  } finally {
    rawAfter.close();
  }

  // Payload schema 1 dentro de yuzuha_state também migra para schema 2 em v3
  createLegacyV2Db(s1Path, {
    schema: 1,
    variables: { total: 5 },
    cases: {},
  });
  const s1Stats = await dataCommand({
    action: 'data',
    input: s1Path,
    operation: 'stats',
    json: true,
    apply: false,
  }) as { schema: number; variables: number };
  assert.equal(s1Stats.schema, 2);
  assert.equal(s1Stats.variables, 1);
  storeS1 = new SQLiteStore(s1Path);
  assert.deepEqual(await storeS1.read(s => s), {
    schema: 2,
    variables: { total: 5 },
    cases: {},
    schedules: [],
  });
});

test('rollback em erro, STORE_ASYNC, STORE_INVALID, retorno não clonável e corrupção preservada', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'yuzuha-v3-rollback-'));
  const path = join(dir, 'state.sqlite');
  const store = new SQLiteStore(path);
  let futureStore: SQLiteStore | undefined;
  t.after(async () => {
    await store.close();
    await futureStore?.close();
    await rm(dir, { recursive: true, force: true });
  });

  await store.update(s => {
    s.variables['total'] = 10;
    s.variables[variableKey('guild', '1', 'name')] = 'ok';
    s.schedules.push({
      id: 's1',
      guildID: '1',
      channelID: '2',
      authorID: '3',
      command: 'ping',
      input: '',
      due: 100,
      attempts: 0,
    });
  });
  const baseline = await store.read(s => s);

  await assert.rejects(store.update(s => {
    s.variables['total'] = 999;
    s.schedules = [];
    throw new Error('boom');
  }), /boom/);
  assert.deepEqual(await store.read(s => s), baseline);

  await assert.rejects(store.update(async s => {
    s.variables['total'] = 0;
  }), (err: unknown) => err instanceof StoreError && err.code === 'STORE_ASYNC');
  assert.deepEqual(await store.read(s => s), baseline);

  await assert.rejects(store.update(s => {
    s.variables['total'] = Number.NaN;
  }), (err: unknown) => err instanceof StoreError && err.code === 'STORE_INVALID');
  assert.deepEqual(await store.read(s => s), baseline);

  await assert.rejects(store.update(s => {
    s.schedules.push({ ...s.schedules[0]! });
  }), (err: unknown) => err instanceof StoreError && err.code === 'STORE_INVALID');
  assert.deepEqual(await store.read(s => s), baseline);

  await assert.rejects(store.update(s => {
    s.variables['total'] = 0;
    return () => {};
  }));
  assert.deepEqual(await store.read(s => s), baseline);

  // Versão futura em yuzuha_meta deve falhar com STORE_CORRUPT sem sobrescrever
  const futurePath = join(dir, 'future.sqlite');
  const setupFuture = new SQLiteStore(futurePath);
  await setupFuture.update(s => { s.variables['keep'] = 1; });
  await setupFuture.close();

  const rawFuture = new DatabaseSync(futurePath);
  try {
    rawFuture.prepare('UPDATE yuzuha_meta SET schema_version=99 WHERE id=1').run();
  } finally {
    rawFuture.close();
  }
  const frozenBytes = await readFile(futurePath);
  futureStore = new SQLiteStore(futurePath);
  await assert.rejects(futureStore.read(s => s), (err: unknown) => err instanceof StoreError && err.code === 'STORE_CORRUPT');
  await assert.rejects(dataCommand({ action: 'data', input: futurePath, operation: 'stats', json: true, apply: false }),
    (err: unknown) => err instanceof StoreError && err.code === 'STORE_CORRUPT');
  assert.deepEqual(await readFile(futurePath), frozenBytes);
});

test('backup e restore com StateMaintenance e CLI funcionam entre v2 e v3', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'yuzuha-v3-backup-'));
  const sourcePath = join(dir, 'source.sqlite');
  const targetPath = join(dir, 'target.sqlite');
  const source = new SQLiteStore(sourcePath);
  const target = new SQLiteStore(targetPath);
  t.after(async () => {
    await source.close();
    await target.close();
    await rm(dir, { recursive: true, force: true });
  });

  const expected = richState();
  await source.update(s => {
    s.variables = expected.variables;
    s.variableExpirations = expected.variableExpirations;
    s.cases = expected.cases;
    s.schedules = expected.schedules;
    s.scheduleHistory = expected.scheduleHistory;
  });

  const maintSource = new StateMaintenance(source, () => 1000);
  const maintTarget = new StateMaintenance(target, () => 1000);
  const backup = await maintSource.backup();
  const report = await maintTarget.restore(backup, { policy: 'replace', dryRun: false });
  assert.equal(report.after.cases, 2);
  assert.equal(report.after.schedules, 2);
  assert.equal(report.after.historyEntries, 2);
  assert.deepEqual(await target.read(s => s), expected);

  // Restauração via CLI em banco de destino v3 usando backup exportado
  const cliBackupFile = join(dir, 'cli-backup.json');
  await source.close();
  await target.close();
  await dataCommand({ action: 'data', input: sourcePath, operation: 'backup', file: cliBackupFile, json: true, apply: false });

  const v3DestPath = join(dir, 'dest.sqlite');
  const dest = new SQLiteStore(v3DestPath);
  await dest.update(s => { s.variables['extra'] = 'keep'; });
  await dest.close();

  const cliRestore = await dataCommand({
    action: 'data',
    input: v3DestPath,
    operation: 'restore',
    file: cliBackupFile,
    policy: 'merge',
    json: true,
    apply: true,
  }) as { dryRun: boolean; after: { variables: number } };
  assert.equal(cliRestore.dryRun, false);
  assert.equal(cliRestore.after.variables, 8);

  const reopenedDest = new SQLiteStore(v3DestPath);
  try {
    assert.equal(await reopenedDest.read(s => s.variables['extra']), 'keep');
    assert.equal(await reopenedDest.read(s => s.variables['total']), 99);
    assert.equal(await reopenedDest.read(s => s.cases['100']?.length), 2);
  } finally {
    await reopenedDest.close();
  }
});
