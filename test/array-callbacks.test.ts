import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandContext, GuardError, MemoryStore, PartialModerationError, ScriptError } from '../src/index.js';
import { Runtime, defaultLimits, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function harness(limits = {}) {
  const transport = new MockTransport();
  const ctx = new CommandContext({ message: mockMessage('!arrays'), command: { name: 'arrays', code: '' },
    store: new MemoryStore(), transport, cooldown: () => 0 });
  const runtime = registerBuiltins(new Runtime({ ...defaultLimits, ...limits }));
  return { ctx, transport, runtime, run: (code: string) => runtime.execute(runtime.compile(code), ctx) };
}

test('map/filter preservam tipos, dados e o array original', async () => {
  const { run } = harness();
  assert.deepEqual(await run('$arrayMap[$range[1;3];$math[$loopValue;*;2]]'), [2, 4, 6]);
  assert.deepEqual(await run('$arrayMap[$array[null;false;0];$loopValue]'), [null, false, 0]);
  assert.deepEqual(await run('$arrayMap[$array[a;b];$object[item;$loopValue;index;$loopIndex]]'),
    [{ item: 'a', index: 0 }, { item: 'b', index: 1 }]);
  assert.deepEqual(await run('$arrayFilter[$range[1;5];$loopValue>2]'), [3, 4, 5]);
  await run('$let[original;$range[1;3]]$let[novo;$arrayMap[$get[original];$math[$loopValue;+;1]]]');
  assert.deepEqual(await run('$get[original]'), [1, 2, 3]);
  assert.deepEqual(await run('$get[novo]'), [2, 3, 4]);
});

test('some/every/find encerram no primeiro resultado decisivo', async () => {
  const { run, ctx } = harness();
  assert.equal(await run('$let[calls;0]$arraySome[$range[1;3];$let[calls;$math[$get[calls];+;1]]$loopValue>1]'), 'true');
  assert.equal(ctx.vars.get('calls'), 2);
  assert.equal(await run('$let[calls;0]$arrayEvery[$range[1;3];$let[calls;$math[$get[calls];+;1]]$loopValue<2]'), 'false');
  assert.equal(ctx.vars.get('calls'), 2);
  assert.equal(await run('$arrayFind[$range[1;3];$if[$eq[$loopValue;1];true;$throw[não deveria executar]]]'), 1);
  assert.equal(await run('$arrayFind[$array[false;null;0];$eq[$loopIndex;0]]'), false);
  assert.equal(await run('$arrayFind[$range[1;3];false]'), null);
});

test('arrays vazios não avaliam callbacks e mantêm identidades de redução e predicados', async () => {
  const { run } = harness();
  assert.deepEqual(await run('$arrayMap[$array;$throw[erro]]'), []);
  assert.deepEqual(await run('$arrayFilter[$array;$throw[erro]]'), []);
  assert.equal(await run('$arraySome[$array;$throw[erro]]'), false);
  assert.equal(await run('$arrayEvery[$array;$throw[erro]]'), true);
  assert.equal(await run('$arrayFind[$array;$throw[erro]]'), null);
  assert.equal(await run('$arrayReduce[$array;inicial;$throw[erro]]'), 'inicial');
});

test('reduce reavalia acumulador e restaura reduções e loops aninhados', async () => {
  const { run } = harness();
  assert.equal(await run('$arrayReduce[$range[1;4];0;$math[$loopAccumulator;+;$loopValue]]'), 10);
  assert.deepEqual(await run('$arrayReduce[$array[a;b];$array;$arrayPush[$loopAccumulator;$loopValue]]'), ['a', 'b']);
  assert.deepEqual(await run('$arrayMap[$array[a;b];$arrayMap[$range[1;2];$loopValue]$loopValue]'), ['[1,2]a', '[1,2]b']);
  assert.equal(await run('$arrayReduce[$range[1;2];0;$math[$loopAccumulator;+;$arrayReduce[$range[1;2];0;$math[$loopAccumulator;+;$loopValue]]]]'), 6);
  assert.equal(await run('$loopIndex$loopValue$loopAccumulator'), '');
});

test('callbacks restauram variáveis após erro e não reinterpretam strings de usuário', async () => {
  const { run, ctx, transport } = harness();
  ctx.vars.set('__loopIndex', 42);
  ctx.vars.set('__loopValue', null);
  ctx.vars.set('__loopAccumulator', false);
  await assert.rejects(run('$arrayReduce[$array[1];0;$throw[falha]]'), /falha/);
  assert.equal(ctx.vars.get('__loopIndex'), 42);
  assert.equal(ctx.vars.get('__loopValue'), null);
  assert.equal(ctx.vars.get('__loopAccumulator'), false);
  ctx.vars.set('dados', ['$ban[2;injetado]', '$reply[injetado]']);
  assert.deepEqual(await run('$arrayMap[$get[dados];$loopValue]'), ['$ban[2;injetado]', '$reply[injetado]']);
  assert.equal(transport.actions.length, 0);
  assert.equal(transport.messages.length, 0);
});

test('sortBy calcula chaves uma vez por item e preserva empates nas duas direções', async () => {
  const { run, ctx } = harness();
  ctx.vars.set('dados', [{ id: 'a', n: 2 }, { id: 'b', n: 1 }, { id: 'c', n: 2 }]);
  await run('$let[calls;0]$let[sorted;$arraySortBy[$get[dados];$let[calls;$math[$get[calls];+;1]]$jsonGet[$loopValue;n];desc]]');
  assert.equal(ctx.vars.get('calls'), 3);
  assert.deepEqual(ctx.vars.get('sorted'), [{ id: 'a', n: 2 }, { id: 'c', n: 2 }, { id: 'b', n: 1 }]);
  assert.deepEqual(await run('$arraySortBy[$range[1;3];$math[0;-;$loopValue]]'), [3, 2, 1]);
  await assert.rejects(run('$arraySortBy[$array[1];$object[a;1]]'), /Chave/);
  await assert.rejects(run('$arraySortBy[$array[1];$loopValue;errado]'), /Direção/);
  await assert.rejects(run('$arraySortBy[$array[1;a];$loopValue]'), /mesmo tipo/);
});

test('callbacks compartilham limites de chamadas e saída com o runtime e $try', async () => {
  const { run, ctx } = harness({ calls: 8 });
  await assert.rejects(run('$try[$arrayMap[$range[1;20];$loopIndex];fallback]'),
    (error: unknown) => error instanceof ScriptError && error.code === 'EXECUTION_LIMIT');
  assert.equal(ctx.vars.has('__loopIndex'), false);
  const limited = harness({ output: 64 });
  await assert.rejects(limited.run('$try[$arrayMap[$range[1;5];$repeatText[x;20]];fallback]'),
    (error: unknown) => error instanceof ScriptError && error.code === 'OUTPUT_LIMIT');
  limited.ctx.vars.set('grande', Array(1001).fill(0));
  await assert.rejects(limited.run('$arrayMap[$get[grande];$loopValue]'));
  const normal = harness();
  normal.ctx.vars.set('grande', Array(1001).fill(0));
  await assert.rejects(normal.run('$arrayMap[$get[grande];$loopValue]'), /1000/);
  await assert.rejects(normal.run('$try[$arrayMap[$get[grande];$loopValue];fallback]'),
    (error: unknown) => error instanceof ScriptError && error.code === 'EXECUTION_LIMIT');
  await assert.rejects(normal.run('$arrayFilter[texto;true]'), /array/);
});

test('guards, stop e erros de moderação parcial atravessam callbacks e $try', async () => {
  const { runtime, run, transport } = harness();
  await assert.rejects(run('$try[$arrayMap[$array[1];$onlyIf[false;negado]];fallback]'), GuardError);
  assert.equal(await run('$arrayMap[$array[1];$stop]$reply[não]'), '');
  assert.equal(transport.messages.length, 0);
  runtime.register({ name: 'partial', minArgs: 0, maxArgs: 0, category: 'test', description: '', usage: '$partial',
    execute: () => { throw new PartialModerationError('ban', '2', new Error('store')); } });
  await assert.rejects(run('$try[$arrayReduce[$array[1];0;$partial];fallback]'), PartialModerationError);
});

test('concat/flat/chunk e entradas/valores de JSON preservam os dados', async () => {
  const { run } = harness();
  assert.deepEqual(await run('$arrayConcat[$array[1;2];$array[3]]'), [1, 2, 3]);
  assert.deepEqual(await run('$arrayFlat[$array[1;$array[2;$array[3]]]]'), [1, 2, [3]]);
  assert.deepEqual(await run('$arrayFlat[$array[1;$array[2;$array[3]]];2]'), [1, 2, 3]);
  assert.deepEqual(await run('$arrayChunk[$range[1;5];2]'), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(await run('$jsonEntries[$object[a;1;b;true]]'), [['a', 1], ['b', true]]);
  assert.deepEqual(await run('$jsonValues[$object[a;1;b;true]]'), [1, true]);
  await assert.rejects(run('$arrayChunk[$array;0]'), /ao menos 1/);
  await assert.rejects(run('$arrayFlat[$array;-1]'), /0 e 64/);
  await assert.rejects(run('$arrayFlat[$array;65]'), /0 e 64/);
  await assert.rejects(run('$jsonValues[null]'), /objeto/);
});

test('range termina nos extremos seguros e calcula intervalos cruzando zero sem arredondar', async () => {
  const { run } = harness();
  assert.deepEqual(await run('$range[9007199254740990;9007199254740991]'), [9007199254740990, 9007199254740991]);
  assert.deepEqual(await run('$range[-9007199254740990;-9007199254740991;-1]'), [-9007199254740990, -9007199254740991]);
  assert.deepEqual(await run('$range[-9007199254740991;9007199254740991;9007199254740991]'), [-9007199254740991, 0, 9007199254740991]);
  assert.deepEqual(await run('$range[5;1;-2]'), [5, 3, 1]);
});

test('loops interrompem saída excessiva antes de executar efeitos das próximas iterações', async () => {
  const { run, ctx } = harness({ output: 32 });
  await assert.rejects(run('$try[$repeat[100;$let[visitados;$loopIndex]xxxxxxxxxxxxxxxxx];fallback]'),
    (error: unknown) => error instanceof ScriptError && error.code === 'OUTPUT_LIMIT');
  assert.equal(ctx.vars.get('visitados'), 1);
  assert.equal(ctx.vars.has('__loopIndex'), false);
});

test('unique mantém igualdade profunda e a distinção entre zero e zero negativo', async () => {
  const { run, ctx } = harness();
  ctx.vars.set('valores', [0, -0, 0, -0, NaN, NaN, { a: 1, b: 2 }, { b: 2, a: 1 }, [1], [1]]);
  const result = await run('$arrayUnique[$get[valores]]') as unknown[];
  assert.equal(result.length, 5);
  assert.ok(Object.is(result[0], 0));
  assert.ok(Object.is(result[1], -0));
  assert.ok(Number.isNaN(result[2]));
  assert.deepEqual(result.slice(3), [{ a: 1, b: 2 }, [1]]);
});

test('objetos, caminhos JSON e merge tratam __proto__ como dados sem tocar protótipos', async () => {
  const { run } = harness();
  const prototype = Object.getOwnPropertyDescriptors(Object.prototype);
  const object = await run('$object[__proto__;$object[marca;1];constructor;texto]') as Record<string, unknown>;
  assert.ok(Object.hasOwn(object, '__proto__'));
  assert.deepEqual(object['__proto__'], { marca: 1 });
  assert.equal(Object.getPrototypeOf(object), Object.prototype);
  assert.equal(await run('$jsonGet[$jsonSet[$object;__proto__.yuzuhaMarca;1];__proto__.yuzuhaMarca]'), '1');
  assert.equal(await run('$jsonGet[$jsonSet[$object;constructor.prototype.yuzuhaMarca;1];constructor.prototype.yuzuhaMarca]'), '1');
  assert.equal(await run('$jsonGet[$jsonMerge[$object;$object[__proto__;$object[marca;2]]];__proto__.marca]'), 2);
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), prototype);
});

test('índices JSON grandes falham antes de alocar e não alteram variáveis persistidas', async () => {
  const { run } = harness();
  await run('$setGuildVar[perfil;$object[items;$array[ok]]]');
  await assert.rejects(run('$setGuildVarPath[perfil;items.999999999;erro]'), /0 e 9999/);
  assert.deepEqual(await run('$getGuildVar[perfil]'), { items: ['ok'] });
  await assert.rejects(run('$jsonSet[$array;9007199254740991;x]'), /0 e 9999/);
});
