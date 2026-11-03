import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, Message } from '@fluxerjs/core';
import { GatewayOpcodes } from '@fluxerjs/types';
import { FluxerResources } from '../src/index.js';
import { mockResources } from '../src/testing.js';
import type { MessageInfo } from '../src/index.js';

function fakeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: '1', username: 'bot', globalName: null, bot: true,
    avatarURL: () => null, bannerURL: () => null, createdTimestamp: 100,
    ...overrides,
  };
}

function fakeMember(guildID: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1', guildID,
    user: { id: 'u1', username: 'ana', bot: false, createdTimestamp: 50, bannerURL: () => null },
    displayName: 'ana', displayAvatarURL: () => null, bannerURL: () => null,
    nick: null, joinedAt: new Date(0), roles: { roleIds: ['r1'] },
    permissions: { bitfield: 0n }, communicationDisabledUntil: null,
    ...overrides,
  };
}

function fakeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1', channelId: 'c1',
    author: { id: 'u1', username: 'ana' },
    content: 'oi', createdAt: new Date(1_000), pinned: false,
    attachments: new Map(), embeds: [],
    ...overrides,
  };
}

function apiMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: '123456789012345678', channel_id: 'c1',
    author: { id: '987654321098765432', username: 'ana', discriminator: '0001', global_name: 'Ana', avatar: null, avatar_color: null, flags: 0 },
    content: 'oi', timestamp: '2024-05-01T00:00:00.000Z', edited_timestamp: null,
    pinned: false, attachments: [],
    ...overrides,
  };
}

test('mockResources roteia as novas áreas e sinaliza métodos ausentes', async () => {
  const calls: unknown[][] = [];
  const resources = mockResources({
    gateway: { send(...args) { calls.push(['send', ...args]); } },
    instance: { async resolveEmoji(...args) { calls.push(['emoji', ...args]); return 'ok:1'; } },
    self: { async leaveGuild(...args) { calls.push(['leave', ...args]); } },
    cache: { async sweepMembers(...args) { calls.push(['sweep', ...args]); return 3; } },
  });
  resources.gateway.send(0, { op: GatewayOpcodes.Heartbeat, d: null });
  assert.equal(await resources.instance.resolveEmoji('ok'), 'ok:1');
  await resources.self.leaveGuild('g1', { password: 'pw' });
  assert.equal(await resources.cache.sweepMembers(), 3);
  assert.deepEqual(calls, [
    ['send', 0, { op: GatewayOpcodes.Heartbeat, d: null }],
    ['emoji', 'ok'],
    ['leave', 'g1', { password: 'pw' }],
    ['sweep'],
  ]);
  assert.throws(() => resources.gateway.requestMembers({ guildID: 'g1' }), /Recurso simulado ausente: gateway/);
  assert.throws(() => resources.instance.describe(), /Recurso simulado ausente: instance/);
  assert.throws(() => resources.self.fetch(), /Recurso simulado ausente: self/);
  assert.throws(() => resources.cache.stats(), /Recurso simulado ausente: cache/);
});

test('FluxerResources agrega as novas áreas de recursos', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const resources = new FluxerResources(client);
  const methods: [object, string[]][] = [
    [resources.gateway, ['requestMembers', 'requestGuildCounts', 'requestChannelCounts', 'requestForumUnreads', 'subscribeThreads', 'send']],
    [resources.instance, ['describe', 'gatewayInfo', 'application', 'oauthApplications', 'emojiMetadata', 'stickerMetadata', 'resolveEmoji']],
    [resources.self, ['fetch', 'guilds', 'leaveGuild', 'deleteMyMessages']],
    [resources.cache, ['stats', 'sweepMessages', 'sweepMembers']],
  ];
  for (const [area, names] of methods) {
    for (const name of names) assert.equal(typeof Reflect.get(area, name), 'function', name);
  }
  assert.equal(typeof resources.messages.bulkFetch, 'function');
  assert.equal(typeof resources.messages.searchAll, 'function');
});

