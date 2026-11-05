import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlags } from '@fluxerjs/core';
import { readFile } from 'node:fs/promises';
import { CommandContext } from '../src/commands/context.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import { bindAuthorizedResources } from '../src/services/resource-authorization.js';
import { GuardError } from '../src/shared/errors.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
import type { ChannelInfo } from '../src/ports/resources/channels.js';
import * as sdk from '../src/sdk.js';
import * as sdkTypes from '../src/sdk/types.js';

const channel: ChannelInfo = { id: '200', name: 'geral', guildID: '100', type: 0, parentID: null,
  position: 0, topic: null, slowmode: 0, nsfw: false };

function member(id: string, permissions: bigint) {
  return { id, owner: false, rank: 5, topRoleID: '10', permissions };
}

function fixture(options: { author?: bigint; bot?: bigint; bulkDelete?: (ids: string[]) => Promise<string[]> } = {}) {
  const calls: string[][] = [];
  const transport = new MockTransport();
  transport.member = async (_guildID: string, id: string) =>
    member(id, id === transport.botID ? (options.bot ?? 0n) : (options.author ?? 0n)) as never;
  const source = mockResources({
    channels: { get: async () => channel },
    messages: {
      bulkDelete: async (_c: string, ids: string[]) => { calls.push(ids); return options.bulkDelete ? options.bulkDelete(ids) : ids; },
      bulkDeleteOwn: async () => { calls.push(['own']); },
      acknowledgePins: async () => { calls.push(['ack']); },
      clearReadState: async () => { calls.push(['read']); },
    },
  });
  const resources = bindAuthorizedResources(source, transport, { guildID: '100', authorID: '2' });
  return { resources, calls, transport };
}

const MANAGE = PermissionFlags.ManageMessages;

test('bulkDelete autorizado deduplica ids e devolve a resposta do SDK', async () => {
  const { resources, calls } = fixture({ author: MANAGE, bot: MANAGE });
  assert.deepEqual(await resources.messages.bulkDelete('200', ['5', '6', '5', '7']), ['5', '6', '7']);
  assert.deepEqual(calls, [['5', '6', '7']]);
});

test('bulkDelete exige ManageMessages do autor e do bot', async () => {
  await assert.rejects(fixture({ author: 0n, bot: MANAGE }).resources.messages.bulkDelete('200', ['5']), GuardError);
  await assert.rejects(fixture({ author: MANAGE, bot: 0n }).resources.messages.bulkDelete('200', ['5']), GuardError);
  const denied = fixture({ author: 0n, bot: 0n });
  await assert.rejects(denied.resources.messages.bulkDelete('200', ['5']), GuardError);
  assert.deepEqual(denied.calls, []);
});

test('bulkDelete recusa lote acima do máximo e lista vazia', async () => {
  const { resources, calls } = fixture({ author: MANAGE, bot: MANAGE });
  await assert.rejects(resources.messages.bulkDelete('200', Array.from({ length: 101 }, (_, i) => String(i))),
    { code: 'BULK_DELETE_LIMIT' });
  await assert.rejects(resources.messages.bulkDelete('200', []), GuardError);
  assert.deepEqual(calls, []);
});

test('bulkDelete propaga falha parcial do SDK sem repetir', async () => {
  const { resources } = fixture({ author: MANAGE, bot: MANAGE,
    bulkDelete: async () => { throw new Error('apagou 2 de 5'); } });
  await assert.rejects(resources.messages.bulkDelete('200', ['1', '2']), /apagou 2 de 5/);
});

test('recursos novos passam pela autorização de canal', async () => {
  const { resources, calls } = fixture({ author: PermissionFlags.SendMessages | PermissionFlags.ReadMessageHistory, bot: PermissionFlags.SendMessages | PermissionFlags.ReadMessageHistory });
  await resources.messages.bulkDeleteOwn('200');
  await resources.messages.acknowledgePins('200');
  await resources.messages.clearReadState('200');
  assert.deepEqual(calls, [['own'], ['ack'], ['read']]);
});

test('exports só-SDK existem como valores em yuzuha/sdk', async () => {
  const areas = JSON.parse(await readFile('scripts/parity-areas.json', 'utf8'));
  const surfaces = { sdk, 'sdk/types': sdkTypes } as Record<string, Record<string, unknown>>;
  for (const [group, entry] of Object.entries(areas.sdkOnly) as [string, { exports: string[]; via?: string }][]) {
    if (group === 'Sharding e cluster') continue;
    const surface = surfaces[entry.via ?? 'sdk'] ?? sdk;
    for (const name of entry.exports) {
      assert.equal(name in surface, true, `${name} (${group}) ausente em yuzuha/${entry.via ?? 'sdk'}`);
    }
  }
});

