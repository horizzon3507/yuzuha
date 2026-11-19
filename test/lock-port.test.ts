import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConfigError,
  MemoryLock,
  MemoryStore,
  Scheduler,
  YUZUHA_ERROR_CODES,
  Yuzuha,
  defineCommand,
  isYuzuhaError,
} from '../src/index.js';
import type { Lock, LockLease, ScheduleRecord, State, Store } from '../src/index.js';
import { MockTransport, TestClock } from '../src/testing.js';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
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

function taskInput(due: number, extra: { interval?: number; cron?: string; timezone?: string; missedRun?: 'skip' | 'run-once' } = {}) {
  return { guildID: '100', channelID: '200', authorID: '1', command: 'ping', input: '', due, ...extra };
}

test('MemoryLock enforces mutual exclusion per key, TTL expiry, token safety, renew, and close()', async () => {
  const clock = new TestClock(1_000);
  const lock = new MemoryLock({ now: clock.now });

  const lease1 = lock.acquire('schedule:t1', 500);
  assert.ok(lease1);
  assert.equal(lease1.key, 'schedule:t1');
  assert.equal(typeof lease1.token, 'string');
  assert.ok(lease1.token!.length > 0);

  // Mutual exclusion on same key, independent key succeeds.
  assert.equal(lock.acquire('schedule:t1', 500), null);
  const other = lock.acquire('schedule:t2', 500);
  assert.ok(other);
  other.release();

  // TTL boundary: still held at 499ms, expires at 500ms.
  clock.advance(499);
  assert.equal(lock.acquire('schedule:t1', 500), null);
  assert.equal(lease1.renew?.(500), true);

  // Renew extended expiry to 1499 + 500 = 1999.
  clock.advance(499);
  assert.equal(lock.acquire('schedule:t1', 500), null);

  // Advance 1ms to exact expiration (1999): lease1 expires.
  clock.advance(1);
  const lease2 = lock.acquire('schedule:t1', 500);
  assert.ok(lease2);
  assert.notEqual(lease2.token, lease1.token);

  // Stale token safety: lease1 cannot renew or release lease2.
  assert.equal(lease1.renew?.(500), false);
  lease1.release();
  assert.equal(lock.acquire('schedule:t1', 500), null);
  assert.equal(lease2.renew?.(500), true);

  // Releasing lease2 frees the key; double release and post-release renew are safe.
  lease2.release();
  lease2.release();
  assert.equal(lease2.renew?.(500), false);

  // Expiring without replacement makes renew return false cleanly.
  const lease3 = lock.acquire('schedule:t3', 200);
  assert.ok(lease3);
  clock.advance(200);
  assert.equal(lease3.renew?.(200), false);

  // close() clears held locks and invalidates existing leases.
  const lease4 = lock.acquire('schedule:t4', 1_000);
  assert.ok(lease4);
  await lock.close();
  assert.equal(lease4.renew?.(1_000), false);
  assert.ok(lock.acquire('schedule:t4', 1_000));
});

test('MemoryLock, Scheduler and Yuzuha validate lock options with ConfigError LOCK_OPTIONS', async () => {
  assert.ok(YUZUHA_ERROR_CODES.includes('LOCK_OPTIONS'));

  for (const invalidOptions of [null, [], 'bad', 123, true, () => {}, new Date(), { now: 'not-fn' }, { now: null }]) {
    assert.throws(
      () => new MemoryLock(invalidOptions as never),
      error => error instanceof ConfigError && isYuzuhaError(error, 'LOCK_OPTIONS'),
    );
  }

  const lock = new MemoryLock();
  for (const badKey of ['', null, undefined, 123]) {
    assert.throws(
      () => lock.acquire(badKey as never, 100),
      error => error instanceof ConfigError && isYuzuhaError(error, 'LOCK_OPTIONS'),
    );
  }
  for (const badTtl of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(
      () => lock.acquire('k', badTtl),
      error => error instanceof ConfigError && isYuzuhaError(error, 'LOCK_OPTIONS'),
    );
  }
  const lease = lock.acquire('k', 100);
  assert.ok(lease);
  for (const badTtl of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(
      () => lease.renew?.(badTtl),
      error => error instanceof ConfigError && isYuzuhaError(error, 'LOCK_OPTIONS'),
    );
  }
  lease.release();

  for (const invalidLock of [
    null,
    [],
    'bad',
    123,
    true,
    () => {},
    {},
    { acquire: 'not-fn' },
    { acquire() { return null; }, close: 'not-fn' },
    { acquire() { return null; }, close: null },
  ]) {
    assert.throws(
      () => new Scheduler(new MemoryStore(), async () => {}, { lock: invalidLock as never }),
      error => error instanceof ConfigError && isYuzuhaError(error, 'LOCK_OPTIONS'),
    );
    assert.throws(
      () => new Yuzuha({
        transport: new MockTransport(),
        store: new MemoryStore(),
        scheduler: false,
        lock: invalidLock as never,
      }),
      error => error instanceof ConfigError && isYuzuhaError(error, 'LOCK_OPTIONS'),
    );
  }

  class ClassLock implements Lock {
    acquire(): LockLease | null { return null; }
    async close(): Promise<void> {}
  }
  const bot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    lock: new ClassLock(),
  });
  await bot.destroy();
});

