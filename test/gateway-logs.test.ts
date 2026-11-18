import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, Events } from '@fluxerjs/core';
import {
  ConfigError,
  MemoryStore,
  YUZUHA_ERROR_CODES,
  Yuzuha,
  createConsoleLogger,
  currentExecution,
  isYuzuhaError,
} from '../src/index.js';
import type {
  ConsoleLogLevel,
  ExecutionStore,
  GatewayLogEvent,
  GatewayLogOptions,
  LogMethod,
  LogRecord,
  YuzuhaLogger,
} from '../src/index.js';
import { MockTransport } from '../src/testing.js';

const ALL_GATEWAY_LOG_EVENTS = [
  Events.Ready,
  Events.Resumed,
  Events.ShardReady,
  Events.ShardResumed,
  Events.ShardReconnecting,
  Events.ShardDisconnect,
  Events.ShardingRequired,
  'warn',
  Events.Debug,
] as const;

interface RecordedLoggerEntry {
  level: ConsoleLogLevel;
  fields: Record<string, unknown> | string;
  event?: string;
  als?: ExecutionStore;
}

function spyLogger(options: { includeDebug?: boolean } = {}) {
  const entries: RecordedLoggerEntry[] = [];
  const make = (level: ConsoleLogLevel): LogMethod =>
    (fields: Record<string, unknown> | string, event?: string) => {
      entries.push({ level, fields, event, als: currentExecution() });
    };
  const logger: YuzuhaLogger = {
    ...(options.includeDebug === false ? {} : { debug: make('debug') }),
    info: make('info'),
    warn: make('warn'),
    error: make('error'),
  };
  return { logger, entries };
}

