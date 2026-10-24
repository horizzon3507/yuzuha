import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@fluxerjs/core';
import { CommandContext, GuardError, MemoryStore, PartialModerationError, ScriptError } from '../src/index.js';
import { Runtime, defaultLimits, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
import { createUsersResources } from '../src/infrastructure/fluxer/resources/users.js';

function fixture(options: { dm?: boolean; limits?: Partial<typeof defaultLimits> } = {}) {
  const transport = new MockTransport();
  const abort = new AbortController();
  const features = ['COMMUNITY', 'VERIFIED'];
  const departures: string[] = [];
  const resources = mockResources({ users: {
    guild: async () => ({ id: '100', name: 'Yuzuha', ownerID: '1', iconURL: null,
      bannerURL: null, memberCount: 3, createdTimestamp: 0, features }),
    leaveGuild: async id => { departures.push(id); },
  } });
  const ctx = new CommandContext({ transport, store: new MemoryStore(), resources, signal: abort.signal,
    message: mockMessage('!test', options.dm ? { guildID: undefined } : {}),
    command: { name: 'test' }, cooldown: () => 0 });
  const runtime = registerBuiltins(new Runtime({ ...defaultLimits, ...options.limits }));
  return { ctx, runtime, transport, departures, features, abort,
    run: (source: string) => runtime.execute(runtime.compile(source), ctx) };
}

test('while rechecks its condition, exposes the current index and restores nested loop state', async () => {
  const f = fixture();
  assert.equal(await f.run('$while[$ne[$loopIndex;3];$loopIndex]'), '012');
  assert.equal(await f.run('$repeat[2;$forEach[$array[a;b];$break];$loopIndex]'), '01');
  assert.equal(await f.run('$let[n;0]$while[$ne[$get[n];4];$let[n;$math[$get[n];+;1]];$if[$eq[$get[n];2];$continue];$get[n]]'), '134');
  assert.equal(f.ctx.vars.has('__loopIndex'), false);
  assert.equal(await f.run('$loopIndex'), '');
  assert.equal(await f.run('$while[false;$throw[não]]'), '');
});

test('break and continue bypass try and affect only their nearest explicit loop', async () => {
  const f = fixture();
  assert.equal(await f.run('$repeat[5;$try[$if[$eq[$loopIndex;2];$break];errado];$loopIndex]'), '01');
  assert.equal(await f.run('$repeat[4;$try[$if[$eq[$loopIndex;1];$continue];errado];$loopIndex]'), '023');
  await assert.rejects(f.run('$break'), /loop ativo/);
  await assert.rejects(f.run('$let[__loopFrame;$object]$break'), /loop ativo/);
  await assert.rejects(f.run('$repeat[1;$arrayMap[$array[1];$break]]'), /loop ativo/);
  assert.equal(await f.run('$repeat[2;$while[true;$break];$loopIndex]'), '01');
});

test('while keeps limits, cancellation, guards and partial moderation errors outside try', async () => {
  const f = fixture();
  await assert.rejects(f.run('$try[$while[true;$continue];ignorado]'), (e: unknown) => e instanceof ScriptError && e.code === 'EXECUTION_LIMIT');
  await assert.rejects(f.run('$while[true;$onlyIf[false;negado]]'), GuardError);
  f.runtime.register({ name: 'partial', category: 'test', minArgs: 0, maxArgs: 0, usage: '', description: '',
    execute: () => { throw new PartialModerationError('ban', '2', new Error('store')); } });
  await assert.rejects(f.run('$try[$while[true;$partial];ignorado]'), PartialModerationError);
  assert.equal(f.ctx.vars.has('__loopIndex'), false);
  const limited = fixture({ limits: { output: 4 } });
  await assert.rejects(limited.run('$try[$while[true;abc];ignorado]'), (e: unknown) => e instanceof ScriptError && e.code === 'OUTPUT_LIMIT');
  const aborted = fixture();
  aborted.runtime.register({ name: 'cancel', category: 'test', minArgs: 0, maxArgs: 0, usage: '', description: '',
    execute: () => { aborted.abort.abort(); return ''; } });
  await assert.rejects(aborted.run('$while[true;$cancel]'), (e: unknown) => e instanceof ScriptError && e.code === 'EXECUTION_ABORTED');
});

test('custom sort is stable, leaves its input intact and restores nested comparator operands', async () => {
  const f = fixture();
  f.ctx.vars.set('items', [{ n: 2, id: 'a' }, { n: 1, id: 'b' }, { n: 2, id: 'c' }]);
  assert.deepEqual(await f.run('$arraySortWith[$get[items];$math[$jsonGet[$sortLeft;n];-;$jsonGet[$sortRight;n]]]'),
    [{ n: 1, id: 'b' }, { n: 2, id: 'a' }, { n: 2, id: 'c' }]);
  assert.deepEqual(f.ctx.vars.get('items'), [{ n: 2, id: 'a' }, { n: 1, id: 'b' }, { n: 2, id: 'c' }]);
  assert.equal(await f.run('$sortLeft'), '');
  assert.equal(await f.run('$let[sorted;$arraySortWith[$array[3;1;2];$let[x;$arraySortWith[$array[2;1];$math[$sortLeft;-;$sortRight]]]$math[$sortLeft;-;$sortRight]]]$jsonEncode[$get[sorted]]'), '[1,2,3]');
  assert.equal(await f.run('$sortLeft'), '');
  await assert.rejects(f.run('$arraySortWith[$array[1;2];false]'), /número finito/);
  await assert.rejects(f.run('$try[$arraySortWith[$array[1;2];$onlyIf[false;negado]];ignorado]'), GuardError);
});

test('guild features are copied and leaveGuild requires the server owner in native and script modes', async () => {
  const f = fixture();
  const features = await f.ctx.guildFeatures();
  features.push('changed');
  assert.deepEqual(await f.run('$guildFeatures'), f.features);
  await f.ctx.leaveGuild();
  await f.run('$leaveGuild');
  assert.deepEqual(f.departures, ['100', '100']);
  f.transport.setMember('100', { id: '1', owner: false, rank: 999, permissions: (1n << 60n) - 1n });
  await assert.rejects(f.ctx.leaveGuild(), GuardError);
  await assert.rejects(f.run('$try[$leaveGuild;ignorado]'), GuardError);
  assert.equal(f.departures.length, 2);
  const dm = fixture({ dm: true });
  await assert.rejects(dm.run('$guildFeatures'), GuardError);
  await assert.rejects(dm.run('$leaveGuild'), GuardError);
  const ownerBot = fixture();
  ownerBot.transport.setMember('100', { id: ownerBot.transport.botID, owner: true, rank: 100, permissions: 0n });
  await assert.rejects(ownerBot.run('$leaveGuild'), GuardError);
  assert.deepEqual(ownerBot.departures, []);
});

test('guild adapter maps features and delegates departures to ClientUser without logging in', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const left: string[] = [];
  Reflect.set(client, 'user', { leaveGuild: async (id: string) => { left.push(id); } });
  const features = ['COMMUNITY'];
  Reflect.set(client.guilds, 'fetch', async () => ({ id: '100', name: 'Yuzuha', ownerId: '1',
    iconURL: () => null, bannerURL: () => null, memberCount: 1, createdTimestamp: 0, features }));
  const users = createUsersResources(client);
  const guild = await users.guild('100');
  guild.features?.push('changed');
  assert.deepEqual(features, ['COMMUNITY']);
  await users.leaveGuild?.('100');
  assert.deepEqual(left, ['100']);
});
