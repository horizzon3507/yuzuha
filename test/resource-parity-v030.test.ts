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
  for (const [group, entry] of Object.entries(areas.sdkOnly) as [string, { exports: string[] }][]) {
    if (group === 'Sharding e cluster') continue;
    for (const name of entry.exports) {
      assert.equal(name in sdk, true, `${name} (${group}) ausente em yuzuha/sdk`);
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
