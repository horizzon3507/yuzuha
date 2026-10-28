import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, ThreadMember } from '@fluxerjs/core';
import { CommandContext } from '../src/commands/context.js';
import type { ContextOptions } from '../src/commands/context.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import { createThreadsResources } from '../src/infrastructure/fluxer/resources/threads.js';
import { Runtime } from '../src/scripting/runtime.js';
import { defaultLimits } from '../src/scripting/limits.js';
import { threadFunctions } from '../src/scripting/builtins/native-threads.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
import type { IncomingMessage } from '../src/contracts.js';
import type { ThreadMemberDetails } from '../src/index.js';

const MEMBER: ThreadMemberDetails = {
  threadID: '300', userID: '2', joinedTimestamp: Date.parse('2026-10-28T10:00:00.000Z'), flags: 1,
  muted: true, muteEndTime: '2026-10-28T11:00:00.000Z', muteWindow: 3600,
};

function harness(overrides: Partial<IncomingMessage> = {}, context: Partial<ContextOptions> = {}) {
  const calls: Array<[string, string]> = [];
  const ctx = new CommandContext({
    message: mockMessage('!thread', overrides), command: { name: 'thread', code: '' },
    transport: new MockTransport(), store: new MemoryStore(), cooldown: () => 0,
    resources: mockResources({ threads: { async member(threadID, userID) {
      calls.push([threadID, userID]);
      return { ...MEMBER, userID };
    } } }), ...context,
  });
  const runtime = new Runtime(defaultLimits).registerAll(threadFunctions);
  return { calls, run: (source: string) => runtime.execute(runtime.compile(source), ctx) };
}

test('threadMember returns membership details, defaults to the author and normalizes mentions', async () => {
  const { calls, run } = harness();
  assert.deepEqual(await run('$threadMember[300]'), { ...MEMBER, userID: '1' });
  assert.deepEqual(await run('$threadMember[300;<@!2>]'), MEMBER);
  assert.deepEqual(calls, [['300', '1'], ['300', '2']]);
});

test('threadMember uses the explicit event actor without requiring a message', async () => {
  const { calls, run } = harness({}, { actor: { guildID: '100', authorID: '2' }, messageAvailable: false });
  assert.deepEqual(await run('$threadMember[300]'), MEMBER);
  assert.deepEqual(calls, [['300', '2']]);
});

test('threadMember rejects invalid arguments and DMs before resource access', async () => {
  const { calls, run } = harness();
  await assert.rejects(run('$threadMember[;2]'), /ID da thread/);
  await assert.rejects(run('$threadMember[300;qualquer]'), /ID válido/);
  assert.deepEqual(calls, []);
  const dm = harness({ guildID: undefined });
  await assert.rejects(dm.run('$threadMember[300;2]'), /servidor/);
  assert.deepEqual(dm.calls, []);
});

test('thread member adapter uses SDK fetchOne and preserves notification metadata', async () => {
  const client = new Client();
  try {
    const calls: string[] = [];
    const sdkMember = new ThreadMember({ id: '300', user_id: '2',
      join_timestamp: '2026-10-28T10:00:00.000Z', flags: 1, muted: true,
      mute_config: { end_time: MEMBER.muteEndTime, selected_time_window: 3600 } });
    Reflect.set(client.channels, 'fetch', async (threadID: string) => {
      calls.push(`thread:${threadID}`);
      return { isThread: () => true, members: { async fetchOne(userID: string) {
        calls.push(`member:${userID}`); return sdkMember;
      } } };
    });
    const resources = createThreadsResources(client);
    assert.deepEqual(await resources.member('300', '<@2>'), MEMBER);
    assert.deepEqual(calls, ['thread:300', 'member:2']);
    await assert.rejects(resources.member('300', 'invalid'), /ID válido/);
    assert.equal(calls.length, 2);
    Reflect.set(client.channels, 'fetch', async () => ({ isThread: () => false }));
    await assert.rejects(resources.member('200', '2'), /não é uma thread/);
  } finally { await client.destroy(); }
});

test('thread member adapter propagates missing-member failures and preserves unknown metadata', async () => {
  const client = new Client();
  try {
    const failure = new Error('Unknown thread member');
    Reflect.set(client.channels, 'fetch', async () => ({ isThread: () => true,
      members: { async fetchOne(userID: string) {
        if (userID === '3') throw failure;
        return new ThreadMember({ join_timestamp: '2026-10-28T10:00:00.000Z', flags: 0 });
      } } }));
    const resources = createThreadsResources(client);
    assert.deepEqual(await resources.member('300', '2'), { threadID: null, userID: null,
      joinedTimestamp: MEMBER.joinedTimestamp, flags: 0, muted: null, muteEndTime: null, muteWindow: null });
    await assert.rejects(resources.member('300', '3'), error => error === failure);
  } finally { await client.destroy(); }
});