function flush(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test('gatewayLogs is disabled by default and validates GatewayLogOptions', async () => {
  assert.ok(YUZUHA_ERROR_CODES.includes('GATEWAY_LOG_OPTIONS'));

  for (const gatewayLogs of [undefined, false] as const) {
    const client = new Client();
    const logs: LogRecord[] = [];
    const { logger, entries } = spyLogger();
    const bot = new Yuzuha({
      client,
      transport: new MockTransport(),
      store: new MemoryStore(),
      scheduler: false,
      gatewayLogs,
      onLog: record => { logs.push(record); },
      logger,
    });

    for (const name of ALL_GATEWAY_LOG_EVENTS) {
      assert.equal(client.listenerCount(name), 0, `unexpected listener on ${name}`);
    }

    client.emit(Events.Ready);
    client.emit(Events.Resumed);
    client.emit(Events.ShardReady, 0);
    client.emit(Events.ShardResumed, 0);
    client.emit(Events.ShardReconnecting, 0);
    client.emit(Events.ShardDisconnect, 0, 1006);
    client.emit(Events.ShardingRequired, { shardId: 0, numShards: 2 });
    client.emit('warn', 'careful');
    client.emit(Events.Debug, 'verbose');
    await flush();

    assert.equal(logs.length, 0);
    assert.equal(entries.length, 0);
    await bot.destroy();
  }

  const sharedClient = new Client();
  for (const invalid of [
    null,
    0,
    1,
    'true',
    [],
    new Date(),
    { debug: 'true' },
    { debug: 1 },
    { debug: null },
  ]) {
    assert.throws(
      () => new Yuzuha({
        client: sharedClient,
        transport: new MockTransport(),
        store: new MemoryStore(),
        scheduler: false,
        gatewayLogs: invalid as unknown as GatewayLogOptions,
      }),
      err => err instanceof ConfigError && isYuzuhaError(err, 'GATEWAY_LOG_OPTIONS'),
    );
  }
  for (const name of ALL_GATEWAY_LOG_EVENTS) {
    assert.equal(sharedClient.listenerCount(name), 0);
  }
});

test('forwards all gateway, shard and SDK lifecycle events to onLog and logger with gateway ALS correlation', async t => {
  const client = new Client();
  const records: LogRecord[] = [];
  const alsInOnLog: (ExecutionStore | undefined)[] = [];
  const { logger, entries } = spyLogger();
  const nullProtoOptions: GatewayLogOptions = Object.assign(Object.create(null) as GatewayLogOptions, { debug: true });

  const bot = new Yuzuha({
    client,
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    gatewayLogs: nullProtoOptions,
    onLog: async record => {
      await flush();
      records.push(record);
      alsInOnLog.push(currentExecution());
    },
    logger,
  });
  t.after(() => bot.destroy());

  for (const name of ALL_GATEWAY_LOG_EVENTS) {
    assert.equal(client.listenerCount(name), 1, `expected 1 listener on ${name}`);
  }

  client.emit(Events.ShardReady, 2);
  client.emit(Events.Ready);
  client.emit(Events.ShardResumed, 2);
  client.emit(Events.Resumed);
  client.emit(Events.ShardReconnecting, 1);
  client.emit(Events.ShardDisconnect, 1, 1006);
  client.emit(Events.ShardingRequired, { shardId: 0, numShards: 4 });
  client.emit('warn', 'session limit 90%');
  client.emit(Events.Debug, '[Shard 0] Heartbeat ack');

  await flush();
  await flush();

  const expected: {
    log: GatewayLogEvent;
    level: ConsoleLogLevel;
    trigger: string;
  }[] = [
    { log: { event: 'gateway.shard_ready', shardID: 2 }, level: 'info', trigger: Events.ShardReady },
    { log: { event: 'gateway.ready' }, level: 'info', trigger: Events.Ready },
    { log: { event: 'gateway.shard_resumed', shardID: 2 }, level: 'info', trigger: Events.ShardResumed },
    { log: { event: 'gateway.resumed' }, level: 'info', trigger: Events.Resumed },
    { log: { event: 'gateway.shard_reconnecting', shardID: 1 }, level: 'warn', trigger: Events.ShardReconnecting },
    { log: { event: 'gateway.shard_disconnect', shardID: 1, closeCode: 1006 }, level: 'warn', trigger: Events.ShardDisconnect },
    { log: { event: 'gateway.sharding_required', shardID: 0, numShards: 4 }, level: 'warn', trigger: Events.ShardingRequired },
    { log: { event: 'sdk.warn', message: 'session limit 90%' }, level: 'warn', trigger: 'warn' },
    { log: { event: 'sdk.debug', message: '[Shard 0] Heartbeat ack' }, level: 'debug', trigger: Events.Debug },
  ];

  assert.equal(records.length, expected.length);
  assert.equal(entries.length, expected.length);

  const seenIDs = new Set<string>();
  for (let i = 0; i < expected.length; i++) {
    const spec = expected[i]!;
    const record = records[i]!;
    const loggerEntry = entries[i]!;
    const als = alsInOnLog[i];

    assert.equal(Object.isFrozen(record), true);
    assert.equal(typeof record.timestamp, 'string');
    assert.equal(typeof record.executionID, 'string');
    assert.ok(record.executionID!.length > 0);
    seenIDs.add(record.executionID!);

    const { timestamp: _ts, executionID, ...rest } = record;
    assert.deepEqual(rest, spec.log);

    assert.equal(Object.isFrozen(als), true);
    assert.deepEqual(als, {
      executionID,
      source: 'gateway',
      event: spec.trigger,
    });

    assert.equal(loggerEntry.level, spec.level);
    assert.equal(loggerEntry.event, spec.log.event);
    assert.deepEqual(loggerEntry.als, als);
    assert.deepEqual(loggerEntry.fields, {
      timestamp: record.timestamp,
      executionID,
      ...Object.fromEntries(Object.entries(spec.log).filter(([key]) => key !== 'event')),
    });
  }
  assert.equal(seenIDs.size, expected.length);
});

test('debug gateway logs require explicit debug: true and respect logger debug support and level', async t => {
  for (const gatewayLogs of [true, {}, { debug: false }] as const) {
    const client = new Client();
    const records: LogRecord[] = [];
    const { logger, entries } = spyLogger();
    const bot = new Yuzuha({
      client,
      transport: new MockTransport(),
      store: new MemoryStore(),
      scheduler: false,
      gatewayLogs,
      onLog: record => { records.push(record); },
      logger,
    });

    assert.equal(client.listenerCount(Events.Debug), 0);
    assert.equal(client.listenerCount(Events.Ready), 1);

    client.emit(Events.Debug, 'ignored debug frame');
    client.emit(Events.Ready);
    client.emit('warn', 429);
    await flush();

    assert.deepEqual(records.map(r => r.event), ['gateway.ready', 'sdk.warn']);
    assert.equal((records[1] as { message?: string }).message, '429');
    assert.deepEqual(entries.map(e => [e.level, e.event]), [
      ['info', 'gateway.ready'],
      ['warn', 'sdk.warn'],
    ]);
    await bot.destroy();
  }

  // Minimal logger without optional debug() ignores sdk.debug without throwing while onLog still receives it
  const minimalRecords: LogRecord[] = [];
  const minimalSpy = spyLogger({ includeDebug: false });
  const minimalBot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    gatewayLogs: { debug: true },
    onLog: record => { minimalRecords.push(record); },
    logger: minimalSpy.logger,
  });
  t.after(() => minimalBot.destroy());

  minimalBot.client.emit(Events.Debug, 'handshake ok');
  minimalBot.client.emit(Events.Resumed);
  await flush();

  assert.deepEqual(minimalRecords.map(r => r.event), ['sdk.debug', 'gateway.resumed']);
  assert.deepEqual(minimalSpy.entries.map(e => e.event), ['gateway.resumed']);

  // createConsoleLogger filters sdk.debug at default info level and emits it at debug level
  const consoleCalls: { level: ConsoleLogLevel; args: unknown[] }[] = [];
  for (const method of ['debug', 'info', 'warn', 'error'] as const) {
    t.mock.method(console, method, (...args: unknown[]) => { consoleCalls.push({ level: method, args }); });
  }

  const infoConsoleBot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    gatewayLogs: { debug: true },
    logger: createConsoleLogger({ level: 'info' }),
  });
  t.after(() => infoConsoleBot.destroy());
  infoConsoleBot.client.emit(Events.Debug, 'hidden debug');
  infoConsoleBot.client.emit(Events.ShardDisconnect, 0, 1001);
  await flush();
  assert.deepEqual(consoleCalls.map(c => [c.level, c.args[0]]), [['warn', 'gateway.shard_disconnect']]);

  consoleCalls.length = 0;
  const debugConsoleBot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    gatewayLogs: { debug: true },
    logger: createConsoleLogger({ level: 'debug' }),
  });
  t.after(() => debugConsoleBot.destroy());
  debugConsoleBot.client.emit(Events.Debug, 'visible debug');
  await flush();
  assert.deepEqual(consoleCalls.map(c => [c.level, c.args[0]]), [['debug', 'sdk.debug']]);
});

