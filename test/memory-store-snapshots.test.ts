import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, StoreError, isYuzuhaError } from '../src/index.js';
import type { State } from '../src/index.js';
import {
  validateCasesForGuild,
  validateExpiration,
  validateScheduleHistory,
  validateSchedules,
  validateVariableValue,
} from '../src/domain/state-validation.js';

function sampleSchedule(id = 'task-1') {
  return {
    id,
    guildID: '100',
    channelID: '200',
    authorID: '1',
    command: 'ping',
    input: '',
    due: 1_000,
    attempts: 0,
    runningAt: null,
  };
}

function sampleCase(guildID = '100', id = 1) {
  return {
    id,
    guildID,
    action: 'ban' as const,
    targetID: '2',
    moderatorID: '1',
    reason: 'spam',
    createdAt: '2026-10-20T12:00:00.000Z',
  };
}

test('validadores incrementais de domínio validam fatias e valores isoladamente', () => {
  assert.equal(validateVariableValue({ ok: [1, true, null, 'text'] }), true);
  assert.equal(validateVariableValue(Number.NaN), false);
  assert.equal(validateVariableValue([new Array(1)]), false);
  const cyclic: Record<string, unknown> = {};
  cyclic['self'] = cyclic;
  assert.equal(validateVariableValue(cyclic), false);

  assert.equal(validateExpiration(0), true);
  assert.equal(validateExpiration(1_700_000_000_000), true);
  assert.equal(validateExpiration(-1), false);
  assert.equal(validateExpiration(1.5), false);
  assert.equal(validateExpiration(Number.NaN), false);

  assert.equal(validateCasesForGuild('100', [sampleCase('100', 1), sampleCase('100', 2)]), true);
  assert.equal(validateCasesForGuild('100', [sampleCase('100', 2)]), false);
  assert.equal(validateCasesForGuild('100', [sampleCase('200', 1)]), false);
  assert.equal(validateCasesForGuild('100', new Array(1)), false);

  assert.equal(validateSchedules([sampleSchedule('a')]), true);
  assert.equal(validateSchedules([{ ...sampleSchedule('a'), due: Number.POSITIVE_INFINITY }]), false);
  assert.equal(validateSchedules(new Array(1)), false);

  const validHistory = [{
    id: 'exec-1',
    task: sampleSchedule('a'),
    startedAt: 100,
    finishedAt: 200,
    status: 'success' as const,
    retryable: false,
  }];
  assert.equal(validateScheduleHistory(validHistory), true);
  assert.equal(validateScheduleHistory([{ ...validHistory[0]!, status: 'unknown' }]), false);
  assert.equal(validateScheduleHistory(new Array(1)), false);
});

