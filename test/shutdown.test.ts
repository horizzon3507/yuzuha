import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Client } from '@fluxerjs/core';
import { MemoryStore, Yuzuha } from '../src/index.js';
import type { LogRecord, YuzuhaLogger } from '../src/index.js';
import { runBot } from '../src/cli/runner.js';
import { MockTransport, fakeTimers, mockMessage } from '../src/testing.js';
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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function flush(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

test('destroy and handleSignals validate timeoutMs and options with SHUTDOWN_OPTIONS', async t => {
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false });
  t.after(() => bot.destroy());

  for (const invalid of [
    null,
    [],
    new Date(),
    'bad',
    { timeoutMs: 0 },
    { timeoutMs: -1 },
    { timeoutMs: 600_001 },
    { timeoutMs: 1.5 },
    { timeoutMs: NaN },
    { timeoutMs: Infinity },
  ]) {
    await assert.rejects(bot.destroy(invalid as never), { code: 'SHUTDOWN_OPTIONS' });
    assert.throws(() => bot.handleSignals(invalid as never), { code: 'SHUTDOWN_OPTIONS' });
  }

  for (const invalidSignals of [
    { signals: [] },
    { signals: [''] },
    { signals: 'SIGINT' },
    { target: {} },
    { onExit: 'exit' },
  ]) {
    assert.throws(() => bot.handleSignals(invalidSignals as never), { code: 'SHUTDOWN_OPTIONS' });
  }

  await bot.destroy({ timeoutMs: 1 });
  assert.throws(() => bot.handleSignals({ target: new EventEmitter() }), { code: 'BOT_CLOSED' });

  const maxBoundary = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false });
  await maxBoundary.destroy({ timeoutMs: 600_000 });
});

test('hung command triggers shutdown.timeout warn log and bounded cleanup proceeds', async () => {
  const timers = trackedTimers();
  const logs: LogRecord[] = [];
  const warns: { obj: Record<string, unknown>; msg?: string }[] = [];
  const logger: YuzuhaLogger = {
    info() {},
    warn(objOrMsg: Record<string, unknown> | string, msg?: string) {
      if (typeof objOrMsg !== 'string') warns.push({ obj: objOrMsg, msg });
    },
    error() {},
  };

  let clientDestroyed = false;
  let musicClosed = false;
  const client = new Client();
  Reflect.set(client, 'destroy', async () => { clientDestroyed = true; });

  const bot = new Yuzuha({
    client,
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    timers,
    logger,
    onLog: record => { logs.push(record); },
    music: { close: async () => { musicClosed = true; } } as never,
  });

  const entered = deferred();
  const release = deferred();
  bot.command({
    name: 'hang',
    async run() {
      entered.resolve();
      await release.promise;
    },
  });

  const running = bot.handle(mockMessage('!hang'));
  await entered.promise;

  let destroyDone = false;
  const closing = bot.destroy({ timeoutMs: 500 }).then(() => { destroyDone = true; });
  await flush();

  assert.equal(destroyDone, false);
  assert.equal(clientDestroyed, false);
  assert.equal(musicClosed, false);
  assert.equal(timers.activeCount, 1);
  assert.deepEqual(timers.delays, [500]);

  timers.advance(500);
  await closing;

  assert.equal(destroyDone, true);
  assert.equal(clientDestroyed, true);
  assert.equal(musicClosed, true);
  assert.equal(timers.activeCount, 0);

  const timeoutLog = logs.find(row => row.event === 'shutdown.timeout') as (LogRecord & { pending?: number }) | undefined;
  assert.ok(timeoutLog);
  assert.equal(timeoutLog.pending, 1);
  assert.ok(warns.some(w => w.msg === 'shutdown.timeout' && w.obj.pending === 1));

  release.resolve();
  assert.equal(await running, 'success');
});

test('normal drain clears shutdown deadline timer without emitting shutdown.timeout', async () => {
  const timers = trackedTimers();
  const logs: LogRecord[] = [];
  const bot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    timers,
    onLog: record => { logs.push(record); },
  });

  const entered = deferred();
  const release = deferred();
  bot.command({
    name: 'work',
    async run(ctx) {
      entered.resolve();
      await release.promise;
      await ctx.reply('done');
    },
  });

  const running = bot.handle(mockMessage('!work'));
  await entered.promise;

  let destroyDone = false;
  const closing = bot.destroy({ timeoutMs: 5_000 }).then(() => { destroyDone = true; });
  await flush();
  assert.equal(timers.activeCount, 1);
  assert.equal(destroyDone, false);

  release.resolve();
  await closing;
  assert.equal(destroyDone, true);
  assert.equal(await running, 'success');
  assert.equal(timers.activeCount, 0);
  assert.equal(logs.some(row => row.event === 'shutdown.timeout'), false);
});

