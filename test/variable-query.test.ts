import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MemoryStore, JsonStore, SQLiteStore, CommandContext, GuardError } from '../src/index.js';
import { variableKey } from '../src/domain/state.js';
import type { Store } from '../src/index.js';
import { VariableService } from '../src/services/variables.js';
import { MockTransport, mockMessage } from '../src/testing.js';

for (const kind of ['memory', 'json', 'sqlite'] as const) {
  test(`variable query ${kind}: cursor, UTF-16 order, literal prefix, scopes, TTL and snapshots`, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'yuzuha-query-'));
    const store: Store = kind === 'memory' ? new MemoryStore() : kind === 'json'
      ? new JsonStore(join(directory, 'data.json')) : new SQLiteStore(join(directory, 'data.sqlite'));
    t.after(async () => { await store.close?.(); await rm(directory, { recursive: true }); });
    let now = 100;
    const service = new VariableService(store, { guildID: '100', authorID: '1' }, () => now);
    const names = ['item:😀', 'item:\ue000', 'item:a', 'item:b', 'item:%_', 'item:\ud800', 'item:z'];
    await service.transaction(data => {
      for (const name of names) data.guild.set(name, { values: [name] });
      data.guild.set('item:expired', 'old', { ttlMs: 10 });
      data.global.set('item:global', 1); data.user.set('item:user', 2);
      data.guild.set('other', 3);
    });
    now = 110;
    const found: string[] = [];
    let after: string | undefined;
    do {
      const page = await service.query('guild', { prefix: 'item:', limit: 2, after });
      assert.ok(page.entries.length <= 2);
      found.push(...page.entries.map(entry => entry.name));
      assert.ok(page.entries.every(entry => entry.ttlMs === -1));
      after = page.nextCursor ?? undefined;
    } while (after !== undefined);
    assert.deepEqual(found, [...names].sort());
    assert.deepEqual((await service.query('guild', { prefix: 'item:%_' })).entries.map(e => e.name), ['item:%_']);
    const page = await service.query('guild', { prefix: 'item:a' });
    (page.entries[0]!.value as { values: string[] }).values.push('mutated');
    assert.deepEqual(await service.get('guild', 'item:a'), { values: ['item:a'] });
    assert.equal((await new VariableService(store, { guildID: '101', authorID: '1' }).query('guild')).entries.length, 0);
    await service.set('guild', 'temporary', 1, { ttlMs: 10 });
    assert.equal((await service.query('guild', { prefix: 'temporary' })).entries[0]?.ttlMs, 10);
    now += 10;
    assert.deepEqual(await service.query('guild', { prefix: 'temporary' }), { entries: [], nextCursor: null });
    for (const options of [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { prefix: 'a'.repeat(129) }, { after: 'b'.repeat(129) }]) {
      assert.throws(() => service.query('guild', options));
    }
    const ctx = new CommandContext({ store, transport: new MockTransport(), message: mockMessage('!data'), command: { name: 'data' }, cooldown: () => 0 });
    assert.equal((await ctx.data.guild.query({ prefix: 'item:a' })).entries[0]?.name, 'item:a');
    const dm = new VariableService(store, { guildID: '', authorID: '1' });
    assert.throws(() => dm.query('guild'), GuardError);
    assert.equal((await dm.query('global')).entries[0]?.name, 'item:global');
  });
}

test('SQLite query index refreshes after another connection, rollback, raw writes and state replacement', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-index-'));
  const path = join(directory, 'data.sqlite');
  const a = new SQLiteStore(path), b = new SQLiteStore(path);
  t.after(async () => { await a.close(); await b.close(); await rm(directory, { recursive: true }); });
  const first = new VariableService(a, { guildID: '100', authorID: '1' });
  const second = new VariableService(b, { guildID: '100', authorID: '1' });
  await first.transaction(data => { for (let i = 0; i < 2500; i++) data.guild.set(`entry:${String(i).padStart(4, '0')}`, i); });
  assert.equal((await second.query('guild', { prefix: 'entry:24' })).entries.length, 50);
  await second.delete('guild', 'entry:2400');
  assert.equal((await first.query('guild', { prefix: 'entry:2400' })).entries.length, 0);
  await assert.rejects(second.transaction(data => { data.guild.set('rolled-back', 1); throw new Error('rollback'); }));
  assert.deepEqual((await first.query('guild', { prefix: 'rolled' })).entries, []);
  const raw = new DatabaseSync(path);
  try {
    const plan = raw.prepare('EXPLAIN QUERY PLAN SELECT value_json FROM yuzuha_variable_index WHERE scope=? AND subject=? AND name_key>=? AND name_key<? ORDER BY name_key LIMIT 10').all('guild', '100', '', 'g');
    assert.match(String(plan[0]!['detail']), /SEARCH.*PRIMARY KEY/);
    const state = await a.read(s => s);
    state.variables[variableKey('guild', '100', 'external')] = true;
    raw.prepare('UPDATE yuzuha_state SET value=? WHERE id=1').run(JSON.stringify(state));
    assert.equal((await second.query('guild', { prefix: 'external' })).entries[0]?.value, true);
  } finally { raw.close(); }
  await a.update(s => { s.variables = { [variableKey('guild', '100', 'replacement')]: null }; });
  assert.deepEqual((await second.query('guild')).entries.map(e => e.name), ['replacement']);
});
