import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, Events } from '@fluxerjs/core';
import {
  ConfigError,
  GuardError,
  MemoryStore,
  Yuzuha,
  YuzuhaError,
  defineCommand,
  isYuzuhaError,
} from '../src/index.js';
import type {
  CommandMetricEvent,
  DispatchDropMetricEvent,
  ErrorMetricEvent,
  MetricsSink,
  RetryMetricEvent,
  ScheduleMetricEvent,
} from '../src/index.js';
import {
  DEFAULT_HISTOGRAM_BUCKETS,
  PROMETHEUS_CONTENT_TYPE,
  PrometheusMetrics,
  createPrometheusMetrics,
  escapePrometheusLabel,
} from '../src/metrics.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

const transient = (code: string) => Object.assign(new Error('falha de rede'), { code });

test('YuzuhaOptions.metrics e createPrometheusMetrics validam opções com ConfigError(METRICS_OPTIONS)', () => {
  for (const invalidSink of [
    null,
    false,
    true,
    42,
    'prometheus',
    [],
    () => {},
    { onCommand: 'nope' },
    { onDispatchDropped: 123 },
    { onError: {} },
    { onTransportRetry: [] },
    { onSchedule: false },
    { onActiveExecutions: null },
  ]) {
    assert.throws(
      () => new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false, metrics: invalidSink as never }),
      error => error instanceof ConfigError && isYuzuhaError(error, 'METRICS_OPTIONS'),
    );
  }

  for (const invalidPromOptions of [
    null,
    [],
    'yuzuha',
    new Date(),
    { prefix: '' },
    { prefix: '___' },
    { prefix: '123invalid' },
    { prefix: 'bad-prefix' },
    { buckets: [] },
    { buckets: [0, 10] },
    { buckets: [-5, 10] },
    { buckets: [10, 10] },
    { buckets: [20, 10] },
    { buckets: [Number.NaN] },
    { buckets: [Number.POSITIVE_INFINITY] },
    { maxSeries: 0 },
    { maxSeries: -1 },
    { maxSeries: 1.5 },
  ]) {
    assert.throws(
      () => createPrometheusMetrics(invalidPromOptions as never),
      error => error instanceof ConfigError && isYuzuhaError(error, 'METRICS_OPTIONS'),
    );
  }

  const emptySinkBot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false, metrics: {} });
  return emptySinkBot.destroy();
});

test('instrumenta comandos (success, guarded, error), erros reportados por fonte e gauge de execuções ativas', async t => {
  const commands: CommandMetricEvent[] = [];
  const errors: ErrorMetricEvent[] = [];
  const activeHistory: number[] = [];

  const sink: MetricsSink = {
    onCommand: event => { commands.push(event); },
    onError: event => { errors.push(event); },
    onActiveExecutions: count => { activeHistory.push(count); },
  };

  const enterSlow = deferred();
  const releaseSlow = deferred();

  const bot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    logger: false,
    metrics: sink,
    hooks: {
      onUnknownCommand() {
        throw new YuzuhaError('HTTP_TIMEOUT', 'falha no hook');
      },
    },
  });
  t.after(() => bot.destroy());

  bot.command(defineCommand({
    name: 'ok',
    async run(ctx) { await ctx.reply('certo'); },
  }));
  bot.command(defineCommand({
    name: 'negado',
    run() { throw new GuardError('Sem permissão.', 'PERMISSION_MISSING_AUTHOR'); },
  }));
  bot.command(defineCommand({
    name: 'falha',
    run() { throw new YuzuhaError('HTTP_NETWORK', 'indisponível'); },
  }));
  bot.command(defineCommand({
    name: 'lento',
    async run(ctx) {
      enterSlow.resolve();
      await releaseSlow.promise;
      await ctx.reply('pronto');
    },
  }));

  assert.equal(await bot.handle(mockMessage('!ok')), 'success');
  assert.equal(await bot.handle(mockMessage('!negado')), 'guarded');
  assert.equal(await bot.handle(mockMessage('!falha')), 'error');
  assert.equal(await bot.handle(mockMessage('!inexistente')), 'ignored');

  bot.client.emit(Events.Error, new Error('queda de gateway'));
  await new Promise(resolve => setImmediate(resolve));

  const p1 = bot.handle(mockMessage('!lento', { id: 'm-slow-1' }));
  await enterSlow.promise;
  const p2 = bot.handle(mockMessage('!ok', { id: 'm-fast-2' }));
  await p2;
  releaseSlow.resolve();
  await p1;

  assert.deepEqual(
    commands.map(item => ({ command: item.command, outcome: item.outcome })),
    [
      { command: 'ok', outcome: 'success' },
      { command: 'negado', outcome: 'guarded' },
      { command: 'falha', outcome: 'error' },
      { command: 'ok', outcome: 'success' },
      { command: 'lento', outcome: 'success' },
    ],
  );
  assert.ok(commands.every(item => Number.isFinite(item.durationMs) && item.durationMs >= 0));

  assert.deepEqual(errors, [
    { source: 'command', code: 'HTTP_NETWORK' },
    { source: 'hook', code: 'HTTP_TIMEOUT' },
    { source: 'gateway', code: 'UNEXPECTED_ERROR' },
  ]);

  assert.ok(activeHistory.includes(2), `Esperado pico de 2 execuções ativas, obtido ${JSON.stringify(activeHistory)}`);
  assert.equal(activeHistory.at(-1), 0);
});

