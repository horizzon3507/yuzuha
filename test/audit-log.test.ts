import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, PermissionFlags } from '@fluxerjs/core';
import {
  CommandContext,
  FluxerResources,
  GuardError,
  MemoryStore,
  YuzuhaError,
  defineCommand,
  isYuzuhaError,
} from '../src/index.js';
import type { AuditLogQueryInput } from '../src/index.js';
import { Runtime, registerBuiltins } from '../src/functions.js';
import { bindAuthorizedResources } from '../src/services/resource-authorization.js';
import {
  MockTransport,
  createMockAuditLogs,
  createTestBot,
  mockAuditLogEntry,
  mockMessage,
  mockResources,
} from '../src/testing.js';

function fakeClientWithAuditLogs(handler: (guildID: string, options: Record<string, unknown>) => unknown) {
  const client = new Client();
  Reflect.set(client.guilds, 'fetch', async (guildID: string, opts?: { force?: boolean }) => {
    assert.deepEqual(opts, { force: true });
    return {
      fetchAuditLogs: async (options: Record<string, unknown>) => handler(guildID, options),
    };
  });
  return client;
}

test('FluxerResources.users.auditLogs mapeia filtros, changes, options e retrocompatibilidade numérica', async t => {
  const received: { guildID: string; options: Record<string, unknown> }[] = [];
  const client = fakeClientWithAuditLogs((guildID, options) => {
    received.push({ guildID, options });
    return {
      entries: [
        {
          id: '175928847299117063',
          actionType: 22,
          userId: '10',
          targetId: '20',
          reason: 'spam reincidente',
          changes: [
            { key: 'nick', oldValue: 'Antigo', newValue: 'Novo' },
            { key: 'mute', oldValue: undefined, newValue: true },
            { key: 'deaf', oldValue: false, newValue: undefined },
          ],
          options: {
            delete_member_days: '7',
            members_removed: '3',
            channel_id: '200',
            message_id: '300',
            role_name: 'Mod',
            application_id: '400',
            count: '5',
            id: '500',
            type: '0',
            custom_target_id: '600',
            autoArchiveDuration: '60',
            parentChannelId: '700',
          },
        },
        {
          id: '175928847299117060',
          actionType: 20,
          userId: null,
          targetId: null,
          reason: null,
          changes: undefined,
          options: null,
        },
      ],
    };
  });
  t.after(() => client.destroy());

  const resources = new FluxerResources(client);

  const defaultResult = await resources.users.auditLogs('100');
  assert.deepEqual(received[0], { guildID: '100', options: { limit: 50 } });
  assert.equal(defaultResult.length, 2);

  const first = defaultResult[0]!;
  assert.equal(first.id, '175928847299117063');
  assert.equal(first.actionType, 22);
  assert.equal(first.userID, '10');
  assert.equal(first.targetID, '20');
  assert.equal(first.reason, 'spam reincidente');
  assert.ok(Number.isSafeInteger(first.createdTimestamp) && first.createdTimestamp > 1_400_000_000_000);
  assert.deepEqual(first.changes, [
    { key: 'nick', oldValue: 'Antigo', newValue: 'Novo' },
    { key: 'mute', newValue: true },
    { key: 'deaf', oldValue: false },
  ]);
  assert.equal('oldValue' in first.changes[1]!, false);
  assert.equal('newValue' in first.changes[2]!, false);
  assert.deepEqual(first.options, {
    deleteMemberDays: '7',
    membersRemoved: '3',
    channelID: '200',
    messageID: '300',
    roleName: 'Mod',
    applicationID: '400',
    count: '5',
    id: '500',
    type: '0',
    customTargetID: '600',
    autoArchiveDuration: '60',
    parentChannelID: '700',
  });

  const second = defaultResult[1]!;
  assert.equal(second.userID, null);
  assert.equal(second.targetID, null);
  assert.equal(second.reason, null);
  assert.deepEqual(second.changes, []);
  assert.equal(second.options, null);

  await resources.users.auditLogs('100', 15);
  assert.deepEqual(received[1], { guildID: '100', options: { limit: 15 } });

  await resources.users.auditLogs('100', {
    limit: 25,
    userID: '10',
    actionType: 22,
    before: '900',
  });
  assert.deepEqual(received[2], {
    guildID: '100',
    options: { limit: 25, userId: '10', actionType: 22, before: '900' },
  });

  await resources.users.auditLogs('100', { after: '100' });
  assert.deepEqual(received[3], {
    guildID: '100',
    options: { limit: 50, after: '100' },
  });
});

