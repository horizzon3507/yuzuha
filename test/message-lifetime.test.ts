import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandContext } from '../src/commands/context.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import { GuardError } from '../src/shared/errors.js';
import { createTestBot, MockTransport, mockMessage, mockResources } from '../src/testing.js';

function context(deleteLater?: (channelID: string, messageID: string, ttlMs: number) => void) {
  return new CommandContext({ message: mockMessage('!x'), command: { name: 'x' },
    store: new MemoryStore(), transport: new MockTransport(), cooldown: () => 0,
    resources: mockResources(), deleteLater });
}

test('ctx.expire agenda a exclusão no canal da mensagem', () => {
  const scheduled: [string, string, number][] = [];
  const ctx = context((channelID, messageID, ttlMs) => scheduled.push([channelID, messageID, ttlMs]));
  ctx.expire('42', 5_000);
  ctx.expire('43', 60_000, '300');
  assert.deepEqual(scheduled, [['200', '42', 5_000], ['300', '43', 60_000]]);
});

test('ctx.expire rejeita TTL inválido de forma síncrona e sem agendar', () => {
  let calls = 0;
  const ctx = context(() => { calls++; });
  for (const ttlMs of [0, 999, 1.5, 86_400_001, Number.NaN, Infinity]) {
    assert.throws(() => ctx.expire('42', ttlMs), (error: unknown) =>
      error instanceof GuardError && error.reason === 'INVALID_ARGUMENT');
  }
  assert.equal(calls, 0);
});

test('ctx.expire executa a exclusão via timers injetados do bot', async () => {
  const deleted: [string, string][] = [];
  const fixture = createTestBot({ prefix: '!',
    commands: [{ name: 'e', run: async ctx => {
      const sent = await ctx.send('expira');
      ctx.expire(sent, 5_000);
    } }] });
  fixture.transport.delete = async (channelID, messageID) => { deleted.push([channelID, messageID]); };
  try {
    await fixture.send('!e');
    const sentID = fixture.messages.at(-1)!.id;
    fixture.timers.advance(4_999);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(deleted, []);
    fixture.timers.advance(1);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(deleted, [['200', sentID]]);
  } finally { await fixture.destroy(); }
});
