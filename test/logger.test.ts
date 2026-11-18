import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client, Events } from '@fluxerjs/core';
import { createConsoleLogger, MemoryStore, Yuzuha } from '../src/index.js';
import type { LogMethod, LogRecord, YuzuhaLogger } from '../src/index.js';
import { functions } from '../src/functions.js';
import { runBot } from '../src/cli/runner.js';
import { MockTransport, fakeTimers, mockMessage } from '../src/testing.js';
import type { FakeTimers } from '../src/testing.js';
import type { Store } from '../src/ports/store.js';

interface RecordedEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  objOrMsg: Record<string, unknown> | string;
  msg?: string;
}

function spyLogger(options: { includeDebug?: boolean } = {}) {
  const entries: RecordedEntry[] = [];
  const record = (level: RecordedEntry['level']): LogMethod =>
    (objOrMsg: Record<string, unknown> | string, msg?: string) => {
      entries.push({ level, objOrMsg, msg });
    };
  const logger: YuzuhaLogger = {
    ...(options.includeDebug === false ? {} : { debug: record('debug') }),
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
  };
  return { logger, entries };
}

function flush(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

test('createConsoleLogger respects minimum levels, pino signatures and child bindings', t => {
  const calls: { level: string; args: unknown[] }[] = [];
  for (const method of ['debug', 'info', 'warn', 'error'] as const) {
    t.mock.method(console, method, (...args: unknown[]) => { calls.push({ level: method, args }); });
  }

  const defaultLogger = createConsoleLogger();
  defaultLogger.debug?.({ a: 1 }, 'skip');
  defaultLogger.info('hello');
  defaultLogger.warn({ attempt: 1 }, 'retry');
  defaultLogger.error('boom');
  assert.deepEqual(calls.map(c => c.level), ['info', 'warn', 'error']);
  assert.deepEqual(calls[0]?.args, ['hello']);
  assert.deepEqual(calls[1]?.args, ['retry', { attempt: 1 }]);

  calls.length = 0;
  const debugLogger = createConsoleLogger({ level: 'debug' });
  const child = debugLogger.child?.({ service: 'bot' });
  assert.ok(child);
  child.debug?.({ command: 'ping' }, 'command.start');
  child.info('ready');
  assert.deepEqual(calls, [
    { level: 'debug', args: ['command.start', { service: 'bot', command: 'ping' }] },
    { level: 'info', args: ['ready', { service: 'bot' }] },
  ]);

  calls.length = 0;
  const errorOnly = createConsoleLogger({ level: 'error' });
  errorOnly.debug?.('a');
  errorOnly.info('b');
  errorOnly.warn('c');
  errorOnly.error({ code: 'X' });
  assert.deepEqual(calls, [{ level: 'error', args: [{ code: 'X' }] }]);

  for (const invalid of [null, [], { level: 'trace' }, { level: 123 }]) {
    assert.throws(() => createConsoleLogger(invalid as never), { code: 'LOGGER_OPTIONS' });
  }
  assert.throws(() => defaultLogger.child?.([] as never), { code: 'LOGGER_OPTIONS' });
});

test('Yuzuha constructor validates logger shapes and accepts false or minimal loggers', async () => {
  const validBase = { info() {}, warn() {}, error() {} };
  for (const invalid of [
    null,
    true,
    42,
    [],
    {},
    { info() {}, warn() {} },
    { ...validBase, error: 'not-fn' },
    { ...validBase, debug: 'not-fn' },
    { ...validBase, child: 123 },
  ]) {
    assert.throws(
      () => new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), logger: invalid as never }),
      { code: 'LOGGER_OPTIONS' },
    );
  }

  const minimalBot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    logger: validBase,
  });
  minimalBot.command({ name: 'ping', async run(ctx) { await ctx.reply('pong'); } });
  assert.equal(await minimalBot.handle(mockMessage('!ping')), 'success');
  await minimalBot.destroy();

  const silentBot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    logger: false,
  });
  await silentBot.destroy();
});

