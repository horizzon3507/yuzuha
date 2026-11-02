import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, EmbedBuilder } from '@fluxerjs/core';
import { CommandContext, FluxerResources, MemoryStore, YuzuhaError, embed } from '../src/index.js';
import type { MessageInfo, ReceivedEmbed } from '../src/index.js';
import { Runtime, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
import type { MockResourceOverrides } from '../src/testing.js';
import { safePayload } from '../src/infrastructure/fluxer/payload.js';
import { FluxerTransport } from '../src/adapter.js';
import { EMBED_LIMITS, validateEmbed } from '../src/domain/embeds.js';

function harness(authorID = '1', resources: MockResourceOverrides = {}) {
  const transport = new MockTransport();
  const ctx = new CommandContext({ message: mockMessage('!test', { authorID }), command: { name: 'test', code: '' },
    resources: mockResources(resources), transport, store: new MemoryStore(), input: '!test', cooldown: () => 0 });
  const runtime = registerBuiltins(new Runtime());
  // Resultados são JSON-like; `any` evita um cast em cada asserção de script.
  return { transport, run: async (source: string): Promise<any> => runtime.execute(runtime.compile(source, 'embeds.yz'), ctx) };
}

const URL_A = 'https://exemplo.com/a';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

test('funções novas de embed produzem partes que se combinam sem perder o padrão', async () => {
  const { run } = harness();
  assert.deepEqual(await run(`$url[${URL_A}]`), { url: URL_A });
  assert.deepEqual(await run(`$author[Ana;${URL_A};${URL_A}.png]`), { author: { name: 'Ana', url: URL_A, iconURL: `${URL_A}.png` } });
  assert.deepEqual(await run('$author[Ana;;]'), { author: { name: 'Ana' } });
  assert.deepEqual(await run(`$footerIcon[${URL_A}.png]`), { footer: { iconURL: `${URL_A}.png` } });
  assert.deepEqual(await run('$imageAlt[Gráfico]'), { image: { description: 'Gráfico' } });
  assert.deepEqual(await run('$thumbnailAlt[Logo]'), { thumbnail: { description: 'Logo' } });
  const built = await run(`$embed[$title[Relatório];$url[${URL_A}];$author[Hory;${URL_A};${URL_A}.png];$footer[rodapé];$footerIcon[${URL_A}.png];$image[${URL_A}.jpg];$imageAlt[Gráfico];$embedTimestamp[2026-01-20T21:30:00Z];$color[blue]]`);
  assert.deepEqual(built, {
    title: 'Relatório', url: URL_A, author: { name: 'Hory', url: URL_A, iconURL: `${URL_A}.png` },
    footer: { text: 'rodapé', iconURL: `${URL_A}.png` }, image: { url: `${URL_A}.jpg`, description: 'Gráfico' },
    timestamp: '2026-01-20T21:30:00Z', color: 0x3498DB,
  });
  assert.match((await run('$embedTimestamp[agora]')).timestamp, ISO);
});

test('campos: field aceita valor vazio inline e addField, removeField, editField e fields operam em cópias', async () => {
  const { run } = harness();
  const base = '$embed[$title[Lista];$field[A;1]]';
  const added = await run(`$addField[${base};B;;true]`);
  assert.deepEqual(added.fields, [{ name: 'A', value: '1', inline: false }, { name: 'B', value: '', inline: true }]);
  assert.deepEqual((await run(`$removeField[${base};0]`)).fields, undefined);
  assert.deepEqual((await run('$removeField[$embed[$title[X];$field[A;1];$field[B;2]];0]')).fields, [{ name: 'B', value: '2', inline: false }]);
  const edited = await run('$editField[$embed[$title[X];$field[A;1;true]];0;Z;9]');
  assert.deepEqual(edited.fields, [{ name: 'Z', value: '9', inline: true }]);
  assert.deepEqual(await run('$fields[$array[$array[N;1;true];$array[M;2]]]'), { fields: [{ name: 'N', value: '1', inline: true }, { name: 'M', value: '2' }] });
  assert.deepEqual(await run('$fields[$array[$object[name;P;value;;inline;true]]]'), { fields: [{ name: 'P', value: '', inline: true }] });
  await assert.rejects(run('$reply[$field[A;]]'), /Valor vazio/);
  await assert.rejects(run('$removeField[$embed[$title[X];$field[A;1]];1]'), /Índice de campo inválido/);
  await assert.rejects(run('$editField[$embed[$title[X];$field[A;1]];0.5;N;V]'), /Índice de campo inválido/);
});

test('embedFromObject valida objetos e JSON, descartando campos de resposta', async () => {
  const { run } = harness();
  assert.deepEqual(await run('$embedFromObject[$object[title;Oi;color;#ff0000;fields;$array[$object[name;A;value;1]]]]'), {
    title: 'Oi', color: 0xFF0000, fields: [{ name: 'A', value: '1' }],
  });
  assert.deepEqual(await run('$embedFromObject[$object[title;Oi;type;rich;video;$object[url;https://exemplo.com/v.mp4]]]'), { title: 'Oi' });
  assert.deepEqual(await run('$embedFromObject[{"title":"JSON"}]'), { title: 'JSON' });
  await assert.rejects(run('$embedFromObject[$object[title;Oi;foo;bar]]'), /Campo de embed desconhecido: foo/);
  await assert.rejects(run('$embedFromObject[{"title":]'), /JSON de embed inválido/);
  await assert.rejects(run('$embedFromObject[$object[title;Oi;image;$object[url;javascript:alert(1)]]]'), /Use URL HTTP\/HTTPS/);
});

test('color aceita hexadecimal, tupla r,g,b e nomes simples', async () => {
  const { run } = harness();
  assert.deepEqual(await run('$color[#ffffff]'), { color: 0xFFFFFF });
  assert.deepEqual(await run('$color[FCE300]'), { color: 0xFCE300 });
  assert.deepEqual(await run('$color[255,0,128]'), { color: (255 << 16) | 128 });
  assert.deepEqual(await run('$color[green]'), { color: 0x2ECC71 });
  for (const source of ['$color[256,0,0]', '$color[1,2]', '$color[mauve]', '$color[#fff]']) await assert.rejects(run(source), /Use #RRGGBB|Cor RGB/);
});

test('limites de texto, campos e total seguem o SDK e aceitam os valores exatos', async () => {
  const { run } = harness();
  const repeat = (char: string, count: number) => char.repeat(count);
  await run(`$reply[$embed[$title[${repeat('t', 256)}]]]`);
  await assert.rejects(run(`$reply[$embed[$title[${repeat('t', 257)}]]]`), /256/);
  await run(`$reply[$embed[$description[${repeat('d', 4096)}]]]`);
  await assert.rejects(run(`$reply[$embed[$description[${repeat('d', 4097)}]]]`), /4096/);
  await run(`$reply[$embed[$author[${repeat('a', 256)}]]]`);
  await assert.rejects(run(`$reply[$embed[$author[${repeat('a', 257)}]]]`), /256/);
  await run(`$reply[$embed[$footer[${repeat('f', 2048)}]]]`);
  await assert.rejects(run(`$reply[$embed[$footer[${repeat('f', 2049)}]]]`), /2048/);
  await run(`$reply[$embed[$image[${URL_A}];$imageAlt[${repeat('i', 1024)}]]]`);
  await assert.rejects(run(`$reply[$embed[$image[${URL_A}];$imageAlt[${repeat('i', 1025)}]]]`), /1024/);
  await run(`$reply[$embed[$field[n;${repeat('v', 1024)}]]]`);
  await assert.rejects(run(`$reply[$embed[$field[n;${repeat('v', 1025)}]]]`), /1024/);
  await run(`$reply[$embed[$field[${repeat('n', 256)};x]]]`);
  await assert.rejects(run(`$reply[$embed[$field[${repeat('n', 257)};x]]]`), /256/);
  const fields = Array.from({ length: 25 }, (_, index) => `$field[f${index};v]`).join(';');
  await run(`$reply[$embed[${fields}]]`);
  await assert.rejects(run(`$reply[$embed[${fields};$field[extra;v]]]`), /25 campos/);
  await run(`$reply[$embed[$description[${repeat('d', 4096)}];$footer[${repeat('f', 1904)}]]]`);
  await assert.rejects(run(`$reply[$embed[$description[${repeat('d', 4096)}];$footer[${repeat('f', 2000)}]]]`), /6000/);
  await assert.rejects(run(`$reply[$embed[$footerIcon[${URL_A}]]]`), /precisa de texto/);
});

test('URLs inválidas e timestamps fora do ISO com fuso são rejeitados', async () => {
  const { run } = harness();
  for (const source of ['$url[javascript:alert(1)]', '$url[não é url]', '$image[ftp://exemplo.com/a.png]',
    '$footerIcon[file:///etc/passwd]', '$author[Ana;http://]', '$thumbnail[data:image/png,AA]']) {
    await assert.rejects(run(source), YuzuhaError, source);
  }
  for (const source of ['$embedTimestamp[2026-13-01T00:00:00Z]', '$embedTimestamp[ontem]', '$embedTimestamp[2026-01-20]',
    '$embedTimestamp[2026-01-20T21:30:00]']) {
    await assert.rejects(run(source), /ISO-8601/, source);
  }
  assert.throws(() => validateEmbed({ title: 'x', url: 'javascript:alert(1)' }), /HTTP\/HTTPS/);
  assert.throws(() => validateEmbed({ title: 'x', timestamp: 'amanhã' }), /ISO-8601/);
});

test('embed sem conteúdo é recusado, mas autor ou URL bastam como conteúdo', async () => {
  const { run } = harness();
  await run(`$reply[$embed[$author[Ana]]]`);
  await run(`$reply[$embed[$url[${URL_A}]]]`);
  await run(`$reply[$embed[$thumbnail[${URL_A}.png]]]`);
  await assert.rejects(run('$reply[$embed[$embedTimestamp[agora]]]'), /precisa de conteúdo/);
  assert.throws(() => validateEmbed({ footer: { text: '' } }), /precisa de conteúdo/);
  assert.equal(embed({ url: URL_A }).url, URL_A);
  assert.throws(() => embed({}), /precisa de conteúdo/);
});

test('conversão para o SDK preserva todos os campos de embed e o padrão de menções', () => {
  const options = safePayload({ embeds: [{ url: URL_A, title: 'T', color: 0x123456, timestamp: '2026-01-20T21:30:00.000Z',
    author: { name: 'A', url: URL_A, iconURL: `${URL_A}.png` }, fields: [{ name: 'N', value: 'V', inline: true }],
    footer: { text: 'F', iconURL: `${URL_A}.png` }, image: { url: `${URL_A}.jpg`, description: 'alt' }, thumbnail: { url: `${URL_A}.t` } }] });
  const json = (options.embeds![0] as EmbedBuilder).toJSON();
  assert.deepEqual(json, {
    description: null, url: URL_A, title: 'T', color: 0x123456, timestamp: '2026-01-20T21:30:00.000Z',
    author: { name: 'A', url: URL_A, icon_url: `${URL_A}.png` }, fields: [{ name: 'N', value: 'V', inline: true }],
    footer: { text: 'F', icon_url: `${URL_A}.png` }, image: { url: `${URL_A}.jpg`, description: 'alt' }, thumbnail: { url: `${URL_A}.t` },
  });
  assert.deepEqual(options.allowedMentions, { parse: [], repliedUser: false });
  assert.throws(() => safePayload({ embeds: Array.from({ length: 11 }, () => ({ title: 'x' })) }), /máximo 10 embeds/);
});

test('mensagem com vários embeds chega ao transporte e limita a 10', async () => {
  const { run, transport } = harness();
  await run('$reply[$embeds[$embed[$title[Um]];$embed[$title[Dois]]]]');
  assert.deepEqual(transport.messages.at(-1)?.payload.embeds?.map(item => item.title), ['Um', 'Dois']);
  const ten = Array.from({ length: 10 }, (_, index) => `$embed[$title[${index}]]`).join(';');
  await run(`$sendMessage[200;$object[embeds;$embeds[${ten}]]]`);
  assert.equal(transport.messages.at(-1)?.payload.embeds?.length, 10);
  await assert.rejects(run(`$embeds[${ten};$embed[$title[11]]]`));
  await assert.rejects(run(`$reply[$object[embeds;$array[${Array.from({ length: 11 }, () => '$embed[$title[x]]').join(';')}]]]`), /máximo 10/);
  await run('$addEmbed[$embeds[$embed[$title[A]]];$embed[$title[B]]]');
  await assert.rejects(run(`$addEmbed[$embeds[${ten}];$embed[$title[x]]]`), /máximo 10/);
  assert.equal(transport.messages.length, 2);
});

test('menções seguem o padrão sem pings e só relaxam com MentionEveryone do autor', async () => {
  const author2 = harness('2');
  await assert.rejects(author2.run('$reply[$object[content;oi;allowedMentions;$object[parse;$array[everyone]]]]'), /MentionEveryone/);
  await assert.rejects(author2.run('$reply[$object[content;oi;allowedMentions;$object[users;$array[123]]]]'), /MentionEveryone/);
  await author2.run('$reply[$object[content;oi;allowedMentions;$object[parse;$array[]]]]');
  assert.deepEqual(author2.transport.messages.at(-1)?.payload.allowedMentions, { parse: [] });
  await author2.run('$reply[oi]');
  assert.equal(author2.transport.messages.at(-1)?.payload.allowedMentions, undefined);
  await assert.rejects(author2.run('$sendMessage[200;$object[content;oi;tts;true]]'), /SendTtsMessages/);
  await assert.rejects(author2.run('$reply[$object[content;oi;stickers;1]]'), /Campo de mensagem desconhecido/);

  const owner = harness('1');
  await owner.run('$reply[$object[content;oi;allowedMentions;$object[parse;$array[users;everyone]];tts;true;flags;4]]');
  assert.deepEqual(owner.transport.messages.at(-1)?.payload, {
    content: 'oi', allowedMentions: { parse: ['users', 'everyone'] }, tts: true, flags: 4,
  });
  await owner.run('$sendMessage[200;$object[embeds;$array[$embed[$title[Só embed]]];stickerIds;$array[111;222]]]');
  assert.deepEqual(owner.transport.messages.at(-1)?.payload.stickerIds, ['111', '222']);
  await assert.rejects(owner.run('$sendMessage[200;$object[content;oi;stickerIds;$array[abc]]]'), /IDs numéricos/);
  assert.equal(owner.transport.messages.at(-1)?.payload.embeds?.[0]?.title, 'Só embed');
});

test('$messageOptions monta opções para mesclar com conteúdo ou embeds', async () => {
  const owner = harness('1');
  await owner.run('$sendMessage[200;$jsonMerge[$object[content;oi];$messageOptions[false;;4]]]');
  assert.deepEqual(owner.transport.messages.at(-1)?.payload, { content: 'oi', tts: false, flags: 4 });
  await owner.run('$sendMessage[200;$jsonMerge[$object[embeds;$array[$embed[$title[T]]]];$messageOptions[true]]]');
  assert.equal(owner.transport.messages.at(-1)?.payload.tts, true);
  const member = harness('2');
  await assert.rejects(member.run('$sendMessage[200;$jsonMerge[$object[content;oi];$messageOptions[true]]]'), /SendTtsMessages/);
  await assert.rejects(member.run('$sendMessage[200;$messageOptions[false]]'), /texto ou de embed/);
});

test('embed recebido é lido de forma normalizada e somente leitura', async () => {
  const received: ReceivedEmbed = {
    type: 'rich', url: URL_A, title: 'Título', color: 0x112233, timestamp: '2026-01-20T21:30:00.000Z', description: 'Corpo',
    author: { name: 'Autor', url: null, iconURL: `${URL_A}.png` }, image: { url: `${URL_A}.jpg`, proxyURL: null, contentType: 'image/jpeg',
      width: 10, height: 20, description: 'alt' }, thumbnail: null,
    footer: { text: 'F', iconURL: null }, fields: [{ name: 'N', value: 'V', inline: true }],
    provider: { name: 'Site', url: null, iconURL: null }, video: null, audio: null, nsfw: false, children: [],
    html: null, htmlWidth: null, htmlHeight: null,
  };
  const info: MessageInfo = { id: '1', channelID: '200', authorID: '2', authorName: 'ana', content: '', createdTimestamp: 1,
    pinned: false, attachments: [], embeds: [received] };
  const { run } = harness('1', { messages: { async fetch() { return info; } } });
  assert.deepEqual(await run('$fetchMessage[200;1;embeds]'), [received]);
  assert.equal(await run('$fetchMessage[200;1;embeds]').then(list => (list as ReceivedEmbed[])[0]!.provider?.name), 'Site');
  assert.deepEqual(await run('$embedFromObject[$jsonGet[$fetchMessage[200;1;embeds];0]]'), {
    url: URL_A, title: 'Título', color: 0x112233, timestamp: '2026-01-20T21:30:00.000Z', description: 'Corpo',
    author: { name: 'Autor', iconURL: `${URL_A}.png` }, image: { url: `${URL_A}.jpg`, description: 'alt' },
    footer: { text: 'F' }, fields: [{ name: 'N', value: 'V', inline: true }],
  });
});

test('adaptador do SDK converte embeds recebidos para o formato normalizado', async t => {
  const client = new Client(); t.after(() => client.destroy());
  Reflect.set(client.channels, 'fetchMessage', async () => ({
    id: '1', channelId: '200', author: { id: '2', username: 'ana' }, content: '', createdAt: new Date(1), pinned: false,
    attachments: new Map(),
    embeds: [{ type: 'video', url: URL_A, title: null, color: null, timestamp: new Date('2026-01-20T21:30:00Z'), description: null,
      author: null, image: { url: `${URL_A}.jpg`, proxyUrl: 'https://cdn.test/p', contentType: 'image/jpeg', contentHash: null,
        width: 640, height: 360, description: 'capa', placeholder: null, duration: null, flags: null },
      thumbnail: null, footer: { text: 'rodapé', iconUrl: null, proxyIconUrl: null }, fields: [], provider: { name: 'Vídeo', url: null, iconUrl: 'https://v.test/i', proxyIconUrl: null },
      video: { url: `${URL_A}.mp4`, proxyUrl: null, contentType: 'video/mp4', contentHash: null, width: 640, height: 360, description: null, placeholder: null, duration: 12, flags: null },
      audio: null, nsfw: true, children: [], html: '<p>x</p>', htmlWidth: 1, htmlHeight: 2 }],
  }));
  const [received] = (await new FluxerResources(client).messages.fetch('200', '1')).embeds;
  assert.deepEqual(received, {
    type: 'video', url: URL_A, title: null, color: null, timestamp: '2026-01-20T21:30:00.000Z', description: null, author: null,
    image: { url: `${URL_A}.jpg`, proxyURL: 'https://cdn.test/p', contentType: 'image/jpeg', width: 640, height: 360, description: 'capa' },
    thumbnail: null, footer: { text: 'rodapé', iconURL: null }, fields: [],
    provider: { name: 'Vídeo', url: null, iconURL: 'https://v.test/i' },
    video: { url: `${URL_A}.mp4`, proxyURL: null, contentType: 'video/mp4', width: 640, height: 360, description: null },
    audio: null, nsfw: true, children: [], html: '<p>x</p>', htmlWidth: 1, htmlHeight: 2,
  });
});

test('limites exportados batem com os valores documentados', () => {
  assert.deepEqual({ ...EMBED_LIMITS }, { title: 256, description: 4096, authorName: 256, footerText: 2048, altText: 1024,
    fields: 25, fieldName: 256, fieldValue: 1024, total: 6000, embedsPerMessage: 10 });
});

test('transporte do SDK aplica resposta explícita, menções relaxadas e descarta campos que a edição não aceita', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const sent: unknown[] = [];
  const edits: unknown[] = [];
  Reflect.set(client.channels, 'send', async (channelID: string, options: unknown) => {
    sent.push({ channelID, options });
    return { id: '9' };
  });
  Reflect.set(client.channels, 'fetchMessage', async () => ({ edit: async (options: unknown) => { edits.push(options); } }));
  const transport = new FluxerTransport(client);
  await transport.send('200', { content: 'oi', tts: true, stickerIds: ['111'], flags: 4,
    allowedMentions: { parse: ['users'], users: ['1'] }, reply: { channelID: '300', messageID: '400', guildID: '100' } });
  const [first] = sent as { options: { replyTo: unknown; tts: boolean; stickerIds: string[]; flags: number; allowedMentions: unknown } }[];
  assert.deepEqual(first?.options.replyTo, { channelId: '300', messageId: '400', guildId: '100' });
  assert.equal(first?.options.tts, true);
  assert.deepEqual(first?.options.stickerIds, ['111']);
  assert.equal(first?.options.flags, 4);
  assert.deepEqual(first?.options.allowedMentions, { parse: ['users'], users: ['1'], repliedUser: false });
  await transport.send('200', { content: 'padrão' });
  assert.deepEqual((sent[1] as { options: { allowedMentions: unknown } }).options.allowedMentions, { parse: [], repliedUser: false });
  await transport.edit('200', '9', { content: 'editado', tts: true, stickerIds: ['111'], flags: 4,
    reply: { channelID: '300', messageID: '400' } });
  const [edit] = edits as Record<string, unknown>[];
  assert.equal(edit?.['tts'], undefined);
  assert.equal(edit?.['stickerIds'], undefined);
  assert.equal(edit?.['replyTo'], undefined);
  assert.equal(edit?.['flags'], 4);
  assert.equal(edit?.['content'], 'editado');
});

test('safePayload relaxa menções só com a política recebida e mantém o padrão sem ela', () => {
  assert.deepEqual(safePayload({ content: 'x', allowedMentions: { parse: ['users'], users: ['1'] } }).allowedMentions,
    { parse: ['users'], users: ['1'], repliedUser: false });
  assert.deepEqual(safePayload({ content: 'x', allowedMentions: { repliedUser: true } }).allowedMentions,
    { parse: [], repliedUser: true });
  assert.deepEqual(safePayload({ content: 'x' }).allowedMentions, { parse: [], repliedUser: false });
});