test('instrumenta descartes por concorrência (com e sem guildID), retries de transporte e execuções do agendador', async t => {
  const drops: DispatchDropMetricEvent[] = [];
  const retries: RetryMetricEvent[] = [];
  const schedules: ScheduleMetricEvent[] = [];

  const sink: MetricsSink = {
    onDispatchDropped: event => { drops.push(event); },
    onTransportRetry: event => { retries.push(event); },
    onSchedule: event => { schedules.push(event); },
  };

  const client = new Client();
  let patchCount = 0;
  Reflect.set(client.rest, 'patch', async () => {
    patchCount++;
    if (patchCount <= 2) throw transient('ECONNRESET');
    return { id: '500', content: 'editado' };
  });

  const holdSlot = deferred();
  const slotEntered = deferred();
  const bot = new Yuzuha({
    client,
    store: new MemoryStore(),
    logger: false,
    metrics: sink,
    concurrency: { max: 1, maxPending: 0 },
    retry: { requests: 2, delayMs: 2, backoff: 2 },
  });
  t.after(() => bot.destroy());

  await bot.transport.edit('200', '500', { content: 'editado' });
  assert.deepEqual(retries, [
    { attempt: 1, delayMs: 2 },
    { attempt: 2, delayMs: 4 },
  ]);

  const mockBot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    logger: false,
    metrics: sink,
    concurrency: { max: 1, maxPending: 0 },
  });
  t.after(() => mockBot.destroy());

  mockBot.command(defineCommand({
    name: 'segurar',
    async run() {
      slotEntered.resolve();
      await holdSlot.promise;
    },
  }));
  mockBot.command(defineCommand({
    name: 'tarefa-ok',
    async run(ctx) { await ctx.reply('agendado'); },
  }));
  mockBot.command(defineCommand({
    name: 'tarefa-erro',
    run() { throw new YuzuhaError('HTTP_NETWORK', 'erro na tarefa'); },
  }));

  const runningCmd = mockBot.handle(mockMessage('!segurar', { id: 'c1', guildID: '100' }));
  await slotEntered.promise;
  assert.equal(await mockBot.handle(mockMessage('!tarefa-ok', { id: 'c2', guildID: '100' })), 'ignored');
  assert.equal(await mockBot.handle(mockMessage('!tarefa-ok', { id: 'c3', guildID: '' })), 'ignored');
  holdSlot.resolve();
  await runningCmd;

  assert.deepEqual(drops, [
    { reason: 'concurrency', guildID: '100' },
    { reason: 'concurrency' },
  ]);

  await mockBot.scheduler!.add({
    guildID: '100',
    channelID: '200',
    authorID: '1',
    command: 'tarefa-ok',
    input: '',
    due: 0,
  });
  await mockBot.scheduler!.tick(0);

  await mockBot.scheduler!.add({
    guildID: '100',
    channelID: '200',
    authorID: '1',
    command: 'tarefa-erro',
    input: '',
    due: 10,
    maxAttempts: 1,
  });
  await mockBot.scheduler!.tick(10);

  const cancelEntered = deferred();
  mockBot.command(defineCommand({
    name: 'tarefa-cancelada',
    async run(ctx) {
      cancelEntered.resolve();
      await new Promise<void>((_resolve, reject) => {
        ctx.signal.addEventListener('abort', () => reject(new YuzuhaError('EXECUTION_ABORTED', 'cancelado')), { once: true });
      });
    },
  }));
  await mockBot.scheduler!.add({
    guildID: '100',
    channelID: '200',
    authorID: '1',
    command: 'tarefa-cancelada',
    input: '',
    due: 20,
    maxAttempts: 1,
  });
  const pendingTick = mockBot.scheduler!.tick(20);
  await cancelEntered.promise;
  mockBot.scheduler!.stop();
  await pendingTick;

  assert.deepEqual(schedules.map(item => item.outcome), ['completed', 'failed', 'cancelled']);
  assert.ok(schedules.every(item => item.durationMs !== undefined && item.durationMs >= 0));
});

