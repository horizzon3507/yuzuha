import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ChannelType,
  DMChannel,
  Events,
  Guild,
  GuildBan,
  GuildMember,
  Invite,
  InviteType,
  Message,
  MessageReaction,
  PartialGuildMember,
  PartialMessage,
  PermissionFlags,
  Role,
  TextChannel,
  ThreadChannel,
  ThreadMember,
  User,
} from '@fluxerjs/core';
import {
  EventContext,
  GuardError,
  MemoryStore,
  Yuzuha,
  YuzuhaError,
  adaptClientEvent,
  currentExecution,
  defineContextEvent,
} from '../src/index.js';
import type { CommandContext, ErrorReportInfo, ExecutionStore, LogRecord } from '../src/index.js';
import { functions } from '../src/functions.js';
import { MockTransport, mockResources } from '../src/testing.js';

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

const apiUser = (id = '2', bot = false, username = 'Ana') => ({
  id,
  username,
  discriminator: '0000',
  global_name: null,
  avatar: null,
  avatar_color: null,
  flags: 0,
  bot,
});

function createSdkFixtures(bot: Yuzuha) {
  const client = bot.client;
  const guild = new Guild(client, { id: '100', name: 'Servidor', ownerId: '1' });
  const textChannel = new TextChannel(client, {
    id: '200',
    guild_id: '100',
    type: ChannelType.GuildText,
    name: 'geral',
  });
  const dmChannel = new DMChannel(client, {
    id: '250',
    type: ChannelType.DM,
    recipients: [apiUser('2')],
  });
  const thread = new ThreadChannel(client, {
    id: '260',
    guild_id: '100',
    parent_id: '200',
    owner_id: '2',
    type: ChannelType.PublicThread,
    name: 'topico',
  });
  const threadMember = new ThreadMember({
    id: '260',
    user_id: '2',
    join_timestamp: '2026-10-21T00:00:00.000Z',
    flags: 0,
  });
  const member = (id = '2', botAccount = false) => new GuildMember(client, {
    user: apiUser(id, botAccount),
    roles: [],
    joined_at: '2026-10-21T00:00:00.000Z',
    mute: false,
    deaf: false,
  }, guild);
  const message = (content = 'olá mundo', id = '400', botAccount = false) => new Message(client, {
    id,
    channel_id: '200',
    guild_id: '100',
    author: apiUser(botAccount ? '9' : '2', botAccount, botAccount ? 'Robo' : 'Ana'),
    content,
    timestamp: '2026-10-21T00:00:00.000Z',
    type: 0,
    flags: 0,
    pinned: false,
    mention_everyone: false,
    tts: false,
    mentions: [],
    mention_roles: [],
    embeds: [],
    attachments: [],
  });
  const role = (name = 'Moderador', id = '500') => new Role(client, {
    id,
    name,
    color: 0,
    hoist: false,
    position: 1,
    permissions: '0',
    mentionable: false,
  }, '100');
  const ban = (botAccount = false) => new GuildBan(client, {
    user: apiUser(botAccount ? '9' : '2', botAccount, botAccount ? 'Robo' : 'Ana'),
    reason: 'spam',
    guild_id: '100',
  }, '100');
  const invite = (botInviter = false) => new Invite(client, {
    code: 'abc123',
    type: InviteType.Guild,
    guild: { id: '100', name: 'Servidor', icon: null, banner: null, splash: null, features: [] },
    channel: { id: '200', name: 'geral', type: ChannelType.GuildText },
    inviter: apiUser(botInviter ? '9' : '2', botInviter, botInviter ? 'Robo' : 'Ana'),
  });
  return { client, guild, textChannel, dmChannel, thread, threadMember, member, message, role, ban, invite };
}

