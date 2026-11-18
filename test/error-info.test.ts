import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, Events, Guild, GuildMember, Message } from '@fluxerjs/core';
import { EventContext, MemoryStore, Yuzuha } from '../src/index.js';
import type { CommandContext, ErrorReportInfo, LogRecord, Store } from '../src/index.js';
import { functions } from '../src/functions.js';
import { createTestBot, mockMessage, MockTransport } from '../src/testing.js';

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

interface CapturedReport {
  error: unknown;
  ctx: CommandContext | undefined;
  info: ErrorReportInfo;
}

const memberPayload = () => ({
  user: {
    id: '2',
    username: 'Ana',
    discriminator: '0000',
    global_name: null,
    avatar: null,
    avatar_color: null,
    flags: 0,
    bot: false,
  },
  roles: [],
  joined_at: '2026-10-21T00:00:00.000Z',
  mute: false,
  deaf: false,
});

function createHarness(options: { store?: Store; prefix?: string | (() => string); onCommand?: (ctx: CommandContext, outcome: 'ignored' | 'success' | 'guarded' | 'error') => void | Promise<void> } = {}) {
  const reports: CapturedReport[] = [];
  const logs: LogRecord[] = [];
  const transport = new MockTransport();
  const bot = new Yuzuha({
    transport,
    store: options.store ?? new MemoryStore(),
    scheduler: options.store ? undefined : false,
    http: false,
    engine: functions(),
    prefix: options.prefix,
    onCommand: options.onCommand,
    onError: (error, ctx, info) => { reports.push({ error, ctx, info }); },
    onLog: record => { logs.push(record); },
  });
  return { bot, transport, reports, logs };
}

test('command, reply and onCommand failures report source command and frozen ErrorReportInfo', async t => {
  const transport = new MockTransport();
  const originalReply = transport.reply.bind(transport);
  let failReply = false;
  transport.reply = async (message, payload) => {
    if (failReply) throw new Error('reply failed');
    return originalReply(message, payload);
  };
  const reports: CapturedReport[] = [];
  const logs: LogRecord[] = [];
  let failHook = false;
  const bot = new Yuzuha({
    transport,
    store: new MemoryStore(),
    scheduler: false,
    onError: (error, ctx, info) => { reports.push({ error, ctx, info }); },
    onLog: record => { logs.push(record); },
    onCommand: () => { if (failHook) throw new Error('onCommand failed'); },
  });
  t.after(() => bot.destroy());

  bot.command({ name: 'fail', run() { throw new Error('command failed'); } });
  bot.command({ name: 'ok', async run(ctx) { await ctx.reply('ok'); } });

  assert.equal(await bot.handle(mockMessage('!fail')), 'error');
  assert.equal(reports.length, 1);
  const cmdReport = reports[0]!;
  assert.equal(Object.isFrozen(cmdReport.info), true);
  assert.equal(cmdReport.info.source, 'command');
  assert.equal(cmdReport.info.event, undefined);
  assert.equal(cmdReport.info.ctx, cmdReport.ctx);
  assert.equal(cmdReport.info.executionID, cmdReport.ctx?.executionID);
  assert.equal(typeof cmdReport.info.executionID, 'string');

  const cmdLog = logs.find(row => row.event === 'error');
  assert.ok(cmdLog);
  assert.equal(cmdLog.event, 'error');
  assert.equal(cmdLog.source, 'command');
  assert.equal(cmdLog.trigger, undefined);
  assert.equal(cmdLog.executionID, cmdReport.ctx?.executionID);
  assert.equal(cmdLog.command, 'fail');

  failReply = true;
  assert.equal(await bot.handle(mockMessage('!fail')), 'error');
  assert.equal(reports.length, 3);
  assert.equal(reports[1]!.info.source, 'command');
  assert.match(String(reports[1]!.error), /reply failed/);
  assert.equal(reports[2]!.info.source, 'command');
  assert.match(String(reports[2]!.error), /command failed/);

  failReply = false;
  failHook = true;
  assert.equal(await bot.handle(mockMessage('!ok')), 'success');
  assert.equal(reports.length, 4);
  assert.equal(reports[3]!.info.source, 'command');
  assert.equal(reports[3]!.info.ctx, reports[3]!.ctx);
  assert.equal(reports[3]!.info.executionID, reports[3]!.ctx?.executionID);
  assert.match(String(reports[3]!.error), /onCommand failed/);
});

