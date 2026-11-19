import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandContext, GuardError, MemoryStore } from '../src/index.js';
import { Runtime, functions, registerBuiltins } from '../src/functions.js';
import { MockTransport, createTestBot, mockMessage, mockResources } from '../src/testing.js';
import type { MockResourceOverrides } from '../src/testing.js';
import type { ContextOptions } from '../src/commands/context.js';
import type { ChannelInfo } from '../src/ports/resources/channels.js';
import type { ApplicationInfo } from '../src/ports/resources/instance.js';
import type { MessageInfo } from '../src/ports/resources/messages.js';

function channel(id: string): ChannelInfo {
  return { id, name: 'teste', guildID: id === '300' ? '101' : '100', parentID: id === '202' ? '201' : null,
    type: id === '201' ? 15 : id === '202' ? 11 : 0, position: 0, topic: null, slowmode: 0, nsfw: false };
}

function harness(resources: MockResourceOverrides = {}, { owner = true, dm = false, authorID = '1', ...options }:
  Partial<ContextOptions> & { owner?: boolean; dm?: boolean; authorID?: string } = {}) {
  const transport = new MockTransport();
  const runtime = registerBuiltins(new Runtime());
  return { transport, run: (source: string, input?: unknown) => {
    const ctx = new CommandContext({
      transport, message: mockMessage('!teste', { authorID, guildID: dm ? undefined : '100' }),
      command: { name: 'teste', code: '' }, cooldown: () => 0, store: new MemoryStore(),
      resources: mockResources({ ...resources, channels: { async get(id) { return channel(id); }, ...resources.channels } }),
      isOwner: () => owner, ...options,
    });
    ctx.vars.set('entrada', input);
    return runtime.execute(runtime.compile(source), ctx);
  } };
}

const application: ApplicationInfo = { id: '123', name: 'bot', icon: null, description: null, botPublic: true,
  botRequireCodeGrant: false, verifyKey: 'pública', flags: 0, ownerID: '1', botID: '999', redirectURIs: [], clientSecret: 'segredo simulado' };

const message: MessageInfo = { id: '99', channelID: '200', authorID: '999', authorName: 'bot', content: 'teste',
  createdTimestamp: 0, pinned: false, attachments: [], embeds: [] };

