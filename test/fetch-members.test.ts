import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, Events } from '@fluxerjs/core';
import type { GuildMember, GuildMembersChunkPayload } from '@fluxerjs/core';
import { FluxerResources, MemoryStore, Yuzuha, defineCommand, isYuzuhaError } from '../src/index.js';
import type { GatewayMembersRequest } from '../src/index.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function fakeMember(id: string, username: string, overrides: Record<string, unknown> = {}): GuildMember {
  return {
    id,
    user: {
      id,
      username,
      globalName: username.toUpperCase(),
      bot: false,
      createdTimestamp: 1_000,
      avatarURL: () => null,
      bannerURL: () => null,
    },
    displayName: username.toUpperCase(),
    displayAvatarURL: () => null,
    bannerURL: () => null,
    nick: null,
    joinedAt: new Date(2_000),
    roles: { roleIds: ['r1'] },
    permissions: { bitfield: 8n },
    communicationDisabledUntil: null,
    ...overrides,
  } as unknown as GuildMember;
}

function setupGatewayClient(t: test.TestContext) {
  const client = new Client();
  t.after(() => client.destroy());
  const requests: Array<{
    guildId?: string;
    guildIds?: string[];
    query?: string;
    limit?: number;
    userIds?: string[];
    presences?: boolean;
    nonce?: string;
  }> = [];
  Reflect.set(client, 'requestGuildMembers', (payload: (typeof requests)[number]) => {
    requests.push(payload);
  });
  const gateway = new FluxerResources(client).gateway;
  return { client, requests, gateway };
}

test('gateway.fetchMembers consolida múltiplos chunks em ordem e fora de ordem sem listeners residuais', async t => {
  const { client, requests, gateway } = setupGatewayClient(t);

  // Chunks em ordem (0, 1, 2)
  const inOrderTask = gateway.fetchMembers({ guildID: 'g1', query: 'a', limit: 50, presences: true });
  assert.equal(requests.length, 1);
  const firstReq = requests[0]!;
  assert.equal(firstReq.guildId, 'g1');
  assert.equal(firstReq.query, 'a');
  assert.equal(firstReq.limit, 50);
  assert.equal(firstReq.presences, true);
  assert.equal(typeof firstReq.nonce, 'string');
  assert.ok(firstReq.nonce!.length > 0);
  assert.equal(client.listenerCount(Events.GuildMembersChunk), 1);

  const emitChunk = (payload: GuildMembersChunkPayload) => client.emit(Events.GuildMembersChunk, payload);

  // Ignora eventos sem nonce ou de outro servidor
  emitChunk({
    guildId: 'g1',
    members: [fakeMember('ignored-null', 'nullnonce')],
    chunkIndex: 0,
    chunkCount: 1,
    notFound: [],
    nonce: null,
  });
  emitChunk({
    guildId: 'other-guild',
    members: [fakeMember('ignored-guild', 'otherguild')],
    chunkIndex: 0,
    chunkCount: 1,
    notFound: [],
    nonce: firstReq.nonce!,
  });

  emitChunk({
    guildId: 'g1',
    members: [fakeMember('u1', 'ana')],
    chunkIndex: 0,
    chunkCount: 3,
    notFound: [],
    nonce: firstReq.nonce!,
  });
  emitChunk({
    guildId: 'g1',
    members: [fakeMember('u2', 'bia')],
    chunkIndex: 1,
    chunkCount: 3,
    notFound: [],
    nonce: firstReq.nonce!,
  });
  emitChunk({
    guildId: 'g1',
    members: [fakeMember('u3', 'caio')],
    chunkIndex: 2,
    chunkCount: 3,
    notFound: [],
    nonce: firstReq.nonce!,
  });

  const inOrder = await inOrderTask;
  assert.equal(inOrder.guildID, 'g1');
  assert.equal(inOrder.chunkCount, 3);
  assert.equal(inOrder.nonce, firstReq.nonce);
  assert.deepEqual(inOrder.members.map(member => member.id), ['u1', 'u2', 'u3']);
  assert.deepEqual(inOrder.notFound, []);
  assert.equal(client.listenerCount(Events.GuildMembersChunk), 0);

  // Chunks fora de ordem (2 chega primeiro, depois 0, depois 1) e defaults de query/limit
  const outOfOrderTask = gateway.fetchMembers({ guildID: 'g1' });
  const secondReq = requests[1]!;
  assert.equal(secondReq.query, '');
  assert.equal(secondReq.limit, 0);
  assert.notEqual(secondReq.nonce, firstReq.nonce);

  let resolvedEarly = false;
  void outOfOrderTask.then(() => { resolvedEarly = true; });

  emitChunk({
    guildId: 'g1',
    members: [fakeMember('u30', 'zoe')],
    chunkIndex: 2,
    chunkCount: 3,
    notFound: ['missing-2'],
    nonce: secondReq.nonce!,
  });
  await Promise.resolve();
  assert.equal(resolvedEarly, false, 'Não deve resolver ao receber o último índice antes dos anteriores');

  emitChunk({
    guildId: 'g1',
    members: [fakeMember('u10', 'leo')],
    chunkIndex: 0,
    chunkCount: 3,
    notFound: ['missing-1'],
    nonce: secondReq.nonce!,
  });
  emitChunk({
    guildId: 'g1',
    members: [fakeMember('u20', 'mia')],
    chunkIndex: 1,
    chunkCount: 3,
    notFound: ['missing-1'],
    nonce: secondReq.nonce!,
  });

  const outOfOrder = await outOfOrderTask;
  assert.deepEqual(outOfOrder.members.map(member => member.id), ['u10', 'u20', 'u30']);
  assert.deepEqual(outOfOrder.notFound, ['missing-1', 'missing-2']);
  assert.equal(client.listenerCount(Events.GuildMembersChunk), 0);
});

