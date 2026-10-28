import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@fluxerjs/core';
import { CommandContext, FluxerResources, MemoryStore, YuzuhaError } from '../src/index.js';
import type { MessageInfo, MessageSearchInput, PinnedMessagesPage } from '../src/index.js';
import { Runtime, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
import type { MockResourceOverrides } from '../src/testing.js';

function harness(resources: MockResourceOverrides, dm = false) {
  const transport = new MockTransport();
  const ctx = new CommandContext({ message: mockMessage('$reply[dado]', dm ? { guildID: undefined } : {}),
    command: { name: 'test', code: '' }, resources: mockResources(resources), transport,
    store: new MemoryStore(), input: '$reply[dado]', cooldown: () => 0 });
  const runtime = registerBuiltins(new Runtime());
  return { transport, run: (source: string) => runtime.execute(runtime.compile(source), ctx) };
}

const message: MessageInfo = { id: '1', channelID: '200', authorID: '2', authorName: 'ana',
  content: 'fixada', createdTimestamp: 1, pinned: true, attachments: [] };

test('página de fixadas preserva os timestamps e o cursor entre script e recurso', async () => {
  const calls: unknown[][] = [];
  const page: PinnedMessagesPage = { messages: [message], pinnedAt: ['2026-10-27T12:34:56.000Z'],
    hasMore: true, nextBefore: '2026-10-27T12:34:56.000Z' };
  const { run } = harness({ messages: { async pinnedPage(...args) { calls.push(args); return page; } } });
  assert.deepEqual(await run('$pinnedMessagesPage'), page);
  assert.deepEqual(await run('$pinnedMessagesPage[300;2;2026-10-27T12:34:56.000Z]'), page);
  assert.deepEqual(calls, [['200', { limit: 50 }], ['300', { limit: 2, before: page.nextBefore }]]);
  for (const source of ['$pinnedMessagesPage[200;101]', '$pinnedMessagesPage[200;1.5]',
    '$pinnedMessagesPage[200;2;500]', '$pinnedMessagesPage[200;2;2026-10-27]']) {
    await assert.rejects(run(source));
  }
  assert.equal(calls.length, 2);
});

test('adaptador pagina fixadas em ordem de fixação e valida opções antes do SDK', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const calls: unknown[] = [];
  const pinnedAt = ['2026-10-28T00:00:00Z', '2026-10-27T00:00:00Z'];
  let hasMore = true;
  Reflect.set(client.channels, 'fetch', async (channelID: string, options: unknown) => {
    calls.push({ channelID, options });
    return { isTextBased: () => true, async fetchPinnedMessagesPage(input: unknown) {
      calls.push(input);
      return { messages: [
        { id: '1', channelId: '200', author: { id: '2', username: 'ana' }, content: 'antiga',
          createdAt: new Date(1), pinned: true, attachments: new Map() },
        { id: '2', channelId: '200', author: { id: '2', username: 'ana' }, content: 'nova',
          createdAt: new Date(2), pinned: true, attachments: new Map() },
      ], pinnedAt, hasMore };
    } };
  });
  const resources = new FluxerResources(client).messages;
  const page = await resources.pinnedPage('200', { limit: 2, before: '2026-10-28T12:00:00Z' });
  assert.deepEqual(page.messages.map(item => item.id), ['1', '2']);
  assert.deepEqual(page.pinnedAt, pinnedAt);
  assert.notEqual(page.pinnedAt, pinnedAt);
  assert.equal(page.nextBefore, pinnedAt[1]);
  assert.deepEqual(calls, [{ channelID: '200', options: { force: true } },
    { limit: 2, before: '2026-10-28T12:00:00Z' }]);
  hasMore = false;
  assert.equal((await resources.pinnedPage('200')).nextBefore, null);
  assert.deepEqual(calls[3], { limit: 50 });
  for (const input of [{ limit: 0 }, { before: '123' }, { before: '2026-10-27T25:00:00Z' }]) {
    await assert.rejects(resources.pinnedPage('200', input), YuzuhaError);
  }
  await assert.rejects(resources.pinned('200', 101), YuzuhaError);
  assert.equal(calls.length, 4);
  Reflect.set(client.channels, 'fetch', async () => ({ isTextBased: () => false }));
  await assert.rejects(resources.pinnedPage('200'), /sem suporte a mensagens/);
});

