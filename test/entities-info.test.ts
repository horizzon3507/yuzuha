import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, Guild, GuildMember, ThreadChannel, User, VoiceChannel } from '@fluxerjs/core';
import { CommandContext, MemoryStore } from '../src/index.js';
import { Runtime, defaultLimits, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
import { toGuildInfo, toMemberInfo, toUserInfo } from '../src/infrastructure/fluxer/resources/users.js';
import { toChannelInfo } from '../src/infrastructure/fluxer/resources/channels.js';
import { createThreadsResources } from '../src/infrastructure/fluxer/resources/threads.js';
import type { ChannelInfo } from '../src/ports/resources/channels.js';

const channel: ChannelInfo = { id: '200', name: 'voz', type: 2, guildID: '100', parentID: null,
  position: 0, topic: null, slowmode: 0, nsfw: false, bitrate: 64000, rtcRegion: null,
  permissionOverwrites: [{ id: '100', type: 0, allow: '1024', deny: '2048' }] };

function harness(options: { dm?: boolean; foreign?: boolean; fail?: boolean } = {}) {
  const ctx = new CommandContext({ message: mockMessage('!info', options.dm ? { guildID: undefined } : {}),
    command: { name: 'info', code: '' }, transport: new MockTransport(), store: new MemoryStore(), cooldown: () => 0,
    resources: mockResources({
      users: {
        async user(id) { if (options.fail) throw new Error('falha do port'); return {
          id, username: 'ana', displayName: 'Ana', bot: false, avatarURL: null, bannerURL: null,
          createdTimestamp: 1, globalName: null, flags: 0, system: false,
        }; },
        async member() { return { id: '2', username: 'ana', displayName: 'Ana', bot: false,
          avatarURL: null, bannerURL: null, createdTimestamp: 1, nickname: null,
          joinedTimestamp: 2, roles: ['5'], permissions: '0', timedOutUntil: null,
          deaf: true, mute: false, partial: false, profileFlags: 0, mentionFlags: null }; },
        async guild() { return { id: '100', name: 'Servidor', ownerID: '1', iconURL: null,
          bannerURL: null, memberCount: 3, createdTimestamp: 1, afkTimeout: 300, afkChannelId: null,
          onlineCount: 0, features: ['COMMUNITY'] }; },
      },
      channels: { async get(id) { return { ...channel, id, type: id === '300' ? 11 : 2,
        guildID: options.foreign ? '999' : options.dm ? null : '100' }; } },
      threads: { async get(id) { return { id, name: 'tópico', parentID: '200', guildID: options.foreign ? '999' : '100',
        archived: false, locked: true, messageCount: 2, ownerID: '2', appliedTags: ['7'], member: null,
        totalMessageSent: 4, memberCount: 1, autoArchiveDuration: 60 }; } },
    }) });
  const runtime = registerBuiltins(new Runtime(defaultLimits));
  return (source: string) => runtime.execute(runtime.compile(source), ctx);
}

test('leitores de entidades preservam zero/false, serializam arrays e normalizam ausência', async () => {
  const run = harness();
  assert.equal(await run('$user[2;globalName]'), '');
  assert.equal(await run('$user[2;flags]'), 0);
  assert.equal(await run('$user[2;system]'), false);
  assert.equal(await run('$member[2;roles]'), '["5"]');
  assert.equal(await run('$member[2;deaf]'), true);
  assert.equal(await run('$member[2;mentionFlags]'), '');
  assert.equal(await run('$guild[features]'), '["COMMUNITY"]');
  assert.equal(await run('$guild[onlineCount]'), 0);
  assert.equal(await run('$guild[afkChannelId]'), '');
  assert.equal(await run('$guild[afkTimeout]'), 300);
  assert.equal(await run('$channel[200;bitrate]'), 64000);
  assert.equal(await run('$channel[200;rtcRegion]'), '');
  assert.equal(await run('$channel[200;permissionOverwrites]'), JSON.stringify(channel.permissionOverwrites));
  assert.equal(await run('$threadInfo[appliedTags;300]'), '["7"]');
  assert.equal(await run('$threadInfo[member;300]'), '');
  assert.equal(await run('$threadInfo[totalMessageSent;300]'), 4);
});

test('leitores recusam propriedades fora da whitelist e não ocultam falhas do port', async () => {
  const run = harness();
  for (const source of ['$user[2;token]', '$member[2;constructor]', '$guild[__proto__]',
    '$channel[200;token]', '$threadInfo[client;300]', '$threadInfo[;300]']) {
    await assert.rejects(run(source), /Propriedade inválida\. Use:/);
  }
  await assert.rejects(harness({ fail: true })('$user[2;flags]'), error =>
    error instanceof Error && error.cause instanceof Error && error.cause.message === 'falha do port');
});

test('leituras de canal/thread não atravessam servidor nem DM; membro/guild/thread exigem servidor', async () => {
  await assert.rejects(harness({ foreign: true })('$channel[200;name]'), /contexto atual/);
  await assert.rejects(harness({ foreign: true })('$threadInfo[name;300]'), /contexto atual/);
  await assert.rejects(harness()('$threadInfo[name;200]'), /não é uma thread/);
  const run = harness({ dm: true });
  assert.equal(await run('$channel[200;name]'), 'voz');
  await assert.rejects(run('$channel[300;name]'), /contexto atual/);
  for (const source of ['$member[2;roles]', '$guild[name]', '$threadInfo[name;300]']) await assert.rejects(run(source));
});

test('adaptador copia campos públicos de usuário, membro e servidor sem identidade SDK', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const user = new User(client, { id: '2', username: 'ana', discriminator: '0001', global_name: null,
    avatar: 'hash', banner: 'banner', flags: 4, system: true, avatar_color: 123 } as never);
  const info = toUserInfo(user);
  assert.equal(info.avatar, user.avatar);
  assert.equal(info.banner, user.banner);
  assert.equal(info.flags, user.flags);
  assert.equal(info.avatarColor, user.avatarColor);
  assert.equal(info.globalName, null);
  assert.equal(info.system, true);
  assert.equal(info.discriminator, '0001');
  assert.equal(Object.hasOwn(info, 'client'), false);
  const guild = new Guild(client, { id: '100', name: 'Teste', ownerId: '1',
    afkChannelId: '200', afkTimeout: 300, verificationLevel: 2, onlineCount: 3 } as never);
  const guildInfo = toGuildInfo(guild);
  assert.equal(guildInfo.afkChannelId, guild.afkChannelId);
  assert.equal(guildInfo.afkTimeout, guild.afkTimeout);
  assert.equal(guildInfo.verificationLevel, guild.verificationLevel);
  assert.equal(guildInfo.onlineCount, guild.onlineCount);
  assert.equal(guildInfo.splashURL, null);
  const member = new GuildMember(client, { user: { id: '2', username: 'ana', discriminator: '0001', avatar: null },
    roles: [], joined_at: '2026-01-01T00:00:00Z', deaf: true, mute: false,
    avatar: 'membro', profile_flags: 2, mention_flags: 1 } as never, guild);
  const memberInfo = toMemberInfo(member);
  assert.equal(memberInfo.guildID, '100');
  assert.equal(memberInfo.partial, false);
  assert.equal(memberInfo.deaf, true);
  assert.equal(memberInfo.avatar, member.avatar);
  assert.equal(memberInfo.profileFlags, member.profileFlags);
  assert.equal(memberInfo.mentionFlags, member.mentionFlags);
});

