import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, PermissionFlags } from '@fluxerjs/core';
import { CommandContext } from '../src/commands/context.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import { FluxerResources } from '../src/infrastructure/fluxer/resources.js';
import { bindAuthorizedResources } from '../src/services/resource-authorization.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
import { GuardError } from '../src/shared/errors.js';
import type { ChannelInfo } from '../src/ports/resources/channels.js';
import type { RoleInfo } from '../src/ports/resources/roles.js';
import type { ModerationMember } from '../src/domain/moderation.js';
import { Runtime, registerBuiltins } from '../src/functions.js';

const role: RoleInfo = { id: '10', name: 'membro', color: 0, position: 5, permissions: '0', hoist: false,
  mentionable: false, unicodeEmoji: null, managed: false };
const channel: ChannelInfo = { id: '200', name: 'geral', guildID: '100', type: 0, parentID: null,
  position: 0, topic: null, slowmode: 0, nsfw: false };
const webhook = { id: '50', guildID: '100', channelID: '200', token: 'secret', name: 'logs' };

function fixture() {
  const transport = new MockTransport();
  const calls: string[] = [];
  let roleInfo = { ...role }, channelInfo = { ...channel }, webhookInfo = { ...webhook };
  const raw = mockResources({ roles: {
    resolve: async () => roleInfo, list: async () => [roleInfo],
    add: async () => { calls.push('role.add'); }, remove: async () => { calls.push('role.remove'); },
    create: async () => { calls.push('role.create'); return roleInfo; },
    edit: async () => { calls.push('role.edit'); return roleInfo; },
    delete: async () => { calls.push('role.delete'); }, move: async () => { calls.push('role.move'); },
  }, channels: {
    get: async id => id === '300' ? { ...channelInfo, id, type: 4 } : channelInfo,
    create: async () => { calls.push('channel.create'); return channelInfo; },
    edit: async () => { calls.push('channel.edit'); return channelInfo; },
    delete: async () => { calls.push('channel.delete'); }, setSlowmode: async () => { calls.push('channel.slowmode'); },
    move: async () => { calls.push('channel.move'); }, setCategory: async () => { calls.push('channel.category'); return channelInfo; },
    overwrite: async () => { calls.push('channel.overwrite'); },
  }, webhooks: {
    fetch: async () => webhookInfo,
    create: async () => { calls.push('webhook.create'); return webhookInfo; },
    list: async () => { calls.push('webhook.list'); return [webhookInfo]; },
    send: async () => { calls.push('webhook.send'); return '1'; },
    edit: async () => { calls.push('webhook.edit'); }, delete: async () => { calls.push('webhook.delete'); },
  }, expressions: { createEmojisBulk: async () => { calls.push('emoji.bulk'); return { success: [], failed: [{ name: 'xx', error: 'full' }] }; } },
  });
  const resources = bindAuthorizedResources(raw, transport, { guildID: '100', authorID: '1' });
  return { raw, resources, transport, calls,
    role: (patch: Partial<RoleInfo>) => { roleInfo = { ...roleInfo, ...patch }; },
    channel: (patch: Partial<ChannelInfo>) => { channelInfo = { ...channelInfo, ...patch }; },
    webhook: (patch: Partial<typeof webhook>) => { webhookInfo = { ...webhookInfo, ...patch }; },
  };
}

const mutations = (r: ReturnType<typeof fixture>['resources']) => [
  () => r.roles.add('100', '2', '10'), () => r.roles.remove('100', '2', '10'),
  () => r.roles.create('100', { name: 'novo' }), () => r.roles.edit('100', '10', { name: 'novo' }),
  () => r.roles.delete('100', '10'), () => r.roles.move('100', '10', 2),
  () => r.channels.create('100', { name: 'novo' }), () => r.channels.edit('200', { name: 'novo' }),
  () => r.channels.delete('200'), () => r.channels.setSlowmode('200', 3), () => r.channels.move('200', 3),
  () => r.channels.setCategory('200', '300'), () => r.channels.overwrite('200', '10', { type: 'role', allow: ['SendMessages'] }),
  () => r.webhooks.create('200', 'logs'), () => r.webhooks.list('200'), () => r.webhooks.fetch('50'),
  () => r.webhooks.send('50', 'secret', { content: 'oi' }), () => r.webhooks.edit('50', 'secret', 'novo'),
  () => r.webhooks.edit('50', null, 'novo'), () => r.webhooks.delete('50', 'secret'), () => r.webhooks.delete('50', null),
];