test('MemoryStore.read isola mutações no callback, nos retornos e em referências vazadas', async () => {
  const store = new MemoryStore();
  await store.update(state => {
    state.variables['obj'] = { nested: [1, 2], meta: { ok: true } };
    state.variableExpirations = { obj: 5_000 };
    state.cases['100'] = [sampleCase('100', 1)];
    state.schedules = [sampleSchedule('s1')];
    state.scheduleHistory = [{
      id: 'h1',
      task: sampleSchedule('s0'),
      startedAt: 10,
      finishedAt: 20,
      status: 'success',
      retryable: false,
    }];
  });

  let leakedState: State | undefined;
  const inside = await store.read(state => {
    leakedState = state as State;
    (state.variables['obj'] as { nested: number[] }).nested.push(99);
    state.variables['added'] = 'ephemeral';
    state.cases['100']![0]!.reason = 'edited';
    state.schedules[0]!.due = 999_999;
    state.scheduleHistory![0]!.status = 'failed';
    return (state.variables['obj'] as { nested: number[] }).nested.length;
  });
  assert.equal(inside, 3);

  leakedState!.variables['leaked'] = true;
  (leakedState!.variables['obj'] as { nested: number[] }).nested.push(100);

  const returnedObj = await store.read(state => state.variables['obj']) as { nested: number[]; meta: { ok: boolean } };
  returnedObj.nested.push(777);
  returnedObj.meta.ok = false;

  const returnedState = await store.read(state => state) as State;
  returnedState.variables['mutatedAfterRead'] = 123;
  returnedState.schedules.push(sampleSchedule('s2'));
  assert.deepEqual(structuredClone(returnedState).variables['mutatedAfterRead'], 123);

  const returnedCases = await store.read(state => state.cases['100']!);
  returnedCases[0]!.reason = 'tampered';

  const returnedPair = await store.read(state => ({ left: state.variables['obj'], right: state.variables['obj'] }));
  assert.equal(returnedPair.left, returnedPair.right);
  (returnedPair.left as { nested: number[] }).nested.push(888);

  const clean = await store.read(state => state);
  assert.deepEqual(clean.variables, { obj: { nested: [1, 2], meta: { ok: true } } });
  assert.deepEqual(clean.variableExpirations, { obj: 5_000 });
  assert.equal(clean.cases['100']?.[0]?.reason, 'spam');
  assert.equal(clean.schedules.length, 1);
  assert.equal(clean.schedules[0]?.due, 1_000);
  assert.equal(clean.scheduleHistory?.[0]?.status, 'success');

  const asyncMap = await store.read(async state => new Map(Object.entries(state.variables)));
  assert.ok(asyncMap instanceof Map);
  assert.deepEqual(asyncMap.get('obj'), { nested: [1, 2], meta: { ok: true } });
});

test('MemoryStore.update isola entradas externas, retornos e faz rollback em erro síncrono, async, inválido ou commit', async () => {
  const store = new MemoryStore();
  const external = { tags: ['a'] };
  const returned = await store.update(state => {
    state.variables['ext'] = external;
    state.variables['existing'] = { count: 1, items: [1] };
    state.cases['100'] = [sampleCase('100', 1)];
    state.schedules = [sampleSchedule('s1')];
    return state.variables['ext'];
  }) as typeof external;

  external.tags.push('external-mutated');
  returned.tags.push('returned-mutated');
  assert.deepEqual(await store.read(state => state.variables['ext']), { tags: ['a'] });

  await store.update(state => {
    const existing = state.variables['existing'] as { count: number; items: number[] };
    existing.count = 2;
    existing.items.push(2);
    state.schedules[0]!.due = 2_000;
  });
  assert.deepEqual(await store.read(state => state.variables['existing']), { count: 2, items: [1, 2] });
  assert.equal(await store.read(state => state.schedules[0]?.due), 2_000);

  const snapshot = await store.read(state => state);

  await assert.rejects(store.update(state => {
    state.variables['existing'] = 999;
    delete state.cases['100'];
    state.schedules.push(sampleSchedule('s2'));
    throw new Error('boom');
  }), /boom/);
  assert.deepEqual(await store.read(state => state), snapshot);

  await assert.rejects(
    store.update((async (state: State) => { state.variables['existing'] = 0; }) as never),
    error => error instanceof StoreError && isYuzuhaError(error, 'STORE_ASYNC'),
  );
  assert.deepEqual(await store.read(state => state), snapshot);

  await assert.rejects(store.update(state => {
    state.variables['existing'] = 0;
    const detached = state.variables['ext'] as Record<string, unknown>;
    delete state.variables['ext'];
    detached['fn'] = () => {};
    return detached;
  }));
  assert.deepEqual(await store.read(state => state), snapshot);

  const invalidMutations: ((state: State) => void)[] = [
    state => { state.variables['bad'] = Number.NaN; },
    state => { state.variables['bad'] = [new Array(1)]; },
    state => { (state.variables['existing'] as { items: unknown[] }).items.push(undefined); },
    state => {
      const proxy = state.variables['existing'] as Record<string, unknown>;
      proxy['self'] = proxy;
    },
    state => { delete (state.variables['existing'] as { items: unknown[] }).items[0]; },
    state => { state.variables['__proto__'] = { polluted: true } as never; },
    state => { state.variableExpirations = { existing: -1 }; },
    state => { (state as unknown as Record<string, unknown>)['variableExpirations'] = undefined; },
    state => { state.cases['100']!.push(sampleCase('100', 99)); },
    state => { state.cases['200'] = new Array(1); },
    state => { state.schedules[0]!.due = Number.POSITIVE_INFINITY; },
    state => { state.schedules.push({ ...sampleSchedule('bad-cron'), cron: 'invalid', timezone: 'UTC' }); },
    state => { state.scheduleHistory = [{ id: 'x', task: sampleSchedule('t'), startedAt: 1, finishedAt: Number.NaN, status: 'success', retryable: false }]; },
    state => { (state as unknown as Record<string, unknown>)['schema'] = 1; },
    state => { delete (state as unknown as Record<string, unknown>)['variables']; },
    state => { (state as unknown as Record<string, unknown>)['extraInvalid'] = () => {}; },
  ];

  for (const mutate of invalidMutations) {
    await assert.rejects(
      store.update(state => {
        state.variables['touched'] = true;
        mutate(state);
      }),
      error => error instanceof StoreError && isYuzuhaError(error, 'STORE_INVALID'),
    );
    assert.deepEqual(await store.read(state => state), snapshot);
  }

  class CommitFailStore extends MemoryStore {
    seenJson = '';
    protected override async commit(state: State): Promise<void> {
      this.seenJson = JSON.stringify(state);
      throw new Error('disk full');
    }
  }
  const failing = new CommitFailStore();
  await assert.rejects(failing.update(state => { state.variables['x'] = 42; }), /disk full/);
  assert.equal(JSON.parse(failing.seenJson).variables.x, 42);
  assert.deepEqual(await failing.read(state => state.variables), {});
});

