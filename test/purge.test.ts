import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, PermissionFlags } from '@fluxerjs/core';
import { CommandContext } from '../src/commands/context.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import { createMessagesResources } from '../src/infrastructure/fluxer/resources/messages.js';
import { bindAuthorizedResources } from '../src/services/resource-authorization.js';
import { GuardError, YuzuhaError } from '../src/shared/errors.js';
import { createTestBot, MockTransport, mockMessage, mockResources } from '../src/testing.js';
import type { ChannelInfo } from '../src/ports/resources/channels.js';
import type { PurgeResult } from '../src/ports/resources/messages.js';

const channel: ChannelInfo = { id: '200', name: 'geral', guildID: '100', type: 0, parentID: null,
  position: 0, topic: null, slowmode: 0, nsfw: false };
const MANAGE = PermissionFlags.ManageMessages;

function member(id: string, permissions: bigint) {
  return { id, owner: false, rank: 5, topRoleID: '10', permissions };
}

function message(id: string, authorID: string) {
  return { id, author: { id: authorID } };
}

/** Adapter com client offline: o canal e as rotas REST são substituídos por simulados. */
function adapterFixture(options: {
  pages?: Map<string, ReturnType<typeof message>>[];
  bulkDelete?: (ids: string[]) => Promise<string[]>;
  missingBulk?: boolean;
  perID?: (id: string) => Promise<void>;
} = {}) {
  const client = new Client();
  const fetched: unknown[] = [];
  const bulk: string[][] = [];
  const each: string[] = [];
  const pages = [...(options.pages ?? [])];
  const channelMock: Record<string, unknown> = {
    isTextBased: () => true,
    messages: {
      fetch: async (input: { limit: number; before?: string }) => {
        fetched.push(input);
        return pages.shift() ?? new Map();
      },
    },
  };
  if (!options.missingBulk) {
    channelMock.bulkDelete = async (ids: string[]) => {
      bulk.push([...ids]);
      return options.bulkDelete ? options.bulkDelete(ids) : ids;
    };
  }
  Reflect.set(client.channels, 'fetch', async () => channelMock);
  Reflect.set(client.rest, 'delete', async (route: string) => {
    const id = /messages\/(\d+)$/.exec(route)?.[1]!;
    each.push(id);
    if (options.perID) await options.perID(id);
  });
  return { client, resources: createMessagesResources(client), fetched, bulk, each };
}

test('purge lista mensagens, filtra autor, exclui include e apaga em lote', async t => {
  const { client, resources, bulk } = adapterFixture({
    pages: [new Map([
      ['500', message('500', '7')], ['499', message('499', '8')],
      ['498', message('498', '7')], ['497', message('497', '7')],
    ])],
  });
  t.after(() => client.destroy());
  const result = await resources.purge('200', { limit: 4, authorID: '7', include: ['600'] });
  assert.deepEqual(bulk, [['600', '500', '498', '497']]);
  assert.deepEqual(result.deletedIDs, ['600', '500', '498', '497']);
  assert.equal(result.deleted, 3);
  assert.equal(result.via, 'bulk');
});

test('purge pagina a listagem até atingir o limite', async t => {
  const pages = [
    new Map(Array.from({ length: 100 }, (_, i) => [String(1000 - i), message(String(1000 - i), '7')])),
    new Map(Array.from({ length: 50 }, (_, i) => [String(900 - i), message(String(900 - i), '7')])),
  ];
  const { client, resources, fetched, bulk } = adapterFixture({ pages });
  t.after(() => client.destroy());
  const result = await resources.purge('200', { limit: 150 });
  assert.deepEqual(fetched.map(input => (input as { limit: number }).limit), [100, 50]);
  assert.equal(bulk.length, 2);
  assert.equal(result.deleted, 150);
  assert.equal(result.deletedIDs.length, 150);
});

