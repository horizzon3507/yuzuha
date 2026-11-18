import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@fluxerjs/core';
import { ConfigError, MemoryStore, Yuzuha, isYuzuhaError } from '../src/index.js';
import type { ShardClientUtilLike } from '../src/index.js';
import { parseArguments, usage } from '../src/cli/arguments.js';
import { runBot } from '../src/cli/runner.js';
import {
  fetchBotGuildCount,
  isShardingChildProcess,
  resolveCliEntrypoint,
  runShardedSupervisor,
} from '../src/cli/sharding.js';
import type { ShardingSupervisorManager, ShardingSupervisorManagerOptions } from '../src/cli/sharding.js';
import { MockTransport } from '../src/testing.js';

test('parseArguments valida --shards e --shards-per-process em yuzuha run', () => {
  assert.match(usage, /yuzuha run \[config\] \[--shards <auto\|N>\] \[--shards-per-process <N>\]/);

  assert.deepEqual(parseArguments(['run']), { action: 'run', input: undefined });
  assert.deepEqual(parseArguments(['run', './bot.config.ts']), { action: 'run', input: './bot.config.ts' });
  assert.deepEqual(parseArguments(['run', '--shards', 'auto']), {
    action: 'run',
    input: undefined,
    shards: 'auto',
  });
  assert.deepEqual(parseArguments(['run', './bot.config.ts', '--shards', '4']), {
    action: 'run',
    input: './bot.config.ts',
    shards: 4,
  });
  assert.deepEqual(parseArguments(['run', '--shards', '4096', '--shards-per-process', '2', 'custom.ts']), {
    action: 'run',
    input: 'custom.ts',
    shards: 4096,
    shardsPerProcess: 2,
  });
  assert.deepEqual(parseArguments(['run', '--shards', '1', '--shards-per-process', '1']), {
    action: 'run',
    input: undefined,
    shards: 1,
    shardsPerProcess: 1,
  });

  for (const invalid of [
    ['run', '--shards'],
    ['run', '--shards', '0'],
    ['run', '--shards', '-1'],
    ['run', '--shards', '4097'],
    ['run', '--shards', '1.5'],
    ['run', '--shards', 'abc'],
    ['run', '--shards', '--shards-per-process'],
    ['run', '--shards=4'],
    ['run', '--shards', '2', '--shards', '4'],
    ['run', '--shards-per-process', '2'],
    ['run', '--shards', '4', '--shards-per-process'],
    ['run', '--shards', '4', '--shards-per-process', '0'],
    ['run', '--shards', '4', '--shards-per-process', '4097'],
    ['run', '--shards', '4', '--shards-per-process', '2', '--shards-per-process', '2'],
    ['dev', '--shards', '2'],
    ['check', '--shards', '2'],
  ]) {
    assert.throws(() => parseArguments(invalid), { code: 'USAGE' });
  }
});

test('fetchBotGuildCount pagina /users/@me/guilds até esgotar as páginas', async () => {
  const routes: string[] = [];
  const page1 = Array.from({ length: 200 }, (_, index) => ({ id: String(1000 + index) }));
  const page2 = Array.from({ length: 200 }, (_, index) => ({ id: String(2000 + index) }));
  const page3 = Array.from({ length: 37 }, (_, index) => ({ id: String(3000 + index) }));

  const count = await fetchBotGuildCount('offline-token', {
    rest: {
      async get(route: string) {
        routes.push(route);
        if (routes.length === 1) return page1;
        if (routes.length === 2) return page2;
        return page3;
      },
    },
  });

  assert.equal(count, 437);
  assert.deepEqual(routes, [
    '/users/@me/guilds?limit=200',
    '/users/@me/guilds?limit=200&after=1199',
    '/users/@me/guilds?limit=200&after=2199',
  ]);
});

