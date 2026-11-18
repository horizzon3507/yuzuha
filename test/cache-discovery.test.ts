import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setImmediate } from 'node:timers/promises';
import { Client, Events, Guild, GuildMember } from '@fluxerjs/core';
import {
  ConfigError,
  MemoryStore,
  Yuzuha,
  currentExecution,
  defineConfig,
  isYuzuhaError,
} from '../src/index.js';
import type { Store } from '../src/index.js';
import { configuredBot } from '../src/cli/config.js';
import { doctor } from '../src/cli/doctor.js';
import { MockTransport, mockResources } from '../src/testing.js';

function trackedTimers() {
  const pending = new Map<number, { fn: () => void; at: number }>();
  let now = 0;
  let seq = 0;
  return {
    get activeCount(): number {
      return pending.size;
    },
    setTimeout(fn: () => void, ms: number): unknown {
      const handle = ++seq;
      pending.set(handle, { fn, at: now + ms });
      return handle;
    },
    clearTimeout(handle: unknown): void {
      pending.delete(handle as number);
    },
    advance(ms: number): void {
      now += ms;
      for (const [handle, timer] of [...pending]) {
        if (timer.at <= now) {
          pending.delete(handle);
          timer.fn();
        }
      }
    },
  };
}

function addCachedMessage(
  client: Client,
  channelID: string,
  input: { id: string; createdAtMs: number; pinned?: boolean; content?: string; authorID?: string },
): void {
  const adder = Reflect.get(client, '_addMessageToCache') as (channelId: string, data: unknown) => void;
  adder.call(client, channelID, {
    id: input.id,
    channel_id: channelID,
    content: input.content ?? 'mensagem',
    timestamp: new Date(input.createdAtMs).toISOString(),
    edited_timestamp: null,
    pinned: input.pinned ?? false,
    attachments: [],
    author: {
      id: input.authorID ?? '101',
      username: 'autora',
      discriminator: '0001',
      global_name: null,
      avatar: null,
      avatar_color: null,
      flags: 0,
    },
  });
}

function addCachedGuildMember(client: Client, guildID: string, userID: string, bot = false): void {
  let guild = client.guilds.get(guildID);
  if (!guild) {
    guild = new Guild(client, { id: guildID, name: `Srv ${guildID}`, ownerId: '1' } as never);
    client.guilds.set(guildID, guild);
  }
  const member = new GuildMember(
    client,
    {
      user: {
        id: userID,
        username: `user-${userID}`,
        discriminator: '0001',
        global_name: null,
        avatar: null,
        avatar_color: null,
        flags: 0,
        bot,
      },
      roles: [],
      joined_at: '2026-01-01T00:00:00.000Z',
      mute: false,
      deaf: false,
    } as never,
    guild,
  );
  guild.members.set(userID, member);
}

function addCachedUser(client: Client, userID: string, bot = false): void {
  const upsert = Reflect.get(client, 'getOrCreateUser') as (data: unknown) => unknown;
  upsert.call(client, { id: userID, username: `user-${userID}`, bot });
}

