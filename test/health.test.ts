import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { request as httpRequest } from 'node:http';
import { Client, Events } from '@fluxerjs/core';
import {
  ConfigError,
  MemoryStore,
  Yuzuha,
  defineCommand,
  isYuzuhaError,
  startHealthServer,
} from '../src/index.js';
import type { HealthReport, HealthServer } from '../src/index.js';
import { parseArguments } from '../src/cli/arguments.js';
import { runBot } from '../src/cli/runner.js';
import { createPrometheusMetrics } from '../src/metrics.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

interface SimpleHttpResponse {
  readonly statusCode: number;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: string;
}

function sendHttp(port: number, method: string, path: string): Promise<SimpleHttpResponse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, method, path, headers: { Connection: 'close' } },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

test('startHealthServer valida opções inválidas com ConfigError(HEALTH_OPTIONS)', async t => {
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false });
  t.after(() => bot.destroy());

  await assert.rejects(
    startHealthServer(null as never),
    error => error instanceof ConfigError && isYuzuhaError(error, 'HEALTH_OPTIONS'),
  );
  await assert.rejects(
    startHealthServer({} as never),
    error => error instanceof ConfigError && isYuzuhaError(error, 'HEALTH_OPTIONS'),
  );

  for (const invalid of [
    null,
    [],
    'bad',
    new Date(),
    { port: -1 },
    { port: 65_536 },
    { port: 1.5 },
    { port: Number.NaN },
    { port: '8080' },
    { host: '' },
    { host: '   ' },
    { host: ' 127.0.0.1 ' },
    { path: '' },
    { path: 'health' },
    { path: '/health?x=1' },
    { path: '/health#frag' },
    { path: '/health space' },
    { path: '/metrics', metrics: createPrometheusMetrics() },
    { metrics: null },
    { metrics: {} },
    { metrics: { render: 'nope' } },
    { metrics: { render: () => '', contentType: '' } },
  ]) {
    await assert.rejects(
      startHealthServer(bot, invalid as never),
      error => error instanceof ConfigError && isYuzuhaError(error, 'HEALTH_OPTIONS'),
    );
  }
});

test('bot.health() reflete estados starting, ok e closed, execuções ativas e scheduler', async t => {
  let now = 1_700_000_000_000;
  let ready = false;
  let uptime: number | null = null;
  const client = new Client();
  Reflect.set(client, 'isReady', () => ready);
  Object.defineProperty(client, 'uptime', { get: () => uptime, configurable: true });

  const entered = deferred();
  const release = deferred();

  const bot = new Yuzuha({
    client,
    transport: new MockTransport(),
    store: new MemoryStore(),
    now: () => now,
  });
  t.after(() => bot.destroy());

  bot.command(defineCommand({
    name: 'ocupado',
    async run(ctx) {
      entered.resolve();
      await release.promise;
      await ctx.reply('fim');
    },
  }));

  const startingReport = bot.health();
  assert.deepEqual(startingReport, {
    status: 'starting',
    ready: false,
    closing: false,
    uptimeMs: null,
    activeExecutions: 0,
    schedulerRunning: false,
    timestamp: 1_700_000_000_000,
  });
  assert.equal(Object.isFrozen(startingReport), true);

  ready = true;
  uptime = 42_500;
  now += 500;
  bot.scheduler!.start(60_000);

  const task = bot.handle(mockMessage('!ocupado'));
  await entered.promise;

  const okReport = bot.health();
  assert.deepEqual(okReport, {
    status: 'ok',
    ready: true,
    closing: false,
    uptimeMs: 42_500,
    activeExecutions: 1,
    schedulerRunning: true,
    timestamp: 1_700_000_000_500,
  });

  release.resolve();
  await task;
  assert.equal(bot.health().activeExecutions, 0);

  now += 500;
  await bot.destroy();

  const closedReport = bot.health();
  assert.deepEqual(closedReport, {
    status: 'closed',
    ready: false,
    closing: true,
    uptimeMs: null,
    activeExecutions: 0,
    schedulerRunning: false,
    timestamp: 1_700_000_001_000,
  });
});