test('destroy drains teardown gateway logs, removes all gateway log listeners and preserves user listeners', async () => {
  const client = new Client();
  const userSeen: string[] = [];
  const userReady = () => { userSeen.push('ready'); };
  const userDisconnect = (shardId: number, code: number) => { userSeen.push(`disconnect:${shardId}:${code}`); };
  const userWarn = (msg: unknown) => { userSeen.push(`warn:${String(msg)}`); };
  const userDebug = (msg: string) => { userSeen.push(`debug:${msg}`); };
  client.on(Events.Ready, userReady);
  client.on(Events.ShardDisconnect, userDisconnect);
  client.on('warn', userWarn);
  client.on(Events.Debug, userDebug);

  const gate = deferred();
  let drained = false;
  const events: string[] = [];

  const bot = new Yuzuha({
    client,
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    gatewayLogs: { debug: true },
    onLog: async record => {
      events.push(record.event);
      if (record.event === 'gateway.shard_disconnect') {
        await gate.promise;
        drained = true;
      }
    },
  });

  Reflect.set(client, 'destroy', async () => {
    client.emit(Events.Debug, 'closing socket');
    client.emit(Events.ShardDisconnect, 0, 1000);
  });

  const closing = bot.destroy();
  await flush();
  assert.equal(drained, false);

  gate.resolve();
  await closing;
  assert.equal(drained, true);
  assert.deepEqual(events, ['sdk.debug', 'gateway.shard_disconnect']);
  assert.deepEqual(userSeen, ['debug:closing socket', 'disconnect:0:1000']);

  assert.deepEqual(client.listeners(Events.Ready), [userReady]);
  assert.deepEqual(client.listeners(Events.ShardDisconnect), [userDisconnect]);
  assert.deepEqual(client.listeners('warn'), [userWarn]);
  assert.deepEqual(client.listeners(Events.Debug), [userDebug]);
  for (const name of [Events.Resumed, Events.ShardReady, Events.ShardResumed, Events.ShardReconnecting, Events.ShardingRequired] as const) {
    assert.equal(client.listenerCount(name), 0, `expected 0 listeners on ${name}`);
  }

  // Self-destroy requested inside onLog resolves immediately without deadlocking
  const selfClient = new Client();
  Reflect.set(selfClient, 'destroy', async () => {});
  let handlerFinished = false;
  const selfBot = new Yuzuha({
    client: selfClient,
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    gatewayLogs: true,
    onLog: async record => {
      if (record.event === 'gateway.ready') {
        await selfBot.destroy();
        handlerFinished = true;
      }
    },
  });
  selfClient.emit(Events.Ready);
  await flush();
  await selfBot.destroy();
  assert.equal(handlerFinished, true);
  for (const name of ALL_GATEWAY_LOG_EVENTS) {
    assert.equal(selfClient.listenerCount(name), 0);
  }
});

