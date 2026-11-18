import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, Yuzuha, YuzuhaError, defineCommand } from '../src/index.js';
import type { ConcurrencyOptions, LogRecord } from '../src/index.js';
import { ConcurrencyLimiter } from '../src/framework/concurrency.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('ConcurrencyLimiter validates options eagerly with CONCURRENCY_OPTIONS', () => {
  for (const invalid of [
    null,
    [],
    'invalid',
    42,
    new Date(),
    { max: 0 },
    { max: -1 },
    { max: 1.5 },
    { max: Number.NaN },
    { max: Number.POSITIVE_INFINITY },
    { max: '2' },
    { perGuild: 0 },
    { perGuild: -3 },
    { perGuild: 2.5 },
    { perGuild: Number.NaN },
    { maxPending: -1 },
    { maxPending: 1.5 },
    { maxPending: Number.NaN },
    { maxPending: Number.POSITIVE_INFINITY },
  ]) {
    assert.throws(
      () => new ConcurrencyLimiter(invalid as never),
      (error: unknown) => error instanceof YuzuhaError && error.code === 'CONCURRENCY_OPTIONS',
    );
    assert.throws(
      () => new Yuzuha({ concurrency: invalid as never, store: new MemoryStore(), transport: new MockTransport(), scheduler: false }),
      (error: unknown) => error instanceof YuzuhaError && error.code === 'CONCURRENCY_OPTIONS',
    );
  }

  const valid: ConcurrencyOptions = { max: 1, perGuild: 1, maxPending: 0 };
  const limiter = new ConcurrencyLimiter(valid);
  assert.equal(limiter.active, 0);
  assert.equal(limiter.pending, 0);
  limiter.close();
});

test('ConcurrencyLimiter enforces global max, fair per-guild wakeup, DM isolation and abort cleanup', async () => {
  const limiter = new ConcurrencyLimiter({ max: 2, perGuild: 1 });
  const controller = new AbortController();

  const relA1 = await limiter.acquire('guild-a', controller.signal);
  assert.ok(relA1);
  assert.equal(limiter.active, 1);

  // Guild A already at perGuild=1, so A2 and A3 queue even though global max=2 has a free slot.
  const pA2 = limiter.acquire('guild-a', controller.signal);
  const pA3 = limiter.acquire('guild-a', controller.signal);
  assert.equal(limiter.pending, 2);

  // Guild B can start immediately using the remaining global slot.
  const relB1 = await limiter.acquire('guild-b', controller.signal);
  assert.ok(relB1);
  assert.equal(limiter.active, 2);

  // Guild C queues behind A2 and A3 because global max=2 is saturated.
  const pC1 = limiter.acquire('guild-c', controller.signal);
  assert.equal(limiter.pending, 3);

  // Aborting a queued waiter removes it cleanly without leaking slots.
  const abortable = new AbortController();
  const pAborted = limiter.acquire('guild-d', abortable.signal);
  assert.equal(limiter.pending, 4);
  abortable.abort();
  assert.equal(await pAborted, null);
  assert.equal(limiter.pending, 3);

  // Releasing Guild B frees a global slot: Guild C must bypass Guild A's queued flood.
  let cResolved = false;
  void pC1.then(() => { cResolved = true; });
  relB1();
  relB1(); // Idempotent second release must not underflow.
  const relC1 = await pC1;
  assert.ok(relC1);
  assert.equal(cResolved, true);
  assert.equal(limiter.active, 2);
  assert.equal(limiter.pending, 2);

  // Releasing Guild A wakes A2; A3 stays queued.
  relA1();
  const relA2 = await pA2;
  assert.ok(relA2);
  assert.equal(limiter.active, 2);
  assert.equal(limiter.pending, 1);

  // Releasing Guild C cannot wake A3 because A2 still holds Guild A's perGuild slot.
  relC1();
  assert.equal(limiter.active, 1);
  assert.equal(limiter.pending, 1);

  relA2();
  const relA3 = await pA3;
  assert.ok(relA3);
  assert.equal(limiter.active, 1);
  assert.equal(limiter.pending, 0);

  relA3();
  assert.equal(limiter.active, 0);

  // DM messages (guildID undefined / empty) do not block each other on perGuild=1, only on max=2.
  const dm1 = await limiter.acquire(undefined, controller.signal);
  const dm2 = await limiter.acquire('', controller.signal);
  assert.ok(dm1);
  assert.ok(dm2);
  assert.equal(limiter.active, 2);
  const pDm3 = limiter.acquire(undefined, controller.signal);
  assert.equal(limiter.pending, 1);
  dm1();
  const dm3 = await pDm3;
  assert.ok(dm3);
  dm2();
  dm3();
  assert.equal(limiter.active, 0);

  // Pre-aborted signal returns null immediately.
  const preAborted = new AbortController();
  preAborted.abort();
  assert.equal(await limiter.acquire('guild-a', preAborted.signal), null);
  limiter.close();
});