test('exceções síncronas ou rejeições assíncronas em MetricsSink customizado nunca derrubam comandos', async t => {
  const brokenSink: MetricsSink = {
    onCommand() { throw new Error('falha síncrona em onCommand'); },
    onDispatchDropped() { throw new Error('falha síncrona em onDispatchDropped'); },
    onError() { return Promise.reject(new Error('rejeição em onError')) as unknown as void; },
    onTransportRetry() { throw new Error('falha em onTransportRetry'); },
    onSchedule() { throw new Error('falha em onSchedule'); },
    onActiveExecutions() { throw new Error('falha em onActiveExecutions'); },
  };

  const transport = new MockTransport();
  const bot = new Yuzuha({
    transport,
    store: new MemoryStore(),
    logger: false,
    metrics: brokenSink,
    concurrency: { max: 1, maxPending: 0 },
  });
  t.after(() => bot.destroy());

  bot.command(defineCommand({
    name: 'ping',
    async run(ctx) { await ctx.reply('pong'); },
  }));
  bot.command(defineCommand({
    name: 'boom',
    run() { throw new YuzuhaError('API_ERROR', 'erro esperado'); },
  }));

  assert.equal(await bot.handle(mockMessage('!ping')), 'success');
  assert.equal(transport.messages.at(-1)?.payload.content, 'pong');
  assert.equal(await bot.handle(mockMessage('!boom')), 'error');

  await bot.scheduler!.add({
    guildID: '100',
    channelID: '200',
    authorID: '1',
    command: 'ping',
    input: '',
    due: 0,
  });
  await bot.scheduler!.tick(0);
  assert.equal(transport.messages.length >= 2, true);
});

