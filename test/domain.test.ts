import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlags } from '@fluxerjs/core';
import { CommandContext, GuardError, MemoryStore, YuzuhaError, parseDuration } from '../src/index.js';
import { parseArguments, validateArgumentDefinitions } from '../src/commands/arguments.js';
import { isAbove } from '../src/domain/moderation.js';
import type { ModerationAction, ModerationMember } from '../src/domain/moderation.js';
import type { ArgumentDefinition } from '../src/commands/definition.js';
import { ModerationService } from '../src/services/moderation.js';
import { VariableService } from '../src/services/variables.js';
import { MockTransport, mockMessage } from '../src/testing.js';

test('durations produce positive safe integer milliseconds in JS and script inputs', () => {
  assert.equal(parseDuration('0.5s'), 500);
  assert.equal(parseDuration('1.5h'), 5_400_000);
  assert.equal(parseDuration(500), 500);
  for (const value of [0, -1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '0.1ms', '1e3s', '9007199254740992ms']) {
    assert.throws(() => parseDuration(value), (error: unknown) => error instanceof YuzuhaError && error.code === 'DURATION');
  }
});

test('typed argument errors are guards and optional positional arguments stay compatible', () => {
  const definitions = [
    { name: 'name' },
    { name: 'duration', type: 'duration' as const, required: true },
  ];
  assert.doesNotThrow(() => validateArgumentDefinitions(definitions));
  assert.deepEqual([...parseArguments(definitions, ['name', '0.5s'])], [['name', 'name'], ['duration', 500]]);
  for (const [type, value] of [['duration', 'invalid'], ['user', '@name'], ['integer', '1.5'], ['number', '   ']] as const) {
    assert.throws(() => parseArguments([{ name: 'value', type, required: true }], [value]), GuardError);
  }
  assert.throws(() => parseArguments([{ name: 'text', required: true }], ['']), GuardError);
});

test('invalid JS argument metadata fails during command definition validation', () => {
  for (const invalid of [
    [{ name: 1 }],
    [{ name: 'value', required: 'yes' }],
    [{ name: 'value', rest: 'yes' }],
    [{ name: 'value' }, { name: 'value' }],
    [{ name: 'first', rest: true }, { name: 'last' }],
    [{ name: 'value', choices: [{ value: 1 }] }],
    [{ name: 'value', type: 'unknown' }],
  ]) {
    assert.throws(() => validateArgumentDefinitions(invalid as ArgumentDefinition[]),
      (error: unknown) => error instanceof YuzuhaError && error.code === 'COMMAND_ARGS');
  }
});

test('role hierarchy compares equal ranks by snowflake and fails closed on malformed IDs', () => {
  const member: ModerationMember = { id: '1', owner: false, permissions: 0n, rank: 5, topRoleID: '9007199254740993' };
  assert.equal(isAbove(member, { ...member, topRoleID: '9007199254740994' }), true);
  assert.equal(isAbove(member, { ...member, topRoleID: '9007199254740992' }), false);
  assert.equal(isAbove(member, member), false);
  assert.equal(isAbove(member, { ...member, topRoleID: 'invalid' }), false);
  assert.equal(isAbove({ ...member, topRoleID: undefined }, member), false);
});

test('each moderation action requires the matching author and bot permission', async t => {
  const flags: Record<ModerationAction, bigint> = {
    ban: PermissionFlags.BanMembers,
    unban: PermissionFlags.BanMembers,
    kick: PermissionFlags.KickMembers,
    timeout: PermissionFlags.ModerateMembers,
    move: PermissionFlags.MoveMembers,
    mute: PermissionFlags.MuteMembers,
    deafen: PermissionFlags.DeafenMembers,
  };
  for (const action of ['ban', 'kick', 'timeout', 'unban'] as const) {
    for (const denied of ['author', 'bot'] as const) await t.test(`${action}: ${denied}`, async () => {
      const transport = new MockTransport();
      transport.setMember('100', { id: '1', owner: false, permissions: denied === 'author' ? 0n : flags[action], rank: 100 });
      transport.setMember('100', { id: transport.botID, owner: false, permissions: denied === 'bot' ? 0n : flags[action], rank: 90 });
      const service = new ModerationService(transport, new MemoryStore(), { guildID: '100', authorID: '1' });
      await assert.rejects(service.execute(action, '2', 'reason', { duration: 1000 }), GuardError);
      assert.equal(transport.actions.length, 0);
    });
  }
});

test('timeout refuses administrators and invalid durations before remote actions', async () => {
  const transport = new MockTransport();
  const service = new ModerationService(transport, new MemoryStore(), { guildID: '100', authorID: '1' });
  for (const duration of [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 28 * 86400_000 + 1]) {
    await assert.rejects(service.execute('timeout', '2', 'reason', { duration }), GuardError);
  }
  transport.setMember('100', { id: '2', owner: false, permissions: PermissionFlags.Administrator, rank: 1 });
  await assert.rejects(service.execute('timeout', '2', 'reason', { duration: 1000 }), /administrador/);
  assert.equal(transport.actions.length, 0);
});

test('recorded moderation checks store readability before taking remote action', async () => {
  class UnreadableStore extends MemoryStore {
    override async read<T>(): Promise<T> { throw new Error('unreadable'); }
  }
  const transport = new MockTransport();
  const service = new ModerationService(transport, new UnreadableStore(), { guildID: '100', authorID: '1' });
  await assert.rejects(service.execute('ban', '2', 'reason', { record: true }), /unreadable/);
  assert.equal(transport.actions.length, 0);
  await service.execute('ban', '2', 'reason');
  assert.equal(transport.actions.length, 1);
});

test('context preserves case results and optional durations without invalid JSON properties', async () => {
  const store = new MemoryStore(), transport = new MockTransport();
  const context = new CommandContext({ message: mockMessage('!ban'), store, transport, command: { name: 'ban' }, cooldown: () => 0 });
  const ban = await context.moderate('ban', '2', 'reason', { record: true });
  assert.equal(ban?.id, 1);
  assert.equal(Object.hasOwn(ban!, 'duration'), false);
  assert.deepEqual(await context.case(1), ban);
  assert.equal(context.lastCase, ban);
  const timeout = await context.moderate('timeout', '2', 'reason', { record: true, duration: 28 * 86400_000 });
  assert.equal(timeout?.id, 2);
  assert.equal(timeout?.duration, 28 * 86400_000);
  await context.moderate('unban', '500', 'reviewed');
  assert.equal(context.lastCase, timeout);
});

test('variables preserve falsy values and scope isolation, including deletion and DMs', async () => {
  const store = new MemoryStore();
  const first = new VariableService(store, { guildID: '100', authorID: '1' });
  const second = new VariableService(store, { guildID: '200', authorID: '2' });
  await first.set('global', 'value', false);
  await first.set('guild', 'value', 0);
  await first.set('user', 'value', '');
  assert.equal(await second.get('global', 'value', 'fallback'), false);
  assert.equal(await first.get('guild', 'value', 'fallback'), 0);
  assert.equal(await first.get('user', 'value', 'fallback'), '');
  assert.equal(await second.get('guild', 'value', 'fallback'), 'fallback');
  assert.equal(await second.get('user', 'value', 'fallback'), 'fallback');
  await first.delete('guild', 'value');
  assert.equal(await first.get('guild', 'value', 'fallback'), 'fallback');
  assert.equal(await first.get('global', 'value'), false);
  const direct = new VariableService(store, { guildID: '', authorID: '1' });
  assert.throws(() => direct.get('guild', 'value'), GuardError);
  assert.equal(await direct.get('user', 'value'), '');
});
