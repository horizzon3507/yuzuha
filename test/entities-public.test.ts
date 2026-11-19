import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandContext, MemoryStore } from '../src/index.js';
import { PermissionFlags } from '@fluxerjs/core';
import { Runtime, defaultLimits, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
import { toMessageInfo } from '../src/infrastructure/fluxer/resources/messages.js';
import { botCanModerate } from '../src/services/entity-capabilities.js';

function harness() {
  const transport = new MockTransport();
  let foreign = false, empty = false, fail = false;
  const channel = (id: string) => ({ id, guildID: foreign ? '300' : '100', type: 0, name: 'geral',
    parentID: null, position: 0, topic: null, slowmode: 0, nsfw: false });
  const info = { id: '7', channelID: '200', guildID: '100', authorID: '2', authorName: 'ana', content: '',
    createdTimestamp: 1, pinned: false, attachments: [], embeds: [], flags: '0', tts: false, nonce: null,
    mentions: [], stickers: [], reactions: [{ messageID: '7', channelID: '200', guildID: '100',
      count: 0, me: false, emoji: { name: '👍' }, emojiIdentifier: '👍' }] };
  const ctx = new CommandContext({ message: mockMessage('!info'), command: { name: 'info', code: '' },
    transport, store: new MemoryStore(), cooldown: () => 0, resources: mockResources({
      channels: { async get(id) { return channel(id); } },
      messages: { async fetch() { if (fail) throw new Error('port indisponível'); return { ...info, reactions: empty ? [] : info.reactions }; } },
      users: { async getBan(_, id) { return empty ? null : { userID: id, username: 'ana', reason: null,
        guildID: '100', expiresAt: null, user: { id, username: 'ana', displayName: 'Ana', bot: false,
          avatarURL: null, bannerURL: null, createdTimestamp: 1 } }; },
      async member(_, id) { return { id, username: 'ana', displayName: 'Ana', bot: false, avatarURL: null,
        bannerURL: null, createdTimestamp: 1, nickname: null, joinedTimestamp: 1, roles: [], permissions: '0', timedOutUntil: null }; } },
      invites: { async get(code) { return { code, url: 'https://fluxer.gg/a', guildID: foreign ? '300' : '100',
        channelID: '200', inviterID: null, uses: 0, maxUses: 0, expiresTimestamp: null, temporary: false,
        guildSnapshot: { id: '100', name: 'S', icon: null, banner: null, splash: null, features: [] } }; } },
      webhooks: { async fetch(id) { return { id, name: 'hook', token: 'segredo-interno', channelID: '200',
        guildID: foreign ? '300' : '100', avatar: null, type: 1 }; } },
      expressions: { async emoji(_, id) { return { id, name: 'emoji', animated: false, url: null,
        guildID: '100', identifier: 'emoji:5', createdAt: '2026-01-01T00:00:00.000Z' }; },
      async sticker(_, id) { return { id, name: 'sticker', description: null, tags: null, nsfw: false, animated: false, url: 'https://cdn.test/a' }; } },
      roles: { async resolve(_, id) { return { id, name: 'cargo', color: 0, position: 1, permissions: '0',
        hoist: false, mentionable: false, unicodeEmoji: null, managed: false, guildID: '100', createdTimestamp: 0 }; } },
    }) });
  const runtime = registerBuiltins(new Runtime(defaultLimits));
  return { transport, ctx, run: (source: string) => runtime.execute(runtime.compile(source), ctx),
    foreign: () => { foreign = true; }, empty: () => { empty = true; }, fail: () => { fail = true; } };
}

test('campos de mensagem, reação, cargo e expressões preservam valores e JSON', async () => {
  const { run } = harness();
  assert.equal(await run('$fetchMessage[200;7;flags]'), '0');
  assert.equal(await run('$fetchMessage[200;7;tts]'), false);
  assert.equal(await run('$fetchMessage[200;7;nonce]'), '');
  assert.equal(await run('$fetchMessage[200;7;mentions]'), '[]');
  assert.equal(await run('$fetchMessage[200;7;stickers]'), '[]');
  assert.equal(await run('$reactionInfo[count;👍;7]'), 0);
  assert.equal(await run('$reactionInfo[me;👍;7]'), false);
  assert.equal(await run('$reactionInfo[emoji;👍;7]'), '{"name":"👍"}');
  assert.equal(await run('$role[5;createdTimestamp]'), 0);
  assert.equal(await run('$role[5;createdAt]'), '');
  assert.equal(await run('$roleHasPermission[5;ManageRoles]'), false);
  await assert.rejects(run('$roleHasPermission[5;inexistente]'), /Permissão desconhecida/);
  await assert.rejects(run('$roleHasPermission[5;]'), /Permissão desconhecida/);
  assert.equal(await run('$emoji[5;guildID]'), '100');
  assert.equal(await run('$emoji[5;identifier]'), 'emoji:5');
  assert.equal(await run('$sticker[5;nsfw]'), false);
  assert.equal(await run('$sticker[5;description]'), '');
});

test('leitores de convite, webhook e banimento restringem contexto e protegem token', async () => {
  const h = harness();
  assert.equal(await h.run('$inviteInfo[temporary;a]'), false);
  assert.equal(await h.run('$inviteInfo[guildSnapshot;a]'), '{"id":"100","name":"S","icon":null,"banner":null,"splash":null,"features":[]}');
  assert.equal(await h.run('$webhookInfo[avatar;5]'), '');
  assert.equal(await h.run('$webhookInfo[type;5]'), 1);
  assert.equal(await h.run('$banInfo[expiresAt;2]'), '');
  assert.equal(await h.run('$banInfo[guildID;2]'), '100');
  for (const source of ['$webhookInfo[token;5]', '$banInfo[client;2]', '$inviteInfo[client;a]',
    '$reactionInfo[client;👍;7]', '$fetchMessage[200;7;token]', '$emoji[5;client]', '$sticker[5;client]', '$role[5;client]']) {
    await assert.rejects(h.run(source), /Propriedade inválida\. Use:/);
  }
  h.foreign();
  for (const source of ['$inviteInfo[type;a]', '$webhookInfo[type;5]', '$reactionInfo[count;👍;7]', '$fetchMessage[200;7;flags]']) {
    await assert.rejects(h.run(source));
  }
  const empty = harness(); empty.empty();
  assert.equal(await empty.run('$banInfo[user;2]'), '');
  assert.equal(await empty.run('$reactionInfo[count;👍;7]'), '');
  const failed = harness(); failed.fail();
  await assert.rejects(failed.run('$reactionInfo[count;👍;7]'), e => e instanceof Error && e.cause instanceof Error && e.cause.message === 'port indisponível');
});

test('webhook e banimento exigem permissão de autor e bot, inclusive com try', async () => {
  for (const actor of ['1', '999']) {
    const h = harness();
    h.transport.setMember('100', { id: actor, owner: false, permissions: 0n, rank: 90 });
    await assert.rejects(h.run('$try[$webhookInfo[type;5];oculto]'), /ManageWebhooks/);
    await assert.rejects(h.run('$try[$banInfo[user;2];oculto]'), /BanMembers/);
  }
});

test('capacidades usam somente bot, permissões efetivas e hierarquia sem esconder falha de transporte', async () => {
  const h = harness();
  for (const key of ['bannable', 'kickable', 'moderatable']) assert.equal(await h.run(`$member[2;${key}]`), true);
  assert.equal(await h.run('$member[1;bannable]'), false);
  assert.equal(await h.run('$member[999;kickable]'), false);
  assert.equal(await h.run('$canSend'), true);
  assert.equal(await h.run('$guild[permissions]'), PermissionFlags.Administrator.toString());
  await assert.rejects(h.run('$canSend[200;2]'));
  h.transport.setMember('100', { id: '999', owner: false, permissions: 0n, rank: 90 });
  assert.equal(await h.run('$member[2;bannable]'), false);
  assert.equal(await h.run('$canSend'), false);
  h.transport.setMember('100', { id: '999', owner: false, permissions: PermissionFlags.Administrator, rank: 1 });
  assert.equal(await h.run('$member[2;kickable]'), false);
  const transport = new MockTransport();
  transport.member = async () => { throw new Error('transporte'); };
  await assert.rejects(botCanModerate(transport, '100', '2', 'ban'), /transporte/);
});

test('normalizador copia associações e anexos sem objetos SDK nem bigint', () => {
  const source = { id: '7', channelId: '200', guildId: '100', author: { id: '2', username: 'ana', displayName: 'Ana' },
    content: '', createdAt: new Date(1), pinned: false, attachments: new Map([['3', { id: '3', filename: 'a.txt',
      url: 'https://cdn.test/a', size: 1, contentType: 'text/plain', description: 'alt', flags: 8 }]]), embeds: [],
    flags: { bitfield: 4n }, mentions: [], mentionRoles: ['5'], stickers: [{ id: '6', name: 's', description: '',
      tags: ['tag'], animated: true, url: 'https://cdn.test/s', createdTimestamp: 1, createdAt: new Date(1) }],
    reactions: { cache: new Map([['👍', { messageId: '7', channelId: '200', guildId: '100', count: 2, me: true,
      emoji: { name: '👍' }, emojiIdentifier: '👍' }]]) },
    call: { participants: ['2'], endedAt: null }, messageReference: { messageId: '4' },
    messageSnapshots: [{ content: 'antes', createdAt: new Date(1), editedAt: null,
      mentionUserIds: ['2'], mentionRoles: [], embeds: [], attachments: [], stickers: [] }],
  };
  const info = toMessageInfo(source as never);
  assert.equal(info.flags, '4');
  assert.equal(info.author?.id, '2');
  assert.equal(info.stickers?.[0]?.animated, true);
  assert.equal(info.reactions?.[0]?.me, true);
  assert.equal(info.messageSnapshots?.[0]?.content, 'antes');
  assert.equal(info.attachments[0]?.description, 'alt');
  assert.doesNotThrow(() => JSON.stringify(info));
  source.mentionRoles.push('9'); source.call.participants.push('9');
  assert.deepEqual(info.mentionRoles, ['5']);
  assert.deepEqual(info.call?.participants, ['2']);
});
