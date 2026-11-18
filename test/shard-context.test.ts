import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@fluxerjs/core';
import { shardIdForGuild as wsShardIdForGuild } from '@fluxerjs/ws';
import {
  ConfigError,
  MemoryLock,
  MemoryStore,
  Yuzuha,
  YuzuhaError,
  defineCommand,
  isYuzuhaError,
  shardIdForGuild,
} from '../src/index.js';
import type { ShardClientUtilLike } from '../src/index.js';
import { loadOptionalSharding } from '../src/framework/sharding.js';
import { MockTransport, TestClock, fakeTimers, mockMessage } from '../src/testing.js';

function stubbedClient(options?: ConstructorParameters<typeof Client>[0]): Client {
  const client = new Client(options);
  Reflect.set(client, 'login', async () => client);
  Reflect.set(client, 'destroy', async () => {});
  return client;
}

function trackedTimers() {
  const base = fakeTimers();
  const active = new Set<unknown>();
  return {
    setTimeout(fn: () => void, ms: number) {
      let handle: unknown;
      handle = base.setTimeout(() => {
        active.delete(handle);
        fn();
      }, ms);
      active.add(handle);
      return handle;
    },
    clearTimeout(handle: unknown) {
      active.delete(handle);
      base.clearTimeout(handle);
    },
    advance(ms: number) { base.advance(ms); },
    get activeCount() { return active.size; },
  };
}

test('shardIdForGuild aplica a fórmula snowflake do gateway e valida entradas', () => {
  const guilds = [
    '0',
    '4194304',
    '8388608',
    '12582912',
    '1234567890123456789',
    '987654321098765432',
  ];
  for (const count of [1, 2, 4, 8, 16, 64]) {
    for (const guildID of guilds) {
      const expected = Number((BigInt(guildID) >> 22n) % BigInt(count));
      assert.equal(shardIdForGuild(guildID, count), expected);
      assert.equal(shardIdForGuild(guildID, count), wsShardIdForGuild(guildID, count));
    }
  }

  const bot = new Yuzuha({
    clientOptions: { shardCount: 8, shardIds: [2, 3] },
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
  });
  assert.ok(bot.shard);
  assert.equal(bot.shard.shardIdForGuild('1234567890123456789'), shardIdForGuild('1234567890123456789', 8));

  for (const invalidGuild of ['', 'abc', '-10', '12.3', ' 100 ']) {
    assert.throws(
      () => shardIdForGuild(invalidGuild, 4),
      error => error instanceof YuzuhaError && isYuzuhaError(error, 'SHARDING_OPTIONS'),
    );
  }
  for (const invalidCount of [0, -1, 1.5, 16_385, NaN]) {
    assert.throws(
      () => shardIdForGuild('100', invalidCount),
      error => error instanceof YuzuhaError && isYuzuhaError(error, 'SHARDING_OPTIONS'),
    );
  }
});

test('bot.shard detecta opções, clientOptions e ambiente e calcula isLeader corretamente', async () => {
  const unsharded = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false });
  assert.equal(unsharded.shard, undefined);
  await unsharded.destroy();

  const singleEnabled = new Yuzuha({
    sharding: true,
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
  });
  assert.ok(singleEnabled.shard);
  assert.equal(singleEnabled.shard.id, 0);
  assert.deepEqual(singleEnabled.shard.ids, [0]);
  assert.equal(singleEnabled.shard.count, 1);
  assert.equal(singleEnabled.shard.isLeader, true);
  await singleEnabled.destroy();

  const nonLeader = new Yuzuha({
    clientOptions: { shardCount: 4, shardIds: [2, 3] },
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
  });
  assert.ok(nonLeader.shard);
  assert.equal(nonLeader.shard.id, 2);
  assert.deepEqual(nonLeader.shard.ids, [2, 3]);
  assert.equal(nonLeader.shard.count, 4);
  assert.equal(nonLeader.shard.isLeader, false);
  await nonLeader.destroy();

  const customLeader = new Yuzuha({
    clientOptions: { shardCount: 4, shardIds: [2, 3] },
    sharding: { leaderShardID: 3 },
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
  });
  assert.ok(customLeader.shard);
  assert.equal(customLeader.shard.isLeader, true);
  await customLeader.destroy();

  const customLeaderMiss = new Yuzuha({
    clientOptions: { shardCount: 4, shardIds: [0, 1] },
    sharding: { leaderShardID: 2 },
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
  });
  assert.ok(customLeaderMiss.shard);
  assert.equal(customLeaderMiss.shard.isLeader, false);
  await customLeaderMiss.destroy();

  const fromEnv = new Yuzuha({
    sharding: {
      env: {
        FLUXER_SHARD_IDS: '1,2',
        FLUXER_SHARD_COUNT: '4',
        FLUXER_SHARD_PROCESS_ID: '1',
      },
    },
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
  });
  assert.ok(fromEnv.shard);
  assert.equal(fromEnv.shard.id, 1);
  assert.deepEqual(fromEnv.shard.ids, [1, 2]);
  assert.equal(fromEnv.shard.count, 4);
  assert.equal(fromEnv.shard.isLeader, false);
  await fromEnv.destroy();

  const disabledWithEnv = new Yuzuha({
    sharding: false,
    clientOptions: { shardCount: 4, shardIds: [0] },
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
  });
  assert.equal(disabledWithEnv.shard, undefined);
  await disabledWithEnv.destroy();
});