test('MemoryStore preserva propriedade própria __proto__, substituições integrais e operações de array', async () => {
  const store = new MemoryStore();
  await store.update(state => {
    state.variables = JSON.parse('{"__proto__":{"safe":1},"a":1}');
    state.schedules = [sampleSchedule('first'), sampleSchedule('second'), sampleSchedule('third')];
  });
  await store.update(state => {
    const first = state.schedules[0]!;
    state.schedules.shift();
    state.schedules[0]!.due = 5_000;
    first.due = 99;
    Object.defineProperty(state.variables, 'added', { value: 2, writable: true, enumerable: true, configurable: true });
  });
  const after = await store.read(state => state);
  assert.equal(Object.hasOwn(after.variables, '__proto__'), true);
  assert.equal(after.variables['added'], 2);
  assert.deepEqual(after.schedules.map(item => [item.id, item.due]), [['second', 5_000], ['third', 1_000]]);
});

test('MemoryStore mantém consistência e baixo custo incremental com 10.000 chaves', async () => {
  const store = new MemoryStore();
  await store.update(state => {
    for (let i = 0; i < 10_000; i++) {
      state.variables[`key:${i}`] = { index: i, nested: [i, i + 1] };
    }
    state.cases['other-guild'] = [sampleCase('other-guild', 1)];
  });

  const started = performance.now();
  for (let i = 0; i < 500; i++) {
    const entry = await store.read(state => state.variables[`key:${i}`]) as { index: number };
    assert.equal(entry.index, i);
  }
  for (let i = 0; i < 500; i++) {
    await store.update(state => {
      state.variables['counter'] = Number(state.variables['counter'] ?? 0) + 1;
    });
  }
  const elapsedMs = performance.now() - started;

  assert.equal(await store.read(state => state.variables['counter']), 500);
  assert.deepEqual(await store.read(state => state.variables['key:9999']), { index: 9999, nested: [9999, 10000] });
  assert.equal(await store.read(state => state.cases['other-guild']?.[0]?.reason), 'spam');
  assert.ok(elapsedMs < 2_000, `Esperado operações O(1) rápidas em 10k chaves; levou ${elapsedMs.toFixed(1)}ms`);
});
