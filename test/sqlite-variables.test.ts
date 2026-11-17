import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SQLiteStore, StoreError } from '../src/index.js';
import { variableKey } from '../src/domain/state.js';
import { VariableService } from '../src/services/variables.js';

test('SQLiteStore reutiliza statements preparados entre operações e limpa ao fechar', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'yuzuha-sqlite-stmts-'));
  const path = join(dir, 'state.sqlite');
  const store = new SQLiteStore(path);
  const originalPrepare = DatabaseSync.prototype.prepare;
  let prepareCalls = 0;

  t.after(async () => {
    DatabaseSync.prototype.prepare = originalPrepare;
    await store.close();
    await rm(dir, { recursive: true, force: true });
  });

  await store.update(state => {
    state.variables[variableKey('guild', '100', 'alpha')] = { count: 1 };
    state.variables['total'] = 42;
  });

  // Mede novas chamadas a prepare() com o store já aberto
  DatabaseSync.prototype.prepare = function patchedPrepare(
    this: DatabaseSync,
    sql: string,
  ) {
    prepareCalls++;
    return originalPrepare.call(this, sql);
  } as typeof DatabaseSync.prototype.prepare;

  assert.deepEqual(await store.readVariable(variableKey('guild', '100', 'alpha'), () => 0), { count: 1 });
  assert.equal(await store.readVariable('total', () => 0), 42);
  assert.equal((await store.queryVariables({ scope: 'guild', subject: '100', prefix: 'a', limit: 10 }, () => 0)).entries.length, 1);
  await store.update(state => {
    state.variables[variableKey('guild', '100', 'beta')] = 2;
  });
  assert.equal(await store.read(state => state.variables['total']), 42);
  assert.equal(prepareCalls, 0);

  DatabaseSync.prototype.prepare = originalPrepare;
  await store.close();

  await assert.rejects(
    store.readVariable(variableKey('guild', '100', 'alpha'), () => 0),
    (err: unknown) => err instanceof StoreError && err.code === 'STORE_CLOSED',
  );
  await assert.rejects(
    store.queryVariables({ scope: 'guild', subject: '100', prefix: '', limit: 10 }, () => 0),
    (err: unknown) => err instanceof StoreError && err.code === 'STORE_CLOSED',
  );
});

