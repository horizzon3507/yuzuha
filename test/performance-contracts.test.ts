import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandContext, MemoryStore, Yuzuha } from '../src/index.js';
import { Runtime, registerBuiltins, parse } from '../src/functions.js';
import { MockTransport, mockMessage } from '../src/testing.js';
import { RateLimits } from '../src/framework/rate-limits.js';
import { tokenize } from '../src/commands/arguments.js';

test('dedup FIFO stays bounded, isolates arbitrary channel IDs and preserves refreshed entries', () => {
  let now = 0; const limits = new RateLimits(() => now);
  assert.equal(limits.duplicate('ab', 'c'), false); assert.equal(limits.duplicate('a', 'bc'), false);
  assert.equal(limits.duplicate('ab', 'c'), true);
  const other = new RateLimits(() => now);
  assert.equal(other.duplicate('channel', 'a'), false); now = 60_000;
  assert.equal(other.duplicate('channel', 'a'), false);
  for (let i = 0; i < 9999; i++) assert.equal(other.duplicate('channel', String(i)), false);
  assert.equal(other.duplicate('channel', 'a'), true);
  other.duplicate('channel', 'evict'); assert.equal(other.duplicate('channel', 'a'), false);
  now += 60_000; assert.equal(other.duplicate('channel', 'a'), false);
});

test('static prefix snapshots detect in-place edits and dynamic prefix shutdown stays tracked', async () => {
  const prefixes = ['!', '!!'], bot = new Yuzuha({ prefix: prefixes, store: new MemoryStore(), transport: new MockTransport(), scheduler: false });
  const inputs: string[] = []; bot.command({ name: 'run', run(ctx) { inputs.push(ctx.input); } });
  assert.equal(await bot.handle(mockMessage('!!run long input')), 'success');
  prefixes[0] = '?'; assert.equal(await bot.handle(mockMessage('!run')), 'ignored');
  assert.equal(await bot.handle(mockMessage('?run changed')), 'success'); assert.deepEqual(inputs, ['long input', 'changed']); await bot.destroy();
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const dynamic = new Yuzuha({ prefix: async () => { await gate; return '!'; }, store: new MemoryStore(), transport: new MockTransport(), scheduler: false });
  let runs = 0; dynamic.command({ name: 'run', run() { runs++; } });
  const active = dynamic.handle(mockMessage('!run')), closing = dynamic.destroy(); release();
  assert.equal(await active, 'ignored'); await closing; assert.equal(runs, 0);
});

test('plain token path preserves Unicode whitespace, flags, quoted empties and escapes', () => {
  assert.deepEqual(tokenize(' a\tβ\n--name=value\u2003c '), ['a', 'β', '--name=value', 'c']);
  assert.deepEqual(tokenize('"" "two words" escaped\\ space --name="two words"'), ['', 'two words', 'escaped space', '--name=two words']);
  assert.deepEqual(tokenize("don't stop"), ["don't", 'stop']);
  assert.deepEqual(tokenize('--name="""value" """" escaped\\=\'x y\''), ['--name=value', '""', 'escaped=x y']);
  assert.throws(() => tokenize('"broken'), /aspas/);
});

test('an explicitly empty flag schema still rejects flags and consumes the terminator', async () => {
  const bot = new Yuzuha({ store: new MemoryStore(), transport: new MockTransport(), scheduler: false });
  let tokens: string[] = [];
  bot.command({ name: 'run', flags: [], run(ctx) { tokens = ctx.tokens; } });
  assert.equal(await bot.handle(mockMessage('!run --bad')), 'guarded');
  assert.equal(await bot.handle(mockMessage('!run -- --literal')), 'success'); assert.deepEqual(tokens, ['--literal']);
  await bot.destroy();
});

