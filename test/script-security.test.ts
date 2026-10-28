import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandContext, GuardError, MemoryStore, PartialModerationError, ScriptError, YuzuhaError } from '../src/index.js';
import { Runtime, defaultLimits, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function harness(limits = {}) {
  const transport = new MockTransport();
  const ctx = new CommandContext({ message: mockMessage('!security'), command: { name: 'security', code: '' },
    transport, store: new MemoryStore(), cooldown: () => 0, now: () => 100 });
  const runtime = registerBuiltins(new Runtime({ ...defaultLimits, ...limits }));
  return { ctx, transport, runtime, run: (source: string) => runtime.execute(runtime.compile(source, 'security.yz'), ctx) };
}

test('jsonEncode preserves guards, stop and partial moderation errors through try', async () => {
  const { run, runtime, transport } = harness();
  await assert.rejects(run('$try[$jsonEncode[$onlyIf[false;negado]];$reply[fallback]]'), GuardError);
  assert.equal(transport.messages.length, 0);
  assert.equal(await run('$try[$jsonEncode[$stop];$reply[fallback]]$reply[after]'), '');
  assert.equal(transport.messages.length, 0);
  const partial = new PartialModerationError('ban', '2', new Error('store failure'));
  runtime.register({ name: 'partial', category: 'test', description: '', usage: '$partial', minArgs: 0, maxArgs: 0,
    execute: () => { throw partial; } });
  await assert.rejects(run('$try[$jsonEncode[$partial];$reply[fallback]]'), error => error === partial);
  assert.equal(transport.messages.length, 0);
});

test('jsonEncode preserves execution, output and cancellation limits through try', async () => {
  for (const code of ['EXECUTION_LIMIT', 'OUTPUT_LIMIT', 'EXECUTION_ABORTED']) {
    const { run, runtime, transport } = harness();
    runtime.register({ name: 'limit', category: 'test', description: '', usage: '$limit', minArgs: 0, maxArgs: 0,
      execute: () => { throw new YuzuhaError(code, 'Limite da operação.'); } });
    await assert.rejects(run('$try[$jsonEncode[$limit];$reply[fallback]]'),
      (error: unknown) => error instanceof ScriptError && error.code === code);
    assert.equal(transport.messages.length, 0);
  }
  const { run, transport } = harness({ output: 32 });
  await assert.rejects(run('$try[$jsonEncode[$repeatText[x;33]];$reply[fallback]]'),
    (error: unknown) => error instanceof ScriptError && error.code === 'OUTPUT_LIMIT');
  assert.equal(transport.messages.length, 0);
});

test('jsonEncode preserves loop control and still allows serialization failures to be caught', async () => {
  const { run, runtime } = harness();
  assert.equal(await run('$repeat[3;$try[$jsonEncode[$if[$eq[$loopIndex;1];$break;$loopIndex]];fallback]]'), '0');
  assert.equal(await run('$repeat[3;$jsonEncode[$if[$eq[$loopIndex;1];$continue;$loopIndex]];x]'), '0x2x');
  runtime.register({ name: 'bigint', category: 'test', description: '', usage: '$bigint', minArgs: 0, maxArgs: 0,
    execute: () => 7n });
  assert.equal(await run('$try[$jsonEncode[$bigint];fallback]'), 'fallback');
  assert.equal(await run('$jsonEncode[$object[x;1]]'), '{"x":1}');
});

for (const [suffix, scope] of [['Var', 'global'], ['GuildVar', 'guild'], ['UserVar', 'user']] as const) {
  test(`increment${suffix} rejects excessive output before persisting or changing TTL`, async () => {
    const { run, ctx, transport } = harness({ output: 1 });
    await ctx.data[scope].set('n', 9, { ttlMs: 1000 });
    await assert.rejects(run(`$try[$increment${suffix}[n];$reply[f]]`),
      (error: unknown) => error instanceof ScriptError && error.code === 'OUTPUT_LIMIT');
    assert.equal(await ctx.data[scope].get('n'), 9);
    assert.equal(await ctx.data[scope].ttl('n'), 1000);
    assert.equal(await run(`$increment${suffix}[x]`), 1);
    assert.equal(await ctx.data[scope].get('x'), 1);
    assert.equal(transport.messages.length, 0);
    const missing = harness({ output: 3 });
    await assert.rejects(missing.run(`$increment${suffix}[new;1e9]`),
      (error: unknown) => error instanceof ScriptError && error.code === 'OUTPUT_LIMIT');
    assert.equal(await missing.ctx.data[scope].get('new'), null);
    assert.equal(await missing.ctx.data[scope].ttl('new'), -2);
  });

  test(`pull${suffix} rejects excessive output before persisting or changing TTL`, async () => {
    const { run, ctx, transport } = harness({ output: 1 });
    const original = [1, 2];
    await ctx.data[scope].set('n', original, { ttlMs: 1000 });
    await assert.rejects(run(`$try[$pull${suffix}[n;1];$reply[f]]`),
      (error: unknown) => error instanceof ScriptError && error.code === 'OUTPUT_LIMIT');
    assert.deepEqual(await ctx.data[scope].get('n'), original);
    assert.equal(await ctx.data[scope].ttl('n'), 1000);
    await assert.rejects(run(`$pull${suffix}[z;1]`),
      (error: unknown) => error instanceof ScriptError && error.code === 'OUTPUT_LIMIT');
    assert.equal(await ctx.data[scope].get('z'), null);
    assert.equal(await ctx.data[scope].ttl('z'), -2);
    assert.equal(transport.messages.length, 0);
    const valid = harness({ output: 2 });
    await valid.ctx.data[scope].set('ok', [1]);
    assert.deepEqual(await valid.run(`$pull${suffix}[ok;1]`), []);
    assert.deepEqual(await valid.ctx.data[scope].get('ok'), []);
  });

  test(`push${suffix} rejects excessive output before persisting or changing TTL`, async () => {
    const { run, ctx, transport } = harness({ output: 32 });
    const original = ['a'.repeat(20)];
    await ctx.data[scope].set('items', original, { ttlMs: 1000 });
    await assert.rejects(run(`$try[$push${suffix}[items;${'b'.repeat(20)}];$reply[fallback]]`),
      (error: unknown) => error instanceof ScriptError && error.code === 'OUTPUT_LIMIT');
    assert.deepEqual(await ctx.data[scope].get('items'), original);
    assert.equal(await ctx.data[scope].ttl('items'), 1000);
    await assert.rejects(run(`$push${suffix}[missing;${'b'.repeat(31)}]`),
      (error: unknown) => error instanceof ScriptError && error.code === 'OUTPUT_LIMIT');
    assert.equal(await ctx.data[scope].get('missing'), null);
    assert.equal(await ctx.data[scope].ttl('missing'), -2);
    assert.deepEqual(await run(`$push${suffix}[ok;x]`), ['x']);
    assert.deepEqual(await ctx.data[scope].get('ok'), ['x']);
    assert.equal(transport.messages.length, 0);
  });

  test(`set${suffix}Path rejects excessive output before persisting or changing TTL`, async () => {
    const { run, ctx, transport } = harness({ output: 32 });
    const original = { a: 'a'.repeat(20) };
    await ctx.data[scope].set('record', original, { ttlMs: 1000 });
    await assert.rejects(run(`$try[$set${suffix}Path[record;b;${'b'.repeat(20)}];$reply[fallback]]`),
      (error: unknown) => error instanceof ScriptError && error.code === 'OUTPUT_LIMIT');
    assert.deepEqual(await ctx.data[scope].get('record'), original);
    assert.equal(await ctx.data[scope].ttl('record'), 1000);
    await assert.rejects(run(`$set${suffix}Path[missing;a.b.c;${'b'.repeat(20)}]`),
      (error: unknown) => error instanceof ScriptError && error.code === 'OUTPUT_LIMIT');
    assert.equal(await ctx.data[scope].get('missing'), null);
    assert.equal(await ctx.data[scope].ttl('missing'), -2);
    assert.deepEqual(await run(`$set${suffix}Path[ok;a;x]`), { a: 'x' });
    assert.deepEqual(await ctx.data[scope].get('ok'), { a: 'x' });
    assert.equal(transport.messages.length, 0);
  });
}