test('purge recua para exclusão individual em falha de rota e mantém deleted sem includes', async t => {
  const { client, resources, each } = adapterFixture({
    pages: [new Map([['500', message('500', '7')], ['499', message('499', '7')]])],
    bulkDelete: async () => { throw Object.assign(new Error('Sem rota'), { status: 405 }); },
  });
  t.after(() => client.destroy());
  const result = await resources.purge('200', { limit: 2, include: ['600', '500'] });
  assert.deepEqual(each, ['600', '500', '499']);
  assert.deepEqual(result.deletedIDs, ['600', '500', '499']);
  assert.equal(result.deleted, 1);
  assert.equal(result.via, 'each');
});

test('purge propaga falha comum do lote sem recuar e falhas por id no fallback', async t => {
  const partial = adapterFixture({
    pages: [new Map([['500', message('500', '7')], ['499', message('499', '7')]])],
    bulkDelete: async () => { throw new Error('apagou 1 de 3'); },
  });
  t.after(() => partial.client.destroy());
  await assert.rejects(partial.resources.purge('200', { limit: 2 }), /apagou 1 de 3/);
  assert.deepEqual(partial.each, []);

  const perID = adapterFixture({
    pages: [new Map([['500', message('500', '7')]])],
    bulkDelete: async () => { throw Object.assign(new Error('Sem rota'), { status: 404 }); },
    perID: async id => { if (id === '500') throw new Error('permissão perdida'); },
  });
  t.after(() => perID.client.destroy());
  await assert.rejects(perID.resources.purge('200', { limit: 1 }), /permissão perdida/);
  assert.deepEqual(perID.each, ['500']);
});

test('purge valida a entrada e ignora includes fora do formato', async t => {
  const { client, resources } = adapterFixture();
  t.after(() => client.destroy());
  await assert.rejects(resources.purge('200', { limit: 0 }), YuzuhaError);
  await assert.rejects(resources.purge('200', { limit: 1001 }), YuzuhaError);
  await assert.rejects(resources.purge('200', { limit: 1, include: ['abc'] }), YuzuhaError);
  await assert.rejects(resources.purge('200', { limit: 1, extra: 1 } as never), YuzuhaError);
});

test('bulkDelete com fallback each repete por mensagem em falha de rota', async t => {
  const { client, resources, each } = adapterFixture({
    bulkDelete: async () => { throw Object.assign(new Error('Sem rota'), { status: 404 }); },
  });
  t.after(() => client.destroy());
  assert.deepEqual(await resources.bulkDelete('200', ['10', '11'], { fallback: 'each' }), ['10', '11']);
  assert.deepEqual(each, ['10', '11']);
});

test('bulkDelete sem fallback propaga a falha e rejeita fallback inválido', async t => {
  const { client, resources, each } = adapterFixture({
    bulkDelete: async () => { throw Object.assign(new Error('Sem rota'), { status: 404 }); },
  });
  t.after(() => client.destroy());
  await assert.rejects(resources.bulkDelete('200', ['10']), /Sem rota/);
  assert.deepEqual(each, []);
  await assert.rejects(resources.bulkDelete('200', ['10'], { fallback: 'all' } as never), { code: 'BULK_DELETE_OPTIONS' });
});

function authorized(options: { author?: bigint; bot?: bigint; purge?: (input: unknown) => Promise<PurgeResult>;
  guildID?: string; channelGuild?: string | null } = {}) {
  const calls: unknown[] = [];
  const transport = new MockTransport();
  transport.member = async (_guildID: string, id: string) =>
    member(id, id === transport.botID ? (options.bot ?? 0n) : (options.author ?? 0n)) as never;
  const source = mockResources({
    channels: { get: async () => ({ ...channel, guildID: options.channelGuild === undefined ? '100' : options.channelGuild }) },
    messages: {
      purge: async (_c: string, input: unknown) => {
        calls.push(input);
        return options.purge ? options.purge(input) : { deleted: 2, deletedIDs: ['9', '8'], via: 'bulk' } as PurgeResult;
      },
      bulkDelete: async (_c: string, ids: string[], fallback?: unknown) => { calls.push([ids, fallback]); return ids; },
    },
  });
  return { resources: bindAuthorizedResources(source, transport, { guildID: options.guildID ?? '100', authorID: '2' }), calls };
}

