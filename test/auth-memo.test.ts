import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlags } from '@fluxerjs/core';
import {
  CommandContext,
  GuardError,
  MemoryStore,
  PartialModerationError,
  Yuzuha,
  defineCommand,
} from '../src/index.js';
import { AuthorizationService, MemberMemo } from '../src/services/authorization.js';
import { bindAuthorizedResources } from '../src/services/resource-authorization.js';
import type { RoleInfo } from '../src/ports/resources/roles.js';
import type { Store } from '../src/ports/store.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';

function spyTransport() {
  const transport = new MockTransport();
  const memberCalls: { guildID: string; userID: string; channelID?: string }[] = [];
  const baseMember = transport.member.bind(transport);
  transport.member = async (guildID: string, userID: string, channelID?: string) => {
    memberCalls.push({ guildID, userID, channelID });
    return baseMember(guildID, userID);
  };
  return { transport, memberCalls };
}

test('multi-permission command warms author and bot concurrently and calls member() only twice', async () => {
  const transport = new MockTransport();
  const events: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const baseMember = transport.member.bind(transport);
  transport.member = async (guildID: string, userID: string) => {
    events.push(`start:${userID}`);
    await gate;
    events.push(`end:${userID}`);
    return baseMember(guildID, userID);
  };

  const bot = new Yuzuha({ transport, store: new MemoryStore() });
  bot.command(defineCommand({
    name: 'multi',
    permissions: ['ManageMessages', 'KickMembers', 'BanMembers'],
    botPermissions: ['ManageMessages', 'KickMembers', 'BanMembers'],
    async run(ctx) {
      await ctx.requirePermission('ManageMessages');
      await ctx.requirePermission('BanMembers', true);
      await ctx.reply('ok');
    },
  }));

  const pending = bot.handle(mockMessage('!multi'));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(events, ['start:1', 'start:999']);
  release();
  assert.equal(await pending, 'success');
  assert.equal(events.filter(e => e.startsWith('start:')).length, 2);
  assert.equal(transport.messages.at(-1)?.payload.content, 'ok');
  await bot.destroy();
});

test('moderation ban deduplicates actor lookups, fetches target fresh and preserves error precedence', async t => {
  await t.test('ban without declarative permissions makes 3 member() calls (author, bot, target)', async () => {
    const { transport, memberCalls } = spyTransport();
    const bot = new Yuzuha({ transport, store: new MemoryStore() });
    bot.command(defineCommand({
      name: 'ban',
      async run(ctx) {
        await ctx.mod.ban('2', { reason: 'spam' });
        await ctx.reply('banned');
      },
    }));
    assert.equal(await bot.handle(mockMessage('!ban')), 'success');
    assert.deepEqual(memberCalls.map(c => c.userID), ['1', '999', '2']);
    await bot.destroy();
  });

  await t.test('ban with declarative permissions reuses warmed author and bot (still 3 calls total)', async () => {
    const { transport, memberCalls } = spyTransport();
    const bot = new Yuzuha({ transport, store: new MemoryStore() });
    bot.command(defineCommand({
      name: 'ban',
      permissions: ['BanMembers'],
      botPermissions: ['BanMembers'],
      async run(ctx) {
        await ctx.mod.ban('2', { reason: 'spam' });
      },
    }));
    assert.equal(await bot.handle(mockMessage('!ban')), 'success');
    assert.deepEqual(memberCalls.map(c => c.userID), ['1', '999', '2']);
    await bot.destroy();
  });

  await t.test('author missing permission takes precedence over bot missing permission', async () => {
    const { transport, memberCalls } = spyTransport();
    transport.setMember('100', { id: '1', owner: false, permissions: 0n, rank: 100 });
    transport.setMember('100', { id: '999', owner: false, permissions: 0n, rank: 90 });
    const ctx = new CommandContext({
      message: mockMessage('!ban'),
      transport,
      store: new MemoryStore(),
      command: { name: 'ban' },
      cooldown: () => 0,
    });
    await assert.rejects(
      ctx.mod.ban('2', { reason: 'spam' }),
      (error: unknown) => error instanceof GuardError && error.reason === 'PERMISSION_MISSING_AUTHOR',
    );
    assert.deepEqual(memberCalls.map(c => c.userID), ['1', '999']);
  });

  await t.test('bot missing permission rejects before target lookup', async () => {
    const { transport, memberCalls } = spyTransport();
    transport.setMember('100', { id: '999', owner: false, permissions: 0n, rank: 90 });
    const ctx = new CommandContext({
      message: mockMessage('!ban'),
      transport,
      store: new MemoryStore(),
      command: { name: 'ban' },
      cooldown: () => 0,
    });
    await assert.rejects(
      ctx.mod.ban('2', { reason: 'spam' }),
      (error: unknown) => error instanceof GuardError && error.reason === 'PERMISSION_MISSING_BOT',
    );
    assert.deepEqual(memberCalls.map(c => c.userID), ['1', '999']);
  });

  await t.test('hierarchy, owner target and self target checks', async () => {
    const { transport, memberCalls } = spyTransport();
    transport.setMember('100', { id: '1', owner: false, permissions: PermissionFlags.BanMembers, rank: 50 });
    transport.setMember('100', { id: '2', owner: false, permissions: 0n, rank: 80 });
    const ctx = new CommandContext({
      message: mockMessage('!ban'),
      transport,
      store: new MemoryStore(),
      command: { name: 'ban' },
      cooldown: () => 0,
    });
    await assert.rejects(
      ctx.mod.ban('2', { reason: 'spam' }),
      (error: unknown) => error instanceof GuardError && error.reason === 'HIERARCHY',
    );
    assert.deepEqual(memberCalls.map(c => c.userID), ['1', '999', '2']);

    transport.setMember('100', { id: '2', owner: true, permissions: 0n, rank: 1 });
    await assert.rejects(
      ctx.mod.ban('2', { reason: 'spam' }),
      (error: unknown) => error instanceof GuardError && error.reason === 'OWNER_TARGET',
    );

    const beforeSelf = memberCalls.length;
    await assert.rejects(
      ctx.mod.ban('1', { reason: 'spam' }),
      (error: unknown) => error instanceof GuardError && error.reason === 'SELF_TARGET',
    );
    assert.equal(memberCalls.length, beforeSelf);
  });

  await t.test('partial moderation failure propagates without re-fetching author or bot', async () => {
    const { transport, memberCalls } = spyTransport();
    const baseStore = new MemoryStore();
    const failingStore: Store = {
      read: reader => baseStore.read(reader),
      update: async () => { throw new Error('disk full'); },
    };
    const ctx = new CommandContext({
      message: mockMessage('!ban'),
      transport,
      store: failingStore,
      command: { name: 'ban' },
      cooldown: () => 0,
    });
    await assert.rejects(ctx.mod.ban('2', { reason: 'spam' }), PartialModerationError);
    assert.equal(transport.actions.length, 1);
    assert.deepEqual(memberCalls.map(c => c.userID), ['1', '999', '2']);
  });
});