test('valida cacheSweepers, discovery e clientOptions com códigos de ConfigError apropriados', async t => {
  const client = new Client();
  t.after(() => client.destroy());

  for (const invalidSweepers of [
    null,
    [],
    'auto',
    { channels: { intervalMs: 1_000 } },
    { messages: 'auto' },
    { messages: { intervalMs: 99 } },
    { messages: { intervalMs: 86_400_001 } },
    { messages: { intervalMs: 500.5 } },
    { messages: { intervalMs: 1_000, maxAgeMs: -1 } },
    { messages: { intervalMs: 1_000, channelID: '   ' } },
    { members: { intervalMs: 1_000, guildID: '' } },
    { users: { intervalMs: 1_000, keep: 'invalid' } },
  ]) {
    assert.throws(
      () => new Yuzuha({
        cacheSweepers: invalidSweepers as never,
        transport: new MockTransport(),
        store: new MemoryStore(),
        scheduler: false,
        variables: false,
      }),
      err => err instanceof ConfigError && isYuzuhaError(err, 'CACHE_SWEEPER_OPTIONS'),
    );
  }

  for (const invalidDiscovery of [
    '',
    '   ',
    'nao-e-url',
    'ws://fluxer.example',
    'ftp://fluxer.example',
    null,
    [],
    { api: '' },
    { api: 'https://fluxer.example', version: '   ' },
    { api: 'https://fluxer.example', extra: true },
  ]) {
    assert.throws(
      () => new Yuzuha({
        discovery: invalidDiscovery as never,
        transport: new MockTransport(),
        store: new MemoryStore(),
        scheduler: false,
        variables: false,
      }),
      err => err instanceof ConfigError && isYuzuhaError(err, 'DISCOVERY_OPTIONS'),
    );
  }

  assert.throws(
    () => new Yuzuha({
      client,
      discovery: 'https://fluxer.example',
      transport: new MockTransport(),
      store: new MemoryStore(),
    }),
    err => err instanceof ConfigError && isYuzuhaError(err, 'DISCOVERY_OPTIONS'),
  );

  assert.throws(
    () => new Yuzuha({
      discovery: 'https://fluxer.example',
      clientOptions: { instance: { api_public: 'https://fluxer.example/api' } },
      transport: new MockTransport(),
      store: new MemoryStore(),
    }),
    err => err instanceof ConfigError && isYuzuhaError(err, 'DISCOVERY_OPTIONS'),
  );

  assert.throws(
    () => new Yuzuha({
      clientOptions: [] as never,
      transport: new MockTransport(),
      store: new MemoryStore(),
    }),
    err => err instanceof ConfigError && isYuzuhaError(err, 'OPTIONS'),
  );

  assert.throws(
    () => new Yuzuha({
      clientOptions: {
        instance: { api_public: 'https://um.example/api' },
        rest: { api: 'https://outro.example/api' },
      },
      transport: new MockTransport(),
      store: new MemoryStore(),
    }),
    err => err instanceof ConfigError && isYuzuhaError(err, 'OPTIONS') && err.cause instanceof Error,
  );

  const noopBot = new Yuzuha({
    cacheSweepers: { messages: false, members: false, users: false },
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    variables: false,
  });
  const disposeNoop = noopBot.startCacheSweepers();
  disposeNoop();
  await noopBot.destroy();
});

test('cacheSweepers limpa mensagens, membros e usuários periodicamente e não vaza timers em destroy()', async () => {
  const timers = trackedTimers();
  let clockNow = 10_000;
  const client = new Client();

  addCachedMessage(client, '301', { id: '9001', createdAtMs: 2_000, pinned: false });
  addCachedMessage(client, '301', { id: '9002', createdAtMs: 2_000, pinned: true });
  addCachedMessage(client, '301', { id: '9003', createdAtMs: 8_000, pinned: false });
  addCachedMessage(client, '302', { id: '9004', createdAtMs: 1_000, pinned: false });

  addCachedGuildMember(client, '201', '101', false);
  addCachedGuildMember(client, '201', '102', true);
  addCachedGuildMember(client, '202', '103', false);

  addCachedUser(client, '101', false);
  addCachedUser(client, '102', true);
  addCachedUser(client, '103', false);

  const observedSources = new Set<string | undefined>();
  const bot = new Yuzuha({
    client,
    transport: new MockTransport(),
    store: new MemoryStore(),
    timers,
    now: () => clockNow,
    scheduler: false,
    variables: false,
    cacheSweepers: {
      messages: {
        intervalMs: 1_000,
        channelID: '301',
        maxAgeMs: 5_000,
        keep: message => {
          observedSources.add(currentExecution()?.source);
          return message.pinned;
        },
      },
      members: {
        intervalMs: 2_000,
        guildID: '201',
        keep: member => member.id === '101',
      },
      users: {
        intervalMs: 3_000,
        keep: user => !user.bot,
      },
    },
  });

  assert.equal(timers.activeCount, 0);
  const stop = bot.startCacheSweepers();
  assert.equal(timers.activeCount, 3);
  const stopDuplicate = bot.startCacheSweepers();
  assert.equal(timers.activeCount, 3);

  // t = +1s: sweeper de mensagens remove apenas 9001 em 301 (mantém fixada, recente e 302)
  timers.advance(1_000);
  await setImmediate();
  let stats = await bot.resources.cache.stats();
  assert.equal(stats.messages, 3);
  assert.equal(stats.members, 3);
  assert.equal(stats.users, 3);
  assert.deepEqual([...observedSources], ['scheduler']);

  // t = +2s: sweeper de membros remove 102 de 201 e preserva 101 (201) e 103 (202)
  timers.advance(1_000);
  await setImmediate();
  stats = await bot.resources.cache.stats();
  assert.equal(stats.members, 2);
  assert.equal(client.guilds.get('201')?.members.has('101'), true);
  assert.equal(client.guilds.get('201')?.members.has('102'), false);
  assert.equal(client.guilds.get('202')?.members.has('103'), true);

  // t = +3s (avançando também clockNow para expirar 9003): sweeper de usuários remove bot 102
  clockNow = 20_000;
  timers.advance(1_000);
  await setImmediate();
  stats = await bot.resources.cache.stats();
  assert.equal(stats.messages, 2); // 9002 em 301 + 9004 em 302
  assert.equal(stats.users, 2);
  assert.equal(client.users.has('102'), false);
  assert.equal(client.users.has('101'), true);
  assert.equal(client.users.has('103'), true);

  // Disposer para os timers e é idempotente; stopDuplicate não interfere em nova sessão
  stop();
  stop();
  assert.equal(timers.activeCount, 0);

  // Reinicia via login() e garante drenagem e limpeza completa em destroy()
  Reflect.set(client, 'login', async () => {});
  await bot.login('token-offline');
  assert.equal(timers.activeCount, 3);
  stopDuplicate();
  assert.equal(timers.activeCount, 3);

  await bot.destroy();
  assert.equal(timers.activeCount, 0);
  addCachedUser(client, '199', true);
  timers.advance(10_000);
  await setImmediate();
  assert.equal(client.users.has('199'), true);
  assert.throws(() => bot.startCacheSweepers(), err => isYuzuhaError(err, 'BOT_CLOSED'));
});

