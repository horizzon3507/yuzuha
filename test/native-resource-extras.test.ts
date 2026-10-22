import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@fluxerjs/core';
import { CommandContext, FluxerResources, GuardError, HttpService, MemoryStore } from '../src/index.js';
import { Runtime, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
import type { MockResourceOverrides } from '../src/testing.js';

function harness(resources: MockResourceOverrides = {}, dm = false, http?: HttpService) {
  const ctx = new CommandContext({ message: mockMessage('!extras', dm ? { guildID: undefined } : {}),
    command: { name: 'extras', code: '' }, transport: new MockTransport(), store: new MemoryStore(),
    resources: mockResources(resources), cooldown: () => 0, http });
  const runtime = registerBuiltins(new Runtime());
  return { ctx, run: (code: string) => runtime.execute(runtime.compile(code), ctx) };
}

test('reações expõem canal, usuário, emoji e paginação sem perder argumentos', async () => {
  const calls: unknown[][] = [];
  const { run } = harness({ messages: {
    async removeReaction(...args) { calls.push(['remove', ...args]); },
    async clearReactions(...args) { calls.push(['clear', ...args]); },
    async reactionUsers(...args) { calls.push(['users', ...args]); return ['1', '2']; },
  } });
  assert.equal(await run('$removeReaction[m1;👍]'), '');
  await run('$removeReaction[m1;<:ok:10>;<@2>;300]');
  await run('$clearReactions[m1]');
  await run('$clearReactions[m1;👍;300]');
  assert.deepEqual(await run('$reactionUsers[m1;👍;2;1;300]'), ['1', '2']);
  assert.deepEqual(await run('$reactionUsers[m1;👍]'), ['1', '2']);
  assert.deepEqual(calls, [
    ['remove', '200', 'm1', '👍', undefined], ['remove', '300', 'm1', '<:ok:10>', '2'],
    ['clear', '200', 'm1', undefined], ['clear', '300', 'm1', '👍'],
    ['users', '300', 'm1', '👍', 2, '1'], ['users', '200', 'm1', '👍', 100, undefined],
  ]);
  for (const code of ['$removeReaction[;👍]', '$removeReaction[m1;]', '$clearReactions[ ]',
    '$reactionUsers[m1;👍;101]', '$reactionUsers[m1;👍;1.5]']) await assert.rejects(run(code));
  assert.equal(calls.length, 6);
});

test('membros de threads têm paginação, resolução de menção e validação antes dos efeitos', async () => {
  const calls: unknown[][] = [];
  const members = [{ threadID: 't1', userID: '2', joinedTimestamp: 123, flags: 0 }];
  const { run } = harness({ threads: {
    async addMember(...args) { calls.push(['add', ...args]); },
    async removeMember(...args) { calls.push(['remove', ...args]); },
    async members(...args) { calls.push(['members', ...args]); return members; },
  } });
  await run('$addThreadMember[t1;<@2>]');
  await run('$removeThreadMember[t1;2]');
  assert.deepEqual(await run('$threadMembers[t1;10;1]'), members);
  assert.deepEqual(calls, [['add', 't1', '2'], ['remove', 't1', '2'], ['members', 't1', 10, '1']]);
  await assert.rejects(run('$threadMembers[t1;0]'), /1 e 100/);
  await assert.rejects(run('$addThreadMember[;2]'), /thread/);
  await assert.rejects(run('$addThreadMember[t1;abc]'), GuardError);
  assert.equal(calls.length, 3);
});

test('mutações de expressões preservam motivo, base64, tags e descrição vazia', async () => {
  const calls: unknown[][] = [];
  const emoji = { id: '10', name: 'novo', animated: false, url: null };
  const sticker = { id: '20', name: 'novo', description: null, tags: 'a, b' };
  const { run } = harness({ expressions: {
    async editEmoji(...args) { calls.push(['emoji', ...args]); return emoji; },
    async createSticker(...args) { calls.push(['create', ...args]); return sticker; },
    async editSticker(...args) { calls.push(['edit', ...args]); return sticker; },
    async deleteSticker(...args) { calls.push(['delete', ...args]); },
  } });
  assert.deepEqual(await run('$editEmoji[10;novo;motivo]'), emoji);
  assert.deepEqual(await run('$createSticker[novo;aGVsbG8=;descrição;a,b;motivo]'), sticker);
  assert.deepEqual(await run('$editSticker[20;;;motivo]'), sticker);
  await run('$deleteSticker[20;motivo]');
  assert.deepEqual(calls, [
    ['emoji', '100', '10', 'novo', 'motivo'],
    ['create', '100', { name: 'novo', image: 'aGVsbG8=', description: 'descrição', tags: ['a', 'b'], reason: 'motivo' }],
    ['edit', '100', '20', { name: undefined, description: '', reason: 'motivo' }],
    ['delete', '100', '20', 'motivo'],
  ]);
  for (const code of ['$editEmoji[10;x]', '$createSticker[x;aGVsbG8=]', '$createSticker[novo;https://img/x]',
    '$createSticker[novo;????]', '$deleteSticker[ ]', `$editSticker[20;;${'x'.repeat(101)}]`]) await assert.rejects(run(code));
  assert.equal(calls.length, 4);
});

test('posição e categoria aceitam menções, posição zero e remoção de categoria', async () => {
  const calls: unknown[][] = [];
  const { run } = harness({
    channels: {
      async get(id) { return { id, name: 'geral', type: id === '300' ? 4 : 0, guildID: '100', parentID: null, position: 0, topic: null, slowmode: 0, nsfw: false }; },
      async move(...args) { calls.push(['channel', ...args]); },
      async setCategory(...args) {
        calls.push(['category', ...args]);
        return { id: '200', name: 'geral', type: 0, guildID: '100', parentID: args[1], position: 0, topic: null, slowmode: 0, nsfw: false };
      },
    },
    roles: { async resolve() { return { id: '10', name: 'membro', managed: false, position: 1, permissions: '0', color: 0, hoist: false, mentionable: false, unicodeEmoji: null }; }, async move(...args) { calls.push(['role', ...args]); } },
  });
  await run('$moveChannel[<#200>;0]');
  await run('$moveRole[<@&10>;2]');
  await run('$setCategory[200;<#300>;organizar]');
  await run('$setCategory[200;]');
  assert.deepEqual(calls, [['channel', '200', 0], ['role', '100', '10', 2],
    ['category', '200', '300', 'organizar'], ['category', '200', null, undefined]]);
  for (const code of ['$moveChannel[200;-1]', '$moveRole[10;1.5]', '$moveRole[10;9007199254740992]']) await assert.rejects(run(code));
  assert.equal(calls.length, 4);
});

test('novas operações de servidor recusam DMs antes de acessar recursos', async () => {
  const { run } = harness({}, true);
  for (const code of ['$addThreadMember[t1;2]', '$removeThreadMember[t1;2]', '$threadMembers[t1]',
    '$editEmoji[10;novo]', '$createSticker[novo;aGVsbG8=]', '$editSticker[20]', '$deleteSticker[20]',
    '$moveRole[10;1]', '$moveChannel[200;1]', '$setCategory[200;300]']) await assert.rejects(run(code), GuardError);
});

test('mockResources permite substituir só um método e identifica métodos ausentes', async () => {
  const { run, ctx } = harness({ messages: { async reactionUsers() { return ['2']; } } });
  assert.deepEqual(await run('$reactionUsers[m1;👍]'), ['2']);
  assert.throws(() => ctx.resources.messages.clearReactions('200', 'm1'), /Recurso simulado ausente: messages/);
});

test('adaptador de reações chama métodos do SDK e retorna IDs na ordem da API', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const calls: unknown[][] = [];
  const message = {
    async removeReaction(...args: unknown[]) { calls.push(['remove', ...args]); },
    async removeReactionEmoji(...args: unknown[]) { calls.push(['emoji', ...args]); },
    async removeAllReactions() { calls.push(['all']); },
    async fetchReactionUsers(...args: unknown[]) { calls.push(['users', ...args]); return [{ id: '2' }, { id: '1' }]; },
  };
  Reflect.set(client.channels, 'fetchMessage', async (channelID: string, messageID: string) => {
    assert.equal(channelID, '200'); assert.equal(messageID, 'm1'); return message;
  });
  const resources = new FluxerResources(client).messages;
  await resources.removeReaction('200', 'm1', '👍', '2');
  await resources.clearReactions('200', 'm1', '👍');
  await resources.clearReactions('200', 'm1');
  assert.deepEqual(await resources.reactionUsers('200', 'm1', '👍', 2, '0'), ['2', '1']);
  assert.deepEqual(calls, [['remove', '👍', '2'], ['emoji', '👍'], ['all'], ['users', '👍', { limit: 2, after: '0' }]]);
  await assert.rejects(resources.reactionUsers('200', 'm1', '👍', 101), /1 e 100/);
});