test('createMockAuditLogs filtra por userID, actionType, before, after, limit e preserva imutabilidade', async t => {
  const sourceEntries = [
    mockAuditLogEntry({ id: '9', userID: '1', actionType: 20, reason: 'nove' }),
    mockAuditLogEntry({ id: '10', userID: '2', actionType: 22, reason: 'dez', changes: [{ key: 'name', oldValue: 'a', newValue: 'b' }] }),
    mockAuditLogEntry({ id: '25', userID: '1', actionType: 22, reason: 'vinte e cinco', options: { channelID: '200', count: '2' } }),
    mockAuditLogEntry({ id: '100', userID: '1', actionType: 20, reason: 'cem' }),
  ];
  const auditLogs = createMockAuditLogs(sourceEntries);
  sourceEntries.push(mockAuditLogEntry({ id: '999' }));

  assert.deepEqual((await auditLogs('100')).map(entry => entry.id), ['100', '25', '10', '9']);
  assert.deepEqual((await auditLogs('100', 2)).map(entry => entry.id), ['100', '25']);
  assert.deepEqual((await auditLogs('100', { userID: '1' })).map(entry => entry.id), ['100', '25', '9']);
  assert.deepEqual((await auditLogs('100', { actionType: 22 })).map(entry => entry.id), ['25', '10']);
  assert.deepEqual((await auditLogs('100', { userID: '1', actionType: 22 })).map(entry => entry.id), ['25']);

  const pageBefore1 = await auditLogs('100', { limit: 2, before: '100' });
  assert.deepEqual(pageBefore1.map(entry => entry.id), ['25', '10']);
  const pageBefore2 = await auditLogs('100', { limit: 2, before: pageBefore1.at(-1)!.id });
  assert.deepEqual(pageBefore2.map(entry => entry.id), ['9']);

  const pageAfter1 = await auditLogs('100', { limit: 2, after: '9' });
  assert.deepEqual(pageAfter1.map(entry => entry.id), ['10', '25']);
  const pageAfter2 = await auditLogs('100', { limit: 2, after: pageAfter1.at(-1)!.id });
  assert.deepEqual(pageAfter2.map(entry => entry.id), ['100']);

  pageAfter1[0]!.changes.push({ key: 'mutated', newValue: 1 });
  const fresh = await auditLogs('100', { actionType: 22 });
  assert.equal(fresh.find(entry => entry.id === '10')!.changes.length, 1);

  let capturedCount = 0;
  const fixture = createTestBot({
    resources: { users: { auditLogs } },
    commands: [defineCommand({
      name: 'audit',
      async run(ctx) {
        const logs = await ctx.resources.users.auditLogs(ctx.requireGuild(), { userID: '1', limit: 2 });
        capturedCount = logs.length;
        await ctx.reply(logs.map(item => item.id).join(','));
      },
    })],
  });
  t.after(() => fixture.destroy());

  assert.equal(await fixture.send('!audit'), 'success');
  assert.equal(capturedCount, 2);
  assert.equal(fixture.messages.at(-1)?.payload.content, '100,25');
});