test('todas as mutações de cargos, canais e webhooks exigem autor e bot', async () => {
  for (const denied of ['1', '999']) {
    const f = fixture();
    f.transport.setMember('100', { id: denied, owner: false, permissions: 0n, rank: 100 });
    for (const action of mutations(f.resources)) await assert.rejects(action(), GuardError);
    assert.deepEqual(f.calls, []);
  }
  const f = fixture();
  for (const action of mutations(f.resources)) await action();
  assert.equal(f.calls.length, 20);
});

test('contexto aplica os mesmos guards em JS e scripts; $try não engole recusa', async () => {
  const f = fixture();
  f.transport.setMember('100', { id: '1', owner: false, rank: 100, permissions: 0n });
  const ctx = new CommandContext({ message: mockMessage('!test'), transport: f.transport, store: new MemoryStore(),
    command: { name: 'test' }, cooldown: () => 0, resources: f.raw });
  await assert.rejects(ctx.resources.roles.add('100', '2', '10'), GuardError);
  const runtime = registerBuiltins(new Runtime());
  for (const script of ['$try[$addRole[2;10];ignorado]', '$try[$deleteChannel[200];ignorado]', '$try[$sendWebhook[50;secret;oi];ignorado]']) {
    await assert.rejects(runtime.execute(runtime.compile(script), ctx), GuardError);
  }
  assert.deepEqual(f.calls, []);
  await f.raw.roles.add('100', '2', '10');
  assert.deepEqual(f.calls, ['role.add']);
});

test('hierarquia protege cargos gerenciados, everyone, posições e membros', async () => {
  for (const patch of [{ managed: true }, { managed: undefined }, { id: '100' }, { position: 90 }]) {
    const f = fixture(); f.role(patch);
    for (const action of [() => f.resources.roles.add('100', '2', '10'), () => f.resources.roles.remove('100', '2', '10'),
      () => f.resources.roles.edit('100', '10', { name: 'novo' }), () => f.resources.roles.delete('100', '10'),
      () => f.resources.roles.move('100', '10', 1)]) await assert.rejects(action(), GuardError);
    assert.deepEqual(f.calls, []);
  }
  const f = fixture();
  f.transport.setMember('100', { id: '1', owner: false, permissions: PermissionFlags.ManageRoles, rank: 4 });
  await assert.rejects(f.resources.roles.delete('100', '10'), GuardError);
  f.transport.setMember('100', { id: '1', owner: true, permissions: PermissionFlags.Administrator, rank: 100 });
  await assert.rejects(f.resources.roles.move('100', '10', 90), GuardError);
  for (const patch of [{ owner: true, rank: 1 }, { owner: false, rank: 90 }]) {
    f.transport.setMember('100', { id: '2', permissions: 0n, ...patch });
    await assert.rejects(f.resources.roles.add('100', '2', '10'), GuardError);
    await assert.rejects(f.resources.roles.remove('100', '2', '10'), GuardError);
  }
  assert.deepEqual(f.calls, []);
});

test('cargos e overwrites não concedem permissões ausentes nem operam fora do servidor', async () => {
  const f = fixture();
  f.transport.setMember('100', { id: '1', owner: false, rank: 100, permissions: PermissionFlags.ManageRoles });
  await assert.rejects(f.resources.roles.create('100', { name: 'novo', permissions: ['BanMembers'] }), GuardError);
  await assert.rejects(f.resources.roles.edit('100', '10', { permissions: ['Administrator'] }), GuardError);
  f.role({ permissions: PermissionFlags.Administrator.toString() });
  await assert.rejects(f.resources.roles.add('100', '2', '10'), GuardError);
  await assert.rejects(f.resources.channels.overwrite('200', '10', { type: 'role', allow: ['SendMessages'] }), GuardError);
  await assert.rejects(f.resources.roles.delete('101', '10'), GuardError);
  f.channel({ guildID: '101' });
  for (const action of mutations(f.resources).slice(7, 13)) await assert.rejects(action(), GuardError);
  f.webhook({ guildID: '101' });
  await assert.rejects(f.resources.webhooks.send('50', 'secret', { content: 'oi' }), GuardError);
  assert.deepEqual(f.calls, []);
});

test('permissões locais de autor e bot prevalecem sobre permissões globais', async () => {
  for (const denied of ['1', '999']) {
    const f = fixture();
    const member = f.transport.member.bind(f.transport);
    f.transport.member = async (guildID: string, id: string, channelID?: string): Promise<ModerationMember> => {
      const result = await member(guildID, id);
      return channelID && id === denied ? { ...result, owner: false, permissions: 0n } : result;
    };
    for (const action of mutations(f.resources).slice(7)) await assert.rejects(action(), GuardError);
    assert.deepEqual(f.calls, []);
  }
});

