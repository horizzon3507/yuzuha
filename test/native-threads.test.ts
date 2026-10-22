import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandContext } from '../src/commands/context.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import { Runtime, defaultLimits } from '../src/runtime.js';
import { ScriptError } from '../src/shared/errors.js';
import { registerBuiltins } from '../src/functions.js';
import { YuzuhaError } from '../src/shared/errors.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
import type { ForumPostInput, ThreadCreateInput, ThreadInfo } from '../src/ports/resources/threads.js';

const INFO: ThreadInfo = { id: 't1', name: 'geral', parentID: '200', archived: false, locked: false, messageCount: 0, ownerID: '1' };

function harness(calls: { create: { channelID: string; input: ThreadCreateInput }[]; archive: { threadID: string; locked?: boolean }[]; unarchive: string[]; forum: { channelID: string; input: ForumPostInput }[] }) {
  const fake = {
    async create(channelID: string, input: ThreadCreateInput) { calls.create.push({ channelID, input }); return INFO; },
    async archive(threadID: string, locked?: boolean) { calls.archive.push({ threadID, locked }); },
    async unarchive(threadID: string) { calls.unarchive.push(threadID); },
    async forumPost(channelID: string, input: ForumPostInput) { calls.forum.push({ channelID, input }); return INFO; },
  };
  const transport = new MockTransport();
  const ctx = new CommandContext({ message: mockMessage('!threads'), command: { name: 'threads', run() {} },
    transport, store: new MemoryStore(), cooldown: () => 0, resources: mockResources({ threads: fake }) });
  const runtime = registerBuiltins(new Runtime(defaultLimits));
  const run = (source: string) => runtime.execute(runtime.compile(source, 'threads.yz'), ctx);
  return { run };
}

function fresh() {
  return harness({ create: [], archive: [], unarchive: [], forum: [] });
}

test('createThread usa o canal atual e o arquivamento padrão', async () => {
  const calls = { create: [], archive: [], unarchive: [], forum: [] };
  const { run } = harness(calls);
  assert.deepEqual(await run('$createThread[duvidas]'), INFO);
  assert.deepEqual(calls.create, [{ channelID: '200', input: { name: 'duvidas', messageID: undefined, autoArchiveDuration: 1440 } }]);
});

test('createThread a partir de mensagem usa o canal informado', async () => {
  const calls = { create: [], archive: [], unarchive: [], forum: [] };
  const { run } = harness(calls);
  assert.deepEqual(await run('$createThread[resumo;300;m42;60]'), INFO);
  assert.deepEqual(calls.create, [{ channelID: '300', input: { name: 'resumo', messageID: 'm42', autoArchiveDuration: 60 } }]);
});

test('createThread rejeita arquivamento inválido', async () => {
  const { run } = fresh();
  await assert.rejects(run('$createThread[duvidas;200;;30]'), (error: unknown) =>
    error instanceof ScriptError && (error.cause as YuzuhaError | undefined)?.code === 'THREAD_ARCHIVE');
});

test('archiveThread com lock e unarchive registram chamadas', async () => {
  const calls = { create: [], archive: [], unarchive: [], forum: [] };
  const { run } = harness(calls);
  assert.equal(await run('$archiveThread[t1;true]'), '');
  assert.equal(await run('$unarchiveThread[t1]'), '');
  assert.deepEqual(calls.archive, [{ threadID: 't1', locked: true }]);
  assert.deepEqual(calls.unarchive, ['t1']);
});

test('forumPost envia tags separadas por vírgula', async () => {
  const calls = { create: [], archive: [], unarchive: [], forum: [] };
  const { run } = harness(calls);
  assert.deepEqual(await run('$forumPost[400;Novidade;Olá mundo;a, b ,,]'), INFO);
  assert.deepEqual(calls.forum, [{ channelID: '400', input: { name: 'Novidade', content: 'Olá mundo', tags: ['a', 'b'] } }]);
});
