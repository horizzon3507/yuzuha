import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, PermissionFlags } from '@fluxerjs/core';
import { CommandContext, FluxerResources, GuardError, MemoryStore, PartialModerationError } from '../src/index.js';
import type { MemberInfo } from '../src/index.js';
import { Runtime, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
import type { MockResourceOverrides } from '../src/testing.js';

const member: MemberInfo = { id: '2', username: 'ana', displayName: 'Ana', bot: false, avatarURL: null, bannerURL: null,
  createdTimestamp: 0, nickname: null, joinedTimestamp: 0, roles: [], permissions: '0', timedOutUntil: null };
function harness(resources: MockResourceOverrides = {}, dm = false) {
  const transport = new MockTransport();
  const ctx = new CommandContext({ message: mockMessage('!test', dm ? { guildID: undefined } : {}), command: { name: 'test', code: '' },
    resources: mockResources(resources), transport, store: new MemoryStore(), cooldown: () => 0 });
  const runtime = registerBuiltins(new Runtime());
  return { ctx, transport, run: (source: string) => runtime.execute(runtime.compile(source), ctx) };
}

test('mensagens expõem DM, encaminhamento, busca e todos os cursores sem recompilar texto', async () => {
  const calls: unknown[][] = [];
  const page = { indexing: false, messages: [], total: 0, cursor: ['próxima'] };
  const { run } = harness({ messages: {
    async dm(...args) { calls.push(['dm', ...args]); return '500'; },
    async forward(...args) { calls.push(['forward', ...args]); return '501'; },
    async search(...args) { calls.push(['search', ...args]); return page; },
    async list(...args) { calls.push(['list', ...args]); return []; },
  } });
  assert.equal(await run('$dm[<@2>;olá]'), '500');
  assert.equal(await run('$forward[300;200;500]'), '501');
  assert.deepEqual(await run('$searchMessages[texto;200;10;$array[cursor];<@2>]'), page);
  await run('$messages[200;10;500]'); await run('$messages[200;10;;500]'); await run('$messages[200;10;;;500]');
  assert.deepEqual(calls, [['dm', '2', 'olá'], ['forward', '300', '200', '500'],
    ['search', { content: 'texto', channelID: '200', guildID: '100', limit: 10, cursor: ['cursor'], authorID: '2' }],
    ['list', '200', 10, { before: '500' }], ['list', '200', 10, { after: '500' }], ['list', '200', 10, { around: '500' }]]);
  await assert.rejects(run('$messages[200;10;1;2]'), /somente um cursor/);
  await assert.rejects(run('$searchMessages[texto;200;10;cursor]'), /array/);
  assert.equal(calls.length, 6);
});

test('anexos mistos são enviados em uma única chamada, preservando bytes e descrição', async () => {
  const calls: unknown[][] = [];
  const { run } = harness({ messages: {
    async sendAttachments(...args) { calls.push(args); return '500'; },
    async sendBytes(...args) { calls.push(args); return '501'; },
  } });
  assert.equal(await run('$sendAttachments[200;$array[$attachment[https://example.com/a.txt;a.txt];$fileBase64[AP8=;b.bin;binário]];olá]'), '500');
  const files = calls[0]![1] as { data?: Uint8Array; url?: string; name: string; description?: string }[];
  assert.equal(files[0]?.url, 'https://example.com/a.txt');
  assert.deepEqual([...files[1]!.data!], [0, 255]);
  assert.equal(files[1]?.description, 'binário');
  assert.equal(calls[0]?.[2], 'olá');
  assert.equal(await run('$sendFileBase64[200;AP8=;a.bin]'), '501');
  for (const source of ['$sendAttachments[200;$array]', '$fileBase64[??;a.bin]', '$fileBase64[AP8=; ]',
    '$sendAttachments[200;$array[$object[url;https://x;base64;AP8=;name;a]]]']) await assert.rejects(run(source));
  assert.equal(calls.length, 2);
});

test('apelidos compartilham autorização nativa/script e só executam uma mutação', async () => {
  const calls: unknown[][] = [];
  const { ctx, run } = harness({ users: { async setNickname(...args) { calls.push(args); return member; } } });
  assert.deepEqual(await ctx.members.setNickname('<@2>', 'Ana', 'ajuste'), member);
  assert.deepEqual(await run('$nickname[2;;remover]'), member);
  assert.deepEqual(calls, [['100', '2', 'Ana', 'ajuste'], ['100', '2', null, 'remover']]);
});

test('apelidos recusam autor/bot sem permissão, hierarquia, dono, DM e motivo inválido', async () => {
  for (const variant of ['author', 'bot', 'author-rank', 'bot-rank', 'owner', 'dm', 'reason'] as const) {
    let called = 0;
    const { ctx, transport, run } = harness({ users: { async setNickname() { called++; return member; } } }, variant === 'dm');
    if (variant === 'author') transport.setMember('100', { id: '1', owner: false, permissions: 0n, rank: 100 });
    if (variant === 'bot') transport.setMember('100', { id: '999', owner: false, permissions: 0n, rank: 90 });
    if (variant === 'author-rank') transport.setMember('100', { id: '1', owner: false, permissions: PermissionFlags.ManageNicknames, rank: 0 });
    if (variant === 'bot-rank') transport.setMember('100', { id: '999', owner: false, permissions: PermissionFlags.ManageNicknames, rank: 0 });
    if (variant === 'owner') transport.setMember('100', { id: '2', owner: true, permissions: 0n, rank: 1 });
    const reason = variant === 'reason' ? '' : 'ajuste';
    await assert.rejects(ctx.members.setNickname('2', 'Ana', reason), GuardError);
    await assert.rejects(run(`$try[$nickname[2;Ana;${reason}];fallback]`), GuardError);
    assert.equal(called, 0, variant);
  }
});

test('apelidos respeitam ChangeNickname para o próprio usuário e propagam falha parcial', async () => {
  const { ctx, transport, run } = harness({ users: { async setNickname() { return member; } } });
  transport.setMember('100', { id: '1', owner: false, permissions: PermissionFlags.ChangeNickname, rank: 10 });
  assert.deepEqual(await ctx.members.setNickname('1', 'eu', 'ajuste'), member);
  const partial = harness({ users: { async setNickname() { throw new PartialModerationError('nickname', '2', new Error('API')); } } });
  await assert.rejects(partial.run('$try[$nickname[2;Ana;motivo];fallback]'), PartialModerationError);
  await assert.rejects(run('$nickname[2;Ana;motivo]'), GuardError);
});

test('buscas de membros e threads preservam paginação e estado de indexação', async () => {
  const calls: unknown[][] = [];
  const members = { members: [], total: null, hasMore: false, indexing: true };
  const threads = { threads: [], total: null, hasMore: false, indexing: true, retryAfter: 2 };
  const { run } = harness({ users: { async searchMembers(...args) { calls.push(args); return members; } },
    threads: { async search(...args) { calls.push(args); return threads; } } });
  assert.deepEqual(await run('$searchMembers[Ana;10;20]'), members);
  assert.deepEqual(await run('$searchThreads[200;nome;10;20]'), threads);
  assert.deepEqual(calls, [['100', 'Ana', 10, 20], ['200', { name: 'nome', limit: 10, offset: 20 }]]);
  await assert.rejects(run('$searchThreads[200;nome;26]'), /25/);
});

test('gestão de servidor, convites, vanity, threads e clonagem chegam ao recurso correto', async () => {
  const calls: unknown[][] = [];
  const guild = { id: '100', name: 'novo', ownerID: '1', iconURL: null, bannerURL: null, memberCount: 1, createdTimestamp: 0 };
  const thread = { id: '300', name: 'novo', parentID: '200', archived: false, locked: true, messageCount: 0, ownerID: '1' };
  const { run } = harness({ users: { async editGuild(...args) { calls.push(['guild', ...args]); return guild; } },
    threads: {
      async edit(...args) { calls.push(['thread', ...args]); return thread; },
      async join(...args) { calls.push(['join', ...args]); }, async leave(...args) { calls.push(['leave', ...args]); },
    }, invites: {
      async list(...args) { calls.push(['invites', ...args]); return []; },
      async vanity(...args) { calls.push(['vanity', ...args]); return { code: 'nome', uses: 1 }; },
      async setVanity(...args) { calls.push(['set', ...args]); return { code: null, uses: 0 }; },
    }, expressions: {
      async cloneEmoji(...args) { calls.push(['emoji', ...args]); return { id: '4', name: 'ok', animated: false, url: null }; },
      async cloneSticker(...args) { calls.push(['sticker', ...args]); return { id: '5', name: 'ok', description: null, tags: null }; },
    },
  });
  assert.deepEqual(await run('$editGuild[$object[name;novo]]'), guild);
  assert.deepEqual(await run('$editThread[300;$object[locked;true;slowmode;1]]'), thread);
  await run('$joinThread[300]$leaveThread[300]$let[lista;$invites]$let[v;$vanity]$let[n;$setVanity[ ]]$let[e;$cloneEmoji[4]]$let[s;$cloneSticker[5]]');
  assert.deepEqual(calls, [['guild', '100', { name: 'novo' }], ['thread', '300', { locked: true, slowmode: 1 }],
    ['join', '300'], ['leave', '300'], ['invites', '100'], ['vanity', '100'], ['set', '100', null], ['emoji', '100', '4'], ['sticker', '100', '5']]);
  for (const source of ['$editGuild[$object[name;]]', '$editGuild[$object[unknown;1]]', '$editThread[300;$object[locked;texto]]', '$setVanity[a!]']) await assert.rejects(run(source));
  assert.equal(calls.length, 9);
});

test('operações novas de servidor exigem guild e mutações verificam autor e bot', async () => {
  const sources = ['$nickname[2;Ana;motivo]', '$searchMembers[Ana]', '$editGuild[$object[name;novo]]', '$editThread[300;$object[locked;true]]',
    '$joinThread[300]', '$leaveThread[300]', '$searchThreads[200]', '$invites', '$vanity', '$setVanity[nome]', '$cloneEmoji[4]', '$cloneSticker[5]'];
  const dm = harness({}, true);
  for (const source of sources) await assert.rejects(dm.run(source), GuardError);
  for (const actor of ['1', '999']) {
    const { run, transport } = harness();
    transport.setMember('100', { id: actor, owner: false, rank: 100, permissions: 0n });
    for (const source of ['$editGuild[$object[name;novo]]', '$editThread[300;$object[locked;true]]', '$invites', '$setVanity[nome]', '$cloneEmoji[4]', '$cloneSticker[5]']) await assert.rejects(run(source), GuardError);
  }
});

test('adaptador envia DM, forwards e anexos mistos com menções desabilitadas', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const calls: unknown[] = [];
  Reflect.set(client.users, 'fetch', async () => ({ async send(input: unknown) { calls.push(input); return { id: '1' }; } }));
  Reflect.set(client.channels, 'send', async (_channel: string, input: unknown) => { calls.push(input); return { id: '2' }; });
  const resources = new FluxerResources(client).messages;
  await resources.dm('2', '@everyone'); await resources.forward('300', '200', '500');
  await resources.sendAttachments('200', [{ name: 'a.bin', data: new Uint8Array([0, 255]), description: 'bytes' }, { name: 'b.txt', url: 'https://example.com/b' }]);
  const payloads = calls as { allowedMentions: unknown; forward?: unknown; files?: { attachment: Uint8Array | null; url: string | null }[]; attachments?: unknown[] }[];
  for (const payload of payloads) assert.deepEqual(payload.allowedMentions, { parse: [], repliedUser: false });
  assert.deepEqual(payloads[1]?.forward, { channelId: '200', messageId: '500' });
  assert.deepEqual([...payloads[2]!.files![0]!.attachment!], [0, 255]);
  assert.equal(payloads[2]?.files?.[1]?.url, 'https://example.com/b');
  assert.equal(payloads[2]?.attachments?.length, 2);
  await assert.rejects(resources.sendBytes('200', [{ name: 'large.bin', data: new Uint8Array(10_000_001) }]), /10 MB/);
  assert.equal(calls.length, 3);
});