test('adaptador de threads pagina membros e arquiva/bloqueia em uma única requisição', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const calls: unknown[][] = [];
  const thread = {
    isThread: () => true,
    async edit(options: unknown) { calls.push(['edit', options]); },
    members: {
      async add(userID: string) { calls.push(['add', userID]); },
      async remove(userID: string) { calls.push(['remove', userID]); },
      async fetch(options: unknown) {
        calls.push(['fetch', options]);
        return [{ id: 't1', userId: '2', joinedAt: new Date(123), flags: 4 }];
      },
    },
  };
  Reflect.set(client.channels, 'fetch', async () => thread);
  const resources = new FluxerResources(client).threads;
  await resources.addMember('t1', '2');
  await resources.removeMember('t1', '2');
  assert.deepEqual(await resources.members('t1', 10, '1'), [{ threadID: 't1', userID: '2', joinedTimestamp: 123, flags: 4 }]);
  await resources.archive('t1', true, 'fechar');
  assert.deepEqual(calls, [['add', '2'], ['remove', '2'], ['fetch', { limit: 10, after: '1' }],
    ['edit', { archived: true, locked: true, reason: 'fechar' }]]);
  await assert.rejects(resources.members('t1', 0), /1 e 100/);
  Reflect.set(client.channels, 'fetch', async () => ({ isThread: () => false }));
  await assert.rejects(resources.addMember('200', '2'), /não é uma thread/);
});