test('two Schedulers sharing Store + MemoryLock never double-execute and skip store.update on contention', async () => {
  const baseStore = new MemoryStore();
  const s1Counting = countingStore(baseStore);
  const s2Counting = countingStore(baseStore);
  const lock = new MemoryLock();
  const calls: { scheduler: string; id: string }[] = [];
  const started = deferred();
  const releaseRun = deferred();

  let blockingFirst = true;
  const s1 = new Scheduler(s1Counting.store, async task => {
    calls.push({ scheduler: 's1', id: task.id });
    if (blockingFirst) {
      blockingFirst = false;
      started.resolve();
      await releaseRun.promise;
    }
  }, { lock, leaseMs: 10_000 });
  const s2 = new Scheduler(s2Counting.store, async task => {
    calls.push({ scheduler: 's2', id: task.id });
  }, { lock, leaseMs: 10_000 });

  const id1 = await s1.add(taskInput(0));
  const id2 = await s1.add(taskInput(0));
  s1Counting.counts.updates = 0;
  s2Counting.counts.updates = 0;

  // s1 locks id1 and blocks in execute(); s2 ticks concurrently: skips id1 (null lock) and runs id2.
  const t1 = s1.tick(0);
  await started.promise;
  await s2.tick(0);

  // s2 only updated store for id2 (claim + completion), skipping id1 without touching store.update.
  assert.equal(s2Counting.counts.updates, 2);
  assert.deepEqual(calls, [{ scheduler: 's1', id: id1 }, { scheduler: 's2', id: id2 }]);

  releaseRun.resolve();
  await t1;

  // After completion, no duplicates remain.
  await Promise.all([s1.tick(0), s2.tick(0)]);
  assert.equal(calls.length, 2);
  assert.deepEqual(await s1.list(), []);
});