test('cacheSweepers reporta falhas em onError e drena limpeza em andamento no stopCacheSweepers()', async () => {
  const timers = trackedTimers();
  const reported: Array<{ error: unknown; source?: string }> = [];
  let releaseSweep: (() => void) | undefined;
  let calls = 0;

  const resources = mockResources({
    cache: {
      async sweepUsers() {
        calls++;
        if (calls === 1) throw new Error('falha transitória no sweep');
        await new Promise<void>(resolve => { releaseSweep = resolve; });
        return 1;
      },
    },
  });

  const bot = new Yuzuha({
    transport: new MockTransport(),
    resources,
    store: new MemoryStore(),
    timers,
    scheduler: false,
    variables: false,
    cacheSweepers: { users: { intervalMs: 500 } },
    onError(error, _ctx, info) {
      reported.push({ error, source: info.source });
    },
  });

  bot.startCacheSweepers();
  timers.advance(500);
  await setImmediate();
  assert.equal(reported.length, 1);
  assert.equal(reported[0]?.source, 'scheduler');
  assert.equal(timers.activeCount, 1);

  timers.advance(500);
  await setImmediate();
  assert.equal(calls, 2);
  let drained = false;
  const drainPromise = bot.stopCacheSweepers().then(() => { drained = true; });
  await setImmediate();
  assert.equal(drained, false);
  releaseSweep?.();
  await drainPromise;
  assert.equal(drained, true);
  assert.equal(timers.activeCount, 0);

  await bot.destroy();
});

