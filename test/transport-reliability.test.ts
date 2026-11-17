import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@fluxerjs/core';
import { FluxerTransport, Yuzuha, YuzuhaError } from '../src/index.js';
import type { LogRecord, TransportRetryPolicy } from '../src/index.js';
import { isTransientError, isUndeliveredSend, resolvePolicy, withRetry } from '../src/services/retry.js';
import { GuardError } from '../src/shared/errors.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
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
  assert.equal(id, '1');
  assert.equal(pending.length, 1);
  assert.equal(pending[0]![1], 5_000);
  pending[0]![0]();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(deleted, 1);
  assert.throws(() => ctx.send('x', undefined, { ttlMs: 500 }), (e: unknown) => e instanceof GuardError);
});

test('withRetry aplica backoff exponencial e limita atraso por maxDelayMs', async () => {
  const backoffEvents: { attempt: number; delayMs: number }[] = [];
  let calls = 0;
  await assert.rejects(withRetry(() => {
    calls++;
    return Promise.reject(transient('ECONNRESET'));
  }, {
    retry: { requests: 3, delayMs: 2, backoff: 2, maxDelayMs: 100 },
    onRetry: (attempt, _error, delayMs) => { backoffEvents.push({ attempt, delayMs }); },
  }), /net fail/);
  assert.equal(calls, 4);
  assert.deepEqual(backoffEvents, [
    { attempt: 1, delayMs: 2 },
    { attempt: 2, delayMs: 4 },
    { attempt: 3, delayMs: 8 },
  ]);

  const clampedEvents: { attempt: number; delayMs: number }[] = [];
  let clampedCalls = 0;
  const result = await withRetry(() => {
    clampedCalls++;
    return clampedCalls <= 4 ? Promise.reject(transient('ETIMEDOUT')) : Promise.resolve('ok');
  }, {
    retry: { requests: 4, delayMs: 2, backoff: 3, maxDelayMs: 5 },
    onRetry: (attempt, _error, delayMs) => { clampedEvents.push({ attempt, delayMs }); },
  });
  assert.equal(result, 'ok');
  assert.deepEqual(clampedEvents, [
    { attempt: 1, delayMs: 2 },
    { attempt: 2, delayMs: 5 },
    { attempt: 3, delayMs: 5 },
    { attempt: 4, delayMs: 5 },
  ]);
});

test('withRetry aplica jitter determinístico respeitando teto e rejeitando fonte inválida', async () => {
  for (const [rand, expected] of [[0, 5], [0.5, 10], [1, 12]] as const) {
    const seen: number[] = [];
    let calls = 0;
    const result = await withRetry(() => {
      calls++;
      return calls === 1 ? Promise.reject(transient('ECONNRESET')) : Promise.resolve('ok');
    }, {
      retry: { requests: 1, delayMs: 10, jitter: 0.5, maxDelayMs: 12, random: () => rand },
      onRetry: (_attempt, _error, delayMs) => { seen.push(delayMs); },
    });
    assert.equal(result, 'ok');
    assert.deepEqual(seen, [expected]);
  }

  let rngCalled = false;
  await assert.rejects(withRetry(() => Promise.reject(apiError()), {
    retry: { requests: 1, delayMs: 10, jitter: 0.5, random: () => { rngCalled = true; return 0.5; } },
  }), /api/);
  assert.equal(rngCalled, false);

  for (const badRandom of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
    await assert.rejects(withRetry(() => Promise.reject(transient('ECONNRESET')), {
      retry: { requests: 1, delayMs: 10, jitter: 0.5, random: () => badRandom },
    }), error => error instanceof YuzuhaError && error.code === 'RETRY_OPTIONS');
  }
});

