import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, PermissionFlags } from '@fluxerjs/core';
import { CommandContext, FluxerResources, FluxerTransport, GuardError, MemoryStore, PartialModerationError } from '../src/index.js';
import { Runtime, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
import type { MockResourceOverrides } from '../src/testing.js';
import type { ModerationAction, ModerationMember } from '../src/domain/moderation.js';

function harness(options: { transport?: MockTransport; store?: MemoryStore; resources?: MockResourceOverrides; dm?: boolean } = {}) {
  const transport = options.transport ?? new MockTransport();
  const ctx = new CommandContext({ message: mockMessage('!resource', options.dm ? { guildID: undefined } : {}),
    command: { name: 'resource' }, store: options.store ?? new MemoryStore(), transport,
    resources: mockResources(options.resources), cooldown: () => 0 });
  const runtime = registerBuiltins(new Runtime());
  return { ctx, transport, run: (source: string) => runtime.execute(runtime.compile(source), ctx) };
}

const VOICE = [
  ['move', PermissionFlags.MoveMembers, { channelID: '300' }],
  ['mute', PermissionFlags.MuteMembers, { enabled: true }],
  ['deafen', PermissionFlags.DeafenMembers, { enabled: false }],
] as const;

test('moderação de voz exige permissão do autor e do bot para cada ação', async t => {
  for (const [action, permission, options] of VOICE) {
    for (const denied of ['author', 'bot'] as const) await t.test(`${action}: ${denied}`, async () => {
      const { ctx, transport } = harness();
      transport.setMember('100', { id: '1', owner: false, rank: 100, permissions: denied === 'author' ? 0n : permission });
      transport.setMember('100', { id: transport.botID, owner: false, rank: 90, permissions: denied === 'bot' ? 0n : permission });
      await assert.rejects(ctx.moderate(action, '2', 'motivo', options), GuardError);
      assert.equal(transport.actions.length, 0);
      assert.equal(ctx.hasModerationEffect, false);
    });
  }
});

test('moderação de voz protege dono, autor, bot e hierarquia de ambos', async t => {
  for (const [action, , options] of VOICE) {
    for (const scenario of ['owner', 'author-rank', 'bot-rank', 'self', 'bot'] as const) await t.test(`${action}: ${scenario}`, async () => {
      const { ctx, transport } = harness();
      transport.setMember('100', { id: '1', owner: false, permissions: PermissionFlags.Administrator, rank: 80 });
      transport.setMember('100', { id: '2', owner: scenario === 'owner', permissions: 0n,
        rank: scenario === 'author-rank' ? 80 : scenario === 'bot-rank' ? 91 : 1 });
      const target = scenario === 'self' ? '1' : scenario === 'bot' ? transport.botID : '2';
      await assert.rejects(ctx.moderate(action, target, 'motivo', options), GuardError);
      assert.equal(transport.actions.length, 0);
    });
  }
});

test('movimento também exige permissões efetivas do autor e bot no destino', async () => {
  for (const denied of ['1', '999']) {
    class ChannelTransport extends MockTransport {
      override async member(guildID: string, id: string, channelID?: string): Promise<ModerationMember> {
        const member = await super.member(guildID, id);
        if (channelID === '300' && id === denied) return { ...member, owner: false, permissions: 0n };
        return member;
      }
    }
    const { ctx, transport } = harness({ transport: new ChannelTransport() });
    await assert.rejects(ctx.mod.move('2', { channelID: '300', reason: 'organizar' }), GuardError);
    assert.equal(transport.actions.length, 0);
  }
});

test('API nativa de voz salva parâmetros no caso, aceita reversão e desligamento', async () => {
  const { ctx, transport } = harness();
  const moved = await ctx.mod.move({ id: '2' }, { channelID: '300', reason: 'organizar' });
  assert.equal(moved.channelID, '300');
  const disconnected = await ctx.mod.move('2', { channelID: null, reason: 'desconectar' });
  assert.equal(disconnected.channelID, null);
  assert.equal((await ctx.mod.mute('2', { enabled: true, reason: 'ruído' })).enabled, true);
  assert.equal((await ctx.mod.deafen('2', { enabled: false, reason: 'restaurar' })).enabled, false);
  assert.equal(await ctx.mod.mute('2', { enabled: false, reason: 'restaurar', record: false }), undefined);
  assert.equal(transport.actions.length, 5);
  assert.equal(ctx.hasModerationEffect, true);
  assert.deepEqual(await ctx.case(2), disconnected);
  for (const [action, options] of [['move', {}], ['move', { channelID: 'abc' }], ['mute', {}], ['deafen', { enabled: 'false' }]] as const) {
    await assert.rejects(ctx.moderate(action, '2', 'motivo', options as never), GuardError);
  }
  await assert.rejects(ctx.mod.mute('2', { enabled: true, reason: '' }), GuardError);
  assert.equal(transport.actions.length, 5);
});

test('falhas parciais de cada ação de voz escapam de $try sem repetir a API', async () => {
  class FailingStore extends MemoryStore {
    override async commit(): Promise<void> { throw new Error('disco cheio'); }
  }
  for (const code of ['$modMoveMember[2;300;organizar]', '$modMuteMember[2;true;ruído]', '$modDeafenMember[2;false;restaurar]']) {
    const { ctx, transport, run } = harness({ store: new FailingStore() });
    await assert.rejects(run(`$try[${code};repetir]`), PartialModerationError);
    assert.equal(transport.actions.length, 1);
    assert.equal(ctx.hasModerationEffect, true);
    assert.equal(ctx.lastCase, undefined);
  }
});

test('funções de voz compartilham guards, caso e opção sem caso', async () => {
  const { ctx, transport, run } = harness();
  assert.equal(await run('$modMoveMember[<@2>;<#300>;organizar]$caseID'), '1');
  await run('$moveMember[2;;desconectar]$muteMember[2;false;restaurar]$deafenMember[2;true;pausa]');
  assert.deepEqual(transport.actions.map(item => [item.action, item.channelID, item.enabled]),
    [['move', '300', undefined], ['move', null, undefined], ['mute', undefined, false], ['deafen', undefined, true]]);
  assert.equal((await ctx.store.read(state => state.cases['100']))?.length, 1);
  await assert.rejects(run('$try[$muteMember[1;true;self];ignorado]'), GuardError);
  await assert.rejects(run('$muteMember[2;sim;ruído]'), /true ou false/);
  assert.equal(transport.actions.length, 4);
  transport.failAction = true;
  const fresh = harness({ transport });
  await assert.rejects(fresh.ctx.mod.deafen('2', { enabled: true, reason: 'ruído' }), /simulada/);
  assert.equal(fresh.ctx.hasModerationEffect, false);
});

test('adaptador de voz usa PATCH tipado com motivo e preserva false/null', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const calls: unknown[] = [];
  Reflect.set(client.guilds, 'resolve', async () => ({ members: { fetch: async () => ({ edit: async (input: unknown) => { calls.push(input); } }) } }));
  Reflect.set(client.channels, 'fetch', async () => ({ isGuild: () => true, isVoice: () => true, guildId: '100' }));
  const transport = new FluxerTransport(client);
  await transport.moderate('100', 'move', '2', 'organizar', undefined, { channelID: '300' });
  await transport.moderate('100', 'move', '2', 'desconectar', undefined, { channelID: null });
  await transport.moderate('100', 'mute', '2', 'restaurar', undefined, { enabled: false });
  await transport.moderate('100', 'deafen', '2', 'pausa', undefined, { enabled: true });
  assert.deepEqual(calls, [{ channelId: '300', reason: 'organizar' }, { channelId: null, reason: 'desconectar' },
    { mute: false, reason: 'restaurar' }, { deaf: true, reason: 'pausa' }]);
});

