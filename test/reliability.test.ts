import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@fluxerjs/core';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CommandContext, GuardError, HttpService, JsonStore, MemoryStore, PartialModerationError, Scheduler, SQLiteStore, Yuzuha } from '../src/index.js';
import type { LogRecord, Store } from '../src/index.js';
import { Runtime, registerBuiltins } from '../src/functions.js';
import { mockMessage, MockTransport, mockResources } from '../src/testing.js';
import { createCollectorsResources } from '../src/infrastructure/fluxer/resources/collectors.js';

const task = () => ({ guildID: '100', channelID: '200', authorID: '1', command: 'ping', input: '', due: 0 });
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};

test('schedule history survives JSON and SQLite reopening and rejects corrupt transactions', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-history-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const factory of [() => new JsonStore(join(directory, 'history.json')), () => new SQLiteStore(join(directory, 'history.sqlite'))]) {
    const store: Store = factory(), scheduler = new Scheduler(store, async () => { throw new Error('failure'); });
    await scheduler.add({ ...task(), maxAttempts: 1 }); await scheduler.tick(0);
    await assert.rejects(store.update(state => { state.scheduleHistory![0]!.finishedAt = NaN; }), { code: 'STORE_INVALID' });
    await store.close?.();
    const reopened: Store = factory(), second = new Scheduler(reopened, async () => {});
    const failed = (await second.failed())[0]!;
    assert.equal(failed.status, 'failed'); assert.equal(failed.task.command, 'ping');
    const id = await second.retry(failed.id, 1);
    assert.ok(id); await second.tick(1);
    assert.deepEqual((await second.history()).map(item => item.status), ['failed', 'success']);
    await reopened.close?.();
  }
});

test('scheduler persists bounded history, isolates access and refuses unsafe replay', async () => {
  const store = new MemoryStore();
  let error: unknown = new Error('token secreto em mensagem de erro');
  const scheduler = new Scheduler(store, async () => { if (error) throw error; }, { historyLimit: 3 });
  await scheduler.add({ ...task(), maxAttempts: 2, retryDelayMs: 1 });
  await scheduler.tick(0); await scheduler.tick(1);
  assert.deepEqual((await scheduler.history()).map(item => item.status), ['retrying', 'failed']);
  const failed = (await scheduler.failed())[0]!;
  assert.equal(failed.errorCode, 'UNEXPECTED_ERROR');
  assert.equal(JSON.stringify(failed).includes('secreto'), false);
  assert.equal(await scheduler.retry(failed.id, 2, { guildID: 'outro', authorID: '1' }), null);
  assert.deepEqual(await scheduler.failed({ guildID: '100', authorID: '2' }), []);
  const retry = await scheduler.retry(failed.id, 2);
  assert.ok(retry); error = undefined; await scheduler.tick(2);
  assert.equal((await scheduler.history()).at(-1)?.status, 'success');
  for (const failure of [new GuardError('negado'), new PartialModerationError('ban', '2', new Error('disco'))]) {
    error = failure; await scheduler.add(task()); await scheduler.tick(3);
    const last = (await scheduler.failed()).at(-1)!;
    await assert.rejects(scheduler.retry(last.id), /não permite reexecução/);
  }
  assert.equal((await scheduler.history()).length, 3);
  const snapshot = await scheduler.history(); snapshot[0]!.task.command = 'alterado';
  assert.notEqual((await scheduler.history())[0]!.task.command, 'alterado');
});

test('heartbeat prevents another scheduler recovering a live execution', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let now = 0;
  const store = new MemoryStore(), started = deferred(), finish = deferred();
  const first = new Scheduler(store, async () => { started.resolve(); await finish.promise; }, { leaseMs: 90, heartbeatMs: 10, now: () => now });
  const second = new Scheduler(store, async () => {}, { leaseMs: 90, now: () => now });
  await first.add(task());
  const tick = first.tick(0); await started.promise;
  now = 180; t.mock.timers.tick(10); await Promise.resolve();
  assert.equal((await store.read(state => state.schedules[0]?.runningAt)), 180);
  assert.equal(await second.recover(181), 0);
  finish.resolve(); await tick;
  assert.equal((await first.history())[0]?.status, 'success');
});

test('stop aborts active tasks and drain waits for durable finalization', async () => {
  const started = deferred();
  const scheduler = new Scheduler(new MemoryStore(), async (_task, signal) => {
    started.resolve();
    await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }));
  });
  await scheduler.add(task());
  const work = scheduler.tick(0); await started.promise;
  scheduler.stop(); await scheduler.drain(); await work;
  assert.equal((await scheduler.history())[0]?.status, 'retrying');
  assert.equal((await scheduler.list())[0]?.runningAt, null);
});

test('automatic scheduler store failures reach hooks', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const seen = deferred(), errors: unknown[] = [];
  const store: Store = { read: async () => { throw new Error('disk'); }, update: async () => { throw new Error('disk'); } };
  const scheduler = new Scheduler(store, async () => {}, { onError(error) { errors.push(error); seen.resolve(); } });
  scheduler.start(10); await seen.promise;
  t.mock.timers.tick(10); await Promise.resolve(); await scheduler.drain(); scheduler.stop();
  assert.ok(errors.length >= 2);
});

