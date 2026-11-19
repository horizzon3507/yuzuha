import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertComplete, buildParityMatrix, renderMatrix, SDK_PACKAGES, summarize, validateMappings } from '../scripts/parity-matrix.mjs';
import type { Mapping, SDKItem } from '../scripts/parity-matrix.mjs';

const currentMatrix = buildParityMatrix();

test('todo item do SDK tem classificação semântica explícita válida', async () => {
  const matrix = await currentMatrix;
  assert.deepEqual(matrix.unclassified, []);
  assert.deepEqual(matrix.stale, []);
  assert.deepEqual(matrix.errors, []);
  assert.doesNotThrow(() => assertComplete(matrix));
  for (const pkg of SDK_PACKAGES) assert.ok(matrix.items.some(item => item.package === pkg.name), pkg.name);
});

test('docs/PARITY-MATRIX.md corresponde ao que o gerador produz', async () => {
  const matrix = await currentMatrix;
  assert.equal(await readFile(new URL('../docs/PARITY-MATRIX.md', import.meta.url), 'utf8'), renderMatrix(matrix));
});

test('eventos do function mode existem no SDK e a matriz registra as lacunas', async () => {
  const matrix = await currentMatrix;
  assert.ok(matrix.modeEvents.length > 0);
  for (const event of matrix.modeEvents) assert.ok(matrix.sdkEvents.includes(event) || Object.values(matrix.voiceEvents).includes(event), event);
  assert.ok(matrix.sdkEvents.length > matrix.modeEvents.filter(event => matrix.sdkEvents.includes(event)).length);
  assert.equal(matrix.items.find(item => item.id === '@fluxerjs/core#Message.reply')?.status, 'function');
  assert.equal(matrix.items.find(item => item.id === '@fluxerjs/builders#EmbedBuilder.setTitle')?.status, 'equivalent');
  assert.equal(matrix.items.find(item => item.id === '@fluxerjs/core#Client.login')?.reason, 'lifecycle');
  assert.equal(matrix.items.find(item => item.id === '@fluxerjs/core#ClientEvents:channelCreate')?.status, 'function');
  assert.equal(matrix.items.find(item => item.id === '@fluxerjs/core#ClientEvents:debug')?.reason, 'internal');
});

test('bot.on aceita todo nome de evento do SDK', async () => {
  const matrix = await currentMatrix;
  const { Yuzuha } = await import('../src/index.js');
  const { MockTransport } = await import('../src/testing.js');
  const { MemoryStore } = await import('../src/infrastructure/storage/memory.js');
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore() });
  for (const name of matrix.sdkEvents) assert.doesNotThrow(() => bot.on(name as never, () => {}), name);
});

const item: SDKItem = { id: '@fluxerjs/core#example', package: '@fluxerjs/core', name: 'example', kind: 'function', scope: 'export' };
const mapping: Mapping = { id: item.id, area: 'pure', status: 'pending', note: 'Contrato declarativo ainda ausente.' };

test('status, função, área e motivo são validados, não inferidos pelo nome', () => {
  for (const entry of [
    mapping,
    { ...mapping, status: 'function', functions: ['$example'] },
    { ...mapping, status: 'equivalent', functions: ['$example'] },
    { ...mapping, status: 'excluded', reason: 'internal' },
  ] as Mapping[]) {
    assert.deepEqual(validateMappings([item], [entry], new Set(['$example'])).errors, []);
  }
  for (const change of [
    { status: 'native' }, { area: 'unknown' }, { file: 'entities' }, { note: '' },
    { status: 'function' }, { status: 'equivalent', functions: [] },
    { status: 'function', functions: ['$missing'] },
    { status: 'excluded', reason: 'unknown' }, { functions: ['$example'] }, { reason: 'internal' },
  ]) {
    assert.ok(validateMappings([item], [{ ...mapping, ...change } as Mapping], new Set()).errors.length, JSON.stringify(change));
  }
});

test('itens novos, removidos, duplicados e eventos sem adaptação bloqueiam check', () => {
  const absent = validateMappings([item], [], new Set());
  assert.deepEqual(absent.unclassified, [item.id]);
  assert.throws(() => assertComplete({ ...absent, summary: summarize([]) }), /Sem classificação/);
  const duplicate = validateMappings([item], [mapping, mapping], new Set());
  assert.match(duplicate.errors.join('\n'), /Duplicado/);
  const stale = validateMappings([], [mapping], new Set());
  assert.deepEqual(stale.stale, [item.id]);
  assert.match(stale.errors.join('\n'), /Obsoleto/);
  const event = { ...item, scope: 'event', name: 'ClientEvents', event: 'channelCreate' };
  const entry = { ...mapping, status: 'function' as const, functions: ['$eventName'] };
  assert.match(validateMappings([event], [entry], new Set(['$eventName'])).errors.join('\n'), /Evento sem adaptação/);
  assert.deepEqual(validateMappings([event], [entry], new Set(['$eventName']), ['channelCreate']).errors, []);
  const voiceEvent = { ...event, package: '@fluxerjs/voice', name: 'LiveKitRtcConnectionEvents', event: 'speakerStart' };
  assert.match(validateMappings([voiceEvent], [entry], new Set(['$eventName']), ['voiceSpeakerStart']).errors.join('\n'), /Evento sem adaptação/);
  assert.deepEqual(validateMappings([voiceEvent], [entry], new Set(['$eventName']), ['voiceSpeakerStart'], { speakerStart: 'voiceSpeakerStart' }).errors, []);
  assert.match(validateMappings([voiceEvent], [entry], new Set(['$eventName']), [], { speakerStart: 'voiceSpeakerStart' }).errors.join('\n'), /Evento sem adaptação/);
});

test('safe coverage exclui exclusões e gate de release exige zero pending', () => {
  const summary = summarize([
    { area: 'pure', status: 'function' }, { area: 'pure', status: 'equivalent' },
    { area: 'voice', status: 'pending' }, { area: 'pure', status: 'excluded' },
  ]);
  assert.equal(summary.covered, 2);
  assert.equal(summary.safe, 3);
  assert.equal(summary.coverage, 2 / 3 * 100);
  assert.equal(summary.pending.voice, 1);
  const matrix = { errors: [], unclassified: [], summary };
  assert.doesNotThrow(() => assertComplete(matrix));
  assert.throws(() => assertComplete(matrix, true), /Release exige zero pending: 1/);
  assert.equal(summarize([]).coverage, 100);
  assert.doesNotThrow(() => assertComplete({ ...matrix, summary: summarize([]) }, true));
});
