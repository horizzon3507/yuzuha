import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommandContext, GuardError, JsonStore, MemoryStore, PartialModerationError, Scheduler, Yuzuha } from '../src/index.js';
import { Runtime, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage } from '../src/testing.js';

const input = () => ({ guildID: '100', channelID: '200', authorID: '1', command: 'ping', input: '', due: 0 });

test('scheduler pausa, edita e retoma tarefa sem perder retry e repetição', async () => {
  let executions = 0;
  const scheduler = new Scheduler(new MemoryStore(), async () => { executions++; });
  const id = await scheduler.add({ ...input(), interval: 100, maxAttempts: 3, retryDelayMs: 5, retryBackoff: 2 });
  assert.equal(await scheduler.pause(id), true);
  await scheduler.tick(0);
  assert.equal(executions, 0);
  await scheduler.edit(id, { command: 'novo', input: 'dados', due: 10, interval: null });
  const task = (await scheduler.list())[0]!;
  assert.equal(task.paused, true); assert.equal(task.interval, undefined); assert.equal(task.maxAttempts, 3);
  await scheduler.resume(id, 20);
  await scheduler.tick(19);
  assert.equal(executions, 0);
  await scheduler.tick(20);
  assert.equal(executions, 1);
  assert.deepEqual(await scheduler.list(), []);
});

test('retry configurável usa backoff e termina no limite sem engolir falhas parciais', async () => {
  let attempts = 0;
  const scheduler = new Scheduler(new MemoryStore(), async () => { attempts++; throw new Error('temporário'); });
  await scheduler.add({ ...input(), maxAttempts: 3, retryDelayMs: 10, retryBackoff: 2 });
  await scheduler.tick(0);
  assert.equal((await scheduler.list())[0]?.due, 10);
  await scheduler.tick(10);
  assert.equal((await scheduler.list())[0]?.due, 30);
  await scheduler.tick(30);
  assert.equal(attempts, 3);
  assert.deepEqual(await scheduler.list(), []);
  for (const failure of [new PartialModerationError('ban', '2', new Error('store')), new GuardError('negado')]) {
    const terminal = new Scheduler(new MemoryStore(), async () => { throw failure; });
    await terminal.add(input()); await terminal.tick(0);
    assert.deepEqual(await terminal.list(), []);
  }
});

test('políticas inválidas e edição inválida não alteram o store', async () => {
  const scheduler = new Scheduler(new MemoryStore(), async () => {});
  for (const retry of [{ maxAttempts: 0 }, { maxAttempts: 101 }, { retryBackoff: 0 }, { retryDelayMs: 0 }, { retryDelayMs: Infinity }]) {
    await assert.rejects(scheduler.add({ ...input(), ...retry }));
  }
  const id = await scheduler.add(input());
  await assert.rejects(scheduler.edit(id, { interval: -1 }), /Intervalo/);
  assert.equal((await scheduler.list())[0]?.interval, undefined);
});

test('tarefas em execução recusam edição/pausa e recuperação local não libera sua claim', async () => {
  let started!: () => void, finish!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const blocked = new Promise<void>(resolve => { finish = resolve; });
  const scheduler = new Scheduler(new MemoryStore(), async () => { started(); await blocked; });
  const id = await scheduler.add(input());
  const tick = scheduler.tick(0);
  await ready;
  await assert.rejects(scheduler.pause(id), /execução/);
  await assert.rejects(scheduler.edit(id, { input: 'outro' }), /execução/);
  assert.equal(await scheduler.recover(600_000), 0);
  finish(); await tick;
  assert.deepEqual(await scheduler.list(), []);
});

test('dois schedulers reivindicam tarefas uma única vez e respeitam cancelamento', async () => {
  const store = new MemoryStore(), calls: string[] = [];
  const run = async (task: { id: string }) => { calls.push(task.id); };
  const first = new Scheduler(store, run), second = new Scheduler(store, run);
  const ids = await Promise.all(Array.from({ length: 10 }, () => first.add(input())));
  await first.cancel(ids[0]!);
  await Promise.all([first.tick(0), second.tick(0)]);
  assert.equal(calls.length, 9); assert.equal(new Set(calls).size, 9);
});

