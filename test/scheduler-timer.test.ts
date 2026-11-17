import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@fluxerjs/core';
import { MemoryStore, Scheduler, Yuzuha } from '../src/index.js';
import type { ScheduleRecord, State, Store } from '../src/index.js';
import { MockTransport, TestClock, fakeTimers } from '../src/testing.js';
import type { FakeTimers } from '../src/testing.js';

interface TrackedTimers extends FakeTimers {
  readonly activeCount: number;
  readonly delays: number[];
}

function trackedTimers(): TrackedTimers {
  const base = fakeTimers();
  const active = new Map<unknown, number>();
  const delays: number[] = [];
  return {
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
}

function countingStore(inner: Store = new MemoryStore()) {
  const counts = { reads: 0, updates: 0 };
  const store: Store = {
    read<T>(reader: (state: Readonly<State>) => T): Promise<T> {
      counts.reads++;
      return inner.read(reader);
    },
    update<T>(writer: (state: State) => T): Promise<T> {
      counts.updates++;
      return inner.update(writer);
    },
  };
  return { store, counts };
}

const taskInput = (due: number, extra: { interval?: number; paused?: boolean } = {}) => ({
  guildID: '100',
  channelID: '200',
  authorID: '1',
  command: 'ping',
  input: '',
  due,
  ...extra,
});

test('idle started scheduler does initial check and zero extra reads over 25s until pollMs', async () => {
  const clock = new TestClock(0);
  const timers = trackedTimers();
  const { store, counts } = countingStore();
  const scheduler = new Scheduler(store, async () => {}, { now: clock.now, timers });

  scheduler.start();
  scheduler.start();
  await scheduler.drain();

  assert.equal(counts.reads, 2);
  assert.equal(counts.updates, 0);
  assert.equal(timers.activeCount, 1);
  assert.deepEqual(timers.delays, [30_000]);

  clock.advance(25_000);
  timers.advance(25_000);
  await scheduler.drain();
  assert.equal(counts.reads, 2);
  assert.equal(counts.updates, 0);
  assert.equal(timers.activeCount, 1);

  clock.advance(5_000);
  timers.advance(5_000);
  await scheduler.drain();
  assert.ok(counts.reads > 2);
  assert.equal(timers.activeCount, 1);

  scheduler.stop();
  await scheduler.drain();
  assert.equal(timers.activeCount, 0);
});

test('task due before pollMs fires at exact due time and repeating tasks re-arm next due', async () => {
  const clock = new TestClock(1_000);
  const timers = trackedTimers();
  const { store } = countingStore();
  const ran: ScheduleRecord[] = [];
  const scheduler = new Scheduler(store, async task => { ran.push(task); }, {
    now: clock.now,
    timers,
    pollMs: 30_000,
  });

  scheduler.start();
  await scheduler.drain();
  assert.equal(timers.activeCount, 1);

  await scheduler.add(taskInput(6_000, { interval: 4_000 }));
  assert.equal(timers.activeCount, 1);
  assert.equal(timers.delays.at(-1), 5_000);

  clock.advance(4_999);
  timers.advance(4_999);
  await scheduler.drain();
  assert.equal(ran.length, 0);

  clock.advance(1);
  timers.advance(1);
  await scheduler.drain();
  assert.equal(ran.length, 1);
  assert.equal(timers.activeCount, 1);
  assert.equal(timers.delays.at(-1), 4_000);

  clock.advance(3_999);
  timers.advance(3_999);
  await scheduler.drain();
  assert.equal(ran.length, 1);

  clock.advance(1);
  timers.advance(1);
  await scheduler.drain();
  assert.equal(ran.length, 2);

  scheduler.stop();
  assert.equal(timers.activeCount, 0);
});

test('edit, pause, resume, cancel and stop maintain a single clean timer without leaks', async () => {
  const clock = new TestClock(0);
  const timers = trackedTimers();
  const { store } = countingStore();
  const ran: string[] = [];
  const scheduler = new Scheduler(store, async task => { ran.push(task.id); }, {
    now: clock.now,
    timers,
    pollMs: 30_000,
  });

  scheduler.start();
  await scheduler.drain();

  const id = await scheduler.add(taskInput(20_000));
  assert.equal(timers.activeCount, 1);
  assert.equal(timers.delays.at(-1), 20_000);

  assert.equal(await scheduler.edit(id, { due: 4_000 }), true);
  assert.equal(timers.activeCount, 1);
  assert.equal(timers.delays.at(-1), 4_000);

  assert.equal(await scheduler.pause(id), true);
  assert.equal(timers.activeCount, 1);
  assert.equal(timers.delays.at(-1), 30_000);

  clock.advance(5_000);
  timers.advance(5_000);
  await scheduler.drain();
  assert.deepEqual(ran, []);

  assert.equal(await scheduler.resume(id, 7_000), true);
  assert.equal(timers.activeCount, 1);
  assert.equal(timers.delays.at(-1), 2_000);

  assert.equal(await scheduler.cancel(id), true);
  assert.equal(timers.activeCount, 1);
  assert.equal(timers.delays.at(-1), 30_000);

  clock.advance(5_000);
  timers.advance(5_000);
  await scheduler.drain();
  assert.deepEqual(ran, []);

  scheduler.stop();
  assert.equal(timers.activeCount, 0);

  clock.advance(60_000);
  timers.advance(60_000);
  await scheduler.drain();
  assert.equal(timers.activeCount, 0);
});

test('addCron and retry re-arm next-due timer without polling wait', async () => {
  const clock = new TestClock(Date.parse('2026-10-21T20:00:00Z'));
  const timers = trackedTimers();
  const { store } = countingStore();
  let fail = true;
  let calls = 0;
  const scheduler = new Scheduler(store, async () => {
    calls++;
    if (fail) throw new Error('falha temporária');
  }, { now: clock.now, timers, pollMs: 30_000 });

  scheduler.start();
  await scheduler.drain();

  await scheduler.add({ ...taskInput(clock.now() + 1_000), maxAttempts: 1 });
  assert.equal(timers.delays.at(-1), 1_000);
  clock.advance(1_000);
  timers.advance(1_000);
  await scheduler.drain();
  assert.equal(calls, 1);

  const failed = (await scheduler.failed())[0]!;
  fail = false;
  await scheduler.retry(failed.id, clock.now() + 3_000);
  assert.equal(timers.delays.at(-1), 3_000);
  clock.advance(3_000);
  timers.advance(3_000);
  await scheduler.drain();
  assert.equal(calls, 2);

  await scheduler.addCron({
    guildID: '100',
    channelID: '200',
    authorID: '1',
    command: 'ping',
    input: '',
    expression: '1 * * * *',
    timezone: 'UTC',
  });
  assert.equal(timers.delays.at(-1), 30_000);
  clock.advance(30_000);
  timers.advance(30_000);
  await scheduler.drain();
  assert.equal(timers.delays.at(-1), 26_000);
  clock.advance(26_000);
  timers.advance(26_000);
  await scheduler.drain();
  assert.equal(calls, 3);

  scheduler.stop();
  assert.equal(timers.activeCount, 0);
});

test('pollMs, timers and start interval options validate boundaries', () => {
  const store = new MemoryStore();
  for (const pollMs of [0, -1, 1.5, NaN, Infinity, 3_600_001]) {
    assert.throws(() => new Scheduler(store, async () => {}, { pollMs }), { code: 'SCHEDULE_OPTIONS' });
  }
  assert.throws(() => new Scheduler(store, async () => {}, { timers: {} as never }), { code: 'SCHEDULE_OPTIONS' });

  const timers = trackedTimers();
  const scheduler = new Scheduler(store, async () => {}, { pollMs: 3_600_000, timers });
  assert.throws(() => scheduler.start(0), { code: 'SCHEDULE' });
  assert.throws(() => scheduler.start(-5), { code: 'SCHEDULE' });
  assert.throws(() => scheduler.start(1.2), { code: 'SCHEDULE' });

  scheduler.start(15_000);
  assert.equal(timers.delays.at(-1), undefined);
  return scheduler.drain().then(() => {
    assert.equal(timers.delays.at(-1), 15_000);
    scheduler.stop();
    assert.equal(timers.activeCount, 0);
  });
});

test('bot wires timers into default scheduler and clears them on destroy and failed login', async () => {
  const clock = new TestClock(0);
  const timers = trackedTimers();
  const client = new Client();
  Reflect.set(client, 'login', async () => {});
  Reflect.set(client, 'destroy', async () => {});

  const bot = new Yuzuha({
    client,
    transport: new MockTransport(),
    store: new MemoryStore(),
    now: clock.now,
    timers,
  });
  let executed = 0;
  bot.command({ name: 'ping', run() { executed++; } });

  await bot.scheduler!.add(taskInput(2_000));
  assert.equal(timers.activeCount, 0);

  await bot.login('offline-token');
  await bot.scheduler!.drain();
  assert.equal(timers.activeCount, 1);
  assert.equal(timers.delays.at(-1), 2_000);

  clock.advance(2_000);
  timers.advance(2_000);
  await bot.scheduler!.drain();
  assert.equal(executed, 1);

  await bot.destroy();
  assert.equal(timers.activeCount, 0);

  const failTimers = trackedTimers();
  const failClient = new Client();
  Reflect.set(failClient, 'login', async () => { throw new Error('bad token'); });
  Reflect.set(failClient, 'destroy', async () => {});
  const failBot = new Yuzuha({
    client: failClient,
    transport: new MockTransport(),
    store: new MemoryStore(),
    timers: failTimers,
  });
  await assert.rejects(failBot.login('bad-token'), /bad token/);
  assert.equal(failTimers.activeCount, 0);
  await failBot.destroy();
});
