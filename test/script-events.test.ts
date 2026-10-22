import test from 'node:test';
import assert from 'node:assert/strict';
import { Guild, GuildMember, Message, MessageReaction, PartialGuildMember, PartialMessage, User } from '@fluxerjs/core';
import { Yuzuha, MemoryStore, GuardError, PartialModerationError } from '../src/index.js';
import type { CommandContext } from '../src/commands/context.js';
import type { ScriptEventData } from '../src/domain/events.js';
import { MockTransport, mockMessage } from '../src/testing.js';

const metadata = { description: 'Teste offline.', category: 'test', usage: '$test' };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const userData = (id = '2', bot = false) => ({ id, username: 'Ana', discriminator: '0000', global_name: null,
  avatar: null, avatar_color: null, flags: 0, bot });
function fixture(store = new MemoryStore()) {
  const transport = new MockTransport(), errors: { error: unknown; ctx?: CommandContext }[] = [];
  const bot = new Yuzuha({ transport, store, scheduler: false, http: false,
    onError: (error, ctx) => { errors.push({ error, ctx }); } });
  const guild = new Guild(bot.client, { id: '100', name: 'Teste', ownerId: '1' });
  const member = (id = '2', botAccount = false) => new GuildMember(bot.client, { user: userData(id, botAccount),
    roles: [], joined_at: '2026-10-21T00:00:00.000Z', mute: false, deaf: false }, guild);
  const message = (content = 'novo') => new Message(bot.client, { id: '400', channel_id: '200', guild_id: '100',
    author: userData(), content, timestamp: '2026-10-21T00:00:00.000Z', type: 0, flags: 0,
    pinned: false, mention_everyone: false, tts: false, mentions: [], mention_roles: [], embeds: [], attachments: [] });
  const reaction = (cached: boolean, emoji: { id: string | null; name: string } = { id: null, name: '👍' }) => ({
    reaction: new MessageReaction(bot.client, { channel_id: '200', message_id: '400', guild_id: '100', user_id: '2', emoji: { name: emoji.name, ...(emoji.id ? { id: emoji.id } : {}) } }), user: new User(bot.client, userData()),
    message: cached ? message() : null, member: cached ? null : member(), channel: null,
    messageId: '400', channelId: '200', userId: '2', emoji,
  });
  return { bot, transport, errors, guild, member, message, reaction };
}

test('seis eventos usam payloads reais do SDK, campos tipados e metadata imutável', async t => {
  const f = fixture(); t.after(() => f.bot.destroy());
  const received: { fields: unknown[]; event: Readonly<ScriptEventData>; actor: string }[] = [];
  f.bot.plugin({ name: 'capture', functions: [{ name: 'captureEvent', ...metadata, minArgs: 8, maxArgs: 8,
    execute: async c => {
      assert.ok(c.ctx.event);
      assert.equal(Object.isFrozen(c.ctx.event), true);
      assert.equal(Reflect.set(c.ctx.event, 'guildID', '999'), false);
      received.push({ fields: await c.all(), event: c.ctx.event, actor: c.ctx.authorID }); return '';
    },
  }] });
  const names = ['guildMemberAdd', 'guildMemberRemove', 'messageUpdate', 'messageDelete', 'messageReactionAdd', 'messageReactionRemove'] as const;
  for (const event of names) f.bot.scriptEvent({ event,
    code: '$captureEvent[$eventName;$eventUserID;$eventGuildID;$eventChannelID;$eventMessageID;$eventContent;$eventOldContent;$eventEmoji]' });
  f.bot.client.emit('guildMemberAdd', f.member());
  f.bot.client.emit('guildMemberRemove', new PartialGuildMember({ client: f.bot.client, id: '2', user: new User(f.bot.client, userData()), guild: f.guild }));
  f.bot.client.emit('messageUpdate', f.message('antigo'), f.message('novo'));
  f.bot.client.emit('messageDelete', new PartialMessage(f.bot.client, { id: '400', channelId: '200', guildId: '100' }));
  f.bot.client.emit('messageReactionAdd', f.reaction(true));
  f.bot.client.emit('messageReactionRemove', f.reaction(false, { id: '300', name: 'festa' }));
  await flush();
  assert.equal(f.errors.length, 0);
  assert.deepEqual(received.map(item => item.fields), [
    ['guildMemberAdd', '2', '100', null, null, null, null, null],
    ['guildMemberRemove', '2', '100', null, null, null, null, null],
    ['messageUpdate', '2', '100', '200', '400', 'novo', 'antigo', null],
    ['messageDelete', null, '100', '200', '400', null, null, null],
    ['messageReactionAdd', '2', '100', '200', '400', 'novo', null, '👍'],
    ['messageReactionRemove', '2', '100', '200', '400', null, null, 'festa:300'],
  ]);
  assert.deepEqual(received.map(item => item.actor), ['2', '2', '2', '', '2', '2']);
  assert.equal(f.transport.messages.length, 0);
});