test('adaptador busca mensagens sem perder indexação e mapeia resultados do SDK', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const calls: unknown[] = [];
  Reflect.set(client, 'searchMessages', async (input: unknown) => { calls.push(input); return { indexing: true }; });
  const messages = new FluxerResources(client).messages;
  assert.equal((await messages.search({ content: 'teste', guildID: '100', limit: 10, cursor: ['a'] })).indexing, true);
  assert.deepEqual(calls[0], { content: 'teste', contextGuildId: '100', contextChannelId: undefined, channelIds: undefined, authorIds: undefined, hitsPerPage: 10, cursor: ['a'] });
  Reflect.set(client, 'searchMessages', async () => ({ messages: [{ id: '500', channel_id: '200', author: { id: '2', username: 'ana', discriminator: '0', avatar: null },
    content: 'resultado', timestamp: '2026-10-21T00:00:00.000Z', type: 0, attachments: [], embeds: [], mentions: [], mention_roles: [], pinned: false }],
    channels: [], total: 1, hitsPerPage: 10, page: 0, cursor: ['b'] }));
  const page = await messages.search({ content: 'teste' });
  assert.equal(page.messages[0]?.content, 'resultado'); assert.equal(page.messages[0]?.authorID, '2');
  assert.equal(page.total, 1); assert.deepEqual(page.cursor, ['b']);
});

