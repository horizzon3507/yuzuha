import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConfigError,
  GuardError,
  MemoryRateLimiter,
  MemoryStore,
  Yuzuha,
  defineCommand,
  isYuzuhaError,
} from '../src/index.js';
import type { RateLimiter } from '../src/index.js';
import { functions } from '../src/functions.js';
import { MockTransport, TestClock, mockMessage } from '../src/testing.js';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function createSharedAsyncLimiter(now: () => number, dedupeWindowMs = 60_000) {
  const cooldowns = new Map<string, number>();
  const seen = new Map<string, number>();
  const calls: { op: 'cooldown' | 'duplicate' | 'close'; key: string }[] = [];
  let closed = false;

  const limiter: RateLimiter = {
    async cooldown(key: string, durationMs: number): Promise<number> {
      calls.push({ op: 'cooldown', key });
      await Promise.resolve();
      const time = now();
      const remaining = (cooldowns.get(key) ?? 0) - time;
      if (remaining > 0) return remaining;
      cooldowns.set(key, time + durationMs);
      return 0;
    },
    async duplicate(channelID: string, messageID: string): Promise<boolean> {
      const key = `${channelID}:${messageID}`;
      calls.push({ op: 'duplicate', key });
      await Promise.resolve();
      const time = now();
      const until = seen.get(key);
      if (until !== undefined && until > time) return true;
      seen.set(key, time + dedupeWindowMs);
      return false;
    },
    async close(): Promise<void> {
      calls.push({ op: 'close', key: '' });
      closed = true;
    },
  };

  return { limiter, calls, isClosed: () => closed };
}

test('MemoryRateLimiter implements RateLimiter and clears state on close()', async () => {
  const clock = new TestClock(1_000);
  const limiter: RateLimiter = new MemoryRateLimiter({ now: clock.now, dedupeWindowMs: 5_000 });

  assert.equal(limiter.cooldown('k1', 2_000), 0);
  assert.equal(limiter.cooldown('k1', 2_000), 2_000);
  assert.equal(limiter.duplicate('ch', 'm1'), false);
  assert.equal(limiter.duplicate('ch', 'm1'), true);

  await limiter.close?.();

  assert.equal(limiter.cooldown('k1', 2_000), 0);
  assert.equal(limiter.duplicate('ch', 'm1'), false);
});

test('Yuzuha validates options.rateLimiter with ConfigError RATE_LIMIT_OPTIONS', async () => {
  for (const invalid of [
    null,
    [],
    'bad',
    123,
    true,
    {},
    { cooldown() { return 0; } },
    { duplicate() { return false; } },
    { cooldown: 'not-fn', duplicate() { return false; } },
    { cooldown() { return 0; }, duplicate: 'not-fn' },
    { cooldown() { return 0; }, duplicate() { return false; }, close: 'not-fn' },
    { cooldown() { return 0; }, duplicate() { return false; }, close: null },
  ]) {
    assert.throws(
      () => new Yuzuha({
        transport: new MockTransport(),
        store: new MemoryStore(),
        scheduler: false,
        rateLimiter: invalid as never,
      }),
      error => error instanceof ConfigError && isYuzuhaError(error, 'RATE_LIMIT_OPTIONS'),
    );
  }

  class ClassLimiter implements RateLimiter {
    cooldown(): number { return 0; }
    duplicate(): boolean { return false; }
    async close(): Promise<void> {}
  }
  const bot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    rateLimiter: new ClassLimiter(),
  });
  await bot.destroy();
});

