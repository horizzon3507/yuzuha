import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, Events } from '@fluxerjs/core';
import {
  ConfigError,
  JsonStore,
  MemoryStore,
  Yuzuha,
  YuzuhaCluster,
  YuzuhaClusterEvents,
  YuzuhaError,
  defineCommand,
  isYuzuhaError,
} from '../src/index.js';
import type { ClientRuntime, YuzuhaClusterEntry } from '../src/index.js';
import { MockTransport } from '../src/testing.js';

function stubClientOffline(client: Client, options?: { ready?: boolean; failWith?: Error; onLogin?: (token: string) => void }): void {
  let ready = false;
  Reflect.set(client, 'isReady', () => ready);
  Reflect.set(client, 'login', async (token: string) => {
    options?.onLogin?.(token);
    if (options?.failWith) throw options.failWith;
    if (options?.ready !== false) {
      ready = true;
      client.emit(Events.Ready);
    }
    return client;
  });
  Reflect.set(client, 'destroy', async () => {
    ready = false;
  });
}

function gatewayMessage(content: string, id = '1'): never {
  return {
    id,
    content,
    channelId: '200',
    guildId: '100',
    author: { id: '1', username: 'Ana', bot: false },
    mentions: [],
  } as never;
}

function collectStringsDeep(root: unknown, visited = new Set<unknown>()): string[] {
  if (typeof root === 'string') return [root];
  if (!root || typeof root !== 'object') return [];
  if (visited.has(root)) return [];
  visited.add(root);
  const found: string[] = [];
  if (root instanceof Map) {
    for (const [k, v] of root) {
      found.push(...collectStringsDeep(k, visited), ...collectStringsDeep(v, visited));
    }
    return found;
  }
  if (root instanceof Set || Array.isArray(root)) {
    for (const item of root) found.push(...collectStringsDeep(item, visited));
    return found;
  }
  for (const key of Reflect.ownKeys(root)) {
    let value: unknown;
    try {
      value = Reflect.get(root, key);
    } catch {
      continue;
    }
    if (typeof value === 'function') continue;
    found.push(...collectStringsDeep(value, visited));
  }
  return found;
}

test('YuzuhaCluster isola comandos, prefixos e stores entre múltiplos bots no mesmo processo', async () => {
  const transports = new Map<string, MockTransport>();

  const cluster = new YuzuhaCluster<{ prefix: string; tenant: string }>({
    suppressBetaWarning: true,
    botOptions: (runtime, meta) => {
      const transport = new MockTransport();
      transports.set(runtime.id, transport);
      return {
        prefix: meta?.prefix ?? '!',
        transport,
        store: new MemoryStore(),
        scheduler: false,
        variables: false,
      };
    },
    setup(bot, runtime, meta) {
      stubClientOffline(runtime.client);
      bot.command(defineCommand({
        name: 'conta',
        async run(ctx) {
          const next = await ctx.data.guild.update('hits', prev => Number(prev) + 1, 0);
          await ctx.reply(`${meta?.tenant}:${next}`);
        },
      }));
    },
  });

  const entryA = await cluster.add({
    id: 'tenant-a',
    token: 'secret-token-alpha',
    meta: { prefix: '!', tenant: 'alpha' },
  });
  const entryB = await cluster.add({
    id: 'tenant-b',
    token: 'secret-token-beta',
    meta: { prefix: '?', tenant: 'beta' },
    setup(bot) {
      bot.command(defineCommand({
        name: 'exclusivo',
        async run(ctx) {
          await ctx.reply('apenas-beta');
        },
      }));
    },
  });

  assert.equal(cluster.size, 2);
  assert.equal(cluster.has('tenant-a'), true);
  assert.equal(cluster.has('tenant-b'), true);
  assert.equal(cluster.get('tenant-a')?.bot, entryA.bot);
  assert.equal(cluster.get('tenant-b')?.bot, entryB.bot);
  assert.equal(entryA.status, 'ready');
  assert.equal(entryB.status, 'ready');
  assert.deepEqual(cluster.values().map(item => item.id), ['tenant-a', 'tenant-b']);
  assert.deepEqual(Array.from(cluster.runtimeValues(), item => item.id), ['tenant-a', 'tenant-b']);

  // Despacho pelo gateway real (Events.MessageCreate) mantém isolamento total
  entryA.client.emit(Events.MessageCreate, gatewayMessage('!conta', 'm1'));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  entryA.client.emit(Events.MessageCreate, gatewayMessage('!conta', 'm1b'));
  entryA.client.emit(Events.MessageCreate, gatewayMessage('!exclusivo', 'm2'));
  entryB.client.emit(Events.MessageCreate, gatewayMessage('!conta', 'm3'));
  entryB.client.emit(Events.MessageCreate, gatewayMessage('?conta', 'm4'));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  entryB.client.emit(Events.MessageCreate, gatewayMessage('?exclusivo', 'm5'));
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));

  const messagesA = transports.get('tenant-a')!.messages.map(m => m.payload.content);
  const messagesB = transports.get('tenant-b')!.messages.map(m => m.payload.content);
  assert.deepEqual(messagesA, ['alpha:1', 'alpha:2']);
  assert.deepEqual(messagesB, ['beta:1', 'apenas-beta']);

  const hitsKey = JSON.stringify(['guild', '100', 'hits']);
  assert.equal(await entryA.bot.store.read(s => s.variables[hitsKey]), 2);
  assert.equal(await entryB.bot.store.read(s => s.variables[hitsKey]), 1);

  await cluster.destroy();
  assert.equal(cluster.size, 0);
});