test('point reads preserve isolation, TTL, read/write ordering and null values', async () => {
  let now = 0; const store = new MemoryStore();
  const ctx = new CommandContext({ store, now: () => now, command: { name: 'data' }, message: mockMessage(''), transport: new MockTransport(), cooldown: () => 0 });
  const writing = ctx.data.guild.set('x', { deep: [1] }, { ttlMs: 10 });
  const read = ctx.data.guild.get('x'); await writing;
  const value = await read; assert.deepEqual(value, { deep: [1] }); (value as { deep: number[] }).deep.push(2);
  assert.deepEqual(await ctx.data.guild.get('x'), { deep: [1] }); now = 10;
  assert.equal(await ctx.data.guild.get('x', 'expired'), 'expired');
  await ctx.data.guild.set('x', null); assert.equal(await ctx.data.guild.get('x', 'fallback'), null);
});

test('a point read evaluates TTL after waiting for an earlier commit', async () => {
  let now = 0, release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  class SlowStore extends MemoryStore {
    blocked = false;
    protected override async commit(): Promise<void> { if (this.blocked) { entered(); await gate; } }
  }
  const store = new SlowStore();
  const ctx = new CommandContext({ store, now: () => now, command: { name: 'data' }, message: mockMessage(''), transport: new MockTransport(), cooldown: () => 0 });
  await ctx.data.guild.set('expires', 'value', { ttlMs: 10 });
  store.blocked = true; const writing = ctx.data.guild.set('other', 1); await started;
  const reading = ctx.data.guild.get('expires', 'expired'); now = 10; release(); await writing;
  assert.equal(await reading, 'expired');
});

test('resolved function cache rechecks edited external ASTs and failed registrations are atomic', async () => {
  const runtime = registerBuiltins(new Runtime()), transport = new MockTransport();
  const ctx = new CommandContext({ command: { name: 'cache' }, message: mockMessage(''), transport, store: new MemoryStore(), cooldown: () => 0 });
  const ast = parse('$username'); assert.equal(await runtime.execute(ast, ctx), 'Hory');
  const node = ast.nodes[0]!; assert.equal(node.kind, 'call'); if (node.kind !== 'call') return;
  node.name = 'reply'; await assert.rejects(runtime.execute(ast, ctx), { code: 'ARITY' });
  node.args = [[{ kind: 'text', value: 'safe', offset: 0 }]]; await runtime.execute(ast, ctx); assert.equal(transport.messages.at(-1)?.payload.content, 'safe');
  node.name = 'missing'; await assert.rejects(runtime.execute(ast, ctx), { code: 'UNKNOWN_FUNCTION' });
});

test('argument failures remain rejected promises and call budgets cannot be swallowed', async () => {
  const runtime = registerBuiltins(new Runtime({ calls: 1, depth: 8, output: 1000, timeoutMs: 1000 }));
  const ctx = new CommandContext({ command: { name: 'promise' }, message: mockMessage(''), transport: new MockTransport(), store: new MemoryStore(), cooldown: () => 0 });
  let rejected = false;
  runtime.register({ name: 'inspect', category: 'test', description: '', usage: '$inspect[x]', minArgs: 1, maxArgs: 1,
    execute: call => call.arg(0).catch(error => { rejected = true; throw error; }) });
  await assert.rejects(runtime.execute(runtime.compile('$inspect[$username]'), ctx), { code: 'EXECUTION_LIMIT' }); assert.equal(rejected, true);
});

test('mock replies retain their own metadata across interleaved sends and message deletion', async () => {
  const transport = new MockTransport();
  await Promise.all(Array.from({ length: 20 }, (_, i) => transport.reply(mockMessage('', { id: `source-${i}` }), { content: String(i) })));
  for (let i = 0; i < 20; i++) assert.equal(transport.messages[i]?.replyTo, `source-${i}`);
  await transport.delete('200', '1'); const id = await transport.send('200', { content: 'new' });
  assert.equal(id, '21'); assert.equal(new Set(transport.messages.map(item => item.id)).size, transport.messages.length);
});
