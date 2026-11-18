import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, EmbedBuilder, Routes } from '@fluxerjs/core';
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

test('adapter routes edit, delete and react directly without calling fetchMessage', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  let fetchMessageCalls = 0;
  Reflect.set(client.channels, 'fetchMessage', async () => {
    fetchMessageCalls++;
    throw new Error('fetchMessage não deve ser chamado');
  });

  const cachedAdded: unknown[] = [];
  const cachedRemoved: unknown[] = [];
  Reflect.set(client, '_addMessageToCache', (channelID: string, data: unknown) => {
    cachedAdded.push({ channelID, data });
  });
  Reflect.set(client, '_removeMessageFromCache', (channelID: string, messageID: string) => {
    cachedRemoved.push({ channelID, messageID });
  });

  const patches: { route: string; options: { body: Record<string, unknown>; auth?: boolean } }[] = [];
  Reflect.set(client.rest, 'patch', async (route: string, options: { body: Record<string, unknown>; auth?: boolean }) => {
    patches.push({ route, options });
    return { id: '500', content: options.body['content'] };
  });

  const deletes: { route: string; options: { auth?: boolean } }[] = [];
  let deleteMode: 'ok' | 'retry404' | 'first404' = 'ok';
  Reflect.set(client.rest, 'delete', async (route: string, options: { auth?: boolean }) => {
    deletes.push({ route, options });
    if (deleteMode === 'retry404' && deletes.length === 2) {
      throw Object.assign(new Error('net drop'), { code: 'ECONNRESET' });
    }
    if (deleteMode === 'retry404' && deletes.length === 3) {
      throw Object.assign(new Error('gone'), { status: 404, code: 10008 });
    }
    if (deleteMode === 'first404') {
      throw Object.assign(new Error('missing'), { status: 404, code: 10008 });
    }
  });

  const puts: { route: string; options: { auth?: boolean } }[] = [];
  let putAttempt = 0;
  Reflect.set(client.rest, 'put', async (route: string, options: { auth?: boolean }) => {
    putAttempt++;
    if (putAttempt === 2) {
      throw Object.assign(new Error('transient'), { code: 'ECONNRESET' });
    }
    puts.push({ route, options });
  });

  const resolvedEmojis: { emoji: string; guildId?: string | null }[] = [];
  Reflect.set(client, 'resolveEmoji', async (emoji: string, guildId?: string | null) => {
    resolvedEmojis.push({ emoji, guildId });
    return emoji === ':party:' ? 'party:777' : emoji;
  });

  const transport = new FluxerTransport(client, { retry: { requests: 1, delayMs: 1 } });

  // Direct 1-call edit with embeds + allowedMentions + flags
  await transport.edit('200', '500', {
    content: 'novo texto',
    embeds: [{ title: 'T', description: 'D' }],
    allowedMentions: { parse: ['users'], users: ['1'], roles: ['2'], repliedUser: true },
    flags: 4,
    tts: true,
    stickerIds: ['9'],
    reply: { channelID: '200', messageID: '1' },
  });
  assert.equal(patches.length, 1);
  assert.equal(patches[0]?.route, Routes.channelMessage('200', '500'));
  assert.equal(patches[0]?.options.auth, true);
  assert.deepEqual(patches[0]?.options.body, {
    content: 'novo texto',
    embeds: [{ title: 'T', description: 'D' }],
    allowed_mentions: { parse: ['users'], users: ['1'], roles: ['2'], replied_user: true },
    flags: 4,
  });
  assert.deepEqual(cachedAdded, [{ channelID: '200', data: { id: '500', content: 'novo texto' } }]);

  // Direct 1-call delete and retry-404 recovery
  await transport.delete('200', '500');
  assert.equal(deletes.length, 1);
  assert.equal(deletes[0]?.route, Routes.channelMessage('200', '500'));
  assert.equal(deletes[0]?.options.auth, true);
  assert.deepEqual(cachedRemoved, [{ channelID: '200', messageID: '500' }]);

  deleteMode = 'retry404';
  await transport.delete('200', '500');
  assert.equal(deletes.length, 3);
  assert.equal(cachedRemoved.length, 2);

  deleteMode = 'first404';
  await assert.rejects(transport.delete('200', '500'), /missing/);

  // Direct 1-call react with uncached vs cached guild channel and transient retry
  await transport.react('200', '500', '👍');
  assert.deepEqual(resolvedEmojis[0], { emoji: '👍', guildId: undefined });
  assert.equal(puts[0]?.route, Routes.channelMessageReactionMe('200', '500', '👍'));
  assert.equal(puts[0]?.options.auth, true);

  Reflect.set(client.channels, 'get', (id: string) =>
    id === '200' ? { isGuild: () => true, guildId: '100' } : undefined);
  await transport.react('200', '500', ':party:');
  assert.equal(resolvedEmojis.length, 2);
  assert.deepEqual(resolvedEmojis[1], { emoji: ':party:', guildId: '100' });
  assert.equal(puts[1]?.route, Routes.channelMessageReactionMe('200', '500', 'party:777'));
  assert.equal(fetchMessageCalls, 0);
});
