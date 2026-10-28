import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { CommandContext, MemoryStore } from '../src/index.js';
import { Runtime, defaultLimits, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function harness(t: TestContext) {
  let elapsed = 0, wall = 1_000;
  t.mock.method(performance, 'now', () => elapsed);
  t.mock.method(Date, 'now', () => wall);
  const transport = new MockTransport();
  const ctx = new CommandContext({ command: { name: 'deadline' }, message: mockMessage(''),
    store: new MemoryStore(), transport, cooldown: () => 0 });
  const runtime = registerBuiltins(new Runtime({ ...defaultLimits, timeoutMs: 10 }));
  return { runtime, transport, advance(time: number, wallTime = 1_000 + time) { elapsed = time; wall = wallTime; },
    run: (source: string) => runtime.execute(runtime.compile(source), ctx) };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test('wall-clock rollback cannot extend the cooperative deadline or hide it in $try', async t => {
  const f = harness(t);
  f.runtime.register({ name: 'rollback', minArgs: 0, maxArgs: 0, category: 'test', description: '', usage: '$rollback',
    execute() { f.advance(11, 100); return ''; } });
  await assert.rejects(f.run('$try[$rollback;$reply[fallback]]$reply[late]'), { code: 'EXECUTION_LIMIT' });
  assert.equal(f.transport.messages.length, 0);
});

test('wall-clock forward jumps do not exhaust an unspent cooperative deadline', async t => {
  const f = harness(t);
  f.runtime.register({ name: 'clockForward', minArgs: 0, maxArgs: 0, category: 'test', description: '', usage: '$clockForward',
    execute() { f.advance(1, 1_000_000); return ''; } });
  assert.equal(await f.run('$clockForward$reply[ok]'), '');
  assert.equal(f.transport.messages[0]?.payload.content, 'ok');
});

test('external waits exclude elapsed time even when the wall clock moves backwards', async t => {
  const f = harness(t);
  f.runtime.register({ name: 'external', minArgs: 0, maxArgs: 0, category: 'test', description: '', usage: '$external',
    async execute(c) {
      const gate = deferred(), waiting = c.wait(gate.promise);
      f.advance(100, 100); gate.resolve(); await waiting;
      f.advance(109, 109); return 'ok';
    } });
  assert.equal(await f.run('$external'), 'ok');
});

test('overlapping waits exclude their shared interval only once', async t => {
  const f = harness(t);
  f.runtime.register({ name: 'overlap', minArgs: 0, maxArgs: 0, category: 'test', description: '', usage: '$overlap',
    async execute(c) {
      const first = deferred(), second = deferred();
      const waitingFirst = c.wait(first.promise), waitingSecond = c.wait(second.promise);
      f.advance(20); first.resolve(); await waitingFirst;
      f.advance(40); second.resolve(); await waitingSecond;
      f.advance(51); return '';
    } });
  await assert.rejects(f.run('$try[$overlap;$reply[fallback]]'), { code: 'EXECUTION_LIMIT' });
  assert.equal(f.transport.messages.length, 0);
});

test('nested and rejected waits cannot grant duplicate execution time', async t => {
  const f = harness(t);
  f.runtime.register({ name: 'nested', minArgs: 0, maxArgs: 0, category: 'test', description: '', usage: '$nested',
    async execute(c) {
      let reject!: (error: Error) => void;
      const operation = new Promise<void>((_resolve, fail) => { reject = fail; });
      const waiting = c.wait(c.wait(operation));
      f.advance(20); reject(new Error('offline'));
      await assert.rejects(waiting, /offline/);
      f.advance(31); return '';
    } });
  await assert.rejects(f.run('$try[$nested;$reply[fallback]]'), { code: 'EXECUTION_LIMIT' });
  assert.equal(f.transport.messages.length, 0);
});

test('an unfinished external wait does not exempt script callbacks from deadline checks', async t => {
  const f = harness(t);
  f.runtime.register({ name: 'callback', minArgs: 1, maxArgs: 1, category: 'test', description: '', usage: '$callback[code]',
    async execute(c) {
      const gate = deferred(), waiting = c.wait(gate.promise);
      f.advance(100);
      try { return await c.fresh(0); }
      finally { gate.resolve(); await waiting; }
    } });
  await assert.rejects(f.run('$try[$callback[$reply[late]];$reply[fallback]]'), { code: 'EXECUTION_LIMIT' });
  assert.equal(f.transport.messages.length, 0);
});
