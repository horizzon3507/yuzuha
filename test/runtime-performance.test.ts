import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandContext, MemoryStore } from '../src/index.js';
import { Runtime, defaultLimits, registerBuiltins } from '../src/functions.js';
import type { FunctionCall } from '../src/functions/runtime/types.js';
import { canvasExecution } from '../src/functions/runtime/canvas-execution.js';
import { LoopControl } from '../src/functions/runtime/control-flow.js';
import { GuardError, PartialModerationError, ScriptError, StopExecution, YuzuhaError } from '../src/errors.js';
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

test('sync scalar results retain their type and execute only once', async () => {
  const f = harness();
  for (const value of [undefined, null, '', 'value', true, false, 0, 42, NaN, Infinity, 1n, Symbol('value')]) {
    let calls = 0;
    const name = `scalar${f.runtime.functions().length}`;
    f.register(name, () => { calls++; return value; });
    assert.equal(await f.run(`$${name}`), value);
    assert.equal(calls, 1);
  }
});

test('sync throws and async rejections use the same ScriptError mapping', async () => {
  const f = harness();
  for (const error of [new Error('private'), 'private', new YuzuhaError('USER_ERROR', 'explicit'), new YuzuhaError('CANVAS_INPUT', 'invalid')]) {
    for (const asynchronous of [false, true]) {
      const name = `failure${f.runtime.functions().length}`;
      f.register(name, () => { if (asynchronous) return Promise.reject(error); throw error; });
      const source = `prefix$${name}`;
      await assert.rejects(f.run(source), (actual: unknown) => {
        assert.ok(actual instanceof ScriptError);
        assert.equal(actual.code, error instanceof YuzuhaError && error.code === 'CANVAS_INPUT' ? 'CANVAS_INPUT' : 'FUNCTION_ERROR');
        assert.equal(actual.message, error instanceof YuzuhaError && error.code === 'CANVAS_INPUT' ? 'invalid'
          : `Falha em $${name}: ${error instanceof YuzuhaError ? error.message : 'a operação não pôde ser concluída'}.`);
        assert.equal(actual.cause, error);
        assert.equal(actual.source, source); assert.equal(actual.offset, 6); assert.equal(actual.file, 'perf.yz');
        return true;
      });
    }
  }
});

test('sync control flow and limit errors cannot be swallowed by $try', async () => {
  const f = harness();
  for (const error of [new GuardError('denied'), new LoopControl({}, 'break'), new ScriptError('OUTPUT_LIMIT', 'output', '', 0),
    new PartialModerationError('ban', '2', new Error('offline'))]) {
    const name = `control${f.runtime.functions().length}`;
    f.register(name, () => { throw error; });
    await assert.rejects(f.run(`$try[$${name};fallback]`), actual => actual === error);
  }
  for (const code of ['EXECUTION_LIMIT', 'OUTPUT_LIMIT', 'EXECUTION_ABORTED']) {
    const name = `limit${f.runtime.functions().length}`;
    f.register(name, () => { throw new YuzuhaError(code, 'limit'); });
    await assert.rejects(f.run(`$try[$${name};fallback]`), (error: unknown) => {
      assert.ok(error instanceof ScriptError);
      assert.equal(error.code, code); assert.equal(error.message, 'limit'); assert.equal(error.offset, 5);
      return true;
    });
  }
  f.register('syncStop', () => { throw new StopExecution(); });
  assert.equal(await f.run('$try[$syncStop;fallback]unreachable'), '');
  assert.equal(await f.run('$repeat[3;x$try[$break;fallback]unreachable]'), '');
});

test('sync scalar output limits release the call and lazy branches remain untouched', async () => {
  const f = harness({ output: 16 }), calls: FunctionCall[] = [];
  f.register('tooLarge', c => { calls.push(c); return 'x'.repeat(17); });
  await assert.rejects(f.run('$try[$tooLarge;fallback]'), { code: 'OUTPUT_LIMIT', message: 'Saída excede o limite.' });
  assert.throws(() => canvasExecution(calls[0]!), canvasError);
  assert.equal(await f.run('$if[true;ok;$tooLarge]'), 'ok');
  assert.equal(await f.run('$if[false;$tooLarge;ok]'), 'ok');
  assert.equal(calls.length, 1);
});

