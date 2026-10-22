import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PermissionFlags } from '@fluxerjs/core';
import { arg, commandUsage, defineCommand, HttpService, MemoryStore, Yuzuha } from '../src/index.js';
import type { Command } from '../src/index.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function fixture() {
  const transport = new MockTransport(), errors: unknown[] = [];
  const bot = new Yuzuha({ transport, store: new MemoryStore(), onError: error => { errors.push(error); } });
  let id = 0;
  return { bot, transport, errors, send: (content: string, extra = {}) => bot.handle(mockMessage(content, { id: String(++id), ...extra })) };
}

test('nested aliases route to canonical commands, with typed flags and separate positional tokens', async () => {
  const { bot, transport, send } = fixture();
  bot.command({ name: 'config', aliases: ['c'], subcommands: [{ name: 'bot', aliases: ['b'], subcommands: [defineCommand({
    name: 'prefix', aliases: ['p'], args: { prefix: arg.text().required(), rest: arg.text().rest() },
    flags: { reason: arg.text().alias('r').required(), count: arg.integer().alias('n').default(1), quiet: arg.boolean().default(false) },
    async run(ctx) {
      assert.equal(ctx.command.name, 'config bot prefix');
      assert.deepEqual(ctx.tokens, ['?', 'the rest']);
      await ctx.reply(JSON.stringify({ prefix: ctx.args.get('prefix'), rest: ctx.args.get('rest'), ...Object.fromEntries(ctx.flags) }));
    },
  })] }] });
  try {
    assert.equal(await send('!C B P ? --reason="a detailed reason" -n -3 --quiet=false "the rest"'), 'success');
    assert.deepEqual(JSON.parse(transport.messages.at(-1)!.payload.content!), { prefix: '?', rest: 'the rest', reason: 'a detailed reason', count: -3, quiet: false });
  } finally { await bot.destroy(); }
});

test('flag validation rejects unknown, duplicate, absent and invalid values before the handler', async () => {
  const { bot, transport, send } = fixture();
  let calls = 0;
  bot.command({ name: 'flags', flags: { reason: arg.text().required(), count: arg.integer(), quiet: arg.boolean() }, run: () => { calls++; } });
  try {
    for (const [input, pattern] of [
      ['--what a', /desconhecida/], ['--reason a --reason b', /repetida/], ['--reason', /valor de --reason/],
      ['--count 1', /reason/], ['--reason a --count nope', /inteiro/], ['--reason a --quiet=maybe', /true ou false/],
      ['--reason "unclosed', /aspas/],
    ] as const) {
      assert.equal(await send(`!flags ${input}`), 'guarded');
      const message = transport.messages.at(-1)!.payload.content!;
      assert.match(message, pattern); assert.match(message, /Uso: !flags/);
    }
    assert.equal(calls, 0);
    assert.equal(await send('!flags --reason ok --quiet'), 'success');
    assert.equal(calls, 1);
  } finally { await bot.destroy(); }
});

test('terminator preserves literal flags, aliases share a key, and legacy commands preserve raw flag-like arguments', async () => {
  const { bot, transport, send } = fixture();
  bot.command({ name: 'literal', args: { text: arg.text().rest().required() }, flags: { quiet: arg.boolean().alias('q') }, async run(ctx) {
    await ctx.reply(`${ctx.flags.get('quiet')}|${ctx.args.get('text')}`);
  } });
  bot.command({ name: 'legacy', args: { text: arg.text().rest() }, run: ctx => ctx.reply(ctx.args.get('text') ?? '') });
  try {
    await send('!literal -q -- --quiet=false -x');
    assert.equal(transport.messages.at(-1)?.payload.content, 'true|--quiet=false -x');
    assert.equal(await send('!literal -q --quiet x'), 'guarded');
    await send('!legacy --unknown -- -3');
    assert.equal(transport.messages.at(-1)?.payload.content, '--unknown -- -3');
  } finally { await bot.destroy(); }
});

test('parent guild, author and bot permissions cannot be relaxed by a child', async () => {
  const { bot, transport, send } = fixture();
  let calls = 0;
  bot.command({ name: 'secure', guildOnly: true, permissions: ['ManageMessages'], botPermissions: ['ManageMessages'], subcommands: [
    { name: 'child', guildOnly: false, permissions: [], botPermissions: [], run: () => { calls++; } },
  ] });
  try {
    assert.equal(await send('!secure child', { guildID: undefined }), 'guarded');
    assert.equal(await send('!secure child', { authorID: '2' }), 'guarded');
    transport.setMember('100', { id: transport.botID, owner: false, permissions: 0n, rank: 90 });
    assert.equal(await send('!secure child'), 'guarded');
    assert.equal(calls, 0);
    transport.setMember('100', { id: transport.botID, owner: false, permissions: PermissionFlags.ManageMessages, rank: 90 });
    assert.equal(await send('!secure child'), 'success');
    assert.equal(calls, 1);
  } finally { await bot.destroy(); }
});