test('sync custom RateLimiter keeps synchronous ctx.cooldown throw, hooks, $cooldown and dedupe', async () => {
  const clock = new TestClock(10_000);
  const memory = new MemoryRateLimiter({ now: clock.now });
  const cooldownHooks: { remainingMs: number; command: string; error: GuardError }[] = [];
  let unknownCalls = 0;

  const syncLimiter: RateLimiter = {
    cooldown: (key, durationMs) => memory.cooldown(key, durationMs),
    duplicate: (channelID, messageID) => memory.duplicate(channelID, messageID),
  };

  const transport = new MockTransport();
  const bot = new Yuzuha({
    prefix: '!',
    transport,
    store: new MemoryStore(),
    scheduler: false,
    engine: functions(),
    rateLimiter: syncLimiter,
    hooks: {
      onCooldown(remainingMs, ctx, error) {
        cooldownHooks.push({ remainingMs, command: ctx.command.name, error });
        return `sync-hook:${ctx.command.name}:${remainingMs}`;
      },
      onUnknownCommand() {
        unknownCalls++;
        return 'unknown';
      },
    },
  });

  let syncThrowObserved = false;
  bot.command(defineCommand({
    name: 'decl',
    cooldown: '5s',
    async run(ctx) { await ctx.reply('decl-ok'); },
  }));
  bot.command(defineCommand({
    name: 'imp',
    async run(ctx) {
      // No await: synchronous RateLimiter must throw synchronously.
      const result = ctx.cooldown('4s', 'Espere {remaining}.');
      assert.equal(result, undefined);
      await ctx.reply('imp-ok');
    },
  }));
  bot.command(defineCommand({
    name: 'sync-direct',
    run(ctx) {
      try {
        ctx.cooldown('3s');
      } catch (error) {
        syncThrowObserved = error instanceof GuardError && error.reason === 'COOLDOWN';
        throw error;
      }
    },
  }));
  bot.command({
    name: 'scriptcd',
    code: '$cooldown[6s;Script {remaining}]$reply[script-ok]',
  });

  try {
    // Message dedupe on command and unknown command.
    const msg1 = mockMessage('!decl', { id: 'm-1' });
    assert.equal(await bot.handle(msg1), 'success');
    assert.equal(await bot.handle(msg1), 'ignored');
    assert.equal(transport.messages.at(-1)?.payload.content, 'decl-ok');

    const unk = mockMessage('!missing', { id: 'm-unk' });
    assert.equal(await bot.handle(unk), 'ignored');
    assert.equal(await bot.handle(unk), 'ignored');
    assert.equal(unknownCalls, 1);

    // Declarative cooldown + onCooldown hook.
    clock.advance(1_500);
    assert.equal(await bot.handle(mockMessage('!decl', { id: 'm-2' })), 'guarded');
    assert.equal(cooldownHooks.at(-1)?.remainingMs, 3_500);
    assert.equal(cooldownHooks.at(-1)?.error.reason, 'COOLDOWN');
    assert.equal(transport.messages.at(-1)?.payload.content, 'sync-hook:decl:3500');

    // Imperative sync ctx.cooldown without await.
    assert.equal(await bot.handle(mockMessage('!imp', { id: 'm-3' })), 'success');
    clock.advance(1_000);
    assert.equal(await bot.handle(mockMessage('!imp', { id: 'm-4' })), 'guarded');
    assert.equal(transport.messages.at(-1)?.payload.content, 'sync-hook:imp:3000');

    // Synchronous throw check inside non-async command run.
    assert.equal(await bot.handle(mockMessage('!sync-direct', { id: 'm-5' })), 'success');
    assert.equal(await bot.handle(mockMessage('!sync-direct', { id: 'm-6' })), 'guarded');
    assert.equal(syncThrowObserved, true);

    // Function mode $cooldown.
    assert.equal(await bot.handle(mockMessage('!scriptcd', { id: 'm-7' })), 'success');
    clock.advance(2_000);
    assert.equal(await bot.handle(mockMessage('!scriptcd', { id: 'm-8' })), 'guarded');
    assert.equal(transport.messages.at(-1)?.payload.content, 'sync-hook:scriptcd:4000');
  } finally {
    await bot.destroy();
  }
});