test('objects, promises, thenables and functions take the async result path without duplicate execution', async () => {
  const f = harness();
  const callable = Object.assign(() => '', { then: (resolve: (value: string) => void) => resolve('callable') });
  for (const value of [{ value: 1 }, Promise.resolve('promise'), { then: (resolve: (value: string) => void) => resolve('thenable') }, callable, () => 'function']) {
    let calls = 0;
    const name = `result${f.runtime.functions().length}`;
    f.register(name, () => { calls++; return value; });
    assert.equal(await f.run(`$${name}`), await value);
    assert.equal(calls, 1);
  }
});

test('interpolated objects reuse the checked serialization once per function result', async () => {
  const f = harness();
  let serializations = 0;
  const value = { toJSON: () => ({ value: ++serializations }) };
  f.register('serialized', () => value);
  assert.equal(await f.run('before$serialized after$serialized'), 'before{"value":1} after{"value":2}');
  assert.equal(serializations, 2);
  assert.equal(await f.run('$serialized'), value);
  assert.equal(serializations, 3);
  const ordinary = { value: 'original', nested: [1, true, null] };
  f.register('ordinary', () => ordinary);
  assert.equal(await f.run('before$ordinary after'), `before${JSON.stringify(ordinary)} after`);
});

test('interpolation output limits measure the exact serialized text emitted', async () => {
  const f = harness({ output: 16 });
  let serializations = 0;
  f.register('serialized', () => ({ toJSON: () => { serializations++; return 'x'.repeat(14); } }));
  await assert.rejects(f.run('$try[prefix$serialized;fallback]'), { code: 'OUTPUT_LIMIT', message: 'Saída excede o limite.' });
  assert.equal(serializations, 1);
  f.register('oversize', () => ({ value: 'x'.repeat(16) }));
  await assert.rejects(f.run('$try[prefix$oversize;fallback]'), { code: 'OUTPUT_LIMIT' });
});

test('empty and failed object serialization preserve output and error handling', async () => {
  const f = harness();
  let serializations = 0;
  f.register('emptyObject', () => ({ toJSON: () => { serializations++; return undefined; } }));
  assert.equal(await f.run('before$emptyObject after'), 'before after');
  assert.equal(serializations, 1);
  const failure = new Error('serialization');
  f.register('badObject', () => ({ toJSON: () => { throw failure; } }));
  await assert.rejects(f.run('prefix$badObject'), (error: unknown) => {
    assert.ok(error instanceof ScriptError);
    assert.equal(error.code, 'FUNCTION_ERROR'); assert.equal(error.cause, failure);
    return true;
  });
  assert.equal(await f.run('$try[prefix$badObject;fallback]'), 'fallback');
});

test('sole-call whitespace scanning matches trim including Unicode spaces without caching mutable ASTs', async () => {
  const f = harness(), value = { value: 1 };
  f.register('typed', () => value);
  for (const space of [' ', '\t', '\n', '\r', '\u00a0', '\ufeff', '\u2028', '\u2029', '\u2000', '\u3000']) {
    assert.equal(space.trim(), '');
    assert.equal(await f.run(`${space}$typed${space}`), value);
  }
  for (const space of ['\u0085', '\u200b']) {
    assert.notEqual(space.trim(), '');
    assert.equal(await f.run(`${space}$typed${space}`), `${space}${JSON.stringify(value)}${space}`);
  }
  const program = f.runtime.compile('\u00a0$typed\ufeff\u2028');
  assert.equal(await f.runtime.execute(program, f.ctx), value);
  const first = program.nodes[0]!;
  assert.equal(first.kind, 'text');
  if (first.kind === 'text') first.value = 'prefix';
  assert.equal(await f.runtime.execute(program, f.ctx), `prefix${JSON.stringify(value)}\ufeff\u2028`);
});