test('adaptClientEvent e bot.contextEvent normalizam mais de 15 famílias distintas de eventos do SDK', async t => {
  const transport = new MockTransport();
  const bot = new Yuzuha({ transport, store: new MemoryStore(), scheduler: false, http: false });
  t.after(() => bot.destroy());
  const fx = createSdkFixtures(bot);

  const captured = new Map<string, {
    guildID: string | null;
    channelID: string | null;
    userID: string | null;
    userName: string | null;
    userBot: boolean;
    messageID: string | null;
    content: string | null;
    oldContent: string | null;
    emoji: string | null;
    hasMessage: boolean;
    argCount: number;
  }>();

  const record = <K extends keyof import('@fluxerjs/core').ClientEvents>(event: K) => {
    bot.contextEvent({
      event,
      ignoreBots: false,
      run(ctx, ...args) {
        assert.equal(ctx.event.name, event);
        assert.equal(Object.isFrozen(ctx.event), true);
        assert.equal(Object.isFrozen(ctx.eventArgs), true);
        assert.equal(ctx.eventArgs.length, args.length);
        let hasMessage = false;
        try {
          void ctx.message;
          hasMessage = true;
        } catch {
          hasMessage = false;
        }
        captured.set(event, {
          guildID: ctx.event.guildID,
          channelID: ctx.event.channelID,
          userID: ctx.event.userID,
          userName: ctx.event.userName,
          userBot: ctx.event.userBot,
          messageID: ctx.event.messageID,
          content: ctx.event.content,
          oldContent: ctx.event.oldContent,
          emoji: ctx.event.emoji,
          hasMessage,
          argCount: args.length,
        });
      },
    });
  };

  // 15+ famílias distintas de eventos do @fluxerjs/core
  record('messageCreate');
  record('messageUpdate');
  record('messageDelete');
  record('messageDeleteBulk');
  record('messageReactionAdd');
  record('messageReactionRemoveEmoji');
  record('messageReactionRemoveAll');
  record('guildCreate');
  record('guildUpdate');
  record('guildDelete');
  record('channelCreate');
  record('channelUpdate');
  record('channelDelete');
  record('threadCreate');
  record('threadMemberUpdate');
  record('threadMembersUpdate');
  record('guildMemberAdd');
  record('guildMemberUpdate');
  record('guildMemberRemove');
  record('guildBanAdd');
  record('guildRoleCreate');
  record('guildRoleUpdate');
  record('guildRoleDelete');
  record('voiceStateUpdate');
  record('voiceServerUpdate');
  record('typingStart');
  record('inviteCreate');
  record('inviteDelete');
  record('webhooksUpdate');
  record('channelPinsUpdate');
  record('channelRecipientAdd');
  record('userUpdate');
  record('presenceUpdate');
  record('guildAuditLogEntryCreate');
  record('ready');
  record('shardDisconnect');

  const msg = fx.message('conteúdo novo');
  bot.client.emit(Events.MessageCreate, msg);
  bot.client.emit(Events.MessageUpdate, fx.message('conteúdo antigo'), msg);
  bot.client.emit(Events.MessageDelete, new PartialMessage(bot.client, { id: '401', channelId: '200', guildId: '100', authorId: '2' }));
  bot.client.emit(Events.MessageDeleteBulk, { ids: ['401', '402'], channelId: '200', guildId: '100', channel: fx.textChannel, messages: [] });
  bot.client.emit(Events.MessageReactionAdd, {
    reaction: new MessageReaction(bot.client, { channel_id: '200', message_id: '400', guild_id: '100', user_id: '2', emoji: { name: '🔥' } }),
    user: new User(bot.client, apiUser('2')),
    message: msg,
    channel: fx.textChannel,
    member: fx.member('2'),
    messageId: '400',
    channelId: '200',
    emoji: { name: '🔥' },
    userId: '2',
  });
  bot.client.emit(Events.MessageReactionRemoveEmoji, {
    messageId: '400',
    channelId: '200',
    guildId: '100',
    emoji: { id: '777', name: 'festa' },
    message: null,
    channel: fx.textChannel,
  });
  bot.client.emit(Events.MessageReactionRemoveAll, {
    messageId: '400',
    channelId: '200',
    guildId: '100',
    message: msg,
    channel: fx.textChannel,
  });
  bot.client.emit(Events.GuildCreate, fx.guild);
  bot.client.emit(Events.GuildUpdate, fx.guild, new Guild(bot.client, { id: '100', name: 'Renomeado', ownerId: '1' }));
  bot.client.emit(Events.GuildDelete, fx.guild);
  bot.client.emit(Events.ChannelCreate, fx.textChannel);
  bot.client.emit(Events.ChannelUpdate, fx.textChannel, fx.textChannel);
  bot.client.emit(Events.ChannelDelete, fx.dmChannel);
  bot.client.emit(Events.ThreadCreate, fx.thread);
  bot.client.emit(Events.ThreadMemberUpdate, fx.threadMember);
  bot.client.emit(Events.ThreadMembersUpdate, { id: '260', guildId: '100', memberCount: 3, addedMembers: [fx.threadMember], removedMemberIds: [] });
  bot.client.emit(Events.GuildMemberAdd, fx.member('2'));
  bot.client.emit(Events.GuildMemberUpdate, null, fx.member('2'));
  bot.client.emit(Events.GuildMemberRemove, new PartialGuildMember({ client: bot.client, id: '2', user: new User(bot.client, apiUser('2')), guild: fx.guild }));
  bot.client.emit(Events.GuildBanAdd, fx.ban());
  bot.client.emit(Events.GuildRoleCreate, fx.role());
  bot.client.emit(Events.GuildRoleUpdate, null, fx.role('Admin', '501'));
  bot.client.emit(Events.GuildRoleDelete, null, '100', '501');
  bot.client.emit(Events.VoiceStateUpdate, {
    guild_id: '100',
    channel_id: '210',
    user_id: '2',
    mute: false,
    deaf: false,
    member: { user: apiUser('2'), roles: [], joined_at: '2026-10-21T00:00:00.000Z', mute: false, deaf: false },
  });
  bot.client.emit(Events.VoiceServerUpdate, { token: 'tok', guild_id: '100', channel_id: '210', endpoint: 'voice.example.com' });
  bot.client.emit(Events.TypingStart, { channelId: '200', guildId: '100', userId: '2', timestamp: 1_700_000_000 });
  bot.client.emit(Events.InviteCreate, fx.invite());
  bot.client.emit(Events.InviteDelete, { code: 'abc123', guildId: '100', channelId: '200' });
  bot.client.emit(Events.WebhooksUpdate, { guildId: '100', channelId: '200' });
  bot.client.emit(Events.ChannelPinsUpdate, { guildId: '100', channelId: '200', lastPinTimestamp: null });
  bot.client.emit(Events.ChannelRecipientAdd, { channelId: '250', user: new User(bot.client, apiUser('2')) });
  bot.client.emit(Events.UserUpdate, new User(bot.client, apiUser('2')));
  bot.client.emit(Events.PresenceUpdate, { userId: '2', guildId: '100', status: 'online', activities: [], customStatus: null });
  bot.client.emit(Events.GuildAuditLogEntryCreate, {
    id: '900',
    actionType: 1,
    userId: '1',
    targetId: '2',
    reason: 'auditoria',
    options: null,
    changes: [],
    guildId: '100',
  });
  bot.client.emit(Events.Ready);
  bot.client.emit(Events.ShardDisconnect, 0, 1006);

  await flush();

  assert.equal(captured.size, 36);
  assert.deepEqual(captured.get('messageCreate'), {
    guildID: '100', channelID: '200', userID: '2', userName: 'Ana', userBot: false,
    messageID: '400', content: 'conteúdo novo', oldContent: null, emoji: null, hasMessage: true, argCount: 1,
  });
  assert.deepEqual(captured.get('messageUpdate'), {
    guildID: '100', channelID: '200', userID: '2', userName: 'Ana', userBot: false,
    messageID: '400', content: 'conteúdo novo', oldContent: 'conteúdo antigo', emoji: null, hasMessage: true, argCount: 2,
  });
  assert.deepEqual(captured.get('messageDelete'), {
    guildID: '100', channelID: '200', userID: '2', userName: null, userBot: false,
    messageID: '401', content: null, oldContent: null, emoji: null, hasMessage: false, argCount: 1,
  });
  assert.deepEqual(captured.get('messageDeleteBulk'), {
    guildID: '100', channelID: '200', userID: null, userName: null, userBot: false,
    messageID: null, content: null, oldContent: null, emoji: null, hasMessage: false, argCount: 1,
  });
  assert.deepEqual(captured.get('messageReactionAdd'), {
    guildID: '100', channelID: '200', userID: '2', userName: 'Ana', userBot: false,
    messageID: '400', content: 'conteúdo novo', oldContent: null, emoji: '🔥', hasMessage: true, argCount: 1,
  });
  assert.deepEqual(captured.get('messageReactionRemoveEmoji'), {
    guildID: '100', channelID: '200', userID: null, userName: null, userBot: false,
    messageID: '400', content: null, oldContent: null, emoji: 'festa:777', hasMessage: false, argCount: 1,
  });
  assert.deepEqual(captured.get('messageReactionRemoveAll')?.hasMessage, true);
  assert.equal(captured.get('guildCreate')?.guildID, '100');
  assert.equal(captured.get('guildUpdate')?.argCount, 2);
  assert.equal(captured.get('guildDelete')?.guildID, '100');
  assert.deepEqual([captured.get('channelCreate')?.guildID, captured.get('channelCreate')?.channelID], ['100', '200']);
  assert.deepEqual([captured.get('channelDelete')?.guildID, captured.get('channelDelete')?.channelID], [null, '250']);
  assert.deepEqual([captured.get('threadCreate')?.guildID, captured.get('threadCreate')?.channelID, captured.get('threadCreate')?.userID], ['100', '260', '2']);
  assert.deepEqual([captured.get('threadMemberUpdate')?.channelID, captured.get('threadMemberUpdate')?.userID], ['260', '2']);
  assert.deepEqual([captured.get('threadMembersUpdate')?.guildID, captured.get('threadMembersUpdate')?.channelID], ['100', '260']);
  assert.deepEqual([captured.get('guildMemberUpdate')?.guildID, captured.get('guildMemberUpdate')?.userID, captured.get('guildMemberUpdate')?.userName], ['100', '2', 'Ana']);
  assert.deepEqual([captured.get('guildBanAdd')?.guildID, captured.get('guildBanAdd')?.userID, captured.get('guildBanAdd')?.userName], ['100', '2', 'Ana']);
  assert.equal(captured.get('guildRoleCreate')?.guildID, '100');
  assert.equal(captured.get('guildRoleUpdate')?.guildID, '100');
  assert.deepEqual([captured.get('guildRoleDelete')?.guildID, captured.get('guildRoleDelete')?.argCount], ['100', 3]);
  assert.deepEqual([captured.get('voiceStateUpdate')?.guildID, captured.get('voiceStateUpdate')?.channelID, captured.get('voiceStateUpdate')?.userID, captured.get('voiceStateUpdate')?.userName], ['100', '210', '2', 'Ana']);
  assert.deepEqual([captured.get('voiceServerUpdate')?.guildID, captured.get('voiceServerUpdate')?.channelID], ['100', '210']);
  assert.deepEqual([captured.get('typingStart')?.guildID, captured.get('typingStart')?.channelID, captured.get('typingStart')?.userID], ['100', '200', '2']);
  assert.deepEqual([captured.get('inviteCreate')?.guildID, captured.get('inviteCreate')?.channelID, captured.get('inviteCreate')?.userID, captured.get('inviteCreate')?.userName], ['100', '200', '2', 'Ana']);
  assert.deepEqual([captured.get('inviteDelete')?.guildID, captured.get('inviteDelete')?.channelID], ['100', '200']);
  assert.deepEqual([captured.get('webhooksUpdate')?.guildID, captured.get('webhooksUpdate')?.channelID], ['100', '200']);
  assert.deepEqual([captured.get('channelPinsUpdate')?.guildID, captured.get('channelPinsUpdate')?.channelID], ['100', '200']);
  assert.deepEqual([captured.get('channelRecipientAdd')?.channelID, captured.get('channelRecipientAdd')?.userID], ['250', '2']);
  assert.deepEqual([captured.get('userUpdate')?.userID, captured.get('userUpdate')?.userName], ['2', 'Ana']);
  assert.deepEqual([captured.get('presenceUpdate')?.guildID, captured.get('presenceUpdate')?.userID], ['100', '2']);
  assert.deepEqual([captured.get('guildAuditLogEntryCreate')?.guildID, captured.get('guildAuditLogEntryCreate')?.userID], ['100', '1']);
  assert.deepEqual([captured.get('ready')?.guildID, captured.get('ready')?.argCount], [null, 0]);
  assert.deepEqual([captured.get('shardDisconnect')?.guildID, captured.get('shardDisconnect')?.argCount], [null, 2]);

  // Verifica também variantes secundárias diretamente em adaptClientEvent
  assert.equal(adaptClientEvent('voiceStateAck', [{ guild_id: null, channel_id: null, canonical_state: { guild_id: '100', channel_id: '210', user_id: '2', mute: false, deaf: false, self_mute: false, self_deaf: false } }]).event.userID, '2');
  assert.equal(adaptClientEvent('entranceSoundPlay', [{ user_id: '2', channel_id: '210', guild_id: '100', sound_id: '1', hash: 'h', url: 'https://example.com/s.ogg', duration_ms: 500, content_type: 'audio/ogg' }]).event.channelID, '210');
  assert.equal(adaptClientEvent('voiceStatesSync', [{ guildId: '100', voiceStates: [] }]).event.guildID, '100');
  assert.equal(adaptClientEvent('forumUnreads', [{ guildId: '100', channelId: '200', threads: [] }]).event.channelID, '200');
  assert.equal(adaptClientEvent('threadListSync', [{ guildId: '100', channelIds: ['200'], threads: [] }]).event.channelID, '200');
  assert.equal(adaptClientEvent('guildCountsUpdate', [{ counts: [{ guildId: '100', memberCount: 10, onlineCount: 5 }] }]).event.guildID, '100');
  assert.equal(adaptClientEvent('channelMemberCountsUpdate', [{ counts: [{ guildId: '100', channelId: '200', memberCount: 4, onlineCount: 2 }] }]).event.channelID, '200');
});