test('validação de opções de sharding rejeita configurações inválidas com SHARDING_OPTIONS', () => {
  for (const invalid of [
    'auto',
    123,
    [],
    { leaderShardID: -1 },
    { leaderShardID: 1.5 },
    { schedulerMode: 'primary' },
    { count: 0 },
    { count: 20_000 },
    { ids: [] },
    { ids: [0, 0], count: 2 },
    { ids: [2], count: 2 },
    { shardUtil: { ids: [0], count: 1 } },
    { env: { FLUXER_SHARD_IDS: '3', FLUXER_SHARD_COUNT: '2' } },
  ]) {
    assert.throws(
      () => new Yuzuha({ sharding: invalid as never, transport: new MockTransport(), store: new MemoryStore(), scheduler: false }),
      error => error instanceof ConfigError && isYuzuhaError(error, 'SHARDING_OPTIONS'),
    );
  }
});

test('scheduler e limpeza de variáveis rodam apenas no shard líder por padrão e obedecem schedulerMode e lock', async () => {
  const makeScheduledBot = async (options: {
    ids: number[];
    count: number;
    leaderShardID?: number;
    schedulerMode?: 'leader' | 'all' | 'disabled';
    withLock?: boolean;
  }) => {
    const clock = new TestClock(1_000);
    const timers = trackedTimers();
    const store = new MemoryStore();
    let scheduledRuns = 0;
    const bot = new Yuzuha({
      client: stubbedClient({ shardCount: options.count, shardIds: options.ids }),
      transport: new MockTransport(),
      store,
      now: clock.now,
      timers,
      variables: { sweepIntervalMs: 5_000 },
      ...(options.withLock ? { lock: new MemoryLock() } : {}),
      sharding: {
        ...(options.leaderShardID !== undefined ? { leaderShardID: options.leaderShardID } : {}),
        ...(options.schedulerMode !== undefined ? { schedulerMode: options.schedulerMode } : {}),
      },
    });
    bot.command({ name: 'job', run() { scheduledRuns++; } });
    await bot.scheduler!.add({
      guildID: '100',
      channelID: '200',
      authorID: '1',
      command: 'job',
      input: '',
      due: 2_000,
    });
    await store.update(state => {
      state.variables['guild:100:temp'] = 'expira';
      state.variableExpirations = { 'guild:100:temp': 1_500 };
    });

    await bot.login('offline-token');
    await bot.scheduler!.drain();

    const timersStartedOnLogin = timers.activeCount;
    clock.advance(5_000);
    timers.advance(5_000);
    await bot.scheduler!.drain();
    await new Promise(resolve => setImmediate(resolve));

    const remainingVar = await store.read(state => state.variables['guild:100:temp']);
    await bot.destroy();
    return { timersStartedOnLogin, scheduledRuns, remainingVar };
  };

  // Shard líder (0 de 4): inicia scheduler + sweep
  const leader = await makeScheduledBot({ ids: [0], count: 4 });
  assert.ok(leader.timersStartedOnLogin >= 2);
  assert.equal(leader.scheduledRuns, 1);
  assert.equal(leader.remainingVar, undefined);

  // Shard não-líder (1 de 4) sem lock: NÃO inicia scheduler nem sweep
  const follower = await makeScheduledBot({ ids: [1], count: 4 });
  assert.equal(follower.timersStartedOnLogin, 0);
  assert.equal(follower.scheduledRuns, 0);
  assert.equal(follower.remainingVar, 'expira');

  // Shard não-líder com lock distribuído: inicia ambos por padrão
  const followerWithLock = await makeScheduledBot({ ids: [1], count: 4, withLock: true });
  assert.ok(followerWithLock.timersStartedOnLogin >= 2);
  assert.equal(followerWithLock.scheduledRuns, 1);
  assert.equal(followerWithLock.remainingVar, undefined);

  // Shard não-líder com schedulerMode: 'all': inicia ambos
  const followerAll = await makeScheduledBot({ ids: [2], count: 4, schedulerMode: 'all' });
  assert.ok(followerAll.timersStartedOnLogin >= 2);
  assert.equal(followerAll.scheduledRuns, 1);
  assert.equal(followerAll.remainingVar, undefined);

  // Shard líder com schedulerMode: 'disabled': não inicia nenhum dos dois
  const leaderDisabled = await makeScheduledBot({ ids: [0], count: 4, schedulerMode: 'disabled' });
  assert.equal(leaderDisabled.timersStartedOnLogin, 0);
  assert.equal(leaderDisabled.scheduledRuns, 0);
  assert.equal(leaderDisabled.remainingVar, 'expira');
});