test('async Lock prevents double execution across concurrent Schedulers and releases on decline/stop', async () => {
  const store = new MemoryStore();
  const inner = new MemoryLock();
  const operations: string[] = [];

  const asyncLock: Lock = {
    async acquire(key, ttlMs) {
      operations.push(`acquire:${key}`);
      await Promise.resolve();
      const lease = inner.acquire(key, ttlMs);
      if (!lease) return null;
      return {
        key: lease.key,
        token: lease.token,
        async release() {
          operations.push(`release:${key}`);
          await Promise.resolve();
          lease.release();
        },
        async renew(renewTtlMs) {
          operations.push(`renew:${key}`);
          await Promise.resolve();
          return lease.renew!(renewTtlMs);
        },
      };
    },
  };

  const executed: string[] = [];
  const s1 = new Scheduler(store, async task => { executed.push(`s1:${task.id}`); }, { lock: asyncLock, leaseMs: 5_000 });
  const s2 = new Scheduler(store, async task => { executed.push(`s2:${task.id}`); }, { lock: asyncLock, leaseMs: 5_000 });

  const taskID = await s1.add(taskInput(0));
  await Promise.all([s1.tick(0), s2.tick(0)]);

  assert.equal(executed.length, 1);
  assert.equal(operations.filter(op => op === `release:schedule:${taskID}`).length, 1);

  // Declined store claim (e.g. missedRun: 'skip' advances due past now) must release the acquired lock immediately.
  const skippedID = await s1.add({
    ...taskInput(0),
    cron: '0 * * * *',
    timezone: 'UTC',
    missedRun: 'skip',
  });
  await s1.tick(120_000);
  assert.equal(executed.length, 1);
  const verifyFree = inner.acquire(`schedule:${skippedID}`, 1_000);
  assert.ok(verifyFree);
  verifyFree.release();

  // stop() while awaiting async acquire must release the acquired lease without running the task.
  const gate = deferred();
  const gatedLock: Lock = {
    async acquire(key, ttlMs) {
      await gate.promise;
      return inner.acquire(key, ttlMs);
    },
  };
  const stoppedRuns: string[] = [];
  const s3 = new Scheduler(store, async task => { stoppedRuns.push(task.id); }, { lock: gatedLock, leaseMs: 5_000 });
  const pendingID = await s3.add(taskInput(0));
  const pendingTick = s3.tick(0);
  await Promise.resolve();
  s3.stop();
  gate.resolve();
  await pendingTick;
  assert.deepEqual(stoppedRuns, []);
  const freeAfterStop = inner.acquire(`schedule:${pendingID}`, 1_000);
  assert.ok(freeAfterStop);
  freeAfterStop.release();
});

test('Scheduler heartbeat renews LockLease, aborts on lost lease, and tolerates LockLease without renew()', async () => {
  const store = new MemoryStore();
  const clock = new TestClock(1_000);
  const inner = new MemoryLock({ now: clock.now });
  const events: string[] = [];
  let renewResult = true;
  let renewCalls = 0;
  let releaseCalls = 0;

  const lock: Lock = {
    acquire(key, ttlMs) {
      const lease = inner.acquire(key, ttlMs);
      if (!lease) return null;
      return {
        key: lease.key,
        token: lease.token,
        release() {
          releaseCalls++;
          events.push('release');
          lease.release();
        },
        renew(renewTtlMs) {
          renewCalls++;
          events.push('renew');
          if (!renewResult) return false;
          return lease.renew!(renewTtlMs);
        },
      };
    },
  };

  let abortedDuringRun = false;
  const gate = deferred();
  const scheduler = new Scheduler(store, async (_task, signal) => {
    await gate.promise;
    abortedDuringRun = signal.aborted;
  }, {
    now: clock.now,
    lock,
    leaseMs: 60,
    heartbeatMs: 15,
    onEvent(event) {
      events.push(event.event);
    },
  });

  await scheduler.add(taskInput(1_000));
  const running = scheduler.tick(1_000);
  await new Promise(resolve => setTimeout(resolve, 45));
  assert.ok(renewCalls >= 1);

  gate.resolve();
  await running;
  assert.equal(abortedDuringRun, false);
  assert.equal(releaseCalls, 1);
  // Lock release runs after store update and before schedule.finish notification.
  assert.ok(events.indexOf('release') > events.indexOf('schedule.start'));
  assert.ok(events.indexOf('release') < events.indexOf('schedule.finish'));

  // Lost lease (renew returns false) aborts signal cleanly.
  renewResult = false;
  const abortedSignal = deferred<boolean>();
  const scheduler2 = new Scheduler(store, async (_task, signal) => {
    signal.addEventListener('abort', () => abortedSignal.resolve(true), { once: true });
    await abortedSignal.promise;
  }, {
    now: clock.now,
    lock,
    leaseMs: 60,
    heartbeatMs: 10,
  });
  await scheduler2.add(taskInput(1_000));
  let deadline!: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    deadline = setTimeout(() => reject(new Error('Lost lease did not abort execution')), 5_000);
  });
  try { await Promise.race([scheduler2.tick(1_000), timeout]); }
  finally { clearTimeout(deadline); }
  assert.equal(await abortedSignal.promise, true);

  // Optional renew omitted on LockLease works without errors.
  let noRenewReleased = false;
  const lockWithoutRenew: Lock = {
    acquire(key) {
      return {
        key,
        release() { noRenewReleased = true; },
      };
    },
  };
  let ranNoRenew = false;
  const scheduler3 = new Scheduler(store, async () => {
    await new Promise(resolve => setTimeout(resolve, 25));
    ranNoRenew = true;
  }, {
    lock: lockWithoutRenew,
    leaseMs: 60,
    heartbeatMs: 10,
  });
  await scheduler3.add(taskInput(0));
  await scheduler3.tick(0);
  assert.equal(ranNoRenew, true);
  assert.equal(noRenewReleased, true);

  // Release failure during cleanup is surfaced to onError without failing completed execution.
  const releaseErrors: unknown[] = [];
  const failingRelease = new Error('release failed');
  const scheduler4 = new Scheduler(store, async () => {}, {
    lock: {
      acquire(key) {
        return {
          key,
          async release() { throw failingRelease; },
        };
      },
    },
    onError(error) { releaseErrors.push(error); },
  });
  await scheduler4.add(taskInput(0));
  await scheduler4.tick(0);
  assert.deepEqual(releaseErrors, [failingRelease]);
  assert.deepEqual(await scheduler4.list(), []);
});

