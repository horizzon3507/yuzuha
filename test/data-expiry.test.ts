import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@fluxerjs/core';
import { CommandContext, JsonStore, MemoryStore, SQLiteStore, Yuzuha } from '../src/index.js';
import type { Store } from '../src/index.js';
import { variableKey } from '../src/domain/state.js';
import { VariableService, dataOperations, executeDataOperations } from '../src/services/variables.js';
import { MockTransport, TestClock, createTestBot, fakeTimers, mockMessage } from '../src/testing.js';
import type { FakeTimers } from '../src/testing.js';
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

for (const kind of ['memory', 'json', 'sqlite'] as const) {
  test(`lazy purge ${kind}: transaction get, update, ttl and expire physically delete expired keys`, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'yuzuha-lazy-purge-'));
    const file = join(directory, kind === 'json' ? 'state.json' : 'state.sqlite');
    const create = (): Store => kind === 'memory' ? new MemoryStore() : kind === 'json' ? new JsonStore(file) : new SQLiteStore(file);
    const store = create();
    const opened = [store];
    t.after(async () => { for (const item of opened) await item.close?.(); await rm(directory, { recursive: true, force: true }); });

    let now = 1_000;
    const service = new VariableService(store, actor, () => now);
    await service.transaction(tx => {
      tx.guild.set('viaGet', 'a', { ttlMs: 50 });
      tx.guild.set('viaTtl', 'b', { ttlMs: 50 });
      tx.guild.set('viaExpire', 'c', { ttlMs: 50 });
      tx.guild.set('viaUpdate', 10, { ttlMs: 50 });
      tx.guild.set('keep', 'alive', { ttlMs: 500 });
    });

    now = 1_050;
    assert.equal(await service.get('guild', 'viaGet', 'gone'), 'gone');
    assert.equal(await service.ttl('guild', 'viaTtl'), -2);
    assert.equal(Object.keys(await store.read(state => state.variables)).length, 5);

    await assert.rejects(service.transaction(tx => {
      assert.equal(tx.guild.get('viaGet', 'gone'), 'gone');
      throw new Error('rollback');
    }), /rollback/);
    assert.equal(Object.keys(await store.read(state => state.variables)).length, 5);

    assert.equal(await service.transaction(tx => tx.guild.get('viaGet', 'gone')), 'gone');
    assert.equal(await service.transaction(tx => tx.guild.ttl('viaTtl')), -2);
    assert.equal(await service.expire('guild', 'viaExpire', 100), false);
    assert.equal(await service.update('guild', 'viaUpdate', value => Number(value) + 1, 0), 1);

    const after = await store.read(state => ({ variables: state.variables, expirations: state.variableExpirations ?? {} }));
    assert.deepEqual(Object.keys(after.variables).sort(), [variableKey('guild', '100', 'keep'), variableKey('guild', '100', 'viaUpdate')]);
    assert.deepEqual(Object.keys(after.expirations), [variableKey('guild', '100', 'keep')]);

    if (kind !== 'memory') {
      await store.close?.();
      const reopened = create();
      opened.push(reopened);
      const persisted = await reopened.read(state => ({ variables: state.variables, expirations: state.variableExpirations ?? {} }));
      assert.deepEqual(persisted, after);
    }
  });
}

function trackedTimers() {
  const base = fakeTimers();
  const active = new Map<unknown, number>();
  const delays: number[] = [];
  const timers: FakeTimers & { readonly activeCount: number; readonly delays: number[] } = {
    setTimeout(fn, ms) {
      delays.push(ms);
      let handle: unknown;
      handle = base.setTimeout(() => {
        active.delete(handle);
        fn();
      }, ms);
      active.set(handle, ms);
      return handle;
    },
    clearTimeout(handle) {
      active.delete(handle);
      base.clearTimeout(handle);
    },
    advance(ms) { base.advance(ms); },
    get activeCount() { return active.size; },
    get delays() { return delays; },
  };
  return timers;
}

test('bot.sweepVariables() incrementally sweeps expired entries across batches using cursor', async t => {
  const fixture = createTestBot({
    now: 1_000,
    variables: { sweepIntervalMs: false, sweepBatch: 2 },
  });
  t.after(() => fixture.destroy());

  await fixture.store.update(state => {
    state.variables = { a: 1, b: 2, c: 3, d: 4, e: 5 };
    state.variableExpirations = { a: 500, b: 1_000, c: 2_000, d: 999, e: 1_000 };
  });
  assert.equal((fixture.timers as FakeTimers & { activeCount?: number }).activeCount ?? 0, 0);

  const first = await fixture.bot.sweepVariables();
  assert.deepEqual(first, { scanned: 2, removed: 2, orphanExpirationsRemoved: 0, cursor: 'b' });

  const second = await fixture.bot.sweepVariables();
  assert.deepEqual(second, { scanned: 2, removed: 1, orphanExpirationsRemoved: 0, cursor: 'd' });

  const third = await fixture.bot.sweepVariables();
  assert.deepEqual(third, { scanned: 1, removed: 1, orphanExpirationsRemoved: 0, cursor: null });

  assert.deepEqual(await fixture.store.read(state => state.variables), { c: 3 });
  assert.deepEqual(await fixture.store.read(state => state.variableExpirations), { c: 2_000 });
});