test('broadcastEval, fetchClientValues e respawn funcionam em single-process e com ShardClientUtil mockado', async () => {
  const singleClient = stubbedClient();
  const singleBot = new Yuzuha({
    client: singleClient,
    sharding: true,
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
  });
  assert.ok(singleBot.shard);

  const evalResult = await singleBot.shard.broadcastEval(
    (client, ctx) => ({ sameClient: client === singleClient, factor: (ctx as { factor: number }).factor * 2 }),
    { context: { factor: 21 } },
  );
  assert.deepEqual(evalResult, [{ sameClient: true, factor: 42 }]);

  const propValues = await singleBot.shard.fetchClientValues('options.defaultReplyPing');
  assert.deepEqual(propValues, [true]);

  await assert.rejects(
    singleBot.shard.respawn(),
    error => error instanceof YuzuhaError && isYuzuhaError(error, 'SHARDING_UNAVAILABLE'),
  );
  await singleBot.destroy();

  // Com ShardClientUtil mockado e anexado ao client
  const calls: string[] = [];
  let readyCount = 0;
  let respawnDelay: number | undefined;
  const mockShardUtil: ShardClientUtilLike = {
    id: 1,
    ids: [1, 2],
    count: 4,
    async broadcastEval<T>(fn: (client: Client, context?: unknown) => T | Promise<T>, options?: { context?: unknown }) {
      calls.push('broadcastEval');
      return [
        await fn(managedClient, options?.context),
        await fn(managedClient, options?.context),
      ];
    },
    async fetchClientValues(prop) {
      calls.push(`fetch:${prop}`);
      return [10, 20, 30, 40];
    },
    async respawn(options) {
      calls.push('respawn');
      respawnDelay = options?.delay;
    },
    notifyReady() {
      readyCount++;
    },
  };

  const managedClient = stubbedClient();
  Reflect.set(managedClient, 'shard', mockShardUtil);

  const managedBot = new Yuzuha({
    client: managedClient,
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    variables: false,
  });
  assert.ok(managedBot.shard);
  assert.equal(managedBot.shard.id, 1);
  assert.deepEqual(managedBot.shard.ids, [1, 2]);
  assert.equal(managedBot.shard.count, 4);
  assert.equal(managedBot.shard.isLeader, false);

  await managedBot.login('offline-token');
  assert.equal(readyCount, 1);

  const broadcast = await managedBot.shard.broadcastEval((_c, ctx) => Number(ctx) + 1, { context: 9 });
  assert.deepEqual(broadcast, [10, 10]);
  assert.deepEqual(await managedBot.shard.fetchClientValues('guilds.size'), [10, 20, 30, 40]);
  await managedBot.shard.respawn({ delay: 250 });
  assert.equal(respawnDelay, 250);
  assert.deepEqual(calls, ['broadcastEval', 'fetch:guilds.size', 'respawn']);

  await managedBot.destroy();
});

test('ctx.shard espelha bot.shard em comandos e eventos com contexto', async () => {
  const transport = new MockTransport();
  const bot = new Yuzuha({
    clientOptions: { shardCount: 4, shardIds: [0, 1] },
    transport,
    store: new MemoryStore(),
    scheduler: false,
  });

  bot.command(defineCommand({
    name: 'shardinfo',
    async run(ctx) {
      assert.equal(ctx.shard, bot.shard);
      const guildShard = ctx.shard!.shardIdForGuild(ctx.requireGuild());
      await ctx.reply(`shard=${ctx.shard!.id}/${ctx.shard!.count};leader=${ctx.shard!.isLeader};guildShard=${guildShard}`);
    },
  }));

  let eventShardMatched = false;
  bot.contextEvent({
    event: 'guildMemberAdd',
    channelID: '200',
    async run(ctx) {
      eventShardMatched = ctx.shard === bot.shard && ctx.shard?.count === 4;
    },
  });

  assert.equal(await bot.handle(mockMessage('!shardinfo', { guildID: '8388608' })), 'success');
  assert.equal(transport.messages.at(-1)?.payload.content, 'shard=0/4;leader=true;guildShard=2');

  bot.client.emit('guildMemberAdd', {
    id: '2',
    guild: { id: '100' },
    user: { id: '2', username: 'Ana', bot: false },
  } as never);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(eventShardMatched, true);

  await bot.destroy();
});

test('loadOptionalSharding falha com ConfigError SHARDING_UNAVAILABLE quando o peer não está instalado', async () => {
  await assert.rejects(
    loadOptionalSharding(async () => {
      throw Object.assign(new Error('Cannot find package @fluxerjs/sharding'), { code: 'ERR_MODULE_NOT_FOUND' });
    }),
    error => error instanceof ConfigError && isYuzuhaError(error, 'SHARDING_UNAVAILABLE'),
  );
});