test('contextEvent and scriptEvent failures report event source, trigger name and EventContext', async t => {
  const { bot, reports, logs } = createHarness();
  t.after(() => bot.destroy());

  bot.contextEvent({
    event: 'guildMemberAdd',
    async run() { throw new Error('context event boom'); },
  });
  bot.scriptEvent({
    event: 'guildMemberAdd',
    code: '$reply[sem mensagem]',
  });

  const guild = new Guild(bot.client, { id: '100', name: 'Teste', ownerId: '1' });
  const member = new GuildMember(bot.client, memberPayload(), guild);
  bot.client.emit(Events.GuildMemberAdd, member);
  await flush();

  assert.equal(reports.length, 2);
  for (const report of reports) {
    assert.equal(Object.isFrozen(report.info), true);
    assert.equal(report.info.source, 'event');
    assert.equal(report.info.event, 'guildMemberAdd');
    assert.ok(report.ctx instanceof EventContext);
    assert.equal(report.info.ctx, report.ctx);
    assert.equal(report.info.executionID, report.ctx?.executionID);
    assert.equal(typeof report.info.executionID, 'string');
  }

  const errorLogs = logs.filter(row => row.event === 'error');
  assert.equal(errorLogs.length, 2);
  for (const [index, log] of errorLogs.entries()) {
    assert.equal(log.event, 'error');
    assert.equal(log.source, 'event');
    assert.equal(log.trigger, 'guildMemberAdd');
    assert.equal(log.executionID, reports[index]!.info.executionID);
    assert.equal(log.command, 'event:guildMemberAdd');
  }
});

test('native bot.on and pre-dispatch messageCreate errors report event source and trigger', async t => {
  const { bot, reports, logs } = createHarness({ prefix: () => { throw new Error('prefix boom'); } });
  Reflect.set(bot.client, 'login', async () => bot.client);
  Reflect.set(bot.client, 'destroy', async () => {});
  t.after(() => bot.destroy());

  bot.on(Events.Ready, async () => { throw new Error('ready boom'); });
  bot.client.emit(Events.Ready);
  await flush();

  assert.equal(reports.length, 1);
  assert.equal(reports[0]!.ctx, undefined);
  assert.equal(reports[0]!.info.source, 'event');
  assert.equal(reports[0]!.info.event, Events.Ready);
  assert.equal(reports[0]!.info.ctx, undefined);
  assert.equal(typeof reports[0]!.info.executionID, 'string');

  assert.equal(logs[0]?.event, 'error');
  assert.equal(logs[0]?.source, 'event');
  assert.equal(logs[0]?.trigger, Events.Ready);
  assert.equal(logs[0]?.executionID, reports[0]!.info.executionID);

  await bot.login('offline-token');
  const rawMessage = new Message(bot.client, {
    id: '400',
    channel_id: '200',
    guild_id: '100',
    author: memberPayload().user,
    content: '!ping',
    timestamp: '2026-10-21T00:00:00.000Z',
    type: 0,
    flags: 0,
    pinned: false,
    mention_everyone: false,
    tts: false,
    mentions: [],
    mention_roles: [],
    embeds: [],
    attachments: [],
  });
  bot.client.emit(Events.MessageCreate, rawMessage);
  await flush();

  assert.equal(reports.length, 2);
  assert.equal(reports[1]!.ctx, undefined);
  assert.equal(reports[1]!.info.source, 'event');
  assert.equal(reports[1]!.info.event, 'messageCreate');
  assert.equal(reports[1]!.info.executionID, undefined);
  assert.equal(logs[1]?.event, 'error');
  assert.equal(logs[1]?.source, 'event');
  assert.equal(logs[1]?.trigger, 'messageCreate');
});

