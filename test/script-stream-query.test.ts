import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandContext, GuardError, HttpService, MemoryStore, ScriptError } from '../src/index.js';
import { Runtime, defaultLimits, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function fixture(chunks: Uint8Array[], policy = {}) {
  let reads = 0, cancelled = false;
  const abort = new AbortController();
  const http = new HttpService({ allowPrivate: true, fetch: async () => new Response(new ReadableStream({
    pull(controller) { reads++; const chunk = chunks.shift(); if (chunk) controller.enqueue(chunk); else controller.close(); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 })) });
  const ctx = new CommandContext({ message: mockMessage('!data'), command: { name: 'data', http: policy }, signal: abort.signal,
    store: new MemoryStore(), transport: new MockTransport(), cooldown: () => 0, http });
  const runtime = registerBuiltins(new Runtime(defaultLimits));
  return { ctx, runtime, abort, reads: () => reads, cancelled: () => cancelled,
    run: (code: string) => runtime.execute(runtime.compile(code), ctx) };
}
const bytes = (text: string) => new TextEncoder().encode(text);

test('script streaming decodes split UTF-8, preserves literal data and applies backpressure', async () => {
  const encoded = bytes('á$throw[dados]');
  const f = fixture([encoded.slice(0, 1), encoded.slice(1, 3), encoded.slice(3)]);
  const observed: number[] = [];
  f.runtime.register({ name: 'observe', category: 'test', minArgs: 0, maxArgs: 0, usage: '', description: '',
    execute: () => { observed.push(f.reads()); return ''; } });
  assert.equal(await f.run('$httpStream[GET;https://stream.test;$observe$httpChunk]'), 'á$throw[dados]');
  assert.deepEqual(observed, [2, 3]);
  assert.equal(await f.run('$httpChunk$httpChunkIndex'), '');
});

test('script streaming break/continue cross try, cancel unread data and restore outer scope', async () => {
  const f = fixture([bytes('a'), bytes('b'), bytes('c')]);
  assert.equal(await f.run('$httpStream[GET;https://stream.test;$try[$if[$eq[$httpChunkIndex;1];$break];errado]$httpChunk]'), 'a');
  assert.equal(f.cancelled(), true); assert.equal(f.reads(), 2);
  const g = fixture([bytes('a'), bytes('b'), bytes('c')]);
  assert.equal(await g.run('$httpStream[GET;https://stream.test;$if[$eq[$httpChunkIndex;1];$continue]$httpChunk]'), 'ac');
  const nested = fixture([bytes('a')]);
  assert.equal(await nested.run('$repeat[1;$httpStream[GET;https://stream.test;$repeat[1;$break]$httpChunk];$loopIndex]'), 'a0');
});

test('script streaming respects command policy, guard propagation, cancellation and chunk budget', async () => {
  const forbidden = fixture([bytes('data')], { allowedHosts: ['allowed.test'] });
  await assert.rejects(forbidden.run('$httpStream[GET;https://other.test;$httpChunk]'));
  assert.equal(forbidden.reads(), 0);
  const guarded = fixture([bytes('a'), bytes('b')]);
  await assert.rejects(guarded.run('$try[$httpStream[GET;https://stream.test;$onlyIf[false;negado]];errado]'), GuardError);
  assert.equal(guarded.cancelled(), true);
  const aborted = fixture([bytes('a')]); aborted.abort.abort();
  await assert.rejects(aborted.run('$httpStream[GET;https://stream.test;$httpChunk]'), (e: unknown) => e instanceof ScriptError && e.code === 'EXECUTION_ABORTED');
  const many = fixture(Array.from({ length: 1001 }, () => bytes('a')));
  await assert.rejects(many.run('$try[$httpStream[GET;https://stream.test;];errado]'), (e: unknown) => e instanceof ScriptError && e.code === 'EXECUTION_LIMIT');
  assert.equal(many.ctx.vars.has('__httpChunk'), false);
});

test('queryVars exposes bounded pages in scripts and rejects invalid scopes/options', async () => {
  const f = fixture([]);
  assert.equal(await f.run('$setGuildVar[item:a;1]$setGuildVar[item:b;2]$jsonEncode[$queryVars[guild;$object[prefix;item:;limit;1]]]'),
    '{"entries":[{"name":"item:a","value":"1","ttlMs":-1}],"nextCursor":"item:a"}');
  await assert.rejects(f.run('$queryVars[bad]'), /Escopo/);
  await assert.rejects(f.run('$queryVars[guild;$object[limit;101]]'), /limit/);
  await assert.rejects(f.run('$queryVars[guild;invalid]'), /Opções/);
});


test('script streaming preserves guard errors when source cancellation never settles', async () => {
  let cancelled = false;
  const http = new HttpService({ allowPrivate: true, fetch: async () => new Response(new ReadableStream({
    pull(controller) { controller.enqueue(bytes('data')); },
    cancel() { cancelled = true; return new Promise<void>(() => {}); },
  }, { highWaterMark: 0 })) });
  const ctx = new CommandContext({ message: mockMessage('!data'), command: { name: 'data' },
    store: new MemoryStore(), transport: new MockTransport(), cooldown: () => 0, http });
  const runtime = registerBuiltins(new Runtime(defaultLimits));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await assert.rejects(Promise.race([
      runtime.execute(runtime.compile('$httpStream[GET;https://stream.test;$onlyIf[false;negado]]'), ctx),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('stream cleanup hung')), 1000); }),
    ]), GuardError);
    assert.equal(cancelled, true);
    assert.equal(ctx.vars.has('__httpChunk'), false);
    assert.equal(ctx.vars.has('__httpChunkIndex'), false);
  } finally { clearTimeout(timer); }
});
