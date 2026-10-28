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