test('readVariable e queryVariables atendem chaves scoped e raw com TTL SQL, null e isolamento sem hidratar State', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'yuzuha-sqlite-vars-'));
  const path = join(dir, 'state.sqlite');
  const store = new SQLiteStore(path);
  t.after(async () => {
    await store.close();
    await rm(dir, { recursive: true, force: true });
  });

  let now = 100;
  await store.update(state => {
    state.variables[variableKey('global', '', 'nil')] = null;
    state.variables[variableKey('guild', '100', 'obj')] = { nested: [1, 2] };
    state.variables[variableKey('guild', '100', 'temp')] = 'alive';
    state.variables[variableKey('user', '7', 'k')] = 'u';
    state.variables['count'] = 9;
    state.variables['raw_temp'] = 'raw-alive';
    state.variables[''] = 'empty';
    Object.defineProperty(state.variables, '__proto__', {
      value: { ok: true },
      writable: true,
      enumerable: true,
      configurable: true,
    });
    state.variableExpirations = {
      [variableKey('guild', '100', 'temp')]: 150,
      raw_temp: 150,
      [variableKey('guild', '100', 'orphan_scoped')]: 500,
      orphan_raw: 500,
    };
  });

  // Planos de consulta usam chave primária tanto para scoped quanto para raw
  const raw = new DatabaseSync(path, { readOnly: true });
  try {
    const scopedPlan = raw.prepare(
      'EXPLAIN QUERY PLAN SELECT value_json FROM yuzuha_variables WHERE scope=? AND subject=? AND name_key=? AND (expires_at IS NULL OR expires_at>?)',
    ).all('guild', '100', '006f0062006a', 100);
    assert.match(String(scopedPlan[0]!['detail']), /SEARCH.*PRIMARY KEY/);

    const rawPlan = raw.prepare(
      'EXPLAIN QUERY PLAN SELECT value_json FROM yuzuha_raw_variables WHERE key=? AND value_json IS NOT NULL AND (expires_at IS NULL OR expires_at>?)',
    ).all('count', 100);
    assert.match(String(rawPlan[0]!['detail']), /SEARCH.*PRIMARY KEY/);
  } finally {
    raw.close();
  }

  // Null persistente, isolamento de objeto, chaves raw e expirações órfãs
  assert.equal(await store.readVariable(variableKey('global', '', 'nil'), () => now), null);
  assert.equal(await store.readVariable(variableKey('guild', '100', 'missing'), () => now), undefined);
  assert.equal(await store.readVariable(variableKey('guild', '100', 'orphan_scoped'), () => now), undefined);
  assert.equal(await store.readVariable('orphan_raw', () => now), undefined);
  assert.equal(await store.readVariable('count', () => now), 9);
  assert.equal(await store.readVariable('', () => now), 'empty');
  assert.deepEqual(await store.readVariable('__proto__', () => now), { ok: true });
  assert.equal(await store.readVariable(variableKey('user', '7', 'k'), () => now), 'u');

  const obj = await store.readVariable(variableKey('guild', '100', 'obj'), () => now) as { nested: number[] };
  obj.nested.push(3);
  assert.deepEqual(await store.readVariable(variableKey('guild', '100', 'obj'), () => now), { nested: [1, 2] });

  // Limite exato de TTL: expires_at === now significa expirado
  now = 149;
  assert.equal(await store.readVariable(variableKey('guild', '100', 'temp'), () => now), 'alive');
  assert.equal(await store.readVariable('raw_temp', () => now), 'raw-alive');
  assert.equal((await store.queryVariables({ scope: 'guild', subject: '100', prefix: 'temp', limit: 10 }, () => now)).entries[0]?.ttlMs, 1);

  now = 150;
  assert.equal(await store.readVariable(variableKey('guild', '100', 'temp'), () => now), undefined);
  assert.equal(await store.readVariable('raw_temp', () => now), undefined);
  assert.deepEqual(await store.queryVariables({ scope: 'guild', subject: '100', prefix: 'temp', limit: 10 }, () => now), {
    entries: [],
    nextCursor: null,
  });

  // Relógio avaliado somente após commit pendente na fila
  const pendingWrite = store.update(state => {
    state.variables[variableKey('guild', '100', 'queued')] = 'v';
    state.variableExpirations![variableKey('guild', '100', 'queued')] = 200;
  });
  const queuedRead = store.readVariable(variableKey('guild', '100', 'queued'), () => now);
  now = 200;
  await pendingWrite;
  assert.equal(await queuedRead, undefined);
});

test('readVariable e queryVariables refletem rollback sem expor mutações não confirmadas', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'yuzuha-sqlite-vars-rb-'));
  const path = join(dir, 'state.sqlite');
  const store = new SQLiteStore(path);
  t.after(async () => {
    await store.close();
    await rm(dir, { recursive: true, force: true });
  });

  let now = 50;
  const service = new VariableService(store, { guildID: '100', authorID: '1' }, () => now);
  await service.transaction(tx => {
    tx.guild.set('item:1', 'original', { ttlMs: 100 });
  });
  await store.update(state => {
    state.variables['total'] = 10;
  });

  await assert.rejects(service.transaction(tx => {
    tx.guild.set('item:1', 'mutated');
    tx.guild.set('item:2', 'extra');
    throw new Error('abort');
  }), /abort/);

  await assert.rejects(store.update(state => {
    state.variables['total'] = Number.NaN;
  }), (err: unknown) => err instanceof StoreError && err.code === 'STORE_INVALID');

  await assert.rejects(store.update(async state => {
    state.variables['total'] = 999;
  }), (err: unknown) => err instanceof StoreError && err.code === 'STORE_ASYNC');

  assert.equal(await service.get('guild', 'item:1'), 'original');
  assert.equal(await store.readVariable('total', () => now), 10);
  const page = await service.query('guild', { prefix: 'item:' });
  assert.deepEqual(page.entries, [{ name: 'item:1', value: 'original', ttlMs: 100 }]);
  assert.equal(page.nextCursor, null);
});
