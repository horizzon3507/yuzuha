import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@fluxerjs/core';
import { FluxerTransport, MemberCache, MemoryStore, Yuzuha, defineCommand } from '../src/index.js';
import { MockTransport, mockMessage } from '../src/testing.js';

const { measureRestCalls } = await import(new URL('../benchmarks/rest-calls.mjs', import.meta.url).href);

test('MockTransport tracks individual call counters without double-counting send inside reply', async () => {
  const transport = new MockTransport();
  const incoming = mockMessage('!ping');
  const replyID = await transport.reply(incoming, { content: 'pong' });
  const sendID = await transport.send('200', { content: 'msg' });
  await transport.edit('200', sendID, { content: 'edited' });
  await transport.react('200', replyID, '👍');
  await transport.delete('200', sendID);
  await transport.member('100', '1');
  await transport.moderate('100', 'ban', '2', 'reason', 0);

  assert.deepEqual(transport.calls, {
    send: 1,
    reply: 1,
    edit: 1,
    delete: 1,
    react: 1,
    member: 1,
    moderate: 1,
  });

  transport.resetCalls();
  assert.deepEqual(transport.calls, {
    send: 0,
    reply: 0,
    edit: 0,
    delete: 0,
    react: 0,
    member: 0,
    moderate: 0,
  });
});

test('rest-calls benchmark verifies call counts for permissions, moderation and MemberCache warm path', async () => {
  const report = await measureRestCalls(
    { rounds: 8 },
    { Client, FluxerTransport, MemberCache, MemoryStore, Yuzuha, defineCommand, MockTransport, mockMessage },
  );
  assert.equal(report.suite, 'rest-calls');
  assert.equal(report.scenarios.permissionsCommand.member, 2);
  assert.equal(report.scenarios.permissionsCommand.reply, 1);
  assert.equal(report.scenarios.moderationBan.member, 3);
  assert.equal(report.scenarios.moderationBan.moderate, 1);
  assert.equal(report.scenarios.moderationBan.reply, 1);
  assert.equal(report.scenarios.memberCacheHits.rounds, 8);
  assert.equal(report.scenarios.memberCacheHits.coldRestMemberCalls, 6);
  assert.equal(report.scenarios.memberCacheHits.warmRestMemberCalls, 0);
  assert.equal(report.scenarios.memberCacheHits.totalRestMemberCalls, 6);
  assert.equal(report.scenarios.memberCacheHits.sendCalls, 8);
  assert.equal(report.scenarios.memberCacheHits.savedRestMemberCalls, 42);
});
