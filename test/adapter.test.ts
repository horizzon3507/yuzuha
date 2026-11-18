import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, EmbedBuilder } from '@fluxerjs/core';
import type { MessageSendOptions } from '@fluxerjs/core';
import { FluxerTransport, YuzuhaError } from '../src/index.js';
import { mockMessage } from '../src/testing.js';

test('real SDK adapter builds SDK embeds and suppresses all mention categories', async () => {
  const client = new Client(), calls: MessageSendOptions[] = [];
  Reflect.set(client.channels, 'send', async (_channelID: string, payload: MessageSendOptions) => {
    calls.push(payload); return { id: '500' };
  });
  const transport = new FluxerTransport(client);
  assert.equal(await transport.send('200', { content: '@everyone', embeds: [{ title: 'Test', description: 'Body', color: 0xFCE300 }] }), '500');
  assert.deepEqual(calls[0]?.allowedMentions, { parse: [], repliedUser: false });
  assert.ok(calls[0]?.embeds?.[0] instanceof EmbedBuilder);
  const message = mockMessage('!test');
  await transport.reply(message, { content: 'reply' });
  assert.deepEqual(calls[1]?.replyTo, { channelId: '200', messageId: message.id, guildId: '100' });
  await client.destroy();
});

test('adapter refreshes member and roles and breaks equal role positions by snowflake', async () => {
  const client = new Client(), fetched: string[] = [];
  const roles = [{ id: '20', position: 5 }, { id: '10', position: 5 }];
  const guild = {
    ownerId: '1', roles: new Map([['100', { id: '100', position: 0 }]]),
    fetchRoles: async () => { fetched.push('roles'); },
    members: { fetch: async (id: string, options: { force: boolean }) => {
      assert.equal(id, '2'); assert.equal(options.force, true); fetched.push('member');
      return { roles: { cache: new Map(roles.map(role => [role.id, role])) }, permissions: { bitfield: 4n } };
    } },
  };
  Reflect.set(client.guilds, 'fetch', async (id: string, options: { force: boolean }) => {
    assert.equal(id, '100'); assert.equal(options.force, true); fetched.push('guild'); return guild;
  });
  const member = await new FluxerTransport(client).member('100', '2');
  assert.deepEqual(fetched, ['guild', 'roles', 'member']);
  assert.equal(member.topRoleID, '10'); assert.equal(member.rank, 5); assert.equal(member.permissions, 4n);
  await client.destroy();
});

test('adapter breaks equal-position multi-digit snowflakes numerically without string sorting mistakes', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const roles = [{ id: '100', position: 5 }, { id: '10', position: 5 }, { id: '9', position: 5 }];
  const guild = {
    ownerId: '1', roles: new Map([['1000', { id: '1000', position: 0 }]]),
    fetchRoles: async () => {},
    members: { fetch: async () => ({
      roles: { cache: new Map(roles.map(role => [role.id, role])) }, permissions: { bitfield: 8n },
    }) },
  };
  Reflect.set(client.guilds, 'fetch', async () => guild);
  const member = await new FluxerTransport(client).member('1000', '2');
  assert.equal(member.topRoleID, '9');
  assert.equal(member.rank, 5);

  const twoRoles = [{ id: '100', position: 5 }, { id: '20', position: 5 }];
  guild.members.fetch = async () => ({
    roles: { cache: new Map(twoRoles.map(role => [role.id, role])) }, permissions: { bitfield: 8n },
  });
  assert.equal((await new FluxerTransport(client).member('1000', '2')).topRoleID, '20');
});

test('adapter fetches channel concurrently with member chain and enforces CHANNEL_GUILD', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const events: string[] = [];
  let releaseGuild!: () => void;
  const guildGate = new Promise<void>(resolve => { releaseGuild = resolve; });
  let channelGuildId = '100';
  let channelIsGuild = true;

  const guild = {
    ownerId: '1', roles: new Map([['100', { id: '100', position: 0 }]]),
    fetchRoles: async () => { events.push('roles'); },
    members: { fetch: async () => {
      events.push('member');
      return {
        roles: { cache: new Map() },
        permissions: { bitfield: 1n },
        permissionsIn: () => ({ bitfield: 16n }),
      };
    } },
  };
  Reflect.set(client.guilds, 'fetch', async () => {
    events.push('guild:start');
    await guildGate;
    events.push('guild:done');
    return guild;
  });
  Reflect.set(client.channels, 'fetch', async (id: string) => {
    assert.equal(id, '300');
    events.push('channel');
    return { isGuild: () => channelIsGuild, guildId: channelGuildId };
  });

  const pending = new FluxerTransport(client).member('100', '2', '300');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(events, ['guild:start', 'channel']);
  releaseGuild();
  const member = await pending;
  assert.deepEqual(events, ['guild:start', 'channel', 'guild:done', 'roles', 'member']);
  assert.equal(member.permissions, 16n);

  channelGuildId = '999';
  await assert.rejects(
    new FluxerTransport(client).member('100', '2', '300'),
    (error: unknown) => error instanceof YuzuhaError && error.code === 'CHANNEL_GUILD',
  );
  channelGuildId = '100';
  channelIsGuild = false;
  await assert.rejects(
    new FluxerTransport(client).member('100', '2', '300'),
    (error: unknown) => error instanceof YuzuhaError && error.code === 'CHANNEL_GUILD',
  );
});