test('once usa primeira ocorrência bruta e ignoreBots é configurável', async t => {
  const f = fixture(); t.after(() => f.bot.destroy());
  const hits: string[] = [];
  f.bot.plugin({ name: 'mark', functions: [{ name: 'mark', ...metadata, minArgs: 1, maxArgs: 1,
    execute: async c => { hits.push(await c.text(0)); return ''; } }] });
  f.bot.scriptEvent({ event: 'guildMemberAdd', once: true, code: '$mark[once]' });
  f.bot.scriptEvent({ event: 'guildMemberAdd', code: '$mark[default]' });
  f.bot.scriptEvent({ event: 'guildMemberAdd', ignoreBots: false, code: '$mark[all]' });
  f.bot.client.emit('guildMemberAdd', f.member('3', true));
  f.bot.client.emit('guildMemberAdd', f.member());
  await flush();
  assert.equal(hits.filter(hit => hit === 'once').length, 0);
  assert.equal(hits.filter(hit => hit === 'default').length, 1);
  assert.equal(hits.filter(hit => hit === 'all').length, 2);
  assert.equal(f.errors.length, 0);
});

test('reações preservam o servidor do gateway sem mensagem, membro ou canal em cache', async t => {
  for (const event of ['messageReactionAdd', 'messageReactionRemove'] as const) {
    const f = fixture(); t.after(() => f.bot.destroy());
    f.bot.scriptEvent({ event, code: '$setGuildVar[reactionGuild;$eventGuildID]$eventGuildID' });
    f.bot.client.emit(event, { ...f.reaction(false), member: null });
    await flush();
    assert.equal(f.errors.length, 0);
    assert.equal(f.transport.messages.at(-1)?.channelID, '200');
    assert.equal(f.transport.messages.at(-1)?.payload.content, '100');
    assert.equal(await f.bot.store.read(state => state.variables['["guild","100","reactionGuild"]']), '100');
  }
});

test('mensagens parciais preservam authorId conhecido sem inventar dados do usuário', async t => {
  for (const event of ['messageDelete', 'messageUpdate'] as const) {
    const f = fixture(); t.after(() => f.bot.destroy());
    const received: { actor: string; userName: string | null; userBot: boolean }[] = [];
    f.bot.plugin({ name: 'capturePartialAuthor', functions: [{ name: 'partialAuthor', ...metadata, minArgs: 0, maxArgs: 0,
      execute: c => {
        assert.ok(c.ctx.event);
        received.push({ actor: c.ctx.authorID, userName: c.ctx.event.userName, userBot: c.ctx.event.userBot });
        return '';
      },
    }] });
    f.bot.scriptEvent({ event, code: '$partialAuthor$setUserVar[lastEvent;$eventName]$eventUserID' });
    const partial = new PartialMessage(f.bot.client, { id: '400', channelId: '200', guildId: '100', authorId: '2' });
    if (event === 'messageDelete') f.bot.client.emit(event, partial);
    else f.bot.client.emit(event, null, partial);
    await flush();
    assert.equal(f.errors.length, 0);
    assert.deepEqual(received, [{ actor: '2', userName: null, userBot: false }]);
    assert.equal(f.transport.messages.at(-1)?.payload.content, '2');
    assert.equal(await f.bot.store.read(state => state.variables['["user","2","lastEvent"]']), event);
  }
});