test('ctx.resources expõe os novos métodos com tipos de domínio', async () => {
  const calls: string[] = [];
  const transport = new MockTransport();
  transport.member = async (_g: string, id: string) => member(id, PermissionFlags.Administrator) as never;
  const ctx = new CommandContext({
    message: mockMessage('!x'), command: { name: 'x' }, store: new MemoryStore(),
    transport, cooldown: () => 0,
    resources: mockResources({
      channels: {
        get: async () => channel,
        sendTyping: async () => { calls.push('typing'); },
        slowmode: async () => 10,
        rtcRegions: async () => [{ id: 'br', name: 'Brasil', emoji: '🇧🇷' }],
      },
      users: { createDM: async (id: string) => ({ id: 'dm-' + id, name: '', type: 1, guildID: null,
        parentID: null, position: 0, topic: null, slowmode: 0, nsfw: false }) },
      cache: {
        sweepUsers: async () => 3, sweepChannels: async () => 2, sweepGuilds: async () => 1,
      },
    }),
  });
  await ctx.resources.channels.sendTyping('200');
  assert.equal(await ctx.resources.channels.slowmode('200'), 10);
  assert.equal((await ctx.resources.channels.rtcRegions('200'))[0]!.id, 'br');
  assert.equal((await ctx.resources.users.createDM('5')).id, 'dm-5');
  assert.equal(await ctx.resources.cache.sweepUsers(), 3);
  assert.equal(await ctx.resources.cache.sweepChannels(), 2);
  assert.equal(await ctx.resources.cache.sweepGuilds(), 1);
  assert.deepEqual(calls, ['typing']);
});

const groupDM: ChannelInfo = { ...channel, id: 'dm-1', guildID: null, type: 3, recipientIDs: ['2', '3'], ownerID: '2' };

function dmFixture(dm: ChannelInfo) {
  const calls: string[] = [];
  const transport = new MockTransport();
  const source = mockResources({
    channels: {
      get: async (id: string) => (id === dm.id ? dm : channel),
      addRecipient: async (_c: string, u: string) => { calls.push('add:' + u); },
      removeRecipient: async (_c: string, u: string, o?: { silent?: boolean }) => { calls.push('remove:' + u + ':' + (o?.silent === true)); },
    },
    messages: { purgeDM: async () => { calls.push('purge'); return 7; } },
    webhooks: {
      fetch: async () => ({ id: '50', name: 'logs', channelID: '200', guildID: '100', token: 'secret' }),
      editMessage: async (w: string, t: string, m: string, i: { content?: string }) => { calls.push('edit:' + m + ':' + i.content); return m; },
      deleteMessage: async (w: string, t: string, m: string) => { calls.push('del:' + m); },
    },
  });
  transport.member = async (_g: string, id: string) => member(id, PermissionFlags.Administrator) as never;
  return { resources: bindAuthorizedResources(source, transport, { guildID: '100', authorID: '2' }), calls };
}

test('webhooks editMessage/deleteMessage usam a autoridade do webhook', async () => {
  const { resources, calls } = dmFixture(groupDM);
  assert.equal(await resources.webhooks.editMessage('50', 'tok', '9', { content: 'novo' }), '9');
  await resources.webhooks.deleteMessage('50', 'tok', '9');
  assert.deepEqual(calls, ['edit:9:novo', 'del:9']);
});

test('addRecipient exige dono do grupo e participacao do autor', async () => {
  const { resources, calls } = dmFixture(groupDM);
  await resources.channels.addRecipient('dm-1', '4');
  assert.deepEqual(calls, ['add:4']);
  const nonOwner = dmFixture({ ...groupDM, ownerID: '3' });
  await assert.rejects(nonOwner.resources.channels.addRecipient('dm-1', '4'), GuardError);
  const outsider = dmFixture({ ...groupDM, recipientIDs: ['3'] });
  await assert.rejects(outsider.resources.channels.addRecipient('dm-1', '4'), GuardError);
  const guild = dmFixture(channel);
  await assert.rejects(guild.resources.channels.addRecipient('200', '4'), GuardError);
});

test('removeRecipient permite sair e restringe remocao de terceiros ao dono', async () => {
  const { resources, calls } = dmFixture(groupDM);
  await resources.channels.removeRecipient('dm-1', '4', { silent: true });
  assert.deepEqual(calls, ['remove:4:true']);
  const member = dmFixture({ ...groupDM, ownerID: '3' });
  await member.resources.channels.removeRecipient('dm-1', '2');
  assert.deepEqual(member.calls, ['remove:2:false']);
  await assert.rejects(member.resources.channels.removeRecipient('dm-1', '3'), GuardError);
});

test('purgeDM exige participacao e propaga a contagem', async () => {
  const { resources, calls } = dmFixture({ ...groupDM, type: 999 });
  assert.equal(await resources.messages.purgeDM('dm-1'), 7);
  assert.deepEqual(calls, ['purge']);
  const guild = dmFixture(channel);
  await assert.rejects(guild.resources.messages.purgeDM('200'), GuardError);
});

const threadChannel: ChannelInfo = { ...channel, id: 'th-1', type: 11 };