test('adaptador mapeia membros, apelidos e edição de servidor sem requisições duplicadas', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const calls: unknown[][] = [];
  const nativeMember = { id: '2', displayName: 'Ana', nick: null as string | null, joinedAt: new Date(1),
    roles: { roleIds: ['10'] }, permissions: { bitfield: 0n }, communicationDisabledUntil: null,
    user: { username: 'ana', bot: false, createdTimestamp: 0, bannerURL: () => null },
    displayAvatarURL: () => null, bannerURL: () => null,
    async edit(input: { nick: string | null; reason: string }) { calls.push(['nickname', input]); this.nick = input.nick; return this; },
  };
  const guild = { id: '100', name: 'servidor', ownerId: '1', memberCount: 2, createdTimestamp: 0, features: [],
    iconURL: () => null, bannerURL: () => null,
    members: {
      async fetch(id: string, input: unknown) { calls.push(['fetch', id, input]); return nativeMember; },
      async search(input: unknown) { calls.push(['search', input]); return { members: [{ userId: '2', username: 'ana', nickname: 'Ana', globalName: null }], total: 1, hasMore: false }; },
    },
    async edit(input: unknown) { calls.push(['guild', input]); return this; },
  };
  Reflect.set(client.guilds, 'resolve', async () => guild);
  const resources = new FluxerResources(client).users;
  assert.equal((await resources.setNickname('100', '2', 'novo', 'ajuste')).nickname, 'novo');
  assert.equal((await resources.searchMembers('100', 'Ana', 10, 20)).members[0]?.displayName, 'Ana');
  await resources.editGuild('100', { name: 'novo', systemChannelID: null, afkChannelID: '300' });
  assert.deepEqual(calls, [['fetch', '2', { force: true }], ['nickname', { nick: 'novo', reason: 'ajuste' }],
    ['search', { query: 'Ana', limit: 10, offset: 20 }], ['guild', { name: 'novo', systemChannelId: null, afkChannelId: '300' }]]);
});

