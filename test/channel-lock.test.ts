import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlags } from '@fluxerjs/core';
import { GuardError } from '../src/shared/errors.js';
import { createChannelsResources } from '../src/infrastructure/fluxer/resources/channels.js';
import { bindAuthorizedResources } from '../src/services/resource-authorization.js';
import { MockTransport, mockResources } from '../src/testing.js';
import type { ChannelInfo } from '../src/ports/resources/channels.js';
import type { Client } from '@fluxerjs/core';

interface FakeEdit { targetID: string; options: { allow?: unknown; deny?: unknown } }
function fakeChannel(kind: 'text' | 'voice' | 'category' = 'text', existing?: { allow: bigint; deny: bigint }) {
  const edits: FakeEdit[] = [];
  const cache = new Map<string, { allow: { bitfield: bigint }; deny: { bitfield: bigint } }>();
  if (existing) cache.set('100', { allow: { bitfield: existing.allow }, deny: { bitfield: existing.deny } });
  const channel = {
    id: '200', name: 'geral', guildId: '100', type: 0,
    isGuild: () => true, isText: () => kind === 'text', isVoice: () => kind === 'voice',
    permissionOverwrites: { cache, edit: async (targetID: string, options: FakeEdit['options']) => { edits.push({ targetID, options }); } },
  };
  const client = {
    channels: { fetch: async () => channel },
    guilds: { resolve: async () => ({ roles: { get: () => ({ id: '100' }) }, fetchRole: async () => ({ id: '100' }) }) },
  } as unknown as Client;
  return { channel, client, edits };
}
const bit = (name: keyof typeof PermissionFlags) => PermissionFlags[name];

test('merge preserva bits não relacionados do overwrite existente', async () => {
  const { client, edits } = fakeChannel('text', { allow: 0n, deny: bit('ViewChannel') });
  const channels = createChannelsResources(client);
  await channels.lock('200');
  const deny = edits[0]!.options.deny as bigint;
  assert.equal(deny & bit('ViewChannel'), bit('ViewChannel'));
  assert.equal(deny & bit('SendMessages'), bit('SendMessages'));
});

test('merge sem overwrite existente aplica só os bits pedidos', async () => {
  const { client, edits } = fakeChannel('text');
  await createChannelsResources(client).lock('200');
  assert.equal(edits[0]!.options.deny, bit('SendMessages'));
  assert.equal(edits[0]!.options.allow, 0n);
});

test('neutral limpa o bit de allow e deny', async () => {
  const { client, edits } = fakeChannel('text', { allow: bit('SendMessages'), deny: bit('SendMessages') });
  await createChannelsResources(client).unlock('200');
  assert.equal(edits[0]!.options.deny, 0n);
  assert.equal(edits[0]!.options.allow, 0n);
});

test('modo padrão (sem merge) permanece inalterado', async () => {
  const { client, edits } = fakeChannel('text', { allow: 0n, deny: bit('ViewChannel') });
  await createChannelsResources(client).overwrite('200', '10', { type: 'role', allow: ['SendMessages'] });
  assert.deepEqual(edits[0]!.options.allow, ['SendMessages']);
  assert.equal(edits[0]!.options.deny, undefined);
});

test('lock escolhe permissão por tipo de canal', async () => {
  const text = fakeChannel('text');
  assert.equal((await createChannelsResources(text.client).lock('200')).permission, 'SendMessages');
  const voice = fakeChannel('voice');
  assert.equal((await createChannelsResources(voice.client).lock('200')).permission, 'Connect');
});

test('tipo sem suporte e permissão inválida viram INVALID_ARGUMENT', async () => {
  const { client } = fakeChannel('category');
  const channels = createChannelsResources(client);
  await assert.rejects(channels.lock('200'), (e: unknown) => e instanceof GuardError && e.reason === 'INVALID_ARGUMENT');
  const text = fakeChannel('text');
  await assert.rejects(createChannelsResources(text.client).lock('200', { permission: 'Nope' }),
    (e: unknown) => e instanceof GuardError && e.reason === 'INVALID_ARGUMENT');
});

test('lock e unlock são idempotentes', async () => {
  const { client, edits } = fakeChannel('text', { allow: 0n, deny: 0n });
  const channels = createChannelsResources(client);
  await channels.lock('200');
  await channels.lock('200');
  assert.equal(edits[1]!.options.deny, edits[0]!.options.deny);
});

test('autor e bot sem ManageChannels são negados', async () => {
  const transport = new MockTransport();
  const channelInfo: ChannelInfo = { id: '200', name: 'geral', guildID: '100', type: 0, parentID: null,
    position: 0, topic: null, slowmode: 0, nsfw: false };
  const calls: string[] = [];
  const raw = mockResources({ channels: {
    get: async () => channelInfo,
    lock: async () => { calls.push('lock'); return { channelID: '200', targetID: '100', permission: 'SendMessages', locked: true }; },
    unlock: async () => { calls.push('unlock'); return { channelID: '200', targetID: '100', permission: 'SendMessages', locked: false }; },
  } });
  transport.member = async () => ({ id: '2', owner: false, permissions: 0n, rank: 5, topRoleID: '10' });
  const resources = bindAuthorizedResources(raw, transport, { guildID: '100', authorID: '2' });
  await assert.rejects(resources.channels.lock('200'),
    (e: unknown) => e instanceof GuardError && e.reason === 'PERMISSION_MISSING_AUTHOR');
});