test('async RateLimiter supports dedupe, declarative/imperative/$cooldown, hooks, and multi-instance sharing', async () => {
  const clock = new TestClock(50_000);
  const { limiter } = createSharedAsyncLimiter(clock.now);
  const cooldownHooks: { bot: string; remainingMs: number; command: string }[] = [];
  const transportA = new MockTransport();
  const transportB = new MockTransport();

  const createBot = (label: string, transport: MockTransport) => {
    const bot = new Yuzuha({
      prefix: '!',
      transport,
      store: new MemoryStore(),
      scheduler: false,
      engine: functions(),
      rateLimiter: limiter,
      hooks: {
        onCooldown(remainingMs, ctx) {
          cooldownHooks.push({ bot: label, remainingMs, command: ctx.command.name });
          return `${label}:cd:${remainingMs}`;
        },
      },
    });
    bot.command(defineCommand({
      name: 'group',
      cooldown: '10s',
      subcommands: [
        defineCommand({
          name: 'ping',
          cooldown: '4s',
          async run(ctx) { await ctx.reply(`${label}:pong`); },
        }),
      ],
    }));
    bot.command(defineCommand({
      name: 'imp',
      async run(ctx) {
        const maybePromise = ctx.cooldown('5s', 'Espere {remaining}');
        assert.ok(maybePromise instanceof Promise);
        await maybePromise;
        await ctx.reply(`${label}:imp`);
      },
    }));
    bot.command({
      name: 'script',
      code: '$cooldown[6s;Espere {remaining}]$reply[script-ok]',
    });
    return bot;
  };

  const botA = createBot('A', transportA);
  const botB = createBot('B', transportB);

  try {
    // 1. Cross-instance message deduplication.
    const sharedMsg = mockMessage('!group ping', { id: 'shared-msg-1' });
    assert.equal(await botA.handle(sharedMsg), 'success');
    assert.equal(transportA.messages.at(-1)?.payload.content, 'A:pong');
    assert.equal(await botB.handle(sharedMsg), 'ignored');
    assert.equal(transportB.messages.length, 0);

    // 2. Cross-instance declarative cooldown (including parent lineage).
    clock.advance(1_500);
    assert.equal(await botB.handle(mockMessage('!group ping', { id: 'shared-msg-2' })), 'guarded');
    assert.equal(cooldownHooks.at(-1)?.bot, 'B');
    assert.equal(cooldownHooks.at(-1)?.remainingMs, 8_500);
    assert.equal(transportB.messages.at(-1)?.payload.content, 'B:cd:8500');

    // 3. Cross-instance imperative await ctx.cooldown(...) + hook.
    assert.equal(await botA.handle(mockMessage('!imp', { id: 'imp-1' })), 'success');
    clock.advance(2_000);
    assert.equal(await botB.handle(mockMessage('!imp', { id: 'imp-2' })), 'guarded');
    assert.equal(cooldownHooks.at(-1)?.remainingMs, 3_000);
    assert.equal(transportB.messages.at(-1)?.payload.content, 'B:cd:3000');

    // 4. Function mode $cooldown with async limiter.
    assert.equal(await botA.handle(mockMessage('!script', { id: 'scr-1' })), 'success');
    assert.equal(transportA.messages.at(-1)?.payload.content, 'script-ok');
    clock.advance(1_000);
    assert.equal(await botB.handle(mockMessage('!script', { id: 'scr-2' })), 'guarded');
    assert.equal(cooldownHooks.at(-1)?.remainingMs, 5_000);
    assert.equal(transportB.messages.at(-1)?.payload.content, 'B:cd:5000');
  } finally {
    await botA.destroy();
    await botB.destroy();
  }
});

