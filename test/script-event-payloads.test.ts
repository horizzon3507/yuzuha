import test from 'node:test';
import assert from 'node:assert/strict';
import { Guild, GuildMember, Message, Role, User } from '@fluxerjs/core';
import { Yuzuha, MemoryStore, GuardError, YuzuhaError } from '../src/index.js';
import { functions } from '../src/functions.js';
import type { CommandContext } from '../src/commands/context.js';
import type { ScriptEventName } from '../src/domain/events.js';
import { scriptEventNames } from '../src/framework/script-events.js';
import { MockTransport, mockMessage } from '../src/testing.js';

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const userData = (id = '2', bot = false) => ({ id, username: 'Ana', discriminator: '0000', global_name: null,
  avatar: null, avatar_color: null, flags: 0, bot });

function fixture() {
  const transport = new MockTransport(), errors: { error: unknown; ctx?: CommandContext }[] = [];
  const bot = new Yuzuha({ transport, store: new MemoryStore(), scheduler: false, http: false, engine: functions(),
    onError: (error, ctx) => { errors.push({ error, ctx }); } });
  const seen: { name: string; data: unknown; fields: unknown[]; actor: string }[] = [];
  bot.plugin({ name: 'capture', functions: [{ name: 'capture', description: 'Teste offline.', category: 'test', usage: '$capture',
    minArgs: 0, maxArgs: 8, execute: async c => {
      seen.push({ name: c.ctx.event!.name, data: c.ctx.event!.data, fields: await c.all(), actor: c.ctx.authorID }); return '';
    } }] });
  const listen = (event: ScriptEventName, extra: Partial<Parameters<Yuzuha['scriptEvent']>[0]> = {}) =>
    bot.scriptEvent({ event, code: '$capture[$eventUserID;$eventGuildID;$eventChannelID;$eventMessageID]', ...extra });
  const guild = new Guild(bot.client, { id: '100', name: 'Teste', ownerId: '1' });
  const member = (id = '2', nick: string | null = null) => new GuildMember(bot.client, { user: userData(id), nick,
    roles: [], joined_at: '2026-10-21T00:00:00.000Z', mute: false, deaf: false }, guild);
  const message = (content = 'oi', author = userData()) => new Message(bot.client, { id: '400', channel_id: '200', guild_id: '100',
    author, content, timestamp: '2026-10-21T00:00:00.000Z', type: 0, flags: 0,
    pinned: false, mention_everyone: false, tts: false, mentions: [], mention_roles: [], embeds: [], attachments: [] });
  const emit = (event: string, ...args: unknown[]) => bot.client.emit(event as never, ...args as never[]);
  return { bot, transport, errors, seen, listen, guild, member, message, emit };
}

test('todo evento seguro do SDK é aceito por scriptEvent; debug e WebAuthn ficam fora', async t => {
  const f = fixture(); t.after(() => f.bot.destroy());
  assert.equal(scriptEventNames.length, 64);
  for (const event of scriptEventNames) f.bot.scriptEvent({ event, code: '' });
  for (const event of ['debug', 'webauthnCredentialsUpdate']) {
    assert.throws(() => f.bot.scriptEvent({ event: event as never, code: '' }),
      (err: unknown) => err instanceof YuzuhaError && err.code === 'SCRIPT_EVENT');
  }
});