test('adaptador de gateway converte nomes yuzuha para os do SDK', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const calls: unknown[][] = [];
  for (const name of ['requestGuildMembers', 'requestGuildCounts', 'requestChannelMemberCounts',
    'requestForumUnreads', 'subscribeThreads', 'sendToGateway']) {
    Reflect.set(client, name, (...args: unknown[]) => calls.push([name, ...args]));
  }
  const gateway = new FluxerResources(client).gateway;
  gateway.requestMembers({ guildID: 'g1', guildIDs: ['g1', 'g2'], query: 'an', limit: 5, userIDs: ['u1'], presences: true, nonce: 'n1' });
  gateway.requestGuildCounts(['g1', 'g2'], 'n2');
  gateway.requestChannelCounts({ guildID: 'g1', channelID: 'c1', channelIDs: ['c2'], nonce: 'n3' });
  gateway.requestForumUnreads({ guildID: 'g1', channelID: 'f1',
    threads: [{ threadID: 't1', ackMessageID: 'm9' }, { threadID: 't2' }] });
  gateway.subscribeThreads({ guildID: 'g1', threads: true, threadIDs: ['t1'] });
  gateway.send(2, { op: GatewayOpcodes.Heartbeat, d: 42 });
  assert.deepEqual(calls, [
    ['requestGuildMembers', { guildId: 'g1', guildIds: ['g1', 'g2'], query: 'an', limit: 5, userIds: ['u1'], presences: true, nonce: 'n1' }],
    ['requestGuildCounts', { guildIds: ['g1', 'g2'], nonce: 'n2' }],
    ['requestChannelMemberCounts', { guildId: 'g1', channelId: 'c1', channelIds: ['c2'], nonce: 'n3' }],
    ['requestForumUnreads', { guildId: 'g1', channelId: 'f1',
      threads: [{ threadId: 't1', ackMessageId: 'm9' }, { threadId: 't2', ackMessageId: undefined }] }],
    ['subscribeThreads', { guildId: 'g1', threads: true, threadIds: ['t1'] }],
    ['sendToGateway', 2, { op: GatewayOpcodes.Heartbeat, d: 42 }],
  ]);
});

test('adaptador de instância normaliza descoberta, gateway, aplicações e metadados', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const endpoints = {
    api: 'https://api', api_client: 'https://ac', api_public: 'https://ap', gateway: 'wss://g',
    media: 'https://m', static_cdn: 'https://sc', marketing: 'https://mk', admin: 'https://ad',
    invite: 'https://i', gift: 'https://gf', webapp: 'https://w',
  };
  const discovery = {
    api_code_version: 7, codename: 'hory', endpoints,
    features: { voice_enabled: true, stripe_enabled: false, self_hosted: true, presigned_attachment_uploads: true, emails_enabled: false },
    registration: { mode: 'open' }, sso: { enabled: true, enforced: false },
    community: { single_community: false, single_community_guild_id: null, direct_messages_disabled: true },
    services: { gif_enabled: true, youtube_enabled: false, bluesky_enabled: true },
  };
  Reflect.set(client, 'fetchInstance', async () => discovery);
  Reflect.set(client, 'fetchGatewayInfo', async () => ({ url: 'wss://g', shards: 3,
    session_start_limit: { total: 100, remaining: 90, reset_after: 5000, max_concurrency: 4 } }));
  Reflect.set(client, 'fetchApplication', async () => ({ id: '9', name: 'app', icon: 'ih', description: 'd',
    bot_public: true, bot_require_code_grant: false, verify_key: 'vk', owner: { id: 'o1' }, flags: 12 }));
  Reflect.set(client, 'fetchOAuthApplications', async () => [{ id: '8', name: 'oauth', redirect_uris: ['https://x'],
    client_secret: 'sec', bot: { id: 'b1' }, icon: null, description: null }]);
  Reflect.set(client, 'fetchEmojiMetadata', async (id: string) => ({ id, guild_id: 'g1', name: 'e', animated: false, allow_cloning: true }));
  Reflect.set(client, 'fetchStickerMetadata', async (id: string) => ({ id, guild_id: 'g2', name: 's', animated: true, allow_cloning: false }));
  Reflect.set(client, 'resolveEmoji', async (emoji: unknown, guildID?: string) =>
    `${typeof emoji === 'string' ? emoji : (emoji as { name: string }).name}:${guildID ?? 'none'}`);
  const instance = new FluxerResources(client).instance;
  assert.deepEqual(await instance.describe(), {
    apiCodeVersion: 7, codename: 'hory',
    endpoints: {
      api: 'https://api', apiClient: 'https://ac', apiPublic: 'https://ap', gateway: 'wss://g',
      media: 'https://m', staticCDN: 'https://sc', marketing: 'https://mk', admin: 'https://ad',
      invite: 'https://i', gift: 'https://gf', webapp: 'https://w',
    },
    features: { voiceEnabled: true, stripeEnabled: false, selfHosted: true, presignedAttachmentUploads: true, emailsEnabled: false },
    registrationMode: 'open', ssoEnabled: true, ssoEnforced: false,
    singleCommunity: false, singleCommunityGuildID: null, directMessagesDisabled: true,
    services: { gif: true, youtube: false, bluesky: true },
  });
  assert.deepEqual(await instance.gatewayInfo(), { url: 'wss://g', shards: 3,
    sessionStartLimit: { total: 100, remaining: 90, resetAfter: 5000, maxConcurrency: 4 } });
  assert.deepEqual(await instance.application(), { id: '9', name: 'app', icon: 'ih', description: 'd',
    botPublic: true, botRequireCodeGrant: false, verifyKey: 'vk', flags: 12, ownerID: 'o1',
    botID: null, redirectURIs: [], clientSecret: null });
  assert.deepEqual(await instance.oauthApplications(), [{ id: '8', name: 'oauth', icon: null, description: null,
    botPublic: null, botRequireCodeGrant: null, verifyKey: null, flags: null, ownerID: null,
    botID: 'b1', redirectURIs: ['https://x'], clientSecret: 'sec' }]);
  assert.deepEqual(await instance.emojiMetadata('e1'), { id: 'e1', guildID: 'g1', name: 'e', animated: false, allowCloning: true });
  assert.deepEqual(await instance.stickerMetadata('s1'), { id: 's1', guildID: 'g2', name: 's', animated: true, allowCloning: false });
  assert.equal(await instance.resolveEmoji({ name: 'ok', id: '1' }, 'g9'), 'ok:g9');
  assert.equal(await instance.resolveEmoji('👍'), '👍:none');
});