test('inferência estática de ...args, ctx.event.name e ctx.eventArgs funciona em eventos 0-arg, 1-arg, 2-arg e 3-arg', async t => {
  const transport = new MockTransport();
  const bot = new Yuzuha({ transport, store: new MemoryStore(), scheduler: false, http: false });
  t.after(() => bot.destroy());
  const fx = createSdkFixtures(bot);
  const log: string[] = [];

  bot.contextEvent({
    event: 'guildRoleDelete',
    run(ctx, role, guildId, roleId) {
      const nameCheck: 'guildRoleDelete' = ctx.event.name;
      const tupleCheck: readonly [Role | null, string, string] = ctx.eventArgs;
      assert.equal(nameCheck, 'guildRoleDelete');
      assert.equal(tupleCheck[1], guildId);
      log.push(`role:${role?.name ?? 'uncached'}:${guildId}:${roleId}`);
    },
  });

  bot.contextEvent({
    event: 'messageCreate',
    async run(ctx, rawMessage) {
      const nameCheck: 'messageCreate' = ctx.event.name;
      const msgCheck: Message = rawMessage;
      assert.equal(nameCheck, 'messageCreate');
      assert.equal(ctx.nativeMessage, msgCheck);
      assert.equal(ctx.client, bot.client);
      await ctx.reply(`eco:${msgCheck.content}`);
    },
  });

  bot.contextEvent({
    event: 'ready',
    channelID: '200',
    async run(ctx, ...empty) {
      const none: [] = empty;
      const argsTuple: readonly [] = ctx.eventArgs;
      assert.equal(none.length, 0);
      assert.equal(argsTuple.length, 0);
      await ctx.send('bot pronto');
    },
  });

  bot.contextEvent({
    event: 'resumed',
    async run(ctx) {
      await assert.rejects(
        async () => ctx.send('sem destino'),
        (err: unknown) => err instanceof GuardError && err.reason === 'INVALID_ARGUMENT',
      );
      log.push('resumed:no-channel-guarded');
    },
  });

  if (false) {
    // @ts-expect-error evento inexistente não pertence a ClientEventName
    bot.contextEvent({ event: 'eventoInexistente', run() {} });
    // @ts-expect-error defineContextEvent também valida ClientEventName em tempo de compilação
    defineContextEvent({ event: 'eventoInexistente', run() {} });
  }

  bot.client.emit(Events.GuildRoleDelete, fx.role('VIP', '555'), '100', '555');
  bot.client.emit(Events.MessageCreate, fx.message('ping'));
  bot.client.emit(Events.Ready);
  bot.client.emit(Events.Resumed);
  await flush();

  assert.deepEqual(log, ['role:VIP:100:555', 'resumed:no-channel-guarded']);
  assert.deepEqual(
    transport.messages.map(m => [m.channelID, m.replyTo, m.payload.content]),
    [
      ['200', '400', 'eco:ping'],
      ['200', undefined, 'bot pronto'],
    ],
  );
});

