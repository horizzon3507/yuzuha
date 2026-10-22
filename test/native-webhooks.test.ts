import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandContext } from '../src/commands/context.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import { Runtime } from '../src/scripting/runtime.js';
import { registerBuiltins } from '../src/scripting/builtins/index.js';
import { defaultLimits } from '../src/scripting/limits.js';
import { YuzuhaError } from '../src/errors.js';
import type { EmojiInfo, StickerInfo } from '../src/ports/resources/expressions.js';
import type { WebhookInfo } from '../src/ports/resources/webhooks.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
import { HttpService } from '../src/services/http.js';

const webhook: WebhookInfo = { id: '10', name: 'logs', channelID: '200', guildID: '100', token: 'tok' };
const emojis: EmojiInfo[] = [
  { id: '11', name: 'festa', animated: false, url: 'https://cdn/festa.png' },
  { id: '12', name: 'dança', animated: true, url: 'https://cdn/danca.gif' },
];
const stickers: StickerInfo[] = [{ id: '21', name: 'ok', description: 'Polegar', tags: 'ok, sim' }];

function harness() {
  const transport = new MockTransport();
  const calls: { resource: string; method: string; args: unknown[] }[] = [];
  const track = <T extends object>(resource: string, methods: T): T =>
    new Proxy(methods, { get: (target, property) => (...args: unknown[]) => {
      calls.push({ resource, method: String(property), args });
      const method = (target as Record<string, (...args: unknown[]) => unknown>)[String(property)]!;
      return method(...args);
    } }) as T;
  const webhooks = track('webhooks', {
    fetch: async (): Promise<WebhookInfo> => webhook,
    create: async (channelID: string, name: string): Promise<WebhookInfo> => ({ ...webhook, channelID, name }),
    list: async (): Promise<WebhookInfo[]> => [webhook],
    send: async (id: string, token: string, input: { content: string }): Promise<string | null> =>
      (id === webhook.id && token === webhook.token && input.content ? '30' : null),
    edit: async (): Promise<void> => {},
    delete: async (): Promise<void> => {},
  });
  const expressions = track('expressions', {
    emoji: async (_guildID: string, query: string): Promise<EmojiInfo> => {
      const mention = query.match(/^<a?:[^:>]+:(\d+)>$/)?.[1];
      const found = emojis.find(e => e.id === (mention ?? query) || e.name.toLowerCase() === query.toLowerCase());
      if (!found) throw new YuzuhaError('EMOJI_NOT_FOUND', 'Emoji não encontrado.');
      return found;
    },
    emojis: async (): Promise<EmojiInfo[]> => emojis,
    createEmoji: async (_guildID: string, name: string, image: string): Promise<EmojiInfo> =>
      ({ id: '13', name, animated: false, url: `https://img/${name}.png` }),
    deleteEmoji: async (): Promise<void> => {},
    sticker: async (_guildID: string, query: string): Promise<StickerInfo> => {
      const found = stickers.find(s => s.id === query || s.name.toLowerCase() === query.toLowerCase());
      if (!found) throw new YuzuhaError('STICKER_NOT_FOUND', 'Sticker não encontrado.');
      return found;
    },
    stickers: async (): Promise<StickerInfo[]> => stickers,
  });
  const resources = mockResources({ webhooks, expressions, channels: { get: async id => ({ id, name: 'geral', type: 0, guildID: '100', parentID: null, position: 0, topic: null, slowmode: 0, nsfw: false }) } });
  const ctx = new CommandContext({ message: mockMessage('!test'), command: { name: 'test', code: '' },
    transport, store: new MemoryStore(), cooldown: () => 0, resources,
    http: new HttpService({ allowPrivate: true, fetch: async () => new Response('imagem') }) });
  const runtime = registerBuiltins(new Runtime(defaultLimits));
  const run = (source: string) => runtime.execute(runtime.compile(source, 'webhooks.yz'), ctx);
  return { run, calls };
}

test('webhooks cobrem criação, envio, edição e remoção com e sem token', async () => {
  const { run, calls } = harness();
  assert.deepEqual(await run('$createWebhook[200;logs]'), webhook);
  assert.deepEqual(await run('$webhooks'), [webhook]);
  assert.deepEqual(await run('$webhooks[200]'), [webhook]);
  assert.equal(await run('$sendWebhook[10;tok;olá]'), '30');
  assert.equal(await run('$editWebhook[10;novo;tok]'), '');
  assert.equal(await run('$editWebhook[10;novo]'), '');
  assert.equal(await run('$deleteWebhook[10;tok]'), '');
  assert.equal(await run('$deleteWebhook[10]'), '');
  assert.deepEqual(calls.filter(c => c.resource === 'webhooks' && c.method !== 'fetch').map(c => [c.method, ...c.args]), [
    ['create', '200', 'logs', undefined], ['list', '200'], ['list', '200'],
    ['send', '10', 'tok', { content: 'olá' }],
    ['edit', '10', 'tok', 'novo'], ['edit', '10', null, 'novo'],
    ['delete', '10', 'tok'], ['delete', '10', null],
  ]);
  await assert.rejects(run('$sendWebhook[10;;olá]'), YuzuhaError);
  await assert.rejects(run('$createWebhook[200; ]'), YuzuhaError);
});

test('emojis resolvem por menção, nome e ID e validam criação', async () => {
  const { run, calls } = harness();
  assert.deepEqual(await run('$emoji[festa]'), emojis[0]!);
  assert.equal(await run('$emoji[<a:dança:12>;mention]'), '<a:dança:12>');
  assert.equal(await run('$emoji[11;url]'), 'https://cdn/festa.png');
  assert.equal(await run('$emoji[festa;animated]'), false);
  assert.deepEqual(await run('$emojis'), emojis);
  assert.deepEqual(await run('$createEmoji[novo;https://img/novo.png]'), { id: '13', name: 'novo', animated: false, url: 'https://img/novo.png' });
  assert.equal(await run('$deleteEmoji[dança]'), '');
  assert.deepEqual(calls.filter(c => c.resource === 'expressions').map(c => [c.method, ...c.args]), [
    ['emoji', '100', 'festa'], ['emoji', '100', '<a:dança:12>'], ['emoji', '100', '11'],
    ['emoji', '100', 'festa'], ['emojis', '100'],
    ['createEmoji', '100', 'novo', 'aW1hZ2Vt'], ['deleteEmoji', '100', 'dança'],
  ]);
  await assert.rejects(run('$createEmoji[x;https://img/x.png]'), /2 a 32/);
  await assert.rejects(run('$createEmoji[novo;ftp://img/x.png]'), /HTTP\/HTTPS/);
  await assert.rejects(run('$emoji[festa;cor]'), /Propriedade/);
});

test('stickers resolvem por nome e ID com propriedades', async () => {
  const { run, calls } = harness();
  assert.deepEqual(await run('$sticker[ok]'), stickers[0]!);
  assert.equal(await run('$sticker[21;tags]'), 'ok, sim');
  assert.deepEqual(await run('$stickers'), stickers);
  assert.deepEqual(calls.map(c => c.method), ['sticker', 'sticker', 'stickers']);
});