test('emitLog routes every LogEvent to its expected logger level and preserves class this-binding', async t => {
  class ClassLogger implements YuzuhaLogger {
    readonly entries: RecordedEntry[] = [];
    debug(objOrMsg: Record<string, unknown> | string, msg?: string): void { this.push('debug', objOrMsg, msg); }
    info(objOrMsg: Record<string, unknown> | string, msg?: string): void { this.push('info', objOrMsg, msg); }
    warn(objOrMsg: Record<string, unknown> | string, msg?: string): void { this.push('warn', objOrMsg, msg); }
    error(objOrMsg: Record<string, unknown> | string, msg?: string): void { this.push('error', objOrMsg, msg); }
    private push(level: RecordedEntry['level'], objOrMsg: Record<string, unknown> | string, msg?: string): void {
      this.entries.push({ level, objOrMsg, msg });
    }
  }

  const logger = new ClassLogger();
  const onLogs: LogRecord[] = [];
  const transport = new MockTransport();
  transport.delete = async () => { throw Object.assign(new Error('gone'), { code: 'DELETE_FAIL' }); };
  const timers = fakeTimers();
  const bot = new Yuzuha({
    transport,
    store: new MemoryStore(),
    engine: functions(),
    timers,
    unsafeDisableResourceAuthorization: true,
    onError() {},
    onLog: record => { onLogs.push(record); },
    logger,
  });
  t.after(() => bot.destroy());

  await flush();
  assert.ok(logger.entries.some(e => e.level === 'warn' && e.msg === 'authorization.disabled'));

  bot.command({
    name: 'ttl',
    async run(ctx) {
      await ctx.send('hi', undefined, { ttlMs: 1_000 });
    },
  });
  bot.command({
    name: 'boom',
    run() { throw new Error('unexpected boom'); },
  });
  bot.scriptEvent({ event: 'guildMemberAdd', code: '$setGuildVar[joined;$eventUserID]' });

  assert.equal(await bot.handle(mockMessage('!ttl')), 'success');
  timers.advance(1_000);
  await flush();
  assert.ok(logger.entries.some(e => e.level === 'debug' && e.msg === 'command.start'));
  assert.ok(logger.entries.some(e => e.level === 'debug' && e.msg === 'command.finish'));
  assert.ok(logger.entries.some(e => e.level === 'warn' && e.msg === 'message.ttl_failed'));

  assert.equal(await bot.handle(mockMessage('!boom')), 'error');
  assert.ok(logger.entries.some(e => e.level === 'error' && e.msg === 'error'));

  const member = {
    id: '2',
    guild: { id: '100' },
    user: { username: 'Ana', bot: false },
  };
  bot.client.emit('guildMemberAdd', member as never);
  await flush();
  assert.ok(logger.entries.some(e => e.level === 'debug' && e.msg === 'event.start'));
  assert.ok(logger.entries.some(e => e.level === 'debug' && e.msg === 'event.finish'));

  await bot.scheduler!.add({ guildID: '100', channelID: '200', authorID: '1', command: 'ttl', input: '', due: 0 });
  await bot.scheduler!.tick(0);
  assert.ok(logger.entries.some(e => e.level === 'info' && e.msg === 'schedule.start'));
  assert.ok(logger.entries.some(e => e.level === 'info' && e.msg === 'schedule.finish'));

  assert.equal(onLogs.length, logger.entries.length);
  assert.equal(Object.isFrozen(onLogs[0]), true);
});

test('transport.retry and schedule.error log at warn and error levels respectively', async t => {
  const { logger, entries } = spyLogger();
  const client = new Client();
  let deleteAttempts = 0;
  t.mock.method(client.rest, 'delete', async () => {
    deleteAttempts++;
    if (deleteAttempts === 1) throw Object.assign(new Error('socket reset'), { code: 'ECONNRESET' });
  });

  const retryBot = new Yuzuha({
    client,
    store: new MemoryStore(),
    scheduler: false,
    retry: { requests: 1, delayMs: 1 },
    logger,
  });
  t.after(() => retryBot.destroy());
  await retryBot.transport.delete('200', '10');
  await flush();
  assert.equal(deleteAttempts, 2);
  assert.ok(entries.some(e => e.level === 'warn' && e.msg === 'transport.retry' && (e.objOrMsg as Record<string, unknown>).attempt === 1));

  const failTimers: FakeTimers = fakeTimers();
  const brokenStore: Store = {
    read: async () => { throw new Error('disk unavailable'); },
    update: async () => { throw new Error('disk unavailable'); },
  };
  const schedSpy = spyLogger();
  const schedBot = new Yuzuha({
    transport: new MockTransport(),
    store: brokenStore,
    timers: failTimers,
    logger: schedSpy.logger,
    onError() {},
  });
  t.after(() => schedBot.destroy());
  schedBot.scheduler!.start(10);
  failTimers.advance(10);
  await flush();
  assert.ok(schedSpy.entries.some(e => e.level === 'error' && e.msg === 'schedule.error'));
});