test('plugin compila funções e eventos em staging e falha sem instalar parte do plugin', async t => {
  const f = fixture(); t.after(() => f.bot.destroy());
  const listeners = f.bot.client.listenerCount('guildMemberAdd');
  assert.throws(() => f.bot.plugin({ name: 'atomic',
    functions: [{ name: 'pluginText', ...metadata, minArgs: 0, maxArgs: 0, execute: () => 'plugin' }],
    commands: [{ name: 'staged', code: '$pluginText' }],
    scriptEvents: [{ event: 'guildMemberAdd', code: '$pluginText', channelID: '300' },
      { event: 'guildMemberRemove', code: '$unknownFunction' }],
  }), /desconhecida/);
  assert.equal(f.bot.client.listenerCount('guildMemberAdd'), listeners);
  assert.equal(f.bot.listCommands().length, 0);
  assert.throws(() => f.bot.runtime.compile('$pluginText'), /desconhecida/);
  f.bot.plugin({ name: 'atomic', functions: [{ name: 'pluginText', ...metadata, minArgs: 0, maxArgs: 0, execute: () => 'plugin' }],
    scriptEvents: [{ event: 'guildMemberAdd', code: '$pluginText', channelID: '300' }] });
  f.bot.client.emit('guildMemberAdd', f.member());
  await flush();
  assert.equal(f.transport.messages.at(-1)?.channelID, '300');
  assert.equal(f.transport.messages.at(-1)?.payload.content, 'plugin');
  assert.equal(f.errors.length, 0);
});

test('ausências permanecem null e não autorizam replies de mensagens inexistentes', async t => {
  for (const event of ['guildMemberAdd', 'messageDelete', 'messageUpdate', 'messageReactionRemove'] as const) {
    const f = fixture(); t.after(() => f.bot.destroy());
    f.bot.scriptEvent({ event, code: '$try[$reply[inválido];engolido]' });
    const partial = new PartialMessage(f.bot.client, { id: '400', channelId: '200', guildId: '100' });
    if (event === 'guildMemberAdd') f.bot.client.emit(event, f.member());
    else if (event === 'messageDelete') f.bot.client.emit(event, partial);
    else if (event === 'messageUpdate') f.bot.client.emit(event, null, partial);
    else f.bot.client.emit(event, f.reaction(false));
    await flush();
    assert.equal(f.transport.messages.length, 0);
    assert.equal(f.errors.length, 1);
    assert.ok(f.errors[0]?.error instanceof GuardError);
    assert.equal(f.errors[0]?.ctx?.event?.name, event);
  }
});

test('mensagem completa permite reply literal; canal configurado controla saída automática', async t => {
  const f = fixture(); t.after(() => f.bot.destroy());
  f.bot.scriptEvent({ event: 'messageUpdate', code: '$reply[$eventContent]' });
  f.bot.scriptEvent({ event: 'messageUpdate', code: 'saída', channelID: '300' });
  f.bot.client.emit('messageUpdate', null, f.message('$ban[2;dado do usuário]'));
  await flush();
  assert.equal(f.errors.length, 0);
  assert.equal(f.transport.actions.length, 0);
  assert.deepEqual(f.transport.messages.toSorted((a, b) => a.channelID.localeCompare(b.channelID)).map(item => [item.channelID, item.replyTo, item.payload.content]),
    [['200', '400', '$ban[2;dado do usuário]'], ['300', undefined, 'saída']]);
});

test('membros permitem envio explícito e exigem canal para saída implícita', async t => {
  const f = fixture(); t.after(() => f.bot.destroy());
  f.bot.scriptEvent({ event: 'guildMemberAdd', code: '$let[id;$sendMessage[300;Olá $eventUserID]]' });
  f.bot.scriptEvent({ event: 'guildMemberAdd', code: 'sem destino' });
  f.bot.client.emit('guildMemberAdd', f.member());
  await flush();
  assert.equal(f.transport.messages.length, 1);
  assert.equal(f.transport.messages[0]?.channelID, '300');
  assert.equal(f.transport.messages[0]?.payload.content, 'Olá 2');
  assert.ok(f.errors[0]?.error instanceof GuardError);
});

