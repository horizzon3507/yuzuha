import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandContext, MemoryStore } from '../src/index.js';
import { Runtime, defaultLimits, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function harness(options: { guildID?: string; limits?: Record<string, number> } = {}) {
  const transport = new MockTransport();
  const store = new MemoryStore();
  const message = mockMessage('!test', 'guildID' in options ? { guildID: options.guildID } : {});
  const ctx = new CommandContext({ message, command: { name: 'test', code: '' }, transport, store, cooldown: () => 0 });
  const runtime = registerBuiltins(new Runtime({ ...defaultLimits, ...options.limits }));
  return { ctx, runtime, transport, store, run: (source: string) => runtime.execute(runtime.compile(source, 'language.yz'), ctx) };
}

async function moderate(ctx: CommandContext, id: number): Promise<void> {
  await ctx.moderate('ban', '2', `motivo ${id}`, { record: true });
}

test('JSON round-trip, get e set sem mutação', async () => {
  const { run } = harness();
  assert.equal(await run('$jsonEncode[$object[a;1;b;2]]'), '{"a":1,"b":2}');
  assert.deepEqual(await run('$jsonDecode[{"a":1}]'), { a: 1 });
  assert.equal(await run('$jsonGet[$jsonDecode[{"a":{"b":[10,20]}}];a.b.1]'), 20);
  assert.equal(await run('$jsonGet[$jsonDecode[{"a":1}];ausente;padrão]'), 'padrão');
  assert.equal(await run('$jsonGet[$jsonDecode[{"a":[1]}];a.x]'), '');
  assert.equal(await run('$let[o;$jsonDecode[{"a":{"n":1}}]]$let[n;$jsonSet[$get[o];a.n;2]]$jsonGet[$get[o];a.n]'), '1');
  assert.equal(await run('$let[o;$jsonDecode[{"a":1}]]$let[n;$jsonSet[$get[o];a.b.c;3]]$jsonGet[$get[n];a.b.c]'), '3');
  assert.equal(await run('$hasProp[$jsonDecode[{"a":1}];a]'), true);
  assert.equal(await run('$hasProp[$jsonDecode[{"a":1}];z]'), false);
  assert.deepEqual(await run('$jsonKeys[$jsonDecode[{"b":1,"a":2}]]'), ['b', 'a']);
  assert.deepEqual(await run('$jsonKeys[$array[a;b]]'), ['0', '1']);
  assert.deepEqual(await run('$jsonMerge[$jsonDecode[{"a":{"x":1,"y":2},"arr":[1]}];$jsonDecode[{"a":{"y":3},"arr":[2]}]]'), { a: { x: 1, y: 3 }, arr: [2] });
  assert.deepEqual(await run('$jsonMerge[$jsonDecode[{"a":1}]]'), { a: 1 });
  await run('$let[o;$jsonDecode[{"a":1}]]$let[m;$jsonMerge[$get[o];$jsonDecode[{"b":2}]]]');
  assert.deepEqual(await run('$get[m]'), { a: 1, b: 2 });
  assert.deepEqual(await run('$get[o]'), { a: 1 });
  assert.deepEqual(await run('$jsonDelete[$jsonDecode[{"a":{"b":1},"c":2}];a.b]'), { a: {}, c: 2 });
  assert.deepEqual(await run('$jsonDelete[$array[1;2;3];1]'), [1, 3]);
  assert.deepEqual(await run('$jsonDelete[$jsonDecode[{"a":1}];z]'), { a: 1 });
  await assert.rejects(run('$jsonKeys[texto]'), /objeto nem array/);
  await assert.rejects(run('$jsonSet[$jsonDecode[{}];a..b;1]'), /Caminho JSON inválido/);
  await assert.rejects(run('$object[a;1;b]'), /ímpar/);
  await assert.rejects(run('$jsonDecode[não-json]'), /JSON inválido/);
});

test('arrays, range e paginação com limites', async () => {
  const { run } = harness();
  assert.deepEqual(await run('$array[1;2;3]'), [1, 2, 3]);
  assert.deepEqual(await run('$arrayPush[$array[1];2;3]'), [1, 2, 3]);
  assert.equal(await run('$let[a;$array[1]]$let[b;$arrayPush[$get[a];9]]$arrayLength[$get[a]]'), '1');
  assert.equal(await run('$arrayGet[$array[a;b];5;vazio]'), 'vazio');
  assert.equal(await run('$arrayLength[$array[a;b;c]]'), 3);
  assert.deepEqual(await run('$arraySlice[$array[a;b;c;d];1;3]'), ['b', 'c']);
  assert.equal(await run('$arrayIncludes[$array[1;2];2]'), true);
  assert.equal(await run('$arrayIndexOf[$array[a;b];b]'), 1);
  assert.equal(await run('$arrayIndexOf[$array[a];z]'), -1);
  assert.equal(await run('$arrayJoin[$array[a;b];-]'), 'a-b');
  assert.deepEqual(await run('$arraySort[$array[3;1;2];desc]'), [3, 2, 1]);
  assert.deepEqual(await run('$arrayReverse[$array[1;2]]'), [2, 1]);
  assert.deepEqual(await run('$arrayUnique[$array[1;1;2]]'), [1, 2]);
  assert.deepEqual(await run('$range[1;5]'), [1, 2, 3, 4, 5]);
  assert.deepEqual(await run('$range[5;1]'), [5, 4, 3, 2, 1]);
  assert.deepEqual(await run('$range[0;10;2]'), [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(await run('$paginate[$range[1;10];2;3]'), [4, 5, 6]);
  await assert.rejects(run('$range[1;2000]'), /1000/);
  await assert.rejects(run('$paginate[$array[a];0;2]'), /1/);
  await assert.rejects(run('$arraySort[$array[1];lado]'), /asc ou desc/);
});

test('texto', async () => {
  const { run } = harness();
  assert.deepEqual(await run('$split[a,b,c;,]'), ['a', 'b', 'c']);
  assert.deepEqual(await run('$split[abc;]'), ['a', 'b', 'c']);
  assert.equal(await run('$sliceText[abcdef;1;3]'), 'bc');
  assert.equal(await run('$includes[banana;nan]'), true);
  assert.equal(await run('$startsWith[banana;ban]'), true);
  assert.equal(await run('$endsWith[banana;nana]'), true);
  assert.equal(await run('$padStart[5;3;0]'), '005');
  assert.equal(await run('$padEnd[5;3;0]'), '500');
  assert.equal(await run('$repeatText[ab;3]'), 'ababab');
  assert.equal(await run('$truncate[abcdef;3]'), 'abc…');
  assert.equal(await run('$truncate[abcdef;3;...]'), 'abc...');
  assert.equal(await run('$escapeMarkdown[*oi*]'), '\\*oi\\*');
  assert.equal(await run('$mention[123]'), '<@123>');
  assert.equal(await run('$mention[123;role]'), '<@&123>');
  assert.equal(await run('$mention[123;channel]'), '<#123>');
  await assert.rejects(run('$repeatText[a;100001]'), /100000/);
  await assert.rejects(run('$mention[abc]'), /numérico/);
  await assert.rejects(run('$mention[123;grupo]'), /user, role ou channel/);
});

test('números e datas', async () => {
  const { run } = harness();
  assert.equal(await run('$round[2.345;2]'), 2.35);
  assert.equal(await run('$floor[2.9]'), 2);
  assert.equal(await run('$ceil[2.1]'), 3);
  assert.equal(await run('$abs[-5]'), 5);
  assert.equal(await run('$clamp[10;1;5]'), 5);
  assert.equal(await run('$fixed[2.5;2]'), '2.50');
  assert.equal(await run('$formatNumber[1234.5;en-US]'), '1,234.5');
  assert.equal(await run('$date[0;iso]'), '1970-01-01T00:00:00.000Z');
  const iso = '1970-01-01T00:00:00.000Z';
  for (const format of ['date', 'time', 'datetime']) {
    const out = String(await run(`$date[0;${format};en-US]`));
    assert.ok(out.length > 0 && out !== iso, format);
  }
  assert.ok(String(await run('$relativeTime[0;en]')).length > 0);
  assert.equal(await run('$parseDate[1970-01-02T00:00:00.000Z]'), 86_400_000);
  await assert.rejects(run('$parseDate[não-data]'), /inválida/);
  await assert.rejects(run('$date[0;estranho]'), /Formato/);
});

test('loops reavaliam o corpo e expõem índice/valor', async () => {
  const { run } = harness();
  assert.equal(await run('$repeat[3;ab]'), 'ababab');
  assert.equal(await run('$forEach[$array[a;b];$loopValue;-]'), 'a-b-');
  assert.equal(await run('$forEach[$array[a;b];$loopIndex]'), '01');
  assert.equal(await run('$let[n;0]$repeat[3;$let[n;$math[$get[n];+;1]]]$get[n]'), '3');
  assert.equal(await run('$let[s;]$forEach[$array[a;b;c];$let[s;$join[;$get[s];$loopValue]]]$get[s]'), 'abc');
  await assert.rejects(run('$repeat[1001;x]'), /1000/);
  await assert.rejects(run('$repeat[1.5;x]'), /inteiro/);
  await assert.rejects(run('$forEach[nao-array;x]'), /array/);
});

test('loop usa contador persistente e restaura vars após erro', async () => {
  const { run } = harness();
  assert.equal(await run('$setGuildVar[total;0]$repeat[3;$let[x;$incrementGuildVar[total]]]$getGuildVar[total]'), '3');
  await assert.rejects(run('$repeat[2;$throw[erro]]'), /erro/);
  assert.equal(await run('$loopIndex'), '');
  assert.equal(await run('$loopValue'), '');
  await assert.rejects(run('$let[x;$loopIndex]$forEach[$array[a];$throw[boom]]'), /boom/);
  assert.equal(await run('$loopIndex'), '');
  assert.equal(await run('$loopValue'), '');
});

test('incrementos concorrentes com Promise.all', async () => {
  const { run } = harness();
  await run('$setGuildVar[placar;0]');
  await Promise.all(Array.from({ length: 20 }, () => run('$incrementGuildVar[placar]')));
  assert.equal(await run('$getGuildVar[placar]'), 20);
  await Promise.all(Array.from({ length: 10 }, () => run('$incrementVar[geral;2]')));
  assert.equal(await run('$getVar[geral]'), 20);
  await run('$setUserVar[meu;5]$incrementUserVar[meu;-2]');
  assert.equal(await run('$getUserVar[meu]'), 3);
  await assert.rejects(run('$setGuildVar[n;texto]$incrementGuildVar[n]'), /número/);
  await assert.rejects(run('$incrementGuildVar[nova;infinito]'), /finito/);
});

test('push/pull compostos', async () => {
  const { run } = harness();
  await run('$pushVar[lista;1]$pushVar[lista;2]$pullVar[lista;1]');
  assert.deepEqual(await run('$getVar[lista]'), [2]);
  await run('$pushGuildVar[equipe;a]$pushGuildVar[equipe;b]');
  assert.deepEqual(await run('$getGuildVar[equipe]'), ['a', 'b']);
  assert.deepEqual(await run('$pullGuildVar[equipe;a]'), ['b']);
  await run('$pushUserVar[itens;x]$pullUserVar[itens;x]');
  assert.deepEqual(await run('$getUserVar[itens]'), []);
  await assert.rejects(run('$setGuildVar[n;1]$pushGuildVar[n;2]'), /array/);
  await assert.rejects(run('$setGuildVar[n;1]$pullGuildVar[n;1]'), /array/);
});

test('setVarPath atualiza objetos persistentes de forma atômica', async () => {
  const { run } = harness();
  assert.deepEqual(await run('$setVarPath[perfil;nome;Ana]'), { nome: 'Ana' });
  await run('$setVarPath[perfil;tags.0;adm]');
  assert.deepEqual(await run('$getVar[perfil]'), { nome: 'Ana', tags: ['adm'] });
  assert.equal(await run('$jsonGet[$getVar[perfil];tags.0]'), 'adm');
  await run('$setGuildVarPath[config;canal.id;123]');
  await run('$setUserVarPath[prefs;tema;escuro]');
  assert.deepEqual(await run('$getGuildVar[config]'), { canal: { id: 123 } });
  assert.deepEqual(await run('$getUserVar[prefs]'), { tema: 'escuro' });
  await run('$setVarPath[perfil;;$object[trocado;true]]');
  assert.deepEqual(await run('$getVar[perfil]'), { trocado: true });
  await Promise.all(Array.from({ length: 10 }, (_, i) => run(`$setGuildVarPath[reg;itens.${i};${i}]`)));
  assert.deepEqual(await run('$getGuildVar[reg]'), { itens: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] });
  await assert.rejects(run('$setVarPath[x;a..b;1]'), /Caminho JSON inválido/);
  assert.equal(await run('$getVar[x]'), null);
});

test('casos: lista e contagem com limites e servidor', async () => {
  const { ctx, run, store } = harness();
  await moderate(ctx, 1);
  await moderate(ctx, 2);
  await moderate(ctx, 3);
  assert.equal(await run('$caseCount'), 3);
  const page = await run('$caseList[1;2]') as { id: number }[];
  assert.equal(page.length, 2);
  assert.deepEqual(page.map(item => item.id), [1, 2]);
  assert.equal(((await run('$caseList[2;2]')) as unknown[]).length, 1);
  await assert.rejects(run('$caseList[0]'), /1/);
  await assert.rejects(run('$caseList[1;101]'), /100/);
  const dm = harness({ guildID: undefined });
  await assert.rejects(dm.run('$caseCount'), /servidores/);
  await assert.rejects(dm.run('$caseList'), /servidores/);
  assert.ok(store);
});
