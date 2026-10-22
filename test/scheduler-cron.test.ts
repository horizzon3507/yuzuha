import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CommandContext, GuardError, JsonStore, MemoryStore, PartialModerationError, Scheduler } from '../src/index.js';
import { Runtime, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage } from '../src/testing.js';

const base = { guildID: '100', channelID: '200', authorID: '1', command: 'ping', input: '' };
const timestamp = Date.parse;
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test('addCron calcula próximo vencimento, mantém fuso após sucesso e persiste no JSON', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-cron-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'state.json');
  const now = timestamp('2026-10-21T20:00:00Z');
  let calls = 0;
  const scheduler = new Scheduler(new JsonStore(path), async () => { calls++; }, { now: () => now });
  const id = await scheduler.addCron({ ...base, expression: '0 18 * * *', timezone: 'America/Bahia' });
  assert.equal((await scheduler.list())[0]?.due, timestamp('2026-10-21T21:00:00Z'));
  const reopened = new Scheduler(new JsonStore(path), async () => {}, { now: () => now });
  assert.equal((await reopened.list())[0]?.timezone, 'America/Bahia');
  assert.equal((await reopened.list())[0]?.missedRun, 'run-once');
  await scheduler.tick(timestamp('2026-10-21T21:00:00Z'));
  assert.equal(calls, 1);
  assert.equal((await scheduler.list())[0]?.id, id);
  assert.equal((await scheduler.list())[0]?.due, timestamp('2026-10-22T21:00:00Z'));
  assert.equal((await scheduler.history())[0]?.status, 'success');
});

test('cron atrasado executa uma vez ou pula ocorrências perdidas conforme política', async () => {
  const start = timestamp('2026-10-21T09:00:00Z');
  const tick = timestamp('2026-10-24T12:00:00Z');
  for (const missedRun of ['run-once', 'skip'] as const) {
    let calls = 0;
    const scheduler = new Scheduler(new MemoryStore(), async () => { calls++; }, { now: () => start });
    await scheduler.addCron({ ...base, expression: '0 10 * * *', timezone: 'UTC', missedRun });
    await scheduler.tick(tick);
    assert.equal(calls, missedRun === 'skip' ? 0 : 1);
    assert.equal((await scheduler.list())[0]?.due, timestamp('2026-10-25T10:00:00Z'));
    await scheduler.tick(tick);
    assert.equal(calls, missedRun === 'skip' ? 0 : 1);
  }
});

test('skip preserva ocorrência do minuto atual sem rejeitar atraso normal do relógio', async () => {
  let calls = 0;
  const scheduler = new Scheduler(new MemoryStore(), async () => { calls++; }, { now: () => 0 });
  await scheduler.addCron({ ...base, expression: '* * * * *', timezone: 'UTC', missedRun: 'skip', after: 0 });
  await scheduler.tick(5 * 60_000 + 1200);
  assert.equal(calls, 1);
  assert.equal((await scheduler.list())[0]?.due, 6 * 60_000);
});

test('cron com retry ignora skip durante tentativas e retoma calendário após sucesso', async () => {
  let calls = 0;
  const scheduler = new Scheduler(new MemoryStore(), async () => { if (++calls === 1) throw new Error('temporário'); }, { now: () => 0 });
  await scheduler.addCron({ ...base, expression: '0 * * * *', timezone: 'UTC', missedRun: 'skip', after: 0, retryDelayMs: 120_000 });
  await scheduler.tick(3600_000);
  assert.equal((await scheduler.list())[0]?.due, 3720_000);
  await scheduler.tick(3720_000);
  assert.equal(calls, 2);
  assert.equal((await scheduler.list())[0]?.due, 7200_000);
  assert.equal((await scheduler.list())[0]?.attempts, 0);
});

test('cron sem próxima ocorrência no limite encerra tarefa e registra falha sem repetir efeitos', async () => {
  let calls = 0;
  const scheduler = new Scheduler(new MemoryStore(), async () => { calls++; }, { now: () => 0 });
  await scheduler.addCron({ ...base, expression: '0 0 29 2 */7', timezone: 'UTC', after: timestamp('2026-01-01T00:00:00Z') });
  await scheduler.tick(timestamp('2032-02-29T00:00:00Z'));
  assert.equal(calls, 1); assert.deepEqual(await scheduler.list(), []);
  const failed = (await scheduler.failed())[0]!;
  assert.equal(failed.errorCode, 'CRON_UNREACHABLE'); assert.equal(failed.retryable, false);
  await assert.rejects(scheduler.retry(failed.id), { code: 'SCHEDULE_UNSAFE_RETRY' });
});