test('ator do evento tem permissões próprias e falha parcial escapa de try', async t => {
  const f = fixture(); t.after(() => f.bot.destroy());
  f.bot.scriptEvent({ event: 'messageUpdate', code: '$try[$modBan[2;motivo];engolido]' });
  f.bot.client.emit('messageUpdate', null, f.message()); await flush();
  assert.equal(f.transport.actions.length, 0);
  assert.ok(f.errors[0]?.error instanceof GuardError);
  class BrokenStore extends MemoryStore { override async commit(): Promise<void> { throw new Error('disk full'); } }
  const partial = fixture(new BrokenStore()); t.after(() => partial.bot.destroy());
  partial.bot.scriptEvent({ event: 'messageUpdate', actorID: '1', code: '$try[$modBan[2;motivo];engolido]' });
  partial.bot.client.emit('messageUpdate', null, partial.message()); await flush();
  assert.equal(partial.transport.actions.length, 1);
  assert.equal(partial.transport.messages.length, 0);
  assert.ok(partial.errors[0]?.error instanceof PartialModerationError);
  assert.equal(partial.errors[0]?.ctx?.hasModerationEffect, true);
});

test('destroy externo cancela evento ativo, aguarda drenagem e remove listeners', { timeout: 3000 }, async () => {
  const f = fixture();
  let start!: () => void, release!: () => void, stopped = false;
  const ready = new Promise<void>(resolve => { start = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  f.bot.plugin({ name: 'wait', functions: [{ name: 'waitForStop', ...metadata, minArgs: 0, maxArgs: 0, execute: async c => {
    const aborted = new Promise<void>(resolve => c.ctx.signal.addEventListener('abort', () => resolve(), { once: true }));
    start(); await aborted; stopped = true; await gate; return '';
  } }], scriptEvents: [{ event: 'guildMemberAdd', code: '$waitForStop' }] });
  f.bot.client.emit('guildMemberAdd', f.member()); await ready;
  let closed = false;
  const closing = f.bot.destroy().then(() => { closed = true; });
  await flush();
  assert.equal(stopped, true); assert.equal(closed, false);
  assert.equal(f.bot.client.listenerCount('guildMemberAdd'), 0);
  release(); await closing;
  assert.equal(closed, true);
});

test('evento pode pedir destroy sem aguardar a si mesmo', { timeout: 3000 }, async () => {
  const f = fixture(); let ran = false;
  f.bot.plugin({ name: 'close', functions: [{ name: 'closeBot', ...metadata, minArgs: 0, maxArgs: 0,
    execute: async () => { await f.bot.destroy(); ran = true; return ''; } }],
    scriptEvents: [{ event: 'guildMemberAdd', code: '$closeBot' }] });
  f.bot.client.emit('guildMemberAdd', f.member()); await flush(); await f.bot.destroy();
  assert.equal(ran, true);
  assert.throws(() => f.bot.scriptEvent({ event: 'guildMemberAdd', code: '' }), /encerrado/);
});

test('funções de evento recusam contexto de comando e validação rejeita opções inválidas', async t => {
  const f = fixture(); t.after(() => f.bot.destroy());
  for (const definition of [{ event: 'ready', code: '' }, { event: 'guildMemberAdd', code: '', actorID: 'x' },
    { event: 'guildMemberAdd', code: '', channelID: '' }]) {
    assert.throws(() => f.bot.scriptEvent(definition as Parameters<Yuzuha['scriptEvent']>[0]), /inválid/);
  }
  f.bot.command({ name: 'bad', code: '$try[$eventName;engolido]' });
  assert.equal(await f.bot.handle(mockMessage('!bad')), 'guarded');
  assert.match(f.transport.messages.at(-1)?.payload.content ?? '', /contexto de evento/);
  assert.equal(f.errors.length, 0);
});