test('adaptador rejeita destino de voz de outro servidor e usa permissões locais', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  let voice = true, guildID = '100';
  Reflect.set(client.guilds, 'fetch', async () => ({ ownerId: '1', fetchRoles: async () => {},
    roles: new Map([['100', { id: '100', position: 0 }]]), members: { fetch: async () => ({
      roles: { cache: new Map() }, permissions: { bitfield: PermissionFlags.Administrator },
      permissionsIn: () => ({ bitfield: PermissionFlags.MoveMembers }),
    }) } }));
  Reflect.set(client.channels, 'fetch', async () => ({ isGuild: () => true, isVoice: () => voice, guildId: guildID }));
  const transport = new FluxerTransport(client);
  assert.equal((await transport.member('100', '2', '300')).permissions, PermissionFlags.MoveMembers);
  guildID = '101';
  await assert.rejects(transport.member('100', '2', '300'), /mesmo servidor/);
  guildID = '100'; voice = false;
  assert.equal((await transport.member('100', '2', '300')).permissions, PermissionFlags.MoveMembers);
  await assert.rejects(transport.moderate('100', 'move', '2', 'organizar', undefined, { channelID: '300' }), /canal de voz/);
});

test('threads ativas e arquivadas preservam membros e retornam cursor correto', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const calls: unknown[] = [];
  const page = { hasMore: true, threads: [{ id: '500', name: 'thread', parentId: '200', archived: true,
    locked: false, messageCount: 5, ownerId: '2', archiveTimestamp: '2026-10-21T00:00:00Z' }],
    members: [{ id: '500', userId: '2', joinedAt: new Date(123), flags: 0 }] };
  Reflect.set(client.guilds, 'resolve', async () => ({ fetchActiveThreads: async () => ({ ...page, hasMore: false }) }));
  Reflect.set(client.channels, 'fetch', async () => ({ threads: { create: () => {},
    fetchArchived: async (input: unknown) => { calls.push(input); return page; },
    fetchJoinedPrivateArchived: async (input: unknown) => { calls.push(input); return page; },
  } }));
  const threads = new FluxerResources(client).threads;
  const active = await threads.active('100');
  assert.equal(active.nextBefore, null);
  assert.deepEqual(active.members, [{ threadID: '500', userID: '2', joinedTimestamp: 123, flags: 0 }]);
  assert.equal((await threads.archived('200')).nextBefore, '2026-10-21T00:00:00Z');
  assert.equal((await threads.archived('200', { type: 'joined', before: '600', limit: 2 })).nextBefore, '500');
  await threads.archived('200', { type: 'private', before: '2026-10-22T00:00:00Z', limit: 100 });
  assert.deepEqual(calls, [{ type: 'public', limit: 50, before: undefined }, { limit: 2, before: '600' },
    { type: 'private', limit: 100, before: '2026-10-22T00:00:00Z' }]);
  for (const input of [{ limit: 1 }, { type: 'joined', before: '2026-10-21T00:00:00Z' }, { before: '500' }]) {
    await assert.rejects(threads.archived('200', input as never));
  }
  assert.equal(calls.length, 3);
});

