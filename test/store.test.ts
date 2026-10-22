import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore, MemoryStore } from '../src/index.js';

test('JSON state round-trips, serializes transactions and uses private file permissions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yuzuha-store-'));
  try {
    const path = join(root, 'data', 'state.json'), store = new JsonStore(path);
    await Promise.all(Array.from({ length: 30 }, () => store.update(s => { s.variables['counter'] = Number(s.variables['counter'] ?? 0) + 1; })));
    assert.equal(await new JsonStore(path).read(s => s.variables['counter']), 30);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  } finally { await rm(root, { recursive: true }); }
});

test('malformed state is preserved and never replaced with empty state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yuzuha-corrupt-'));
  try {
    const path = join(root, 'state.json');
    for (const content of ['', '{broken', '{"schema":2}', '{"schema":1,"variables":{},"cases":{"100":[{}]}}']) {
      await writeFile(path, content);
      await assert.rejects(new JsonStore(path).update(s => { s.variables['x'] = 1; }), /Estado inválido/);
      assert.equal(await readFile(path, 'utf8'), content);
    }
  } finally { await rm(root, { recursive: true }); }
});

test('schema 1 is migrated on read and persists as schema 2 with schedules', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yuzuha-migrate-'));
  try {
    const path = join(root, 'state.json');
    const legacy = {
      schema: 1,
      variables: { greeting: 'olá', count: 7 },
      cases: { '100': [{ id: 1, guildID: '100', action: 'ban', targetID: '2', moderatorID: '1',
        reason: 'spam', createdAt: '2026-10-20T12:00:00.000Z' }] },
    };
    await writeFile(path, JSON.stringify(legacy));
    const store = new JsonStore(path);
    const snapshot = await store.read(state => state);
    assert.equal(snapshot.schema, 2);
    assert.deepEqual(snapshot.schedules, []);
    assert.equal(snapshot.variables['greeting'], 'olá');
    assert.equal(snapshot.cases['100']?.[0]?.reason, 'spam');
    await store.update(state => { state.variables['updated'] = true; });
    const persisted = JSON.parse(await readFile(path, 'utf8')) as { schema: number; schedules: unknown[] };
    assert.equal(persisted.schema, 2);
    assert.deepEqual(persisted.schedules, []);
  } finally { await rm(root, { recursive: true }); }
});

test('failed transaction does not commit and read snapshots cannot mutate state', async () => {
  const store = new MemoryStore();
  await assert.rejects(store.update(s => { s.variables['x'] = 1; throw new Error('failure'); }));
  await store.read(s => { s.variables['x'] = 2; });
  assert.equal(await store.read(s => s.variables['x']), undefined);
  await assert.rejects(store.update(async s => { s.variables['x'] = 3; }), /síncronos/);
  assert.equal(await store.read(s => s.variables['x']), undefined);
});

test('invalid state and uncloneable returns cannot commit JSON or memory transactions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yuzuha-invalid-write-'));
  try {
    const path = join(root, 'state.json');
    for (const store of [new MemoryStore(), new JsonStore(path)]) {
      await store.update(s => { s.variables['count'] = 1; });
      await assert.rejects(store.update(s => { s.variables['count'] = Number.NaN; }), /estado inválido/);
      await assert.rejects(store.update(s => { s.variables['count'] = 2; return () => {}; }));
      assert.equal(await store.read(s => s.variables['count']), 1);
    }
    assert.equal(await new JsonStore(path).read(s => s.variables['count']), 1);
  } finally { await rm(root, { recursive: true }); }
});