test('ignoreBots descarta bots por padrão em novas famílias e permite optar por ignoreBots: false', async t => {
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false, http: false });
  t.after(() => bot.destroy());
  const fx = createSdkFixtures(bot);

  const hits: string[] = [];
  bot.contextEvent({
    event: 'messageCreate',
    run(_ctx, msg) { hits.push(`msg:default:${msg.author.id}`); },
  });
  bot.contextEvent({
    event: 'messageCreate',
    ignoreBots: false,
    run(_ctx, msg) { hits.push(`msg:all:${msg.author.id}`); },
  });
  bot.contextEvent({
    event: 'inviteCreate',
    run(_ctx, inv) { hits.push(`inv:default:${inv.inviter?.id}`); },
  });
  bot.contextEvent({
    event: 'inviteCreate',
    ignoreBots: false,
    run(_ctx, inv) { hits.push(`inv:all:${inv.inviter?.id}`); },
  });
  bot.contextEvent({
    event: 'voiceStateUpdate',
    run(_ctx, state) { hits.push(`voice:default:${state.user_id}`); },
  });
  bot.contextEvent({
    event: 'voiceStateUpdate',
    ignoreBots: false,
    run(_ctx, state) { hits.push(`voice:all:${state.user_id}`); },
  });

  bot.client.emit(Events.MessageCreate, fx.message('bot msg', '410', true));
  bot.client.emit(Events.MessageCreate, fx.message('human msg', '411', false));
  bot.client.emit(Events.InviteCreate, fx.invite(true));
  bot.client.emit(Events.InviteCreate, fx.invite(false));
  bot.client.emit(Events.VoiceStateUpdate, {
    guild_id: '100',
    channel_id: '210',
    user_id: '9',
    mute: false,
    deaf: false,
    member: { user: apiUser('9', true, 'Robo'), roles: [], joined_at: '2026-10-21T00:00:00.000Z', mute: false, deaf: false },
  });
  bot.client.emit(Events.VoiceStateUpdate, {
    guild_id: '100',
    channel_id: '210',
    user_id: '2',
    mute: false,
    deaf: false,
    member: { user: apiUser('2', false, 'Ana'), roles: [], joined_at: '2026-10-21T00:00:00.000Z', mute: false, deaf: false },
  });

  await flush();

  assert.deepEqual(hits, [
    'msg:all:9',
    'msg:default:2',
    'msg:all:2',
    'inv:all:9',
    'inv:default:2',
    'inv:all:2',
    'voice:all:9',
    'voice:default:2',
    'voice:all:2',
  ]);
});

