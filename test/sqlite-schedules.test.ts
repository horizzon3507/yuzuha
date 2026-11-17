import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import {
  GuardError,
  PartialModerationError,
  SQLiteStore,
  Scheduler,
} from '../src/index.js';
import type { ScheduleRecord, State, Store } from '../src/index.js';
import { variableKey } from '../src/domain/state.js';

const base = {
  guildID: '100',
  channelID: '200',
  authorID: '1',
  command: 'ping',
  input: '',
};

test('SQLiteStore.claimDueSchedules seleciona por prioridade/due/inserção sem hidratar variáveis e evita escrita ociosa', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'yuzuha-sqlite-claim-'));
  const path = join(dir, 'state.sqlite');
  const store = new SQLiteStore(path);
  t.after(async () => {
    await store.close();
    await rm(dir, { recursive: true, force: true });
  });

  // Popula variáveis e casos para garantir que claims não precisam lê-los nem reescrevê-los
  await store.update(state => {
    state.variables[variableKey('guild', '100', 'k')] = 'v';
    state.cases['100'] = [{
      id: 1,
      guildID: '100',
      action: 'ban',
      targetID: '2',
      moderatorID: '1',
      reason: 'ok',
      createdAt: new Date(0).toISOString(),
    }];
  });

  const ran: string[] = [];
  const scheduler = new Scheduler(store, async task => {
    ran.push(task.input);
  }, { concurrency: 1 });

  await scheduler.add({ ...base, input: 'low', due: 0, priority: -5 });
  await scheduler.add({ ...base, input: 'default-late', due: 5 });
  await scheduler.add({ ...base, input: 'high-second', due: 10, priority: 10 });
  await scheduler.add({ ...base, input: 'high-first', due: 2, priority: 10 });
  await scheduler.add({ ...base, input: 'high-tie', due: 10, priority: 10 });
  await scheduler.add({ ...base, input: 'future', due: 1000, priority: 100 });
  const pausedID = await scheduler.add({ ...base, input: 'paused', due: 0, priority: 100 });
  await scheduler.pause(pausedID);

  // Tick antes do menor due (-1) retorna sem claims; apenas tarefas futuras/pausadas existem
  await scheduler.tick(-1);
  assert.deepEqual(ran, []);

  // Verifica que tick(10) executa na ordem exata: priority DESC, due ASC, inserção ASC
  await scheduler.tick(10);
  assert.deepEqual(ran, ['high-first', 'high-second', 'high-tie', 'default-late', 'low']);

  // Verifica via claimDueSchedules direto que idle não reivindica nada e retorna nextDue correto
  const idle = await store.claimDueSchedules({
    now: 50,
    limit: 2,
    createClaimID: () => 'unused',
  });
  assert.deepEqual(idle, { claimed: [], nextDue: 1000 });
});