test('gateway e shards: eventos vazios rodam sem ator, canal nem reply', async t => {
  const f = fixture(); t.after(() => f.bot.destroy());
  for (const event of ['ready', 'resumed', 'shardReady', 'shardDisconnect', 'shardError', 'shardingRequired', 'error'] as const) f.listen(event);
  f.bot.scriptEvent({ event: 'ready', code: '$try[$reply[x];engolido]' });
  f.bot.scriptEvent({ event: 'resumed', code: 'sem destino' });
  f.emit('ready'); f.emit('resumed'); f.emit('shardReady', 0); f.emit('shardDisconnect', 1, 4000);
  f.emit('shardError', 2, Object.assign(new Error('falhou'), { code: 'ECONNRESET' }));
  f.emit('shardingRequired', { shardId: 0, numShards: 2 });
  f.emit('error', new TypeError('ruim'));
  await flush();
  assert.deepEqual(f.seen.map(item => [item.name, item.data, item.fields, item.actor]), [
    ['ready', {}, [null, null, null, null], ''],
    ['resumed', {}, [null, null, null, null], ''],
    ['shardReady', { shardID: 0 }, [null, null, null, null], ''],
    ['shardDisconnect', { shardID: 1, code: 4000 }, [null, null, null, null], ''],
    ['shardError', { shardID: 2, error: { name: 'Error', message: 'falhou', code: 'ECONNRESET' } }, [null, null, null, null], ''],
    ['shardingRequired', { shardID: 0, numShards: 2 }, [null, null, null, null], ''],
    ['error', { error: { name: 'TypeError', message: 'ruim', code: null } }, [null, null, null, null], ''],
  ]);
  assert.equal(f.transport.messages.length, 0);
  const scripted = f.errors.filter(item => item.ctx);
  assert.deepEqual(scripted.map(item => [item.error instanceof GuardError, item.ctx?.event?.name]).toSorted(), [[true, 'ready'], [true, 'resumed']]);
  assert.deepEqual(f.errors.filter(item => !item.ctx).map(item => String(item.error)), ['Error: falhou', 'TypeError: ruim']);
});

test('mensagens: messageCreate ignora bots, permite reply e payloads em lote são limitados', async t => {
  const f = fixture(); t.after(() => f.bot.destroy());
  f.bot.scriptEvent({ event: 'messageCreate', code: '$reply[eco $eventData[message.content]]' });
  f.listen('messageCreate', { ignoreBots: false });
  for (const event of ['messageDeleteBulk', 'messageReactionAddMany', 'messageReactionRemoveAll', 'messageReactionRemoveEmoji'] as const) f.listen(event);
  f.emit('messageCreate', f.message('$ban[2]'));
  f.emit('messageCreate', f.message('robô', userData('9', true)));
  f.emit('messageDeleteBulk', { ids: Array.from({ length: 150 }, (_, i) => String(i)), channelId: '200', guildId: '100', messages: [] });
  f.emit('messageReactionAddMany', { messageId: '400', channelId: '200', guildId: '100', message: null,
    reactions: [{ userId: '2', emoji: { id: null, name: '👍' } }] });
  f.emit('messageReactionRemoveAll', { messageId: '400', channelId: '200', guildId: null, message: null });
  f.emit('messageReactionRemoveEmoji', { messageId: '400', channelId: '200', guildId: '100', emoji: { id: '7', name: 'festa', animated: true }, message: null });
  await flush();
  assert.equal(f.errors.length, 0);
  assert.deepEqual(f.transport.messages.map(item => [item.replyTo, item.payload.content]), [['400', 'eco $ban[2]']]);
  assert.deepEqual(f.transport.actions, []);
  assert.deepEqual(f.seen.map(item => item.name), ['messageCreate', 'messageCreate', 'messageDeleteBulk', 'messageReactionAddMany',
    'messageReactionRemoveAll', 'messageReactionRemoveEmoji']);
  assert.deepEqual(f.seen[1]?.data, { message: { id: '400', channelID: '200', guildID: '100', authorID: '9', content: 'robô', partial: false } });
  const bulk = f.seen[2]?.data as { ids: string[]; count: number; messagesCount: number };
  assert.equal(bulk.ids.length, 100); assert.equal(bulk.count, 150); assert.equal(bulk.messagesCount, 0);
  assert.deepEqual(f.seen[3]?.data, { messageID: '400', channelID: '200', guildID: '100', message: null,
    reactions: [{ userID: '2', emoji: { id: null, name: '👍', animated: false } }], reactionsCount: 1 });
  assert.deepEqual(f.seen[4]?.fields, [null, null, '200', '400']);
  assert.deepEqual((f.seen[5]?.data as { emoji: unknown }).emoji, { id: '7', name: 'festa', animated: true });
});

