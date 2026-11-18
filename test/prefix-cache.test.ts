import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { MemoryStore, Yuzuha, YuzuhaError, defineCommand } from '../src/index.js';
import type { PrefixCacheOptions } from '../src/index.js';
import { ValidatedPrefixCache, validatePrefixCacheOptions } from '../src/framework/prefix-cache.js';
import { MockTransport, TestClock, mockMessage } from '../src/testing.js';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('prefixCache validates options eagerly with PREFIX_CACHE_OPTIONS', () => {
  for (const invalid of [
    null,
    true,
    [],
    'bad',
    new Date(),
    {},
    { ttlMs: 0 },
    { ttlMs: -5 },
    { ttlMs: 1.5 },
    { ttlMs: Number.NaN },
    { ttlMs: 3_600_001 },
    { ttlMs: 1_000, max: 0 },
    { ttlMs: 1_000, max: -1 },
    { ttlMs: 1_000, max: 2.5 },
    { ttlMs: 1_000, max: Number.NaN },
    { ttlMs: 1_000, max: 100_001 },
  ]) {
    assert.throws(
      () => validatePrefixCacheOptions(invalid as never),
      (error: unknown) => error instanceof YuzuhaError && error.code === 'PREFIX_CACHE_OPTIONS',
    );
    assert.throws(
      () => new Yuzuha({ prefixCache: invalid as never, store: new MemoryStore(), transport: new MockTransport(), scheduler: false }),
      (error: unknown) => error instanceof YuzuhaError && error.code === 'PREFIX_CACHE_OPTIONS',
    );
  }

  assert.equal(validatePrefixCacheOptions(undefined), undefined);
  assert.equal(validatePrefixCacheOptions(false), undefined);
  assert.deepEqual(validatePrefixCacheOptions({ ttlMs: 1 }), { ttlMs: 1, max: 5_000 });
  const maxBounds: PrefixCacheOptions = { ttlMs: 3_600_000, max: 100_000 };
  assert.deepEqual(validatePrefixCacheOptions(maxBounds), { ttlMs: 3_600_000, max: 100_000 });
});

test('ValidatedPrefixCache freezes sorted arrays, detects in-place mutations and evicts LRU at 256', () => {
  const cache = new ValidatedPrefixCache();
  const sorted = cache.resolve(['!', '!!']);
  assert.deepEqual(sorted, ['!!', '!']);
  assert.equal(Object.isFrozen(sorted), true);

  // String vs array keys stay distinct, and identical array contents reuse the frozen snapshot.
  const fromString = cache.resolve('!');
  const fromArray = cache.resolve(['!']);
  assert.notEqual(fromString, fromArray);
  assert.equal(cache.resolve(['!', '!!']), sorted);

  // In-place array mutation is observed on every lookup.
  const mutable = ['a', 'aa'];
  const firstMutable = cache.resolve(mutable);
  assert.deepEqual(firstMutable, ['aa', 'a']);
  mutable[0] = 'bbb';
  const updatedMutable = cache.resolve(mutable);
  assert.deepEqual(updatedMutable, ['bbb', 'aa']);
  assert.notEqual(updatedMutable, firstMutable);

  // Invalid inputs reject with PREFIX without polluting cache.
  for (const bad of ['', '! ', [], [123], [undefined]]) {
    assert.throws(
      () => cache.resolve(bad as never),
      (error: unknown) => error instanceof YuzuhaError && error.code === 'PREFIX',
    );
  }

  // Fill to 256 entries, touch entry 0, then add entry 256 -> entry 1 is evicted while entry 0 stays cached.
  const lruCache = new ValidatedPrefixCache();
  const entries = Array.from({ length: 256 }, (_, index) => lruCache.resolve([`p${index}`]));
  assert.equal(lruCache.size, 256);
  assert.equal(lruCache.resolve(['p0']), entries[0]);
  lruCache.resolve(['p256']);
  assert.equal(lruCache.size, 256);
  assert.equal(lruCache.resolve(['p0']), entries[0]);
  assert.notEqual(lruCache.resolve(['p1']), entries[1]);
});

