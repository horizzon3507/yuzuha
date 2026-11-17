import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, Events } from '@fluxerjs/core';
import { arg, CommandContext, MemoryStore, Yuzuha } from '../src/index.js';
import { Runtime, registerBuiltins, parse } from '../src/functions.js';
import { MockTransport, mockMessage } from '../src/testing.js';
import { RateLimits } from '../src/framework/rate-limits.js';
import { compileFlagLookup, parseFlags, tokenize } from '../src/commands/arguments.js';
import { CommandRegistry } from '../src/framework/command-registry.js';
import { route } from '../src/framework/routing.js';

test('dedup FIFO stays bounded, isolates arbitrary channel IDs and preserves refreshed entries', () => {
  let now = 0; const limits = new RateLimits(() => now);
  assert.equal(limits.duplicate('ab', 'c'), false); assert.equal(limits.duplicate('a', 'bc'), false);
  assert.equal(limits.duplicate('ab', 'c'), true);
  const other = new RateLimits({ now: () => now, maxDedupe: 10_000 });
  assert.equal(other.duplicate('channel', 'a'), false); now = 60_000;
  assert.equal(other.duplicate('channel', 'a'), false);
  for (let i = 0; i < 9999; i++) assert.equal(other.duplicate('channel', String(i)), false);
  assert.equal(other.duplicate('channel', 'a'), true);
  other.duplicate('channel', 'evict'); assert.equal(other.duplicate('channel', 'a'), false);
  now += 60_000; assert.equal(other.duplicate('channel', 'a'), false);
  const highRate = new RateLimits(() => now);
  for (let i = 0; i < 15_000; i++) assert.equal(highRate.duplicate('channel', `burst-${i}`), false);
  for (let i = 0; i < 15_000; i++) assert.equal(highRate.duplicate('channel', `burst-${i}`), true);
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

test('gateway listener pre-filters bot, self and non-prefix messages without reading mentions', async () => {
  const prefixes = ['!', '!!'];
  const client = new Client();
  Reflect.set(client, 'login', async () => client);
  Reflect.set(client, 'destroy', async () => {});
  const transport = new MockTransport();
  const bot = new Yuzuha({ client, prefix: prefixes, transport, store: new MemoryStore(), scheduler: false });
  const received: string[] = [];
  bot.command({ name: 'ping', run: async ctx => { received.push(ctx.input); await ctx.reply('pong'); } });
  await bot.login('offline-token');

  let mentionReads = 0;
  const gatewayMessage = (id: string, content: string, author: { id: string; username: string; bot: boolean }) => ({
    id, content, channelId: '200', guildId: '100', author,
    get mentions() { mentionReads++; return []; },
  });

  client.emit(Events.MessageCreate, gatewayMessage('1', '!ping', { id: '2', username: 'other-bot', bot: true }) as never);
  client.emit(Events.MessageCreate, gatewayMessage('2', '!ping', { id: transport.botID, username: 'self', bot: false }) as never);
  client.emit(Events.MessageCreate, gatewayMessage('3', 'just chatting', { id: '1', username: 'Hory', bot: false }) as never);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(mentionReads, 0);
  assert.equal(transport.messages.length, 0);

  client.emit(Events.MessageCreate, gatewayMessage('4', '!!ping hello', { id: '1', username: 'Hory', bot: false }) as never);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(mentionReads, 1);
  assert.deepEqual(received, ['hello']);
  assert.equal(transport.messages.at(-1)?.payload.content, 'pong');

  prefixes[0] = '?';
  client.emit(Events.MessageCreate, gatewayMessage('5', '!ping ignored', { id: '1', username: 'Hory', bot: false }) as never);
  assert.equal(mentionReads, 1);
  client.emit(Events.MessageCreate, gatewayMessage('6', '?ping updated', { id: '1', username: 'Hory', bot: false }) as never);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(mentionReads, 2);
  assert.deepEqual(received, ['hello', 'updated']);
  await bot.destroy();
});

test('precompiled flag lookup matches on-the-fly parsing across aliases, defaults and errors', async () => {
  const defs = [
    { name: 'count', type: 'integer' as const, aliases: ['n', 'c'], defaultValue: 1 },
    { name: 'verbose', type: 'boolean' as const, aliases: ['v'], defaultValue: false },
    { name: 'reason', type: 'string' as const, aliases: ['r'], required: true },
  ];
  const lookup = compileFlagLookup(defs);
  assert.ok(lookup);
  assert.equal(compileFlagLookup(undefined), undefined);

  for (const tokens of [
    ['--reason', 'ok'],
    ['-r=fast', '-n', '5', '-v', 'pos1'],
    ['-c', '-2', '--verbose=false', '--reason', 'done', '--', '--not-a-flag'],
  ]) {
    const direct = parseFlags(defs, tokens);
    const compiled = parseFlags(defs, tokens, lookup);
    assert.deepEqual(compiled.tokens, direct.tokens);
    assert.deepEqual([...compiled.flags], [...direct.flags]);
  }
  for (const bad of [['--missing', '1'], ['-r', 'ok', '-c', 'nope'], ['--reason=a', '-r', 'b']]) {
    assert.throws(() => parseFlags(defs, bad, lookup), { name: 'YuzuhaError' });
  }

  const transport = new MockTransport();
  const bot = new Yuzuha({ transport, store: new MemoryStore(), scheduler: false });
  bot.command({
    name: 'opt',
    args: { target: arg.text().required() },
    flags: { count: arg.integer().alias('n').default(2), verbose: arg.boolean().alias('v').default(false) },
    run: ctx => ctx.reply(`${ctx.args.get('target')}:${ctx.flags.get('count')}:${ctx.flags.get('verbose')}`),
  });
  try {
    assert.equal(await bot.handle(mockMessage('!opt user -n 7 -v', { id: 'f1' })), 'success');
    assert.equal(transport.messages.at(-1)?.payload.content, 'user:7:true');
    assert.equal(await bot.handle(mockMessage('!opt user', { id: 'f2' })), 'success');
    assert.equal(transport.messages.at(-1)?.payload.content, 'user:2:false');
    assert.equal(await bot.handle(mockMessage('!opt user -n 1 --count 2', { id: 'f3' })), 'guarded');
  } finally {
    await bot.destroy();
  }
});

test('index-scanned routing and subcommand resolution preserve Unicode whitespace and large tails', async () => {
  assert.equal(route('!   \t\u2003\u3000', ['!']), undefined);
  assert.deepEqual(route('!\u2003PING\t\u00a0hello  world\u3000\ufeff', ['!']), {
    name: 'ping', input: 'hello  world', prefix: '!',
  });

  const payload = 'x'.repeat(4096);
  assert.deepEqual(route(`!!Group\u2003Sub\t${payload}\u00a0`, ['!!', '!']), {
    name: 'group', input: `Sub\t${payload}`, prefix: '!!',
  });

  const registry = new CommandRegistry(() => undefined);
  registry.add({
    name: 'admin',
    subcommands: [
      {
        name: 'user',
        aliases: ['u'],
        subcommands: [{ name: 'ban', aliases: ['b'], run() {} }],
      },
    ],
  });

  const matched = registry.resolve('admin', `\t\u2003U\u3000BAN\n\u00a0${payload}  \ufeff`);
  assert.ok(matched);
  assert.equal(matched.compiled.command.name, 'admin user ban');
  assert.equal(matched.input, payload);

  const missingChild = registry.resolve('admin', '  unknown  arg  ');
  assert.ok(missingChild);
  assert.equal(missingChild.compiled.command.name, 'admin');
  assert.equal(missingChild.input, '  unknown  arg  ');

  const emptyAfterGroup = registry.resolve('admin', '   \u2003  ');
  assert.ok(emptyAfterGroup);
  assert.equal(emptyAfterGroup.compiled.command.name, 'admin');
  assert.equal(emptyAfterGroup.input, '   \u2003  ');

  const partialMatch = registry.resolve('admin', '  user   unknown   tail  ');
  assert.ok(partialMatch);
  assert.equal(partialMatch.compiled.command.name, 'admin user');
  assert.equal(partialMatch.input, 'unknown   tail');
});
