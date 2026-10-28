import test from 'node:test';
import assert from 'node:assert/strict';
import { GuardError, MemoryStore, Yuzuha } from '../src/index.js';
import { parseFlags } from '../src/commands/arguments.js';
import { MockTransport, mockMessage } from '../src/testing.js';

test('malformed flag names produce guards before invoking the command', async () => {
  const transport = new MockTransport();
  const errors: unknown[] = [];
  const bot = new Yuzuha({ transport, store: new MemoryStore(), scheduler: false, onError: error => { errors.push(error); } });
  let calls = 0;
  bot.command({ name: 'flags', flags: [{ name: 'quiet', type: 'boolean' }], run() { calls++; } });
  try {
    for (const token of ['-=', '-==value', '--=value']) {
      assert.throws(() => parseFlags([], [token]), GuardError);
      assert.equal(await bot.handle(mockMessage(`!flags ${token}`)), 'guarded');
      assert.match(transport.messages.at(-1)!.payload.content!, /Flag desconhecida:.*\nUso: !flags/);
    }
    assert.equal(calls, 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(parseFlags([], ['--', '-=', '-==value']).tokens, ['-=', '-==value']);
    assert.equal(await bot.handle(mockMessage('!flags --quiet')), 'success');
    assert.equal(calls, 1);
  } finally { await bot.destroy(); }
});
