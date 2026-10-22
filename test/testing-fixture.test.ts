import test from 'node:test';
import assert from 'node:assert/strict';
import { defineCommand, MemoryStore } from '../src/index.js';
import { createTestBot, TestClock } from '../src/testing.js';
import { Client } from '../src/sdk.js';

test('fixture reúne comandos, mensagens, erros e resultados sem rede ou estado compartilhado', async t => {
  const failure = new Error('falha nativa');
  const errors: unknown[] = [];
  const commands = [
    defineCommand({ name: 'ping', async run(ctx) { await ctx.reply('pong'); } }),
    defineCommand({ name: 'fail', run() { throw failure; } }),
    defineCommand({ name: 'resource', async run(ctx) { await ctx.resources.users.user('1'); } }),
  ];
  const first = createTestBot({ commands, onError: error => { errors.push(error); } });
  const second = createTestBot({ commands });
  t.after(() => first.destroy());
  t.after(() => second.destroy());
  assert.equal(await first.send('!ping'), 'success');
  assert.equal(await second.send('!ping'), 'success');
  assert.equal(first.messages[0]?.replyTo, '1');
  assert.equal(second.messages[0]?.replyTo, '1');
  assert.equal(await first.send('!fail'), 'error');
  assert.equal(await first.send('!resource'), 'error');
  assert.equal(first.errors[0], failure);
  assert.equal(errors[0], failure);
  assert.match(String(first.errors[1]), /Recurso simulado ausente/);
  assert.deepEqual(first.results, ['success', 'error', 'error']);
  assert.deepEqual(second.results, ['success']);
  assert.deepEqual(second.errors, []);
  assert.equal(second.messages.length, 1);
  assert.equal(first.messages[0]?.payload.content, 'pong');
});

test('relógio da fixture controla cooldown e TTLs de todos os escopos', async t => {
  const fixture = createTestBot({ now: 1_000, commands: [
    { name: 'cool', cooldown: 100, async run(ctx) { await ctx.reply('pronto'); } },
    { name: 'save', async run(ctx) {
      await ctx.data.global.set('key', 'value', { ttlMs: 100 });
      await ctx.data.userFor('2').set('key', 'value', { ttlMs: 100 });
      await ctx.data.transaction(data => data.guild.set('key', 'value', { ttlMs: 100 }));
    } },
    { name: 'read', async run(ctx) {
      await ctx.reply(JSON.stringify([await ctx.data.global.get('key'), await ctx.data.userFor('2').get('key'),
        await ctx.data.guild.get('key'), await ctx.data.global.ttl('key')]));
    } },
  ] });
  t.after(() => fixture.destroy());
  assert.equal(await fixture.send('!cool'), 'success');
  assert.equal(await fixture.send('!cool'), 'guarded');
  await fixture.send('!save');
  fixture.clock.advance(99);
  await fixture.send('!read');
  assert.equal(fixture.messages.at(-1)?.payload.content, '["value","value","value",1]');
  assert.equal(await fixture.send('!cool'), 'guarded');
  fixture.clock.advance(1);
  assert.equal(await fixture.send('!cool'), 'success');
  await fixture.send('!read');
  assert.equal(fixture.messages.at(-1)?.payload.content, '[null,null,null,-2]');
  assert.deepEqual(fixture.errors, []);
});

test('tick executa tarefas e retries com relógio manual e aguarda handlers', async t => {
  let attempts = 0;
  const fixture = createTestBot({ now: 1_000, commands: [{ name: 'ping', async run(ctx) {
    if (++attempts === 1) throw new Error('tente novamente');
    await ctx.reply('agendado');
  } }] });
  t.after(() => fixture.destroy());
  await fixture.bot.scheduler!.add({ guildID: '100', channelID: '200', authorID: '1', command: 'ping',
    input: '', due: 1_100, retryDelayMs: 50, maxAttempts: 2 });
  await fixture.tick(99);
  assert.equal(attempts, 0);
  await fixture.tick(1);
  assert.equal(attempts, 1);
  assert.equal((await fixture.bot.scheduler!.list())[0]?.due, 1_150);
  await fixture.tick(50);
  assert.equal(attempts, 2);
  assert.equal(fixture.messages.at(-1)?.payload.content, 'agendado');
  assert.deepEqual(await fixture.bot.scheduler!.list(), []);
  const history = await fixture.bot.scheduler!.history();
  assert.deepEqual(history.map(item => [item.status, item.startedAt, item.finishedAt]),
    [['retrying', 1_100, 1_100], ['success', 1_150, 1_150]]);
  assert.equal(fixture.errors.length, 1);
});