test('adaptador copia overwrites, voz e metadados completos de thread', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const voice = new VoiceChannel(client, { id: '200', guild_id: '100', type: 2, name: 'voz',
    bitrate: 64000, user_limit: 10, rtc_region: 'brazil',
    permission_overwrites: [{ id: '100', type: 0, allow: '1024', deny: '2048' }] });
  const info = toChannelInfo(voice);
  assert.equal(info.createdTimestamp, voice.createdTimestamp);
  assert.equal(info.bitrate, 64000);
  assert.equal(info.userLimit, 10);
  assert.equal(info.rtcRegion, 'brazil');
  assert.deepEqual(info.permissionOverwrites, channel.permissionOverwrites);
  const thread = new ThreadChannel(client, { id: '300', guild_id: '100', parent_id: '200', type: 11,
    name: 'tópico', message_count: 2, total_message_sent: 5, member_count: 3, applied_tags: ['7'],
    rate_limit_per_user: 4, thread_metadata: { archived: false, locked: true, auto_archive_duration: 60,
      archive_timestamp: '2026-01-01T00:00:00Z', invitable: false } } as never);
  Reflect.set(client.channels, 'fetch', async () => thread);
  const threadInfo = await createThreadsResources(client).get('300');
  assert.equal(threadInfo.guildID, '100');
  assert.equal(threadInfo.memberCount, 3);
  assert.equal(threadInfo.totalMessageSent, 5);
  assert.equal(threadInfo.autoArchiveDuration, 60);
  assert.equal(threadInfo.invitable, false);
  assert.equal(threadInfo.rateLimitPerUser, 4);
  assert.deepEqual(threadInfo.appliedTags, ['7']);
  thread.appliedTags.push('8');
  assert.deepEqual(threadInfo.appliedTags, ['7']);
});
