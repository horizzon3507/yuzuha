import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CommandContext, JsonStore, MemoryStore, SQLiteStore } from '../src/index.js';
import type { DataTransaction, Store } from '../src/index.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function context(store: Store) {
  return new CommandContext({ message: mockMessage('!dados'), command: { name: 'dados', run() {} },
    store, transport: new MockTransport(), cooldown: () => 0 });
}
for (const kind of ['memory', 'json', 'sqlite'] as const) {
  test(`transações ${kind}: escopos, concorrência, rollback e snapshots isolados`, async t => {
    const path = await mkdtemp(join(tmpdir(), 'yuzuha-transactions-'));
    const store = kind === 'memory' ? new MemoryStore() : kind === 'json' ? new JsonStore(join(path, 'state.json')) : new SQLiteStore(join(path, 'state.sqlite'));
    t.after(async () => { if ('close' in store) await store.close(); await rm(path, { recursive: true, force: true }); });
    const { data } = context(store);
    await Promise.all(Array.from({ length: 20 }, () => data.transaction(tx => {
      tx.guild.update('a', value => Number(value) + 1, 0);
      tx.user.update('b', value => Number(value) + 2, 0);
      tx.global.set('estado', 'ok');
    })));
    assert.equal(await data.guild.get('a'), 20);
    assert.equal(await data.user.get('b'), 40);
    assert.equal(await data.global.get('estado'), 'ok');
    await assert.rejects(data.transaction(tx => { tx.guild.set('a', 0); tx.user.delete('b'); throw new Error('rollback'); }), /rollback/);
    assert.equal(await data.guild.get('a'), 20);
    assert.equal(await data.user.get('b'), 40);
    await assert.rejects(data.transaction(tx => { tx.guild.set('a', 0); tx.user.set('b', NaN); }), /inválido/);
    assert.equal(await data.guild.get('a'), 20);
    const incoming = { nested: { n: 1 } };
    let saved: DataTransaction | undefined;
    const result = await data.transaction(tx => { saved = tx; tx.global.set('obj', incoming); return tx.global.get('obj'); });
    incoming.nested.n = 2;
    (result as { nested: { n: number } }).nested.n = 3;
    assert.deepEqual(await data.global.get('obj'), { nested: { n: 1 } });
    assert.throws(() => saved!.global.set('a', 999), /já terminou/);
    await assert.rejects(data.transaction(async tx => { tx.guild.set('a', -1); }), /síncronos/);
    assert.equal(await data.guild.get('a'), 20);
    await assert.rejects(data.transaction(tx => { tx.guild.set('a', -1); return () => {}; }));
    assert.equal(await data.guild.get('a'), 20);
  });
}

test('transação em DM permite global/user e recusa guild sem alterar outros escopos', async () => {
  const ctx = new CommandContext({ message: mockMessage('!dados', { guildID: undefined }), command: { name: 'dados', run() {} },
    store: new MemoryStore(), transport: new MockTransport(), cooldown: () => 0 });
  await ctx.data.transaction(tx => { tx.user.set('x', 1); tx.global.set('x', 2); });
  await assert.rejects(ctx.data.transaction(tx => { tx.global.set('x', 9); tx.guild.set('x', 1); }), /servidores/);
  assert.equal(await ctx.data.global.get('x'), 2);
  assert.equal(await ctx.data.user.get('x'), 1);
});
