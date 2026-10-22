import test from 'node:test';
import assert from 'node:assert/strict';
import { Events } from '@fluxerjs/core';
import { arg, defineCommand, defineEvent, MemoryStore, Yuzuha } from '../src/index.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function fixture() {
  const transport = new MockTransport(), errors: unknown[] = [];
  const bot = new Yuzuha({ transport, store: new MemoryStore(), onError: error => { errors.push(error); } });
  return { bot, transport, errors };
}

test('direct native schema executes inferred arguments, guards, middleware and context access', async () => {
  const { bot, transport } = fixture();
  const order: string[] = [];
  bot.use(async (_ctx, next) => { order.push('global'); await next(); });
  bot.command({ name: 'native',
    args: { amount: arg.integer().min(1).default(2) },
    checks: [ctx => { order.push('check'); return ctx.authorID === '1' || 'Apenas o dono.'; }],
    middleware: [async (_ctx, next) => { order.push('local'); await next(); }],
    async run(ctx) {
      assert.equal(ctx.client, bot.client);
      assert.equal(ctx.signal.aborted, false);
      assert.equal(ctx.nativeMessage, undefined);
      const count = await ctx.data.guild.update('count', value => Number(value ?? 0) + ctx.args.get('amount'), 0);
      order.push('run'); await ctx.reply(String(count));
    },
  });
  assert.equal(await bot.handle(mockMessage('!native')), 'success');
  assert.deepEqual(order, ['check', 'global', 'local', 'run']);
  assert.equal(transport.messages.at(-1)?.payload.content, '2');
  order.length = 0;
  assert.equal(await bot.handle(mockMessage('!native', { authorID: '2' })), 'guarded');
  assert.deepEqual(order, ['check']);
  assert.equal(transport.messages.at(-1)?.payload.content, 'Apenas o dono.');
  await bot.destroy();
});

test('native moderation facade records cases through the same guarded command pipeline', async () => {
  const { bot, transport } = fixture();
  bot.command(defineCommand({ name: 'ban-native', args: { member: arg.user().required(), reason: arg.text().rest().required() },
    async run(ctx) {
      const record = await ctx.mod.ban(ctx.args.get('member'), { reason: ctx.args.get('reason') });
      await ctx.reply(`Case #${record.id}`);
    },
  }));
  assert.equal(await bot.handle(mockMessage('!ban-native <@2> spam no chat')), 'success');
  assert.equal(transport.actions.length, 1); assert.equal(transport.actions[0]?.reason, 'spam no chat');
  assert.equal(transport.messages.at(-1)?.payload.content, 'Case #1');
  await bot.destroy();
});

test('native event on, once and off preserve callbacks and remove owned listeners on shutdown', async () => {
  const { bot } = fixture();
  let persistent = 0, once = 0, removed = 0;
  const listener = () => { persistent++; };
  const removable = () => { removed++; };
  bot.on(Events.Ready, listener).once(Events.Ready, () => { once++; }).on(Events.Ready, removable);
  bot.off(Events.Ready, removable);
  bot.client.emit(Events.Ready); bot.client.emit(Events.Ready);
  await bot.destroy();
  assert.equal(persistent, 2); assert.equal(once, 1); assert.equal(removed, 0);
  assert.equal(bot.client.listenerCount(Events.Ready), 0);
  assert.throws(() => bot.on(Events.Ready, listener), /encerrado/);
});

test('async native event errors reach onError and active event work is drained', async () => {
  const { bot, errors } = fixture();
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { started = resolve; });
  bot.event(defineEvent({ event: Events.Ready, async run() { started(); await gate; throw new Error('event failure'); } }));
  bot.client.emit(Events.Ready); await ready;
  let closed = false;
  const closing = bot.destroy().then(() => { closed = true; });
  assert.equal(closed, false); release(); await closing;
  assert.equal(errors.length, 1); assert.match(String(errors[0]), /event failure/);
});

test('a native event can request shutdown without waiting on itself', { timeout: 2000 }, async () => {
  const { bot } = fixture();
  let ran = false;
  bot.once(Events.Ready, async () => { await bot.destroy(); ran = true; });
  bot.client.emit(Events.Ready); await bot.destroy();
  assert.equal(ran, true);
});

test('shutdown signals cooperatively cancel command work and drain its response', async () => {
  const { bot, transport } = fixture();
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  bot.command({ name: 'wait', async run(ctx) {
    const aborted = new Promise<void>(resolve => { ctx.signal.addEventListener('abort', () => resolve(), { once: true }); });
    started(); await aborted; await ctx.reply('cancelled');
  } });
  const running = bot.handle(mockMessage('!wait')); await ready;
  await bot.destroy(); assert.equal(await running, 'success');
  assert.equal(bot.signal.aborted, true); assert.equal(transport.messages.at(-1)?.payload.content, 'cancelled');
});

test('plugin commands can use plugin functions and invalid plugin commands commit nothing', async () => {
  const { bot, transport } = fixture();
  let eventCount = 0;
  bot.plugin({ name: 'full-plugin',
    functions: [{ name: 'helloPlugin', minArgs: 0, maxArgs: 0, category: 'plugin', usage: '$helloPlugin', description: '', execute: () => 'plugin reply' }],
    commands: [{ name: 'plugin', code: '$reply[$helloPlugin]' }],
    events: [defineEvent({ event: Events.Ready, run() { eventCount++; } })],
  });
  assert.equal(await bot.handle(mockMessage('!plugin')), 'success');
  assert.equal(transport.messages.at(-1)?.payload.content, 'plugin reply');
  assert.throws(() => bot.plugin({ name: 'invalid-plugin',
    functions: [{ name: 'uncommitted', minArgs: 0, maxArgs: 0, category: 'plugin', usage: '$uncommitted', description: '', execute: () => '' }],
    commands: [{ name: 'plugin', code: 'collision' }],
  }), /duplicado/);
  assert.throws(() => bot.runtime.compile('$uncommitted'), /desconhecida/);
  bot.client.emit(Events.Ready); await bot.destroy(); assert.equal(eventCount, 1);
});