test('introspecção de instância e self remove segredos e só expõe dados administrativos a donos', async () => {
  const calls: unknown[] = [];
  const resources: MockResourceOverrides = {
    instance: {
      async describe() {
        const url = 'https://fluxer.invalid';
        return { apiCodeVersion: null, codename: null, features: null, registrationMode: null,
          ssoEnabled: null, ssoEnforced: null, singleCommunity: null, singleCommunityGuildID: null,
          directMessagesDisabled: null, services: null, endpoints: { api: url, apiClient: url, apiPublic: url,
            gateway: 'wss://fluxer.invalid', media: url, staticCDN: url, marketing: url, admin: url,
            invite: url, gift: url, webapp: url } };
      },
      async application() { return application; },
      async oauthApplications() { return [application]; },
      async gatewayInfo() { return { url: 'wss://gateway.invalid', shards: 2, sessionStartLimit: null }; },
      async emojiMetadata(id) { return { id, guildID: '100', name: 'emoji', animated: false, allowCloning: true }; },
      async stickerMetadata(id) { return { id, guildID: '100', name: 'sticker', animated: false, allowCloning: false }; },
      async resolveEmoji(value, guildID) { calls.push([value, guildID]); return String(value); },
    },
    self: {
      async fetch() { return { id: '999', username: 'bot', displayName: 'bot', bot: true, avatarURL: null, bannerURL: null, createdTimestamp: 0 }; },
      async guilds(input) { calls.push(input); return []; },
      async leaveGuild(...args) { calls.push(['leave', args]); },
      async deleteMyMessages(...args) { calls.push(['delete', args]); },
    },
  };
  const { run } = harness(resources);
  const { clientSecret: _secret, ...safe } = application;
  assert.deepEqual(await run('$applicationInfo'), safe);
  assert.equal((await run('$instanceInfo') as { codename: string | null }).codename, null);
  assert.deepEqual(await run('$oauthApplications'), [safe]);
  assert.deepEqual(await run('$gatewayInfo'), { url: 'wss://gateway.invalid', shards: 2, sessionStartLimit: null });
  assert.equal((await run('$selfUser') as { id: string }).id, '999');
  assert.deepEqual(await run('$selfGuilds[true]'), []);
  assert.equal(await run('$resolveEmoji[✅]'), '✅');
  assert.equal((await run('$emojiMetadata[12]') as { id: string }).id, '12');
  assert.equal((await run('$stickerMetadata[34]') as { id: string }).id, '34');
  await run('$selfLeaveGuild');
  await run('$deleteMyMessages');
  assert.deepEqual(calls, [{ withCounts: true }, ['✅', '100'], ['leave', ['100']], ['delete', ['100']]]);
  await assert.rejects(run('$try[$selfGuilds[não];ignorado]'), GuardError);
  const guest = harness(resources, { owner: false });
  for (const code of ['$instanceInfo', '$gatewayInfo', '$applicationInfo', '$oauthApplications', '$selfGuilds', '$selfUser', '$selfLeaveGuild', '$deleteMyMessages']) {
    await assert.rejects(guest.run(`$try[${code};ignorado]`), { reason: 'OWNER_ONLY' });
  }
  const dm = harness(resources, { dm: true });
  assert.equal(await dm.run('$resolveEmoji[👍]'), '👍');
  assert.deepEqual(calls.at(-1), ['👍', undefined]);
  await assert.rejects(dm.run('$selfLeaveGuild'), GuardError);
  await assert.rejects(dm.run('$deleteMyMessages'), GuardError);
  const notGuildOwner = harness(resources, { authorID: '2' });
  await assert.rejects(notGuildOwner.run('$selfLeaveGuild'), { reason: 'PERMISSION_MISSING_AUTHOR' });
  const botGuildOwner = harness(resources);
  botGuildOwner.transport.setMember('100', { id: '999', owner: true, permissions: 0n, rank: 0 });
  await assert.rejects(botGuildOwner.run('$selfLeaveGuild'), { reason: 'PERMISSION_MISSING_BOT' });
});

test('cache limita parâmetros, distingue cascata de remoção e não aceita $try para negar acesso', async () => {
  const log: unknown[] = [];
  const limits = { guilds: null, channels: 20, users: null, members: null, messages: false as const, roles: null,
    emojis: null, stickers: null, cascading: true };
  const resources: MockResourceOverrides = { cache: {
    async stats() { return { guilds: 0, channels: 1, users: 0, members: 0, messages: 0, messageChannels: 0,
      roles: 0, emojis: 0, stickers: 0, limits }; },
    async sweepMessages(input) { log.push(input); return 2; },
    async sweepMembers(input) { log.push(input); return 0; },
    async sweepChannels(input) { return input?.keep?.(channel('200'), '200') ? 0 : 1; },
    async sweepUsers() { return 0; },
    async sweepGuilds() { return 0; },
    async cascadeGuild(id) { log.push(id); },
    async cascadeChannel(id) { log.push(id); },
  } };
  const { run } = harness(resources, { dm: true });
  assert.deepEqual((await run('$cacheStats') as { limits: unknown }).limits, limits);
  assert.equal(await run('$sweepCache[messages;200;1000]'), 2);
  for (const bucket of ['users', 'guilds', 'members']) assert.equal(await run(`$sweepCache[${bucket}]`), 0);
  assert.equal(await run('$evictCachedChannel[200]'), true);
  assert.equal(await run('$evictCachedChannel[201]'), false);
  await run('$cascadeCache[guild;100]');
  await run('$cascadeCache[channel;200]');
  for (const code of ['$sweepCache[users;200]', '$sweepCache[messages;200;-1]', '$sweepCache[qualquer]', '$cascadeCache[guild;id]']) {
    await assert.rejects(run(`$try[${code};ignorado]`), GuardError);
  }
  assert.deepEqual(log, [{ channelID: '200', maxAgeMs: 1000 }, { guildID: undefined }, '100', '200']);
  await assert.rejects(harness(resources, { owner: false }).run('$try[$sweepCache[users];ignorado]'), { reason: 'OWNER_ONLY' });
});