test('overrides de channelID/actorID e autorização de ctx.resources usam guildID e actorID normalizados', async t => {
  const transport = new MockTransport();
  transport.members.set('100:1', {
    id: '1',
    owner: true,
    permissions: PermissionFlags.Administrator,
    rank: 10,
  });
  transport.members.set('100:2', {
    id: '2',
    owner: false,
    permissions: PermissionFlags.SendMessages,
    rank: 1,
  });
  transport.members.set(`100:${transport.botID}`, {
    id: transport.botID,
    owner: false,
    permissions: PermissionFlags.ManageChannels | PermissionFlags.ManageWebhooks | PermissionFlags.ManageRoles,
    rank: 8,
  });

  const editedChannels: string[] = [];
  const listedWebhooks: string[] = [];
  const resources = mockResources({
    channels: {
      async get(channelID) {
        return {
          id: channelID,
          guildID: channelID === '999' ? '999' : '100',
          name: 'geral',
          type: ChannelType.GuildText,
          parentID: null,
          position: 0,
          topic: null,
          nsfw: false,
          slowmode: 0,
        };
      },
      async edit(channelID, input) {
        editedChannels.push(`${channelID}:${input.name ?? ''}`);
        return {
          id: channelID,
          guildID: '100',
          name: input.name ?? 'geral',
          type: ChannelType.GuildText,
          parentID: null,
          position: 0,
          topic: null,
          nsfw: false,
          slowmode: 0,
        };
      },
    },
    webhooks: {
      async list(channelID) {
        listedWebhooks.push(channelID);
        return [];
      },
    },
  });

  const store = new MemoryStore();
  const bot = new Yuzuha({ transport, store, resources, scheduler: false, http: false });
  t.after(() => bot.destroy());

  const outcomes: string[] = [];

  // 1. webhooksUpdate sem actorID: não há userID no evento -> recusa com NO_AUTHOR
  bot.contextEvent({
    event: 'webhooksUpdate',
    async run(ctx) {
      try {
        await ctx.resources.webhooks.list(ctx.channelID);
      } catch (error) {
        if (error instanceof GuardError) outcomes.push(`no-actor:${error.reason}`);
      }
    },
  });

  // 2. webhooksUpdate com actorID sem permissão ('2') -> recusa com PERMISSION_MISSING_AUTHOR
  bot.contextEvent({
    event: 'webhooksUpdate',
    actorID: '2',
    async run(ctx) {
      try {
        await ctx.resources.webhooks.list(ctx.channelID);
      } catch (error) {
        if (error instanceof GuardError) outcomes.push(`unprivileged:${error.reason}`);
      }
    },
  });

  // 3. webhooksUpdate com actorID autorizado ('1') e override de channelID ('300') para saída
  bot.contextEvent({
    event: 'webhooksUpdate',
    actorID: '1',
    channelID: '300',
    async run(ctx) {
      assert.equal(ctx.event.channelID, '200');
      assert.equal(ctx.channelID, '300');
      assert.equal(ctx.authorID, '1');
      await ctx.resources.webhooks.list(ctx.event.channelID!);
      await ctx.data.user.set('lastWebhookChannel', ctx.event.channelID);
      await ctx.send(`webhooks auditados em ${ctx.event.channelID}`);
      // Canal de outro servidor ('999') deve ser recusado pelo escopo de guildID '100'
      await assert.rejects(ctx.resources.channels.edit('999', { name: 'invasao' }), GuardError);
      await ctx.resources.channels.edit('200', { name: 'auditado' });
      outcomes.push('authorized:ok');
    },
  });

  bot.client.emit(Events.WebhooksUpdate, { guildId: '100', channelId: '200' });
  await flush();

  assert.deepEqual(outcomes, [
    'no-actor:NO_AUTHOR',
    'unprivileged:PERMISSION_MISSING_AUTHOR',
    'authorized:ok',
  ]);
  assert.deepEqual(listedWebhooks, ['200']);
  assert.deepEqual(editedChannels, ['200:auditado']);
  assert.equal(transport.messages.length, 1);
  assert.equal(transport.messages[0]?.channelID, '300');
  assert.equal(transport.messages[0]?.payload.content, 'webhooks auditados em 200');
  assert.equal(await store.read(s => s.variables['["user","1","lastWebhookChannel"]']), '200');
});