test('runShardedSupervisor valida token/.env, orquestra ShardingManager e encerra em SIGINT/SIGTERM', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-cli-shards-'));
  try {
    const configPath = join(directory, 'yuzuha.config.mjs');
    await writeFile(configPath, 'export default {};\n');

    // Sem token no ambiente ou .env -> TOKEN_MISSING
    await assert.rejects(
      runShardedSupervisor({
        configPath,
        shards: 2,
        env: {},
      }),
      error => error instanceof ConfigError && isYuzuhaError(error, 'TOKEN_MISSING'),
    );

    // Carrega token de .env e falha amigavelmente quando @fluxerjs/sharding está ausente
    await writeFile(join(directory, '.env'), 'FLUXER_BOT_TOKEN=env-file-token\n');
    await assert.rejects(
      runShardedSupervisor({
        configPath,
        shards: 2,
        env: {},
        importer: async () => {
          throw Object.assign(new Error('Cannot find package @fluxerjs/sharding'), { code: 'ERR_MODULE_NOT_FOUND' });
        },
      }),
      error => error instanceof ConfigError && isYuzuhaError(error, 'SHARDING_UNAVAILABLE'),
    );

    // Orquestração com ShardingManager mockado (contagem fixa + SIGTERM)
    let capturedFile = '';
    let capturedOptions: ShardingSupervisorManagerOptions | undefined;
    let spawnAmount: number | 'auto' | undefined;
    let destroyCalls = 0;
    const logs: string[] = [];
    const target = new EventEmitter();

    class FakeManager extends EventEmitter implements ShardingSupervisorManager {
      shardCount = 4;
      readonly shards = new Map<number, unknown>([[0, {}], [2, {}]]);
      async spawn(amount?: number | 'auto') {
        spawnAmount = amount;
        return this.shards;
      }
      async destroy() {
        destroyCalls++;
      }
    }

    await runShardedSupervisor({
      configPath,
      shards: 4,
      shardsPerProcess: 2,
      env: {},
      target,
      onLog: message => { logs.push(message); },
      createManager(file, options) {
        capturedFile = file;
        capturedOptions = options;
        return new FakeManager();
      },
      onReady() {
        assert.equal(target.listenerCount('SIGINT'), 1);
        assert.equal(target.listenerCount('SIGTERM'), 1);
        target.emit('SIGTERM');
      },
    });

    assert.equal(capturedFile, resolveCliEntrypoint());
    assert.ok(capturedOptions);
    assert.equal(capturedOptions.token, 'env-file-token');
    assert.equal(capturedOptions.totalShards, 4);
    assert.equal(capturedOptions.shardsPerProcess, 2);
    assert.deepEqual(capturedOptions.shardArgs, ['run', configPath]);
    assert.equal(capturedOptions.fetchGuildCount, undefined);
    assert.equal(spawnAmount, 4);
    assert.equal(destroyCalls, 1);
    assert.ok(logs.some(line => line.includes('4 shards')));
    assert.equal(target.listenerCount('SIGINT'), 0);
    assert.equal(target.listenerCount('SIGTERM'), 0);
    assert.equal(target.listenerCount('unhandledRejection'), 0);
    assert.equal(target.listenerCount('uncaughtException'), 0);

    // Modo --shards auto resolve fetchGuildCount via REST mockado e encerra em SIGINT
    let resolvedAutoGuilds = -1;
    const autoTarget = new EventEmitter();
    await runShardedSupervisor({
      configPath,
      shards: 'auto',
      env: { FLUXER_BOT_TOKEN: 'override-token' },
      target: autoTarget,
      rest: {
        async get() {
          return [{ id: '1' }, { id: '2' }, { id: '3' }];
        },
      },
      onLog: () => {},
      createManager(_file, options) {
        const manager = new FakeManager();
        manager.shardCount = 1;
        manager.spawn = async () => {
          resolvedAutoGuilds = await options.fetchGuildCount!();
          return manager.shards;
        };
        return manager;
      },
      onReady() {
        autoTarget.emit('SIGINT');
      },
    });
    assert.equal(resolvedAutoGuilds, 3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('detecção de processo filho anexa ShardClientUtil antes do login e sinaliza notifyReady', async () => {
  assert.equal(isShardingChildProcess({}, true), false);
  assert.equal(isShardingChildProcess({ FLUXER_SHARD_IDS: '0', FLUXER_SHARD_COUNT: '2' }, false), false);
  assert.equal(isShardingChildProcess({ FLUXER_SHARD_IDS: '0', FLUXER_SHARD_COUNT: '2' }, true), true);

  const steps: string[] = [];
  let loggedInToken: string | undefined;
  const client = new Client();
  Reflect.set(client, 'login', async (token: string) => {
    steps.push('client.login');
    loggedInToken = token;
    assert.ok((client as unknown as { shard?: unknown }).shard, 'client.shard deve estar anexado antes do login');
    return client;
  });
  Reflect.set(client, 'destroy', async () => {
    steps.push('client.destroy');
  });

  const childEnv: NodeJS.ProcessEnv = {
    FLUXER_SHARD_IDS: '1',
    FLUXER_SHARD_COUNT: '4',
    FLUXER_SHARD_PROCESS_ID: '1',
    FLUXER_TOKEN: 'child-ipc-token',
  };

  const bot = new Yuzuha({
    client,
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    variables: false,
    logger: false,
    sharding: { env: childEnv },
  });

  const mockShardUtil: ShardClientUtilLike = {
    id: 1,
    ids: [1],
    count: 4,
    async broadcastEval() { return []; },
    async fetchClientValues() { return []; },
    async respawn() {},
    notifyReady() {
      steps.push('shard.notifyReady');
    },
  };

  const target = new EventEmitter();
  await runBot(bot, '.', false, {
    target,
    sharding: {
      env: childEnv,
      hasIpc: true,
      importer: async () => ({
        attachShardClientUtil(targetClient: unknown) {
          steps.push('attachShardClientUtil');
          Reflect.set(targetClient as object, 'shard', mockShardUtil);
          return mockShardUtil;
        },
        ShardingManager: class {} as never,
      }),
    },
  });

  assert.equal(loggedInToken, 'child-ipc-token');
  assert.deepEqual(steps, ['attachShardClientUtil', 'client.login', 'shard.notifyReady']);

  target.emit('SIGTERM');
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(steps.includes('client.destroy'));
});