test('Yuzuha prefixCache caches per-guild and DM prefixes by TTL via now and defaults to off', async () => {
  let defaultCalls = 0;
  const uncachedBot = new Yuzuha({
    prefix: () => { defaultCalls++; return '!'; },
    store: new MemoryStore(),
    transport: new MockTransport(),
    scheduler: false,
  });
  uncachedBot.command(defineCommand({ name: 'ping', run() {} }));
  await uncachedBot.handle(mockMessage('!ping', { id: 'u1' }));
  await uncachedBot.handle(mockMessage('!ping', { id: 'u2' }));
  assert.equal(defaultCalls, 2);
  await uncachedBot.destroy();

  const clock = new TestClock(10_000);
  let calls = 0;
  const byScope = new Map<string, string>([
    ['g:100', '!'],
    ['g:200', '?'],
    ['dm:300', '$'],
  ]);
  const bot = new Yuzuha({
    now: clock.now,
    prefixCache: { ttlMs: 1_000 },
    prefix: message => {
      calls++;
      return byScope.get(message.guildID ? `g:${message.guildID}` : `dm:${message.channelID}`) ?? '!';
    },
    store: new MemoryStore(),
    transport: new MockTransport(),
    scheduler: false,
  });
  const ran: string[] = [];
  bot.command(defineCommand({ name: 'ping', run(ctx) { ran.push(ctx.message.content); } }));

  assert.equal(await bot.handle(mockMessage('!ping', { id: '1', guildID: '100', channelID: '200' })), 'success');
  assert.equal(await bot.handle(mockMessage('?ping', { id: '2', guildID: '200', channelID: '201' })), 'success');
  assert.equal(await bot.handle(mockMessage('$ping', { id: '3', guildID: undefined, channelID: '300' })), 'success');
  assert.equal(calls, 3);

  clock.advance(999);
  assert.equal(await bot.handle(mockMessage('!ping', { id: '4', guildID: '100', channelID: '200' })), 'success');
  assert.equal(await bot.handle(mockMessage('?ping', { id: '5', guildID: '200', channelID: '201' })), 'success');
  assert.equal(await bot.handle(mockMessage('$ping', { id: '6', guildID: undefined, channelID: '300' })), 'success');
  assert.equal(calls, 3);

  // At exact TTL boundary (1000ms), entries expire and re-fetch on next message.
  clock.advance(1);
  byScope.set('g:100', '>>');
  assert.equal(await bot.handle(mockMessage('>>ping', { id: '7', guildID: '100', channelID: '200' })), 'success');
  assert.equal(calls, 4);
  assert.deepEqual(ran, ['!ping', '?ping', '$ping', '!ping', '?ping', '$ping', '>>ping']);
  await bot.destroy();
});

test('Yuzuha prefixCache evicts least-recently-used entries when max capacity is reached', async () => {
  const clock = new TestClock(1_000);
  const fetched: string[] = [];
  const bot = new Yuzuha({
    now: clock.now,
    prefixCache: { ttlMs: 60_000, max: 2 },
    prefix: message => {
      fetched.push(message.guildID ?? message.channelID);
      return '!';
    },
    store: new MemoryStore(),
    transport: new MockTransport(),
    scheduler: false,
  });
  bot.command(defineCommand({ name: 'ping', run() {} }));

  await bot.handle(mockMessage('!ping', { id: '1', guildID: '100' }));
  await bot.handle(mockMessage('!ping', { id: '2', guildID: '200' }));
  assert.deepEqual(fetched, ['100', '200']);

  // Touch guild 100 so guild 200 becomes least recently used.
  await bot.handle(mockMessage('!ping', { id: '3', guildID: '100' }));
  assert.deepEqual(fetched, ['100', '200']);

  // Adding guild 300 evicts guild 200 while keeping guild 100.
  await bot.handle(mockMessage('!ping', { id: '4', guildID: '300' }));
  assert.deepEqual(fetched, ['100', '200', '300']);

  await bot.handle(mockMessage('!ping', { id: '5', guildID: '100' }));
  await bot.handle(mockMessage('!ping', { id: '6', guildID: '300' }));
  assert.deepEqual(fetched, ['100', '200', '300']);

  await bot.handle(mockMessage('!ping', { id: '7', guildID: '200' }));
  assert.deepEqual(fetched, ['100', '200', '300', '200']);
  await bot.destroy();
});