test('adaptador de expressões edita e remove objetos do SDK preservando motivos', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const calls: unknown[][] = [];
  const emoji = { id: '10', name: 'antigo', animated: false, url: null,
    async edit(options: { name: string }) { calls.push(['emoji', options]); return { ...this, name: options.name }; } };
  const sticker = { id: '20', name: 'antigo', description: 'texto', tags: ['a'],
    async edit(options: { description?: string }) { calls.push(['sticker', options]); return { ...this, ...options }; },
    async delete(reason?: string) { calls.push(['delete', reason]); } };
  const guild = {
    async fetchEmoji(id: string) { assert.equal(id, '10'); return emoji; },
    async fetchEmojis() { return [emoji]; },
    async fetchSticker(id: string) { assert.equal(id, '20'); return sticker; },
    async fetchStickers() { return [sticker]; },
    async createSticker(input: unknown) { calls.push(['create', input]); return sticker; },
  };
  Reflect.set(client.guilds, 'resolve', async () => guild);
  const resources = new FluxerResources(client).expressions;
  assert.equal((await resources.editEmoji('100', '<:antigo:10>', 'novo', 'renomear')).name, 'novo');
  assert.equal((await resources.editSticker('100', 'antigo', { description: '', reason: 'limpar' })).description, null);
  await resources.createSticker('100', { name: 'novo', image: 'aGVsbG8=', tags: ['a'] });
  await resources.deleteSticker('100', '20', 'apagar');
  assert.deepEqual(calls, [['emoji', { name: 'novo', reason: 'renomear' }],
    ['sticker', { description: '', reason: 'limpar' }], ['create', { name: 'novo', image: 'aGVsbG8=', tags: ['a'] }], ['delete', 'apagar']]);
});