test('discovery resolve endpoints via Client.fromDiscovery sem rede externa em login() e Yuzuha.fromDiscovery()', async t => {
  const discoveryCalls: Array<{ origin: unknown; options: unknown; hasSignal: boolean }> = [];
  const loggedTokens: string[] = [];
  let failNextLogin = false;

  t.mock.method(Client, 'fromDiscovery', async (
    origin: unknown,
    options?: Record<string, unknown>,
    connectOptions?: { signal?: AbortSignal },
  ) => {
    discoveryCalls.push({
      origin,
      options,
      hasSignal: connectOptions?.signal instanceof AbortSignal,
    });
    const discovered = new Client({
      ...(options ?? {}),
      instance: {
        api_public: 'https://api.selfhosted.example',
        media: 'https://cdn.selfhosted.example',
      },
    });
    Reflect.set(discovered, 'login', async (token: string) => {
      if (failNextLogin) {
        failNextLogin = false;
        throw new Error('falha simulada de autenticação');
      }
      loggedTokens.push(token);
    });
    return discovered;
  });

  // 1) Yuzuha.fromDiscovery estático
  const abortController = new AbortController();
  const staticBot = await Yuzuha.fromDiscovery(
    'https://selfhosted.example',
    {
      clientOptions: { shardCount: 2, ignoredEvents: ['TYPING_START'] },
      transport: new MockTransport(),
      store: new MemoryStore(),
      scheduler: false,
      variables: false,
    },
    { signal: abortController.signal },
  );
  assert.equal(discoveryCalls.length, 1);
  assert.deepEqual(discoveryCalls[0], {
    origin: 'https://selfhosted.example',
    options: { shardCount: 2, ignoredEvents: ['TYPING_START'] },
    hasSignal: true,
  });
  assert.equal(staticBot.client.instance.endpoints.api_public, 'https://api.selfhosted.example');
  await staticBot.destroy();

  // Falha de validação prévia não aciona Client.fromDiscovery
  await assert.rejects(
    Yuzuha.fromDiscovery('https://selfhosted.example', {
      cacheSweepers: { users: { intervalMs: 10 } },
      store: new MemoryStore(),
    }),
    err => err instanceof ConfigError && isYuzuhaError(err, 'CACHE_SWEEPER_OPTIONS'),
  );
  assert.equal(discoveryCalls.length, 1);

  // Se o construtor de Yuzuha falhar após fromDiscovery, o client descoberto é destruído
  let destroyedOnError = false;
  t.mock.method(Client, 'fromDiscovery', async () => {
    const tempClient = new Client();
    const originalDestroy = tempClient.destroy.bind(tempClient);
    Reflect.set(tempClient, 'destroy', async () => {
      destroyedOnError = true;
      await originalDestroy();
    });
    return tempClient;
  });
  await assert.rejects(
    Yuzuha.fromDiscovery('https://selfhosted.example', { prefix: '', store: new MemoryStore() }),
    err => err instanceof ConfigError && isYuzuhaError(err, 'PREFIX'),
  );
  assert.equal(destroyedOnError, true);

  // Restaura mock principal para testar YuzuhaOptions.discovery + login()
  t.mock.method(Client, 'fromDiscovery', async (
    origin: unknown,
    options?: Record<string, unknown>,
    connectOptions?: { signal?: AbortSignal },
  ) => {
    discoveryCalls.push({
      origin,
      options,
      hasSignal: connectOptions?.signal instanceof AbortSignal,
    });
    const discovered = new Client({
      ...(options ?? {}),
      instance: {
        api_public: 'https://api.selfhosted.example',
        media: 'https://cdn.selfhosted.example',
      },
    });
    Reflect.set(discovered, 'login', async (token: string) => {
      if (failNextLogin) {
        failNextLogin = false;
        throw new Error('falha simulada de autenticação');
      }
      loggedTokens.push(token);
    });
    return discovered;
  });

  // 2) YuzuhaOptions.discovery: construção offline, substituição de client no login(), rebind de eventos e retry após falha
  const lazyBot = new Yuzuha({
    discovery: { api: '  https://selfhosted.example  ', version: '1' },
    clientOptions: { shardCount: 3 },
    memberCache: { ttlMs: 10_000 },
    store: new MemoryStore(),
    scheduler: false,
    variables: false,
  });

  let initialDestroyed = false;
  const initialClient = lazyBot.client;
  const origInitialDestroy = initialClient.destroy.bind(initialClient);
  Reflect.set(initialClient, 'destroy', async () => {
    initialDestroyed = true;
    await origInitialDestroy();
  });

  let readyCount = 0;
  lazyBot.on(Events.Ready, () => { readyCount++; });
  assert.equal(discoveryCalls.length, 1); // Nenhuma chamada durante new Yuzuha(...)

  // Primeira tentativa falha em client.login -> reseta discoveryResolved para permitir nova tentativa
  failNextLogin = true;
  await assert.rejects(lazyBot.login('token-falho'), /falha simulada de autenticação/);
  assert.equal(initialDestroyed, true);
  assert.equal(discoveryCalls.length, 2);

  // Segunda tentativa sucede, rebinda eventos e atualiza CDN com media descoberta
  await lazyBot.login('token-valido');
  assert.equal(discoveryCalls.length, 3);
  assert.deepEqual(discoveryCalls.at(-1), {
    origin: { api: 'https://selfhosted.example', version: '1' },
    options: { shardCount: 3 },
    hasSignal: true,
  });
  assert.deepEqual(loggedTokens, ['token-valido']);
  assert.notEqual(lazyBot.client, initialClient);
  assert.equal(lazyBot.client.instance.endpoints.api_public, 'https://api.selfhosted.example');

  lazyBot.client.emit(Events.Ready);
  await setImmediate();
  assert.equal(readyCount, 1);

  const upsertUser = Reflect.get(lazyBot.client, 'getOrCreateUser') as (data: unknown) => unknown;
  const hydratedUser = upsertUser.call(lazyBot.client, { id: '42', username: 'ana', avatar: 'abc123', bot: false });
  Reflect.set(lazyBot.client.users, 'fetchWithProfile', async () => ({
    user: hydratedUser,
    member: null,
    globalProfile: { userProfile: { banner: 'ban999' } },
    serverProfile: null,
  }));
  const profile = await lazyBot.resources.users.profile('42');
  assert.match(profile.user.avatarURL ?? '', /^https:\/\/cdn\.selfhosted\.example\//);
  assert.match(profile.globalProfile?.bannerURL ?? '', /^https:\/\/cdn\.selfhosted\.example\//);

  await lazyBot.destroy();

  // 3) bot.destroy() durante Client.fromDiscovery aborta o sinal e destrói o client tardio
  let pendingSignal: AbortSignal | undefined;
  let releaseDiscovery: ((client: Client) => void) | undefined;
  let lateDestroyed = false;
  t.mock.method(Client, 'fromDiscovery', async (
    _origin: unknown,
    _options?: Record<string, unknown>,
    connectOptions?: { signal?: AbortSignal },
  ) => {
    pendingSignal = connectOptions?.signal;
    return new Promise<Client>(resolve => { releaseDiscovery = resolve; });
  });

  const abortingBot = new Yuzuha({
    discovery: 'https://selfhosted.example',
    store: new MemoryStore(),
    scheduler: false,
    variables: false,
  });
  const pendingLogin = abortingBot.login('token-abortado');
  await setImmediate();
  assert.equal(pendingSignal?.aborted, false);
  const destroyPromise = abortingBot.destroy();
  assert.equal(pendingSignal?.aborted, true);

  const lateClient = new Client();
  const origLateDestroy = lateClient.destroy.bind(lateClient);
  Reflect.set(lateClient, 'destroy', async () => {
    lateDestroyed = true;
    await origLateDestroy();
  });
  releaseDiscovery?.(lateClient);

  await assert.rejects(pendingLogin, err => isYuzuhaError(err, 'BOT_CLOSED'));
  await destroyPromise;
  assert.equal(lateDestroyed, true);
});

test('configuredBot e doctor validam clientOptions, discovery e cacheSweepers offline sem vazar segredos ou stores', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-cache-discovery-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const indexUrl = pathToFileURL(fileURLToPath(new URL('../src/index.ts', import.meta.url))).href;
  await mkdir(join(directory, 'commands'));
  await writeFile(
    join(directory, 'commands/ping.mjs'),
    `import { defineCommand } from ${JSON.stringify(indexUrl)};
     export default defineCommand({ name: 'ping', run() {} });`,
  );
  await writeFile(join(directory, '.env'), 'FLUXER_BOT_TOKEN=token-super-secreto-doctor\n');

  // Helper tipado de defineConfig preserva inferência dos novos campos
  const typedConfig = defineConfig({
    name: 'cfg-tipado',
    discovery: { api: 'https://fluxer.example', version: '1' },
    clientOptions: { shardCount: 'auto', cache: { messages: 50 }, ignoredEvents: ['TYPING_START'] },
    cacheSweepers: { messages: { intervalMs: 5_000, maxAgeMs: 30_000 }, users: { intervalMs: 10_000 } },
  });
  assert.equal(typedConfig.name, 'cfg-tipado');

  // 1) Config válida com HTTPS discovery (com credenciais/query que não devem vazar), clientOptions e cacheSweepers
  const configPath = join(directory, 'yuzuha.config.mjs');
  await writeFile(
    configPath,
    `import { MemoryStore, defineConfig } from ${JSON.stringify(indexUrl)};
     export default defineConfig({
       name: 'bot-selfhosted',
       store: new MemoryStore(),
       commands: './commands',
       discovery: { api: 'https://usuario:senha-secreta@fluxer.interno.example/sub?chave=oculta', version: '1' },
       clientOptions: { shardCount: 'auto', cache: { messages: 100 }, ignoredEvents: ['TYPING_START'] },
       cacheSweepers: {
         messages: { intervalMs: 5_000, maxAgeMs: 60_000 },
         members: false,
         users: { intervalMs: 15_000 },
       },
     });`,
  );

  const loaded = await configuredBot(configPath, false);
  assert.equal(loaded.bot.listCommands().length, 1);
  await loaded.bot.destroy();

  const passReport = await doctor(configPath);
  assert.equal(passReport.ok, true);
  assert.equal(passReport.offline, true);
  const clientCheck = passReport.checks.find(check => check.name === 'client');
  assert.ok(clientCheck);
  assert.equal(clientCheck.status, 'pass');
  assert.match(clientCheck.message, /discovery configurada \(https:\/\/fluxer\.interno\.example\/sub \(v1\)\)/);
  assert.match(clientCheck.message, /shards=auto/);
  assert.match(clientCheck.message, /cache customizado/);
  assert.match(clientCheck.message, /ignoredEvents=1/);
  assert.match(clientCheck.message, /sweepers ativos: messages, users/);
  const serialized = JSON.stringify(passReport);
  assert.equal(serialized.includes('senha-secreta'), false);
  assert.equal(serialized.includes('oculta'), false);
  assert.equal(serialized.includes('token-super-secreto-doctor'), false);

  // 2) HTTP loopback passa sem warning; HTTP remoto emite warn mantendo ok: true
  const loopbackPath = join(directory, 'loopback.config.mjs');
  await writeFile(
    loopbackPath,
    `import { MemoryStore } from ${JSON.stringify(indexUrl)};
     export default { store: new MemoryStore(), commands: './commands', discovery: 'http://127.0.0.1:8080' };`,
  );
  const loopbackReport = await doctor(loopbackPath);
  assert.equal(loopbackReport.ok, true);
  assert.equal(loopbackReport.checks.find(c => c.name === 'client')?.status, 'pass');

  const warnPath = join(directory, 'warn.config.mjs');
  await writeFile(
    warnPath,
    `import { MemoryStore } from ${JSON.stringify(indexUrl)};
     export default {
       store: new MemoryStore(),
       commands: './commands',
       discovery: 'http://fluxer.rede-interna.example',
       clientOptions: { cache: { messages: false } },
       cacheSweepers: { messages: { intervalMs: 5_000 } },
     };`,
  );
  const warnReport = await doctor(warnPath);
  assert.equal(warnReport.ok, true);
  const warnClient = warnReport.checks.find(c => c.name === 'client');
  assert.equal(warnClient?.status, 'warn');
  assert.match(warnClient?.message ?? '', /discovery HTTP sem TLS/);
  assert.match(warnClient?.message ?? '', /cache de mensagens desabilitado/);

  // 3) shardCount inválido em clientOptions falha no check client de doctor
  const badShardPath = join(directory, 'bad-shards.config.mjs');
  await writeFile(
    badShardPath,
    `import { MemoryStore } from ${JSON.stringify(indexUrl)};
     export default { store: new MemoryStore(), commands: './commands', clientOptions: { shardCount: 0 } };`,
  );
  const badShardReport = await doctor(badShardPath);
  assert.equal(badShardReport.ok, false);
  assert.equal(badShardReport.checks.find(c => c.name === 'client')?.status, 'fail');

  // 4) Falha de validação no construtor fecha store da config em configuredBot e reporta o código em doctor
  let closedCount = 0;
  const baseStore = new MemoryStore();
  const trackableStore: Store = {
    read: reader => baseStore.read(reader),
    update: writer => baseStore.update(writer),
    async close() { closedCount++; },
  };
  (globalThis as Record<string, unknown>).__testTrackableStore = trackableStore;
  t.after(() => { delete (globalThis as Record<string, unknown>).__testTrackableStore; });

  const invalidDiscoveryPath = join(directory, 'invalid-discovery.config.mjs');
  await writeFile(
    invalidDiscoveryPath,
    `export default {
       store: globalThis.__testTrackableStore,
       commands: './commands',
       discovery: 'ftp://invalido.example',
     };`,
  );
  await assert.rejects(
    configuredBot(invalidDiscoveryPath, false, false),
    err => err instanceof ConfigError && isYuzuhaError(err, 'DISCOVERY_OPTIONS'),
  );
  assert.equal(closedCount, 1);

  const invalidDoctorReport = await doctor(invalidDiscoveryPath);
  assert.equal(invalidDoctorReport.ok, false);
  const failedConfigCheck = invalidDoctorReport.checks.find(c => c.name === 'config');
  assert.equal(failedConfigCheck?.status, 'fail');
  assert.match(failedConfigCheck?.message ?? '', /DISCOVERY_OPTIONS/);
  assert.equal(closedCount, 2);
});