test('guilds, canais e threads: old/new parciais, eventos sem canal e saída configurada', async t => {
  const f = fixture(); t.after(() => f.bot.destroy());
  f.listen('guildUpdate'); f.listen('channelUpdate'); f.listen('threadMembersUpdate'); f.listen('forumUnreads');
  f.bot.scriptEvent({ event: 'guildCreate', code: 'Entrei em $eventData[guild.name]', channelID: '300' });
  f.bot.scriptEvent({ event: 'guildDelete', code: 'sem canal' });
  f.emit('guildUpdate', f.guild, new Guild(f.bot.client, { id: '100', name: 'Novo', ownerId: '1' }));
  f.emit('channelUpdate', { id: '200', name: null, type: 0, guildId: '100' }, { id: '200', name: 'geral', type: 0, guildId: '100', parentId: '50' });
  f.emit('threadMembersUpdate', { id: '600', guildId: '100', memberCount: 3, removedMemberIds: ['5'], addedMembers: [{ id: '600', userId: '2', flags: 0 }] });
  f.emit('forumUnreads', { guildId: '100', channelId: '200', threads: [{ threadId: '600', count: 2 }] });
  f.emit('guildCreate', f.guild); f.emit('guildDelete', f.guild);
  await flush();
  assert.equal(f.transport.messages.at(-1)?.channelID, '300');
  assert.equal(f.transport.messages.at(-1)?.payload.content, 'Entrei em Teste');
  assert.ok(f.errors.length === 1 && f.errors[0]?.error instanceof GuardError && f.errors[0].ctx?.event?.name === 'guildDelete');
  const [guildUpdate, channelUpdate, threadMembers, forum] = f.seen;
  assert.deepEqual([(guildUpdate?.data as { old: { name: string } }).old.name, (guildUpdate?.data as { new: { name: string } }).new.name], ['Teste', 'Novo']);
  assert.deepEqual(guildUpdate?.fields, [null, '100', null, null]);
  assert.equal((channelUpdate?.data as { old: { name: null } }).old.name, null);
  assert.equal((channelUpdate?.data as { new: { parentID: string } }).new.parentID, '50');
  assert.deepEqual(threadMembers?.data, { threadID: '600', guildID: '100', memberCount: 3, removedMemberIDs: ['5'],
    addedMembers: [{ threadID: '600', userID: '2', flags: 0, joinedAt: null }], addedMembersCount: 1 });
  assert.deepEqual(forum?.data, { guildID: '100', channelID: '200', threads: [{ threadID: '600', count: 2, missing: false }], threadsCount: 1 });
});

