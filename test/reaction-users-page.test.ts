import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, Message } from '@fluxerjs/core';
import { CommandContext } from '../src/commands/context.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import { createMessagesResources } from '../src/infrastructure/fluxer/resources/messages.js';
import { Runtime } from '../src/scripting/runtime.js';
import { defaultLimits } from '../src/scripting/limits.js';
import { resourceMessageFunctions } from '../src/scripting/builtins/native-messages.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
import type { ReactionUsersPage } from '../src/index.js';

test('reactionUsersPage forwards the page limit and cursor and preserves server metadata', async () => {
  const calls: unknown[][] = [];
  const page: ReactionUsersPage = { users: ['2'], hasMore: true, nextAfter: '2' };
  const ctx = new CommandContext({
    message: mockMessage('!reactions'), command: { name: 'reactions', code: '' },
    transport: new MockTransport(), store: new MemoryStore(), cooldown: () => 0,
    resources: mockResources({ messages: { async reactionUsersPage(...args) { calls.push(args); return page; } } }),
  });
  const runtime = new Runtime(defaultLimits).registerAll(resourceMessageFunctions);
  const run = (source: string) => runtime.execute(runtime.compile(source), ctx);
  assert.deepEqual(await run('$reactionUsersPage[400;✅]'), page);
  assert.deepEqual(await run('$reactionUsersPage[400;✅;1;2;300]'), page);
  assert.deepEqual(calls, [['200', '400', '✅', 100, undefined], ['300', '400', '✅', 1, '2']]);
  for (const source of ['$reactionUsersPage[;✅]', '$reactionUsersPage[400;]',
    '$reactionUsersPage[400;✅;0]', '$reactionUsersPage[400;✅;101]',
    '$reactionUsersPage[400;✅;1.5]', '$reactionUsersPage[400;✅;1;cursor]',
    '$reactionUsersPage[400;✅;1;123456789012345678901]']) {
    await assert.rejects(run(source));
  }
  assert.equal(calls.length, 2);
});

test('reaction page adapter preserves SDK object metadata and legacy-array behavior without login', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const user = { id: '2', username: 'ana', discriminator: '0000', global_name: null,
    avatar: null, avatar_color: null, flags: 0, bot: false };
  const message = new Message(client, { id: '400', channel_id: '200', guild_id: '100',
    author: user, content: '', timestamp: '2026-10-28T00:00:00.000Z', type: 0, flags: 0,
    pinned: false, mention_everyone: false, tts: false, mentions: [], mention_roles: [], embeds: [], attachments: [] });
  const calls: unknown[] = [];
  let legacy = false;
  Reflect.set(client.channels, 'fetchMessage', async (channelID: string, messageID: string) => {
    calls.push([channelID, messageID]); return message;
  });
  Reflect.set(client.rest, 'get', async (route: string) => {
    calls.push(route);
    return legacy ? [user] : { items: [user], has_more: true, next_after: '8' };
  });
  const resources = createMessagesResources(client);
  assert.deepEqual(await resources.reactionUsersPage('200', '400', '✅', 2, '1'),
    { users: ['2'], hasMore: true, nextAfter: '8' });
  assert.deepEqual(calls[0], ['200', '400']);
  const route = new URL(String(calls[1]), 'https://offline.test');
  assert.equal(route.searchParams.get('limit'), '2');
  assert.equal(route.searchParams.get('after'), '1');
  assert.match(decodeURIComponent(route.pathname), /channels\/200\/messages\/400\/reactions\/✅\/users$/);
  legacy = true;
  assert.deepEqual(await resources.reactionUsersPage('200', '400', '✅'),
    { users: ['2'], hasMore: false, nextAfter: null });
  const legacyRoute = new URL(String(calls[3]), 'https://offline.test');
  assert.equal(legacyRoute.searchParams.get('limit'), '100');
  assert.equal(legacyRoute.searchParams.has('after'), false);
  for (const [limit, after] of [[0, undefined], [101, undefined], [1.5, undefined], [1, 'invalid']] as const) {
    await assert.rejects(resources.reactionUsersPage('200', '400', '✅', limit, after));
  }
  await assert.rejects(resources.reactionUsersPage('200', '400', '   '));
  assert.equal(calls.length, 4);
});
