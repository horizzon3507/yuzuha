import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, Events, Guild, GuildMember, PartialMessage, User } from '@fluxerjs/core';
import { currentExecution, MemoryStore, Yuzuha } from '../src/index.js';
import type { ExecutionStore, LogRecord, YuzuhaLogger } from '../src/index.js';
import { functions } from '../src/functions.js';
import { reportError } from '../src/framework/reporting.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function flush(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test('currentExecution propagates across awaits and isolates concurrent commands', async t => {
  assert.equal(currentExecution(), undefined);

  const bot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    prefix: async () => {
      await flush();
      return '!';
    },
  });
  t.after(() => bot.destroy());

  async function readAsyncExecution(delayMs: number): Promise<ExecutionStore | undefined> {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    return currentExecution();
  }

  const snapshots = new Map<string, { ctxID: string; als: ExecutionStore | undefined }>();
  bot.use(async (ctx, next) => {
    const before = currentExecution();
    assert.equal(before?.executionID, ctx.executionID);
    assert.equal(Object.isFrozen(before), true);
    await next();
  });
  bot.command({
    name: 'probe',
    async run(ctx) {
      const delay = ctx.authorID === '1' ? 15 : 2;
      const seen = await readAsyncExecution(delay);
      snapshots.set(ctx.authorID, { ctxID: ctx.executionID, als: seen });
      await ctx.reply('ok');
    },
  });

  const [first, second] = await Promise.all([
    bot.handle(mockMessage('!probe', { authorID: '1', channelID: '200', guildID: '100' })),
    bot.handle(mockMessage('!probe', { authorID: '2', channelID: '300', guildID: '100' })),
  ]);
  assert.equal(first, 'success');
  assert.equal(second, 'success');
  assert.equal(currentExecution(), undefined);

  const one = snapshots.get('1')!;
  const two = snapshots.get('2')!;
  assert.notEqual(one.ctxID, two.ctxID);
  assert.deepEqual(one.als, {
    executionID: one.ctxID,
    source: 'command',
    command: 'probe',
    guildID: '100',
    channelID: '200',
    userID: '1',
  });
  assert.deepEqual(two.als, {
    executionID: two.ctxID,
    source: 'command',
    command: 'probe',
    guildID: '100',
    channelID: '300',
    userID: '2',
  });
});

test('transport.retry and reportError without ctx inherit executionID from ALS', async t => {
  const logs: LogRecord[] = [];
  const loggerErrors: Record<string, unknown>[] = [];
  const logger: YuzuhaLogger = {
    info() {},
    warn() {},
    error(objOrMsg) {
      if (typeof objOrMsg !== 'string') loggerErrors.push(objOrMsg);
    },
  };

  const client = new Client();
  let deleteCalls = 0;
  t.mock.method(client.rest, 'delete', async () => {
    deleteCalls++;
    if (deleteCalls === 1) throw Object.assign(new Error('reset'), { code: 'ECONNRESET' });
  });

  const bot = new Yuzuha({
    client,
    store: new MemoryStore(),
    scheduler: false,
    retry: { requests: 1, delayMs: 1 },
    logger,
    onLog: record => { logs.push(record); },
  });
  t.after(() => bot.destroy());

  let commandExecutionID = '';
  bot.command({
    name: 'retrycmd',
    async run(ctx) {
      commandExecutionID = ctx.executionID;
      await ctx.delete('555');
      await reportError(bot.options, new Error('manual report without ctx'));
    },
  });

  // Note: MockTransport isn't used here because we want FluxerTransport's reliability hook;
  // invoke dispatch via handle with a plain incoming message.
  assert.equal(await bot.handle(mockMessage('!retrycmd')), 'success');
  await flush();

  const retryLog = logs.find(row => row.event === 'transport.retry') as (LogRecord & { attempt?: number }) | undefined;
  assert.ok(retryLog);
  assert.equal(retryLog.executionID, commandExecutionID);
  assert.equal(retryLog.attempt, 1);

  const errLog = logs.find(row => row.event === 'error');
  assert.ok(errLog);
  assert.equal(errLog.executionID, commandExecutionID);

  const diagnosticErr = loggerErrors.find(entry => entry.err instanceof Error);
  assert.ok(diagnosticErr);
  assert.equal(diagnosticErr.executionID, commandExecutionID);

  let gatewaySeen: ExecutionStore | undefined;
  const gwBot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    onError() { gatewaySeen = currentExecution(); },
  });
  t.after(() => gwBot.destroy());
  gwBot.client.emit(Events.Error, new Error('gw fail'));
  await flush();
  assert.equal(gatewaySeen?.source, 'gateway');
  assert.ok(gatewaySeen?.executionID);
});

