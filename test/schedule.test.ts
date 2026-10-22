import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandContext, MemoryStore, Scheduler } from '../src/index.js';
import { Runtime, defaultLimits, registerBuiltins } from '../src/functions.js';
import type { ScheduleRecord } from '../src/index.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function setup() {
  const store = new MemoryStore();
  const executed: ScheduleRecord[] = [];
  const scheduler = new Scheduler(store, async task => { executed.push(task); });
  return { store, scheduler, executed };
}

function input(due: number, extra: { interval?: number } = {}) {
  return { guildID: '100', channelID: '200', authorID: '1', command: 'ping', input: '', due, ...extra };
}

test('tick executa uma vez e remove tarefas únicas', async () => {
  const { scheduler, executed, store } = setup();
  const id = await scheduler.add(input(Date.now() - 1000));
  await scheduler.tick();
  assert.equal(executed.length, 1);
  assert.equal(executed[0]!.id, id);
  assert.deepEqual(await store.read(state => state.schedules), []);
  await scheduler.tick();
  assert.equal(executed.length, 1);
});

test('tick não executa tarefas futuras e não duplica sob concorrência', async () => {
  const { scheduler, executed } = setup();
  await scheduler.add(input(Date.now() + 60_000));
  await scheduler.tick();
  assert.equal(executed.length, 0);
  await scheduler.add(input(Date.now() - 1000));
  await Promise.all([scheduler.tick(), scheduler.tick()]);
  assert.equal(executed.length, 1);
});

test('tarefas repetíveis avançam o vencimento', async () => {
  const now = Date.now();
  const { scheduler, executed, store } = setup();
  await scheduler.add(input(now - 1000, { interval: 5000 }));
  await scheduler.tick(now);
  assert.equal(executed.length, 1);
  const records = await store.read(state => state.schedules);
  assert.equal(records.length, 1);
  assert.equal(records[0]!.due, now + 4000);
  assert.equal(records[0]!.runningAt, null);
});

test('cancel remove tarefa e retorna boolean', async () => {
  const { scheduler } = setup();
  const id = await scheduler.add(input(Date.now() + 1000));
  assert.equal(await scheduler.cancel(id), true);
  assert.equal(await scheduler.cancel(id), false);
  assert.deepEqual(await scheduler.list(), []);
});

test('falhas reagendam com atraso e desistem após cinco tentativas', async () => {
  const store = new MemoryStore();
  let attempts = 0;
  const scheduler = new Scheduler(store, async () => { attempts++; throw new Error('falhou'); });
  await scheduler.add(input(0));
  let now = 0;
  await scheduler.tick(now);
  let records = await store.read(state => state.schedules);
  assert.equal(attempts, 1);
  assert.equal(records[0]!.attempts, 1);
  assert.equal(records[0]!.due, 30_000);
  for (let i = 0; i < 4; i++) {
    now += 30_000;
    await scheduler.tick(now);
  }
  records = await store.read(state => state.schedules);
  assert.equal(attempts, 5);
  assert.deepEqual(records, []);
});

test('recover libera tarefas órfãs e preserva recentes', async () => {
  const now = Date.now();
  const { scheduler, store } = setup();
  await scheduler.add(input(now + 10_000));
  await store.update(state => {
    state.schedules[0]!.runningAt = now - 10 * 60_000;
    state.schedules.push({ ...state.schedules[0]!, id: 'recente', runningAt: now - 1000 });
  });
  assert.equal(await scheduler.recover(now), 1);
  const records = await store.read(state => state.schedules);
  assert.equal(records.find(item => item.id === 'recente')?.runningAt, now - 1000);
  assert.equal(records[0]!.runningAt, null);
});

test('start e stop são idempotentes e não deixam timer', async () => {
  const { scheduler } = setup();
  scheduler.start(60_000);
  scheduler.start(60_000);
  scheduler.stop();
  scheduler.stop();
});

function harness(scheduler: Scheduler) {
  const ctx = new CommandContext({ message: mockMessage('!test'), command: { name: 'test', code: '' },
    transport: new MockTransport(), store: new MemoryStore(), cooldown: () => 0, scheduler });
  const runtime = registerBuiltins(new Runtime(defaultLimits));
  return { ctx, run: (source: string) => runtime.execute(runtime.compile(source, 'schedule.yz'), ctx) };
}

test('$schedule, $scheduleEvery, $schedules e $unschedule', async () => {
  const { scheduler } = setup();
  const { run } = harness(scheduler);
  const id = await run('$schedule[1h;ping;olá]') as string;
  assert.match(id, /^[0-9a-f-]{36}$/);
  await run('$scheduleEvery[10m;status]');
  const list = await run('$schedules') as { id: string; command: string; interval?: number }[];
  assert.equal(list.length, 2);
  assert.equal(list[0]!.command, 'ping');
  assert.ok(list.some(item => item.interval === 600_000));
  assert.equal(await run(`$unschedule[${id}]`), true);
  assert.equal(await run(`$unschedule[${id}]`), false);
  await assert.rejects(run('$schedule[1h;]'), /comando/);
});

test('$schedule exige agendador', async () => {
  const ctx = new CommandContext({ message: mockMessage('!test'), command: { name: 'test', code: '' },
    transport: new MockTransport(), store: new MemoryStore(), cooldown: () => 0 });
  const runtime = registerBuiltins(new Runtime(defaultLimits));
  await assert.rejects(runtime.execute(runtime.compile('$schedule[1h;ping]', 'schedule.yz'), ctx), /agendador/);
});
