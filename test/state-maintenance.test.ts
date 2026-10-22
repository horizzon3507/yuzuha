import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import { JsonStore } from '../src/infrastructure/storage/json.js';
import { SQLiteStore } from '../src/infrastructure/storage/sqlite.js';
import { StateMaintenance } from '../src/services/state-maintenance.js';
import type { Store } from '../src/ports/store.js';
import { VariableService } from '../src/services/variables.js';

function task(id: string) {
  return { id, guildID: '100', channelID: '10', authorID: '1', command: 'ping', input: '', due: 1000, attempts: 0 };
}
for (const kind of ['memory', 'json', 'sqlite'] as const) {
  test(`manutenção ${kind}: limpeza por cursor, estatísticas e reabertura`, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'yuzuha-maintenance-'));
    const path = join(directory, `state.${kind === 'sqlite' ? 'sqlite' : 'json'}`);
    const store: Store = kind === 'memory' ? new MemoryStore() : kind === 'json' ? new JsonStore(path) : new SQLiteStore(path);
    const opened: Store[] = [store];
    t.after(async () => { for (const item of opened) await item.close?.(); await rm(directory, { recursive: true, force: true }); });
    await store.update(state => {
      state.variables = { a: 1, b: 2, c: 3, d: 4, persistent: 5 };
      state.variableExpirations = { a: 999, b: 1000, c: 1001, d: 1, orphan: 2 };
    });
    const maintenance = new StateMaintenance(store, () => 1000);
    const stats = await maintenance.stats();
    assert.equal(stats.variables, 5);
    assert.equal(stats.activeVariables, 2);
    assert.equal(stats.expiredVariables, 3);
    assert.equal(stats.orphanExpirations, 1);
    assert.ok(stats.jsonBytes > 0);
    assert.deepEqual(await maintenance.cleanupExpired({ limit: 2 }), { scanned: 2, removed: 2, orphanExpirationsRemoved: 0, cursor: 'b' });
    assert.deepEqual(await maintenance.cleanupExpired({ limit: 2, cursor: 'b' }), { scanned: 2, removed: 1, orphanExpirationsRemoved: 0, cursor: 'd' });
    assert.deepEqual(await maintenance.cleanupExpired({ limit: 2, cursor: 'd' }), { scanned: 1, removed: 0, orphanExpirationsRemoved: 1, cursor: null });
    assert.deepEqual(await store.read(state => state.variables), { c: 3, persistent: 5 });
    assert.equal((await maintenance.stats()).expiredVariables, 0);
    assert.equal((await maintenance.cleanupExpired({ cursor: 'zzzz' })).scanned, 0);
    if (kind !== 'memory') {
      await store.close?.();
      const reopened = kind === 'json' ? new JsonStore(path) : new SQLiteStore(path);
      opened.push(reopened);
      assert.deepEqual(await reopened.read(state => state.variables), { c: 3, persistent: 5 });
    }
  });

  test(`backup ${kind}: round trip completo, simulação padrão e merge atômico`, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'yuzuha-backup-'));
    const create = (name: string): Store => kind === 'memory' ? new MemoryStore()
      : kind === 'json' ? new JsonStore(join(directory, `${name}.json`)) : new SQLiteStore(join(directory, `${name}.sqlite`));
    const source = create('source'), target = create('target');
    t.after(async () => { await source.close?.(); await target.close?.(); await rm(directory, { recursive: true, force: true }); });
    await source.update(state => {
      state.variables = JSON.parse('{"__proto__":{"safe":1},"count":4}');
      state.variableExpirations = { count: 2000 };
      state.cases = { '100': [{ id: 1, guildID: '100', action: 'ban', targetID: '2', moderatorID: '1', reason: 'test', createdAt: new Date(0).toISOString() }] };
      state.schedules = [task('pending')];
      state.scheduleHistory = [{ id: 'run', task: task('done'), startedAt: 0, finishedAt: 1, status: 'success', retryable: false }];
    });
    const maintenance = new StateMaintenance(source, () => 1000);
    const backup = await maintenance.backup();
    assert.equal(backup.version, 1);
    assert.equal(backup.createdAt, new Date(1000).toISOString());
    const restore = new StateMaintenance(target, () => 1000);
    const before = await target.read(state => state);
    const report = await restore.restore(JSON.parse(JSON.stringify(backup)), { policy: 'replace' });
    assert.equal(report.dryRun, true);
    assert.equal(report.after.cases, 1);
    assert.equal(report.after.historyEntries, 1);
    assert.deepEqual(await target.read(state => state), before);
    const applied = await restore.restore(backup, { policy: 'replace', dryRun: false });
    assert.equal(applied.dryRun, false);
    assert.deepEqual(await target.read(state => state), backup.state);
    assert.equal(Object.prototype.hasOwnProperty.call((await target.read(state => state.variables)), '__proto__'), true);
    backup.state.variables['count'] = 999;
    assert.equal(await target.read(state => state.variables['count']), 4);
    const clean = await maintenance.backup();
    await target.update(state => { state.variables['extra'] = 9; state.variables['count'] = 3; state.schedules.push(task('other')); });
    await restore.restore(clean, { policy: 'merge', dryRun: false });
    assert.equal(await target.read(state => state.variables['extra']), 9);
    assert.equal(await target.read(state => state.variables['count']), 4);
    assert.equal(await target.read(state => state.schedules.length), 2);
    const snapshot = await target.read(state => state);
    const conflict = structuredClone(clean);
    conflict.state.cases['100']![0]!.reason = 'conflict';
    conflict.state.variables['should-not-write'] = 1;
    await assert.rejects(restore.restore(conflict, { policy: 'merge', dryRun: false }), /Conflito/);
    assert.deepEqual(await target.read(state => state), snapshot);
    for (const invalid of [null, { ...clean, version: 2 }, { ...clean, state: { ...clean.state, variableExpirations: { count: -1 } } },
      { ...clean, state: { ...clean.state, schedules: [task('dup'), task('dup')] } }]) {
      await assert.rejects(restore.restore(invalid, { policy: 'replace', dryRun: false }));
      assert.deepEqual(await target.read(state => state), snapshot);
    }
    await target.update(state => { state.schedules[0]!.runningAt = 10; state.schedules[0]!.claimID = 'live'; });
    await assert.rejects(restore.restore(clean, { policy: 'replace', dryRun: false }), /execuções agendadas/);
    await assert.rejects(restore.backup(), /execuções agendadas/);
    const running = structuredClone(clean);
    running.state.schedules[0]!.runningAt = 10;
    await assert.rejects(maintenance.restore(running, { policy: 'replace' }), /execuções agendadas/);
    if (kind !== 'memory') {
      const expected = await target.read(state => state);
      await target.close?.();
      const reopened = create('target');
      try { assert.deepEqual(await reopened.read(state => state), expected); }
      finally { await reopened.close?.(); }
    }
  });
}

