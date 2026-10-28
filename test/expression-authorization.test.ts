import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlags } from '@fluxerjs/core';
import { CommandContext, GuardError, HttpService, MemoryStore } from '../src/index.js';
import { Runtime, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
import { bindAuthorizedResources } from '../src/services/resource-authorization.js';
import type { ExpressionsResources } from '../src/ports/resources/expressions.js';

function fixture(guildID = '100', authorID = '1') {
  const calls: unknown[][] = [];
  const emoji = { id: '10', name: 'novo', animated: false, url: null };
  const sticker = { id: '20', name: 'novo', description: null, tags: null };
  const raw = mockResources({ expressions: {
    async createEmoji(...args) { calls.push(['createEmoji', ...args]); return emoji; },
    async editEmoji(...args) { calls.push(['editEmoji', ...args]); return emoji; },
    async deleteEmoji(...args) { calls.push(['deleteEmoji', ...args]); },
    async createSticker(...args) { calls.push(['createSticker', ...args]); return sticker; },
    async editSticker(...args) { calls.push(['editSticker', ...args]); return sticker; },
    async deleteSticker(...args) { calls.push(['deleteSticker', ...args]); },
    async cloneEmoji(...args) { calls.push(['cloneEmoji', ...args]); return emoji; },
    async cloneSticker(...args) { calls.push(['cloneSticker', ...args]); return sticker; },
    async createEmojisBulk(...args) { calls.push(['createEmojisBulk', ...args]); return { success: [emoji], failed: [] }; },
  } });
  const transport = new MockTransport();
  const expressions = bindAuthorizedResources(raw, transport, { guildID, authorID }).expressions;
  return { raw, expressions, transport, calls, emoji, sticker };
}

const mutations = (expressions: ExpressionsResources, guildID = '100') => [
  () => expressions.createEmoji(guildID, 'novo', 'aGk=', 'criar'),
  () => expressions.editEmoji(guildID, '10', 'novo', 'editar'),
  () => expressions.deleteEmoji(guildID, '10', 'apagar'),
  () => expressions.createSticker(guildID, { name: 'novo', image: 'aGk=', tags: ['ok'], reason: 'criar' }),
  () => expressions.editSticker(guildID, '20', { description: '', reason: 'editar' }),
  () => expressions.deleteSticker(guildID, '20', 'apagar'),
  () => expressions.cloneEmoji(guildID, '30'),
  () => expressions.cloneSticker(guildID, '40'),
  () => expressions.createEmojisBulk(guildID, [{ name: 'novo', image: 'aGk=' }]),
];

test('todas as mutações de expressões exigem ManageExpressions de autor e bot antes do port', async () => {
  for (const actorID of ['1', '999']) {
    const f = fixture();
    f.transport.setMember('100', { id: actorID, owner: false, rank: 10, permissions: 0n });
    for (const mutate of mutations(f.expressions)) await assert.rejects(mutate, GuardError);
    assert.deepEqual(f.calls, []);
  }
});

test('mutações de expressões recusam outro servidor, DM e ausência de autor antes do port', async () => {
  for (const [guildID, authorID, targetGuildID] of [['100', '1', '200'], ['', '1', '100'], ['100', '', '100']]) {
    const f = fixture(guildID, authorID);
    for (const mutate of mutations(f.expressions, targetGuildID)) await assert.rejects(mutate, GuardError);
    assert.deepEqual(f.calls, []);
  }
});

test('expressões autorizadas preservam opções, motivos e resultados do recurso', async () => {
  const f = fixture();
  for (const id of ['1', '999']) f.transport.setMember('100', {
    id, owner: false, rank: 10, permissions: PermissionFlags.ManageExpressions,
  });
  const results = [];
  for (const mutate of mutations(f.expressions)) results.push(await mutate());
  assert.deepEqual(results, [f.emoji, f.emoji, undefined, f.sticker, f.sticker, undefined,
    f.emoji, f.sticker, { success: [f.emoji], failed: [] }]);
  assert.deepEqual(f.calls, [
    ['createEmoji', '100', 'novo', 'aGk=', 'criar'],
    ['editEmoji', '100', '10', 'novo', 'editar'],
    ['deleteEmoji', '100', '10', 'apagar'],
    ['createSticker', '100', { name: 'novo', image: 'aGk=', tags: ['ok'], reason: 'criar' }],
    ['editSticker', '100', '20', { description: '', reason: 'editar' }],
    ['deleteSticker', '100', '20', 'apagar'], ['cloneEmoji', '100', '30'], ['cloneSticker', '100', '40'],
    ['createEmojisBulk', '100', [{ name: 'novo', image: 'aGk=' }]],
  ]);
});

test('guards de expressões atravessam $try e impedem download de emoji sem autorização', async () => {
  for (const actorID of ['1', '999']) {
    const f = fixture();
    let downloads = 0;
    const ctx = new CommandContext({ message: mockMessage('!test'), command: { name: 'test' },
      transport: f.transport, store: new MemoryStore(), cooldown: () => 0, resources: f.raw,
      http: new HttpService({ fetch: async () => { downloads++; return new Response('imagem'); } }),
    });
    const runtime = registerBuiltins(new Runtime());
    f.transport.setMember('100', { id: actorID, owner: false, rank: 10, permissions: 0n });
    for (const source of ['$createEmoji[novo;https://93.184.216.34/image.png]', '$editEmoji[10;novo]',
      '$deleteEmoji[10]', '$createSticker[novo;aGk=]', '$editSticker[20]', '$deleteSticker[20]',
      '$cloneEmoji[30]', '$cloneSticker[40]', '$createEmojisBulk[$array[$object[name;novo;image;aGk=]]]']) {
      await assert.rejects(runtime.execute(runtime.compile(`$try[${source};ignorado]`), ctx), GuardError);
    }
    assert.equal(downloads, 0);
    assert.deepEqual(f.calls, []);
  }
});
