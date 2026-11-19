import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, JsonStore, StoreError, isYuzuhaError } from '../src/index.js';
import type { JsonStoreOptions, State } from '../src/index.js';
import type { JsonStoreOptions as StoreSubpathOptions } from '../src/store.js';
import { fakeTimers } from '../src/testing.js';

function trackedTimers() {
  const base = fakeTimers();
  const active = new Map<unknown, number>();
  return {
    setTimeout(fn: () => void, ms: number) {
      let handle: unknown;
      handle = base.setTimeout(() => {
        active.delete(handle);
        fn();
      }, ms);
      active.set(handle, ms);
      return handle;
    },
    clearTimeout(handle: unknown) {
      active.delete(handle);
      base.clearTimeout(handle);
    },
    advance(ms: number) { base.advance(ms); },
    get activeCount() { return active.size; },
  };
}

class SpyJsonStore extends JsonStore {
  commits = 0;
  completedCommits = 0;
  failCommits = false;
  private waiters: (() => void)[] = [];

  waitCommit(): Promise<void> {
    return new Promise(resolve => { this.waiters.push(resolve); });
  }

  protected override async commit(state: State): Promise<void> {
    this.commits++;
    try {
      if (this.failCommits) throw new Error('disk failure');
      await super.commit(state);
      this.completedCommits++;
    } finally {
      for (const resolve of this.waiters.splice(0)) resolve();
    }
  }
}

test('JsonStoreOptions valida campos e mantém compatibilidade com JsonStore(path?)', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-json-opts-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'state.json');

  for (const invalid of [
    null,
    [],
    new Date(),
    'bad',
    { flushMs: -1 },
    { flushMs: 1.5 },
    { flushMs: Number.NaN },
    { flushMs: Number.POSITIVE_INFINITY },
    { flushMs: 2_147_483_648 },
    { flushMs: '10' },
    { pretty: 'true' },
    { onError: 'not-fn' },
    { timers: {} },
  ]) {
    assert.throws(
      () => new JsonStore(path, invalid as never),
      error => error instanceof ConfigError && isYuzuhaError(error, 'JSON_STORE_OPTIONS'),
    );
  }

  const validOptions: JsonStoreOptions & StoreSubpathOptions = {
    flushMs: 0,
    pretty: false,
    onError() {},
  };
  const boundary = new JsonStore(path, { ...validOptions, flushMs: 2_147_483_647 });
  await boundary.close();
});

test('JsonStore grava JSON compacto por padrão e formatado quando pretty: true', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-json-format-'));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const compactPath = join(directory, 'compact.json');
  const prettyPath = join(directory, 'pretty.json');

  const compact = new JsonStore(compactPath);
  const pretty = new JsonStore(prettyPath, { pretty: true });

  await compact.update(state => { state.variables['a'] = { b: [1, 2] }; });
  await pretty.update(state => { state.variables['a'] = { b: [1, 2] }; });

  const compactRaw = await readFile(compactPath, 'utf8');
  const prettyRaw = await readFile(prettyPath, 'utf8');

  assert.equal(compactRaw.includes('\n'), false);
  assert.equal(prettyRaw.includes('\n  "variables":'), true);
  assert.equal(prettyRaw.endsWith('\n'), true);
  assert.ok(compactRaw.length < prettyRaw.length);

  assert.deepEqual(await new JsonStore(compactPath).read(state => state), JSON.parse(prettyRaw));
  await compact.close();
  await pretty.close();
});

test('JsonStore com flushMs: 0 coalesciona rajadas concorrentes em um commit e mantém rollback', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-json-burst-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'state.json');

  const store = new SpyJsonStore(path);
  const results = await Promise.all(
    Array.from({ length: 50 }, (_, index) => store.update(state => {
      state.variables['counter'] = Number(state.variables['counter'] ?? 0) + 1;
      return index;
    })),
  );
  assert.deepEqual(results, Array.from({ length: 50 }, (_, index) => index));
  assert.equal(store.commits, 1);
  assert.equal(await new JsonStore(path).read(state => state.variables['counter']), 50);

  const valid1 = store.update(state => { state.variables['k1'] = 'ok'; return 'v1'; });
  const failing = assert.rejects(
    store.update(state => { state.variables['bad'] = Number.NaN; }),
    error => error instanceof StoreError && isYuzuhaError(error, 'STORE_INVALID'),
  );
  const valid2 = store.update(state => { state.variables['k2'] = 'ok'; return 'v2'; });
  assert.equal(await valid1, 'v1');
  await failing;
  assert.equal(await valid2, 'v2');
  assert.equal(await new JsonStore(path).read(state => state.variables['k1']), 'ok');
  assert.equal(await new JsonStore(path).read(state => state.variables['k2']), 'ok');
  assert.equal(await new JsonStore(path).read(state => state.variables['bad']), undefined);

  const commitsBeforeRead = store.commits;
  const p1 = store.update(state => { state.variables['step'] = 1; });
  const midRead = store.read(state => state.variables['step']);
  const p2 = store.update(state => { state.variables['step'] = 2; });
  assert.equal(await midRead, 1);
  await Promise.all([p1, p2]);
  assert.equal(store.commits, commitsBeforeRead + 2);

  store.failCommits = true;
  const batchA = assert.rejects(
    store.update(state => { state.variables['rolled'] = 'A'; }),
    /disk failure/,
  );
  const batchB = assert.rejects(
    store.update(state => { state.variables['rolled'] = 'B'; state.variables['counter'] = 999; }),
    /disk failure/,
  );
  await Promise.all([batchA, batchB]);
  store.failCommits = false;

  assert.equal(await store.read(state => state.variables['rolled']), undefined);
  assert.equal(await store.read(state => state.variables['counter']), 50);
  await store.close();
});

