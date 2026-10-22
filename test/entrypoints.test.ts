import test from 'node:test';
import assert from 'node:assert/strict';
import * as root from '../src/index.js';
import * as functions from '../src/functions.js';
import { MemoryStore, Yuzuha, defineCommand } from '../src/index.js';
import { MockTransport, mockMessage } from '../src/testing.js';

test('entrypoint raiz é nativo e o function mode vive em yuzuha/functions', () => {
  for (const name of ['Runtime', 'registerBuiltins', 'parse', 'builtinFunctions', 'script']) {
    assert.equal(name in root, false, `${name} não deve estar na raiz`);
    assert.equal(name in functions, true, `${name} deve estar em yuzuha/functions`);
  }
});

test('builtins só são registrados quando o function mode é usado', async () => {
  const transport = new MockTransport();
  const bot = new Yuzuha({ transport, store: new MemoryStore() });
  assert.equal(bot.runtime.functions().length, 0);

  bot.command(defineCommand({
    name: 'ping',
    async run(ctx) { await ctx.reply('pong'); },
  }));
  assert.equal(bot.runtime.functions().length, 0);
  await bot.handle(mockMessage('!ping'));
  assert.equal(transport.messages.at(-1)?.payload.content, 'pong');
  assert.equal(bot.runtime.functions().length, 0);

  bot.command(functions.script({ name: 'eco', code: '$reply[$messageSlice[0]]' }));
  assert.ok(bot.runtime.functions().length > 190);
  await bot.handle(mockMessage('!eco oi'));
  assert.equal(transport.messages.at(-1)?.payload.content, 'oi');

  assert.equal(bot.enableFunctions(), bot);
  assert.equal(bot.runtime.functions().length, functions.builtinFunctions.length);
  await bot.destroy();
});

test('plugin com comando em function mode ativa os builtins antes de compilar', async () => {
  const transport = new MockTransport();
  const bot = new Yuzuha({ transport, store: new MemoryStore() });
  bot.plugin({
    name: 'script-plugin',
    commands: [functions.script({ name: 'plug', code: '$reply[plug]' })],
  });
  assert.ok(bot.runtime.functions().length > 190);
  await bot.handle(mockMessage('!plug'));
  assert.equal(transport.messages.at(-1)?.payload.content, 'plug');
  await bot.destroy();
});
