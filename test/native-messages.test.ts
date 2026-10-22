import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandContext } from '../src/commands/context.js';
import type { ContextOptions } from '../src/commands/context.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import { Runtime } from '../src/scripting/runtime.js';
import { defaultLimits } from '../src/scripting/limits.js';
import { resourceMessageFunctions } from '../src/scripting/builtins/native-messages.js';
import { collectorFunctions } from '../src/scripting/builtins/native-collectors.js';
import type { MessageInfo } from '../src/ports/resources/messages.js';
import type { CollectedMessageInfo } from '../src/ports/resources/collectors.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
import { ScriptError } from '../src/errors.js';

function info(id: string, overrides: Partial<MessageInfo> = {}): MessageInfo {
  return {
    id, channelID: '200', authorID: '1', authorName: 'Hory', content: `conteúdo ${id}`,
    createdTimestamp: Number(id) * 1000, pinned: false, attachments: [],
    ...overrides,
  };
}

function harness(resources: Parameters<typeof mockResources>[0], overrides: Partial<ContextOptions> = {}) {
  const transport = new MockTransport();
  const store = new MemoryStore();
  const ctx = new CommandContext({
    message: mockMessage('!test'), command: { name: 'test', code: '' },
    transport, store, cooldown: () => 0, resources: mockResources(resources), ...overrides,
  });
  const runtime = new Runtime(defaultLimits).registerAll([...resourceMessageFunctions, ...collectorFunctions]);
  return { ctx, transport, run: (source: string) => runtime.execute(runtime.compile(source, 'command.yz'), ctx) };
}

test('fetch/lista/fixados retornam objeto, propriedade e ordem', async () => {
  const calls: string[] = [];
  const { run } = harness({
    messages: {
      async fetch(channelID, messageID) { calls.push(`fetch:${channelID}:${messageID}`); return info('7', { content: 'olá' }); },
      async list(channelID, limit) { calls.push(`list:${channelID}:${limit}`); return [info('5'), info('4'), info('3')]; },
      async pin(channelID, messageID) { calls.push(`pin:${channelID}:${messageID}`); },
      async unpin(channelID, messageID) { calls.push(`unpin:${channelID}:${messageID}`); },
      async pinned(channelID, limit) { calls.push(`pinned:${channelID}:${limit}`); return [info('1'), info('2')]; },
      async sendFiles() { throw new Error('não usado'); },
    },
  });
  assert.deepEqual(await run('$fetchMessage[200;7]'), info('7', { content: 'olá' }));
  assert.equal(await run('$fetchMessage[200;7;conteudo]'), 'olá');
  assert.deepEqual((await run('$messages[200;2]') as MessageInfo[]).map(m => m.id), ['5', '4', '3']);
  assert.deepEqual(calls, ['fetch:200:7', 'fetch:200:7', 'list:200:2']);
  assert.equal(await run('$pin[7]'), '');
  assert.equal(await run('$unpin[7;200]'), '');
  assert.equal((await run('$pinnedMessages[200]') as MessageInfo[]).length, 2);
  assert.deepEqual(calls.slice(3), ['pin:200:7', 'unpin:200:7', 'pinned:200:undefined']);
});

test('URL inválida e limite inválido geram YuzuhaError em português', async () => {
  const { run } = harness({ messages: mockResources().messages });
  await assert.rejects(run('$sendFiles[200;nota-url]'), (e: unknown) =>
    e instanceof ScriptError && /URL do anexo inválida/.test(e.message));
  await assert.rejects(run('$attachment[ftp://x/y.png]'), (e: unknown) =>
    e instanceof ScriptError && /URL do anexo inválida/.test(e.message));
  await assert.rejects(run('$messages[200;500]'), (e: unknown) =>
    e instanceof ScriptError && /entre 1 e 100/.test(e.message));
  await assert.rejects(run('$awaitMessage[banana]'), /Duração inválida/);
});