test('onError e currentExecution propagam source event, nome do evento e EventContext em qualquer ClientEventName', async t => {
  const reports: { error: unknown; ctx?: CommandContext; info: ErrorReportInfo; als?: ExecutionStore }[] = [];
  const logs: LogRecord[] = [];
  const bot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    http: false,
    onError: (error, ctx, info) => { reports.push({ error, ctx, info, als: currentExecution() }); },
    onLog: record => { logs.push(record); },
  });
  t.after(() => bot.destroy());

  bot.contextEvent({
    event: 'typingStart',
    async run(ctx, payload) {
      await flush();
      assert.deepEqual(currentExecution(), {
        executionID: ctx.executionID,
        source: 'event',
        event: 'typingStart',
        guildID: '100',
        channelID: '200',
        userID: payload.userId,
      });
      throw new Error('typing handler failed');
    },
  });

  bot.client.emit(Events.TypingStart, { channelId: '200', guildId: '100', userId: '2', timestamp: 1 });
  await flush();
  await flush();

  assert.equal(reports.length, 1);
  const report = reports[0]!;
  assert.ok(report.ctx instanceof EventContext);
  assert.equal(report.info.source, 'event');
  assert.equal(report.info.event, 'typingStart');
  assert.equal(report.info.ctx, report.ctx);
  assert.equal(report.info.executionID, report.ctx.executionID);
  assert.equal(report.als?.executionID, report.ctx.executionID);
  assert.equal(report.als?.event, 'typingStart');

  const errLog = logs.find((entry): entry is Extract<LogRecord, { source?: unknown }> => entry.event === 'error');
  assert.ok(errLog);
  assert.equal(errLog.source, 'event');
  assert.equal(errLog.trigger, 'typingStart');
  assert.equal(errLog.command, 'event:typingStart');
  assert.equal(errLog.executionID, report.ctx.executionID);
});