test('edição de cron é atômica, respeita autor/servidor e permite trocar por intervalo', async () => {
  const scheduler = new Scheduler(new MemoryStore(), async () => {}, { now: () => 0 });
  const id = await scheduler.addCron({ ...base, expression: '0 * * * *', timezone: 'UTC' });
  assert.equal(await scheduler.edit(id, { cron: '30 * * * *' }, { guildID: '100', authorID: '2' }), false);
  assert.equal(await scheduler.edit(id, { cron: '30 * * * *' }, { guildID: 'other', authorID: '1' }), false);
  await assert.rejects(scheduler.edit(id, { cron: '0 0 31 2 *' }));
  assert.equal((await scheduler.list())[0]?.cron, '0 * * * *');
  await scheduler.edit(id, { cron: '30 * * * *', timezone: 'UTC', retryJitter: 0.25 });
  assert.equal((await scheduler.list())[0]?.due, 1800_000);
  await assert.rejects(scheduler.edit(id, { interval: 1000 }));
  await scheduler.edit(id, { cron: null, interval: 1000 });
  const task = (await scheduler.list())[0]!;
  assert.equal(task.cron, undefined); assert.equal(task.timezone, undefined); assert.equal(task.missedRun, undefined);
  assert.equal(task.interval, 1000);
});

test('ticks sobrepostos compartilham workers e concorrência permanece limitada', async () => {
  const ready = deferred(), gate = deferred();
  let active = 0, peak = 0;
  const calls: string[] = [];
  const scheduler = new Scheduler(new MemoryStore(), async task => {
    calls.push(task.id); active++; peak = Math.max(active, peak);
    if (calls.length === 2) ready.resolve();
    await gate.promise;
    active--;
  }, { concurrency: 2 });
  await Promise.all(Array.from({ length: 6 }, () => scheduler.add({ ...base, due: 0 })));
  const first = scheduler.tick(0);
  await ready.promise;
  const second = scheduler.tick(100);
  assert.equal(second, first);
  assert.equal(active, 2);
  gate.resolve();
  await Promise.all([first, second]);
  assert.equal(peak, 2);
  assert.equal(calls.length, 6); assert.equal(new Set(calls).size, 6);
});

test('concorrência padrão é um e instâncias diferentes mantêm claims exclusivas', async () => {
  const store = new MemoryStore();
  let active = 0, peak = 0;
  const seen: string[] = [];
  const first = new Scheduler(store, async task => {
    seen.push(task.id); active++; peak = Math.max(active, peak); await setImmediate(); active--;
  });
  await Promise.all(Array.from({ length: 5 }, () => first.add({ ...base, due: 0 })));
  await Promise.all([first.tick(0), first.tick(0)]);
  assert.equal(peak, 1);
  const run = async (task: { id: string }) => { seen.push(task.id); await setImmediate(); };
  const second = new Scheduler(store, run, { concurrency: 3 }), third = new Scheduler(store, run, { concurrency: 3 });
  await Promise.all(Array.from({ length: 10 }, () => first.add({ ...base, due: 0 })));
  await Promise.all([second.tick(0), third.tick(0)]);
  assert.equal(seen.length, 15); assert.equal(new Set(seen).size, 15);
});

test('stop aborta workers, impede novas claims e drain aguarda todos os handlers ativos', async () => {
  const ready = deferred(), gate = deferred();
  const signals: AbortSignal[] = [];
  const scheduler = new Scheduler(new MemoryStore(), async (_task, signal) => {
    signals.push(signal);
    if (signals.length === 2) ready.resolve();
    await gate.promise;
  }, { concurrency: 2 });
  await Promise.all(Array.from({ length: 4 }, () => scheduler.add({ ...base, due: 0 })));
  const tick = scheduler.tick(0);
  await ready.promise;
  scheduler.stop();
  let drained = false;
  const drain = scheduler.drain().then(() => { drained = true; });
  await setImmediate();
  assert.equal(drained, false); assert.ok(signals.every(signal => signal.aborted));
  gate.resolve(); await Promise.all([tick, drain]);
  assert.equal(signals.length, 2); assert.equal((await scheduler.list()).length, 2);
});