test('manutenção recusa limites/cursor/política inválidos e preserva arquivo corrompido', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-backup-corrupt-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'state.json');
  await writeFile(path, 'broken {');
  const service = new StateMaintenance(new JsonStore(path));
  await assert.rejects(service.backup(), /Estado inválido/);
  assert.equal(await readFile(path, 'utf8'), 'broken {');
  const memory = new StateMaintenance(new MemoryStore());
  for (const limit of [0, -1, 0.5, NaN, 10001]) assert.throws(() => memory.cleanupExpired({ limit }), /Limite/);
  assert.throws(() => memory.cleanupExpired({ cursor: 4 as never }), /Cursor/);
  await assert.rejects(memory.restore(null, { policy: 'wat' } as never), /policy/);
});

test('otimização das cópias mantém isolamento de updater e rollback de callback capturado', async () => {
  const store = new MemoryStore(), variables = new VariableService(store, { guildID: '100', authorID: '1' });
  const initial = { n: [1] };
  await variables.set('guild', 'a', initial);
  let held: { n: number[] } | undefined;
  const result = await variables.transaction(tx => {
    const changed = tx.guild.update('a', value => { held = value as typeof initial; held.n.push(2); return held; });
    changed.n.push(3);
    try { tx.guild.update('a', value => { (value as typeof initial).n.push(99); throw new Error('caught'); }); } catch {}
    assert.deepEqual(tx.guild.get('a'), { n: [1, 2] });
    return changed;
  });
  held!.n.push(4);
  result.n.push(5);
  initial.n.push(6);
  assert.deepEqual(await variables.get('guild', 'a'), { n: [1, 2] });
});


test('cursor aceita nomes brutos vazios/longos e nova passagem recolhe chaves inseridas antes do cursor', async () => {
  const store = new MemoryStore(), maintenance = new StateMaintenance(store, () => 1000);
  const long = 'z'.repeat(2048);
  await store.update(state => { state.variables = { '': 1, b: 2, [long]: 3 }; state.variableExpirations = { '': 0, b: 0, [long]: 0 }; });
  const first = await maintenance.cleanupExpired({ limit: 1 });
  assert.equal(first.cursor, '');
  await store.update(state => { state.variables['a'] = 4; state.variableExpirations!['a'] = 0; });
  const second = await maintenance.cleanupExpired({ limit: 1, cursor: first.cursor });
  assert.equal(second.cursor, 'a');
  const third = await maintenance.cleanupExpired({ limit: 1, cursor: second.cursor });
  assert.equal(third.cursor, 'b');
  await store.update(state => { state.variables['a'] = 5; state.variableExpirations!['a'] = 0; });
  assert.equal((await maintenance.cleanupExpired({ limit: 1, cursor: third.cursor })).cursor, null);
  assert.deepEqual(await store.read(state => state.variables), { a: 5 });
  assert.equal((await maintenance.cleanupExpired({ limit: 1 })).removed, 1);
  assert.deepEqual(await store.read(state => state.variables), {});
});

test('merge recusa conflito de tarefa/histórico e limpa TTL quando backup sobrescreve com valor persistente', async () => {
  const source = new MemoryStore(), target = new MemoryStore();
  await source.update(state => { state.variables['x'] = 4; state.schedules = [task('same')];
    state.scheduleHistory = [{ id: 'same-run', task: task('done'), startedAt: 0, finishedAt: 1, status: 'success', retryable: false }]; });
  await target.update(state => { state.variables['x'] = 1; state.variableExpirations = { x: 10000 }; state.schedules = [task('same')]; });
  const maintenance = new StateMaintenance(target), backup = await new StateMaintenance(source).backup();
  await maintenance.restore(backup, { policy: 'merge', dryRun: false });
  assert.deepEqual(await target.read(state => state.variableExpirations), {});
  const before = await target.read(state => state);
  for (const kind of ['task', 'history']) {
    const conflict = structuredClone(backup);
    if (kind === 'task') conflict.state.schedules[0]!.input = 'changed';
    else conflict.state.scheduleHistory![0]!.finishedAt = 2;
    await assert.rejects(maintenance.restore(conflict, { policy: 'merge', dryRun: false }), /Conflito/);
    assert.deepEqual(await target.read(state => state), before);
  }
});