test('invalidatePrefix(guildID) and invalidatePrefix() clear targeted/all entries and block stale in-flight writes', async () => {
  let prefixValue = '!';
  let calls = 0;
  const bot = new Yuzuha({
    prefixCache: { ttlMs: 60_000 },
    prefix: () => {
      calls++;
      return prefixValue;
    },
    store: new MemoryStore(),
    transport: new MockTransport(),
    scheduler: false,
  });
  bot.command(defineCommand({ name: 'ping', run() {} }));

  await bot.handle(mockMessage('!ping', { id: '1', guildID: '100' }));
  await bot.handle(mockMessage('!ping', { id: '2', guildID: '200' }));
  await bot.handle(mockMessage('!ping', { id: '3', guildID: undefined, channelID: 'dm-1' }));
  assert.equal(calls, 3);

  prefixValue = '?';
  bot.invalidatePrefix('100');

  // Guild 200 and DM remain cached at '!', while guild 100 re-fetches '?'.
  assert.equal(await bot.handle(mockMessage('!ping', { id: '4', guildID: '200' })), 'success');
  assert.equal(await bot.handle(mockMessage('!ping', { id: '5', guildID: undefined, channelID: 'dm-1' })), 'success');
  assert.equal(calls, 3);
  assert.equal(await bot.handle(mockMessage('?ping', { id: '6', guildID: '100' })), 'success');
  assert.equal(calls, 4);

  // Global invalidation clears all guilds and DMs.
  prefixValue = '$';
  bot.invalidatePrefix();
  assert.equal(await bot.handle(mockMessage('$ping', { id: '7', guildID: '200' })), 'success');
  assert.equal(await bot.handle(mockMessage('$ping', { id: '8', guildID: undefined, channelID: 'dm-1' })), 'success');
  assert.equal(calls, 6);
  await bot.destroy();

  // Stale in-flight prefix resolution must not populate cache after invalidatePrefix or destroy.
  const gate100 = deferred<string>();
  const gate200 = deferred<string>();
  let calls100 = 0;
  let calls200 = 0;
  const raceBot = new Yuzuha({
    prefixCache: { ttlMs: 60_000 },
    prefix: message => {
      if (message.guildID === '100') {
        calls100++;
        return calls100 === 1 ? gate100.promise : '?';
      }
      calls200++;
      return gate200.promise;
    },
    store: new MemoryStore(),
    transport: new MockTransport(),
    scheduler: false,
  });
  raceBot.command(defineCommand({ name: 'ping', run() {} }));

  const inflight100 = raceBot.handle(mockMessage('!ping', { id: 'r1', guildID: '100' }));
  const inflight200 = raceBot.handle(mockMessage('!ping', { id: 'r2', guildID: '200' }));
  await Promise.resolve();

  raceBot.invalidatePrefix('100');
  gate100.resolve('!');
  gate200.resolve('!');
  assert.deepEqual(await Promise.all([inflight100, inflight200]), ['success', 'success']);

  // Guild 200's concurrent lookup was unaffected and cached '!', while guild 100's stale '!' was discarded.
  assert.equal(await raceBot.handle(mockMessage('!ping', { id: 'r3', guildID: '200' })), 'success');
  assert.equal(calls200, 1);
  assert.equal(await raceBot.handle(mockMessage('?ping', { id: 'r4', guildID: '100' })), 'success');
  assert.equal(calls100, 2);

  // Global invalidatePrefix() also discards an in-flight lookup.
  const gateGlobal = deferred<string>();
  let globalCalls = 0;
  const globalRaceBot = new Yuzuha({
    prefixCache: { ttlMs: 60_000 },
    prefix: () => (++globalCalls === 1 ? gateGlobal.promise : '?'),
    store: new MemoryStore(),
    transport: new MockTransport(),
    scheduler: false,
  });
  globalRaceBot.command(defineCommand({ name: 'ping', run() {} }));
  const pendingGlobal = globalRaceBot.handle(mockMessage('!ping', { id: 'g1', guildID: '100' }));
  await Promise.resolve();
  globalRaceBot.invalidatePrefix();
  gateGlobal.resolve('!');
  assert.equal(await pendingGlobal, 'success');
  assert.equal(await globalRaceBot.handle(mockMessage('?ping', { id: 'g2', guildID: '100' })), 'success');
  assert.equal(globalCalls, 2);

  // destroy() during in-flight lookup resolves ignored and does not cache.
  const destroyGate = deferred<string>();
  const closingBot = new Yuzuha({
    prefixCache: { ttlMs: 60_000 },
    prefix: () => destroyGate.promise,
    store: new MemoryStore(),
    transport: new MockTransport(),
    scheduler: false,
  });
  closingBot.command(defineCommand({ name: 'ping', run() {} }));
  const active = closingBot.handle(mockMessage('!ping', { id: 'd1' }));
  const closing = closingBot.destroy();
  destroyGate.resolve('!');
  assert.equal(await active, 'ignored');
  await closing;
  await raceBot.destroy();
  await globalRaceBot.destroy();

  // invalidatePrefix is a safe no-op when prefixCache is disabled.
  const staticBot = new Yuzuha({ store: new MemoryStore(), transport: new MockTransport(), scheduler: false });
  staticBot.invalidatePrefix('100');
  staticBot.invalidatePrefix();
  await staticBot.destroy();
});