test('resolução por IDs de emoji/sticker e por nome de cargo preserva falhas do SDK sem repetir', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const error = new Error('rate limit ou conexão');
  const calls: string[] = [];
  Reflect.set(client.guilds, 'resolve', async () => ({
    async fetchEmoji() { calls.push('emoji'); throw error; },
    async fetchSticker() { calls.push('sticker'); throw error; },
    async resolveRoleId() { calls.push('role'); throw error; },
  }));
  const resources = new FluxerResources(client);
  await assert.rejects(resources.expressions.emoji('100', '10'), cause => cause === error);
  await assert.rejects(resources.expressions.sticker('100', '20'), cause => cause === error);
  await assert.rejects(resources.roles.resolve('100', 'Mod'), cause => cause === error);
  assert.deepEqual(calls, ['emoji', 'sticker', 'role']);
});

test('adaptador move cargos/canais e valida categoria e servidor antes da edição', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const calls: unknown[][] = [];
  const channel = { id: '200', guildId: '100', name: 'geral', type: 0,
    isGuild: () => true,
    async edit(input: { parentId: string | null; reason?: string }) { calls.push(['edit', input]); return { ...this, parentId: input.parentId }; } };
  let parentGuildID = '100';
  Reflect.set(client.channels, 'fetch', async (id: string) => id === '200' ? channel : {
    guildId: parentGuildID, isGuild: () => true, isCategory: () => true,
  });
  Reflect.set(client.guilds, 'resolve', async () => ({
    roles: new Map([['10', { id: '10' }]]), async resolveRoleId() { return '10'; },
    async setRolePositions(input: unknown) { calls.push(['roles', input]); },
    async setChannelPositions(input: unknown) { calls.push(['channels', input]); },
  }));
  const resources = new FluxerResources(client);
  await resources.roles.move('100', 'Mod', 2);
  await resources.channels.move('200', 0);
  assert.equal((await resources.channels.setCategory('200', '300', 'mover')).parentID, '300');
  assert.equal((await resources.channels.setCategory('200', null)).parentID, null);
  parentGuildID = 'outro';
  await assert.rejects(resources.channels.setCategory('200', '300'), /mesmo servidor/);
  await assert.rejects(resources.channels.move('200', -1), /Posição/);
  await assert.rejects(resources.roles.move('100', 'Mod', 1.5), /Posição/);
  assert.deepEqual(calls, [['roles', [{ id: '10', position: 2 }]], ['channels', [{ id: '200', position: 0 }]],
    ['edit', { parentId: '300', reason: 'mover' }], ['edit', { parentId: null, reason: undefined }]]);
});

test('createEmoji baixa bytes e envia base64 ao SDK sem corromper a imagem', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 255, 0]);
  let image: string | undefined;
  const { run } = harness({ expressions: {
    async createEmoji(guildID, name, base64) {
      assert.equal(guildID, '100'); image = base64;
      return { id: '10', name, animated: false, url: null };
    },
  } }, false, new HttpService({ fetch: async () => new Response(bytes) }));
  assert.equal((await run('$createEmoji[novo;https://93.184.216.34/image.png]') as { name: string }).name, 'novo');
  assert.deepEqual(Buffer.from(image!, 'base64'), Buffer.from(bytes));
});

test('createEmoji recusa download sem sucesso e hosts privados antes de criar', async () => {
  let fetched = 0, created = 0;
  const { run } = harness({ expressions: {
    async createEmoji(_guildID, name) { created++; return { id: '10', name, animated: false, url: null }; },
  } }, false, new HttpService({ fetch: async () => { fetched++; return new Response('erro', { status: 403 }); } }));
  await assert.rejects(run('$createEmoji[novo;https://93.184.216.34/image.png]'), /HTTP 403/);
  await assert.rejects(run('$createEmoji[novo;http://127.0.0.1/image.png]'), /privado/);
  assert.equal(created, 0);
  assert.equal(fetched, 1);
});

test('mockResources preserva this em implementações com campos privados', async () => {
  class Messages {
    #count = 0;
    async reactionUsers() { return [String(++this.#count)]; }
  }
  const resources = mockResources({ messages: new Messages() });
  assert.deepEqual(await resources.messages.reactionUsers('200', '1', '👍'), ['1']);
  assert.deepEqual(await resources.messages.reactionUsers('200', '1', '👍'), ['2']);
});