test('defineContextEvent, plugin.contextEvents atômico, bot.off e isolamento de scriptEvent', async t => {
  const transport = new MockTransport();
  const bot = new Yuzuha({ transport, store: new MemoryStore(), scheduler: false, http: false });
  t.after(() => bot.destroy());

  // Plugins com contextEvents são 100% nativos e não exigem engine de function mode
  const calls: string[] = [];
  const removable = defineContextEvent({
    event: Events.ShardReady,
    run(_ctx, shardId) { calls.push(`shard:${shardId}`); },
  });
  assert.equal(Object.isFrozen(removable), true);

  // Falha de validação em staging impede instalação parcial do plugin
  assert.throws(() => bot.plugin({
    name: 'broken-context-plugin',
    contextEvents: [
      removable,
      { event: 'invalidEvent' as never, run() {} },
    ],
  }), (err: unknown) => err instanceof YuzuhaError && err.code === 'EVENT');
  assert.equal(bot.client.listenerCount(Events.ShardReady), 0);

  bot.plugin({
    name: 'valid-context-plugin',
    contextEvents: [
      removable,
      defineContextEvent({
        event: Events.Resumed,
        once: true,
        run() { calls.push('resumed'); },
      }),
    ],
  });

  bot.client.emit(Events.ShardReady, 0);
  bot.client.emit(Events.Resumed);
  bot.client.emit(Events.Resumed);
  await flush();
  assert.deepEqual(calls, ['shard:0', 'resumed']);

  bot.off(Events.ShardReady, removable);
  bot.client.emit(Events.ShardReady, 1);
  await flush();
  assert.deepEqual(calls, ['shard:0', 'resumed']);

  // scriptEvent aceita todo evento seguro; debug e WebAuthn ficam só no modo nativo
  const scripted = new Yuzuha({ transport, store: new MemoryStore(), scheduler: false, http: false, engine: functions() });
  t.after(() => scripted.destroy());
  for (const unsupported of ['debug', 'webauthnCredentialsUpdate', 'clientReady']) {
    assert.throws(
      () => scripted.scriptEvent({ event: unsupported as never, code: 'oi' }),
      (err: unknown) => err instanceof YuzuhaError && err.code === 'SCRIPT_EVENT',
    );
  }
});
