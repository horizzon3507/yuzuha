import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommandContext, JsonStore, MemoryStore, SQLiteStore } from '../src/index.js';
import type { Store } from '../src/index.js';
import { VariableService, dataOperations, executeDataOperations } from '../src/services/variables.js';
import { MockTransport, mockMessage } from '../src/testing.js';
import { Runtime, defaultLimits, registerBuiltins } from '../src/functions.js';

const actor = { guildID: '100', authorID: '1' };
function context(store: Store, guildID: string | null = '100') {
  return new CommandContext({ message: mockMessage('!data', { guildID: guildID ?? undefined }), command: { name: 'data', code: '' },
    store, transport: new MockTransport(), cooldown: () => 0 });
}

for (const kind of ['memory', 'json', 'sqlite'] as const) {
  test(`TTL ${kind}: fronteira, updates, persistência, remoção e rollback`, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'yuzuha-expiry-'));
    const file = join(directory, kind === 'json' ? 'state.json' : 'state.sqlite');
    const store: Store = kind === 'memory' ? new MemoryStore() : kind === 'json' ? new JsonStore(file) : new SQLiteStore(file);
    const opened = [store];
    t.after(async () => { for (const item of opened) await item.close?.(); await rm(directory, { recursive: true, force: true }); });
    let now = 1_000;
    const service = new VariableService(store, actor, () => now);
    await service.set('guild', 'count', 10, { ttlMs: 100 });
    assert.equal(await service.ttl('guild', 'count'), 100);
    now = 1_099;
    assert.equal(await service.update('guild', 'count', current => Number(current) + 1), 11);
    assert.equal(await service.ttl('guild', 'count'), 1);
    assert.equal(await service.get('guild', 'count'), 11);
    now = 1_100;
    assert.equal(await service.get('guild', 'count', 'expired'), 'expired');
    assert.equal(await service.ttl('guild', 'count'), -2);
    assert.equal(await service.expire('guild', 'count', 100), false);
    assert.equal(await service.update('guild', 'count', current => Number(current) + 1, 50), 51);
    assert.equal(await service.ttl('guild', 'count'), -1);
    assert.equal(await service.expire('guild', 'count', 200), true);
    assert.equal(await service.expire('guild', 'count', null), true);
    assert.equal(await service.ttl('guild', 'count'), -1);
    await service.set('guild', 'count', 20, { ttlMs: 100 });
    await service.set('guild', 'count', 21);
    assert.equal(await service.ttl('guild', 'count'), -1);
    await service.set('guild', 'zero', 1, { ttlMs: 0 });
    assert.equal(await service.get('guild', 'zero'), null);
    assert.equal(await service.expire('guild', 'count', 0), true);
    assert.equal(await service.get('guild', 'count'), null);
    await service.delete('guild', 'count');
    await service.delete('guild', 'zero');
    assert.deepEqual(await store.read(state => state.variableExpirations), {});
    await service.set('user', 'reopen', { nested: [1] }, { ttlMs: 500 });
    const before = await store.read(state => state);
    await assert.rejects(service.transaction(data => {
      data.user.expire('reopen', null);
      data.global.set('rollback', 1, { ttlMs: 10 });
      data.guild.set('bad', NaN);
    }), /inválido/);
    assert.deepEqual(await store.read(state => state), before);
    for (const ttl of [-1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      await assert.rejects(service.set('global', 'badTTL', 1, { ttlMs: ttl }), /TTL/);
    }
    assert.equal(await service.get('global', 'badTTL'), null);
    if (kind !== 'memory') {
      await store.close?.();
      const reopened: Store = kind === 'json' ? new JsonStore(file) : new SQLiteStore(file);
      opened.push(reopened);
      const reader = new VariableService(reopened, actor, () => now);
      assert.deepEqual(await reader.get('user', 'reopen'), { nested: [1] });
      assert.equal(await reader.ttl('user', 'reopen'), 500);
      now += 500;
      assert.equal(await reader.get('user', 'reopen'), null);
    }
  });

  test(`transação declarativa ${kind}: concorrência, múltiplos escopos e resultados isolados`, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'yuzuha-data-ops-'));
    const file = join(directory, kind === 'json' ? 'state.json' : 'state.sqlite');
    const store: Store = kind === 'memory' ? new MemoryStore() : kind === 'json' ? new JsonStore(file) : new SQLiteStore(file);
    const second = kind === 'sqlite' ? new SQLiteStore(file) : store;
    t.after(async () => { await store.close?.(); if (second !== store) await second.close?.(); await rm(directory, { recursive: true, force: true }); });
    const services = [new VariableService(store, actor), new VariableService(second, actor)];
    const ops = dataOperations([
      { op: 'increment', scope: 'guild', name: 'a' },
      { op: 'increment', scope: 'user', userID: '2', name: 'b', delta: 2 },
      { op: 'set', scope: 'global', name: 'object', value: { n: [1] }, ttlMs: 10_000 },
      { op: 'get', scope: 'global', name: 'object' },
    ]);
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) => services[i % 2]!.transaction(data => executeDataOperations(data, ops))));
    assert.equal(await services[0]!.get('guild', 'a'), 30);
    assert.equal(await services[0]!.forUser('2').get('user', 'b'), 60);
    assert.equal(await services[0]!.get('user', 'b'), null);
    assert.equal(await new VariableService(store, { guildID: '101', authorID: '1' }).get('guild', 'a'), null);
    (results[0]![3] as { n: number[] }).n.push(9);
    assert.deepEqual(await services[0]!.get('global', 'object'), { n: [1] });
    const invalid = dataOperations([
      { op: 'set', scope: 'guild', name: 'a', value: -1 },
      { op: 'increment', scope: 'global', name: 'object' },
    ]);
    await assert.rejects(services[0]!.transaction(data => executeDataOperations(data, invalid)), /numérica/);
    assert.equal(await services[0]!.get('guild', 'a'), 30);
    const operations = dataOperations([
      { op: 'expire', scope: 'global', name: 'object', ttlMs: null },
      { op: 'ttl', scope: 'global', name: 'object' },
      { op: 'delete', scope: 'global', name: 'object' },
      { op: 'get', scope: 'global', name: 'object', fallback: 'gone' },
    ]);
    assert.deepEqual(await services[0]!.transaction(data => executeDataOperations(data, operations)), [true, -1, null, 'gone']);
  });
}