test('funções de listagem de threads validam paginação antes do port', async () => {
  const calls: unknown[] = [];
  const page = { threads: [], members: [], hasMore: false, nextBefore: null };
  const { run } = harness({ resources: { threads: {
    async active(...args) { calls.push(args); return page; },
    async archived(...args) { calls.push(args); return page; },
  } } });
  assert.deepEqual(await run('$activeThreads'), page);
  assert.deepEqual(await run('$archivedThreads[200;joined;10;600]'), page);
  assert.deepEqual(calls, [['100'], ['200', { type: 'joined', limit: 10, before: '600' }]]);
  await assert.rejects(run('$archivedThreads[200;public;1]'));
  await assert.rejects(run('$archivedThreads[200;joined;10;ontem]'));
  assert.equal(calls.length, 2);
});

test('canais de link e avisos usam URL/nível nativos, autorizam ambos e restringem servidor', async () => {
  const calls: unknown[] = [];
  const channel = { id: '300', name: 'site', type: 998, guildID: '100', parentID: null,
    position: 0, topic: null, slowmode: 0, nsfw: false };
  const { run, transport } = harness({ resources: { channels: {
    async get() { return channel; },
    async create(...args) { calls.push(args); return channel; },
    async edit(...args) { calls.push(args); return channel; },
  } } });
  await run('$createLinkChannel[site;https://example.com]');
  await run('$editLinkChannel[300;https://example.org;atualizar]');
  await run('$setContentWarning[300;1;conteúdo sensível;aviso]');
  await run('$setContentWarning[300;;]');
  assert.deepEqual(calls, [['100', { name: 'site', type: 998, url: 'https://example.com' }],
    ['300', { url: 'https://example.org', reason: 'atualizar' }],
    ['300', { contentWarningLevel: 1, contentWarningText: 'conteúdo sensível', reason: 'aviso' }],
    ['300', { contentWarningLevel: null, contentWarningText: null }]]);
  await assert.rejects(run('$createLinkChannel[site;javascript:alert(1)]'));
  await assert.rejects(run('$setContentWarning[300;2]'));
  channel.guildID = '101';
  await assert.rejects(run('$editLinkChannel[300;https://example.com]'), GuardError);
  channel.guildID = '100';
  for (const id of ['1', '999']) {
    transport.setMember('100', { id, owner: false, permissions: 0n, rank: 90 });
    await assert.rejects(run('$createLinkChannel[site;https://example.com]'), GuardError);
    transport.setMember('100', { id, owner: false, permissions: PermissionFlags.Administrator, rank: 90 });
  }
  assert.equal(calls.length, 4);
});

