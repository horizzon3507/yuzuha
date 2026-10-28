import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimits } from '../src/framework/rate-limits.js';
import { YuzuhaError } from '../src/shared/errors.js';

const capacity = 100_000;
const atCapacity = (now: () => number): RateLimits => {
  const limits = new RateLimits(now);
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
  const limits = new RateLimits(() => now);
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