test('wrappers SDK validam lotes antes da rede e preservam falha parcial', async t => {
  const client = new Client(); t.after(() => client.destroy());
  let preloadCalls = 0, guildCalls = 0;
  Reflect.set(client, 'preloadMessages', async (ids: string[]) => { preloadCalls++; assert.deepEqual(ids, ['200', '201']); return { '200': null }; });
  Reflect.set(client.guilds, 'resolve', async () => { guildCalls++; return {
    createEmojisBulk: async (input: unknown) => {
      assert.deepEqual(input, [{ name: 'ok', image: 'aGk=' }]);
      return { success: [{ id: '10', name: 'ok', animated: false, url: 'https://cdn/ok' }], failed: [{ name: 'bad', error: 'full' }] };
    },
  }; });
  const resources = new FluxerResources(client);
  assert.deepEqual(await resources.messages.preload(['200', '201', '200']), { '200': null, '201': null });
  for (const ids of [[], ['x'], Array.from({ length: 101 }, () => '1')]) await assert.rejects(resources.messages.preload(ids));
  assert.equal(preloadCalls, 1);
  assert.deepEqual(await resources.expressions.createEmojisBulk('100', [{ name: 'ok', image: 'aGk=' }]), {
    success: [{ id: '10', name: 'ok', animated: false, url: 'https://cdn/ok' }], failed: [{ name: 'bad', error: 'full' }],
  });
  for (const input of [[], [{ name: 'x', image: 'aGk=' }], [{ name: 'ok', image: '??' }],
    [{ name: 'ok', image: 'aGk=' }, { name: 'ok', image: 'aGk=' }], [{ name: 'ok', image: 'a'.repeat(13_333_336) }]]) {
    await assert.rejects(resources.expressions.createEmojisBulk('100', input));
  }
  assert.equal(guildCalls, 1);
  const f = fixture();
  const result = await f.resources.expressions.createEmojisBulk('100', [{ name: 'xx', image: 'aGk=' }]);
  assert.deepEqual(result.failed, [{ name: 'xx', error: 'full' }]);
  f.transport.setMember('100', { id: '1', owner: false, rank: 100, permissions: 0n });
  await assert.rejects(f.resources.expressions.createEmojisBulk('100', [{ name: 'xx', image: 'aGk=' }]), GuardError);
  assert.equal(f.calls.length, 1);
});


test('funções de lotes aceitam valores tipados e recusam lote inválido antes do port', async () => {
  const f = fixture();
  const preloads: string[][] = [];
  const raw = mockResources({ expressions: f.raw.expressions, messages: {
    preload: async ids => { preloads.push(ids); return { '200': null }; },
  } });
  const ctx = new CommandContext({ message: mockMessage('!test'), command: { name: 'test' },
    transport: f.transport, store: new MemoryStore(), cooldown: () => 0, resources: raw });
  const runtime = registerBuiltins(new Runtime());
  const run = (source: string) => runtime.execute(runtime.compile(source), ctx);
  assert.deepEqual(await run('$preloadMessages[$split[200,200;,]]'), { '200': null });
  assert.deepEqual(preloads, [['200']]);
  assert.deepEqual(await run('$createEmojisBulk[$array[$object[name;xx;image;aGk=]]]'), {
    success: [], failed: [{ name: 'xx', error: 'full' }],
  });
  await assert.rejects(run('$preloadMessages[$split[200,x;,]]'), /IDs de canais/);
  await assert.rejects(run('$createEmojisBulk[$array[$object[name;xx;image;invalid]]]'), /base64/);
  assert.equal(preloads.length, 1);
  assert.deepEqual(f.calls, ['emoji.bulk']);
});

test('recursos herdados são preservados e mutações usam o ID autorizado em vez do nome', async () => {
  const base = mockResources({ roles: { resolve: async () => role, list: async () => [role],
    add: async (_guild, _user, query) => { checked.push(query); },
    remove: async (_guild, _user, query) => { checked.push(query); },
    edit: async (_guild, query) => { checked.push(query); return role; },
    delete: async (_guild, query) => { checked.push(query); },
    move: async (_guild, query) => { checked.push(query); },
  } });
  const checked: string[] = [];
  const inherited = Object.create(base) as typeof base;
  const bound = bindAuthorizedResources(inherited, new MockTransport(), { guildID: '100', authorID: '1' });
  for (const area of ['users', 'messages', 'collectors', 'threads', 'invites'] as const) assert.equal(bound[area], base[area]);
  await bound.roles.add('100', '2', 'membro');
  await bound.roles.remove('100', '2', 'membro');
  await bound.roles.edit('100', 'membro', { name: 'renamed' });
  await bound.roles.delete('100', 'membro');
  await bound.roles.move('100', 'membro', 2);
  assert.deepEqual(checked, ['10', '10', '10', '10', '10']);
});