test('busca avançada aceita filtros sem texto, mantém o contexto e não executa dados', async () => {
  const calls: MessageSearchInput[] = [];
  const page = { indexing: false, messages: [], total: 0, cursor: ['próxima'] };
  const { run, transport } = harness({ messages: { async search(input) { calls.push(input); return page; } } });
  assert.deepEqual(await run('$searchMessagesAdvanced[$object[pinned;true;authorType;$array[bot];has;$array[image];limit;10]]'), page);
  assert.deepEqual(calls[0], { pinned: true, authorType: ['bot'], has: ['image'], limit: 10, guildID: '100' });
  assert.deepEqual(await run('$searchMessagesAdvanced[$object[content;$message;cursor;$array[próxima]]]'), page);
  assert.equal(calls[1]?.content, '$reply[dado]');
  assert.deepEqual(calls[1]?.cursor, ['próxima']);
  assert.equal(transport.messages.length, 0);
  await assert.rejects(run('$searchMessagesAdvanced[$jsonDecode[{"guildID":"999"}]]'), /contexto/);
  await assert.rejects(run('$searchMessagesAdvanced[$object[page;0;cursor;$array[próxima]]]'), /page ou cursor/);
  await assert.rejects(run('$searchMessagesAdvanced[$object[includeNsfw;texto]]'), /booleano/);
  await assert.rejects(run('$searchMessagesAdvanced[$object[unknown;true]]'), /desconhecida/);
  assert.equal(calls.length, 2);
  const dm = harness({ messages: { async search(input) { calls.push(input); return page; } } }, true);
  await dm.run('$searchMessagesAdvanced[$object[pinned;true]]');
  assert.deepEqual(calls[2], { pinned: true, guildID: undefined, channelID: '200' });
});

test('busca legada, avançada e nativa preservam cursor vazio', async t => {
  const page = { indexing: false, messages: [], total: 0, cursor: [] };
  const calls: MessageSearchInput[] = [];
  const { run } = harness({ messages: { async search(input) { calls.push(input); return page; } } });
  assert.deepEqual(await run('$searchMessages[texto;200;10;$array]'), page);
  assert.deepEqual(await run('$searchMessagesAdvanced[$object[cursor;$array]]'), page);
  assert.deepEqual(calls.map(input => input.cursor), [[], []]);
  const client = new Client(); t.after(() => client.destroy());
  let cursor: unknown;
  Reflect.set(client, 'searchMessages', async (input: { cursor?: string[] }) => { cursor = input.cursor; return { indexing: true }; });
  await new FluxerResources(client).messages.search({ content: 'texto', cursor: [] });
  assert.deepEqual(cursor, []);
});

test('adaptador preserva todos os filtros de busca do core 3.3.0 e copia arrays', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const calls: unknown[] = [];
  Reflect.set(client, 'searchMessages', async (input: unknown) => { calls.push(input); return { indexing: true }; });
  const input: MessageSearchInput = { content: 'conteúdo', contents: ['primeiro', 'segundo'], exactPhrases: ['frase exata'],
    guildID: '100', channelID: '200', channelIDs: ['200', '201'], excludeChannelIDs: ['202'],
    authorIDs: ['2', '3'], excludeAuthorIDs: ['4'], authorType: ['user', 'webhook'], excludeAuthorType: ['bot'],
    mentions: ['5'], excludeMentions: ['6'], mentionEveryone: false, pinned: true, includeNsfw: false,
    has: ['image'], excludeHas: ['video'], minID: '10', maxID: '20', sortBy: 'timestamp', sortOrder: 'asc', limit: 10, page: 2 };
  const resources = new FluxerResources(client).messages;
  assert.deepEqual(await resources.search(input), { indexing: true, messages: [], total: 0, cursor: null });
  assert.deepEqual(calls[0], { content: 'conteúdo', contents: ['primeiro', 'segundo'], exactPhrases: ['frase exata'],
    contextGuildId: '100', contextChannelId: '200', channelIds: ['200', '201'], excludeChannelIds: ['202'],
    authorIds: ['2', '3'], excludeAuthorIds: ['4'], authorType: ['user', 'webhook'], excludeAuthorType: ['bot'],
    mentions: ['5'], excludeMentions: ['6'], mentionEveryone: false, pinned: true, includeNsfw: false,
    has: ['image'], excludeHas: ['video'], minId: '10', maxId: '20', sortBy: 'timestamp', sortOrder: 'asc',
    hitsPerPage: 10, page: 2, cursor: undefined });
  const sent = calls[0] as { authorIds: string[]; contents: string[] };
  assert.notEqual(sent.authorIds, input.authorIDs);
  assert.notEqual(sent.contents, input.contents);
});

test('busca nativa rejeita opções inválidas e carga excessiva sem requisições', async t => {
  const client = new Client(); t.after(() => client.destroy());
  let calls = 0;
  Reflect.set(client, 'searchMessages', async () => { calls++; return { indexing: true }; });
  const resources = new FluxerResources(client).messages;
  const invalid = [null, [], { unknown: 1 }, { limit: 0 }, { limit: 101 }, { page: -1 }, { page: 10000 },
    { authorID: '2', authorIDs: ['3'] }, { authorIDs: new Array(2) }, { channelIDs: [] },
    { channelIDs: Array(101).fill('1') }, { authorType: ['admin'] }, { authorType: 'bot' },
    { pinned: 'false' }, { content: 'x'.repeat(2001) }, { sortOrder: 'up' }, { minID: '20', maxID: '10' },
    { cursor: Array(11).fill('a') }, { page: 0, cursor: ['a'] }, { mentions: ['<@2>'] },
    { exactPhrases: Array(20).fill('á'.repeat(2000)) }];
  for (const input of invalid) {
    await assert.rejects(resources.search(input as MessageSearchInput), YuzuhaError, JSON.stringify(input));
  }
  assert.equal(calls, 0);
});