test('reportError respects logger, logger: false silencing, and broken logger safety', async t => {
  const consoleErrors: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { consoleErrors.push(args); });

  // 1. logger provided without onError: logs both structured event and diagnostic error, no console.error
  const spy = spyLogger();
  const botWithLogger = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    logger: spy.logger,
  });
  t.after(() => botWithLogger.destroy());
  botWithLogger.command({ name: 'fail', run() { throw new Error('db failure'); } });
  assert.equal(await botWithLogger.handle(mockMessage('!fail')), 'error');
  assert.equal(consoleErrors.length, 0);
  const errorEntries = spy.entries.filter(e => e.level === 'error');
  assert.equal(errorEntries.length, 2);
  assert.equal(errorEntries[0]?.msg, 'error');
  assert.equal(errorEntries[1]?.msg, '[yuzuha]');
  assert.equal((errorEntries[1]?.objOrMsg as Record<string, unknown>).code, 'UNEXPECTED_ERROR');
  assert.equal((errorEntries[1]?.objOrMsg as Record<string, unknown>).command, 'fail');
  assert.ok((errorEntries[1]?.objOrMsg as Record<string, unknown>).err instanceof Error);

  // 2. logger: false without onError stays completely silent
  const silentBot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    logger: false,
  });
  t.after(() => silentBot.destroy());
  silentBot.command({ name: 'fail', run() { throw new Error('silent failure'); } });
  assert.equal(await silentBot.handle(mockMessage('!fail')), 'error');
  assert.equal(consoleErrors.length, 0);

  // 3. throwing logger and throwing onLog never break command outcome
  const throwingBot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    onLog() { throw new Error('onLog failed'); },
    logger: {
      debug() { throw new Error('debug throw'); },
      info() { throw new Error('info throw'); },
      warn() { throw new Error('warn throw'); },
      error() { throw new Error('error throw'); },
    },
  });
  t.after(() => throwingBot.destroy());
  throwingBot.command({ name: 'ok', async run(ctx) { await ctx.reply('still works'); } });
  assert.equal(await throwingBot.handle(mockMessage('!ok')), 'success');
  assert.equal(consoleErrors.at(-1)?.[0], '[yuzuha] LOG_HANDLER_FAILED');

  // 3b. throwing onLog with working logger routes LOG_HANDLER_FAILED to logger.error
  const safeLoggerSpy = spyLogger();
  const safeLoggerBot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    onLog() { throw new Error('onLog failed'); },
    logger: safeLoggerSpy.logger,
  });
  t.after(() => safeLoggerBot.destroy());
  safeLoggerBot.command({ name: 'ok', async run(ctx) { await ctx.reply('ok'); } });
  assert.equal(await safeLoggerBot.handle(mockMessage('!ok')), 'success');
  assert.ok(safeLoggerSpy.entries.some(e => e.level === 'error' && e.msg === '[yuzuha]' && (e.objOrMsg as Record<string, unknown>).code === 'LOG_HANDLER_FAILED'));

  // 4. default logger: undefined preserves console.error
  consoleErrors.length = 0;
  const defaultBot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
  });
  t.after(() => defaultBot.destroy());
  defaultBot.command({ name: 'fail', run() { throw new Error('default failure'); } });
  assert.equal(await defaultBot.handle(mockMessage('!fail')), 'error');
  assert.equal(consoleErrors.length, 1);
  assert.equal(consoleErrors[0]?.[0], '[yuzuha] UNEXPECTED_ERROR');
});