test('adaptador de canais envia e retorna link e avisos sem perder valores zero/null', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const calls: unknown[] = [];
  const channel = { id: '300', name: 'site', type: 998, guildId: '100', isGuild: () => true,
    url: 'https://example.com', contentWarningLevel: 0, contentWarningText: null,
    async edit(input: unknown) { calls.push(input); return this; } };
  Reflect.set(client.channels, 'fetch', async () => channel);
  Reflect.set(client.guilds, 'resolve', async () => ({ createChannel: async (input: unknown) => { calls.push(input); return channel; } }));
  const channels = new FluxerResources(client).channels;
  const created = await channels.create('100', { name: 'site', type: 998, url: 'https://example.com' });
  assert.equal(created.url, 'https://example.com');
  assert.equal(created.contentWarningLevel, 0);
  await channels.edit('300', { contentWarningLevel: null, contentWarningText: null, url: 'https://example.org' });
  assert.deepEqual(calls, [{ name: 'site', type: 998, url: 'https://example.com' },
    { url: 'https://example.org', contentWarningLevel: null, contentWarningText: null }]);
  await assert.rejects(channels.create('100', { name: 'site', type: 998 }), /URL/);
  await assert.rejects(channels.edit('300', { url: 'file:///tmp/file' }), /HTTP/);
  await assert.rejects(channels.edit('300', { contentWarningLevel: 2 }), /0, 1/);
  assert.equal(calls.length, 2);
});

test('perfil completo normaliza campos, ausências e IDs mútuos sem vazar dados crus', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const user = { id: '2', username: 'alice', globalName: 'Alice', bot: false,
    avatarURL: () => null, bannerURL: () => null, createdTimestamp: 123 };
  Reflect.set(client.users, 'fetchWithProfile', async (id: string, input: unknown) => {
    assert.equal(id, '2'); assert.deepEqual(input, { guildId: '100' });
    return { user, member: null, userData: { secret: 'omit' }, serverProfile: null,
      globalProfile: { userProfile: { bio: 'bio', pronouns: 'ela', accentColor: 0 }, mutualGuildIds: ['100'],
        mutualGuilds: [{ id: '100' }, { id: '101' }], connectedAccounts: [{ name: 'alice', type: 'github' }, {}] } };
  });
  const profile = await new FluxerResources(client).users.profile('2', '100');
  assert.equal(profile.user.displayName, 'Alice');
  assert.equal(profile.member, null);
  assert.equal(profile.serverProfile, null);
  assert.deepEqual(profile.globalProfile, { bio: 'bio', pronouns: 'ela', banner: null, accentColor: 0,
    bannerColor: null, theme: null, mutualGuildIDs: ['100', '101'],
    connectedAccounts: [{ name: 'alice', type: 'github' }, { name: null, type: null }] });
  assert.equal(Object.hasOwn(profile, 'userData'), false);
});

