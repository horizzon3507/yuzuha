import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, PermissionFlags } from '@fluxerjs/core';
import { CommandContext, MemoryStore, PartialModerationError } from '../src/index.js';
import { Runtime, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
import { createUsersResources } from '../src/infrastructure/fluxer/resources/users.js';
import { createChannelsResources } from '../src/infrastructure/fluxer/resources/channels.js';

function harness(dm = false) {
  const transport = new MockTransport(), calls: unknown[][] = [];
  let type = 0, foreign = false, fail: Error | undefined, roles: string[] = [], rolePosition = 1, messageAuthor = '2', rolePermissions = '0';
  const member = (id: string) => ({ id, username: 'ana', displayName: 'Ana', bot: id === transport.botID,
    avatarURL: null, bannerURL: null, createdTimestamp: 1, nickname: null, joinedTimestamp: 1,
    roles: [...roles], permissions: '0', timedOutUntil: null });
  const record = (name: string, ...args: unknown[]) => { calls.push([name, ...args]); if (fail) throw fail; };
  const resources = mockResources({ channels: {
    async get(id) { return { id, guildID: dm ? null : foreign ? '300' : '100', type, name: 'canal', parentID: null,
      position: 0, topic: null, slowmode: 0, nsfw: false, recipientIDs: ['1', '2', transport.botID], ownerID: '1' }; },
    async addRecipient(...args) { record('add', ...args); }, async removeRecipient(...args) { record('remove', ...args); },
    async sendTyping(...args) { record('typing', ...args); }, async rtcRegions(...args) { record('rtc', ...args); return []; },
    async slowmode(...args) { record('slowmode', ...args); return 0; },
    async setDefaultForumLayout(...args) { record('layout', ...args); },
    async editThreadDefaults(...args) { record('defaults', ...args); }, async deleteOverwrite(...args) { record('overwrite', ...args); },
  }, threads: { async editSelf(...args) { record('self', ...args); return null; }, async setLocked(...args) { record('lock', ...args); } },
  users: {
    async createDM(id) { record('dm', id); return { id: '400', guildID: null, type: 1, name: '', parentID: null, position: 0, topic: null, slowmode: 0, nsfw: false }; },
    async member(_, id) { return member(id); }, async me() { return member(transport.botID); },
    async editMember(g, id, input) { record('member', g, id, input); return member(id); },
  }, roles: { async resolve(_, id) { return { id, name: 'cargo', color: 0, position: rolePosition, permissions: rolePermissions, hoist: false,
    mentionable: false, unicodeEmoji: null, managed: false }; }, async list() { return [{ id: '5', name: 'cargo', color: 0,
      position: rolePosition, permissions: '0', hoist: false, mentionable: false, unicodeEmoji: null, managed: false }]; } }, messages: {
    async acknowledgePins(...args) { record('pins', ...args); }, async clearReadState(...args) { record('read', ...args); },
    async fetch(channelID, id) { return { id, channelID, authorID: messageAuthor, authorName: 'Ana', content: '', createdTimestamp: 1, pinned: false, attachments: [], embeds: [] }; },
    async deleteAttachment(...args) { record('attachment', ...args); },
    async bulkDelete(id, ids) { record('bulk', id, ids); return ids.slice(0, 1); },
    async purge(...args) { record('purge', ...args); return { deleted: 0, deletedIDs: [], via: 'bulk' }; },
    async sendAttachments(...args) { record('files', ...args); return '10'; },
  } });
  const runtime = registerBuiltins(new Runtime());
  return { transport, calls, resources, type: (value: number) => { type = value; }, foreign: () => { foreign = true; },
    fail: (error = new Error('falha da API')) => { fail = error; }, roles: (value: string[]) => { roles = value; },
    rolePosition: (value: number) => { rolePosition = value; }, rolePermissions: (value: bigint) => { rolePermissions = String(value); },
    messageAuthor: (value: string) => { messageAuthor = value; },
    run: (code: string, vars: Record<string, unknown> = {}) => {
      const ctx = new CommandContext({ message: mockMessage('!test', dm ? { guildID: undefined } : {}),
        command: { name: 'test', code: '' }, transport, store: new MemoryStore(), resources, cooldown: () => 0 });
      for (const [key, value] of Object.entries(vars)) ctx.vars.set(key, value);
      return runtime.execute(runtime.compile(code), ctx);
    } };
}

test('canais: leitura vazia, typing, defaults, associação, lock, overwrite e DM normalizados', async () => {
  const h = harness();
  await h.run('$acknowledgePins'); await h.run('$clearReadState'); await h.run('$typing');
  assert.equal(await h.run('$fetchSlowmode'), 0);
  h.type(2); assert.deepEqual(await h.run('$rtcRegions'), []);
  h.type(15); await h.run('$setDefaultForumLayout[200;grid]'); await h.run('$setDefaultForumLayout[200;]');
  await h.run('$editThreadDefaults[200;$object[slowmode;0;autoArchiveDuration;null]]');
  h.type(11); assert.equal(await h.run('$editThreadSelf[200;$object[muted;true]]'), '');
  await h.run('$lockThread[200;true]'); await h.run('$deleteChannelOverwrite[200;5;auditoria]');
  assert.equal((await h.run('$createDM[2]') as { id: string }).id, '400');
  assert.deepEqual(h.calls.map(x => x[0]), ['pins', 'read', 'typing', 'slowmode', 'rtc', 'layout', 'layout', 'defaults', 'self', 'lock', 'overwrite', 'dm']);
  h.fail(); await assert.rejects(h.run('$typing')); assert.equal(h.calls.length, 13);
});

test('canais rejeitam tipos, opções vazias, contexto externo e permissões de autor/bot antes de mutar', async () => {
  const h = harness();
  for (const code of ['$rtcRegions', '$setDefaultForumLayout[200;grid]', '$editThreadDefaults[200;$object]',
    '$editThreadDefaults[200;$object[slowmode;21601]]', '$editThreadSelf[200;$object]', '$lockThread[200;sim]', '$createDM[x]']) await assert.rejects(h.run(code));
  for (const id of ['1', '999']) {
    const denied = harness(); denied.transport.setMember('100', { id, owner: false, permissions: 0n, rank: 90 });
    for (const code of ['$typing', '$acknowledgePins', '$clearReadState', '$fetchSlowmode', '$deleteChannelOverwrite[200;5]']) await assert.rejects(denied.run(`$try[${code};capturado]`));
    denied.type(15); await assert.rejects(denied.run('$setDefaultForumLayout[200;list]'));
    await assert.rejects(denied.run('$editThreadDefaults[200;$object[slowmode;1]]'));
    denied.type(11); await assert.rejects(denied.run('$editThreadSelf[200;$object[muted;true]]'));
    await assert.rejects(denied.run('$lockThread[200;true]')); assert.equal(denied.calls.length, 0);
  }
  h.foreign(); await assert.rejects(h.run('$typing')); assert.equal(h.calls.length, 0);
});

test('grupo DM limita destinatários ao grupo atual, participantes e autoridade do dono', async () => {
  const h = harness(true); h.type(3);
  await h.run('$addRecipient[3]'); await h.run('$removeRecipient[2]');
  await h.run('$typing'); await h.run('$acknowledgePins'); await h.run('$clearReadState');
  for (const code of ['$addRecipient[2]', '$removeRecipient[3]', '$removeRecipient[999]', '$addRecipient[999]']) await assert.rejects(h.run(code));
  h.type(1); await assert.rejects(h.run('$addRecipient[3]'));
  const guild = harness(); await assert.rejects(guild.run('$addRecipient[3]'));
  assert.deepEqual(h.calls.map(x => x[0]), ['add', 'remove', 'typing', 'pins', 'read']);
});

test('mensagens: resultados parciais, purge vazio, autor opcional e seleção somente do bot', async () => {
  const h = harness(), ids = ['10', '11', '10'];
  assert.deepEqual(await h.run('$bulkDelete[$get[ids]]', { ids }), ['10']);
  assert.deepEqual(h.calls[0], ['bulk', '200', ['10', '11']]);
  assert.deepEqual(await h.run('$purgeMessages[1]'), { deleted: 0, deletedIDs: [], via: 'bulk' });
  await h.run('$purgeMessages[100;2]'); await h.run('$bulkDeleteMyMessages');
  assert.deepEqual(h.calls.at(-1), ['purge', '200', { limit: 100, authorID: '999' }]);
  for (const ids of [[], ['x'], [10], Array(101).fill('10')]) await assert.rejects(h.run('$try[$bulkDelete[$get[ids]];capturado]', { ids }));
  for (const limit of ['0', '101', '1.5', '']) await assert.rejects(async () => h.run(`$try[$purgeMessages[${limit}];capturado]`));
  h.fail(new PartialModerationError('bulkDelete', '10', new Error('parcial')));
  await assert.rejects(h.run('$try[$bulkDelete[$get[ids]];capturado]', { ids }), PartialModerationError);
  assert.equal(h.calls.filter(x => x[0] === 'bulk').length, 2);
});

test('mensagens: deleteAttachment distingue autor próprio, bot próprio e terceiros, sem engolir guards', async () => {
  const h = harness(); await h.run('$deleteAttachment[10;20]');
  for (const id of ['1', '999']) {
    const denied = harness(); denied.transport.setMember('100', { id, owner: false, permissions: 0n, rank: 90 });
    await assert.rejects(denied.run('$try[$deleteAttachment[10;20];capturado]'));
    await assert.rejects(denied.run('$bulkDelete[$get[ids]]', { ids: ['10'] }));
    await assert.rejects(denied.run('$purgeMessages[1]')); await assert.rejects(denied.run('$bulkDeleteMyMessages'));
    assert.equal(denied.calls.length, 0);
  }
  const own = harness(); own.messageAuthor('1'); own.transport.setMember('100', { id: '1', owner: false, permissions: 0n, rank: 90 });
  await own.run('$deleteAttachment[10;20]');
  const bot = harness(); bot.messageAuthor('999'); bot.transport.setMember('100', { id: '999', owner: false, permissions: 0n, rank: 90 });
  await bot.run('$deleteAttachment[10;20]');
  await assert.rejects(h.run('$deleteAttachment[x;20]')); h.foreign(); await assert.rejects(h.run('$deleteAttachment[10;20]'));
});

test('membros: edit atômico, limpeza de cargos, bot atual e validação de todo o lote', async () => {
  const h = harness();
  assert.equal((await h.run('$editMember[2;$get[input]]', { input: { nickname: 'novo', roles: ['5'], reason: 'auditoria' } }) as { id: string }).id, '2');
  await h.run('$setMemberRoles[2;$array;limpar]');
  assert.equal(await h.run('$guildMe[id]'), '999'); assert.equal((await h.run('$guildMe') as { bot: boolean }).bot, true);
  for (const input of [{}, { nickname: 'x' }, { nickname: 1, reason: 'x' }, { roles: [5], reason: 'x' }, { roles: ['5', '5'], reason: 'x' }, { nickname: 'x', token: 'x', reason: 'x' }]) await assert.rejects(h.run('$editMember[2;$get[input]]', { input }));
  await assert.rejects(h.run('$guildMe[token]')); assert.equal(h.calls.length, 2);
  const dm = harness(true); await assert.rejects(dm.run('$guildMe')); await assert.rejects(dm.run('$setMemberRoles[2;$array;limpar]'));
});

test('membros exigem permissões de autor/bot, hierarquia do membro e de cada cargo removido/adicionado', async () => {
  for (const id of ['1', '999']) {
    const denied = harness(); denied.transport.setMember('100', { id, owner: false, permissions: 0n, rank: 90 });
    await assert.rejects(denied.run('$try[$editMember[2;$object[nickname;x;reason;teste]];capturado]'));
    await assert.rejects(denied.run('$setMemberRoles[2;$array;teste]')); assert.equal(denied.calls.length, 0);
    const high = harness(); high.transport.setMember('100', { id: '2', owner: false, permissions: 0n, rank: 100 });
    await assert.rejects(high.run('$editMember[2;$object[nickname;x;reason;teste]]')); assert.equal(high.calls.length, 0);
  }
  const highRole = harness(); highRole.roles(['5']); highRole.rolePosition(100);
  await assert.rejects(highRole.run('$setMemberRoles[2;$array;limpar]')); assert.equal(highRole.calls.length, 0);
  for (const actor of ['1', '999']) {
    const restricted = harness(); restricted.rolePermissions(PermissionFlags.Administrator);
    restricted.transport.setMember('100', { id: actor, owner: false, permissions: PermissionFlags.ManageRoles, rank: 90 });
    await assert.rejects(restricted.run('$setMemberRoles[2;$get[roles];teste]', { roles: ['5'] }));
    assert.equal(restricted.calls.length, 0);
  }
  const h = harness(); h.fail(new PartialModerationError('editMember', '2', new Error('normalização')));
  await assert.rejects(h.run('$try[$editMember[2;$object[nickname;x;reason;teste]];capturado]'), PartialModerationError);
  assert.equal(h.calls.length, 1);
});

test('adapter editMember mantém uma chamada e sinaliza falha depois da edição como PartialModerationError', async t => {
  const client = new Client(), calls: unknown[] = [];
  t.after(() => client.destroy());
  Object.defineProperty(client.guilds, 'resolve', { value: async () => ({ members: { fetch: async () => ({
    edit: async (input: unknown) => { calls.push(input); return {}; },
  }) } }) });
  const resources = createUsersResources(client);
  await assert.rejects(resources.editMember('100', '2', { nickname: null, roles: ['5'], reason: 'teste' }), PartialModerationError);
  assert.deepEqual(calls, [{ nick: null, roles: ['5'], reason: 'teste' }]);
});

test('adapter deleteOverwrite preserva auditoria e só remove cache depois do sucesso', async t => {
  const client = new Client(), calls: unknown[][] = [], cache = new Map([['5', {}]]);
  t.after(() => client.destroy());
  Reflect.set(client.channels, 'fetch', async () => ({ isGuild: () => true,
    permissionOverwrites: { cache, async delete(id: string) { calls.push(['sdk', id]); cache.delete(id); } } }));
  Reflect.set(client.rest, 'delete', async (...args: unknown[]) => { calls.push(args); });
  const resources = createChannelsResources(client);
  await resources.deleteOverwrite('200', '5', 'auditoria'); assert.equal(cache.has('5'), false);
  assert.deepEqual(calls[0], ['/channels/200/permissions/5', { auth: true, headers: { 'X-Audit-Log-Reason': 'auditoria' } }]);
  cache.set('5', {}); await resources.deleteOverwrite('200', '5'); assert.deepEqual(calls[1], ['sdk', '5']);
  cache.set('5', {}); Reflect.set(client.rest, 'delete', async () => { throw new Error('API'); });
  await assert.rejects(resources.deleteOverwrite('200', '5', 'auditoria')); assert.equal(cache.has('5'), true);
});

test('anexos declarativos aceitam spoiler URL/base64 e rejeitam tipos inválidos antes do envio', async () => {
  const h = harness();
  const file = await h.run('$fileBase64[QQ==;a.txt;;true]');
  assert.deepEqual(file, { base64: 'QQ==', name: 'a.txt', description: '', spoiler: true });
  assert.equal(await h.run('$sendAttachments[200;$array[$get[file]]]', { file }), '10');
  await h.run('$sendAttachments[200;$get[files]]', { files: [{ url: 'https://example.com/a', name: 'a', spoiler: false }] });
  assert.equal((h.calls[0]?.[2] as { spoiler: boolean }[])[0]?.spoiler, true);
  assert.equal((h.calls[1]?.[2] as { spoiler: boolean }[])[0]?.spoiler, false);
  await assert.rejects(h.run('$fileBase64[QQ==;a.txt;;sim]'));
  await assert.rejects(h.run('$sendAttachments[200;$get[files]]', { files: [{ url: 'https://example.com/a', name: 'a', spoiler: 'true' }] }));
  await assert.rejects(h.run('$sendAttachments[200;$array]')); assert.equal(h.calls.length, 2);
});
