import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildParityMatrix, renderMatrix } from '../scripts/parity-matrix.mjs';

// Falha quando o SDK ganha um export sem área (gatilho de atualização) ou quando parity-areas.json fica obsoleto.
test('todo export de runtime do SDK tem área ou exceção intencional, sem entradas obsoletas', async () => {
  const matrix = await buildParityMatrix();
  assert.deepEqual(matrix.unclassified, []);
  assert.deepEqual(matrix.stale, []);
});

test('docs/PARITY-MATRIX.md corresponde ao que o gerador produz', async () => {
  const matrix = await buildParityMatrix();
  assert.equal(await readFile(new URL('../docs/PARITY-MATRIX.md', import.meta.url), 'utf8'), renderMatrix(matrix));
});

test('eventos do function mode existem no SDK e a matriz registra as lacunas', async () => {
  const matrix = await buildParityMatrix();
  assert.ok(matrix.modeEvents.length > 0);
  for (const event of matrix.modeEvents) assert.ok(matrix.sdkEvents.includes(event), event);
  assert.ok(matrix.sdkEvents.length > matrix.modeEvents.length);
  assert.ok(matrix.rows.some(row => row.name === 'Message' && row.status === 'coberto-recurso'));
});

test('bot.on aceita todo nome de evento do SDK', async () => {
  const matrix = await buildParityMatrix();
  const { Yuzuha } = await import('../src/index.js');
  const { MockTransport } = await import('../src/testing.js');
  const { MemoryStore } = await import('../src/infrastructure/storage/memory.js');
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore() });
  for (const name of matrix.sdkEvents) assert.doesNotThrow(() => bot.on(name as never, () => {}), name);
});