test('membros, bans, cargos e expressões expõem estado normalizado e ator do evento', async t => {
  const f = fixture(); t.after(() => f.bot.destroy());
  for (const event of ['guildMemberUpdate', 'guildBanAdd', 'guildRoleDelete', 'guildEmojisUpdate', 'guildMembersChunk'] as const) f.listen(event);
  f.bot.scriptEvent({ event: 'guildBanAdd', code: '$try[$modBan[3;vingança];engolido]' });
  f.emit('guildMemberUpdate', null, f.member('2', 'Aninha'));
  f.emit('guildBanAdd', { guildId: '100', user: new User(f.bot.client, userData('3')), reason: 'spam', expiresAt: null });
  const role = new Role(f.bot.client, { id: '700', name: 'Mod', color: 0, position: 1, permissions: '8', hoist: false, mentionable: false } as never, '100');
  f.emit('guildRoleDelete', role, '100', '700');
  f.emit('guildEmojisUpdate', { guildId: '100', emojis: Array.from({ length: 120 }, (_, i) => ({ id: String(i), name: `e${i}` })) });
  f.emit('guildMembersChunk', { guildId: '100', members: [], chunkIndex: 0, chunkCount: 1, notFound: ['8'] });
  await flush();
  const [memberUpdate, ban, roleDelete, emojis, chunk] = f.seen;
  assert.equal((memberUpdate?.data as { old: null }).old, null);
  assert.equal((memberUpdate?.data as { new: { nick: string } }).new.nick, 'Aninha');
  assert.equal(memberUpdate?.actor, '2');
  assert.deepEqual(ban?.data, { guildID: '100', user: { id: '3', username: 'Ana', globalName: null, bot: false, avatar: null }, reason: 'spam', expiresAt: null });
  assert.equal(ban?.actor, '3');
  assert.equal(f.transport.actions.length, 0);
  assert.ok(f.errors.length === 1 && f.errors[0]?.error instanceof GuardError);
  assert.equal((roleDelete?.data as { roleID: string }).roleID, '700');
  assert.match((roleDelete?.data as { role: { permissions: string } }).role.permissions, /^\d+$/);
  assert.deepEqual([(emojis?.data as { emojis: unknown[] }).emojis.length, (emojis?.data as { emojisCount: number }).emojisCount], [100, 120]);
  assert.deepEqual(chunk?.data, { guildID: '100', chunkIndex: 0, chunkCount: 1, notFound: ['8'], nonce: null, members: [], membersCount: 0 });
});

test('voz: tokens, endpoints, session_id, connection_id e chaves E2EE nunca chegam ao script', async t => {
  const f = fixture(); t.after(() => f.bot.destroy());
  for (const event of ['voiceStateUpdate', 'voiceServerUpdate', 'voiceStateAck', 'voiceStatesSync', 'entranceSoundPlay'] as const) {
    f.bot.scriptEvent({ event, code: '$capture[$jsonEncode[$eventData]]' });
  }
  const state = { guild_id: '100', channel_id: '200', user_id: '2', session_id: 'SESSAO-SECRETA', connection_id: 'CONEXAO-SECRETA',
    viewer_stream_keys: ['CHAVE-STREAM'], mute: false, deaf: false, self_mute: true, self_deaf: false, member: { nick: 'Ana', user: userData() } };
  f.emit('voiceStateUpdate', state);
  f.emit('voiceServerUpdate', { guild_id: '100', channel_id: '200', token: 'TOKEN-SECRETO', endpoint: 'voz.example:443',
    connection_id: 'CONEXAO-SECRETA', e2ee_key: 'E2EE-SECRETA' });
  f.emit('voiceStateAck', { guild_id: '100', channel_id: '200', status: 'ok', connection_id: 'CONEXAO-SECRETA', canonical_state: state });
  f.emit('voiceStatesSync', { guildId: '100', voiceStates: [state] });
  f.emit('entranceSoundPlay', { guild_id: '100', channel_id: '200', user_id: '2', sound_id: '9', url: 'https://cdn.example/s.ogg', duration_ms: 900 });
  await flush();
  assert.equal(f.errors.length, 0);
  assert.equal(f.seen.length, 5);
  for (const item of f.seen) {
    const text = JSON.stringify(item);
    for (const secret of ['SECRETA', 'SECRETO', 'CHAVE-STREAM', 'voz.example']) assert.equal(text.includes(secret), false, `${item.name} vazou ${secret}`);
  }
  assert.deepEqual(f.seen[1]?.data, { guildID: '100', channelID: '200', hasEndpoint: true, redacted: true });
  assert.equal(JSON.parse(String(f.seen[0]?.fields[0])).state.selfMute, true);
  assert.equal(f.seen[0]?.actor, '2');
});

