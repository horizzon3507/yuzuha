import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, Yuzuha } from '../src/index.js';
import type { LogRecord } from '../src/index.js';
import { RateLimits } from '../src/framework/rate-limits.js';
import { YuzuhaError } from '../src/shared/errors.js';
import { MockTransport, mockMessage } from '../src/testing.js';

const capacity = 100_000;
const atCapacity = (now: () => number): RateLimits => {
  const limits = new RateLimits({ now, onCooldownCapacity: 'throw' });
  for (let index = 0; index < capacity; index++) limits.cooldown(String(index), index === 0 ? 10 : 60_000);
  return limits;
};
const capacityError = (error: unknown) => error instanceof YuzuhaError && error.code === 'COOLDOWN_CAPACITY';

test('cooldowns at capacity renew expired keys and reclaim space between scheduled sweeps', () => {
  let now = 0;
  const limits = atCapacity(() => now);
  assert.throws(() => limits.cooldown('new', 100), capacityError);
  now = 10;
  assert.equal(limits.cooldown('0', 10), 0);
  assert.equal(limits.cooldown('0', 10), 10);
  assert.throws(() => limits.cooldown('new', 100), capacityError);
  now = 20;
  assert.equal(limits.cooldown('0', 10), 0);
  assert.throws(() => limits.cooldown('new', 100), capacityError);
  now = 30;
  assert.equal(limits.cooldown('new', 100), 0);
  assert.equal(limits.cooldown('1', 100), 59_970);
  assert.throws(() => limits.cooldown('another', 100), capacityError);
  assert.equal(limits.cooldown('new', 100), 100);
  now = 60_000;
  for (let index = 0; index < capacity; index++) assert.equal(limits.cooldown(`replacement-${index}`, 100), 0);
  assert.throws(() => limits.cooldown('over-capacity', 100), capacityError);
});

test('capacity checks collect expired cooldowns even during the sweep interval', () => {
  let now = 0;
  const limits = new RateLimits({ now: () => now, onCooldownCapacity: 'throw' });
  limits.cooldown('first', 1);
  now = 1;
  for (let index = 0; index < capacity; index++) limits.cooldown(String(index), index === 0 ? 1 : 60_000);
  now = 2;
  assert.equal(limits.cooldown('new', 100), 0);
  assert.throws(() => limits.cooldown('overflow', 100), capacityError);
});

test('clock rollback does not release active cooldowns or message deduplication', () => {
  let now = 1000;
  const limits = new RateLimits(() => now);
  assert.equal(limits.cooldown('command', 100), 0);
  assert.equal(limits.duplicate('channel', 'message'), false);
  now = 950;
  assert.equal(limits.cooldown('command', 100), 150);
  assert.equal(limits.duplicate('channel', 'message'), true);
  now = 1099;
  assert.equal(limits.cooldown('command', 100), 1);
  now = 1100;
  assert.equal(limits.cooldown('command', 100), 0);
  assert.equal(limits.duplicate('channel', 'message'), true);
  now = 61_000;
  assert.equal(limits.duplicate('channel', 'message'), false);
});

test('message traffic preserves cooldown protection across many sweep intervals', () => {
  let now = 0;
  const limits = new RateLimits(() => now);
  assert.equal(limits.cooldown('long-running', 60_000), 0);
  for (now = 0; now < 60_000; now += 1000) {
    assert.equal(limits.duplicate('channel', String(now)), false);
    assert.equal(limits.duplicate('channel', String(now)), true);
  }
  now = 59_999;
  assert.equal(limits.cooldown('long-running', 60_000), 1);
  now = 60_000;
  assert.equal(limits.cooldown('long-running', 60_000), 0);
});

test('default evict mode drops the soonest-expiring cooldown without throwing and updates nextExpiration', () => {
  let now = 0;
  let evictions = 0;
  const limits = new RateLimits({ now: () => now, maxCooldowns: 3, onEvict: () => { evictions++; } });
  assert.equal(limits.cooldown('middle', 200), 0);
  assert.equal(limits.cooldown('soonest', 50), 0);
  assert.equal(limits.cooldown('latest', 500), 0);
  assert.equal(limits.cooldown('overflow', 400), 0);
  assert.equal(evictions, 1);
  // 'soonest' was evicted, while 'middle', 'latest' and 'overflow' remain active.
  assert.equal(limits.cooldown('middle', 100), 200);
  assert.equal(limits.cooldown('latest', 100), 500);
  assert.equal(limits.cooldown('overflow', 100), 400);
  assert.equal(limits.cooldown('soonest', 300), 0);
  assert.equal(evictions, 2);
  // Advancing to the recomputed nextExpiration (300) reclaims 'soonest' without further eviction.
  now = 300;
  assert.equal(limits.cooldown('after-sweep', 100), 0);
  assert.equal(evictions, 2);
  assert.equal(limits.cooldown('latest', 100), 200);
});