test('claimDueSchedules e recoverSchedules coordenam conexões SQLite concorrentes, globalConcurrency e cron skip', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'yuzuha-sqlite-sched-conc-'));
  const path = join(dir, 'state.sqlite');
  const a = new SQLiteStore(path);
  const b = new SQLiteStore(path);
  t.after(async () => {
    await a.close();
    await b.close();
    await rm(dir, { recursive: true, force: true });
  });

  let releaseFirst!: () => void;
  let firstStarted!: () => void;
  const started = new Promise<void>(resolve => { firstStarted = resolve; });
  const gate = new Promise<void>(resolve => { releaseFirst = resolve; });

  const callsA: string[] = [];
  const callsB: string[] = [];
  const schedA = new Scheduler(a, async task => {
    callsA.push(task.id);
    if (callsA.length === 1) {
      firstStarted();
      await gate;
    }
  }, { concurrency: 3, globalConcurrency: 1, leaseMs: 100, heartbeatMs: 25 });
  const schedB = new Scheduler(b, async task => {
    callsB.push(task.id);
  }, { concurrency: 3, globalConcurrency: 1, leaseMs: 100, heartbeatMs: 25 });

  const t1 = await schedA.add({ ...base, input: 'one', due: 0 });
  const t2 = await schedA.add({ ...base, input: 'two', due: 0 });

  const tickA = schedA.tick(0);
  await started;

  // Enquanto t1 está ativo em A, B não pode reivindicar t2 (globalConcurrency=1) nem recover pode roubar claim ativa
  await schedB.tick(10);
  assert.deepEqual(callsB, []);
  assert.equal(await schedA.recover(500), 0);

  releaseFirst();
  await tickA;
  await schedB.tick(20);
  assert.deepEqual(callsA, [t1]);
  assert.deepEqual(callsB, [t2]);

  // Cron com missedRun: 'skip' avança em SQL sem executar quando minutos foram perdidos
  let cronCalls = 0;
  const schedCron = new Scheduler(a, async () => { cronCalls++; }, { now: () => 0 });
  await schedCron.addCron({
    ...base,
    expression: '0 10 * * *',
    timezone: 'UTC',
    missedRun: 'skip',
    after: Date.parse('2026-10-21T09:00:00Z'),
  });
  await schedCron.tick(Date.parse('2026-10-24T12:00:00Z'));
  assert.equal(cronCalls, 0);
  assert.equal((await schedCron.list())[0]?.due, Date.parse('2026-10-25T10:00:00Z'));

  // Tarefa órfã em outro processo é liberada por recoverSchedules e executa no próximo tick
  await b.update(state => {
    state.schedules.push({
      ...base,
      id: 'orphan-1',
      due: 0,
      attempts: 0,
      runningAt: 10,
      claimID: 'dead-worker',
    });
  });
  assert.equal(await schedA.recover(150), 1);
  const afterRecover = (await schedA.list()).find(item => item.id === 'orphan-1')!;
  assert.equal(afterRecover.runningAt, null);
  assert.equal(afterRecover.claimID, null);
});

test('SQLite Scheduler preserva stop/drain, erros terminais, retries, histórico e fallback sem fast-path', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'yuzuha-sqlite-sched-stop-'));
  const path = join(dir, 'state.sqlite');
  const store = new SQLiteStore(path);
  t.after(async () => {
    await store.close();
    await rm(dir, { recursive: true, force: true });
  });

  // stop() com concurrency=2 e 4 tarefas não deve reivindicar as 2 restantes
  let ready!: () => void;
  let release!: () => void;
  const bothReady = new Promise<void>(resolve => { ready = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const signals: AbortSignal[] = [];

  const scheduler = new Scheduler(store, async (_task, signal) => {
    signals.push(signal);
    if (signals.length === 2) ready();
    await gate;
  }, { concurrency: 2 });

  for (let i = 0; i < 4; i++) await scheduler.add({ ...base, due: 0, input: `t${i}` });
  const activeTick = scheduler.tick(0);
  await bothReady;
  scheduler.stop();
  await setImmediate();
  assert.ok(signals.every(s => s.aborted));
  release();
  await activeTick;
  await scheduler.drain();
  assert.equal(signals.length, 2);
  assert.equal((await scheduler.list()).length, 2);

  // GuardError e PartialModerationError encerram sem retry e gravam histórico com historyLimit
  const retryStore = new SQLiteStore(join(dir, 'retry.sqlite'));
  t.after(() => retryStore.close());
  let mode: 'retry' | 'guard' | 'partial' = 'retry';
  const retrySched = new Scheduler(retryStore, async () => {
    if (mode === 'guard') throw new GuardError('negado');
    if (mode === 'partial') throw new PartialModerationError('ban', '2', new Error('db'));
    throw new Error('falha');
  }, { historyLimit: 3, random: () => 0.5 });

  await retrySched.add({ ...base, due: 0, maxAttempts: 2, retryDelayMs: 10, retryBackoff: 2 });
  await retrySched.tick(0);
  assert.equal((await retrySched.list())[0]?.due, 10);
  await retrySched.tick(10);
  assert.deepEqual(await retrySched.list(), []);

  mode = 'guard';
  await retrySched.add({ ...base, due: 0 });
  await retrySched.tick(20);
  mode = 'partial';
  await retrySched.add({ ...base, due: 0 });
  await retrySched.tick(30);

  const hist = await retrySched.history();
  assert.equal(hist.length, 3);
  assert.deepEqual(hist.map(h => h.status), ['failed', 'failed', 'failed']);
  assert.equal(hist[1]?.retryable, false);
  assert.equal(hist[2]?.retryable, false);

  // Fallback para Store sem claimDueSchedules/recoverSchedules mantém comportamento idêntico
  const fallbackExecuted: string[] = [];
  const plainStore: Store = {
    read: reader => store.read(reader),
    update: writer => store.update(writer),
  };
  const fallbackSched = new Scheduler(plainStore, async task => {
    fallbackExecuted.push(task.id);
  });
  const remainingIDs = (await fallbackSched.list()).map(item => item.id);
  await fallbackSched.tick(0);
  assert.deepEqual(fallbackExecuted, remainingIDs);
  assert.deepEqual(await fallbackSched.list(), []);
});