test('auditLogs valida limites, opções e cursores com códigos tipados antes de acessar a rede', async t => {
  let called = false;
  const client = fakeClientWithAuditLogs(() => {
    called = true;
    return { entries: [] };
  });
  t.after(() => client.destroy());
  const resources = new FluxerResources(client);

  for (const badLimit of [0, -1, 101, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    await assert.rejects(
      resources.users.auditLogs('100', badLimit),
      (err: unknown) => isYuzuhaError(err, 'LIMIT'),
    );
    await assert.rejects(
      resources.users.auditLogs('100', { limit: badLimit }),
      (err: unknown) => isYuzuhaError(err, 'LIMIT'),
    );
  }

  class CustomFilter {
    limit = 10;
  }
  const badOptions: unknown[] = [
    null,
    '10',
    [10],
    new CustomFilter(),
    { unknown: '1' },
    { userID: '' },
    { userID: 'abc' },
    { userID: '1'.repeat(21) },
    { userID: 123 },
    { actionType: 0 },
    { actionType: -2 },
    { actionType: 2.5 },
    { actionType: '20' },
  ];
  for (const invalid of badOptions) {
    await assert.rejects(
      resources.users.auditLogs('100', invalid as AuditLogQueryInput),
      (err: unknown) => isYuzuhaError(err, 'AUDIT_LOG_OPTIONS'),
    );
  }

  const badCursors: AuditLogQueryInput[] = [
    { before: '' },
    { before: 'not-a-snowflake' },
    { before: '9'.repeat(21) },
    { after: '' },
    { after: 'abc' },
    { after: '9'.repeat(21) },
    { before: '100', after: '50' },
  ];
  for (const invalid of badCursors) {
    await assert.rejects(
      resources.users.auditLogs('100', invalid),
      (err: unknown) => isYuzuhaError(err, 'AUDIT_LOG_CURSOR'),
    );
  }

  assert.equal(called, false);
});

test('autorização de auditLogs exige servidor atual e ViewAuditLog para autor e bot sem ser engolida por $try', async () => {
  const calls: unknown[] = [];
  const raw = mockResources({
    users: {
      auditLogs: async (guildID, input) => {
        calls.push([guildID, input]);
        return [mockAuditLogEntry({ id: '55', actionType: 20 })];
      },
    },
  });

  for (const [missingActor, expectedReason] of [
    ['1', 'PERMISSION_MISSING_AUTHOR'],
    ['999', 'PERMISSION_MISSING_BOT'],
  ] as const) {
    const transport = new MockTransport();
    transport.setMember('100', { id: '1', owner: false, permissions: PermissionFlags.ViewAuditLog, rank: 50 });
    transport.setMember('100', { id: '999', owner: false, permissions: PermissionFlags.ViewAuditLog, rank: 50 });
    transport.setMember('100', { id: missingActor, owner: false, permissions: 0n, rank: 50 });

    const authorized = bindAuthorizedResources(raw, transport, { guildID: '100', authorID: '1' });
    await assert.rejects(
      authorized.users.auditLogs('100', { limit: 5 }),
      (err: unknown) => err instanceof GuardError && err.reason === expectedReason,
    );

    const ctx = new CommandContext({
      message: mockMessage('!audit'),
      transport,
      store: new MemoryStore(),
      command: { name: 'audit' },
      cooldown: () => 0,
      resources: raw,
    });
    const runtime = registerBuiltins(new Runtime());
    await assert.rejects(
      runtime.execute(runtime.compile('$try[$auditLogs[5];ignorado]'), ctx),
      (err: unknown) => err instanceof GuardError && err.reason === expectedReason,
    );
  }

  assert.deepEqual(calls, []);

  const transport = new MockTransport();
  transport.setMember('100', { id: '1', owner: false, permissions: PermissionFlags.ViewAuditLog, rank: 50 });
  transport.setMember('100', { id: '999', owner: false, permissions: PermissionFlags.ViewAuditLog, rank: 50 });
  const authorized = bindAuthorizedResources(raw, transport, { guildID: '100', authorID: '1' });

  await assert.rejects(authorized.users.auditLogs('999'), GuardError);
  await assert.rejects(
    bindAuthorizedResources(raw, transport, { guildID: '', authorID: '1' }).users.auditLogs('100'),
    (err: unknown) => err instanceof GuardError && err.reason === 'NOT_IN_GUILD',
  );
  await assert.rejects(
    authorized.users.auditLogs('100', { before: '10', after: '5' }),
    (err: unknown) => err instanceof YuzuhaError && err.code === 'AUDIT_LOG_CURSOR',
  );
  assert.deepEqual(calls, []);

  const entries = await authorized.users.auditLogs('100', { limit: 10, userID: '1' });
  assert.equal(entries.length, 1);
  assert.deepEqual(calls, [['100', { limit: 10, userID: '1' }]]);
});