test('default 100k cooldown capacity evicts cleanly without throwing', () => {
  let now = 0;
  let evictions = 0;
  const limits = new RateLimits({ now: () => now, onEvict: () => { evictions++; } });
  for (let index = 0; index < capacity; index++) {
    assert.equal(limits.cooldown(String(index), index === 42 ? 10 : 60_000), 0);
  }
  assert.equal(limits.cooldown('extra', 100), 0);
  assert.equal(evictions, 1);
  assert.equal(limits.cooldown('0', 10), 60_000);
  assert.equal(limits.cooldown('42', 10), 0);
});

test('two-generation dedupe retains >10k messages within 60s and stays clock-rollback safe across buckets', () => {
  let now = 0;
  const limits = new RateLimits(() => now);
  for (let index = 0; index < 15_000; index++) {
    assert.equal(limits.duplicate('ch', `early-${index}`), false);
  }
  now = 30_000;
  for (let index = 0; index < 5_000; index++) {
    assert.equal(limits.duplicate('ch', `mid-${index}`), false);
  }
  // All 20,000 messages inside 60s are still deduplicated.
  for (let index = 0; index < 15_000; index++) {
    assert.equal(limits.duplicate('ch', `early-${index}`), true);
  }
  // Rotation at 60_000 expires early-* (inserted at 0), keeps mid-* (inserted at 30_000).
  now = 60_000;
  assert.equal(limits.duplicate('ch', 'mid-0'), true);
  assert.equal(limits.duplicate('ch', 'early-0'), false);
  // Clock rollback after rotation does not drop active previousBucket entries or trigger re-rotation.
  now = 59_500;
  assert.equal(limits.duplicate('ch', 'mid-1'), true);
  assert.equal(limits.duplicate('ch', 'early-0'), true);
  // After mid-* window passes, mid-* expires cleanly.
  now = 90_000;
  assert.equal(limits.duplicate('ch', 'mid-0'), false);
});

test('maxDedupe evicts oldest previousBucket entries before currentBucket entries', () => {
  let now = 0;
  const limits = new RateLimits({ now: () => now, maxDedupe: 3, dedupeWindowMs: 1_000 });
  assert.equal(limits.duplicate('ch', 'p1'), false);
  now = 400;
  assert.equal(limits.duplicate('ch', 'p2'), false);
  now = 500;
  assert.equal(limits.duplicate('ch', 'p3'), false);
  now = 1_000;
  // Rotates {p1, p2, p3} to previousBucket; adding c1 and c2 evicts p1 then p2 before touching c1.
  assert.equal(limits.duplicate('ch', 'c1'), false);
  assert.equal(limits.duplicate('ch', 'c2'), false);
  now = 1_100;
  assert.equal(limits.duplicate('ch', 'c1'), true);
  assert.equal(limits.duplicate('ch', 'c2'), true);
  assert.equal(limits.duplicate('ch', 'p3'), true);
  assert.equal(limits.duplicate('ch', 'p2'), false);
});

test('Yuzuha validates rateLimits options and throttles rate_limit.evicted logs', async () => {
  for (const invalid of [
    null,
    [],
    { maxCooldowns: 0 },
    { maxCooldowns: 1.5 },
    { maxCooldowns: Number.POSITIVE_INFINITY },
    { onCooldownCapacity: 'drop' },
    { maxDedupe: 0 },
    { dedupeWindowMs: -1 },
  ]) {
    assert.throws(
      () => new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false, rateLimits: invalid as never }),
      (error: unknown) => error instanceof YuzuhaError && error.code === 'RATE_LIMIT_OPTIONS',
    );
  }

  let now = 0;
  const logs: LogRecord[] = [];
  const bot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    now: () => now,
    rateLimits: { maxCooldowns: 2, onCooldownCapacity: 'evict' },
    onLog: record => { logs.push(record); },
  });
  bot.command({ name: 'cd', cooldown: 30_000, run() {} });
  try {
    assert.equal(await bot.handle(mockMessage('!cd', { id: '1', authorID: '1' })), 'success');
    assert.equal(await bot.handle(mockMessage('!cd', { id: '2', authorID: '2' })), 'success');
    assert.equal(await bot.handle(mockMessage('!cd', { id: '3', authorID: '3' })), 'success');
    assert.equal(logs.filter(item => item.event === 'rate_limit.evicted').length, 1);

    now = 4_000;
    assert.equal(await bot.handle(mockMessage('!cd', { id: '4', authorID: '4' })), 'success');
    assert.equal(logs.filter(item => item.event === 'rate_limit.evicted').length, 1);

    now = 10_000;
    assert.equal(await bot.handle(mockMessage('!cd', { id: '5', authorID: '5' })), 'success');
    assert.equal(logs.filter(item => item.event === 'rate_limit.evicted').length, 2);
  } finally {
    await bot.destroy();
  }

  const throwing = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    rateLimits: { maxCooldowns: 1, onCooldownCapacity: 'throw' },
    onError() {},
  });
  throwing.command({ name: 'cd', cooldown: 5_000, run() {} });
  try {
    assert.equal(await throwing.handle(mockMessage('!cd', { id: '1', authorID: '1' })), 'success');
    assert.equal(await throwing.handle(mockMessage('!cd', { id: '2', authorID: '2' })), 'error');
  } finally {
    await throwing.destroy();
  }
});