test('inside-handler own destroy resolves immediately while cross-bot destroy awaits drain', { timeout: 3000 }, async () => {
  const botA = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false });
  const botB = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false });

  const startedB = deferred();
  const gateB = deferred();
  let finishedB = false;

  botB.command({
    name: 'slow',
    async run() {
      startedB.resolve();
      await gateB.promise;
      finishedB = true;
    },
  });

  const runningB = botB.handle(mockMessage('!slow'));
  await startedB.promise;

  let selfDestroyReturnedBeforeHandlerDone = false;
  let crossDestroyAwaitedB = false;

  botA.command({
    name: 'shutdown-both',
    async run() {
      // Self-destroy inside botA's own handler resolves immediately.
      await botA.destroy();
      selfDestroyReturnedBeforeHandlerDone = true;

      // Cross-bot destroy of botB must wait for botB's active command!
      let bClosed = false;
      const closingB = botB.destroy().then(() => { bClosed = true; });
      await flush();
      assert.equal(bClosed, false);
      assert.equal(finishedB, false);

      gateB.resolve();
      await closingB;
      assert.equal(bClosed, true);
      assert.equal(finishedB, true);
      crossDestroyAwaitedB = true;
    },
  });

  assert.equal(await botA.handle(mockMessage('!shutdown-both')), 'success');
  assert.equal(await runningB, 'success');
  await botA.destroy();
  assert.equal(selfDestroyReturnedBeforeHandlerDone, true);
  assert.equal(crossDestroyAwaitedB, true);
});

test('contextEvent, scriptEvent, raw bot.on events and scheduler tasks correlate via ALS', async t => {
  const logs: LogRecord[] = [];
  const bot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    engine: functions(),
    onError() {},
    onLog: record => { logs.push(record); },
  });
  t.after(() => bot.destroy());

  let contextSeen: ExecutionStore | undefined;
  let contextID = '';
  bot.contextEvent({
    event: 'guildMemberAdd',
    async run(ctx) {
      contextID = ctx.executionID;
      await flush();
      contextSeen = currentExecution();
    },
  });

  let scriptSeen: ExecutionStore | undefined;
  let scriptID = '';
  bot.plugin({
    name: 'als-probe',
    functions: [{
      name: 'probeEventAls',
      category: 'test',
      usage: '$probeEventAls',
      description: '',
      minArgs: 0,
      maxArgs: 0,
      async execute(call) {
        scriptID = call.ctx.executionID;
        await flush();
        scriptSeen = currentExecution();
        return '';
      },
    }],
  });
  bot.scriptEvent({ event: 'messageDelete', code: '$probeEventAls' });

  let rawEventSeen: ExecutionStore | undefined;
  bot.on(Events.Ready, async () => {
    await flush();
    rawEventSeen = currentExecution();
  });

  let scheduledSeen: ExecutionStore | undefined;
  let scheduledCtxID = '';
  bot.command({
    name: 'sched',
    async run(ctx) {
      scheduledCtxID = ctx.executionID;
      await flush();
      scheduledSeen = currentExecution();
    },
  });

  const guild = new Guild(bot.client, { id: '100', name: 'Teste', ownerId: '1' });
  const member = new GuildMember(bot.client, {
    user: { id: '2', username: 'Ana', discriminator: '0000', global_name: null, avatar: null, avatar_color: null, flags: 0, bot: false },
    roles: [],
    joined_at: '2026-10-21T00:00:00.000Z',
    mute: false,
    deaf: false,
  }, guild);
  const partialDelete = new PartialMessage(bot.client, { id: '400', channelId: '200', guildId: '100' });

  bot.client.emit('guildMemberAdd', member);
  bot.client.emit('messageDelete', partialDelete);
  bot.client.emit(Events.Ready);
  await flush();
  await flush();

  assert.deepEqual(contextSeen, {
    executionID: contextID,
    source: 'event',
    event: 'guildMemberAdd',
    guildID: '100',
    channelID: undefined,
    userID: '2',
  });
  assert.deepEqual(scriptSeen, {
    executionID: scriptID,
    source: 'event',
    event: 'messageDelete',
    guildID: '100',
    channelID: '200',
    userID: undefined,
  });
  assert.equal(rawEventSeen?.source, 'event');
  assert.ok(rawEventSeen?.executionID);

  await bot.scheduler!.add({ guildID: '100', channelID: '200', authorID: '1', command: 'sched', input: '', due: 0 });
  await bot.scheduler!.tick(0);

  assert.equal(scheduledSeen?.source, 'scheduler');
  assert.equal(scheduledSeen?.executionID, scheduledCtxID);
  assert.equal(scheduledSeen?.command, 'sched');
  const schedLogs = logs.filter(row => row.executionID === scheduledCtxID).map(row => row.event);
  assert.deepEqual(schedLogs, ['schedule.start', 'command.start', 'command.finish', 'schedule.finish']);
});
