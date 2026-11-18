import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, Events } from '@fluxerjs/core';
import { FluxerTransport, MemberCache, MemoryStore, Yuzuha, YuzuhaError } from '../src/index.js';
import { TestClock } from '../src/testing.js';

function guildClient(onFetch?: () => void) {
  const client = new Client();
  const guild = {
    ownerId: '1',
    roles: new Map([['100', { id: '100', position: 0 }]]),
    fetchRoles: async () => {},
    members: {
      fetch: async (id: string) => ({
        roles: { cache: new Map([[id === '1' ? '10' : '20', { id: id === '1' ? '10' : '20', position: id === '1' ? 10 : 5 }]]) },
        permissions: { bitfield: 8n },
        permissionsIn: () => ({ bitfield: 16n }),
      }),
    },
  };
  Reflect.set(client.guilds, 'fetch', async () => {
    onFetch?.();
    return guild;
  });
  Reflect.set(client.channels, 'fetch', async () => ({
    isGuild: () => true,
    guildId: '100',
  }));
  return client;
}

test('MemberCache expires entries by TTL and isolates cloned snapshots with bigint permissions', () => {
  const clock = new TestClock(1_000);
  const cache = new MemberCache({ ttlMs: 500, now: clock.now });
  const input = { id: '2', owner: false, permissions: 16n, rank: 5, topRoleID: '10' };
  cache.set('100', '2', input);
  input.rank = 999;

  const first = cache.get('100', '2');
  assert.deepEqual(first, { id: '2', owner: false, permissions: 16n, rank: 5, topRoleID: '10' });
  first!.permissions = 0n;

  clock.advance(499);
  assert.equal(cache.get('100', '2')?.permissions, 16n);

  clock.advance(1);
  assert.equal(cache.get('100', '2'), undefined);
  assert.equal(cache.size, 0);
});

test('MemberCache enforces LRU eviction and separates channel keys', () => {
  const clock = new TestClock(1_000);
  const cache = new MemberCache({ ttlMs: 1_000, max: 2, now: clock.now });
  cache.set('100', '1', { id: '1', owner: true, permissions: 8n, rank: 10 });
  cache.set('100', '2', { id: '2', owner: false, permissions: 4n, rank: 5 });
  assert.equal(cache.size, 2);

  // Access '1' so '2' becomes the least recently used entry
  assert.equal(cache.get('100', '1')?.id, '1');
  cache.set('100', '1', { id: '1', owner: true, permissions: 8n, rank: 10 }, '300');
  assert.equal(cache.size, 2);
  assert.equal(cache.get('100', '2'), undefined);
  assert.equal(cache.get('100', '1')?.id, '1');
  assert.equal(cache.get('100', '1', '300')?.id, '1');
});

test('MemberCache validates ttlMs, max and now options with MEMBER_CACHE_OPTIONS', () => {
  for (const invalid of [
    null,
    [],
    { ttlMs: 0 },
    { ttlMs: -10 },
    { ttlMs: 1.5 },
    { ttlMs: 3_600_001 },
    { ttlMs: Number.NaN },
    { ttlMs: 1_000, max: 0 },
    { ttlMs: 1_000, max: 1.5 },
    { ttlMs: 1_000, max: 1_000_001 },
    { ttlMs: 1_000, now: 'invalid' },
  ]) {
    assert.throws(
      () => new MemberCache(invalid as never),
      (error: unknown) => error instanceof YuzuhaError && error.code === 'MEMBER_CACHE_OPTIONS',
    );
  }
  assert.throws(
    () => new Yuzuha({ memberCache: { ttlMs: 0 }, store: new MemoryStore() }),
    (error: unknown) => error instanceof YuzuhaError && error.code === 'MEMBER_CACHE_OPTIONS',
  );
});