test('runBot routes lifecycle and dev reload messages to bot.options.logger and silences logger: false', async t => {
  const prevToken = process.env.FLUXER_BOT_TOKEN;
  process.env.FLUXER_BOT_TOKEN = 'offline-test-token';
  t.after(() => {
    if (prevToken === undefined) delete process.env.FLUXER_BOT_TOKEN;
    else process.env.FLUXER_BOT_TOKEN = prevToken;
  });

  const consoleLogs: unknown[][] = [];
  const consoleErrors: unknown[][] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => { consoleLogs.push(args); });
  t.mock.method(console, 'error', (...args: unknown[]) => { consoleErrors.push(args); });

  const makeBot = (logger: Yuzuha['options']['logger']) => {
    const client = new Client();
    let resolveDestroyed!: () => void;
    const destroyed = new Promise<void>(resolve => { resolveDestroyed = resolve; });
    Reflect.set(client, 'login', async () => client);
    Reflect.set(client, 'destroy', async () => { resolveDestroyed(); });
    const bot = new Yuzuha({
      client,
      transport: new MockTransport(),
      store: new MemoryStore(),
      scheduler: false,
      logger,
    });
    return { bot, destroyed };
  };

  const runAndTrackClose = async (bot: Yuzuha, destroyed: Promise<void>, path: string, dev: boolean) => {
    const beforeSigint = new Set(process.listeners('SIGINT'));
    await runBot(bot, path, dev);
    const sigintHandler = process.listeners('SIGINT').find(fn => !beforeSigint.has(fn));
    return async () => {
      if (sigintHandler) {
        (sigintHandler as () => void)();
        await destroyed;
      } else {
        await bot.destroy();
      }
    };
  };

  // logger: undefined -> console.log
  const def = makeBot(undefined);
  const closeDef = await runAndTrackClose(def.bot, def.destroyed, '.', false);
  t.after(closeDef);
  def.bot.client.emit(Events.Ready);
  assert.deepEqual(consoleLogs, [['Yuzuha conectado.']]);
  await closeDef();

  // logger: false -> completely silent
  consoleLogs.length = 0;
  const silent = makeBot(false);
  const closeSilent = await runAndTrackClose(silent.bot, silent.destroyed, '.', false);
  t.after(closeSilent);
  silent.bot.client.emit(Events.Ready);
  assert.equal(consoleLogs.length, 0);
  assert.equal(consoleErrors.length, 0);
  await closeSilent();

  // custom logger -> routes ready + dev reload + dev reload failure without console
  consoleLogs.length = 0;
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-runner-logger-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cmdFile = join(directory, 'ping.mjs');
  await writeFile(cmdFile, 'export default { name: "ping", run() {} };');

  const spy = spyLogger();
  const dev = makeBot(spy.logger);
  await dev.bot.load(directory);
  const closeDev = await runAndTrackClose(dev.bot, dev.destroyed, directory, true);
  t.after(closeDev);

  dev.bot.client.emit(Events.Ready);
  assert.ok(spy.entries.some(e => e.level === 'info' && e.objOrMsg === 'Yuzuha conectado.'));

  // Trigger a valid reload and wait for logger.info('Comandos recarregados.')
  await writeFile(cmdFile, 'export default { name: "ping", description: "v2", run() {} };');
  for (let i = 0; i < 40 && !spy.entries.some(e => e.objOrMsg === 'Comandos recarregados.'); i++) {
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.ok(spy.entries.some(e => e.level === 'info' && e.objOrMsg === 'Comandos recarregados.'));

  // Trigger an invalid reload and wait for logger.error(...)
  await writeFile(cmdFile, 'export default { name: "ping", code: 42 };');
  for (let i = 0; i < 40 && !spy.entries.some(e => e.level === 'error'); i++) {
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.ok(spy.entries.some(e => e.level === 'error' && typeof e.objOrMsg === 'string'));
  assert.equal(consoleLogs.length, 0);
  assert.equal(consoleErrors.length, 0);
  await closeDev();
});