test('warm prefixCache exits non-command messages synchronously without calling async prefix resolver', async () => {
  let resolverCalls = 0;
  let blockResolver = false;
  const bot = new Yuzuha({
    prefixCache: { ttlMs: 60_000 },
    prefix: async () => {
      if (blockResolver) throw new Error('resolver should not be called on warm cache');
      resolverCalls++;
      return ['!', '!!'];
    },
    store: new MemoryStore(),
    transport: new MockTransport(),
    scheduler: false,
  });
  bot.command(defineCommand({ name: 'ping', run() {} }));

  // Cold non-command warms cache, and subsequent non-commands exit synchronously with 0 calls.
  assert.equal(await bot.handle(mockMessage('cold chat', { id: '0', guildID: '200' })), 'ignored');
  assert.equal(resolverCalls, 1);

  assert.equal(await bot.handle(mockMessage('!ping', { id: '1', guildID: '100' })), 'success');
  assert.equal(resolverCalls, 2);

  blockResolver = true;
  const nonCommand = bot.handle(mockMessage('ordinary chat message', { id: '2', guildID: '100' }));
  const warmGuild200 = bot.handle(mockMessage('warm chat message', { id: '2b', guildID: '200' }));
  const unknownCommand = bot.handle(mockMessage('!unknown', { id: '3', guildID: '100' }));
  assert.match(inspect(nonCommand), /Promise \{ 'ignored' \}/);
  assert.match(inspect(warmGuild200), /Promise \{ 'ignored' \}/);
  assert.match(inspect(unknownCommand), /Promise \{ 'ignored' \}/);
  assert.equal(await nonCommand, 'ignored');
  assert.equal(await warmGuild200, 'ignored');
  assert.equal(await unknownCommand, 'ignored');
  assert.equal(resolverCalls, 2);
  await bot.destroy();
});