test('Scheduler.recover respects active Lock and releases reclaim lock cleanly after recovery', async () => {
  const clock = new TestClock(1_000);
  const store = new MemoryStore();
  const lock = new MemoryLock({ now: clock.now });
  const executed: ScheduleRecord[] = [];
  const scheduler = new Scheduler(store, async task => { executed.push(task); }, {
    now: clock.now,
    lock,
    leaseMs: 1_000,
  });

  const taskID = await scheduler.add(taskInput(1_000));
  await store.update(state => {
    state.schedules[0]!.runningAt = 1_000;
    state.schedules[0]!.claimID = 'dead-worker-claim';
  });

  // Simulate another worker holding an active distributed lock while store runningAt looks stale.
  const activeLease = lock.acquire(`schedule:${taskID}`, 2_000);
  assert.ok(activeLease);
  clock.advance(1_500); // now = 2_500; now - runningAt = 1_500 > leaseMs (1_000), but lock expires at 3_000.
  assert.equal(await scheduler.recover(clock.now()), 0);
  assert.equal((await scheduler.list())[0]?.runningAt, 1_000);
  assert.equal((await scheduler.list())[0]?.claimID, 'dead-worker-claim');

  // Once the lock expires at t=3_000, recover acquires, clears runningAt/claimID, and releases lock.
  clock.advance(500);
  assert.equal(await scheduler.recover(clock.now()), 1);
  assert.equal((await scheduler.list())[0]?.runningAt, null);
  assert.equal((await scheduler.list())[0]?.claimID, null);

  // Lock must be released cleanly after recover so tick() claims and executes the task immediately.
  await scheduler.tick(clock.now());
  assert.equal(executed.length, 1);
  assert.equal(executed[0]!.id, taskID);
  assert.deepEqual(await scheduler.list(), []);
});

test('Yuzuha wires options.lock into Scheduler and preserves caller ownership on destroy()', async () => {
  const store = new MemoryStore();
  const inner = new MemoryLock();
  let lockClosed = false;
  const sharedLock: Lock = {
    acquire: (key, ttlMs) => inner.acquire(key, ttlMs),
    async close() {
      lockClosed = true;
      await inner.close();
    },
  };

  const ran: string[] = [];
  const makeBot = (label: string) => {
    const bot = new Yuzuha({
      prefix: '!',
      transport: new MockTransport(),
      store,
      lock: sharedLock,
    });
    bot.command(defineCommand({
      name: 'job',
      run() { ran.push(label); },
    }));
    return bot;
  };

  const botA = makeBot('A');
  const botB = makeBot('B');

  try {
    await botA.scheduler!.add({
      guildID: '100',
      channelID: '200',
      authorID: '1',
      command: 'job',
      input: '',
      due: 0,
    });

    await Promise.all([botA.scheduler!.tick(0), botB.scheduler!.tick(0)]);
    assert.equal(ran.length, 1);
  } finally {
    await botA.destroy();
    await botB.destroy();
  }

  // Caller owns injected lock: bot.destroy() must never close it.
  assert.equal(lockClosed, false);
  await sharedLock.close?.();
  assert.equal(lockClosed, true);
});
