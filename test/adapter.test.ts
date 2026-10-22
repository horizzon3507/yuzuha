import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, EmbedBuilder } from '@fluxerjs/core';
import type { MessageSendOptions } from '@fluxerjs/core';
import { FluxerTransport } from '../src/index.js';
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
