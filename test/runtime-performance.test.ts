import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandContext, MemoryStore } from '../src/index.js';
import { Runtime, defaultLimits, registerBuiltins } from '../src/functions.js';
import type { FunctionCall } from '../src/functions/runtime/types.js';
import { canvasExecution } from '../src/functions/runtime/canvas-execution.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function harness(limits = {}) {
  const ctx = new CommandContext({ message: mockMessage('!test'), command: { name: 'test' },
    transport: new MockTransport(), store: new MemoryStore(), cooldown: () => 0 });
  const runtime = registerBuiltins(new Runtime({ ...defaultLimits, ...limits }));
  const register = (name: string, execute: (call: FunctionCall) => unknown, count = 0) => runtime.register({
    name, execute, minArgs: count, maxArgs: count, usage: `$${name}`, category: 'test', description: '',
  });
  return { ctx, runtime, register, run: (source: string) => runtime.execute(runtime.compile(source, 'perf.yz'), ctx) };
}

const canvasError = { code: 'CANVAS_STATE', message: 'Estado de Canvas fora da execução de um Evaluator.' };

test('ScriptCall owns destructurable members and releases canvas state after sync and async calls', async () => {
  const f = harness(), calls: FunctionCall[] = [];
  const states: unknown[] = [];
  f.register('syncState', c => {
    calls.push(c); states.push(canvasExecution(c));
    assert.deepEqual(Object.keys(c).sort(), ['ctx', 'count', 'arg', 'fresh', 'checkOutput', 'text', 'all', 'wait'].sort());
    assert.throws(() => canvasExecution({ ...c }), canvasError);
    return '';
  });
  f.register('asyncState', async c => {
    assert.throws(() => canvasExecution(calls[0]!), canvasError);
    calls.push(c); states.push(canvasExecution(c));
    const { arg, fresh, text, all, checkOutput, wait } = c;
    await Promise.resolve();
    assert.equal(canvasExecution(c), states[0]);
    assert.equal(await arg(0), 'value');
    assert.equal(await fresh(0), 'value');
    assert.equal(await text(0), 'value');
    assert.deepEqual(await all(), ['value']);
    checkOutput('value');
    return wait(Promise.resolve(''));
  }, 1);
  assert.equal(await f.run('$syncState$asyncState[value]'), '');
  assert.equal(states[0], states[1]);
  for (const c of calls) assert.throws(() => canvasExecution(c), canvasError);
});

test('canvas state is released when functions throw or reject', async () => {
  const f = harness(), calls: FunctionCall[] = [];
  f.register('syncFailure', c => { calls.push(c); throw new Error('sync'); });
  f.register('asyncFailure', async c => { calls.push(c); await Promise.resolve(); throw new Error('async'); });
  assert.equal(await f.run('$try[$syncFailure;ok]$try[$asyncFailure;ok]'), 'okok');
  for (const c of calls) assert.throws(() => canvasExecution(c), canvasError);
});