test('periodic variable sweep starts on login, routes errors, and stops cleanly on destroy and failed login', async () => {
  const clock = new TestClock(1_000);
  const timers = trackedTimers();
  const baseStore = new MemoryStore();
  let updates = 0;
  let failNextUpdate = false;
  const store: Store = {
    read: reader => baseStore.read(reader),
    update: writer => {
      updates++;
      if (failNextUpdate) {
        failNextUpdate = false;
        return Promise.reject(new Error('disk error'));
      }
      return baseStore.update(writer);
    },
  };
  await baseStore.update(state => {
    state.variables = { a: 1, b: 2, c: 3, d: 4 };
    state.variableExpirations = { a: 1_000, b: 1_000, c: 5_000, d: 1_000 };
  });

  const errors: unknown[] = [];
  const client = new Client();
  Reflect.set(client, 'login', async () => {});
  Reflect.set(client, 'destroy', async () => {});
  const bot = new Yuzuha({
    client,
    transport: new MockTransport(),
    store,
    scheduler: false,
    timers,
    now: clock.now,
    variables: { sweepIntervalMs: 1_000, sweepBatch: 2 },
    onError(error) { errors.push(error); },
  });

  assert.equal(timers.activeCount, 0);
  timers.advance(5_000);
  await setImmediate();
  assert.equal(updates, 0);

  await bot.login('offline-token');
  assert.equal(timers.activeCount, 1);
  assert.deepEqual(timers.delays, [1_000]);

  timers.advance(1_000);
  await setImmediate();
  assert.equal(updates, 1);
  assert.equal(timers.activeCount, 1);
  assert.deepEqual(await baseStore.read(state => Object.keys(state.variables)), ['c', 'd']);

  failNextUpdate = true;
  timers.advance(1_000);
  await setImmediate();
  assert.equal(errors.length, 1);
  assert.equal(timers.activeCount, 1);

  timers.advance(1_000);
  await setImmediate();
  assert.deepEqual(await baseStore.read(state => state.variables), { c: 3 });

  await bot.destroy();
  assert.equal(timers.activeCount, 0);
  const updatesAtDestroy = updates;
  timers.advance(5_000);
  await setImmediate();
  assert.equal(updates, updatesAtDestroy);
  await assert.rejects(bot.sweepVariables(), { code: 'BOT_CLOSED' });

  const failTimers = trackedTimers();
  const failClient = new Client();
  let rejectLogin!: (error: Error) => void;
  Reflect.set(failClient, 'login', () => new Promise<void>((_resolve, reject) => { rejectLogin = reject; }));
  Reflect.set(failClient, 'destroy', async () => {});
  let sweepStarted!: () => void;
  let releaseSweep!: () => void;
  const enteredSweep = new Promise<void>(resolve => { sweepStarted = resolve; });
  const gateSweep = new Promise<void>(resolve => { releaseSweep = resolve; });
  const gatedStore: Store = {
    read: reader => baseStore.read(reader),
    async update(writer) {
      sweepStarted();
      await gateSweep;
      return baseStore.update(writer);
    },
  };
  const failBot = new Yuzuha({
    client: failClient,
    transport: new MockTransport(),
    store: gatedStore,
    scheduler: false,
    timers: failTimers,
    variables: { sweepIntervalMs: 500 },
  });
  const loginPromise = failBot.login('bad-token');
  assert.equal(failTimers.activeCount, 1);
  failTimers.advance(500);
  await enteredSweep;
  rejectLogin(new Error('bad token'));

  let loginSettled = false;
  void loginPromise.catch(() => { loginSettled = true; });
  await setImmediate();
  assert.equal(loginSettled, false);

  releaseSweep();
  await assert.rejects(loginPromise, /bad token/);
  assert.equal(failTimers.activeCount, 0);
  await failBot.destroy();
});

test('options.variables validates sweepIntervalMs and sweepBatch and supports disabling', async () => {
  const client = new Client();
  Reflect.set(client, 'login', async () => {});
  Reflect.set(client, 'destroy', async () => {});

  for (const variables of [
    null,
    true,
    [],
    new Date(),
    { sweepIntervalMs: 99 },
    { sweepIntervalMs: 86_400_001 },
    { sweepIntervalMs: 1.5 },
    { sweepIntervalMs: NaN },
    { sweepIntervalMs: Infinity },
    { sweepBatch: 0 },
    { sweepBatch: 10_001 },
    { sweepBatch: 1.5 },
    { sweepBatch: NaN },
  ]) {
    assert.throws(
      () => new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), variables: variables as never }),
      { code: 'VARIABLE_SWEEP_OPTIONS' },
    );
  }

  const timers = trackedTimers();
  const disabledBot = new Yuzuha({
    client,
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    timers,
    variables: false,
  });
  await disabledBot.login('offline-token');
  assert.equal(timers.activeCount, 0);
  await disabledBot.destroy();

  const boundaryBot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    variables: { sweepIntervalMs: 100, sweepBatch: 10_000 },
  });
  await boundaryBot.destroy();
});