test('adaptador edita/entra/sai/busca threads e preserva indexação', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const calls: unknown[][] = [];
  const thread = { id: '300', name: 'thread', parentId: '200', archived: false, locked: false, messageCount: 1, ownerId: '1',
    isThread: () => true,
    async edit(input: unknown) { calls.push(['edit', input]); return this; },
    async join() { calls.push(['join']); }, async leave() { calls.push(['leave']); },
  };
  let indexing = false;
  const parent = { threads: { create() {}, async search(input: unknown) {
    calls.push(['search', input]); return indexing ? { indexing: true, retryAfter: 2 } : { threads: [thread], hasMore: false, totalResults: 1 };
  } } };
  Reflect.set(client.channels, 'fetch', async (id: string) => id === '200' ? parent : thread);
  const resources = new FluxerResources(client).threads;
  await resources.edit('300', { locked: true, slowmode: 3, tags: ['10'], autoArchiveDuration: 60, reason: 'fechar' });
  await resources.join('300'); await resources.leave('300');
  assert.equal((await resources.search('200', { name: 'th', limit: 10, offset: 1 })).total, 1);
  indexing = true;
  assert.deepEqual(await resources.search('200', {}), { threads: [], hasMore: false, total: null, indexing: true, retryAfter: 2 });
  assert.deepEqual(calls[0], ['edit', { locked: true, reason: 'fechar', appliedTags: ['10'], rateLimitPerUser: 3, autoArchiveDuration: 60 }]);
  assert.deepEqual(calls[3], ['search', { name: 'th', archived: undefined, tag: undefined, limit: 10, offset: 1 }]);
});

test('adaptador lista convites, lê/altera vanity e clona expressões', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const calls: unknown[][] = [];
  Reflect.set(client.guilds, 'resolve', async () => ({
    async fetchInvites() { return [{ code: 'a', url: 'https://fluxer.gg/a', guildSnapshot: { id: '100' }, channelSnapshot: { id: '200' }, inviter: { id: '1' }, uses: 1, maxUses: 0, expiresAt: null }]; },
    async fetchVanityURL() { return { code: 'nome', uses: 1 }; },
    async editVanityURL(code: string | null) { calls.push(['vanity', code]); return { code, uses: 0 }; },
    async cloneEmoji(id: string) { calls.push(['emoji', id]); return { id: '4', name: 'clonado', animated: false, url: null }; },
    async cloneSticker(id: string) { calls.push(['sticker', id]); return { id: '5', name: 'clonado', description: '', tags: ['ok'] }; },
  }));
  const resources = new FluxerResources(client);
  assert.equal((await resources.invites.list('100'))[0]?.guildID, '100');
  assert.deepEqual(await resources.invites.vanity('100'), { code: 'nome', uses: 1 });
  await resources.invites.setVanity('100', null);
  assert.equal((await resources.expressions.cloneEmoji('100', '10')).name, 'clonado');
  assert.equal((await resources.expressions.cloneSticker('100', '20')).tags, 'ok');
  assert.deepEqual(calls, [['vanity', null], ['emoji', '10'], ['sticker', '20']]);
});