test('failed login and mid-login destroy symmetrically clean up 100% of gateway log listeners and support retry', async () => {
  const client = new Client();
  const userShardReady = () => {};
  client.on(Events.ShardReady, userShardReady);

  const logged: string[] = [];
  const drainGate = deferred();
  let drainCompleted = false;
  let loginAttempt = 0;

  Reflect.set(client, 'login', async () => {
    loginAttempt++;
    client.emit(Events.Debug, `attempt:${loginAttempt}`);
    if (loginAttempt === 1) {
      client.emit(Events.ShardDisconnect, 0, 4004);
      throw new Error('invalid token');
    }
    client.emit(Events.ShardReady, 0);
    client.emit(Events.Ready);
    return client;
  });
  Reflect.set(client, 'destroy', async () => {
    if (loginAttempt === 1) client.emit('warn', 'tearing down failed login');
  });

  const bot = new Yuzuha({
    client,
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    gatewayLogs: { debug: true },
    onLog: async record => {
      logged.push(record.event);
      if (record.event === 'sdk.warn') {
        await drainGate.promise;
        drainCompleted = true;
      }
    },
  });

  // 1. Missing token rejects and detaches gateway log listeners cleanly
  await assert.rejects(bot.login('   '), { code: 'TOKEN_MISSING' });
  for (const name of ALL_GATEWAY_LOG_EVENTS) {
    const expectedCount = name === Events.ShardReady ? 1 : 0;
    assert.equal(client.listenerCount(name), expectedCount, `after TOKEN_MISSING: ${name}`);
  }

  // 2. Failed client.login() captures events, drains onLog, and removes 100% of bot gateway log listeners
  const failedLogin = bot.login('bad-token');
  await flush();
  assert.equal(drainCompleted, false);
  drainGate.resolve();
  await assert.rejects(failedLogin, /invalid token/);
  assert.equal(drainCompleted, true);
  assert.deepEqual(logged, ['sdk.debug', 'gateway.shard_disconnect', 'sdk.warn']);

  assert.deepEqual(client.listeners(Events.ShardReady), [userShardReady]);
  for (const name of ALL_GATEWAY_LOG_EVENTS) {
    if (name === Events.ShardReady) continue;
    assert.equal(client.listenerCount(name), 0, `after failed login: ${name}`);
  }

  // Emissions while logged out after failure are not captured by detached bot listeners
  client.emit(Events.Resumed);
  await flush();
  assert.equal(logged.length, 3);

  // 3. Subsequent login() retry re-attaches without duplicating listeners, and destroy() cleans up again
  logged.length = 0;
  await bot.login('valid-token');
  assert.equal(client.listenerCount(Events.ShardReady), 2);
  for (const name of ALL_GATEWAY_LOG_EVENTS) {
    if (name === Events.ShardReady) continue;
    assert.equal(client.listenerCount(name), 1, `during active login: ${name}`);
  }
  await flush();
  assert.deepEqual(logged, ['sdk.debug', 'gateway.shard_ready', 'gateway.ready']);

  await bot.destroy();
  assert.deepEqual(client.listeners(Events.ShardReady), [userShardReady]);
  for (const name of ALL_GATEWAY_LOG_EVENTS) {
    if (name === Events.ShardReady) continue;
    assert.equal(client.listenerCount(name), 0, `after final destroy: ${name}`);
  }

  // 4. Mid-login destroy() removes listeners immediately and keeps 0 listeners after late login rejection
  const midClient = new Client();
  const loginHold = deferred();
  const midLogged: string[] = [];
  Reflect.set(midClient, 'login', async () => {
    await loginHold.promise;
    return midClient;
  });
  Reflect.set(midClient, 'destroy', async () => {
    midClient.emit(Events.ShardDisconnect, 0, 1000);
  });

  const midBot = new Yuzuha({
    client: midClient,
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    gatewayLogs: { debug: true },
    onLog: record => { midLogged.push(record.event); },
  });

  const pendingLogin = midBot.login('offline-token');
  const expectedRejection = assert.rejects(pendingLogin, /encerrado durante o login/);
  await midBot.destroy();
  for (const name of ALL_GATEWAY_LOG_EVENTS) {
    assert.equal(midClient.listenerCount(name), 0, `immediately after mid-login destroy: ${name}`);
  }

  loginHold.resolve();
  await expectedRejection;
  assert.deepEqual(midLogged, ['gateway.shard_disconnect', 'gateway.shard_disconnect']);
  for (const name of ALL_GATEWAY_LOG_EVENTS) {
    assert.equal(midClient.listenerCount(name), 0, `after late login cleanup: ${name}`);
  }
});
