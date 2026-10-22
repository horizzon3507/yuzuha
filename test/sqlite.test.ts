import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQLiteStore } from '../src/index.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('SQLite transactions round-trip across connections and roll back failed writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yuzuha-sqlite-'));
  const a = new SQLiteStore(join(root, 'state.sqlite')), b = new SQLiteStore(join(root, 'state.sqlite'));
  try {
    await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).update(s => { s.variables['counter'] = Number(s.variables['counter'] ?? 0) + 1; })));
    assert.equal(await a.read(s => s.variables['counter']), 20);
    assert.equal(await b.read(s => s.variables['counter']), 20);
    await assert.rejects(a.update(s => { s.variables['counter'] = 0; throw new Error('rollback'); }));
    assert.equal(await b.read(s => s.variables['counter']), 20);
    await assert.rejects(a.update(async s => { s.variables['counter'] = 0; }), /síncronos/);
    assert.equal(await b.read(s => s.variables['counter']), 20);
    await assert.rejects(a.update(s => { s.variables['counter'] = 0; return () => {}; }));
    assert.equal(await b.read(s => s.variables['counter']), 20);
  } finally { await a.close(); await b.close(); await rm(root, { recursive: true }); }
  await assert.rejects(a.read(() => null), /fechado/);
});

test('independent processes increment SQLite state without lost writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yuzuha-sqlite-process-'));
  const path = join(root, 'state.sqlite');
  const store = new SQLiteStore(path);
  await store.update(s => { s.variables['counter'] = 0; });
  const exec = promisify(execFile);
  const code = `
    import { SQLiteStore } from ${JSON.stringify(new URL('../src/sqlite.ts', import.meta.url).href)};
    const store = new SQLiteStore(process.argv[1]);
    for (let i = 0; i < 20; i++) await store.update(s => { s.variables.counter = Number(s.variables.counter || 0) + 1; });
    await store.close();
  `;
  try {
    await Promise.all(Array.from({ length: 3 }, () => exec(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code, path], { timeout: 30_000 })));
    assert.equal(await store.read(s => s.variables['counter']), 60);
  } finally { await store.close(); await rm(root, { recursive: true }); }
});