test('gateway error and shardError report gateway source and distinct event names', async t => {
  const { bot, reports, logs } = createHarness();
  t.after(() => bot.destroy());

  const directError = new Error('gateway drop');
  bot.client.emit(Events.Error, directError);
  await flush();

  const shardFailure = new Error('shard drop');
  bot.client.emit(Events.ShardError, 1, shardFailure);
  bot.client.emit(Events.Error, shardFailure);
  await flush();

  assert.equal(reports.length, 2);
  assert.equal(reports[0]!.error, directError);
  assert.equal(reports[0]!.ctx, undefined);
  assert.equal(reports[0]!.info.source, 'gateway');
  assert.equal(reports[0]!.info.event, 'error');
  assert.equal(typeof reports[0]!.info.executionID, 'string');

  assert.equal(reports[1]!.error, shardFailure);
  assert.equal(reports[1]!.ctx, undefined);
  assert.equal(reports[1]!.info.source, 'gateway');
  assert.equal(reports[1]!.info.event, 'shardError');
  assert.equal(typeof reports[1]!.info.executionID, 'string');

  const errorLogs = logs.filter((row): row is Extract<LogRecord, { source?: unknown }> => row.event === 'error');
  assert.equal(errorLogs.length, 2);
  assert.equal(errorLogs[0]?.event, 'error');
  assert.equal(errorLogs[0]?.source, 'gateway');
  assert.equal(errorLogs[0]?.trigger, 'error');
  assert.equal(errorLogs[0]?.executionID, reports[0]!.info.executionID);
  assert.equal(errorLogs[1]?.event, 'error');
  assert.equal(errorLogs[1]?.source, 'gateway');
  assert.equal(errorLogs[1]?.trigger, 'shardError');
  assert.equal(errorLogs[1]?.executionID, reports[1]!.info.executionID);
});

test('scheduler maintenance errors report scheduler source', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolveSeen!: () => void;
  const seen = new Promise<void>(resolve => { resolveSeen = resolve; });
  const failingStore: Store = {
    read: async () => { throw new Error('disk offline'); },
    update: async () => { throw new Error('disk offline'); },
  };
  const reports: CapturedReport[] = [];
  const logs: LogRecord[] = [];
  const client = new Client();
  const bot = new Yuzuha({
    client,
    transport: new MockTransport(),
    store: failingStore,
    http: false,
    onError: (error, ctx, info) => {
      reports.push({ error, ctx, info });
      resolveSeen();
    },
    onLog: record => { logs.push(record); },
  });
  t.after(() => bot.destroy());

  bot.scheduler!.start(10);
  await seen;

  assert.ok(reports.length >= 1);
  assert.equal(reports[0]!.ctx, undefined);
  assert.equal(reports[0]!.info.source, 'scheduler');
  assert.equal(reports[0]!.info.event, undefined);
  assert.equal(typeof reports[0]!.info.executionID, 'string');

  const errorLog = logs.find(row => row.event === 'error');
  assert.ok(errorLog);
  assert.equal(errorLog.event, 'error');
  assert.equal(errorLog.source, 'scheduler');
  assert.equal(errorLog.trigger, undefined);
  assert.equal(errorLog.executionID, reports[0]!.info.executionID);
});

test('createTestBot stays compatible with 2-arg and 3-arg onError callbacks', async t => {
  const twoArgCalls: { error: unknown; ctx?: CommandContext }[] = [];
  const twoArgBot = createTestBot({
    commands: [{ name: 'fail', run() { throw new Error('two-arg'); } }],
    onError: (error, ctx) => { twoArgCalls.push({ error, ctx }); },
  });
  t.after(() => twoArgBot.destroy());

  assert.equal(await twoArgBot.send('!fail'), 'error');
  assert.equal(twoArgBot.errors.length, 1);
  assert.equal(twoArgCalls.length, 1);
  assert.equal(twoArgCalls[0]!.ctx?.command.name, 'fail');

  const threeArgCalls: CapturedReport[] = [];
  const threeArgBot = createTestBot({
    commands: [{ name: 'fail', run() { throw new Error('three-arg'); } }],
    onError: (error, ctx, info) => { threeArgCalls.push({ error, ctx, info }); },
  });
  t.after(() => threeArgBot.destroy());

  assert.equal(await threeArgBot.send('!fail'), 'error');
  assert.equal(threeArgBot.errors.length, 1);
  assert.equal(threeArgCalls.length, 1);
  assert.equal(threeArgCalls[0]!.info.source, 'command');
  assert.equal(threeArgCalls[0]!.info.ctx, threeArgCalls[0]!.ctx);
  assert.equal(threeArgCalls[0]!.info.executionID, threeArgCalls[0]!.ctx?.executionID);
});
