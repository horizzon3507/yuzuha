import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PermissionFlags } from '@fluxerjs/core';
import { MemoryStore, PartialModerationError, Yuzuha } from '../src/index.js';
import type { State } from '../src/index.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function harness(store = new MemoryStore()) {
  const transport = new MockTransport(), errors: unknown[] = [];
  const bot = new Yuzuha({ transport, store, onError: e => { errors.push(e); } });
  return { bot, transport, store, errors };
}

test('script and native commands share context, aliases, prefix and help', async () => {
  const { bot, transport } = harness();
  bot.command({ name: 'oi', aliases: ['hello'], description: 'Olá', code: '$reply[Olá, $username!]' });
  bot.command({ name: 'sum', args: [{ name: 'n', type: 'integer', required: true }], run: async ctx => { await ctx.reply(String(Number(ctx.args.get('n')) + 1)); } });
  assert.equal(await bot.handle(mockMessage('!HELLO')), 'success');
  assert.equal(transport.messages[0]?.payload.content, 'Olá, Hory!');
  assert.equal(await bot.handle(mockMessage('!sum 5')), 'success');
  assert.equal(transport.messages.at(-1)?.payload.content, '6');
  assert.equal(await bot.handle(mockMessage('!sum inválido')), 'guarded');
  assert.match(bot.help(), /oi: Olá/);
});

test('short ban command runs guards, action and case exactly once', async () => {
  const { bot, transport, store } = harness();
  bot.command({ name: 'ban', code: '$modBan[$mentioned[1];$messageSlice[1]]\n$reply[Membro banido. Caso #$caseID.]' });
  const message = mockMessage('!ban <@2> spam no chat');
  assert.equal(await bot.handle(message), 'success');
  assert.equal(await bot.handle(message), 'ignored');
  assert.deepEqual(transport.actions, [{ guildID: '100', action: 'ban', targetID: '2', reason: 'spam no chat', duration: 0 }]);
  assert.equal(transport.messages.at(-1)?.payload.content, 'Membro banido. Caso #1.');
  assert.equal(await store.read(s => s.cases['100']![0]!.reason), 'spam no chat');
});

test('moderation stops for missing reason, permission, self, owner and hierarchy', async t => {
  const cases = [
    { name: 'reason', input: '!ban <@2>', change: () => {} },
    { name: 'author permission', input: '!ban <@2> spam', change: (transport: MockTransport) => transport.setMember('100', { id: '1', owner: false, permissions: 0n, rank: 10 }) },
    { name: 'bot permission', input: '!ban <@2> spam', change: (transport: MockTransport) => transport.setMember('100', { id: '999', owner: false, permissions: 0n, rank: 90 }) },
    { name: 'self', input: '!ban <@1> spam', change: () => {} },
    { name: 'bot', input: '!ban <@999> spam', change: () => {} },
    { name: 'owner', input: '!ban <@2> spam', change: (transport: MockTransport) => transport.setMember('100', { id: '2', owner: true, permissions: 0n, rank: 1 }) },
    { name: 'bot hierarchy', input: '!ban <@2> spam', change: (transport: MockTransport) => transport.setMember('100', { id: '2', owner: false, permissions: 0n, rank: 90 }) },
    { name: 'author hierarchy', input: '!ban <@2> spam', change: (transport: MockTransport) => transport.setMember('100', { id: '1', owner: false, permissions: PermissionFlags.BanMembers, rank: 1 }) },
  ];
  for (const c of cases) await t.test(c.name, async () => {
    const { bot, transport } = harness(); c.change(transport);
    bot.command({ name: 'ban', code: '$modBan[$mentioned[1];$messageSlice[1]]$reply[Sucesso]' });
    assert.equal(await bot.handle(mockMessage(c.input)), 'guarded');
    assert.equal(transport.actions.length, 0);
    assert.notEqual(transport.messages.at(-1)?.payload.content, 'Sucesso');
  });
});

test('DM moderation does not call transport actions', async () => {
  const { bot, transport } = harness();
  bot.command({ name: 'ban', code: '$modBan[2;spam]' });
  assert.equal(await bot.handle(mockMessage('!ban', { guildID: undefined })), 'guarded');
  assert.equal(transport.actions.length, 0);
});

test('ban success followed by store failure reports partial action without retry', async () => {
  class BrokenStore extends MemoryStore { override update<T>(_fn: (state: State) => T): Promise<T> { return Promise.reject(new Error('disk')); } }
  const { bot, transport, errors } = harness(new BrokenStore());
  bot.command({ name: 'ban', code: '$try[$modBan[2;spam];$reply[retry]]$reply[sucesso]' });
  assert.equal(await bot.handle(mockMessage('!ban')), 'error');
  assert.equal(transport.actions.length, 1);
  assert.match(transport.messages.at(-1)!.payload.content!, /foi realizada.*não foi salvo/);
  assert.ok(errors[0] instanceof PartialModerationError);
});

test('API failure creates no case and discloses no internal error', async () => {
  const { bot, transport, store } = harness(); transport.failAction = true;
  bot.command({ name: 'ban', code: '$modBan[2;spam]' });
  assert.equal(await bot.handle(mockMessage('!ban')), 'error');
  assert.equal(await store.read(s => Object.keys(s.cases).length), 0);
  assert.equal(transport.messages.at(-1)?.payload.content, 'Não foi possível concluir o comando.');
});