test('checks and middleware execute outer to inner, and a parent check blocks the leaf', async () => {
  const { bot, send } = fixture();
  const order: string[] = [];
  let allowed = true;
  bot.use(async (_ctx, next) => { order.push('global'); await next(); });
  bot.command({ name: 'group', checks: [() => { order.push('parent check'); return allowed || 'blocked'; }],
    middleware: [async (_ctx, next) => { order.push('parent before'); await next(); order.push('parent after'); }],
    subcommands: [{ name: 'child', checks: [() => { order.push('child check'); }],
      middleware: [async (_ctx, next) => { order.push('child before'); await next(); order.push('child after'); }],
      run: () => { order.push('run'); },
    }],
  });
  try {
    await send('!group child');
    assert.deepEqual(order, ['parent check', 'child check', 'global', 'parent before', 'child before', 'run', 'child after', 'parent after']);
    order.length = 0; allowed = false;
    assert.equal(await send('!group child'), 'guarded');
    assert.deepEqual(order, ['parent check']);
  } finally { await bot.destroy(); }
});

test('parent cooldown is shared by sibling leaves and aliases', async () => {
  const { bot, send } = fixture();
  bot.command({ name: 'group', aliases: ['g'], cooldown: 60000, subcommands: [
    { name: 'one', cooldown: 1, run() {} }, { name: 'two', run() {} },
  ] });
  try {
    assert.equal(await send('!group one'), 'success');
    assert.equal(await send('!g two'), 'guarded');
    assert.equal(await send('!g one'), 'guarded');
    assert.equal(await send('!group two', { authorID: '2' }), 'success');
  } finally { await bot.destroy(); }
});

test('child HTTP policies intersect ancestor hosts and cannot increase limits', async () => {
  const transport = new MockTransport();
  let calls = 0;
  const http = new HttpService({ allowedHosts: ['127.0.0.1', '127.0.0.2'], allowPrivate: true, fetch: async () => { calls++; return new Response('abcdef'); } });
  const bot = new Yuzuha({ transport, store: new MemoryStore(), http, onError() {} });
  bot.command({ name: 'web', http: { allowedHosts: ['127.0.0.1'], maxBytes: 2 }, subcommands: [
    { name: 'host', http: { allowedHosts: ['127.0.0.1', '127.0.0.2'], maxBytes: 999 }, run: ctx => ctx.http.request({ method: 'GET', url: 'https://127.0.0.2' }) },
    { name: 'size', http: { maxBytes: 999 }, run: ctx => ctx.http.request({ method: 'GET', url: 'https://127.0.0.1' }) },
    { name: 'undefined', http: { allowedHosts: undefined, maxBytes: undefined, maxRequestBytes: undefined, timeoutMs: undefined }, run: ctx => ctx.reply(JSON.stringify(ctx.command.http)) },
  ] });
  try {
    assert.equal(await bot.handle(mockMessage('!web host')), 'error');
    assert.equal(calls, 0);
    assert.equal(await bot.handle(mockMessage('!web size', { id: 'size' })), 'error');
    assert.equal(calls, 1);
    assert.equal(await bot.handle(mockMessage('!web undefined', { id: 'undefined' })), 'success');
    assert.deepEqual(JSON.parse(transport.messages.at(-1)!.payload.content!), { allowedHosts: ['127.0.0.1'], maxBytes: 2 });
    assert.throws(() => bot.command({ name: 'bad-web', http: { allowedHosts: ['example.com'] }, subcommands: [
      { name: 'child', http: { allowedHosts: ['example.org'] }, run() {} },
    ] }), /nenhum host/);
  } finally { await bot.destroy(); }
});

test('undefined child policy limits preserve all ancestor HTTP restrictions', async () => {
  const { bot, transport, send } = fixture();
  const policy = { allowedHosts: ['127.0.0.1'], maxBytes: 20, maxRequestBytes: 30, timeoutMs: 40 };
  bot.command({ name: 'web', http: policy, subcommands: [
    { name: 'child', http: { allowedHosts: undefined, maxBytes: undefined, maxRequestBytes: undefined, timeoutMs: undefined }, run: ctx => ctx.reply(JSON.stringify(ctx.command.http)) },
  ] });
  try {
    assert.equal(await send('!web child'), 'success');
    assert.deepEqual(JSON.parse(transport.messages.at(-1)!.payload.content!), policy);
  } finally { await bot.destroy(); }
});