test('presença, digitação, usuário, convites, webhooks e auditoria', async t => {
  const f = fixture(); t.after(() => f.bot.destroy());
  for (const event of ['presenceUpdate', 'typingStart', 'inviteCreate', 'webhooksUpdate', 'guildAuditLogEntryCreate', 'userConnectionsUpdate'] as const) f.listen(event);
  f.listen('userUpdate');
  f.listen('userUpdate', { ignoreBots: false });
  f.emit('presenceUpdate', { userId: '2', guildId: '100', status: 'online', activities: [{ name: 'Jogo', type: 0 }], customStatus: { text: 'oi' } });
  f.emit('typingStart', { channelId: '200', guildId: null, userId: '2', timestamp: 1 });
  f.emit('inviteCreate', { code: 'abc', type: 0, guildSnapshot: { id: '100' }, channelSnapshot: { id: '200' }, inviter: new User(f.bot.client, userData()), uses: 0, maxUses: 5 });
  f.emit('webhooksUpdate', { channelId: '200', guildId: '100' });
  f.emit('guildAuditLogEntryCreate', { id: '1', guildId: '100', actionType: 22, userId: '1', targetId: '2', reason: null,
    options: { delete_member_days: '1', nested: { secret: 'x' } }, changes: [{ key: 'nick', oldValue: 'a', newValue: { obj: true } }] });
  f.emit('userConnectionsUpdate', { connections: [{ id: 'interno', type: 'github', name: 'ana', verified: true, access_token: 'segredo' }] });
  f.emit('userUpdate', new User(f.bot.client, userData('1', true)));
  await flush();
  assert.equal(f.errors.length, 0);
  assert.deepEqual(f.seen.map(item => item.name), ['presenceUpdate', 'typingStart', 'inviteCreate', 'webhooksUpdate',
    'guildAuditLogEntryCreate', 'userConnectionsUpdate', 'userUpdate']);
  assert.deepEqual(f.seen[0]?.data, { presence: { userID: '2', guildID: '100', status: 'online', activities: [{ name: 'Jogo', type: 0, url: null }],
    customStatus: { text: 'oi', emojiID: null, emojiName: null } } });
  assert.deepEqual(f.seen[1]?.fields, ['2', null, '200', null]);
  assert.deepEqual((f.seen[2]?.data as { maxUses: number; inviter: { id: string } }).maxUses, 5);
  assert.deepEqual(f.seen[4]?.data, { id: '1', guildID: '100', actionType: 22, userID: '1', targetID: '2', reason: null,
    options: { delete_member_days: '1', nested: null }, changes: [{ key: 'nick', oldValue: 'a', newValue: null }], changesCount: 1 });
  assert.deepEqual(f.seen[5]?.data, { connections: [{ type: 'github', name: 'ana', verified: true }], connectionsCount: 1 });
  assert.equal((f.seen[6]?.data as { user: { bot: boolean } }).user.bot, true);
});

test('$eventData lê caminhos, aplica padrão, recusa caminho inválido, comando comum e mutação', async t => {
  const f = fixture(); t.after(() => f.bot.destroy());
  f.bot.scriptEvent({ event: 'guildUpdate', code: '$capture[$eventData[new.name];$eventData[old.ausente;padrão];$eventData[__proto__];$jsonGet[$jsonSet[$eventData;new.name;x];new.name];$eventData[new.name]]' });
  f.bot.scriptEvent({ event: 'guildUpdate', code: '$try[$eventData[a..b];engolido]' });
  f.emit('guildUpdate', null, f.guild);
  await flush();
  assert.deepEqual(f.seen[0]?.fields, ['Teste', 'padrão', null, 'x', 'Teste']);
  assert.equal(Object.isFrozen((f.seen[0]?.data as { new: object }).new), true);
  f.bot.command({ name: 'bad', code: '$try[$eventData;engolido]' });
  assert.equal(await f.bot.handle(mockMessage('!bad')), 'guarded');
  assert.match(f.transport.messages.at(-1)?.payload.content ?? '', /contexto de evento/);
});