test('JsonStore com flushMs > 0 coalesciona janelas no timer, flush() força escrita e close() drena e bloqueia uso posterior', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-json-debounce-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'state.json');
  const timers = trackedTimers();
  const flushErrors: unknown[] = [];

  const store = new SpyJsonStore(path, {
    flushMs: 50,
    timers,
    onError: error => { flushErrors.push(error); },
  });

  for (let i = 0; i < 10; i++) {
    await store.update(state => { state.variables[`item:${i}`] = i; });
  }
  assert.equal(store.commits, 0);
  assert.equal(timers.activeCount, 1);
  assert.equal(await store.read(state => state.variables['item:9']), 9);
  assert.equal(await store.readVariable('item:0', Date.now), 0);
  await assert.rejects(stat(path), { code: 'ENOENT' });

  const firstFlushDone = store.waitCommit();
  timers.advance(50);
  await firstFlushDone;
  assert.equal(store.commits, 1);
  assert.equal(store.completedCommits, 1);
  assert.equal(timers.activeCount, 0);
  assert.equal(await new JsonStore(path).read(state => state.variables['item:9']), 9);

  await store.update(state => { state.variables['flushed'] = true; });
  assert.equal(timers.activeCount, 1);
  await store.flush();
  assert.equal(timers.activeCount, 0);
  assert.equal(store.commits, 2);
  assert.equal(await new JsonStore(path).read(state => state.variables['flushed']), true);

  await store.flush();
  assert.equal(store.commits, 2);

  store.failCommits = true;
  await store.update(state => { state.variables['retryAfterError'] = 1; });
  const failedFlushDone = store.waitCommit();
  timers.advance(50);
  await failedFlushDone;
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(flushErrors.length, 1);

  store.failCommits = false;
  await store.update(state => { state.variables['final'] = 'saved'; });
  assert.equal(timers.activeCount, 1);

  await Promise.all([store.close(), store.close()]);
  assert.equal(timers.activeCount, 0);
  const persisted = await new JsonStore(path).read(state => state.variables);
  assert.equal(persisted['retryAfterError'], 1);
  assert.equal(persisted['final'], 'saved');

  for (const op of [
    () => store.read(state => state.schema),
    () => store.readVariable('final', Date.now),
    () => store.update(state => { state.variables['afterClose'] = true; }),
    () => store.flush(),
  ]) {
    await assert.rejects(op, error => error instanceof StoreError && isYuzuhaError(error, 'STORE_CLOSED'));
  }

  const unusedPath = join(directory, 'unused.json');
  const unused = new SpyJsonStore(unusedPath, { flushMs: 50, timers });
  await unused.flush();
  await unused.close();
  assert.equal(unused.commits, 0);
  await assert.rejects(stat(unusedPath), { code: 'ENOENT' });

  const realPath = join(directory, 'real-timer.json');
  const realTimerStore = new SpyJsonStore(realPath, { flushMs: 15 });
  await Promise.all([
    realTimerStore.update(state => { state.variables['a'] = 1; }),
    realTimerStore.update(state => { state.variables['b'] = 2; }),
  ]);
  assert.equal(realTimerStore.commits, 0);
  const done = realTimerStore.waitCommit();
  let deadline!: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    deadline = setTimeout(() => reject(new Error('Background flush did not complete')), 5_000);
  });
  try { await Promise.race([done, timeout]); }
  finally { clearTimeout(deadline); }
  assert.equal(realTimerStore.commits, 1);
  assert.deepEqual(await new JsonStore(realPath).read(state => state.variables), { a: 1, b: 2 });
  await realTimerStore.close();

  const immediatePath = join(directory, 'immediate-flush.json');
  const immediateStore = new SpyJsonStore(immediatePath);
  const p1 = immediateStore.update(state => { state.variables['first'] = true; });
  const flushed = immediateStore.flush();
  const p2 = immediateStore.update(state => { state.variables['second'] = true; });
  await Promise.all([p1, flushed, p2]);
  assert.equal(immediateStore.commits, 2);
  assert.deepEqual(await new JsonStore(immediatePath).read(state => state.variables), { first: true, second: true });
  await immediateStore.close();
});