test('MemberMemo deduplicates concurrent calls, evicts rejections and supports invalidation', async () => {
  const { transport, memberCalls } = spyTransport();
  let failFirst = true;
  const orig: (guildID: string, userID: string, channelID?: string) => Promise<import('../src/contracts.js').ModerationMember> = transport.member.bind(transport);
  transport.member = async (guildID: string, userID: string, channelID?: string) => {
    const member = await orig(guildID, userID, channelID);
    if (failFirst && userID === '1') {
      failFirst = false;
      throw new Error('transient');
    }
    return member;
  };

  const memo = new MemberMemo(transport);
  const [first, second] = await Promise.allSettled([memo.get('100', '1'), memo.get('100', '1')]);
  assert.equal(first.status, 'rejected');
  assert.equal(second.status, 'rejected');
  assert.equal(memberCalls.length, 1);

  const recovered = await memo.get('100', '1');
  assert.equal(recovered.id, '1');
  assert.equal(memberCalls.length, 2);

  await memo.get('100', '1', '200');
  await memo.get('100', '2');
  assert.equal(memberCalls.length, 4);

  memo.invalidate('100', '1');
  await memo.get('100', '2');
  assert.equal(memberCalls.length, 4);
  await memo.get('100', '1');
  await memo.get('100', '1', '200');
  assert.equal(memberCalls.length, 6);

  memo.clear();
  await memo.get('100', '2');
  assert.equal(memberCalls.length, 7);
});

test('requireGuildDeparture warms concurrently and checks author ownership before bot ownership', async () => {
  const { transport, memberCalls } = spyTransport();
  transport.setMember('100', { id: '1', owner: false, permissions: PermissionFlags.Administrator, rank: 100 });
  transport.setMember('100', { id: '999', owner: true, permissions: PermissionFlags.Administrator, rank: 90 });
  const auth = new AuthorizationService(transport, { guildID: '100', authorID: '1' }, new MemberMemo(transport));
  await assert.rejects(
    auth.requireGuildDeparture(),
    (error: unknown) => error instanceof GuardError && error.reason === 'PERMISSION_MISSING_AUTHOR',
  );
  assert.deepEqual(memberCalls.map(c => c.userID), ['1', '999']);
});

test('ctx.resources.roles.add deduplicates lookups and role edit clears shared memo', async () => {
  const { transport, memberCalls } = spyTransport();
  const role: RoleInfo = {
    id: '10', name: 'membro', color: 0, position: 5, permissions: '0',
    hoist: false, mentionable: false, unicodeEmoji: null, managed: false,
  };
  const raw = mockResources({
    roles: {
      resolve: async () => role,
      list: async () => [role],
      add: async () => {},
      edit: async () => {
        transport.setMember('100', { id: '1', owner: false, permissions: 0n, rank: 100 });
        return role;
      },
    },
  });

  const ctx = new CommandContext({
    message: mockMessage('!role'),
    transport,
    store: new MemoryStore(),
    command: { name: 'role' },
    cooldown: () => 0,
    resources: raw,
  });

  await ctx.resources.roles.add('100', '2', '10');
  assert.deepEqual(memberCalls.map(c => c.userID), ['1', '999', '2']);

  // After roles.add clears the shared memo, roles.edit warms it again and then clears it after editing
  await ctx.requirePermission('ManageRoles');
  assert.equal(memberCalls.length, 4);
  await ctx.resources.roles.edit('100', '10', { name: 'atualizado' });
  assert.equal(memberCalls.length, 5);

  await assert.rejects(
    ctx.requirePermission('ManageRoles'),
    (error: unknown) => error instanceof GuardError && error.reason === 'PERMISSION_MISSING_AUTHOR',
  );
  assert.equal(memberCalls.length, 6);

  // Standalone bindAuthorizedResources uses per-call memoization and observes later mutations
  const standaloneTransport = spyTransport();
  const standalone = bindAuthorizedResources(raw, standaloneTransport.transport, { guildID: '100', authorID: '1' });
  await standalone.roles.add('100', '2', '10');
  assert.deepEqual(standaloneTransport.memberCalls.map(c => c.userID), ['1', '999', '2']);
  standaloneTransport.transport.setMember('100', { id: '1', owner: false, permissions: 0n, rank: 100 });
  await assert.rejects(standalone.roles.add('100', '2', '10'), GuardError);
});