test('gateway valida lotes inteiros e exige permissões de autor e bot antes de enviar', async () => {
  const log: unknown[] = [];
  const resources: MockResourceOverrides = { gateway: {
    async fetchMembers({ signal, ...input }) {
      assert.ok(signal instanceof AbortSignal);
      log.push(input);
      return { guildID: '100', members: [], notFound: ['2'], chunkCount: 1, nonce: 'teste' };
    },
    requestMembers(input) { log.push(input); },
    requestGuildCounts(ids) { log.push(ids); },
    requestChannelCounts(input) { log.push(input); },
    requestForumUnreads(input) { log.push(input); },
    subscribeThreads(input) { log.push(input); },
  } };
  const { transport, run } = harness(resources);
  await run('$requestGatewayMembers');
  assert.deepEqual(await run('$fetchGatewayMembers[$get[entrada]]', { userIDs: ['2', '2'], timeoutMs: 200 }),
    { guildID: '100', members: [], notFound: ['2'], chunkCount: 1, nonce: 'teste' });
  await run('$requestGuildCounts');
  await run('$requestChannelCounts[$get[entrada]]', ['200']);
  await run('$requestForumUnreads[201;$get[entrada]]', [{ threadID: '202', ackMessageID: '205' }]);
  await run('$subscribeThreads[true;$get[entrada]]', ['202']);
  assert.deepEqual(log, [
    { guildID: '100', query: '', limit: 25, presences: undefined },
    { guildID: '100', userIDs: ['2'], timeoutMs: 200, presences: undefined },
    ['100'], { guildID: '100', channelIDs: ['200'] },
    { guildID: '100', channelID: '201', threads: [{ threadID: '202', ackMessageID: '205' }] },
    { guildID: '100', threads: true, threadIDs: ['202'] },
  ]);
  await assert.rejects(run('$fetchGatewayMembers[$get[entrada]]', { limit: 0 }), GuardError);
  await assert.rejects(run('$fetchGatewayMembers[$get[entrada]]', { guildID: '101' }), GuardError);
  await assert.rejects(run('$requestChannelCounts[$get[entrada]]', ['200', '300']), GuardError);
  await assert.rejects(run('$requestChannelCounts[$get[entrada]]', []), GuardError);
  await assert.rejects(run('$requestForumUnreads[201;$get[entrada]]', [{ threadID: '200' }]), GuardError);
  await assert.rejects(harness(resources, { dm: true }).run('$requestGuildCounts'), GuardError);
  await assert.rejects(harness(resources, { authorID: '2' }).run('$try[$requestGuildCounts;ignorado]'), { reason: 'PERMISSION_MISSING_AUTHOR' });
  transport.setMember('100', { id: '999', owner: false, permissions: 0n, rank: 0 });
  await assert.rejects(run('$try[$requestGuildCounts;ignorado]'), { reason: 'PERMISSION_MISSING_BOT' });
  assert.equal(log.length, 6);
});

test('collectors delimitam iteração, limpam ao atingir máximo e propagam falhas sem expor raw', async () => {
  let closed = false;
  const resources: MockResourceOverrides = { collectors: {
    async *collectMessages(id, input) {
      assert.equal(id, '200');
      assert.equal(input.contains, 'ok');
      assert.equal(input.max, 1);
      assert.ok(input.signal instanceof AbortSignal);
      try {
        yield { ...mockMessage('ok'), raw: { token: 'não vazar' } };
        assert.fail('Não deve continuar depois do máximo.');
      } finally { closed = true; }
    },
    async *collectReactions(_id, input) {
      assert.equal(input.messageID, '99');
      if (input.userID) {
        yield { userID: input.userID, emoji: '👍' };
        throw new Error('stream interrompido');
      }
    },
  } };
  const { run } = harness(resources, { dm: true });
  const result = await run('$collectMessages[50;1;;ok]') as Record<string, unknown>[];
  assert.equal(result[0]?.content, 'ok');
  assert.equal(Object.hasOwn(result[0]!, 'raw'), false);
  assert.equal(closed, true);
  assert.deepEqual(await run('$collectReactions[99;50]'), []);
  await assert.rejects(run('$collectReactions[99;50;2;1]'), (error: Error) =>
    error.cause instanceof Error && error.cause.message === 'stream interrompido');
  await assert.rejects(run('$try[$collectMessages[30001];ignorado]'), GuardError);
  await assert.rejects(harness(resources, { authorID: '2' }).run('$collectMessages[10]'), { reason: 'PERMISSION_MISSING_AUTHOR' });
  await assert.rejects(harness(resources, { dm: true, authorID: '' }).run('$collectMessages[10]'), GuardError);
});

