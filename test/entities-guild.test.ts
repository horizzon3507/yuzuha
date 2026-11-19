import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, PermissionFlags } from '@fluxerjs/core';
import { CommandContext, MemoryStore } from '../src/index.js';
import { Runtime, defaultLimits, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
import { createRolesResources } from '../src/infrastructure/fluxer/resources/roles.js';
import { createChannelsResources } from '../src/infrastructure/fluxer/resources/channels.js';

function harness() {
  const transport = new MockTransport(), calls: unknown[][] = [];
  let high = false, foreign = false, fail = false;
  const role = (id: string) => ({ id, name: 'cargo', color: 0, position: high && id === '6' ? 100 : 1,
    permissions: '0', hoist: true, hoistPosition: 1, mentionable: false, unicodeEmoji: null, managed: false });
  const application = { guildID: '100', status: 'pending', description: '', categoryType: 0 };
  const record = (name: string, ...args: unknown[]) => { calls.push([name, ...args]); if (fail) throw new Error('falha da API'); };
  const resources = mockResources({ users: {
    async discoveryStatus(g) { record('status', g); return { application: null, eligible: true, minMemberCount: 1000 }; },
    async applyForDiscovery(g, i) { record('apply', g, i); return application; },
    async editDiscoveryApplication(g, i) { record('edit', g, i); return application; },
    async withdrawDiscoveryApplication(g) { record('withdraw', g); },
    async member(g, id) { return { id, username: 'ana', displayName: 'Ana', bot: id === '999', avatarURL: null,
      bannerURL: null, createdTimestamp: 1, nickname: null, joinedTimestamp: 1, roles: [], permissions: '0', timedOutUntil: null }; },
    async transferOwnership(g, id) { record('transfer', g, id); },
  }, roles: {
    async resolve(_, id) { return role(id); }, async list() { return [role('5'), role('6')]; },
    async setRolePositions(g, i) { record('roles', g, i); return i.map(x => role(x.id)); },
    async setRoleHoistPositions(g, i) { record('hoist', g, i); return []; },
    async resetRoleHoistPositions(g) { record('reset', g); return []; },
  }, channels: {
    async get(id) { return { id, guildID: foreign && id === '6' ? '300' : '100', type: 0, name: 'geral',
      parentID: null, position: 0, topic: null, slowmode: 0, nsfw: false }; },
    async setChannelPositions(g, i) { record('channels', g, i); },
  }, expressions: { async createStickersBulk(g, i) { record('stickers', g, i); return { success: [], failed: [{ name: 'duplicado', error: 'já existe' }] }; } } });
  const context = () => new CommandContext({ message: mockMessage('!test'), command: { name: 'test', code: '' },
    transport, store: new MemoryStore(), cooldown: () => 0, resources });
  const runtime = registerBuiltins(new Runtime(defaultLimits));
  return { transport, calls, run: (s: string) => runtime.execute(runtime.compile(s), context()),
    high: () => { high = true; }, foreign: () => { foreign = true; }, fail: () => { fail = true; } };
}

const batch = '$array[$object[id;5;position;1];$object[id;6;position;2]]';
const sticker = '$array[$object[name;sticker;image;AAAA]]';

test('discovery aceita opções, consulta estado vazio e retira sem repetir falhas', async () => {
  const h = harness();
  assert.deepEqual(await h.run('$discoveryStatus'), { application: null, eligible: true, minMemberCount: 1000 });
  assert.equal((await h.run('$applyForDiscovery[$object[primaryLanguage;pt-BR;keywords;$array[tag]]]') as { status: string }).status, 'pending');
  await h.run('$editDiscoveryApplication[$object[description;nova]]');
  assert.equal(await h.run('$withdrawDiscoveryApplication'), '');
  assert.deepEqual(h.calls.map(x => x[0]), ['status', 'apply', 'edit', 'withdraw']);
  h.fail(); await assert.rejects(h.run('$applyForDiscovery[$object[description;nova]]'));
  assert.equal(h.calls.filter(x => x[0] === 'apply').length, 2);
});

test('discovery rejeita vazio, tipos, campos e limites sem chamada mutável', async () => {
  const h = harness();
  for (const input of ['$object', '$array', '$object[token;x]', '$object[description;true]', '$object[primaryCategoryId;-1]',
    '$object[primaryLanguage;inválido]', '$object[keywords;$array[true]]']) {
    await assert.rejects(h.run(`$applyForDiscovery[${input}]`));
    await assert.rejects(h.run(`$editDiscoveryApplication[${input}]`));
  }
  assert.equal(h.calls.length, 0);
});

test('operações de guild exigem permissões separadas de autor e bot, inclusive com try', async () => {
  for (const actor of ['1', '999']) {
    for (const script of ['$discoveryStatus', '$applyForDiscovery[$object[description;nova]]', '$editDiscoveryApplication[$object[description;nova]]',
      '$withdrawDiscoveryApplication', `$setRolePositions[${batch}]`, `$setRoleHoistPositions[${batch}]`,
      '$resetRoleHoistPositions', `$setChannelPositions[${batch}]`, `$createStickersBulk[${sticker}]`]) {
      const h = harness(); h.transport.setMember('100', { id: actor, owner: false, permissions: 0n, rank: 90 });
      await assert.rejects(h.run(`$try[${script};oculto]`)); assert.equal(h.calls.length, 0);
    }
  }
});

test('propriedade exige confirmação, ambos donos e destino humano; falha não é repetida', async () => {
  const h = harness();
  await assert.rejects(h.run('$transferOwnership[2;sim]'));
  await assert.rejects(h.run('$transferOwnership[2;TRANSFERIR]'), /bot precisa ser dono/);
  h.transport.setMember('100', { id: '999', owner: true, permissions: PermissionFlags.Administrator, rank: 90 });
  await assert.rejects(h.run('$transferOwnership[999;TRANSFERIR]'));
  assert.equal(await h.run('$transferOwnership[2;TRANSFERIR]'), '');
  assert.equal(h.calls.length, 1);
  h.transport.setMember('100', { id: '1', owner: false, permissions: PermissionFlags.Administrator, rank: 100 });
  await assert.rejects(h.run('$transferOwnership[2;TRANSFERIR]'), /Apenas o dono/);
  assert.equal(h.calls.length, 1);
});

test('posições validam o lote todo e a hierarquia de cada cargo antes da API', async () => {
  const h = harness();
  await h.run(`$setRolePositions[${batch}]`); await h.run(`$setRoleHoistPositions[${batch}]`);
  await h.run('$resetRoleHoistPositions'); await h.run(`$setChannelPositions[${batch}]`);
  assert.deepEqual(h.calls.map(x => x[0]), ['roles', 'hoist', 'reset', 'channels']);
  h.high();
  for (const s of [`$setRolePositions[${batch}]`, `$setRoleHoistPositions[${batch}]`, '$resetRoleHoistPositions']) await assert.rejects(h.run(s));
  assert.equal(h.calls.length, 4);
  h.foreign(); await assert.rejects(h.run(`$setChannelPositions[${batch}]`)); assert.equal(h.calls.length, 4);
  for (const fn of ['setRolePositions', 'setRoleHoistPositions', 'setChannelPositions']) {
    for (const input of ['$array', '$array[$object[id;5;position;-1]]', '$array[$object[id;5;position;1];$object[id;5;position;2]]']) {
      await assert.rejects(h.run(`$${fn}[${input}]`));
    }
  }
});

test('hierarquia do autor também limita posições futuras, e falha de API ocorre uma vez', async () => {
  const h = harness();
  h.transport.setMember('100', { id: '1', owner: false, permissions: PermissionFlags.ManageRoles, rank: 2 });
  await assert.rejects(h.run('$setRolePositions[$array[$object[id;5;position;3]]]'));
  assert.equal(h.calls.length, 0);
  h.fail(); await assert.rejects(h.run('$setRolePositions[$array[$object[id;5;position;1]]]'));
  assert.equal(h.calls.length, 1);
});

test('figurinhas preservam resultado parcial e validam até o último elemento antes de criar', async () => {
  const h = harness();
  assert.deepEqual(await h.run(`$createStickersBulk[${sticker}]`), { success: [], failed: [{ name: 'duplicado', error: 'já existe' }] });
  for (const input of ['$array', '$array[$object[name;sticker;image;AAAA];$object[name;ruim;image;!]]',
    '$array[$object[name;sticker;image;AAAA];$object[name;sticker;image;AAAA]]']) await assert.rejects(h.run(`$createStickersBulk[${input}]`));
  assert.equal(h.calls.length, 1);
});

test('adaptadores traduzem posições sem login nem requisições reais', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const calls: unknown[] = [];
  Reflect.set(client.guilds, 'resolve', async () => ({
    async setRolePositions(i: unknown) { calls.push(i); return []; },
    async setRoleHoistPositions(i: unknown) { calls.push(i); return []; },
    async setChannelPositions(i: unknown) { calls.push(i); },
  }));
  const roles = createRolesResources(client);
  await roles.setRolePositions('100', [{ id: '5', position: 2 }]);
  await roles.setRoleHoistPositions('100', [{ id: '5', position: null }]);
  await createChannelsResources(client).setChannelPositions('100', [{ id: '200', position: 1 }]);
  assert.deepEqual(calls, [[{ id: '5', position: 2 }], [{ id: '5', hoistPosition: 0 }], [{ id: '200', position: 1 }]]);
});
