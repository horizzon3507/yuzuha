import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, Events } from '@fluxerjs/core';
import { MemoryStore, Yuzuha } from '../src/index.js';
import { MockTransport } from '../src/testing.js';
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('gateway errors reach hooks without user listeners and SDK paired events report once', async () => {
  const errors: unknown[] = [], logs: string[] = [];
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(),
    onError: error => { errors.push(error); }, onLog: record => { logs.push(record.event); } });
  const error = new Error('socket hang up');
  assert.doesNotThrow(() => bot.client.emit(Events.Error, error));
  await tick();
  assert.deepEqual(errors, [error]);
  bot.client.emit(Events.ShardError, 3, error); bot.client.emit(Events.Error, error);
  await tick();
  assert.deepEqual(errors, [error, error]); assert.deepEqual(logs, ['error', 'error']);
  await bot.destroy();
});

test('injected listeners survive cleanup and gateway errors during teardown are drained', async () => {
  const client = new Client(), userErrors: Error[] = [], userShards: number[] = [], errors: unknown[] = [];
  const userError = (error: Error) => { userErrors.push(error); };
  const userShard = (id: number) => { userShards.push(id); };
  client.on(Events.Error, userError); client.on(Events.ShardError, userShard);
  let release!: () => void, reported = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const bot = new Yuzuha({ client, transport: new MockTransport(), store: new MemoryStore(),
    onError: async error => { errors.push(error); await gate; reported = true; } });
  const error = new Error('disconnect');
  Reflect.set(client, 'destroy', async () => {
    client.emit(Events.ShardError, 2, error); client.emit(Events.Error, error);
  });
  const closing = bot.destroy(); await tick(); assert.equal(reported, false);
  release(); await closing; assert.equal(reported, true); assert.deepEqual(errors, [error]);
  assert.deepEqual(userErrors, [error]); assert.deepEqual(userShards, [2]);
  assert.deepEqual(client.listeners(Events.Error), [userError]);
  assert.deepEqual(client.listeners(Events.ShardError), [userShard]);
});

test('native error handlers coexist with defaults and error hooks can request shutdown', async () => {
  const errors: unknown[] = [], native: Error[] = [];
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(),
    onError: async error => { errors.push(error); await bot.destroy(); } });
  bot.on(Events.Error, error => { native.push(error); });
  const error = new Error('gateway reset'); bot.client.emit(Events.Error, error);
  await tick(); await bot.destroy();
  assert.deepEqual(errors, [error]); assert.deepEqual(native, [error]);
  assert.equal(bot.client.listenerCount(Events.Error), 0); assert.equal(bot.client.listenerCount(Events.ShardError), 0);
});

test('default reporting includes original gateway error', async t => {
  const output: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { output.push(args); });
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore() });
  const error = new Error('socket timed out'); bot.client.emit(Events.ShardError, 0, error);
  await bot.destroy(); assert.equal(output.length, 1); assert.equal(output[0]?.[1], error);
});

test('failed login keeps gateway protection for retry and rejecting hooks are contained', async t => {
  const output: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { output.push(args); });
  const client = new Client();
  const bot = new Yuzuha({ client, transport: new MockTransport(), store: new MemoryStore(),
    onError: async () => { throw new Error('hook failed'); } });
  let attempts = 0;
  Reflect.set(client, 'login', async () => {
    client.emit(Events.Error, new Error('gateway failed'));
    if (++attempts === 1) throw new Error('login failed');
    return client;
  });
  await assert.rejects(bot.login('offline-token'), /login failed/);
  await bot.login('offline-token');
  await bot.destroy();
  assert.deepEqual(output.map(args => args[0]), ['[yuzuha] ERROR_HANDLER_FAILED', '[yuzuha] ERROR_HANDLER_FAILED']);
  assert.equal(client.listenerCount(Events.Error), 0);
});

test('late login cleanup reports errors after shutdown has already removed listeners', async () => {
  const errors: unknown[] = [];
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(),
    onError: error => { errors.push(error); } });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  Reflect.set(bot.client, 'login', async () => { await gate; return bot.client; });
  const error = new Error('late disconnect');
  Reflect.set(bot.client, 'destroy', async () => { bot.client.emit(Events.Error, error); });
  const login = bot.login('offline-token');
  const rejection = assert.rejects(login, /encerrado durante o login/);
  await bot.destroy();
  assert.equal(bot.client.listenerCount(Events.Error), 0);
  release(); await rejection;
  assert.deepEqual(errors, [error, error]);
  assert.equal(bot.client.listenerCount(Events.Error), 0);
});