test('agendamentos em function mode usam o mesmo relógio manual', async t => {
  const fixture = createTestBot({ now: 1_000, commands: [
    { name: 'schedule', code: '$let[id;$schedule[100ms;ping]]' },
    { name: 'ping', code: '$reply[agendado]' },
  ] });
  t.after(() => fixture.destroy());
  assert.equal(await fixture.send('!schedule'), 'success');
  assert.equal((await fixture.bot.scheduler!.list())[0]?.due, 1_100);
  await fixture.tick(99);
  assert.equal(fixture.messages.length, 0);
  await fixture.tick(1);
  assert.equal(fixture.messages.at(-1)?.payload.content, 'agendado');
});

test('close e descarte assíncrono drenam handlers e preservam stores do chamador', async () => {
  class CallerStore extends MemoryStore {
    closed = false;
    async close(): Promise<void> { this.closed = true; }
  }
  const store = new CallerStore();
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  let finished = false;
  const fixture = createTestBot({ store, commands: [{ name: 'wait', async run(ctx) {
    const cancelled = new Promise<void>(resolve => ctx.signal.addEventListener('abort', () => resolve(), { once: true }));
    started();
    await cancelled;
    finished = true;
  } }] });
  const pending = fixture.send('!wait');
  await ready;
  await fixture[Symbol.asyncDispose]();
  assert.equal(await pending, 'success');
  assert.equal(finished, true);
  assert.equal(store.closed, false);
  assert.equal(await fixture.send('!wait'), 'ignored');
  await assert.rejects(fixture.tick(), /encerrado/);
  await fixture.close();
  await fixture.destroy();
  await store.close();
  assert.equal(store.closed, true);
});

test('destroy dentro do handler confirma pedido e close externo aguarda encerramento', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requested!: () => void;
  const ready = new Promise<void>(resolve => { requested = resolve; });
  let ended = false;
  const fixture = createTestBot();
  fixture.bot.command({ name: 'stop', async run() {
    await fixture.destroy();
    requested();
    await gate;
    ended = true;
  } });
  const dispatch = fixture.send('!stop');
  await ready;
  let closed = false;
  const close = fixture.close().then(() => { closed = true; });
  await Promise.resolve();
  assert.equal(closed, false);
  release();
  await close;
  await dispatch;
  assert.equal(ended, true);
});

test('relógios rejeitam retrocessos e valores inválidos sem alterar o instante', () => {
  const clock = new TestClock(10);
  for (const value of [-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => clock.advance(value), /avanço/);
    assert.equal(clock.now(), 10);
  }
  assert.equal(clock.advance(5), 15);
  assert.throws(() => new TestClock(-1), /relógio/);
});

test('falha ao registrar comandos encerra o client sem fechar store fornecido', async () => {
  let destroyed!: () => void;
  const ready = new Promise<void>(resolve => { destroyed = resolve; });
  class OfflineClient extends Client {
    override async destroy(): Promise<void> { await super.destroy(); destroyed(); }
  }
  class CallerStore extends MemoryStore {
    closed = false;
    async close(): Promise<void> { this.closed = true; }
  }
  const store = new CallerStore();
  assert.throws(() => createTestBot({ client: new OfflineClient(), store, commands: [
    { name: 'duplicate', run() {} }, { name: 'duplicate', run() {} },
  ] }), /duplicado/);
  await ready;
  assert.equal(store.closed, false);
});
