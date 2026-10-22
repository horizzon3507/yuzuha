import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandContext, MemoryStore } from '../src/index.js';
import { Runtime, defaultLimits, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function harness() {
  const ctx = new CommandContext({ message: mockMessage('!test'), command: { name: 'test', code: '' },
    transport: new MockTransport(), store: new MemoryStore(), cooldown: () => 0 });
  const runtime = registerBuiltins(new Runtime(defaultLimits));
  return { runtime, run: (source: string) => runtime.execute(runtime.compile(source, 'sets.yz'), ctx) };
}

test('conjuntos usam igualdade profunda, ordem estável, null e zero negativo distintos', async () => {
  const { runtime, run } = harness();
  runtime.register({ name: 'leftFixture', category: 'test', minArgs: 0, maxArgs: 0, usage: '', description: 'Fixture',
    execute: () => [null, 0, -0, { a: 1, b: [2] }, { b: [2], a: 1 }, JSON.parse('{"__proto__":{"x":1}}')] });
  runtime.register({ name: 'rightFixture', category: 'test', minArgs: 0, maxArgs: 0, usage: '', description: 'Fixture',
    execute: () => [-0, { b: [2], a: 1 }, 3] });
  const union = await run('$arrayUnion[$leftFixture;$rightFixture]') as unknown[];
  assert.equal(union.length, 6);
  assert.equal(Object.is(union[1], 0), true);
  assert.equal(Object.is(union[2], -0), true);
  assert.deepEqual(await run('$arrayIntersection[$leftFixture;$rightFixture]'), [-0, { a: 1, b: [2] }]);
  assert.deepEqual(await run('$arrayDifference[$leftFixture;$rightFixture]'), [null, 0, JSON.parse('{"__proto__":{"x":1}}')]);
  assert.deepEqual(await run('$arrayUnion[$array;$array]'), []);
  await assert.rejects(run('$arrayUnion[$range[1;1000];$array[1]]'), /1000 itens/);
  await assert.rejects(run('$arrayIntersection[texto;$array]'), /array/);
});

test('bytes e percentuais possuem unidades, precisão e limites explícitos', async () => {
  const { run } = harness();
  assert.equal(await run('$formatBytes[0]'), '0 B');
  assert.equal(await run('$formatBytes[1024]'), '1 KiB');
  assert.equal(await run('$formatBytes[1536;2]'), '1.5 KiB');
  assert.equal(await run('$formatBytes[1000000;0;1000]'), '1 MB');
  assert.equal(await run('$percent[1;3]'), '33.33%');
  assert.equal(await run('$percent[-1;4;1]'), '-25.0%');
  for (const source of ['$formatBytes[-1]', '$formatBytes[1.5]', '$formatBytes[1;7]', '$formatBytes[1;2;2]',
    '$percent[1;0]', '$percent[1;-1]', '$percent[1;1;7]', '$percent[1e308;1e-308]']) await assert.rejects(run(source));
});

test('conversão de bases preserva inteiros grandes como texto e rejeita perda de precisão', async () => {
  const { run } = harness();
  assert.equal(await run('$toBase[255;16]'), 'ff');
  assert.equal(await run('$fromBase[FF;16]'), '255');
  assert.equal(await run('$fromBase[-ff;16]'), '-255');
  assert.equal(await run('$toBase[-90071992547409931234567890;36]'), '-bbfgdgklf8ztkc0r6');
  const big = '9'.repeat(100);
  assert.equal(await run(`$fromBase[$toBase[${big};2];2]`), big);
  assert.equal(await run('$toBase[$jsonDecode[42];2]'), '101010');
  assert.equal(await run('$fromBase[-0;2]'), '0');
  for (const source of ['$toBase[$jsonDecode[9007199254740993];16]', '$toBase[1.2;16]', '$toBase[1e3;16]',
    '$toBase[0xff;16]', '$toBase[1;1]', '$fromBase[2;2]', '$fromBase[0xff;16]', '$fromBase[ ff;16]',
    '$fromBase[$jsonDecode[10];2]', `$toBase[${'1'.repeat(1025)};2]`, `$fromBase[${'1'.repeat(1025)};2]`]) {
    await assert.rejects(run(source), source.slice(0, 80));
  }
});