test('FluxerTransport uses MemberCache and invalidates on gateway member, role, guild and channel events', async t => {
  let fetches = 0;
  const client = guildClient(() => { fetches++; });
  t.after(() => client.destroy());

  const clock = new TestClock(1_000);
  const cache = new MemberCache({ ttlMs: 60_000, now: clock.now });
  const transport = new FluxerTransport(client, {}, cache);
  const detach = transport.attachCacheInvalidation(client);

  await transport.member('100', '2');
  await transport.member('100', '2');
  assert.equal(fetches, 1);

  await transport.member('100', '2', '300');
  assert.equal(fetches, 2);

  // Channel update/delete invalidates only channel-scoped entries
  client.emit(Events.ChannelUpdate, { id: '300' } as never, { id: '300' } as never);
  await transport.member('100', '2');
  assert.equal(fetches, 2);
  await transport.member('100', '2', '300');
  assert.equal(fetches, 3);

  client.emit(Events.ChannelDelete, { id: '300' } as never);
  await transport.member('100', '2', '300');
  assert.equal(fetches, 4);

  // Member update/remove invalidates member across guild and channel keys
  client.emit(Events.GuildMemberUpdate, null, { id: '2', guild: { id: '100' } } as never);
  await transport.member('100', '2');
  assert.equal(fetches, 5);

  client.emit(Events.GuildMemberRemove, { id: '2', guild: { id: '100' } } as never);
  await transport.member('100', '2');
  assert.equal(fetches, 6);

  // Role and guild events invalidate all members in the guild
  await transport.member('100', '1');
  assert.equal(fetches, 7);
  client.emit(Events.GuildRoleCreate, { guildId: '100' } as never);
  await transport.member('100', '1');
  assert.equal(fetches, 8);

  client.emit(Events.GuildRoleUpdate, null, { guildId: '100' } as never);
  await transport.member('100', '2');
  assert.equal(fetches, 9);

  client.emit(Events.GuildRoleDelete, null, '100', '10');
  await transport.member('100', '2');
  assert.equal(fetches, 10);

  client.emit(Events.GuildDelete, { id: '100' } as never);
  await transport.member('100', '2');
  assert.equal(fetches, 11);

  detach();
  client.emit(Events.GuildDelete, { id: '100' } as never);
  await transport.member('100', '2');
  assert.equal(fetches, 11);
});

test('Yuzuha wires memberCache and detaches gateway invalidation listeners on destroy and failed login', async () => {
  let fetches = 0;
  const client = guildClient(() => { fetches++; });
  const clock = new TestClock(5_000);
  const bot = new Yuzuha({
    client,
    store: new MemoryStore(),
    now: clock.now,
    memberCache: { ttlMs: 1_000, max: 50 },
  });

  const events = [
    Events.GuildMemberUpdate,
    Events.GuildMemberRemove,
    Events.GuildRoleCreate,
    Events.GuildRoleUpdate,
    Events.GuildRoleDelete,
    Events.GuildDelete,
    Events.ChannelUpdate,
    Events.ChannelDelete,
  ] as const;
  const sharedWithVoiceStates = new Set<string>([Events.GuildDelete, Events.ChannelDelete]);
  for (const event of events) {
    assert.equal(client.listenerCount(event), sharedWithVoiceStates.has(event) ? 2 : 1);
  }

  await bot.transport.member('100', '2');
  await bot.transport.member('100', '2');
  assert.equal(fetches, 1);

  client.emit(Events.GuildMemberUpdate, null, { id: '2', guild: { id: '100' } } as never);
  await bot.transport.member('100', '2');
  assert.equal(fetches, 2);

  clock.advance(1_000);
  await bot.transport.member('100', '2');
  assert.equal(fetches, 3);

  await bot.destroy();
  for (const event of events) assert.equal(client.listenerCount(event), 0);

  // Failed login cleanup also detaches cache listeners
  const failingClient = guildClient();
  Reflect.set(failingClient, 'login', async () => { throw new Error('bad token'); });
  const failingBot = new Yuzuha({
    client: failingClient,
    store: new MemoryStore(),
    memberCache: { ttlMs: 5_000 },
  });
  await assert.rejects(failingBot.login('invalid-token'), /bad token/);
  for (const event of events) assert.equal(failingClient.listenerCount(event), 0);
  await failingBot.destroy();
});