test('mensagens de webhook verificam servidor, autor, bot e thread sem receber token no script', async () => {
  const calls: unknown[] = [];
  const resources: MockResourceOverrides = { webhooks: {
    async fetch(id) { return { id, name: 'webhook', guildID: '100', channelID: '201', token: id === '31' ? null : 'mock-token' }; },
    async fetchMessage(...args) { calls.push(args); return message; },
    async editMessage(...args) { calls.push(args); return '99'; },
    async deleteMessage(...args) { calls.push(args); },
  } };
  const { run, transport } = harness(resources);
  assert.deepEqual(await run('$fetchWebhookMessage[30;99;202]'), message);
  assert.equal(await run('$editWebhookMessage[30;99;texto]'), '99');
  assert.equal(await run('$deleteWebhookMessage[30;99]'), '');
  assert.deepEqual(calls, [
    ['30', 'mock-token', '99', { threadID: '202' }],
    ['30', 'mock-token', '99', { content: 'texto', allowedMentions: { parse: [], repliedUser: false } }],
    ['30', 'mock-token', '99'],
  ]);
  await assert.rejects(run('$deleteWebhookMessage[31;99]'), GuardError);
  await assert.rejects(run('$deleteWebhookMessage[30;99;200]'), GuardError);
  await assert.rejects(run('$deleteWebhookMessage[30;99;300]'), GuardError);
  await assert.rejects(run('$editWebhookMessage[30;x;teste]'), GuardError);
  await assert.rejects(harness(resources, { dm: true }).run('$fetchWebhookMessage[30;99]'), GuardError);
  await assert.rejects(harness(resources, { authorID: '2' }).run('$fetchWebhookMessage[30;99]'), { reason: 'PERMISSION_MISSING_AUTHOR' });
  transport.setMember('100', { id: '999', owner: false, permissions: 0n, rank: 0 });
  await assert.rejects(run('$fetchWebhookMessage[30;99]'), { reason: 'PERMISSION_MISSING_BOT' });
  assert.equal(calls.length, 3);
});

test('consultas de canal e mensagens não atravessam servidores nem retornam lote parcial como sucesso', async () => {
  const calls: unknown[] = [];
  const resources: MockResourceOverrides = {
    channels: {
      async slowmode() { return 20; }, async rtcRegions() { return []; }, async sendTyping(id) { calls.push(id); },
    },
    messages: {
      async cached(_id, messageID) { return messageID === '99' ? message : null; },
      async list(id, _limit, cursor) { calls.push([id, cursor]); if (id === '201') throw new Error('canal indisponível'); return [message]; },
    },
  };
  const { run } = harness(resources);
  assert.equal(await run('$channelSlowmode[200]'), 20);
  assert.deepEqual(await run('$channelRtcRegions[200]'), []);
  assert.equal(await run('$sendTyping'), '');
  assert.deepEqual(await run('$cachedMessage[99]'), message);
  assert.equal(await run('$cachedMessage[98]'), null);
  assert.deepEqual(await run('$bulkFetchMessages[$get[entrada]]', [{ channelID: '200', limit: 2, before: '100' }]), [message]);
  await assert.rejects(run('$bulkFetchMessages[$get[entrada]]', [{ channelID: '200', limit: 1 }, { channelID: '300', limit: 1 }]), GuardError);
  await assert.rejects(run('$bulkFetchMessages[$get[entrada]]', [{ channelID: '200', limit: 1 }, { channelID: '201', limit: 1 }]),
    (error: Error) => error.cause instanceof Error && error.cause.message === 'canal indisponível');
  await assert.rejects(harness(resources, { authorID: '2' }).run('$cachedMessage[99]'), GuardError);
  assert.deepEqual(calls, ['200', ['200', { before: '100' }], ['200', {}], ['201', {}]]);
});

