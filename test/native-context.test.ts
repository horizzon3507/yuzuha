import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@fluxerjs/core';
import { CommandContext } from '../src/commands/context.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import type { CaseRecord } from '../src/domain/moderation.js';
import type { JsonValue } from '../src/domain/state.js';
import type { ContextOptions } from '../src/commands/context.js';
import { GuardError, PartialModerationError, YuzuhaError } from '../src/shared/errors.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function context(overrides: Partial<ContextOptions> = {}) {
  const transport = new MockTransport();
  const store = new MemoryStore();
  const ctx = new CommandContext({ message: mockMessage('!native'), command: { name: 'native', run() {} },
    transport, store, cooldown: () => 0, ...overrides });
  return { ctx, transport, store };
}

test('native moderation records by default, retains last case, and shares guards', async () => {
  const { ctx, transport } = context();
  const ban: CaseRecord = await ctx.mod.ban({ id: '2' }, { reason: 'Spam', deleteMessageDays: 2 });
  assert.equal(ban.id, 1);
  assert.equal(ctx.lastCase, ban);
  assert.equal(transport.actions[0]?.duration, 2);
  const kick: CaseRecord = await ctx.mod.kick('2', { reason: 'Spam' });
  assert.equal(kick.id, 2);
  const timeout: CaseRecord = await ctx.mod.timeout('2', { reason: 'Spam', duration: '5m' });
  assert.equal(timeout.duration, 300_000);
  const unban: CaseRecord = await ctx.mod.unban('2', { reason: 'Revisão' });
  assert.equal(unban.id, 4);
  const noRecord: undefined = await ctx.mod.kick('2', { reason: 'Spam', record: false });
  assert.equal(noRecord, undefined);
  assert.equal(ctx.lastCase, unban);
  await assert.rejects(ctx.mod.ban(ctx.authorID, { reason: 'Self' }), GuardError);
  assert.equal(transport.actions.length, 5);
});

test('native moderation preserves partial action failures and never retries', async () => {
  class FailingStore extends MemoryStore {
    override async commit(): Promise<void> { throw new Error('disk full'); }
  }
  const { ctx, transport } = context({ store: new FailingStore() });
  await assert.rejects(ctx.mod.ban('2', { reason: 'Spam' }), PartialModerationError);
  assert.equal(transport.actions.length, 1);
  assert.equal(ctx.lastCase, undefined);
});

test('message helpers use current channel by default and accept explicit destinations', async () => {
  const { ctx, transport } = context();
  const reply = await ctx.reply('reply');
  assert.equal(transport.messages[0]?.replyTo, ctx.message.id);
  const sent = await ctx.send('hello', '300');
  await ctx.edit(sent, 'updated', '300');
  assert.equal(transport.messages[1]?.payload.content, 'updated');
  await ctx.react('👍');
  await ctx.react('✅', sent, '300');
  assert.deepEqual(transport.reactions, [
    { channelID: '200', messageID: ctx.message.id, emoji: '👍' },
    { channelID: '300', messageID: sent, emoji: '✅' },
  ]);
  await ctx.delete(sent, '300');
  await ctx.edit(reply, { content: 'edited reply' });
  await ctx.delete(reply);
  assert.equal(transport.messages.length, 0);
});

test('native client access is explicit and cancellation signal is shared', () => {
  const client = new Client();
  const controller = new AbortController();
  const ctx: CommandContext = context({ native: { client }, signal: controller.signal }).ctx;
  assert.equal(ctx.client, client);
  assert.equal(ctx.nativeMessage, undefined);
  assert.equal(ctx.signal, controller.signal);
  controller.abort();
  assert.equal(ctx.signal.aborted, true);
  assert.throws(() => context().ctx.client, (error: unknown) =>
    error instanceof YuzuhaError && error.code === 'NATIVE_UNAVAILABLE');
  assert.throws(() => ctx.assert(false, 'not allowed'), GuardError);
  ctx.assert(true, 'allowed');
});

test('scoped data updates are atomic and isolated across guild, user and global scopes', async () => {
  const { ctx, store } = context();
  await Promise.all(Array.from({ length: 40 }, () =>
    ctx.data.guild.update('counter', current => Number(current) + 1, 0)));
  assert.equal(await ctx.variable('guild', 'counter'), 40);
  await ctx.data.user.set('counter', 2);
  await ctx.data.global.set('counter', 3);
  const other = context({ store, message: mockMessage('!native', { guildID: '101', authorID: '2' }) }).ctx;
  assert.equal(await other.data.guild.get('counter', 0), 0);
  assert.equal(await other.data.user.get('counter', 0), 0);
  assert.equal(await other.data.global.get('counter'), 3);
  await ctx.data.guild.delete('counter');
  assert.equal(await ctx.data.guild.get('counter', 7), 7);
  assert.equal(await ctx.data.user.get('counter'), 2);
});

test('scoped transactions reject async and invalid JSON without persisting mutations', async () => {
  const { ctx } = context();
  await ctx.data.guild.set('state', { count: 1 });
  const asyncUpdater = (async () => 3) as unknown as (value: JsonValue) => JsonValue;
  await assert.rejects(ctx.data.guild.update('state', asyncUpdater), (error: unknown) =>
    error instanceof YuzuhaError && error.code === 'STORE_ASYNC');
  await assert.rejects(ctx.data.guild.update('state', () => NaN), (error: unknown) =>
    error instanceof YuzuhaError && error.code === 'STORE_INVALID');
  await assert.rejects(ctx.data.guild.update('state', value => {
    if (value && typeof value === 'object' && !Array.isArray(value)) value['count'] = 9;
    throw new Error('rollback');
  }), /rollback/);
  assert.deepEqual(await ctx.data.guild.get('state'), { count: 1 });
  await assert.rejects(ctx.data.guild.set('', 1), /128 caracteres/);
  const dm = context({ message: mockMessage('!native', { guildID: undefined }) }).ctx;
  await assert.rejects(async () => dm.data.guild.get('state'), GuardError);
  await dm.data.user.set('state', 2);
  assert.equal(await dm.data.user.get('state'), 2);
});