test('PrometheusMetrics renderiza formato 0.0.4, escapa labels, acumula histogramas e suporta reset()', () => {
  assert.equal(escapePrometheusLabel('a\\b\n"c"'), 'a\\\\b\\n\\"c\\"');

  const defaults = createPrometheusMetrics();
  assert.equal(defaults instanceof PrometheusMetrics, true);
  assert.equal(defaults.contentType, PROMETHEUS_CONTENT_TYPE);
  assert.equal(defaults.contentType, 'text/plain; version=0.0.4; charset=utf-8');
  assert.equal(defaults.prefix, 'yuzuha');
  assert.deepEqual(defaults.buckets, DEFAULT_HISTOGRAM_BUCKETS);

  const metrics = createPrometheusMetrics({
    prefix: 'custom_bot_',
    buckets: [10, 50, 200],
    maxSeries: 2,
  });
  assert.equal(metrics.prefix, 'custom_bot');

  metrics.onActiveExecutions(3);
  metrics.onCommand({ command: 'say\\hi\n"now"', outcome: 'success', durationMs: 25 });
  metrics.onCommand({ command: 'say\\hi\n"now"', outcome: 'success', durationMs: 5 });
  metrics.onCommand({ command: 'other', outcome: 'guarded', durationMs: 250 });
  // Terceira série distinta deve respeitar maxSeries: 2 sem erro.
  metrics.onCommand({ command: 'overflow', outcome: 'error', durationMs: 1 });

  metrics.onDispatchDropped({ reason: 'concurrency', guildID: 'g"1\n\\2' });
  metrics.onDispatchDropped({ reason: 'concurrency' });
  metrics.onError({ source: 'command', code: 'API_ERROR' });
  metrics.onTransportRetry({ attempt: 1, delayMs: 150 });
  metrics.onTransportRetry({ attempt: 2, delayMs: 300 });
  metrics.onSchedule({ outcome: 'completed', durationMs: 40 });
  metrics.onSchedule({ outcome: 'cancelled' });

  const text = metrics.render();
  assert.equal(text.endsWith('\n'), true);
  assert.match(text, /# HELP custom_bot_commands_total /);
  assert.match(text, /# TYPE custom_bot_commands_total counter/);
  assert.match(text, /custom_bot_commands_total\{command="say\\\\hi\\n\\"now\\"",outcome="success"\} 2\n/);
  assert.match(text, /custom_bot_commands_total\{command="other",outcome="guarded"\} 1\n/);
  assert.equal(text.includes('command="overflow"'), false);

  // Buckets cumulativos para say\hi\n"now" (5 ms e 25 ms -> le=10 tem 1, le=50 tem 2, le=200 tem 2, +Inf tem 2, sum=30, count=2).
  assert.match(text, /custom_bot_command_duration_milliseconds_bucket\{command="say\\\\hi\\n\\"now\\"",outcome="success",le="10"\} 1\n/);
  assert.match(text, /custom_bot_command_duration_milliseconds_bucket\{command="say\\\\hi\\n\\"now\\"",outcome="success",le="50"\} 2\n/);
  assert.match(text, /custom_bot_command_duration_milliseconds_bucket\{command="say\\\\hi\\n\\"now\\"",outcome="success",le="200"\} 2\n/);
  assert.match(text, /custom_bot_command_duration_milliseconds_bucket\{command="say\\\\hi\\n\\"now\\"",outcome="success",le="\+Inf"\} 2\n/);
  assert.match(text, /custom_bot_command_duration_milliseconds_sum\{command="say\\\\hi\\n\\"now\\"",outcome="success"\} 30\n/);
  assert.match(text, /custom_bot_command_duration_milliseconds_count\{command="say\\\\hi\\n\\"now\\"",outcome="success"\} 2\n/);

  assert.match(text, /custom_bot_dispatch_dropped_total\{reason="concurrency",guild_id="g\\"1\\n\\\\2"\} 1\n/);
  assert.match(text, /custom_bot_dispatch_dropped_total\{reason="concurrency"\} 1\n/);
  assert.match(text, /custom_bot_errors_total\{source="command",code="API_ERROR"\} 1\n/);
  assert.match(text, /custom_bot_transport_retries_total\{attempt="1"\} 1\n/);
  assert.match(text, /custom_bot_transport_retries_total\{attempt="2"\} 1\n/);
  assert.match(text, /custom_bot_transport_retry_delay_milliseconds_total 450\n/);
  assert.match(text, /custom_bot_scheduler_executions_total\{outcome="completed"\} 1\n/);
  assert.match(text, /custom_bot_scheduler_executions_total\{outcome="cancelled"\} 1\n/);
  assert.match(text, /custom_bot_scheduler_duration_milliseconds_count\{outcome="completed"\} 1\n/);
  assert.equal(text.includes('custom_bot_scheduler_duration_milliseconds_count{outcome="cancelled"}'), false);
  assert.match(text, /custom_bot_active_executions 3\n/);

  metrics.reset();
  const afterReset = metrics.render();
  assert.equal(afterReset.includes('outcome="success"'), false);
  assert.match(afterReset, /custom_bot_transport_retry_delay_milliseconds_total 0\n/);
  assert.match(afterReset, /custom_bot_active_executions 0\n/);
});
