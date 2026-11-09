import test from 'node:test';
import assert from 'node:assert/strict';
import { isTransientError, isUndeliveredSend, withRetry } from '../src/services/retry.js';
import { GuardError } from '../src/shared/errors.js';
import { MockTransport, mockMessage, mockResources, createTestBot } from '../src/testing.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import { CommandContext } from '../src/commands/context.js';

const transient = (code: string) => Object.assign(new Error('net fail'), { code });
const apiError = () => Object.assign(new Error('api'), { code: 10008, status: 404 });

test('isTransientError aceita só falhas de rede', () => {
  assert.equal(isTransientError(transient('ECONNRESET')), true);
  assert.equal(isTransientError({ code: 'UND_ERR_SOCKET' }), true);
  assert.equal(isTransientError(apiError()), false);
  assert.equal(isTransientError(new Error('fetch failed')), false);
  assert.equal(isUndeliveredSend(transient('ECONNREFUSED')), true);
  assert.equal(isUndeliveredSend(transient('ECONNRESET')), false);
});

test('withRetry tenta uma vez e relança o erro original', async () => {
  let calls = 0;
  const result = await withRetry(() => { calls++; return calls === 1 ? Promise.reject(transient('ECONNRESET')) : Promise.resolve('ok'); });
  assert.equal(result, 'ok');
  assert.equal(calls, 2);
  let attempts = 0;
  await assert.rejects(withRetry(() => { attempts++; return Promise.reject(transient('ETIMEDOUT')); }, { retry: { requests: 2, delayMs: 1 } }),
    (e: unknown) => (e as Error).message === 'net fail');
  assert.equal(attempts, 3);
  calls = 0;
  await assert.rejects(withRetry(() => { calls++; return Promise.reject(apiError()); }), /api/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(withRetry(() => { calls++; return Promise.reject(transient('ECONNRESET')); }, { retry: false }), /net fail/);
  assert.equal(calls, 1);
});

test('withRetry honra abort entre tentativas', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(withRetry(() => { calls++; controller.abort(); return Promise.reject(transient('ECONNRESET')); },
    { signal: controller.signal }));
  assert.equal(calls, 1);
});

test('ctx.reply degrada para send após deleteCommandMessage', async () => {
  const transport = new MockTransport();
  const ctx = new CommandContext({ message: mockMessage('!x'), command: { name: 'x' }, store: new MemoryStore(),
    transport, cooldown: () => 0, resources: mockResources() });
  await ctx.deleteCommandMessage();
  await ctx.reply('oi');
  assert.equal(transport.messages.length, 1);
  assert.equal(transport.messages[0]!.replyTo, undefined);
});

test('ctx.send com ttlMs agenda exclusão via timers', async () => {
  let deleted = 0;
  const pending: [() => void, number][] = [];
  const transport = new MockTransport();
  transport.delete = async () => { deleted++; };
  const ctx = new CommandContext({ message: mockMessage('!x'), command: { name: 'x' }, store: new MemoryStore(),
    transport, cooldown: () => 0, resources: mockResources(),
    deleteLater: (_c, _m, ms) => { pending.push([() => { void transport.delete(_c, _m); }, ms]); } });
  const id = await ctx.send('efêmera', undefined, { ttlMs: 5_000 });
  assert.equal(pending.length, 1);
  assert.equal(pending[0]![1], 5_000);
  pending[0]![0]();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(deleted, 1);
  await assert.rejects(ctx.send('x', undefined, { ttlMs: 500 }), (e: unknown) => e instanceof GuardError);
});