test('contagens ao vivo filtram eventos e removem listeners em sucesso, timeout, abort e falha de envio', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const resources = new FluxerResources(client).users;
  Reflect.set(client, 'requestGuildCounts', (input: unknown) => { assert.deepEqual(input, { guildIds: ['100'] }); });
  Reflect.set(client, 'requestChannelMemberCounts', (input: unknown) => { assert.deepEqual(input, { guildId: '100', channelId: '200' }); });
  const guild = resources.guildCounts('100');
  const channel = resources.channelCounts('100', '200');
  client.emit('guildCountsUpdate', { counts: [{ guildId: '101', memberCount: 9, onlineCount: 8 }] });
  assert.equal(client.listenerCount('guildCountsUpdate'), 1);
  client.emit('channelMemberCountsUpdate', { counts: [{ guildId: '100', channelId: '201', memberCount: 1, onlineCount: 1 }] });
  assert.equal(client.listenerCount('channelMemberCountsUpdate'), 1);
  client.emit('guildCountsUpdate', { counts: [{ guildId: '100', memberCount: 42, onlineCount: 5 }] });
  client.emit('channelMemberCountsUpdate', { counts: [{ guildId: '100', channelId: '200', memberCount: 10, onlineCount: 2 }] });
  assert.deepEqual(await guild, { guildID: '100', memberCount: 42, onlineCount: 5 });
  assert.deepEqual(await channel, { guildID: '100', channelID: '200', memberCount: 10, onlineCount: 2 });
  assert.equal(client.listenerCount('guildCountsUpdate'), 0);
  assert.equal(client.listenerCount('channelMemberCountsUpdate'), 0);
  await assert.rejects(resources.guildCounts('100', { timeout: 1 }), /prazo/);
  assert.equal(client.listenerCount('guildCountsUpdate'), 0);
  const controller = new AbortController();
  const pending = resources.channelCounts('100', '200', { signal: controller.signal });
  controller.abort(new Error('cancelado'));
  await assert.rejects(pending, /cancelado/);
  assert.equal(client.listenerCount('channelMemberCountsUpdate'), 0);
  await assert.rejects(resources.guildCounts('100', { signal: controller.signal }), /cancelado/);
  await assert.rejects(resources.guildCounts('100', { timeout: 0 }), /1 a 60000/);
  Reflect.set(client, 'requestGuildCounts', () => { throw new Error('offline'); });
  await assert.rejects(resources.guildCounts('100'), /offline/);
  assert.equal(client.listenerCount('guildCountsUpdate'), 0);
});

test('funções de perfil/contagens passam escopo e sinal e recusam DMs para contagens', async () => {
  const calls: unknown[] = [];
  const profile = { user: { id: '2', username: 'a', displayName: 'a', bot: false, avatarURL: null, bannerURL: null,
    createdTimestamp: 0 }, member: null, globalProfile: null, serverProfile: null };
  const { run, ctx } = harness({ resources: { users: {
    async profile(...args) { calls.push(args); return profile; },
    async guildCounts(...args) { calls.push(args); return { guildID: '100', memberCount: 2, onlineCount: 1 }; },
    async channelCounts(...args) { calls.push(args); return { guildID: '100', channelID: '200', memberCount: 2, onlineCount: 1 }; },
  } } });
  assert.deepEqual(await run('$userProfile[<@2>]'), profile);
  await run('$guildCounts[100]$channelCounts[<#200>;200]');
  assert.deepEqual(calls, [['2', '100'], ['100', { timeout: 100, signal: ctx.signal }],
    ['100', '200', { timeout: 200, signal: ctx.signal }]]);
  await assert.rejects(run('$guildCounts[0]'));
  const dm = harness({ dm: true });
  for (const code of ['$guildCounts', '$channelCounts', '$activeThreads', '$archivedThreads[200]',
    '$moveMember[2;300;motivo]', '$muteMember[2;true;motivo]', '$createLinkChannel[site;https://example.com]']) {
    await assert.rejects(dm.run(code), GuardError);
  }
});