test('inside-handler destroy with timeoutMs resolves immediately while still draining bounded', { timeout: 2000 }, async () => {
  const timers = trackedTimers();
  const logs: LogRecord[] = [];
  let clientDestroyed = false;
  const client = new Client();
  Reflect.set(client, 'destroy', async () => { clientDestroyed = true; });

  const bot = new Yuzuha({
    client,
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    timers,
    onLog: record => { logs.push(record); },
  });

  const hungEntered = deferred();
  const hungRelease = deferred();
  bot.command({
    name: 'hung',
    async run() {
      hungEntered.resolve();
      await hungRelease.promise;
    },
  });

  let selfDestroyResolved = false;
  bot.command({
    name: 'stop',
    async run() {
      await bot.destroy({ timeoutMs: 250 });
      selfDestroyResolved = true;
    },
  });

  const hungTask = bot.handle(mockMessage('!hung'));
  await hungEntered.promise;

  assert.equal(await bot.handle(mockMessage('!stop')), 'success');
  assert.equal(selfDestroyResolved, true);
  assert.equal(clientDestroyed, false);
  assert.equal(timers.activeCount, 1);

  timers.advance(250);
  await bot.destroy();
  assert.equal(clientDestroyed, true);
  assert.equal(timers.activeCount, 0);
  assert.ok(logs.some(row => row.event === 'shutdown.timeout'));

  hungRelease.resolve();
  await hungTask;
});

test('handleSignals binds target signals, invokes onExit, and disposes idempotently on signal, dispose(), or destroy()', async () => {
  const target = new EventEmitter();

  const bot1 = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false });
  const exits1: number[] = [];
  const dispose1 = bot1.handleSignals({ target, timeoutMs: 500, onExit: code => exits1.push(code) });
  assert.equal(target.listenerCount('SIGINT'), 1);
  assert.equal(target.listenerCount('SIGTERM'), 1);

  target.emit('SIGINT');
  assert.equal(target.listenerCount('SIGINT'), 0);
  assert.equal(target.listenerCount('SIGTERM'), 0);
  await flush();
  await flush();
  assert.deepEqual(exits1, [0]);
  dispose1();
  dispose1();

  // Failing destroy (e.g. music.close rejects) passes code 1 to onExit
  const botFail = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    music: { close: async () => { throw new Error('voice close boom'); } } as never,
  });
  const exitsFail: number[] = [];
  botFail.handleSignals({ target, signals: ['SIGUSR2'], onExit: code => exitsFail.push(code) });
  assert.equal(target.listenerCount('SIGUSR2'), 1);
  target.emit('SIGUSR2');
  assert.equal(target.listenerCount('SIGUSR2'), 0);
  await flush();
  await flush();
  assert.deepEqual(exitsFail, [1]);

  // Direct dispose() detaches without destroying
  const bot2 = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false });
  const dispose2 = bot2.handleSignals({ target });
  assert.equal(target.listenerCount('SIGINT'), 1);
  dispose2();
  dispose2();
  assert.equal(target.listenerCount('SIGINT'), 0);
  assert.equal(target.listenerCount('SIGTERM'), 0);
  assert.equal(bot2.signal.aborted, false);
  await bot2.destroy();

  // Direct bot.destroy() automatically disposes registered signal handlers
  const bot3 = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false });
  bot3.handleSignals({ target });
  assert.equal(target.listenerCount('SIGINT'), 1);
  assert.equal(target.listenerCount('SIGTERM'), 1);
  await bot3.destroy();
  assert.equal(target.listenerCount('SIGINT'), 0);
  assert.equal(target.listenerCount('SIGTERM'), 0);
});

