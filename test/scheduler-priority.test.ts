import test from 'node:test';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore, SQLiteStore, Scheduler } from '../src/index.js';

const input = { guildID: '100', channelID: '200', authorID: '1', command: 'ping', input: '', due: 0 };

test('priorities order eligible tasks, then due time and insertion; edits persist and validate', async () => {
  const store = new MemoryStore(), order: string[] = [];
  const scheduler = new Scheduler(store, async task => { order.push(task.input); });
  await scheduler.add({ ...input, input: 'default', due: 2 });
  const id = await scheduler.add({ ...input, input: 'edited', priority: -1 });
  await scheduler.edit(id, { priority: 10 });
  await scheduler.add({ ...input, input: 'first', priority: 10, due: -1 });
  await scheduler.add({ ...input, input: 'same', priority: 10 });
  await scheduler.add({ ...input, input: 'future', priority: 1000, due: 100 });
  await scheduler.tick(2);
  assert.deepEqual(order, ['first', 'edited', 'same', 'default']);
  for (const priority of [1001, -1001, 0.5, NaN, Infinity]) {
    await assert.rejects(scheduler.add({ ...input, priority }), /priority/);
  }
  const remaining = (await scheduler.list())[0]!;
  await assert.rejects(scheduler.edit(remaining.id, { priority: 1001 }));
  assert.equal((await scheduler.list())[0]?.priority, 1000);
});

test('shared SQLite capacity coordinates independent connections and frees slots after completion', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-capacity-'));
  const a = new SQLiteStore(join(directory, 'state.sqlite')), b = new SQLiteStore(a.path);
  t.after(async () => { await a.close(); await b.close(); await rm(directory, { recursive: true }); });
  let ready!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { ready = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let active = 0, maximum = 0;
  const calls: string[] = [];
  const run = async (task: { id: string }) => {
    active++; maximum = Math.max(maximum, active); calls.push(task.id); ready();
    await blocked; active--;
  };
  const options = { concurrency: 4, globalConcurrency: 1 };
  const first = new Scheduler(a, run, options), second = new Scheduler(b, run, options);
  const id = await first.add(input); await first.add(input); await first.add(input);
  const running = first.tick(0);
  await started;
  try {
    await second.tick(0);
    assert.equal(calls.length, 1);
    await assert.rejects(first.cancel(id), /execução/);
  } finally { release(); }
  await running; await second.tick(0); await second.tick(0);
  assert.equal(maximum, 1); assert.equal(new Set(calls).size, 3);
  assert.deepEqual(await first.list(), []);
});

test('shared capacity counts claims until explicit lease recovery and rejects invalid ceilings', async () => {
  const store = new MemoryStore();
  const scheduler = new Scheduler(store, async () => {}, { globalConcurrency: 1, leaseMs: 30 });
  await scheduler.add(input); await scheduler.add(input);
  await store.update(s => { s.schedules[0]!.runningAt = 0; s.schedules[0]!.claimID = 'old'; });
  await scheduler.tick(30);
  assert.equal((await scheduler.list()).length, 2);
  assert.equal(await scheduler.recover(31), 1);
  await scheduler.tick(31);
  assert.deepEqual(await scheduler.list(), []);
  for (const globalConcurrency of [0, 129, 1.5, NaN]) {
    assert.throws(() => new Scheduler(store, async () => {}, { globalConcurrency }));
  }
});


test('independent Node processes honor the shared SQLite claim ceiling', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-capacity-process-'));
  const store = new SQLiteStore(join(directory, 'state.sqlite'));
  const scheduler = new Scheduler(store, async () => {});
  await scheduler.add(input);
  const child = (mode: string) => fork(new URL('./fixtures/scheduler-capacity.mjs', import.meta.url), [store.path, mode], {
    execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const first = child('hold');
  t.after(async () => { first.kill(); await store.close(); await rm(directory, { recursive: true }); });
  const firstExit = once(first, 'exit');
  const [started] = await once(first, 'message');
  assert.equal(started.event, 'started');
  await scheduler.add(input);
  const second = child('run');
  t.after(() => { second.kill(); });
  const secondExit = once(second, 'exit');
  const [done] = await once(second, 'message');
  assert.deepEqual(done, { event: 'done', calls: 0 });
  assert.deepEqual(await secondExit, [0, null]);
  const finished = once(first, 'message'); first.send('release');
  assert.equal((await finished)[0].calls, 1);
  assert.deepEqual(await firstExit, [0, null]);
  assert.equal((await scheduler.list()).length, 1);
  await scheduler.tick(0);
  assert.deepEqual(await scheduler.list(), []);
});