test('userFor exige servidor e ID explícito; views transacionais expiram', async () => {
  const store = new MemoryStore();
  const ctx = context(store);
  await ctx.data.userFor('2').set('points', 10);
  assert.equal(await ctx.data.user.get('points'), null);
  assert.equal(await context(store).data.userFor('2').get('points'), 10);
  assert.throws(() => ctx.data.userFor(''), /ID de usuário/);
  assert.throws(() => ctx.data.userFor(' 2 '), /ID de usuário/);
  const dm = context(store, null);
  assert.throws(() => dm.data.userFor('2'), /servidores/);
  await dm.data.user.set('points', 3);
  await assert.rejects(dm.data.transaction(data => {
    data.user.set('points', 100);
    data.userFor('2').set('points', 200);
  }), /servidores/);
  assert.equal(await dm.data.user.get('points'), 3);
  let saved: import('../src/services/variables.js').DataTransaction | undefined;
  let view: import('../src/services/variables.js').TransactionScope | undefined;
  await ctx.data.transaction(data => { view = data.userFor('2'); saved = data; });
  assert.throws(() => view!.ttl('points'), /já terminou/);
  assert.throws(() => saved!.userFor('3'), /já terminou/);
});

test('schema2 antigo preserva variáveis e recusa TTL/histórico malformados sem sobrescrever', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-state-fields-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'state.json');
  const old = { schema: 2, variables: { literal: 2 }, cases: {}, schedules: [] };
  await writeFile(path, JSON.stringify(old));
  assert.deepEqual(await new JsonStore(path).read(state => state), old);
  for (const fields of [{ variableExpirations: { literal: -1 } }, { variableExpirations: { literal: 'tomorrow' } }, { scheduleHistory: [{}] }]) {
    const content = JSON.stringify({ ...old, ...fields });
    await writeFile(path, content);
    await assert.rejects(new JsonStore(path).read(state => state), /Estado inválido/);
    assert.equal(await readFile(path, 'utf8'), content);
  }
});