test('runBot attaches crash handlers, bounds shutdown, closes store and cleans listeners without killing process', async t => {
  const prevExitCode = process.exitCode;
  t.after(() => { process.exitCode = prevExitCode; });

  const makeRunnerBot = (timers: TrackedTimers, onError: (error: unknown) => void) => {
    const client = new Client();
    let destroyed = false;
    let storeClosed = false;
    Reflect.set(client, 'login', async () => client);
    Reflect.set(client, 'destroy', async () => { destroyed = true; });
    class ClosableStore extends MemoryStore {
      async close(): Promise<void> { storeClosed = true; }
    }
    const store = new ClosableStore();
    const bot = new Yuzuha({
      client,
      transport: new MockTransport(),
      store,
      scheduler: false,
      timers,
      onError,
    });
    return { bot, isDestroyed: () => destroyed, isStoreClosed: () => storeClosed };
  };

  const prevToken = process.env.FLUXER_BOT_TOKEN;
  process.env.FLUXER_BOT_TOKEN = 'offline-runner-token';
  t.after(() => {
    if (prevToken === undefined) delete process.env.FLUXER_BOT_TOKEN;
    else process.env.FLUXER_BOT_TOKEN = prevToken;
  });

  // 1. unhandledRejection reports error, sets exitCode = 1, runs bounded close(), and removes all listeners
  const timers = trackedTimers();
  const reported: unknown[] = [];
  const { bot, isDestroyed, isStoreClosed } = makeRunnerBot(timers, err => { reported.push(err); });
  const target = new EventEmitter();

  const entered = deferred();
  const hung = deferred();
  bot.command({ name: 'hang', async run() { entered.resolve(); await hung.promise; } });

  await runBot(bot, '.', false, { target, timeoutMs: 120 });
  assert.equal(target.listenerCount('SIGINT'), 1);
  assert.equal(target.listenerCount('SIGTERM'), 1);
  assert.equal(target.listenerCount('unhandledRejection'), 1);
  assert.equal(target.listenerCount('uncaughtException'), 1);

  const running = bot.handle(mockMessage('!hang'));
  await entered.promise;

  const crashError = new Error('unhandled boom');
  process.exitCode = undefined;
  target.emit('unhandledRejection', crashError, Promise.resolve());
  await flush();

  assert.equal(process.exitCode, 1);
  assert.deepEqual(reported, [crashError]);
  assert.equal(target.listenerCount('SIGINT'), 0);
  assert.equal(target.listenerCount('SIGTERM'), 0);
  assert.equal(target.listenerCount('unhandledRejection'), 0);
  assert.equal(target.listenerCount('uncaughtException'), 0);
  assert.ok(timers.delays.includes(120));
  assert.equal(isDestroyed(), false);

  timers.advance(120);
  await flush();
  await flush();
  assert.equal(isDestroyed(), true);
  assert.equal(isStoreClosed(), true);
  assert.equal(timers.activeCount, 0);
  hung.resolve();
  await running;

  // 2. uncaughtException triggers the same graceful crash reporting and cleanup
  process.exitCode = undefined;
  const excTimers = trackedTimers();
  const excReported: unknown[] = [];
  const excRun = makeRunnerBot(excTimers, err => { excReported.push(err); });
  const excTarget = new EventEmitter();
  await runBot(excRun.bot, '.', false, { target: excTarget, timeoutMs: 150 });
  const excError = new Error('uncaught boom');
  excTarget.emit('uncaughtException', excError, 'uncaughtException');
  await flush();
  await flush();
  assert.equal(process.exitCode, 1);
  assert.deepEqual(excReported, [excError]);
  assert.equal(excRun.isDestroyed(), true);
  assert.equal(excRun.isStoreClosed(), true);
  assert.equal(excTarget.listenerCount('unhandledRejection'), 0);
  assert.equal(excTarget.listenerCount('uncaughtException'), 0);

  // 3. SIGINT closes cleanly without setting exitCode = 1 and removes all listeners
  process.exitCode = undefined;
  const sigTimers = trackedTimers();
  const sigRun = makeRunnerBot(sigTimers, () => {});
  const sigTarget = new EventEmitter();
  await runBot(sigRun.bot, '.', false, { target: sigTarget, timeoutMs: 250 });
  sigTarget.emit('SIGINT');
  await flush();
  await flush();
  assert.equal(process.exitCode, undefined);
  assert.equal(sigRun.isDestroyed(), true);
  assert.equal(sigRun.isStoreClosed(), true);
  assert.equal(sigTarget.listenerCount('unhandledRejection'), 0);
  assert.equal(sigTarget.listenerCount('uncaughtException'), 0);
});