test('concurrent cases receive unique per-guild IDs', async () => {
  const { bot, store } = harness();
  bot.command({ name: 'ban', run: async ctx => { await ctx.moderate('ban', '2', 'spam', { record: true }); } });
  await Promise.all(Array.from({ length: 20 }, () => bot.handle(mockMessage('!ban'))));
  const ids = await store.read(s => s.cases['100']!.map(c => c.id));
  assert.deepEqual(ids, Array.from({ length: 20 }, (_, i) => i + 1));
});

test('cooldown isolates users and blocks duplicate action', async () => {
  const { bot, transport } = harness();
  bot.command({ name: 'ping', cooldown: '10s', code: '$reply[Pong]' });
  assert.equal(await bot.handle(mockMessage('!ping')), 'success');
  assert.equal(await bot.handle(mockMessage('!ping')), 'guarded');
  assert.match(transport.messages.at(-1)!.payload.content!, /Aguarde/);
  assert.equal(await bot.handle(mockMessage('!ping', { authorID: '2' })), 'success');
});

test('messages from bots, unrelated prefixes and unknown commands are ignored', async () => {
  const { bot, transport } = harness(); bot.command({ name: 'ping', code: 'Pong' });
  for (const message of [mockMessage('!ping', { authorBot: true }), mockMessage('?ping'), mockMessage('!absent'), mockMessage('!ping', { authorID: '999' })]) assert.equal(await bot.handle(message), 'ignored');
  assert.equal(transport.messages.length, 0);
});

test('middleware order and duplicate next protection', async () => {
  const { bot } = harness(); const order: string[] = [];
  bot.use(async (_ctx, next) => { order.push('before'); await next(); order.push('after'); });
  bot.command({ name: 'test', run: () => { order.push('command'); } });
  await bot.handle(mockMessage('!test'));
  assert.deepEqual(order, ['before', 'command', 'after']);
  bot.use(async (_ctx, next) => { await next(); await next(); });
  assert.equal(await bot.handle(mockMessage('!test')), 'error');
});

test('failed folder reload leaves working commands intact; valid JS reload replaces atomically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yuzuha-reload-'));
  try {
    const path = join(root, 'ping.mjs');
    await writeFile(path, 'export default { name: "ping", code: "First" };');
    const { bot, transport } = harness(); await bot.load(root);
    await bot.handle(mockMessage('!ping')); assert.equal(transport.messages.at(-1)?.payload.content, 'First');
    await writeFile(path, 'export default { name: "ping", code: "$missing" };');
    await assert.rejects(bot.load(root));
    await bot.handle(mockMessage('!ping')); assert.equal(transport.messages.at(-1)?.payload.content, 'First');
    await writeFile(path, 'export default { name: "ping", code: "Second" };'); await bot.load(root);
    await bot.handle(mockMessage('!ping')); assert.equal(transport.messages.at(-1)?.payload.content, 'Second');
  } finally { await rm(root, { recursive: true }); }
});

test('timeout validates duration and unban does not require target membership', async () => {
  const { bot, transport } = harness();
  bot.command({ name: 'mute', code: '$modTimeout[2;10m;spam]' });
  assert.equal(await bot.handle(mockMessage('!mute')), 'success');
  assert.equal(transport.actions[0]?.duration, 600_000);
  bot.command({ name: 'unban', code: '$modUnban[500;revisado]' });
  assert.equal(await bot.handle(mockMessage('!unban')), 'success');
  bot.command({ name: 'bad-timeout', run: async ctx => { await ctx.moderate('timeout', '2', 'spam', { duration: -1 }); } });
  assert.equal(await bot.handle(mockMessage('!bad-timeout')), 'guarded');
  assert.equal(transport.actions.length, 2);
});

test('plugin registration is atomic and functions are usable from scripts', async () => {
  const { bot, transport } = harness();
  bot.enableFunctions();
  bot.plugin({ name: 'greeting', functions: [{ name: 'greet', category: 'test', minArgs: 1, maxArgs: 1, usage: '$greet[name]', description: '', execute: async call => `Hi ${await call.text(0)}` }] });
  assert.throws(() => bot.plugin({ name: 'greeting' }), /Plugin/);
  assert.throws(() => bot.plugin({ name: 'broken', functions: [
    { name: 'new', category: 'test', minArgs: 0, maxArgs: 0, usage: '$new', description: '', execute: () => '' },
    { name: 'reply', category: 'test', minArgs: 0, maxArgs: 0, usage: '$reply', description: '', execute: () => '' },
  ] }));
  assert.throws(() => bot.runtime.compile('$new'), /desconhecida/);
  bot.command({ name: 'hi', code: '$reply[$greet[$username]]' });
  assert.equal(await bot.handle(mockMessage('!hi')), 'success');
  assert.equal(transport.messages.at(-1)?.payload.content, 'Hi Hory');
});

test('message arguments support quoted strings and literal apostrophes in words', async () => {
  const { bot, transport } = harness();
  bot.command({ name: 'echo', code: '$reply[$messageSlice[0]]' });
  assert.equal(await bot.handle(mockMessage('!echo "hello world" user\'s message')), 'success');
  assert.equal(transport.messages.at(-1)?.payload.content, "hello world user's message");
});

test('failure after a recorded action acknowledges it and never repeats moderation', async () => {
  const { bot, transport } = harness();
  bot.command({ name: 'ban', code: '$modBan[2;spam]$throw[falha posterior]' });
  assert.equal(await bot.handle(mockMessage('!ban')), 'error');
  assert.equal(transport.actions.length, 1);
  assert.match(transport.messages.at(-1)!.payload.content!, /realizada e registrada no caso #1/);
});