test('purge autorizado exige ManageMessages do autor e do bot e restringe ao servidor', async () => {
  const { resources, calls } = authorized({ author: MANAGE, bot: MANAGE });
  assert.deepEqual(await resources.messages.purge('200', { limit: 2 }), { deleted: 2, deletedIDs: ['9', '8'], via: 'bulk' });
  assert.deepEqual(calls, [{ limit: 2 }]);
  await assert.rejects(authorized({ author: 0n, bot: MANAGE }).resources.messages.purge('200', { limit: 1 }), GuardError);
  await assert.rejects(authorized({ author: MANAGE, bot: 0n }).resources.messages.purge('200', { limit: 1 }), GuardError);
  await assert.rejects(authorized({ author: MANAGE, bot: MANAGE, channelGuild: '999' }).resources.messages.purge('200', { limit: 1 }), GuardError);
  await assert.rejects(authorized({ author: MANAGE, bot: MANAGE, guildID: '' }).resources.messages.purge('200', { limit: 1 }),
    (error: unknown) => error instanceof GuardError && error.reason === 'NOT_IN_GUILD');
  await assert.rejects(authorized({ author: MANAGE, bot: MANAGE, channelGuild: null }).resources.messages.purge('200', { limit: 1 }), GuardError);
});

test('bulkDelete autorizado repassa o fallback ao recurso', async () => {
  const { resources, calls } = authorized({ author: MANAGE, bot: MANAGE });
  await resources.messages.bulkDelete('200', ['5'], { fallback: 'each' });
  assert.deepEqual(calls, [[['5'], { fallback: 'each' }]]);
});

test('ctx.purge inclui a mensagem do comando e devolve deleted sem ela', async () => {
  let input: unknown;
  const fixture = createTestBot({ prefix: '!',
    resources: {
      channels: { get: async () => channel },
      messages: { purge: async (_c: string, i: unknown) => { input = i; return { deleted: 4, deletedIDs: ['x', '1', '2', '3', '4'], via: 'bulk' }; } },
    },
    commands: [{ name: 'purge', run: async ctx => {
      const result = await ctx.purge(4, { of: '7' });
      await ctx.send(`apagadas=${result.deleted} via=${result.via}`);
    } }] });
  try {
    await fixture.send('!purge');
    assert.deepEqual(input, { limit: 4, authorID: '7', include: ['1'] });
    assert.deepEqual(fixture.messages[0]!.payload, { content: 'apagadas=4 via=bulk' });
  } finally { await fixture.destroy(); }
});

test('ctx.purge valida a contagem antes de tocar os recursos', async () => {
  let calls = 0;
  const ctx = new CommandContext({ message: mockMessage('!x'), command: { name: 'x' },
    store: new MemoryStore(), transport: new MockTransport(), cooldown: () => 0,
    resources: mockResources({ messages: { purge: async () => { calls++; return { deleted: 0, deletedIDs: [], via: 'bulk' }; } } }) });
  for (const count of [0, -1, 1.5, 1001, Number.NaN]) {
    await assert.rejects(ctx.purge(count), (error: unknown) =>
      error instanceof GuardError && error.reason === 'INVALID_ARGUMENT');
  }
  assert.equal(calls, 0);
});

test('ctx.purge recusa fora de servidor', async () => {
  const ctx = new CommandContext({ message: mockMessage('!x', { guildID: undefined }), command: { name: 'x' },
    store: new MemoryStore(), transport: new MockTransport(), cooldown: () => 0,
    resources: mockResources({ channels: { get: async () => channel } }) });
  await assert.rejects(ctx.purge(2), (error: unknown) =>
    error instanceof GuardError && error.reason === 'NOT_IN_GUILD');
});