test('gateway.fetchMembers isola chamadas concorrentes por nonce e suporta userIDs + notFound', async t => {
  const { client, requests, gateway } = setupGatewayClient(t);

  const taskA = gateway.fetchMembers({ guildID: 'g1', userIDs: ['u1', 'u99'] });
  const taskB = gateway.fetchMembers({ guildID: 'g1', userIDs: ['u2', 'u98'], nonce: 'explicit-nonce-b' });

  assert.equal(requests.length, 2);
  assert.equal(requests[0]!.query, undefined);
  assert.equal(requests[0]!.limit, undefined);
  assert.deepEqual(requests[0]!.userIds, ['u1', 'u99']);
  assert.equal(requests[1]!.nonce, 'explicit-nonce-b');
  assert.notEqual(requests[0]!.nonce, requests[1]!.nonce);
  assert.equal(client.listenerCount(Events.GuildMembersChunk), 2);

  // Entrega intercalada entre B e A
  client.emit(Events.GuildMembersChunk, {
    guildId: 'g1',
    members: [fakeMember('u2', 'bruno')],
    chunkIndex: 0,
    chunkCount: 1,
    notFound: ['u98'],
    nonce: 'explicit-nonce-b',
  });

  const resultB = await taskB;
  assert.equal(client.listenerCount(Events.GuildMembersChunk), 1);
  assert.deepEqual(resultB.members.map(member => member.id), ['u2']);
  assert.deepEqual(resultB.notFound, ['u98']);

  client.emit(Events.GuildMembersChunk, {
    guildId: 'g1',
    members: [fakeMember('u1', 'alice')],
    chunkIndex: 0,
    chunkCount: 1,
    notFound: ['u99'],
    nonce: requests[0]!.nonce!,
  });

  const resultA = await taskA;
  assert.equal(client.listenerCount(Events.GuildMembersChunk), 0);
  assert.deepEqual(resultA.members.map(member => member.id), ['u1']);
  assert.deepEqual(resultA.notFound, ['u99']);
});