test('validação declarativa recusa formatos desconhecidos e limites antes da execução', () => {
  for (const operations of [null, [], new Array(101).fill({ op: 'get', scope: 'user', name: 'x' }),
    [{ op: 'wat', scope: 'user', name: 'x' }], [{ op: 'get', scope: 'bad', name: 'x' }],
    [{ op: 'set', scope: 'user', name: 'x' }], [{ op: 'expire', scope: 'user', name: 'x' }],
    [{ op: 'get', scope: 'global', name: 'x', userID: '2' }], [{ op: 'get', scope: 'user', name: 'x', typo: 2 }],
    [{ op: 'increment', scope: 'user', name: 'x', delta: '2' }], [{ op: 'set', scope: 'user', name: 'x', value: 1, ttlMs: -1 }]]) {
    assert.throws(() => dataOperations(operations));
  }
});

function scripts(store = new MemoryStore(), output = 100_000) {
  const ctx = context(store);
  const runtime = registerBuiltins(new Runtime({ ...defaultLimits, output }));
  return { ctx, runtime, run: (source: string) => runtime.execute(runtime.compile(source, 'data.yz'), ctx) };
}

test('scripts TTL e transações preservam dados literais e rollback entre escopos', async () => {
  const { ctx, runtime, run } = scripts();
  await run('$setGuildVar[count;$jsonDecode[2];60000]');
  assert.ok(Number(await run('$ttlGuildVar[count]')) > 0);
  assert.equal(await run('$expireGuildVar[count;null]'), true);
  assert.equal(await run('$ttlGuildVar[count]'), -1);
  assert.deepEqual(await run('$dataTransaction[$jsonDecode[\u005b{"op":"set","scope":"global","name":"a","value":4},{"op":"increment","scope":"guild","name":"count","delta":3},{"op":"get","scope":"guild","name":"count"}\u005d]]'), [null, 5, 5]);
  await ctx.data.global.set('text', 'abc');
  await ctx.data.global.set('a', 4);
  await assert.rejects(run('$dataTransaction[$jsonDecode[\u005b{"op":"set","scope":"global","name":"a","value":99},{"op":"increment","scope":"global","name":"text"}\u005d]]'), /numérica/);
  assert.equal(await ctx.data.global.get('a'), 4);
  runtime.register({ name: 'literalOps', category: 'test', minArgs: 0, maxArgs: 0, usage: '', description: 'Fixture',
    execute: () => [{ op: 'set', scope: 'user', userID: '2', name: 'literal', value: '$setVar[injected;yes]' }] });
  assert.deepEqual(await run('$dataTransaction[$literalOps]'), [null]);
  assert.equal(await ctx.data.userFor('2').get('literal'), '$setVar[injected;yes]');
  assert.equal(await ctx.data.global.get('injected'), null);
  assert.equal(await run('$expireGuildVar[count;0]'), true);
  assert.equal(await run('$ttlGuildVar[count]'), -2);
  await run('$setUserVar[a;1]$setVar[b;2]');
  assert.equal(await run('$ttlUserVar[a]'), -1);
  assert.equal(await run('$ttlVar[b]'), -1);
});

test('limite de saída da transação de script aborta o commit inteiro e escapa de try', async () => {
  const { ctx, run } = scripts(new MemoryStore(), 200);
  await ctx.data.global.set('large', 'x'.repeat(300));
  await assert.rejects(run('$try[$dataTransaction[$jsonDecode[\u005b{"op":"set","scope":"guild","name":"write","value":1},{"op":"get","scope":"global","name":"large"}\u005d]];capturado]'), /limite|saída/i);
  assert.equal(await ctx.data.guild.get('write'), null);
});