test('diagnósticos retornam snapshots, limitam argumentos e não modificam a conexão', async () => {
  const gateway = { url: 'wss://gateway.invalid/', count: 2, ping: 10, shards: [{ id: 1, status: 'open', ping: 10 }] };
  const readiness = { ready: true, readyAt: 100, uptimeMs: 200 };
  const runtimeInfo: NonNullable<ContextOptions['runtimeInfo']> = {
    readiness: () => readiness,
    gateway: async () => gateway,
    cluster: id => ({ size: 1, runtimes: id && id !== 'teste' ? [] : [{ id: 'teste', status: 'ready' }] }),
  };
  const { run } = harness({}, { runtimeInfo });
  assert.deepEqual(await run('$botReadiness'), readiness);
  assert.equal(await run('$requireBotReady'), '');
  assert.deepEqual(await run('$gatewayStatus'), gateway);
  assert.deepEqual(await run('$clusterInfo[ausente]'), { size: 1, runtimes: [] });
  assert.deepEqual(await run('$clusterInfo[teste]'), { size: 1, runtimes: [{ id: 'teste', status: 'ready' }] });
  const empty = harness();
  assert.equal(await empty.run('$shardInfo'), null);
  assert.equal(await empty.run('$gatewayStatus'), null);
  assert.equal(await empty.run('$clusterInfo'), null);
  await assert.rejects(empty.run('$try[$requireBotReady;ignorado]'), GuardError);
  await assert.rejects(harness({}, { owner: false, runtimeInfo }).run('$gatewayStatus'), { reason: 'OWNER_ONLY' });
  assert.equal(await run('$shardIdForGuild[4194304;2]'), 1);
  assert.equal(await run('$guildMatchesShard[4194304;1;2]'), true);
  await assert.rejects(run('$guildMatchesShard[4194304;2;2]'), GuardError);
  assert.equal(await run('$recommendedShardCount[1501]'), 2);
  assert.equal(await run('$gatewayShouldReconnect[1006]'), true);
  assert.equal(await run('$gatewaySessionFresh[1000;500;1500]'), true);
  assert.equal(await run('$gatewaySessionFresh[1000;500;1501]'), false);
  assert.ok((await run('$gatewayConstants') as { maxShardCount: number }).maxShardCount > 0);
  assert.equal((await run('$restDefaults') as { locale: string }).locale, 'en-US');
  assert.deepEqual(await run('$normalizeGatewayPayload[$get[entrada]]', { op: 0, t: 'teste', d: { ok: true }, ignored: true }),
    { op: 0, t: 'teste', d: { ok: true } });
  assert.equal(await run('$normalizeGatewayPayload[$get[entrada]]', {}), null);
  assert.deepEqual(await run('$restRateLimits[$get[entrada]]', [
    { op: 'getBucket', route: '/teste' }, { op: 'setBucket', route: '/teste', limit: 4, remaining: 3, resetAt: Number.MAX_SAFE_INTEGER },
    { op: 'getBucket', route: '/teste' }, { op: 'size' },
  ]), [null, null, { limit: 4, remaining: 3, resetAt: Number.MAX_SAFE_INTEGER }, 1]);
  assert.deepEqual(await run('$restRateLimits[$get[entrada]]', [{ op: 'size' }]), [0]);
  await assert.rejects(run('$restRateLimits[$get[entrada]]', [{ op: 'getBucket' }]), GuardError);
});

test('dispatch real com MockTransport recebe snapshot local antes de conectar', async t => {
  const fixture = createTestBot({ engine: functions(), commands: [{ name: 'teste', code: '$botReadiness' }] });
  t.after(() => fixture.close());
  assert.equal(await fixture.send('!teste'), 'success');
  assert.deepEqual(JSON.parse(fixture.transport.messages[0]!.payload.content!), { ready: false, readyAt: null, uptimeMs: null });
});