test('jitter respeita faixa, teto e orçamento de retry sem repetir guards ou falhas parciais', async () => {
  for (const [random, delay] of [[0, 50], [0.5, 100], [1, 150]] as const) {
    let calls = 0;
    const scheduler = new Scheduler(new MemoryStore(), async () => { calls++; throw new Error('falha'); }, { random: () => random, now: () => 0 });
    await scheduler.add({ ...base, due: 0, retryDelayMs: 100, retryJitter: 0.5, maxAttempts: 2 });
    await scheduler.tick(0);
    assert.equal((await scheduler.list())[0]?.due, delay);
    await scheduler.tick(delay);
    assert.equal(calls, 2); assert.deepEqual(await scheduler.list(), []);
    assert.deepEqual((await scheduler.history()).map(item => item.status), ['retrying', 'failed']);
  }
  const capped = new Scheduler(new MemoryStore(), async () => { throw new Error('falha'); }, { random: () => 1 });
  await capped.add({ ...base, due: 0, retryDelayMs: 604800_000, retryJitter: 1 });
  await capped.tick(0);
  assert.equal((await capped.list())[0]?.due, 604800_000);
  for (const error of [new GuardError('negado'), new PartialModerationError('ban', '2', new Error('store'))]) {
    const scheduler = new Scheduler(new MemoryStore(), async () => { throw error; }, { random: () => { throw new Error('não deveria sortear'); } });
    await scheduler.add({ ...base, due: 0, retryJitter: 1 }); await scheduler.tick(0);
    assert.deepEqual(await scheduler.list(), []);
    assert.equal((await scheduler.failed())[0]?.retryable, false);
  }
});

test('opções inválidas são recusadas antes de modificar estado', async () => {
  for (const concurrency of [0, -1, 1.1, 129, Infinity]) assert.throws(() => new Scheduler(new MemoryStore(), async () => {}, { concurrency }));
  const scheduler = new Scheduler(new MemoryStore(), async () => {});
  for (const retryJitter of [-1, 1.1, NaN]) await assert.rejects(scheduler.add({ ...base, due: 0, retryJitter }));
  await assert.rejects(scheduler.add({ ...base, due: 0, cron: '* * * * *', timezone: 'UTC', interval: 1 }));
  await assert.rejects(scheduler.add({ ...base, due: 0, timezone: 'UTC' }));
  assert.deepEqual(await scheduler.list(), []);
});

test('$scheduleCron preserva contexto e valida política, edição e escopo de autor', async () => {
  const scheduler = new Scheduler(new MemoryStore(), async () => {}, { now: () => 0 });
  const ctx = new CommandContext({ message: mockMessage('!test'), command: { name: 'test', code: '' },
    transport: new MockTransport(), store: new MemoryStore(), cooldown: () => 0, scheduler });
  const runtime = registerBuiltins(new Runtime());
  const run = (source: string) => runtime.execute(runtime.compile(source, 'cron.yz'), ctx);
  const id = await run('$scheduleCron[0 18 * * *;America/Bahia;ping;olá;$object[missedRun;skip;retryJitter;0.2]]');
  const task = (await scheduler.list())[0]!;
  assert.equal(task.id, id); assert.equal(task.guildID, '100'); assert.equal(task.channelID, '200'); assert.equal(task.authorID, '1');
  assert.equal(task.retryJitter, 0.2); assert.equal(task.missedRun, 'skip');
  const listed = await run('$schedules') as { cron: string; timezone: string; retryJitter: number }[];
  assert.equal(listed[0]?.cron, '0 18 * * *'); assert.equal(listed[0]?.timezone, 'America/Bahia');
  ctx.message.authorID = '2';
  assert.equal(await run(`$editSchedule[${id};$object[cron;0 12 * * *]]`), false);
  assert.equal(await run(`$unschedule[${id}]`), false);
  await assert.rejects(run('$scheduleCron[0 0 31 2 *;UTC;ping]'));
  await assert.rejects(run('$scheduleCron[* * * * *;UTC;ping;;$object[missedRun;all]]'));
  await assert.rejects(run('$scheduleCron[* * * * *;UTC;ping;;$object[due;0]]'));
});