test('retryOn customizado sobrescreve predicado padrão e recebe attempt 1-based', async () => {
  const seenAttempts: number[] = [];
  let calls = 0;
  const rateLimited = () => Object.assign(new Error('rate limited'), { status: 429 });
  await assert.rejects(withRetry(() => {
    calls++;
    return Promise.reject(rateLimited());
  }, {
    retry: {
      requests: 3,
      delayMs: 1,
      retryOn: (error, attempt) => {
        seenAttempts.push(attempt);
        return (error as { status?: number }).status === 429 && attempt < 3;
      },
    },
  }), /rate limited/);
  assert.equal(calls, 3);
  assert.deepEqual(seenAttempts, [1, 2, 3]);

  const client = new Client();
  let sendCalls = 0;
  Reflect.set(client.channels, 'send', async () => {
    sendCalls++;
    if (sendCalls === 1) throw transient('ECONNRESET');
    return { id: '900' };
  });
  const defaultTransport = new FluxerTransport(client, { retry: { requests: 1, delayMs: 1 } });
  await assert.rejects(defaultTransport.send('200', { content: 'oi' }), /net fail/);
  assert.equal(sendCalls, 1);

  sendCalls = 0;
  const customTransport = new FluxerTransport(client, {
    retry: { requests: 1, delayMs: 1, retryOn: error => isTransientError(error) },
  });
  assert.equal(await customTransport.send('200', { content: 'oi' }), '900');
  assert.equal(sendCalls, 2);
  await client.destroy();
});

test('resolvePolicy e Yuzuha validam opções de retry com RETRY_OPTIONS e expõem defaults', async () => {
  assert.equal(resolvePolicy(false), false);
  assert.deepEqual(resolvePolicy(undefined), {
    requests: 1,
    delayMs: 750,
    backoff: 2,
    maxDelayMs: 30_000,
    jitter: 0,
  });

  let zeroCalls = 0;
  await assert.rejects(withRetry(() => {
    zeroCalls++;
    return Promise.reject(transient('ECONNRESET'));
  }, { retry: { requests: 0, delayMs: 10 } }), /net fail/);
  assert.equal(zeroCalls, 1);

  const invalidPolicies: unknown[] = [
    null,
    [],
    'invalid',
    new Date(),
    { requests: -1 },
    { requests: 1.5 },
    { requests: Number.NaN },
    { requests: Number.POSITIVE_INFINITY },
    { delayMs: 0 },
    { delayMs: -1 },
    { delayMs: Number.NaN },
    { delayMs: Number.POSITIVE_INFINITY },
    { maxDelayMs: 0 },
    { maxDelayMs: -10 },
    { maxDelayMs: Number.NaN },
    { maxDelayMs: Number.POSITIVE_INFINITY },
    { backoff: 0.9 },
    { backoff: 0 },
    { backoff: -1 },
    { backoff: Number.NaN },
    { backoff: Number.POSITIVE_INFINITY },
    { jitter: -0.1 },
    { jitter: 1.1 },
    { jitter: Number.NaN },
    { jitter: Number.POSITIVE_INFINITY },
    { retryOn: 'not-a-fn' },
    { random: 123 },
  ];

  for (const invalid of invalidPolicies) {
    assert.throws(
      () => resolvePolicy(invalid as TransportRetryPolicy),
      error => error instanceof YuzuhaError && error.code === 'RETRY_OPTIONS',
    );
    assert.throws(
      () => new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false, retry: invalid as TransportRetryPolicy }),
      error => error instanceof YuzuhaError && error.code === 'RETRY_OPTIONS',
    );
  }
});

test('Yuzuha emite delayMs e attempt no log transport.retry durante retries reais do adaptador', async t => {
  const client = new Client();
  let patches = 0;
  Reflect.set(client.rest, 'patch', async () => {
    patches++;
    if (patches <= 2) throw transient('ECONNRESET');
    return { id: '500', content: 'ok' };
  });

  const logs: LogRecord[] = [];
  const bot = new Yuzuha({
    client,
    store: new MemoryStore(),
    scheduler: false,
    retry: { requests: 2, delayMs: 2, backoff: 3 },
    onLog: record => { logs.push(record); },
  });
  t.after(() => bot.destroy());

  await bot.transport.edit('200', '500', { content: 'ok' });
  assert.equal(patches, 3);

  const retryLogs = logs.filter((row): row is Extract<LogRecord, { attempt?: number }> => row.event === 'transport.retry');
  assert.equal(retryLogs.length, 2);
  assert.deepEqual(
    retryLogs.map(row => ({ attempt: row.attempt, delayMs: row.delayMs })),
    [{ attempt: 1, delayMs: 2 }, { attempt: 2, delayMs: 6 }],
  );
});
