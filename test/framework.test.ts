import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore, Yuzuha } from '../src/index.js';
import { MockTransport, mockMessage } from '../src/testing.js';
import { RateLimits } from '../src/framework/rate-limits.js';

test('reload preserves manual commands and other command directories, including deleted files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yuzuha-reload-sources-'));
  const first = join(root, 'first'), second = join(root, 'second');
  await mkdir(first); await mkdir(second);
  const path = join(first, 'ping.mjs');
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore() });
  try {
    bot.command({ name: 'manual', code: 'preserved' });
    await writeFile(path, 'export default { name: "ping", code: "first" };');
    await writeFile(join(second, 'other.mjs'), 'export default { name: "other", code: "other" };');
    await bot.load(first, false); await bot.load(second, false);
    await writeFile(path, 'export default { name: "pong", code: "second" };');
    await bot.reload(first);
    assert.deepEqual(bot.listCommands().map(c => c.name).sort(), ['manual', 'other', 'pong']);
    await unlink(path); await bot.reload(first);
    assert.deepEqual(bot.listCommands().map(c => c.name).sort(), ['manual', 'other']);
  } finally { await bot.destroy(); await rm(root, { recursive: true }); }
});

test('command definitions and command listings cannot mutate registered metadata', async () => {
  const transport = new MockTransport();
  const bot = new Yuzuha({ transport, store: new MemoryStore() });
  const command = { name: 'original', aliases: ['alias'], code: 'first' };
  bot.command(command);
  command.code = 'changed'; command.aliases.push('new');
  bot.listCommands()[0]!.name = 'changed';
  assert.equal(await bot.handle(mockMessage('!alias')), 'success');
  assert.equal(transport.messages.at(-1)?.payload.content, 'first');
  assert.equal(await bot.handle(mockMessage('!new')), 'ignored');
  assert.equal(bot.listCommands()[0]!.name, 'original');
  await bot.destroy();
});

test('destroy drains active commands, ignores new messages and is idempotent', async () => {
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore() });
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { started = resolve; });
  let destroyed = 0;
  Reflect.set(bot.client, 'destroy', async () => { destroyed++; });
  bot.command({ name: 'slow', run: async ctx => { started(); await gate; await ctx.reply('done'); } });
  const running = bot.handle(mockMessage('!slow')); await ready;
  const closing = bot.destroy();
  assert.equal(bot.destroy(), closing);
  assert.equal(await bot.handle(mockMessage('!slow')), 'ignored');
  assert.equal(destroyed, 0);
  release();
  assert.equal(await running, 'success'); await closing;
  assert.equal(destroyed, 1);
});

test('destroy leaves caller-owned stores open', async () => {
  let closed = false;
  class OwnedStore extends MemoryStore { async close() { closed = true; } }
  const store = new OwnedStore();
  const bot = new Yuzuha({ transport: new MockTransport(), store });
  await bot.destroy();
  assert.equal(closed, false);
  await store.close(); assert.equal(closed, true);
});

test('rate limits expire using current time after delayed dispatch', () => {
  let now = 0;
  const limits = new RateLimits(() => now);
  assert.equal(limits.cooldown('command', 1000), 0);
  now = 500; assert.equal(limits.cooldown('command', 1000), 500);
  now = 1000; assert.equal(limits.cooldown('command', 1000), 0);
  assert.equal(limits.duplicate('200', 'message'), false);
  now += 100; assert.equal(limits.duplicate('200', 'message'), true);
  now += 60_000; assert.equal(limits.duplicate('200', 'message'), false);
});

test('a native shutdown command requests draining without waiting on itself', { timeout: 2000 }, async () => {
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore() });
  let destroyed = 0;
  Reflect.set(bot.client, 'destroy', async () => { destroyed++; });
  bot.command({ name: 'shutdown', run: async () => { await bot.destroy(); } });
  assert.equal(await bot.handle(mockMessage('!shutdown')), 'success');
  await bot.destroy();
  assert.equal(destroyed, 1);
});

test('shutdown aborts login and cleans up a client that finishes connecting late', async () => {
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore() });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let connected = false, signal: AbortSignal | undefined;
  Reflect.set(bot.client, 'login', async (_token: string, options: { signal: AbortSignal }) => {
    signal = options.signal; await gate; connected = true; return bot.client;
  });
  Reflect.set(bot.client, 'destroy', async () => { connected = false; });
  const login = bot.login('test-token');
  const rejection = assert.rejects(login, /encerrado durante o login/);
  await bot.destroy();
  assert.equal(signal?.aborted, true);
  release(); await rejection;
  assert.equal(connected, false);
});

test('loaded TypeScript commands preserve public GuardError and partial moderation identity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-error-identity-'));
  const transport = new MockTransport();
  const errors: unknown[] = [];
  const bot = new Yuzuha({ transport, store: new MemoryStore(), onError: e => { errors.push(e); } });
  try {
    const module = new URL('../src/index.ts', import.meta.url).href;
    await writeFile(join(directory, 'guard.mts'), `import { GuardError, PartialModerationError } from ${JSON.stringify(module)};
      export default [
        { name: 'guard', run() { throw new GuardError('specific guard message'); } },
        { name: 'partial', run() { throw new PartialModerationError('ban', '2', new Error('disk')); } }
      ];`);
    await bot.load(directory);
    assert.equal(await bot.handle(mockMessage('!guard')), 'guarded');
    assert.equal(transport.messages.at(-1)?.payload.content, 'specific guard message');
    assert.equal(errors.length, 0);
    assert.equal(await bot.handle(mockMessage('!partial')), 'error');
    assert.match(transport.messages.at(-1)!.payload.content!, /foi realizada.*não foi salvo/);
  } finally { await bot.destroy(); await rm(directory, { recursive: true }); }
});

test('invalid JavaScript command bodies are rejected before registration', () => {
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore() });
  const invalid = JSON.parse('{"name":"invalid","code":42}') as { name: string; code: string };
  assert.throws(() => bot.command({ ...invalid, run() {} }), /code deve ser texto/);
  assert.equal(bot.listCommands().length, 0);
});