test('addAll processa múltiplos runtimes concorrentemente sem abortar os saudáveis quando um falha', async () => {
  const cluster = new YuzuhaCluster({
    suppressBetaWarning: true,
    createBot(runtime) {
      stubClientOffline(runtime.client, {
        failWith: runtime.id === 'broken' ? new Error('invalid instance token') : undefined,
      });
      return new Yuzuha({
        client: runtime.client,
        transport: new MockTransport(),
        store: new MemoryStore(),
        scheduler: false,
        variables: false,
      });
    },
  });

  const results = await cluster.addAll([
    { id: 'ok-1', token: 'tok-1' },
    { id: 'broken', token: 'tok-bad' },
    { id: 'ok-2', token: 'tok-2' },
  ]);

  assert.equal(results.length, 3);
  assert.equal(results[0]?.status, 'fulfilled');
  assert.equal(results[1]?.status, 'rejected');
  assert.equal(results[2]?.status, 'fulfilled');
  assert.equal(cluster.size, 2);
  assert.equal(cluster.has('broken'), false);
  assert.deepEqual(cluster.values().map(v => v.id), ['ok-1', 'ok-2']);

  await cluster.destroy();
});

test('remove chama bot.destroy(), limpa listeners e preserva os demais runtimes ativos', async () => {
  let closedMusicA = false;
  const transportB = new MockTransport();

  const cluster = new YuzuhaCluster({
    suppressBetaWarning: true,
    createBot(runtime) {
      stubClientOffline(runtime.client);
      return new Yuzuha({
        client: runtime.client,
        transport: runtime.id === 'b' ? transportB : new MockTransport(),
        store: new MemoryStore(),
        scheduler: false,
        variables: false,
        ...(runtime.id === 'a' ? { music: { close: async () => { closedMusicA = true; } } as never } : {}),
      });
    },
    setup(bot) {
      bot.command({ name: 'ping', async run(ctx) { await ctx.reply('pong'); } });
    },
  });

  const a = await cluster.add({ id: 'a', token: 'tok-a' });
  const b = await cluster.add({ id: 'b', token: 'tok-b' });

  assert.equal(await cluster.remove('a'), true);
  assert.equal(await cluster.remove('a'), false);
  assert.equal(await cluster.remove('inexistente'), false);

  assert.equal(a.bot.signal.aborted, true);
  assert.equal(closedMusicA, true);
  assert.equal(a.client.listenerCount(Events.MessageCreate), 0);
  assert.equal(a.client.listenerCount(Events.Ready), 0);
  assert.equal(a.client.listenerCount(Events.Error), 0);
  assert.equal(a.client.listenerCount(Events.ShardError), 0);

  // Bot B continua operacional
  assert.equal(cluster.size, 1);
  b.client.emit(Events.MessageCreate, gatewayMessage('!ping', 'msg-b'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(transportB.messages.at(-1)?.payload.content, 'pong');

  await cluster.destroy();
  assert.equal(b.bot.signal.aborted, true);
});

test('restart reconstrói Client e Yuzuha sem vazar listeners nem reter ou expor tokens', async () => {
  const seenTokens: string[] = [];
  const tokenV1 = 'super-secret-token-v1-998877';
  const tokenV2 = 'super-secret-token-v2-665544';

  const cluster = new YuzuhaCluster<{ label: string }>({
    suppressBetaWarning: true,
    botOptions: {
      transport: new MockTransport(),
      store: new MemoryStore(),
      scheduler: false,
      variables: false,
    },
    setup(_bot, runtime) {
      stubClientOffline(runtime.client, { onLogin: token => seenTokens.push(token) });
    },
  });

  const first = await cluster.add({
    id: 'rotatable',
    token: tokenV1,
    meta: { label: 'tenant-rotatable' },
  });
  const oldClient = first.client;
  const oldBot = first.bot;

  // Confere que o token V1 jamais ficou retido na estrutura do cluster ou das entries
  const stringsAfterAdd = [
    ...collectStringsDeep(cluster),
    ...collectStringsDeep(first),
    ...collectStringsDeep(cluster.values()),
  ];
  assert.equal(stringsAfterAdd.some(s => s.includes(tokenV1)), false);

  const second = await cluster.restart('rotatable', { token: tokenV2 });
  assert.notEqual(second.client, oldClient);
  assert.notEqual(second.bot, oldBot);
  assert.equal(oldBot.signal.aborted, true);
  assert.equal(second.meta?.label, 'tenant-rotatable');
  assert.equal(second.status, 'ready');
  assert.deepEqual(seenTokens, [tokenV1, tokenV2]);

  // Zero listeners vazados no client antigo
  assert.equal(oldClient.listenerCount(Events.MessageCreate), 0);
  assert.equal(oldClient.listenerCount(Events.Ready), 0);
  assert.equal(oldClient.listenerCount(Events.Error), 0);
  assert.equal(oldClient.listenerCount(Events.ShardError), 0);

  // Nenhum token (V1 ou V2) retido em memória do cluster ou entries
  const stringsAfterRestart = [
    ...collectStringsDeep(cluster),
    ...collectStringsDeep(second),
    ...collectStringsDeep(cluster.values()),
  ];
  assert.equal(stringsAfterRestart.some(s => s.includes(tokenV1) || s.includes(tokenV2)), false);

  // Runtime com Client pré-construído recusa restart sem destruir o bot ativo
  const prebuiltClient = new Client();
  stubClientOffline(prebuiltClient);
  const prebuiltEntry = await cluster.add({
    id: 'prebuilt',
    token: 'prebuilt-token',
    client: prebuiltClient,
  });
  await assert.rejects(
    cluster.restart('prebuilt', { token: 'new-prebuilt-token' }),
    error => error instanceof ConfigError && isYuzuhaError(error, 'CLUSTER_OPTIONS'),
  );
  assert.equal(prebuiltEntry.bot.signal.aborted, false);
  assert.equal(cluster.has('prebuilt'), true);

  await cluster.destroy();
});

test('eventos de ciclo de vida on/once/off e bloqueio CLUSTER_CLOSED após destroy()', async () => {
  const events: string[] = [];
  let onceReadyCount = 0;
  let capturedError: Error | undefined;

  const cluster = new YuzuhaCluster({
    suppressBetaWarning: true,
    botOptions: {
      transport: new MockTransport(),
      store: new MemoryStore(),
      scheduler: false,
      variables: false,
      onError: () => {},
    },
    setup(_bot, runtime) {
      stubClientOffline(runtime.client);
    },
  });

  const onAdded = (entry: YuzuhaClusterEntry) => {
    assert.ok(entry.bot instanceof Yuzuha);
    events.push(`added:${entry.id}`);
  };
  const onReady = (entry: YuzuhaClusterEntry) => {
    events.push(`ready:${entry.id}:${entry.status}`);
  };
  const onRemoved = (entry: YuzuhaClusterEntry) => {
    events.push(`removed:${entry.id}:${entry.status}`);
  };
  const onError = (entry: YuzuhaClusterEntry, err: Error) => {
    capturedError = err;
    events.push(`error:${entry.id}:${entry.status}`);
  };

  cluster.on(YuzuhaClusterEvents.RuntimeAdded, onAdded);
  cluster.on(YuzuhaClusterEvents.RuntimeReady, onReady);
  cluster.on(YuzuhaClusterEvents.RuntimeRemoved, onRemoved);
  cluster.on(YuzuhaClusterEvents.RuntimeError, onError);
  cluster.once(YuzuhaClusterEvents.RuntimeReady, () => { onceReadyCount++; });

  const rt1 = await cluster.add({ id: 'one', token: 'tok-one' });
  const boom = new Error('gateway hiccup');
  rt1.client.emit(Events.Error, boom);
  assert.equal(capturedError, boom);
  assert.equal(rt1.lastError, boom);
  assert.equal(rt1.status, 'error');

  cluster.off(YuzuhaClusterEvents.RuntimeAdded, onAdded);
  await cluster.add({ id: 'two', token: 'tok-two' });
  assert.equal(onceReadyCount, 1);

  await cluster.remove('one');
  await cluster.destroy({ timeoutMs: 1_000 });
  await cluster.destroy(); // idempotente

  assert.deepEqual(events, [
    'added:one',
    'ready:one:ready',
    'error:one:error',
    'ready:two:ready',
    'removed:one:destroyed',
    'removed:two:destroyed',
  ]);

  await assert.rejects(
    cluster.add({ id: 'after', token: 'tok' }),
    error => error instanceof YuzuhaError && isYuzuhaError(error, 'CLUSTER_CLOSED'),
  );
  await assert.rejects(
    cluster.addAll([{ id: 'after', token: 'tok' }]),
    error => error instanceof YuzuhaError && isYuzuhaError(error, 'CLUSTER_CLOSED'),
  );
  await assert.rejects(
    cluster.restart('one', { token: 'tok' }),
    error => error instanceof YuzuhaError && isYuzuhaError(error, 'CLUSTER_CLOSED'),
  );
});

test('validação de YuzuhaCluster lança ConfigError com CLUSTER_OPTIONS e TOKEN_MISSING', async () => {
  for (const invalidClusterOptions of [
    null,
    'bad',
    [],
    { createBot: 'fn' },
    { createBot: () => ({} as Yuzuha), botOptions: {} },
    { botOptions: { client: new Client() } },
    { setup: 123 },
    { suppressBetaWarning: 'yes' },
  ]) {
    assert.throws(
      () => new YuzuhaCluster(invalidClusterOptions as never),
      error => error instanceof ConfigError && isYuzuhaError(error, 'CLUSTER_OPTIONS'),
    );
  }

  // createBot que retorna Yuzuha apontando para outro Client é recusado e destruído
  let wrongBotDestroyed = false;
  const badFactoryCluster = new YuzuhaCluster({
    suppressBetaWarning: true,
    createBot(_runtime: ClientRuntime) {
      const wrong = new Yuzuha({
        client: new Client(),
        transport: new MockTransport(),
        store: new MemoryStore(),
        scheduler: false,
      });
      wrong.signal.addEventListener('abort', () => { wrongBotDestroyed = true; });
      return wrong;
    },
  });
  await assert.rejects(
    badFactoryCluster.add({ id: 'mismatch', token: 'tok' }),
    error => error instanceof ConfigError && isYuzuhaError(error, 'CLUSTER_OPTIONS'),
  );
  assert.equal(wrongBotDestroyed, true);
  await badFactoryCluster.destroy();

  const validCluster = new YuzuhaCluster({ suppressBetaWarning: true });
  await assert.rejects(
    validCluster.add({ id: 'empty-tok', token: '   ' }),
    error => error instanceof ConfigError && isYuzuhaError(error, 'TOKEN_MISSING'),
  );
  await assert.rejects(
    validCluster.add({ id: '', token: 'tok' }),
    error => error instanceof ConfigError && isYuzuhaError(error, 'CLUSTER_OPTIONS'),
  );
  await assert.rejects(
    validCluster.restart('missing', { token: 'tok' }),
    error => error instanceof YuzuhaError && isYuzuhaError(error, 'NOT_FOUND'),
  );
  await validCluster.destroy();
});

test('remove cancela add pendente, isola JsonStore padrão por runtime.id e suporta handleSignals', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'yuzuha-cluster-xdg-'));
  const previousXdg = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = dataDir;

  try {
    let loginStarted!: () => void;
    const loginGate = new Promise<void>(resolve => { loginStarted = resolve; });

    const cluster = new YuzuhaCluster({
      suppressBetaWarning: true,
      botOptions: {
        transport: new MockTransport(),
        scheduler: false,
        variables: false,
      },
      setup(_bot, runtime) {
        if (runtime.id === 'slow') {
          Reflect.set(runtime.client, 'login', async (_token: string, opts?: { signal?: AbortSignal }) => {
            loginStarted();
            await new Promise<void>((_resolve, reject) => {
              if (opts?.signal?.aborted) {
                reject(new Error('aborted'));
                return;
              }
              opts?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
            });
            return runtime.client;
          });
          Reflect.set(runtime.client, 'destroy', async () => {});
          return;
        }
        stubClientOffline(runtime.client);
      },
    });

    const slowAdd = cluster.add({ id: 'slow', token: 'tok-slow' });
    await loginGate;
    assert.equal(await cluster.remove('slow'), true);
    await assert.rejects(slowAdd, /aborted|Connection aborted/);
    assert.equal(cluster.has('slow'), false);
    assert.equal(await cluster.remove('slow'), false);

    const first = await cluster.add({ id: 'store-alpha', token: 'tok-alpha' });
    const second = await cluster.add({ id: 'store-beta', token: 'tok-beta' });
    assert.ok(first.bot.store instanceof JsonStore);
    assert.ok(second.bot.store instanceof JsonStore);
    assert.notEqual(first.bot.store.path, second.bot.store.path);
    assert.match(first.bot.store.path, /store-alpha/);
    assert.match(second.bot.store.path, /store-beta/);

    const signalBus = new EventEmitter();
    let exitCode: number | undefined;
    let resolveExit!: () => void;
    const exited = new Promise<void>(resolve => { resolveExit = resolve; });
    cluster.handleSignals({
      target: signalBus,
      signals: ['SIGTERM'],
      onExit(code) {
        exitCode = code;
        resolveExit();
      },
    });

    signalBus.emit('SIGTERM');
    await exited;
    assert.equal(exitCode, 0);
    assert.equal(cluster.size, 0);
    assert.equal(signalBus.listenerCount('SIGTERM'), 0);
    assert.throws(
      () => cluster.handleSignals({ target: signalBus }),
      error => error instanceof YuzuhaError && isYuzuhaError(error, 'CLUSTER_CLOSED'),
    );
  } finally {
    if (previousXdg === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = previousXdg;
    await rm(dataDir, { recursive: true, force: true });
  }
});