test('help shares metadata with usages, explains flags, examples and subcommands, and hides ancestor trees', async () => {
  const { bot, transport, send } = fixture();
  const leaf = defineCommand({ name: 'prefix', aliases: ['p'], description: 'Change prefix.',
    args: { prefix: arg.text().required().describe('New prefix.') },
    flags: { mode: arg.text().choices(['fast', 'slow']).default('fast').alias('m').describe('Choose mode.') },
    examples: ['!config prefix ? --mode slow'], run() {},
  });
  bot.command({ name: 'config', aliases: ['c'], subcommands: [leaf, { name: 'hidden', hidden: true, run() {} }] });
  bot.command({ name: 'secret', hidden: true, subcommands: [{ name: 'child', hidden: false, run() {} }] });
  try {
    const help = bot.help('c p', '!');
    assert.match(help, /Uso: !config prefix <prefix> \[--mode <string>\]/);
    assert.match(help, /escolhas: fast, slow; padrão: fast/);
    assert.match(help, /--mode \(-m\)/); assert.match(help, /New prefix/); assert.match(help, /Exemplos:\n!config prefix/);
    assert.equal(commandUsage(leaf, '?'), '?prefix <prefix> [--mode <string>]');
    assert.equal(bot.help('secret child'), ''); assert.doesNotMatch(bot.help(), /secret/);
    assert.doesNotMatch(bot.help('config'), /hidden/);
    assert.equal(await send('!config'), 'guarded'); assert.match(transport.messages.at(-1)!.payload.content!, /Subcomandos:/);
    assert.equal(await send('!config unknown'), 'guarded'); assert.match(transport.messages.at(-1)!.payload.content!, /Subcomando desconhecido/);
    assert.equal(await send('!config prefix'), 'guarded'); assert.match(transport.messages.at(-1)!.payload.content!, /Uso: !config prefix/);
  } finally { await bot.destroy(); }
});

test('nested metadata snapshots and failed registrations preserve working commands', async () => {
  const { bot, transport, send } = fixture();
  const leaf: Command = { name: 'child', aliases: ['c'], flags: [{ name: 'flag', aliases: ['f'], type: 'boolean' }], examples: ['group child'], code: 'original' };
  const group: Command = { name: 'group', subcommands: [leaf] };
  bot.command(group);
  leaf.code = 'changed'; leaf.aliases!.push('changed'); leaf.flags![0]!.aliases = ['changed']; group.subcommands!.length = 0;
  const listed = bot.listCommands()[0]!;
  listed.subcommands![0]!.code = 'mutated'; listed.subcommands![0]!.flags![0]!.aliases = ['mutated'];
  try {
    assert.equal(await send('!group c -f'), 'success'); assert.equal(transport.messages.at(-1)?.payload.content, 'original');
    assert.throws(() => bot.command({ name: 'bad', subcommands: [{ name: 'x', run() {} }, { name: 'y', aliases: ['x'], run() {} }] }), /duplicado/);
    assert.equal(bot.listCommands().length, 1);
    assert.throws(() => bot.command({ name: 'bad-flags', flags: [{ name: 'first', aliases: ['f'] }, { name: 'second', aliases: ['f'] }], run() {} }), /duplicado/);
    assert.throws(() => bot.command({ name: 'group-args', args: [{ name: 'value' }], subcommands: [{ name: 'child', run() {} }] }), /Grupos não aceitam/);
    const cycle: Command = { name: 'cycle', subcommands: [] }; cycle.subcommands!.push(cycle);
    assert.throws(() => bot.command(cycle), /cíclica/);
    let deep: Command = { name: 'leaf', run() {} };
    for (let index = 0; index < 33; index++) deep = { name: 'group', subcommands: [deep] };
    assert.throws(() => bot.command(deep), /32 níveis/);
  } finally { await bot.destroy(); }
});

test('plugins compile nested scripts with plugin functions and preserve atomic registration on sibling collisions', async () => {
  const { bot, transport, send } = fixture();
  bot.plugin({ name: 'working', functions: [{ name: 'custom', description: 'Test function.', usage: '$custom', category: 'test', minArgs: 0, maxArgs: 0, execute: () => 'plugin' }],
    commands: [{ name: 'plugin', subcommands: [{ name: 'child', code: '$reply[$custom]' }] }],
  });
  try {
    assert.equal(await send('!plugin child'), 'success'); assert.equal(transport.messages.at(-1)?.payload.content, 'plugin');
    assert.throws(() => bot.plugin({ name: 'bad', commands: [{ name: 'added', run() {} }, { name: 'invalid', subcommands: [{ name: 'a', run() {} }, { name: 'a', run() {} }] }] }), /duplicado/);
    assert.deepEqual(bot.listCommands().map(command => command.name), ['plugin']);
  } finally { await bot.destroy(); }
});

test('reload validates complete trees and retains manual commands and previous directory on failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-tree-'));
  const file = join(directory, 'group.mjs');
  const { bot, transport, send } = fixture();
  bot.command({ name: 'manual', run() {} });
  try {
    await writeFile(file, 'export default { name: "loaded", subcommands: [{name:"child", code:"before"}] };');
    await bot.load(directory, false);
    await writeFile(file, 'export default { name: "loaded", subcommands: [{name:"child", code:"changed"}, {name:"other", aliases:["child"], code:"collision"}] };');
    await assert.rejects(bot.reload(directory), /duplicado/);
    await send('!loaded child'); assert.equal(transport.messages.at(-1)?.payload.content, 'before');
    await writeFile(file, 'export default { name: "loaded", subcommands: [{name:"child", code:"after"}] };');
    await bot.reload(directory);
    await send('!loaded child'); assert.equal(transport.messages.at(-1)?.payload.content, 'after');
    assert.deepEqual(bot.listCommands().map(command => command.name).sort(), ['loaded', 'manual']);
  } finally { await bot.destroy(); await rm(directory, { recursive: true }); }
});