test('gateway.fetchMembers limpa listener e timer em timeout, AbortSignal, validação e erro síncrono', async t => {
  const { client, gateway } = setupGatewayClient(t);

  // Validações de entrada
  await assert.rejects(gateway.fetchMembers({ guildID: '' }), err => isYuzuhaError(err, 'GUILD_REQUIRED'));
  await assert.rejects(gateway.fetchMembers({ guildID: 'g1', timeoutMs: 0 }), err => isYuzuhaError(err, 'GATEWAY_TIMEOUT'));
  await assert.rejects(gateway.fetchMembers({ guildID: 'g1', timeoutMs: 200_000 }), err => isYuzuhaError(err, 'GATEWAY_TIMEOUT'));
  await assert.rejects(gateway.fetchMembers({ guildID: 'g1', limit: -1 }), err => isYuzuhaError(err, 'LIMIT'));
  await assert.rejects(gateway.fetchMembers({ guildID: 'g1', nonce: '   ' }), err => isYuzuhaError(err, 'GUILD_OPTIONS'));

  t.mock.timers.enable({ apis: ['setTimeout'] });
  const timedOut = assert.rejects(
    gateway.fetchMembers({ guildID: 'g1', timeoutMs: 25 }),
    err => isYuzuhaError(err, 'GATEWAY_TIMEOUT'),
  );
  t.mock.timers.tick(24);
  assert.equal(client.listenerCount(Events.GuildMembersChunk), 1);
  t.mock.timers.tick(1);
  await timedOut;
  assert.equal(client.listenerCount(Events.GuildMembersChunk), 0);

  // Signal já abortado antes da chamada
  const preAborted = new AbortController();
  preAborted.abort();
  await assert.rejects(
    gateway.fetchMembers({ guildID: 'g1', signal: preAborted.signal }),
    err => isYuzuhaError(err, 'ABORTED'),
  );
  assert.equal(client.listenerCount(Events.GuildMembersChunk), 0);

  // Signal abortado durante a espera de chunks
  const controller = new AbortController();
  const pending = gateway.fetchMembers({ guildID: 'g1', timeoutMs: 10_000, signal: controller.signal });
  assert.equal(client.listenerCount(Events.GuildMembersChunk), 1);
  controller.abort(new Error('cancelado manualmente'));
  await assert.rejects(
    pending,
    err => isYuzuhaError(err, 'ABORTED') && err.cause instanceof Error && err.cause.message === 'cancelado manualmente',
  );
  assert.equal(client.listenerCount(Events.GuildMembersChunk), 0);

  // Erro síncrono ao enviar opcode 8
  Reflect.set(client, 'requestGuildMembers', (_req: GatewayMembersRequest) => {
    throw new Error('gateway desconectado');
  });
  await assert.rejects(
    gateway.fetchMembers({ guildID: 'g1', timeoutMs: 10_000 }),
    /gateway desconectado/,
  );
  assert.equal(client.listenerCount(Events.GuildMembersChunk), 0);
});

test('CommandContext propaga ctx.signal para ctx.resources.gateway.fetchMembers', async t => {
  const { client } = setupGatewayClient(t);
  const bot = new Yuzuha({
    client,
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    variables: false,
    onError: () => {},
  });
  t.after(() => bot.destroy());

  let observedError: unknown;
  let started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });

  bot.command(defineCommand({
    name: 'membros',
    async run(ctx) {
      started();
      try {
        await ctx.resources.gateway.fetchMembers({ guildID: '100', timeoutMs: 30_000 });
      } catch (error) {
        observedError = error;
        throw error;
      }
    },
  }));

  const dispatchTask = bot.handle(mockMessage('!membros'));
  await entered;
  assert.equal(client.listenerCount(Events.GuildMembersChunk), 1);

  await bot.destroy();
  await dispatchTask;
  assert.equal(client.listenerCount(Events.GuildMembersChunk), 0);
  assert.ok(isYuzuhaError(observedError, 'ABORTED'));
});