test('async duplicate() awaits before dispatch across static, cached-dynamic prefix, unknown hooks, and destroy()', async () => {
  const dedupeGate = deferred<boolean>();
  let duplicateCalls = 0;
  let ran = 0;
  let unknownCalls = 0;
  let prefixCalls = 0;

  const slowLimiter: RateLimiter = {
    cooldown: () => 0,
    duplicate: () => {
      duplicateCalls++;
      return dedupeGate.promise;
    },
  };

  // Static prefix: pending duplicate() does not prematurely return 'ignored', and destroy() drains it.
  const transport = new MockTransport();
  const bot = new Yuzuha({
    prefix: '!',
    transport,
    store: new MemoryStore(),
    scheduler: false,
    rateLimiter: slowLimiter,
    hooks: {
      onUnknownCommand() {
        unknownCalls++;
        return 'unknown';
      },
    },
  });
  bot.command({ name: 'ping', run() { ran++; } });

  const inFlight = bot.handle(mockMessage('!ping', { id: 'slow-1' }));
  assert.equal(duplicateCalls, 1);

  let settled = false;
  void inFlight.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);

  // Start destroy while duplicate() is still awaiting.
  let destroyed = false;
  const closing = bot.destroy().then(() => { destroyed = true; });
  await Promise.resolve();
  assert.equal(destroyed, false);

  // Once duplicate() resolves false after destroy began, dispatch aborts cleanly as 'ignored'.
  dedupeGate.resolve(false);
  assert.equal(await inFlight, 'ignored');
  await closing;
  assert.equal(destroyed, true);
  assert.equal(ran, 0);
  assert.equal(unknownCalls, 0);

  // Dynamic prefix with prefixCache warm hit + async duplicate() + onUnknownCommand.
  let nextDuplicate = false;
  const dynamicTransport = new MockTransport();
  const dynamicBot = new Yuzuha({
    prefix: async () => {
      prefixCalls++;
      return '!';
    },
    prefixCache: { ttlMs: 60_000 },
    transport: dynamicTransport,
    store: new MemoryStore(),
    scheduler: false,
    rateLimiter: {
      cooldown: () => 0,
      duplicate: async () => {
        await Promise.resolve();
        return nextDuplicate;
      },
    },
    hooks: {
      onUnknownCommand() {
        unknownCalls++;
        return 'unknown-ok';
      },
    },
  });
  dynamicBot.command({ name: 'ping', async run(ctx) { ran++; await ctx.reply('pong'); } });

  try {
    // First message warms prefixCache and awaits async duplicate (false).
    assert.equal(await dynamicBot.handle(mockMessage('!ping', { id: 'dyn-1' })), 'success');
    assert.equal(prefixCalls, 1);
    assert.equal(ran, 1);

    // Warm prefixCache hit still awaits async duplicate (false) for command and unknown hook.
    assert.equal(await dynamicBot.handle(mockMessage('!absent', { id: 'dyn-2' })), 'ignored');
    assert.equal(prefixCalls, 1);
    assert.equal(unknownCalls, 1);
    assert.equal(dynamicTransport.messages.at(-1)?.payload.content, 'unknown-ok');

    // Duplicate=true suppresses both command and unknown hook.
    nextDuplicate = true;
    assert.equal(await dynamicBot.handle(mockMessage('!ping', { id: 'dyn-3' })), 'ignored');
    assert.equal(await dynamicBot.handle(mockMessage('!absent', { id: 'dyn-4' })), 'ignored');
    assert.equal(ran, 1);
    assert.equal(unknownCalls, 1);
  } finally {
    await dynamicBot.destroy();
  }
});

test('async duplicate() rejection propagates from handle() and caller owns injected rateLimiter close()', async () => {
  const clock = new TestClock(0);
  const { limiter, isClosed } = createSharedAsyncLimiter(clock.now);

  const bot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    rateLimiter: limiter,
  });
  await bot.destroy();
  assert.equal(isClosed(), false);
  await limiter.close?.();
  assert.equal(isClosed(), true);

  const failing = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    rateLimiter: {
      cooldown: async () => 0,
      duplicate: async () => { throw new Error('redis down'); },
    },
  });
  failing.command({ name: 'ping', run() {} });
  try {
    await assert.rejects(failing.handle(mockMessage('!ping', { id: 'fail-1' })), /redis down/);
  } finally {
    await failing.destroy();
  }
});