test('describe usa endpoints resolvidos quando a descoberta não traz documento', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  Reflect.set(client, 'fetchInstance', async () => undefined);
  const info = await new FluxerResources(client).instance.describe();
  assert.equal(info.apiCodeVersion, null);
  assert.equal(info.endpoints.apiPublic, client.instance.endpoints.api_public);
  const failure = new Error('sem rede');
  Reflect.set(client, 'fetchInstance', async () => { throw failure; });
  await assert.rejects(new FluxerResources(client).instance.describe(), cause => cause === failure);
});

test('adaptador self normaliza usuário e guilds e encaminha verificação sudo', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const self = new FluxerResources(client).self;
  await assert.rejects(self.fetch(), /não está pronto/);
  await assert.rejects(self.guilds(), /não está pronto/);
  await assert.rejects(self.leaveGuild('g1'), /não está pronto/);
  await assert.rejects(self.deleteMyMessages('g1'), /não está pronto/);
  const calls: unknown[][] = [];
  const user = fakeUser({
    async fetch() { calls.push(['fetch']); return this; },
    async fetchGuilds(options: unknown) {
      calls.push(['guilds', options]);
      return [
        { id: 'g1', name: 'srv', icon: 'ih', owner: true, permissions: '8', features: ['X'],
          approximateMemberCount: 40, approximatePresenceCount: 10 },
        { id: 'g2', name: 's2', icon: null },
      ];
    },
    async leaveGuild(guildID: string, options: unknown) { calls.push(['leave', guildID, options]); },
    async bulkDeleteMyMessagesInGuild(guildID: string, options: unknown) { calls.push(['bulk', guildID, options]); },
  });
  Reflect.set(client, 'user', user);
  assert.deepEqual(await self.fetch(), { id: '1', username: 'bot', displayName: 'bot', bot: true,
    avatarURL: null, bannerURL: null, createdTimestamp: 100 });
  assert.deepEqual(await self.guilds({ withCounts: true }), [
    { id: 'g1', name: 'srv', icon: 'ih', owner: true, permissions: '8', features: ['X'], memberCount: 40, onlineCount: 10 },
    { id: 'g2', name: 's2', icon: null, owner: false, permissions: null, features: [], memberCount: null, onlineCount: null },
  ]);
  await self.leaveGuild('g1', { password: 'pw', mfaCode: '123' });
  await self.deleteMyMessages('g2', { mfaMethod: 'totp', mfaCode: '456' });
  assert.deepEqual(calls, [
    ['fetch'],
    ['guilds', { withCounts: true }],
    ['leave', 'g1', { password: 'pw', mfaCode: '123' }],
    ['bulk', 'g2', { mfaMethod: 'totp', mfaCode: '456' }],
  ]);
});

