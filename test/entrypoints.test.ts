import test from 'node:test';
import assert from 'node:assert/strict';
import * as root from '../src/index.js';
import * as functions from '../src/functions.js';
import { MemoryStore, Yuzuha, defineCommand } from '../src/index.js';
import { MockTransport, mockMessage } from '../src/testing.js';

test('entrypoint raiz é nativo e o function mode vive em yuzuha/functions', () => {
  for (const name of ['Runtime', 'registerBuiltins', 'parse', 'builtinFunctions', 'script', 'functions']) {
    assert.equal(name in root, false, `${name} não deve estar na raiz`);
    assert.equal(name in functions, true, `${name} deve estar em yuzuha/functions`);
  }
});

test('functions() entrega um engine com os builtins registrados', () => {
  const engine = functions.functions();
  assert.equal(engine.functions().length, functions.builtinFunctions.length);
  assert.deepEqual(Object.keys(engine.limits).sort(), ['calls', 'depth', 'output', 'timeoutMs']);
  const custom = functions.functions({ functions: [{ name: 'extra', category: 'test', minArgs: 0, maxArgs: 0,
    usage: '$extra', description: '', execute: () => 'ok' }] });
  assert.ok(custom.functions().some(fn => fn.name === 'extra'));
});

test('comandos nativos funcionam sem engine; scripts exigem engine explícito', async () => {
  const transport = new MockTransport();
  const bot = new Yuzuha({ transport, store: new MemoryStore() });
  assert.equal(bot.engine, undefined);

  bot.command(defineCommand({
    name: 'ping',
    async run(ctx) { await ctx.reply('pong'); },
  }));
  await bot.handle(mockMessage('!ping'));
  assert.equal(transport.messages.at(-1)?.payload.content, 'pong');

  assert.throws(() => bot.command(functions.script({ name: 'eco', code: '$reply[$messageSlice[0]]' })),
    { code: 'FUNCTIONS_REQUIRED' });
  await bot.destroy();

  const scripted = new Yuzuha({ transport, store: new MemoryStore(), engine: functions.functions() });
  scripted.command(functions.script({ name: 'eco', code: '$reply[$messageSlice[0]]' }));
  await scripted.handle(mockMessage('!eco oi'));
  assert.equal(transport.messages.at(-1)?.payload.content, 'oi');
  await scripted.destroy();
});

test('plugin com comando em function mode exige engine instalado', async () => {
  const transport = new MockTransport();
  const bot = new Yuzuha({ transport, store: new MemoryStore() });
  assert.throws(() => bot.plugin({
    name: 'script-plugin',
    commands: [functions.script({ name: 'plug', code: '$reply[plug]' })],
  }), { code: 'FUNCTIONS_REQUIRED' });
  await bot.destroy();

  const scripted = new Yuzuha({ transport, store: new MemoryStore(), engine: functions.functions() });
  scripted.plugin({ name: 'script-plugin', commands: [functions.script({ name: 'plug', code: '$reply[plug]' })] });
  await scripted.handle(mockMessage('!plug'));
  assert.equal(transport.messages.at(-1)?.payload.content, 'plug');
  await scripted.destroy();
});
