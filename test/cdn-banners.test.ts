import test from 'node:test';
import assert from 'node:assert/strict';
import { GuardError, YuzuhaError } from '../src/shared/errors.js';
import { createCdn, fixAnimatedAssetUrl } from '../src/domain/cdn.js';
import { createUsersResources } from '../src/infrastructure/fluxer/resources/users.js';
import { CommandContext } from '../src/commands/context.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import type { Client } from '@fluxerjs/core';

const cdn = createCdn();

test('fixAnimatedAssetUrl converte só hashes a_* de png para gif', () => {
  assert.equal(fixAnimatedAssetUrl('https://cdn.x/avatars/1/a_abcd.png'), 'https://cdn.x/avatars/1/a_abcd.gif');
  assert.equal(fixAnimatedAssetUrl('https://cdn.x/avatars/1/a_abcd.png?size=64'), 'https://cdn.x/avatars/1/a_abcd.gif?size=64');
  assert.equal(fixAnimatedAssetUrl('https://cdn.x/avatars/1/bcde.png'), 'https://cdn.x/avatars/1/bcde.png');
  assert.equal(fixAnimatedAssetUrl('https://cdn.x/avatars/1/a_x.webp'), 'https://cdn.x/avatars/1/a_x.webp');
  assert.equal(fixAnimatedAssetUrl(null), null);
});

test('cdn helpers produzem URLs e honram animação', () => {
  assert.match(cdn.avatar('1', 'abc')!, /\/avatars\/1\/abc\.png/);
  assert.match(cdn.avatar('1', 'a_abc')!, /\/avatars\/1\/a_abc\.gif/);
  assert.match(cdn.banner('1', 'abc')!, /banner/);
  assert.match(cdn.guildIcon('9', 'abc')!, /icons\/9\/abc/);
  assert.match(cdn.memberBanner('9', '1', 'a_x')!, /\.gif/);
  assert.match(cdn.emoji('7', { animated: true })!, /emoji/);
});

test('cdn.asset valida tamanho e reescreve formato', () => {
  const url = 'https://cdn.x/avatars/1/h.png';
  assert.equal(cdn.asset(url, { size: 64 }), 'https://cdn.x/avatars/1/h.png?size=64');
  assert.equal(cdn.asset(url + '?size=64', { size: 256 }), 'https://cdn.x/avatars/1/h.png?size=256');
  assert.match(cdn.asset(url, { format: 'webp' }), /\.webp$/);
  assert.throws(() => cdn.asset(url, { size: 100 }), (e: unknown) => e instanceof GuardError && e.reason === 'INVALID_ARGUMENT');
  assert.throws(() => cdn.asset(url, { size: 8192 }), GuardError);
});

test('users.bannerURL prefere perfil de servidor e honra animação', async () => {
  const calls: string[] = [];
  const client = {
    users: {
      fetchWithProfile: async () => ({ user: {}, member: null,
        globalProfile: { userProfile: { banner: 'a_global' } },
        serverProfile: { userProfile: { banner: 'b_server' } } }),
      fetch: async () => { calls.push('fetch'); return {}; },
    },
  } as unknown as Client;
  const users = createUsersResources(client);
  assert.match((await users.bannerURL('1', '100'))!, /members|guild|server|a_/);
  const onlyGlobal = { users: { fetchWithProfile: async () => ({ user: {}, member: null,
    globalProfile: { userProfile: { banner: 'a_global' } }, serverProfile: null }) } } as unknown as Client;
  const url = await createUsersResources(onlyGlobal).bannerURL('1');
  assert.match(url!, /a_global/);
  const none = { users: { fetchWithProfile: async () => ({ user: {}, member: null,
    globalProfile: { userProfile: { banner: null } }, serverProfile: null }) } } as unknown as Client;
  assert.equal(await createUsersResources(none).bannerURL('1'), null);
});

test('ctx.cdn funciona sem cliente nativo e honra mediaBase', async () => {
  const ctx = new CommandContext({ message: mockMessage('!x'), command: { name: 'x' },
    store: new MemoryStore(), transport: new MockTransport(), cooldown: () => 0, resources: mockResources() });
  assert.match(ctx.cdn.avatar('1', 'abc')!, /avatar/);
  const bound = createCdn('https://cdn.example.com');
  const ctx2 = new CommandContext({ message: mockMessage('!x'), command: { name: 'x' },
    store: new MemoryStore(), transport: new MockTransport(), cooldown: () => 0, resources: mockResources(), cdn: bound });
  assert.match(ctx2.cdn.avatar('1', 'abc')!, /cdn\.example\.com/);
  assert.throws(() => createCdn('http://insecure'), (e: unknown) => e instanceof YuzuhaError && e.code === 'OPTIONS');
});