test('startHealthServer atende /health, /healthz, /metrics, HEAD, 404, 405 e fecha limpo', async t => {
  let ready = false;
  const client = new Client();
  Reflect.set(client, 'isReady', () => ready);
  Object.defineProperty(client, 'uptime', { get: () => (ready ? 1_250 : null), configurable: true });

  const metrics = createPrometheusMetrics();
  const bot = new Yuzuha({
    client,
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    metrics,
  });
  bot.command(defineCommand({ name: 'ping', async run(ctx) { await ctx.reply('pong'); } }));

  const server = await startHealthServer(bot, { port: 0, host: '127.0.0.1', metrics });
  t.after(async () => {
    await server.close();
    await bot.destroy();
  });

  assert.ok(server.port > 0);
  assert.equal(server.host, '127.0.0.1');
  assert.equal(server.url, `http://127.0.0.1:${server.port}/health`);

  const startingRes = await sendHttp(server.port, 'GET', '/health');
  assert.equal(startingRes.statusCode, 503);
  assert.equal(startingRes.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal((JSON.parse(startingRes.body) as HealthReport).status, 'starting');

  const startingHead = await sendHttp(server.port, 'HEAD', '/healthz');
  assert.equal(startingHead.statusCode, 503);
  assert.equal(startingHead.body, '');
  assert.ok(Number(startingHead.headers['content-length']) > 0);

  ready = true;
  assert.equal(await bot.handle(mockMessage('!ping')), 'success');

  for (const route of ['/health', '/healthz', '/health?probe=liveness']) {
    const okRes = await sendHttp(server.port, 'GET', route);
    assert.equal(okRes.statusCode, 200);
    assert.equal(okRes.headers['content-type'], 'application/json; charset=utf-8');
    const parsed = JSON.parse(okRes.body) as HealthReport;
    assert.equal(parsed.status, 'ok');
    assert.equal(parsed.ready, true);
    assert.equal(parsed.uptimeMs, 1_250);
  }

  const okHead = await sendHttp(server.port, 'HEAD', '/health');
  assert.equal(okHead.statusCode, 200);
  assert.equal(okHead.body, '');

  const metricsRes = await sendHttp(server.port, 'GET', '/metrics');
  assert.equal(metricsRes.statusCode, 200);
  assert.equal(metricsRes.headers['content-type'], 'text/plain; version=0.0.4; charset=utf-8');
  assert.match(metricsRes.body, /yuzuha_commands_total\{command="ping",outcome="success"\} 1\n/);

  const metricsHead = await sendHttp(server.port, 'HEAD', '/metrics');
  assert.equal(metricsHead.statusCode, 200);
  assert.equal(metricsHead.body, '');

  for (const method of ['POST', 'PUT', 'DELETE']) {
    const methodRes = await sendHttp(server.port, method, '/health');
    assert.equal(methodRes.statusCode, 405);
    assert.equal(methodRes.headers['allow'], 'GET, HEAD');
  }

  for (const unknown of ['/unknown', '/status']) {
    const notFoundGet = await sendHttp(server.port, 'GET', unknown);
    assert.equal(notFoundGet.statusCode, 404);
    const notFoundHead = await sendHttp(server.port, 'HEAD', unknown);
    assert.equal(notFoundHead.statusCode, 404);
    assert.equal(notFoundHead.body, '');
  }

  const noMetricsServer = await startHealthServer(bot, { port: 0, host: '127.0.0.1' });
  try {
    const noMetricsRes = await sendHttp(noMetricsServer.port, 'GET', '/metrics');
    assert.equal(noMetricsRes.statusCode, 404);
  } finally {
    await noMetricsServer.close();
  }

  await bot.destroy();
  const closedRes = await sendHttp(server.port, 'GET', '/health');
  assert.equal(closedRes.statusCode, 503);
  assert.equal((JSON.parse(closedRes.body) as HealthReport).status, 'closed');

  await server.close();
  await server.close();
  await assert.rejects(sendHttp(server.port, 'GET', '/health'));
});

test('CLI parseArguments valida --health-port e --health-host em run e dev', () => {
  assert.deepEqual(parseArguments(['run']), { action: 'run', input: undefined });
  assert.deepEqual(parseArguments(['run', 'bot.config.ts', '--health-port', '8080']), {
    action: 'run',
    input: 'bot.config.ts',
    healthPort: 8080,
  });
  assert.deepEqual(parseArguments(['dev', '--health-port', '9090', '--health-host', '0.0.0.0', 'bot.config.ts']), {
    action: 'dev',
    input: 'bot.config.ts',
    healthPort: 9090,
    healthHost: '0.0.0.0',
  });
  assert.deepEqual(parseArguments(['run', '--health-port', '1']), {
    action: 'run',
    input: undefined,
    healthPort: 1,
  });
  assert.deepEqual(parseArguments(['run', '--health-port', '65535']), {
    action: 'run',
    input: undefined,
    healthPort: 65_535,
  });

  for (const invalid of [
    ['run', '--health-port'],
    ['run', '--health-port', '0'],
    ['run', '--health-port', '65536'],
    ['run', '--health-port', '-1'],
    ['run', '--health-port', 'abc'],
    ['run', '--health-port', '8080', '--health-port', '8081'],
    ['run', '--health-host', '127.0.0.1'],
    ['run', '--health-port', '8080', '--health-host'],
    ['run', '--health-port', '8080', '--health-host', '--other'],
    ['run', '--health-port', '8080', '--health-host', ' 127.0.0.1 '],
    ['check', '--health-port', '8080'],
    ['doctor', '--health-port', '8080'],
  ]) {
    assert.throws(() => parseArguments(invalid), { code: 'USAGE' });
  }
});

test('runBot inicia servidor de healthcheck com /metrics automático e o encerra em sinais ou falhas de login', async t => {
  const prevToken = process.env.FLUXER_BOT_TOKEN;
  t.after(() => {
    if (prevToken === undefined) delete process.env.FLUXER_BOT_TOKEN;
    else process.env.FLUXER_BOT_TOKEN = prevToken;
  });

  // 1. Falha de login fecha o healthServer imediatamente sem vazar porta.
  delete process.env.FLUXER_BOT_TOKEN;
  let failedServer: HealthServer | undefined;
  const failingBot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    logger: false,
  });
  await assert.rejects(
    runBot(failingBot, './commands', false, {
      target: new EventEmitter(),
      healthPort: 0,
      onHealthListening: server => { failedServer = server; },
    }),
    { code: 'TOKEN_MISSING' },
  );
  assert.ok(failedServer);
  await assert.rejects(sendHttp(failedServer.port, 'GET', '/health'));

  // 2. Fluxo normal com /metrics automático e encerramento em SIGTERM.
  process.env.FLUXER_BOT_TOKEN = 'offline-health-token';
  const target = new EventEmitter();
  let ready = false;
  const client = new Client();
  Reflect.set(client, 'isReady', () => ready);
  Object.defineProperty(client, 'uptime', { get: () => (ready ? 500 : null), configurable: true });
  Reflect.set(client, 'login', async () => {
    ready = true;
    client.emit(Events.Ready);
  });

  const metrics = createPrometheusMetrics();
  const bot = new Yuzuha({
    client,
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    logger: false,
    metrics,
  });

  let boundServer: HealthServer | undefined;
  await runBot(bot, './commands', false, {
    target,
    healthPort: 0,
    healthHost: '127.0.0.1',
    onHealthListening: server => { boundServer = server; },
  });

  assert.ok(boundServer);
  const port = boundServer.port;

  const healthRes = await sendHttp(port, 'GET', '/health');
  assert.equal(healthRes.statusCode, 200);
  assert.equal((JSON.parse(healthRes.body) as HealthReport).status, 'ok');

  const metricsRes = await sendHttp(port, 'GET', '/metrics');
  assert.equal(metricsRes.statusCode, 200);
  assert.match(metricsRes.body, /yuzuha_active_executions 0\n/);

  target.emit('SIGTERM');
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));

  await assert.rejects(sendHttp(port, 'GET', '/health'));
});