test('Yuzuha limits global max concurrent commands and releases slots on error/guard', async () => {
  const transport = new MockTransport();
  const bot = new Yuzuha({
    transport,
    store: new MemoryStore(),
    scheduler: false,
    concurrency: { max: 2 },
    onError() {},
  });

  let active = 0;
  let peak = 0;
  const gates = [deferred(), deferred(), deferred(), deferred()];
  let runIndex = 0;

  bot.command(defineCommand({
    name: 'work',
    async run(ctx) {
      const idx = runIndex++;
      active++;
      peak = Math.max(peak, active);
      try {
        await gates[idx]!.promise;
        await ctx.reply(`done-${idx}`);
      } finally {
        active--;
      }
    },
  }));
  bot.command(defineCommand({
    name: 'fail',
    run() {
      throw new Error('boom');
    },
  }));

  const tasks = [
    bot.handle(mockMessage('!work', { id: 'm1' })),
    bot.handle(mockMessage('!work', { id: 'm2' })),
    bot.handle(mockMessage('!work', { id: 'm3' })),
    bot.handle(mockMessage('!work', { id: 'm4' })),
  ];

  await Promise.resolve();
  await Promise.resolve();
  assert.equal(active, 2);
  assert.equal(peak, 2);

  gates[0]!.resolve();
  gates[1]!.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(peak, 2);

  gates[2]!.resolve();
  gates[3]!.resolve();
  const results = await Promise.all(tasks);
  assert.deepEqual(results, ['success', 'success', 'success', 'success']);
  assert.equal(active, 0);

  // Errors must still release concurrency slots so future commands proceed.
  assert.equal(await bot.handle(mockMessage('!fail', { id: 'm5' })), 'error');
  assert.equal(await bot.handle(mockMessage('!fail', { id: 'm6' })), 'error');
  assert.equal(await bot.handle(mockMessage('!fail', { id: 'm7' })), 'error');
  await bot.destroy();
});

test('Yuzuha perGuild isolates guild floods and allows concurrent DMs', async () => {
  const bot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    concurrency: { max: 2, perGuild: 1 },
  });

  const started: string[] = [];
  const gates = new Map<string, ReturnType<typeof deferred<void>>>();
  bot.command(defineCommand({
    name: 'run',
    async run(ctx) {
      const label = ctx.input;
      started.push(label);
      const gate = deferred();
      gates.set(label, gate);
      await gate.promise;
    },
  }));

  const a1 = bot.handle(mockMessage('!run a1', { id: 'a1', guildID: '100' }));
  const a2 = bot.handle(mockMessage('!run a2', { id: 'a2', guildID: '100' }));
  const b1 = bot.handle(mockMessage('!run b1', { id: 'b1', guildID: '200' }));
  const c1 = bot.handle(mockMessage('!run c1', { id: 'c1', guildID: '300' }));

  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, ['a1', 'b1']);

  // Completing b1 must wake c1 ahead of a2 because guild 100 is still active on a1.
  gates.get('b1')!.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, ['a1', 'b1', 'c1']);

  gates.get('a1')!.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, ['a1', 'b1', 'c1', 'a2']);

  gates.get('c1')!.resolve();
  gates.get('a2')!.resolve();
  assert.deepEqual(await Promise.all([a1, a2, b1, c1]), ['success', 'success', 'success', 'success']);

  // DMs (guildID: undefined) do not block each other on perGuild=1.
  const dm1 = bot.handle(mockMessage('!run dm1', { id: 'dm1', guildID: undefined }));
  const dm2 = bot.handle(mockMessage('!run dm2', { id: 'dm2', guildID: undefined }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started.slice(-2), ['dm1', 'dm2']);
  gates.get('dm1')!.resolve();
  gates.get('dm2')!.resolve();
  assert.deepEqual(await Promise.all([dm1, dm2]), ['success', 'success']);

  await bot.destroy();
});