test('threads.setLocked exige ManageChannels do autor e do bot', async () => {
  const calls: string[] = [];
  const source = mockResources({
    channels: { get: async (id: string) => (id === 'th-1' ? threadChannel : channel) },
    threads: { setLocked: async (_t: string, l: boolean) => { calls.push('lock:' + l); } },
  });
  const transport = new MockTransport();
  const grant = PermissionFlags.ManageChannels;
  transport.member = async (_g: string, id: string) => member(id, id === transport.botID ? grant : grant) as never;
  const bound = bindAuthorizedResources(source, transport, { guildID: '100', authorID: '2' });
  await bound.threads.setLocked('th-1', true, 'motivo');
  assert.deepEqual(calls, ['lock:true']);
  transport.member = async (_g: string, id: string) => member(id, id === transport.botID ? grant : 0n) as never;
  await assert.rejects(bound.threads.setLocked('th-1', true), GuardError);
  transport.member = async (_g: string, id: string) => member(id, id === transport.botID ? 0n : grant) as never;
  await assert.rejects(bound.threads.setLocked('th-1', true), GuardError);
});

test('threads.editSelf so toca a propria associacao', async () => {
  const source = mockResources({
    channels: { get: async (id: string) => (id === 'th-1' ? threadChannel : channel) },
    threads: { editSelf: async (_t: string, i: { muted?: boolean }) =>
      ({ threadID: 'th-1', userID: '2', joinedTimestamp: 1, flags: i.muted ? 8 : 0 }) },
  });
  const transport = new MockTransport();
  transport.member = async (_g: string, id: string) => member(id, PermissionFlags.ViewChannel) as never;
  const bound = bindAuthorizedResources(source, transport, { guildID: '100', authorID: '2' });
  const self = await bound.threads.editSelf('th-1', { muted: true });
  assert.equal(self?.userID, '2');
});

test('editDefaults de canal e de forum exigem ManageChannels', async () => {
  const calls: string[] = [];
  const source = mockResources({
    channels: {
      get: async () => channel,
      editThreadDefaults: async () => { calls.push('chan-defaults'); },
      setDefaultForumLayout: async (_c: string, l: string | null) => { calls.push('layout:' + l); },
    },
    threads: { editDefaults: async () => { calls.push('thread-defaults'); } },
  });
  const transport = new MockTransport();
  const grant = PermissionFlags.ManageChannels;
  transport.member = async (_g: string, id: string) => member(id, grant) as never;
  const bound = bindAuthorizedResources(source, transport, { guildID: '100', authorID: '2' });
  await bound.channels.editThreadDefaults('200', { slowmode: 10 });
  await bound.channels.setDefaultForumLayout('200', 'list', 'motivo');
  await bound.threads.editDefaults('200', { slowmode: 10 });
  assert.deepEqual(calls, ['chan-defaults', 'layout:list', 'thread-defaults']);
  transport.member = async (_g: string, id: string) => member(id, 0n) as never;
  await assert.rejects(bound.channels.editThreadDefaults('200', {}), GuardError);
  await assert.rejects(bound.threads.editDefaults('200', {}), GuardError);
});

test('createStickersBulk valida lote e exige ManageExpressions', async () => {
  const calls: string[] = [];
  const source = mockResources({
    expressions: { createStickersBulk: async (_g: string, inputs: { name: string }[]) => {
      calls.push(...inputs.map(i => i.name));
      return { success: [], failed: [{ name: 'ruim', error: 'duplicado' }] };
    } },
  });
  const transport = new MockTransport();
  transport.member = async (_g: string, id: string) => member(id, PermissionFlags.ManageExpressions) as never;
  const bound = bindAuthorizedResources(source, transport, { guildID: '100', authorID: '2' });
  const result = await bound.expressions.createStickersBulk('100', [
    { name: 'ok', image: 'AAAA' }, { name: 'ruim', image: 'BBBB' }]);
  assert.deepEqual(result.failed, [{ name: 'ruim', error: 'duplicado' }]);
  assert.deepEqual(calls, ['ok', 'ruim']);
  transport.member = async (_g: string, id: string) => member(id, 0n) as never;
  await assert.rejects(bound.expressions.createStickersBulk('100', [{ name: 'x', image: 'AAAA' }]), GuardError);
});

test('discovery consulta e edita a candidatura do servidor', async () => {
  const calls: string[] = [];
  const source = mockResources({
    users: {
      discoveryStatus: async () => ({ application: null, eligible: true, minMemberCount: 1000 }),
      applyForDiscovery: async (_g: string, i: { primaryLanguage?: string }) => {
        calls.push('apply:' + i.primaryLanguage);
        return { guildID: '100', status: 'pending', description: '', categoryType: 0 };
      },
      editDiscoveryApplication: async () => { calls.push('edit'); return { guildID: '100', status: 'pending', description: '', categoryType: 0 }; },
    },
  });
  const bound = bindAuthorizedResources(source, new MockTransport(), { guildID: '100', authorID: '2' });
  assert.equal((await bound.users.discoveryStatus('100')).minMemberCount, 1000);
  await bound.users.applyForDiscovery('100', { primaryLanguage: 'pt-BR' });
  await bound.users.editDiscoveryApplication('100', { description: 'nova' });
  assert.deepEqual(calls, ['apply:pt-BR', 'edit']);
});