test('sendFiles valida URL, deriva nome e envia anexo', async () => {
  let sent: { files: { url: string; name: string }[]; content?: string } | undefined;
  const { run } = harness({
    messages: {
      async fetch() { throw new Error('não usado'); },
      async list() { return []; },
      async pin() {},
      async unpin() {},
      async pinned() { return []; },
      async sendFiles(channelID, files, content) {
        sent = { files, content };
        assert.equal(channelID, '200');
        return '42';
      },
    },
  });
  assert.equal(await run('$sendFiles[200;https://cdn.test/a/logo.png]'), '42');
  assert.deepEqual(sent, { files: [{ url: 'https://cdn.test/a/logo.png', name: 'logo.png' }], content: undefined });
  assert.deepEqual(await run('$attachment[https://cdn.test/a/logo.png]'), { url: 'https://cdn.test/a/logo.png', name: 'logo.png' });
  assert.deepEqual(await run('$attachment[https://cdn.test/a/logo.png;banner.png]'),
    { url: 'https://cdn.test/a/logo.png', name: 'banner.png' });
});

test('awaitMessage filtra por usuário e retorna vazio em timeout', async () => {
  const seen: { channelID: string; input: { userID?: string; timeMs: number } }[] = [];
  const { run } = harness({
    collectors: {
      async awaitMessage(channelID, input): Promise<CollectedMessageInfo | null> {
        seen.push({ channelID, input });
        if (input.userID === '2') return { id: '9', channelID, authorID: '2', content: 'achei' };
        return null;
      },
      async awaitReaction() { return null; },
    },
  });
  assert.equal(await run('$awaitMessage[2;2]'), 'achei');
  assert.equal(await run('$awaitMessage[1]'), '');
  assert.deepEqual(seen.map(s => [s.channelID, s.input.userID, s.input.timeMs]), [['200', '2', 2000], ['200', undefined, 1000]]);
});

test('awaitReaction retorna userID e confirm reage e retorna boolean', async () => {
  const reactions = new Map<string, string | null>([['✅', '1'], ['❌', null]]);
  const { run, transport, ctx } = harness({
    collectors: {
      async awaitMessage() { return null; },
      async awaitReaction(_channelID, _messageID, emojis: string | string[]) {
        const list = Array.isArray(emojis) ? emojis : [emojis];
        for (const emoji of list) { const userID = reactions.get(emoji); if (userID) return { userID, emoji }; }
        return null;
      },
    },
  });
  assert.equal(await run('$awaitReaction[2]'), '1');
  assert.equal(await run('$awaitReaction[2;❌;123]'), '');
  assert.equal(await run('$confirm[5]'), true);
  assert.ok(transport.messages.some(m => m.payload.content === 'Confirme reagindo abaixo.'));
  const promptID = transport.messages.at(-1)!.id;
  assert.deepEqual(transport.reactions.filter(r => r.messageID === promptID).map(r => r.emoji), ['✅', '❌']);
  assert.equal(ctx.message.channelID, '200');
  reactions.set('✅', null);
  reactions.set('❌', '9');
  assert.equal(await run('$confirm[5;Tem certeza?]'), false);
});

test('coletores não consomem o prazo de execução do script', async () => {
  const transport = new MockTransport();
  const ctx = new CommandContext({
    message: mockMessage('!test'), command: { name: 'test', code: '' },
    transport, store: new MemoryStore(), cooldown: () => 0,
    resources: mockResources({
      collectors: {
        async awaitMessage() {
          await new Promise(resolve => setTimeout(resolve, 250));
          return { id: '9', channelID: '200', authorID: '1', content: 'achei' };
        },
        async awaitReaction() {
          await new Promise(resolve => setTimeout(resolve, 250));
          return { userID: '1', emoji: '✅' };
        },
      },
    }),
  });
  const runtime = new Runtime({ ...defaultLimits, timeoutMs: 100 }).registerAll([...collectorFunctions]);
  const run = (source: string) => runtime.execute(runtime.compile(source, 'command.yz'), ctx);
  assert.equal(await run('$awaitMessage[0.25]'), 'achei');
  assert.equal(await run('$awaitReaction[0.25]'), '1');
  assert.equal(await run('$confirm[0.25]'), true);
});

test('confirm expira para false quando ninguém reage', async () => {
  const { run, transport } = harness({
    collectors: {
      async awaitMessage() { return null; },
      async awaitReaction() { return null; },
    },
  });
  assert.equal(await run('$confirm[1]'), false);
  assert.equal(transport.reactions.length, 2);
});