test('destroy cancels command HTTP body reads and drains scheduler before closing stores', async () => {
  const started = deferred(); let bodyCancelled = false;
  const http = new HttpService({ allowPrivate: true, fetch: async () => new Response(new ReadableStream({
    start() { started.resolve(); }, cancel() { bodyCancelled = true; },
  })) });
  const store = new MemoryStore(), transport = new MockTransport();
  const logs: LogRecord[] = [];
  const bot = new Yuzuha({ store, transport, http, onError() {}, onLog: record => { logs.push(record); } });
  bot.command({ name: 'ping', async run(ctx) { await ctx.http.request({ method: 'GET', url: 'http://localhost/test' }); } });
  await bot.scheduler!.add(task()); const tick = bot.scheduler!.tick(0);
  await started.promise; await bot.destroy(); await tick;
  assert.equal(bodyCancelled, true);
  assert.equal(transport.messages.length, 0);
  assert.equal((await bot.scheduler!.history())[0]?.status, 'retrying');
  assert.ok(logs.some(row => row.event === 'schedule.finish'));
  assert.equal(new Set(logs.filter(row => row.executionID).map(row => row.executionID)).size, 1);
});

test('HTTP pre-abort never starts fetch; custom signals combine with context cancellation', async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  const http = new HttpService({ allowPrivate: true, fetch: async () => { calls++; return new Response('ok'); } });
  await assert.rejects(http.request({ method: 'GET', url: 'http://localhost', signal: controller.signal }), { code: 'EXECUTION_ABORTED' });
  assert.equal(calls, 0);
  const outer = new AbortController(), entered = deferred();
  const bound = new HttpService({ allowPrivate: true, fetch: async (_url, init) => {
    entered.resolve(); return await new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } }).withSignal(outer.signal);
  const work = bound.request({ method: 'GET', url: 'http://localhost', signal: new AbortController().signal });
  await entered.promise; outer.abort();
  await assert.rejects(work, { code: 'EXECUTION_ABORTED' });
});

test('collector cancellation removes SDK listeners and settles once', async () => {
  const client = new Client(), collectors = createCollectorsResources(client), controller = new AbortController();
  const before = client.eventNames().map(name => [name, client.listenerCount(name)] as const);
  const messages = collectors.awaitMessage('200', { timeMs: 60_000, signal: controller.signal });
  const reactions = collectors.awaitReaction('200', '10', '✅', 60_000, undefined, controller.signal);
  controller.abort();
  await assert.rejects(messages, { code: 'EXECUTION_ABORTED' });
  await assert.rejects(reactions, { code: 'EXECUTION_ABORTED' });
  for (const [name, count] of before) assert.equal(client.listenerCount(name), count);
  assert.equal(client.eventNames().filter(name => !before.some(([original]) => original === name)).length, 0);
  await client.destroy();
});

test('$try cannot swallow cancellation and context propagates its signal to collectors', async () => {
  const controller = new AbortController(), entered = deferred();
  let received: AbortSignal | undefined;
  const resources = mockResources({ collectors: { async awaitMessage(_channel, input) {
    received = input.signal; entered.resolve();
    return await new Promise((_resolve, reject) => input.signal!.addEventListener('abort', () => reject(new Error('abort')), { once: true }));
  } } });
  const ctx = new CommandContext({ message: mockMessage('!ping'), command: { name: 'ping', code: '' },
    transport: new MockTransport(), store: new MemoryStore(), resources, signal: controller.signal, cooldown: () => 0 });
  const runtime = registerBuiltins(new Runtime()), work = runtime.execute(runtime.compile('$try[$awaitMessage[60];fallback]'), ctx);
  await entered.promise; controller.abort();
  await assert.rejects(work, { code: 'EXECUTION_ABORTED' }); assert.equal(received?.aborted, true);
});

test('structured logs correlate outcomes and omit input, secrets and raw errors', async t => {
  const logs: LogRecord[] = [], bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false,
    onError() {}, onLog: record => { logs.push(record); } });
  t.after(() => bot.destroy());
  bot.command({ name: 'ping', run() { throw new Error('SUPER_SECRET_TOKEN'); } });
  assert.equal(await bot.handle(mockMessage('!ping private-input')), 'error');
  assert.deepEqual(logs.map(row => row.event), ['command.start', 'error', 'command.finish']);
  assert.equal(new Set(logs.map(row => row.executionID)).size, 1);
  const serialized = JSON.stringify(logs);
  assert.equal(serialized.includes('SUPER_SECRET'), false); assert.equal(serialized.includes('private-input'), false);
  assert.ok(logs.every(row => Number.isFinite(Date.parse(row.timestamp))));
  assert.ok(logs.some(row => row.durationMs !== undefined && row.durationMs >= 0));
});

test('scheduler log hook can request bot shutdown without waiting on its own execution', { timeout: 2000 }, async () => {
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), onError() {},
    async onLog(record) { if (record.event === 'schedule.start') await bot.destroy(); } });
  bot.command({ name: 'ping', run() {} });
  await bot.scheduler!.add(task()); await bot.scheduler!.tick(0); await bot.destroy();
  assert.equal(bot.signal.aborted, true);
  assert.equal((await bot.scheduler!.history())[0]?.status, 'retrying');
});