test('Yuzuha drops excess pending commands with dispatch.dropped log and ignores non-commands', async () => {
  const logs: LogRecord[] = [];
  let commandObserverCalls = 0;
  const bot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    prefix: async () => '!',
    concurrency: { max: 1, maxPending: 1 },
    onCommand() { commandObserverCalls++; },
    onLog(record) { logs.push(record); },
  });

  const gate = deferred();
  let runs = 0;
  bot.command(defineCommand({
    name: 'slow',
    async run() {
      runs++;
      await gate.promise;
    },
  }));

  const first = bot.handle(mockMessage('!slow', { id: '1', guildID: '100', channelID: '200' }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runs, 1);

  const second = bot.handle(mockMessage('!slow', { id: '2', guildID: '100', channelID: '200' }));
  await new Promise(resolve => setImmediate(resolve));

  // Third command exceeds maxPending=1 and must drop immediately.
  const third = await bot.handle(mockMessage('!slow', { id: '3', guildID: '100', channelID: '201' }));
  assert.equal(third, 'ignored');

  // Non-command messages must not consume concurrency slots or emit dispatch.dropped.
  assert.equal(await bot.handle(mockMessage('hello chat', { id: '4', guildID: '100', channelID: '202' })), 'ignored');

  const dropped = logs.filter(record => record.event === 'dispatch.dropped');
  assert.equal(dropped.length, 1);
  const droppedRecord = dropped[0]!;
  assert.equal(droppedRecord.event, 'dispatch.dropped');
  if (droppedRecord.event === 'dispatch.dropped') {
    assert.deepEqual(
      { event: droppedRecord.event, reason: droppedRecord.reason, guildID: droppedRecord.guildID, channelID: droppedRecord.channelID },
      { event: 'dispatch.dropped', reason: 'concurrency', guildID: '100', channelID: '201' },
    );
  }

  gate.resolve();
  assert.deepEqual(await Promise.all([first, second]), ['success', 'success']);
  assert.equal(runs, 2);
  assert.equal(commandObserverCalls, 2);
  await bot.destroy();
});

test('destroy() releases queued waiters cleanly without emitting dispatch.dropped', async () => {
  const logs: LogRecord[] = [];
  const bot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    concurrency: { max: 1, maxPending: 5 },
    onLog(record) { logs.push(record); },
  });

  const entered = deferred();
  const gate = deferred();
  let runs = 0;
  bot.command(defineCommand({
    name: 'block',
    async run() {
      runs++;
      entered.resolve();
      await gate.promise;
    },
  }));

  const active = bot.handle(mockMessage('!block', { id: '1' }));
  await entered.promise;

  const queued1 = bot.handle(mockMessage('!block', { id: '2' }));
  const queued2 = bot.handle(mockMessage('!block', { id: '3' }));

  const destroying = bot.destroy();
  assert.deepEqual(await Promise.all([queued1, queued2]), ['ignored', 'ignored']);

  gate.resolve();
  assert.equal(await active, 'success');
  await destroying;
  assert.equal(runs, 1);
  assert.equal(logs.some(record => record.event === 'dispatch.dropped'), false);
});