test('adaptador de cache combina contagens e limites e converte filtros de sweep', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  Reflect.set(client.cache, 'stats', () => ({ guilds: 1, channels: 2, users: 3, members: 4,
    messages: 99, messageChannels: 8, roles: 5, emojis: 6, stickers: 7 }));
  Reflect.set(client, '_messageCacheStats', () => ({ channels: 2, messages: 9 }));
  Reflect.set(client.cache, 'limits', { guilds: 100, channels: Infinity, users: 500, members: Infinity,
    messages: false, roles: 0, emojis: 10, stickers: Infinity });
  const cache = new FluxerResources(client).cache;
  assert.deepEqual(await cache.stats(), {
    guilds: 1, channels: 2, users: 3, members: 4, messages: 9, messageChannels: 2,
    roles: 5, emojis: 6, stickers: 7,
    limits: { guilds: 100, channels: null, users: 500, members: null,
      messages: false, roles: 0, emojis: 10, stickers: null },
  });
  const messages = [
    fakeMessage({ id: 'old', channelId: 'c1', createdAt: new Date(Date.now() - 10_000) }),
    fakeMessage({ id: 'new', channelId: 'c1', createdAt: new Date(Date.now() - 100) }),
    fakeMessage({ id: 'other', channelId: 'c2' }),
  ];
  Reflect.set(client, 'sweepMessages', (filter: ((m: unknown, id: string) => boolean) | undefined, channelId?: string) =>
    messages.filter(message => (channelId === undefined || message.channelId === channelId)
      && (filter === undefined || filter(message, message.channelId))).length);
  assert.equal(await cache.sweepMessages(), 3);
  assert.equal(await cache.sweepMessages({ channelID: 'c1' }), 2);
  assert.equal(await cache.sweepMessages({ channelID: 'c1', maxAgeMs: 5_000 }), 1);
  const seen: MessageInfo[] = [];
  assert.equal(await cache.sweepMessages({ channelID: 'c1', keep: message => { seen.push(message); return message.id === 'new'; } }), 1);
  assert.deepEqual(seen.map(message => message.id), ['old', 'new']);
  assert.equal(seen[0]!.channelID, 'c1');
  await assert.rejects(cache.sweepMessages({ maxAgeMs: -1 }), /maxAgeMs/);
  const member = fakeMember('g1');
  Reflect.set(client, 'sweepMembers', (filter: ((m: unknown, id: string) => boolean) | undefined) =>
    filter === undefined || filter(member, 'g1') ? 1 : 0);
  assert.equal(await cache.sweepMembers(), 1);
  assert.equal(await cache.sweepMembers({ guildID: 'g1' }), 1);
  assert.equal(await cache.sweepMembers({ guildID: 'g2' }), 0);
  const kept: string[] = [];
  assert.equal(await cache.sweepMembers({ keep: (memberInfo, guildID) => {
    kept.push(`${memberInfo.id}@${guildID}:${memberInfo.nickname}`);
    return true;
  } }), 0);
  assert.deepEqual(kept, ['u1@g1:null']);
});

test('bulkFetch hidrata mensagens por padrão e devolve o bruto com hydrate false', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const raw = apiMessage();
  const seen: unknown[][] = [];
  Reflect.set(client, 'bulkFetchMessages', async (requests: unknown[], options?: { hydrate?: boolean }) => {
    seen.push([requests, options]);
    if (options?.hydrate === false) return { channels: [{ channel_id: 'c1', messages: [raw] }] };
    return { channels: [{ channelId: 'c1', messages: new Map([[raw.id as string, new Message(client, raw as never)]]) }] };
  });
  const messages = new FluxerResources(client).messages;
  const hydrated = await messages.bulkFetch([{ channelID: 'c1', limit: 5, before: 'm0' }]) as MessageInfo[];
  assert.equal(hydrated.length, 1);
  assert.equal(hydrated[0]!.id, raw.id as string);
  assert.equal(hydrated[0]!.channelID, 'c1');
  assert.equal(hydrated[0]!.authorName, 'ana');
  assert.deepEqual(await messages.bulkFetch([{ channelID: 'c1', limit: 5 }], { hydrate: false }),
    [{ channelID: 'c1', messages: [raw] }]);
  assert.deepEqual(seen, [
    [[{ channelId: 'c1', limit: 5, before: 'm0' }], undefined],
    [[{ channelId: 'c1', limit: 5 }], { hydrate: false }],
  ]);
});

test('searchAll usa a busca global do client com os mesmos tipos de search', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const raw = apiMessage({ id: '111111111111111111' });
  const seen: unknown[] = [];
  Reflect.set(client, 'searchMessages', async (options: unknown) => {
    seen.push(options);
    return { messages: [raw], channels: [], total: 1, hitsPerPage: 25, page: 0, cursor: ['cur'] };
  });
  const messages = new FluxerResources(client).messages;
  const page = await messages.searchAll({ content: 'oi', channelID: '100', limit: 25 });
  assert.equal(page.indexing, false);
  assert.equal(page.total, 1);
  assert.deepEqual(page.cursor, ['cur']);
  assert.equal(page.messages[0]!.id, '111111111111111111');
  assert.deepEqual(seen, [{ content: 'oi', contextGuildId: undefined, contextChannelId: '100',
    channelIds: ['100'], authorIds: undefined, hitsPerPage: 25, cursor: undefined }]);
  Reflect.set(client, 'searchMessages', async () => ({ indexing: true }));
  assert.deepEqual(await messages.searchAll({ content: 'oi' }), { indexing: true, messages: [], total: 0, cursor: null });
});