test('claim antiga não apaga uma tarefa recuperada/reivindicada novamente', async () => {
  const store = new MemoryStore();
  const scheduler = new Scheduler(store, async () => {
    await store.update(state => { state.schedules[0]!.claimID = 'nova-claim'; state.schedules[0]!.due = 123; });
  });
  await scheduler.add(input()); await scheduler.tick(0);
  assert.equal((await scheduler.list())[0]?.due, 123);
  assert.equal((await scheduler.list())[0]?.claimID, 'nova-claim');
});

test('callback não altera a identidade da claim interna ao modificar seu snapshot', async () => {
  const scheduler = new Scheduler(new MemoryStore(), async task => { task.id = 'alterado'; task.claimID = 'alterada'; });
  await scheduler.add(input()); await scheduler.tick(0);
  assert.deepEqual(await scheduler.list(), []);
});

test('pausa e políticas sobrevivem ao fechamento do store JSON', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-schedules-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'state.json');
  const scheduler = new Scheduler(new JsonStore(path), async () => {});
  const id = await scheduler.add({ ...input(), retryDelayMs: 123, retryBackoff: 3 });
  await scheduler.pause(id);
  const reopened = new Scheduler(new JsonStore(path), async () => {});
  assert.equal((await reopened.list())[0]?.paused, true);
  assert.equal((await reopened.list())[0]?.retryDelayMs, 123);
  assert.equal((await reopened.list())[0]?.retryBackoff, 3);
});

test('scripts só alteram agendamentos do mesmo autor e servidor', async () => {
  const scheduler = new Scheduler(new MemoryStore(), async () => {});
  const id = await scheduler.add(input());
  const runtime = registerBuiltins(new Runtime());
  const ctx = new CommandContext({ message: mockMessage('!test', { authorID: '2' }), command: { name: 'test', code: '' },
    transport: new MockTransport(), store: new MemoryStore(), cooldown: () => 0, scheduler });
  const run = (source: string) => runtime.execute(runtime.compile(source), ctx);
  assert.equal(await run(`$pauseSchedule[${id}]`), false);
  assert.equal(await run(`$unschedule[${id}]`), false);
  ctx.message.authorID = '1'; ctx.message.guildID = 'outro';
  assert.equal(await run(`$editSchedule[${id};$object[input;outro]]`), false);
  ctx.message.guildID = '100';
  assert.equal(await run(`$pauseSchedule[${id}]`), true);
  assert.equal(await run(`$editSchedule[${id};$object[maxAttempts;2;retryDelayMs;10]]`), true);
  assert.equal(await run(`$resumeSchedule[${id};1h]`), true);
});

test('falha de comando agendado volta ao scheduler e recebe retry', async t => {
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), onError() {} });
  t.after(() => bot.destroy());
  let calls = 0;
  bot.command({ name: 'ping', run() { calls++; throw new Error('temporário'); } });
  await bot.scheduler!.add({ ...input(), retryDelayMs: 10 });
  await bot.scheduler!.tick(0);
  assert.equal(calls, 1);
  assert.equal((await bot.scheduler!.list())[0]?.attempts, 1);
  await bot.scheduler!.tick(10);
  assert.equal(calls, 2);
});

test('scheduler não repete moderação após falha parcial ou falha de resposta, com e sem caso', async t => {
  for (const record of [true, false]) {
    const transport = new MockTransport();
    const bot = new Yuzuha({ transport, store: new MemoryStore(), onError() {} });
    t.after(() => bot.destroy());
    bot.command({ name: 'ping', async run(ctx) { await ctx.moderate('ban', '2', 'motivo', { record }); throw new Error('resposta falhou'); } });
    await bot.scheduler!.add(input()); await bot.scheduler!.tick(0); await bot.scheduler!.tick(30_000);
    assert.equal(transport.actions.length, 1);
    assert.deepEqual(await bot.scheduler!.list(), []);
  }
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), onError() {} });
  t.after(() => bot.destroy());
  let calls = 0;
  bot.command({ name: 'ping', run() { calls++; throw new PartialModerationError('ban', '2', new Error('store')); } });
  await bot.scheduler!.add(input()); await bot.scheduler!.tick(0);
  assert.equal(calls, 1);
  assert.deepEqual(await bot.scheduler!.list(), []);
});