test('persistência delta de SQLiteStore preserva variáveis, casos, schedules reordenados e histórico podado', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'yuzuha-sqlite-delta-'));
  const path = join(dir, 'state.sqlite');
  const store = new SQLiteStore(path);
  let reopened: SQLiteStore | undefined;
  t.after(async () => {
    await store.close();
    await reopened?.close();
    await rm(dir, { recursive: true, force: true });
  });

  const makeTask = (id: string, due: number): ScheduleRecord => ({
    ...base,
    id,
    due,
    attempts: 0,
    runningAt: null,
  });

  await store.update(state => {
    state.variables[variableKey('guild', '100', 'keep')] = 1;
    state.variables[variableKey('guild', '100', 'drop')] = 2;
    state.variableExpirations = { [variableKey('guild', '100', 'drop')]: 500 };
    state.cases['100'] = [{
      id: 1,
      guildID: '100',
      action: 'ban',
      targetID: '2',
      moderatorID: '1',
      reason: 'first',
      createdAt: new Date(0).toISOString(),
    }];
    state.schedules = [makeTask('a', 10), makeTask('b', 20), makeTask('c', 30)];
    state.scheduleHistory = [
      { id: 'h1', task: makeTask('a', 10), startedAt: 1, finishedAt: 2, status: 'success', retryable: false },
      { id: 'h2', task: makeTask('b', 20), startedAt: 3, finishedAt: 4, status: 'success', retryable: false },
    ];
  });

  // Atualização parcial: move variável expirável para órfã, adiciona caso, atualiza 'b', remove 'a', acrescenta 'd'
  await store.update(state => {
    delete state.variables[variableKey('guild', '100', 'drop')];
    state.cases['100']!.push({
      id: 2,
      guildID: '100',
      action: 'kick',
      targetID: '3',
      moderatorID: '1',
      reason: 'second',
      createdAt: new Date(1000).toISOString(),
    });
    state.schedules[1]!.due = 25;
    state.schedules.shift();
    state.schedules.push(makeTask('d', 40));
    state.scheduleHistory!.shift();
    state.scheduleHistory!.push({
      id: 'h3',
      task: makeTask('c', 30),
      startedAt: 5,
      finishedAt: 6,
      status: 'failed',
      errorCode: 'ERR',
      retryable: true,
    });
  });

  // Reordenação manual de schedules e troca total de histórico acionam fallback completo
  await store.update(state => {
    state.schedules.reverse();
    state.scheduleHistory = [
      { id: 'h4', task: makeTask('d', 40), startedAt: 7, finishedAt: 8, status: 'success', retryable: false },
    ];
  });

  const expected: State = await store.read(s => s);
  assert.deepEqual(expected.schedules.map(s => s.id), ['d', 'c', 'b']);
  assert.deepEqual(expected.scheduleHistory?.map(h => h.id), ['h4']);
  assert.equal(expected.cases['100']?.length, 2);
  assert.equal(expected.variableExpirations?.[variableKey('guild', '100', 'drop')], 500);

  await store.close();
  reopened = new SQLiteStore(path);
  assert.deepEqual(await reopened.read(s => s), expected);

  // Verifica que o fallback da tabela raw contém a expiração órfã e foi limpo corretamente
  const raw = new DatabaseSync(path, { readOnly: true });
  try {
    const rawRows = raw.prepare('SELECT key, value_json, expires_at FROM yuzuha_raw_variables').all();
    assert.equal(rawRows.length, 1);
    assert.equal(rawRows[0]!['value_json'], null);
    assert.equal(rawRows[0]!['expires_at'], 500);
  } finally {
    raw.close();
  }
});
