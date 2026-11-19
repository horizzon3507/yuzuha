import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore, MemoryStore, SQLiteStore } from '../src/index.js';
import type { Store } from '../src/ports/store.js';
import type { JsonValue } from '../src/domain/state.js';
import { VariableService } from '../src/services/variables.js';
import type { DataTransaction } from '../src/services/variables.js';
import { CaseService } from '../src/services/cases.js';

for (const kind of ['memory', 'json', 'sqlite', 'custom'] as const) {
  test(`${kind}: transações de variáveis e casos são atômicas e isoladas`, async t => {
    const dir = await mkdtemp(join(tmpdir(), 'yuzuha-point-writes-'));
    const path = join(dir, `state.${kind}`);
    const create = (): Store => {
      if (kind === 'sqlite') return new SQLiteStore(path);
      if (kind === 'json') return new JsonStore(path);
      const memory = new MemoryStore();
      return kind === 'memory' ? memory : { read: memory.read.bind(memory), update: memory.update.bind(memory) };
    };
    const store = create();
    t.after(async () => { await store.close?.(); await rm(dir, { recursive: true, force: true }); });
    let now = 1000;
    const service = new VariableService(store, { guildID: '100', authorID: '1' }, () => now);
    assert.equal(await service.ttl('guild', 'count'), -2);
    await Promise.all(Array.from({ length: 100 }, () => service.update('guild', 'count', value => Number(value) + 1, 0)));
    assert.equal(await service.get('guild', 'count'), 100);
    assert.equal(await service.ttl('guild', 'count'), -1);

    await assert.rejects(service.transaction(tx => {
      tx.guild.set('partial', 1);
      tx.guild.delete('count');
      throw new Error('rollback');
    }), /rollback/);
    assert.equal(await service.get('guild', 'partial'), null);
    await assert.rejects(service.transaction(tx => {
      tx.guild.set('invalid', NaN);
      tx.guild.delete('invalid');
    }));
    assert.equal(await service.get('guild', 'count'), 100);
    await assert.rejects(service.transaction(tx => {
      tx.guild.set('partial', 1);
      tx.guild.set('invalid', NaN);
    }));
    assert.equal(await service.get('guild', 'partial'), null);
    await assert.rejects(service.transaction(async tx => { tx.guild.set('partial', 1); }));
    await assert.rejects(service.transaction(tx => { tx.guild.set('partial', 1); return () => {}; }));
    assert.equal(await service.get('guild', 'partial'), null);

    let saved!: DataTransaction;
    const result = await service.transaction(tx => {
      saved = tx;
      tx.guild.set('object', { count: 1 });
      tx.userFor('2').set('other', 4);
      return tx.guild.get('object') as { count: number };
    });
    result.count = 9;
    assert.deepEqual(await service.get('guild', 'object'), { count: 1 });
    assert.equal(await service.forUser('2').get('user', 'other'), 4);
    assert.throws(() => saved.guild.get('object'), /terminou/);
    assert.throws(() => saved.userFor('3'), /terminou/);
    const fallback = { items: [] as JsonValue[] };
    await service.transaction(tx => { (tx.global.get('missing', fallback) as typeof fallback).items.push(1); });
    assert.deepEqual(fallback.items, []);
    await service.set('guild', 'null', null);
    assert.equal(await service.transaction(tx => tx.guild.get('null', 4)), null);

    await service.set('guild', 'ttl', 2, { ttlMs: 100 });
    assert.equal(await service.ttl('guild', 'ttl'), 100);
    now += 10;
    await service.update('guild', 'ttl', value => Number(value) + 1);
    assert.equal(await service.ttl('guild', 'ttl'), 90);
    assert.equal(await service.expire('guild', 'ttl', null), true);
    assert.equal(await service.ttl('guild', 'ttl'), -1);
    assert.equal(await service.expire('guild', 'ttl', 20), true);
    now += 20;
    assert.equal(await service.ttl('guild', 'ttl'), -2);
    assert.equal(await service.get('guild', 'ttl', 9), 9);
    assert.equal(await service.transaction(tx => tx.guild.ttl('ttl')), -2);
    assert.equal(await service.expire('guild', 'ttl', 10), false);
    await assert.rejects(service.expire('guild', 'count', -1));
    await service.set('guild', 'zero', 1, { ttlMs: 0 });
    assert.equal(await service.transaction(tx => tx.guild.get('zero')), null);

    const cases = new CaseService(store);
    const input = { guildID: '100', action: 'ban' as const, targetID: '2', moderatorID: '1', reason: 'test' };
    const records = await Promise.all(Array.from({ length: 30 }, () => cases.create(input)));
    assert.deepEqual(records.map(record => record.id), Array.from({ length: 30 }, (_, i) => i + 1));
    records[0]!.reason = 'changed';
    assert.equal((await cases.find('100', 1))?.reason, 'test');
    await assert.rejects(cases.create({ ...input, duration: -1 }));
    assert.equal((await cases.create(input)).id, 31);
    assert.equal((await cases.create({ ...input, guildID: '200' })).id, 1);

    if (kind === 'json' || kind === 'sqlite') {
      const reopened = create();
      try {
        const data = new VariableService(reopened, { guildID: '100', authorID: '1' });
        assert.equal(await data.get('guild', 'count'), 100);
        assert.equal(await data.get('guild', 'partial'), null);
        assert.equal(await data.get('guild', 'invalid'), null);
        assert.equal((await new CaseService(reopened).find('100', 31))?.id, 31);
      } finally { await reopened.close?.(); }
      await store.close?.();
      await assert.rejects(service.ttl('guild', 'count'), /fechado/);
    }
  });
}

test('SQLite: point writes não hidratam estado e rejeitam acesso após a transação', async t => {
  const store = new SQLiteStore(':memory:');
  t.after(() => store.close());
  store.update = async () => { throw new Error('full update'); };
  store.read = async () => { throw new Error('full read'); };
  const data = new VariableService(store, { guildID: '100', authorID: '1' }, () => 10);
  await data.set('guild', 'x', 1, { ttlMs: 20 });
  assert.equal(await data.ttl('guild', 'x'), 20);
  assert.equal(await data.update('guild', 'x', value => Number(value) + 1), 2);
  assert.equal((await new CaseService(store).create({ guildID: '100', action: 'ban', targetID: '2', moderatorID: '1', reason: '' })).id, 1);
  let access!: Parameters<Parameters<typeof store.updateVariables>[0]>[0];
  await store.updateVariables(vars => { access = vars; vars.set('raw', { n: 1 }, null); });
  assert.throws(() => access.set('raw', 2, null), /terminou/);
  await assert.rejects(store.updateVariables(vars => { vars.set('raw', 2, null); vars.set('bad', 1, -1); }));
  assert.deepEqual(await store.readVariable('raw', () => 0), { n: 1 });
});
