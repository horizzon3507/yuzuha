import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { emptyState, isState } from '../src/domain/state-validation.js';
import type { State } from '../src/domain/state.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import { JsonStore } from '../src/infrastructure/storage/json.js';
import { SQLiteStore } from '../src/infrastructure/storage/sqlite.js';
import { StateMaintenance } from '../src/services/state-maintenance.js';
import type { Store } from '../src/ports/store.js';

const sparseMutations: ((state: State) => void)[] = [
  state => { state.variables['nested'] = { children: [new Array(1)] }; },
  state => { state.cases['100'] = new Array(1); },
  state => { state.schedules = new Array(1); },
  state => { state.scheduleHistory = new Array(1); },
];

test('validação JSON recusa arrays esparsos recursivamente sem preencher lacunas', () => {
  for (const mutate of sparseMutations) {
    const state = emptyState();
    mutate(state);
    const before = structuredClone(state);
    assert.equal(isState(state), false);
    assert.deepEqual(state, before);
  }
  const inherited = new Array(1);
  Object.setPrototypeOf(inherited, Object.assign(Object.create(Array.prototype), { 0: null }));
  const state = emptyState();
  state.variables['inherited'] = inherited;
  assert.equal(isState(state), false);
  assert.equal(Object.hasOwn(inherited, 0), false);
  state.variables['inherited'] = [null, { empty: [], dense: [1, false, 'text'] }];
  assert.equal(isState(state), true);
});

for (const kind of ['memory', 'json', 'sqlite'] as const) {
  test(`validação ${kind}: transações e restore recusam estado esparso sem commit`, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'yuzuha-state-validation-'));
    const store: Store = kind === 'memory' ? new MemoryStore() : kind === 'json'
      ? new JsonStore(join(directory, 'state.json')) : new SQLiteStore(join(directory, 'state.sqlite'));
    t.after(async () => { await store.close?.(); await rm(directory, { recursive: true, force: true }); });
    await store.update(state => { state.variables['saved'] = { count: 4 }; });
    const maintenance = new StateMaintenance(store), before = await store.read(state => state);
    for (const mutate of sparseMutations) {
      await assert.rejects(store.update(state => { state.variables['saved'] = 99; mutate(state); }), { code: 'STORE_INVALID' });
      assert.deepEqual(await store.read(state => state), before);
      const backup = await maintenance.backup();
      mutate(backup.state);
      for (const dryRun of [true, false]) {
        await assert.rejects(maintenance.restore(backup, { policy: 'replace', dryRun }), { code: 'BACKUP_INVALID' });
        assert.deepEqual(await store.read(state => state), before);
      }
    }
    const cyclic: unknown[] = [];
    cyclic.push(cyclic);
    for (const value of [undefined, NaN, Infinity, 1n, Symbol('value'), () => 1, new Date(), new Map(), cyclic]) {
      await assert.rejects(store.update(state => { state.variables['saved'] = 99; state.variables['invalid'] = value as never; }), { code: 'STORE_INVALID' });
      assert.deepEqual(await store.read(state => state), before);
    }
  });
}
