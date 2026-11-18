import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Client, MessageAttachmentFlags, PermissionFlags, Routes } from '@fluxerjs/core';
import {
  CommandContext,
  FluxerResources,
  GuardError,
  MemoryStore,
  isYuzuhaError,
} from '../src/index.js';
import type {
  ChannelInfo,
  ModerationMember,
  WebhookEditInput,
  WebhookInfo,
  WebhookMessageEditInput,
  WebhookSendInput,
} from '../src/index.js';
import { bindAuthorizedResources } from '../src/services/resource-authorization.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';

interface RestCall {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  route: string;
  options: Record<string, unknown>;
}

function apiMessagePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: '900',
    channel_id: '200',
    guild_id: '100',
    author: {
      id: '50',
      username: 'HookBot',
      discriminator: '0000',
      global_name: null,
      avatar: null,
      avatar_color: null,
      flags: 0,
    },
    content: 'mensagem do webhook',
    timestamp: '2026-06-01T12:00:00.000Z',
    edited_timestamp: null,
    pinned: false,
    attachments: [
      {
        id: '701',
        filename: 'relatorio.txt',
        url: 'https://cdn.exemplo.com/relatorio.txt',
        size: 12,
        content_type: 'text/plain',
      },
    ],
    embeds: [
      {
        type: 'rich',
        title: 'Resumo',
        description: 'Corpo',
        color: 0x3498DB,
        fields: [{ name: 'Status', value: 'OK', inline: true }],
      },
    ],
    webhook_id: '50',
    ...overrides,
  };
}

function apiWebhookPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: '50',
    guild_id: '100',
    channel_id: '200',
    name: 'logs',
    avatar: null,
    token: 'tok-from-fetch',
    user: {
      id: '999',
      username: 'bot',
      discriminator: '0',
      global_name: null,
      avatar: null,
      avatar_color: null,
      flags: 0,
    },
    ...overrides,
  };
}

function createFakeClient() {
  const client = new Client();
  const restCalls: RestCall[] = [];

  Reflect.set(client.rest, 'get', async (route: string, options: Record<string, unknown> = {}) => {
    restCalls.push({ method: 'GET', route, options });
    if (route.startsWith('/webhooks/50/')) {
      return apiMessagePayload();
    }
    return apiWebhookPayload();
  });
  Reflect.set(client.rest, 'post', async (route: string, options: Record<string, unknown> = {}) => {
    restCalls.push({ method: 'POST', route, options });
    if (route.endsWith('/webhooks')) {
      return apiWebhookPayload({ name: (options['body'] as { name?: string })?.name ?? 'logs' });
    }
    return apiMessagePayload({ id: '901' });
  });
  Reflect.set(client.rest, 'patch', async (route: string, options: Record<string, unknown> = {}) => {
    restCalls.push({ method: 'PATCH', route, options });
    if (route.includes('/messages/')) {
      return apiMessagePayload({ id: '902' });
    }
    const body = (options['body'] ?? {}) as Record<string, unknown>;
    return apiWebhookPayload({
      name: (body['name'] as string | undefined) ?? 'logs',
      avatar: (body['avatar'] as string | null | undefined) ?? null,
      channel_id: (body['channel_id'] as string | undefined) ?? '200',
    });
  });
  Reflect.set(client.rest, 'delete', async (route: string, options: Record<string, unknown> = {}) => {
    restCalls.push({ method: 'DELETE', route, options });
  });

  return { client, restCalls };
}

test('webhooks.send suporta embeds, files binários/URL, allowedMentions e threadID com ou sem content', async t => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('remoto-ok');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const remoteURL = `http://127.0.0.1:${address.port}/nota.txt`;

  const { client, restCalls } = createFakeClient();
  t.after(() => client.destroy());
  const resources = new FluxerResources(client);

  // 1) Envio somente com embeds (content omitido) e allowedMentions seguro por padrão
  const embedOnlyID = await resources.webhooks.send('50', 'secret', {
    embeds: [{ title: 'Alerta', description: 'Sem texto', color: 0x2ECC71 }],
    username: 'Monitor',
    avatarURL: 'https://exemplo.com/avatar.png',
  });
  assert.equal(embedOnlyID, '901');
  assert.equal(restCalls[0]?.method, 'POST');
  assert.equal(restCalls[0]?.route, `${Routes.webhookExecute('50', 'secret')}?wait=true`);
  assert.equal(restCalls[0]?.options['auth'], false);
  assert.deepEqual(restCalls[0]?.options['body'], {
    username: 'Monitor',
    avatar_url: 'https://exemplo.com/avatar.png',
    embeds: [{ title: 'Alerta', description: 'Sem texto', color: 0x2ECC71 }],
    allowed_mentions: { parse: [], replied_user: false },
  });

  // 2) Envio somente com anexos quando content está vazio (''), incluindo binário spoiler e URL remota
  const filesOnlyID = await resources.webhooks.send('50', 'secret', {
    content: '',
    files: [
      { name: 'segredo.bin', data: new Uint8Array([1, 2, 3, 4]), description: 'Binário', spoiler: true },
      { name: 'nota.txt', url: remoteURL },
    ],
    allowedMentions: { parse: ['users'], users: ['10'] },
  });
  assert.equal(filesOnlyID, '901');
  const fileSend = restCalls[1]!;
  assert.equal(fileSend.route, `${Routes.webhookExecute('50', 'secret')}?wait=true`);
  const fileSendBody = fileSend.options['body'] as Record<string, unknown>;
  assert.equal('content' in fileSendBody, false);
  assert.deepEqual(fileSendBody['allowed_mentions'], {
    parse: ['users'],
    users: ['10'],
    replied_user: false,
  });
  const sentFiles = fileSend.options['files'] as { filename: string; data: ArrayBuffer | Uint8Array }[];
  assert.equal(sentFiles.length, 2);
  assert.equal(sentFiles[0]?.filename, 'SPOILER_segredo.bin');
  assert.equal(sentFiles[1]?.filename, 'nota.txt');

  // 3) Envio com threadID propaga ?wait=true&thread_id=... e metadados de spoiler
  const threadSendID = await resources.webhooks.send('50', 'secret', {
    content: 'em thread',
    embeds: [{ title: 'Thread' }],
    files: [{ name: 'log.txt', data: new Uint8Array([65, 66]), spoiler: true, description: 'Log' }],
    threadID: '777',
  });
  assert.equal(threadSendID, '901');
  const threadSend = restCalls[2]!;
  assert.equal(threadSend.route, `${Routes.webhookExecute('50', 'secret')}?wait=true&thread_id=777`);
  assert.equal(threadSend.options['auth'], false);
  assert.deepEqual(threadSend.options['body'], {
    content: 'em thread',
    embeds: [{ description: null, title: 'Thread' }],
    attachments: [{ id: 0, filename: 'SPOILER_log.txt', description: 'Log', flags: MessageAttachmentFlags.IS_SPOILER }],
    allowed_mentions: { parse: [], replied_user: false },
  });
  assert.equal((threadSend.options['files'] as unknown[]).length, 1);
});

test('webhooks.editMessage suporta embeds, files, limpeza de anexos, allowedMentions e threadID', async t => {
  const { client, restCalls } = createFakeClient();
  t.after(() => client.destroy());
  const resources = new FluxerResources(client);

  // Edição padrão sem anexos/threadID
  const editedID = await resources.webhooks.editMessage('50', 'secret', '900', {
    content: 'atualizado',
    embeds: [{ title: 'Editado' }],
    allowedMentions: { parse: ['roles'], roles: ['20'] },
  });
  assert.equal(editedID, '902');
  assert.equal(restCalls[0]?.method, 'PATCH');
  assert.equal(restCalls[0]?.route, Routes.webhookMessage('50', 'secret', '900'));
  assert.deepEqual(restCalls[0]?.options['body'], {
    content: 'atualizado',
    embeds: [{ description: null, title: 'Editado' }],
    allowed_mentions: { parse: ['roles'], roles: ['20'], replied_user: false },
  });

  // Edição com novos anexos e threadID
  await resources.webhooks.editMessage('50', 'secret', '900', {
    content: null,
    files: [{ name: 'novo.bin', data: new Uint8Array([9, 8, 7]), description: 'Novo' }],
    threadID: '888',
  });
  assert.equal(restCalls[1]?.route, `${Routes.webhookMessage('50', 'secret', '900')}?thread_id=888`);
  assert.deepEqual(restCalls[1]?.options['body'], {
    content: null,
    allowed_mentions: { parse: [], replied_user: false },
    attachments: [{ id: 0, filename: 'novo.bin', description: 'Novo' }],
  });
  assert.equal((restCalls[1]?.options['files'] as unknown[]).length, 1);

  // Limpeza de anexos e embeds com arrays vazios
  await resources.webhooks.editMessage('50', 'secret', '900', {
    embeds: [],
    files: [],
  });
  assert.equal(restCalls[2]?.route, Routes.webhookMessage('50', 'secret', '900'));
  assert.deepEqual(restCalls[2]?.options['body'], {
    embeds: [],
    attachments: [],
  });
  assert.equal('files' in (restCalls[2]?.options ?? {}), false);
});

test('webhooks.edit aceita string retrocompatível, avatar (Uint8Array/string/null), channelID e reason', async t => {
  const { client, restCalls } = createFakeClient();
  t.after(() => client.destroy());
  const resources = new FluxerResources(client);

  // String retrocompatível com token
  await resources.webhooks.edit('50', 'secret', 'renomeado');
  assert.equal(restCalls[0]?.route, Routes.webhookExecute('50', 'secret'));
  assert.equal(restCalls[0]?.options['auth'], false);
  assert.deepEqual(restCalls[0]?.options['body'], { name: 'renomeado' });

  // Avatar binário PNG (detecta image/png) + reason com token
  const pngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  await resources.webhooks.edit('50', 'secret', { name: 'com-avatar', avatar: pngHeader }, 'atualizar avatar');
  assert.equal(restCalls[1]?.route, Routes.webhookExecute('50', 'secret'));
  assert.equal(restCalls[1]?.options['auth'], false);
  assert.deepEqual(restCalls[1]?.options['headers'], { 'X-Audit-Log-Reason': 'atualizar%20avatar' });
  assert.deepEqual(restCalls[1]?.options['body'], {
    name: 'com-avatar',
    avatar: `data:image/png;base64,${Buffer.from(pngHeader).toString('base64')}`,
  });

  // Avatar JPEG, GIF, WebP e null para remover
  const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xDB]);
  await resources.webhooks.edit('50', 'secret', { avatar: jpegBytes });
  assert.equal(
    (restCalls[2]?.options['body'] as { avatar: string }).avatar,
    `data:image/jpeg;base64,${Buffer.from(jpegBytes).toString('base64')}`,
  );

  const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  await resources.webhooks.edit('50', 'secret', { avatar: gifBytes });
  assert.equal(
    (restCalls[3]?.options['body'] as { avatar: string }).avatar,
    `data:image/gif;base64,${Buffer.from(gifBytes).toString('base64')}`,
  );

  const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  await resources.webhooks.edit('50', 'secret', { avatar: webpBytes });
  assert.equal(
    (restCalls[4]?.options['body'] as { avatar: string }).avatar,
    `data:image/webp;base64,${Buffer.from(webpBytes).toString('base64')}`,
  );

  await resources.webhooks.edit('50', 'secret', { avatar: 'data:image/png;base64,aW1hZ2Vt' });
  assert.deepEqual(restCalls[5]?.options['body'], { avatar: 'data:image/png;base64,aW1hZ2Vt' });

  await resources.webhooks.edit('50', 'secret', { avatar: null });
  assert.deepEqual(restCalls[6]?.options['body'], { avatar: null });

  // Mudança de channelID sempre usa autenticação do bot (PATCH /webhooks/50) e envia channel_id + reason
  await resources.webhooks.edit('50', null, { name: 'movido', channelID: '201' }, 'mudança de canal');
  assert.equal(restCalls[7]?.route, Routes.webhook('50'));
  assert.equal(restCalls[7]?.options['auth'], true);
  assert.deepEqual(restCalls[7]?.options['headers'], { 'X-Audit-Log-Reason': 'mudan%C3%A7a%20de%20canal' });
  assert.deepEqual(restCalls[7]?.options['body'], { name: 'movido', channel_id: '201' });

  await resources.webhooks.edit('50', 'secret', { channelID: '202' });
  assert.equal(restCalls[8]?.route, Routes.webhook('50'));
  assert.equal(restCalls[8]?.options['auth'], true);
  assert.deepEqual(restCalls[8]?.options['body'], { channel_id: '202' });
});

test('webhooks.fetchMessage e deleteMessage retornam MessageInfo normalizado e suportam threadID', async t => {
  const { client, restCalls } = createFakeClient();
  t.after(() => client.destroy());
  const resources = new FluxerResources(client);

  const message = await resources.webhooks.fetchMessage('50', 'secret', '900');
  assert.equal(restCalls[0]?.method, 'GET');
  assert.equal(restCalls[0]?.route, Routes.webhookMessage('50', 'secret', '900'));
  assert.equal(restCalls[0]?.options['auth'], false);
  assert.equal(message.id, '900');
  assert.equal(message.channelID, '200');
  assert.equal(message.authorID, '50');
  assert.equal(message.authorName, 'HookBot');
  assert.equal(message.content, 'mensagem do webhook');
  assert.equal(message.createdTimestamp, Date.parse('2026-06-01T12:00:00.000Z'));
  assert.equal(message.pinned, false);
  assert.deepEqual(message.attachments, [
    {
      id: '701',
      name: 'relatorio.txt',
      url: 'https://cdn.exemplo.com/relatorio.txt',
      size: 12,
      contentType: 'text/plain',
    },
  ]);
  assert.equal(message.embeds.length, 1);
  assert.equal(message.embeds[0]?.title, 'Resumo');

  await resources.webhooks.fetchMessage('50', 'secret', '900', { threadID: '555' });
  assert.equal(restCalls[1]?.route, `${Routes.webhookMessage('50', 'secret', '900')}?thread_id=555`);

  await resources.webhooks.deleteMessage('50', 'secret', '900', { threadID: '555' });
  assert.equal(restCalls[2]?.method, 'DELETE');
  assert.equal(restCalls[2]?.route, `${Routes.webhookMessage('50', 'secret', '900')}?thread_id=555`);
});

test('autorização verifica ManageWebhooks no canal de origem e destino ao mover channelID e protege fetchMessage', async () => {
  const channels = new Map<string, ChannelInfo>([
    ['200', { id: '200', name: 'origem', guildID: '100', type: 0, parentID: null, position: 0, topic: null, slowmode: 0, nsfw: false }],
    ['201', { id: '201', name: 'destino', guildID: '100', type: 0, parentID: null, position: 1, topic: null, slowmode: 0, nsfw: false }],
    ['301', { id: '301', name: 'outro-servidor', guildID: '101', type: 0, parentID: null, position: 0, topic: null, slowmode: 0, nsfw: false }],
  ]);
  const hook: WebhookInfo = { id: '50', name: 'logs', channelID: '200', guildID: '100', token: 'secret' };
  const calls: unknown[] = [];

  const raw = mockResources({
    channels: {
      get: async id => {
        const found = channels.get(id);
        if (!found) throw new Error(`canal desconhecido: ${id}`);
        return found;
      },
    },
    webhooks: {
      fetch: async () => hook,
      edit: async (id, token, input, reason) => { calls.push(['edit', id, token, input, reason]); },
      fetchMessage: async (id, token, messageID, options) => {
        calls.push(['fetchMessage', id, token, messageID, options]);
        return {
          id: messageID,
          channelID: '200',
          authorID: '50',
          authorName: 'Hook',
          content: 'autorizado',
          createdTimestamp: 1_700_000_000_000,
          pinned: false,
          attachments: [],
          embeds: [],
        };
      },
    },
  });

  // 1) Autor ou bot sem ManageWebhooks no canal de DESTINO ('201') é recusado antes de source.webhooks.edit
  for (const [deniedActor, expectedReason] of [
    ['1', 'PERMISSION_MISSING_AUTHOR'],
    ['999', 'PERMISSION_MISSING_BOT'],
  ] as const) {
    const transport = new MockTransport();
    transport.member = async (_guildID: string, userID: string, channelID?: string): Promise<ModerationMember> => ({
      id: userID,
      owner: false,
      rank: 50,
      permissions: channelID === '201' && userID === deniedActor ? 0n : PermissionFlags.ManageWebhooks,
    });
    const authorized = bindAuthorizedResources(raw, transport, { guildID: '100', authorID: '1' });

    // Editar apenas nome no canal 200 passa
    await authorized.webhooks.edit('50', 'secret', { name: 'ok-no-200' });
    // Manter o mesmo channelID ('200') também passa
    await authorized.webhooks.edit('50', null, { channelID: '200' });
    // Mover para '201' sem ManageWebhooks lá falha!
    await assert.rejects(
      authorized.webhooks.edit('50', null, { channelID: '201' }, 'mover'),
      (err: unknown) => err instanceof GuardError && err.reason === expectedReason,
    );
  }
  assert.equal(calls.length, 4);

  // 2) Mover para canal de outro servidor ('301') é recusado com GuardError
  const fullTransport = new MockTransport();
  fullTransport.member = async (_guildID: string, userID: string): Promise<ModerationMember> => ({
    id: userID,
    owner: false,
    rank: 50,
    permissions: PermissionFlags.ManageWebhooks,
  });
  const authorizedFull = bindAuthorizedResources(raw, fullTransport, { guildID: '100', authorID: '1' });
  await assert.rejects(
    authorizedFull.webhooks.edit('50', null, { channelID: '301' }),
    GuardError,
  );
  assert.equal(calls.length, 4);

  // 3) Com ManageWebhooks em ambos os canais do mesmo servidor, move e propaga reason
  await authorizedFull.webhooks.edit('50', null, { name: 'movido', channelID: '201' }, 'reorganização');
  assert.deepEqual(calls.at(-1), ['edit', '50', null, { name: 'movido', channelID: '201' }, 'reorganização']);

  // 4) fetchMessage exige ManageWebhooks de autor e bot no canal do webhook via CommandContext
  for (const [deniedActor, expectedReason] of [
    ['1', 'PERMISSION_MISSING_AUTHOR'],
    ['999', 'PERMISSION_MISSING_BOT'],
  ] as const) {
    const transport = new MockTransport();
    transport.member = async (_guildID: string, userID: string): Promise<ModerationMember> => ({
      id: userID,
      owner: false,
      rank: 50,
      permissions: userID === deniedActor ? 0n : PermissionFlags.ManageWebhooks,
    });
    const ctx = new CommandContext({
      message: mockMessage('!wh'),
      transport,
      store: new MemoryStore(),
      command: { name: 'wh' },
      cooldown: () => 0,
      resources: raw,
    });
    await assert.rejects(
      ctx.resources.webhooks.fetchMessage('50', 'secret', '900'),
      (err: unknown) => err instanceof GuardError && err.reason === expectedReason,
    );
  }

  const okCtx = new CommandContext({
    message: mockMessage('!wh'),
    transport: fullTransport,
    store: new MemoryStore(),
    command: { name: 'wh' },
    cooldown: () => 0,
    resources: raw,
  });
  const fetched = await okCtx.resources.webhooks.fetchMessage('50', 'secret', '900', { threadID: '777' });
  assert.equal(fetched.content, 'autorizado');
  assert.deepEqual(calls.at(-1), ['fetchMessage', '50', 'secret', '900', { threadID: '777' }]);
});

test('validações de erro em webhooks rejeitam entradas inválidas antes de chamar REST', async t => {
  const { client, restCalls } = createFakeClient();
  t.after(() => client.destroy());
  const resources = new FluxerResources(client);

  await assert.rejects(
    resources.webhooks.send(' ', 'secret', { content: 'oi' }),
    (err: unknown) => isYuzuhaError(err, 'WEBHOOK_ID'),
  );
  await assert.rejects(
    resources.webhooks.send('50', ' ', { content: 'oi' }),
    (err: unknown) => isYuzuhaError(err, 'WEBHOOK_TOKEN'),
  );
  for (const emptyInput of [
    {},
    { content: '' },
    { content: '   ' },
    { content: '', embeds: [], files: [] },
  ] satisfies WebhookSendInput[]) {
    await assert.rejects(
      resources.webhooks.send('50', 'secret', emptyInput),
      (err: unknown) => isYuzuhaError(err, 'WEBHOOK_CONTENT'),
    );
  }

  await assert.rejects(
    resources.webhooks.send('50', 'secret', {
      embeds: Array.from({ length: 11 }, () => ({ title: 'x' })),
    }),
    (err: unknown) => isYuzuhaError(err, 'EMBED_LIMIT'),
  );
  await assert.rejects(
    resources.webhooks.send('50', 'secret', {
      files: Array.from({ length: 11 }, (_, i) => ({ name: `f${i}.txt`, data: new Uint8Array([1]) })),
    }),
    (err: unknown) => isYuzuhaError(err, 'ATTACHMENTS'),
  );
  await assert.rejects(
    resources.webhooks.send('50', 'secret', {
      files: [{ name: 'huge.bin', data: new Uint8Array(10_000_001) }],
    }),
    (err: unknown) => isYuzuhaError(err, 'ATTACHMENTS'),
  );
  await assert.rejects(
    resources.webhooks.send('50', 'secret', {
      files: [{ name: ' ', data: new Uint8Array([1]) }],
    }),
    (err: unknown) => isYuzuhaError(err, 'ATTACHMENT_NAME'),
  );
  await assert.rejects(
    resources.webhooks.send('50', 'secret', {
      files: [{ name: 'bad.txt', url: 'ftp://exemplo.com/a.txt' }],
    }),
    (err: unknown) => isYuzuhaError(err, 'ATTACHMENT_URL'),
  );
  await assert.rejects(
    resources.webhooks.send('50', 'secret', { content: 'oi', threadID: 'nao-numerico' }),
    (err: unknown) => isYuzuhaError(err, 'THREAD_ID'),
  );
  await assert.rejects(
    resources.webhooks.send('50', 'secret', { content: 'oi', allowedMentions: { parse: ['invalid' as never] } }),
    (err: unknown) => isYuzuhaError(err, 'MESSAGE_OPTION'),
  );

  await assert.rejects(
    resources.webhooks.editMessage('50', 'secret', '900', {} as WebhookMessageEditInput),
    (err: unknown) => isYuzuhaError(err, 'WEBHOOK_CONTENT'),
  );
  await assert.rejects(
    resources.webhooks.edit('50', null, {} as WebhookEditInput),
    (err: unknown) => isYuzuhaError(err, 'WEBHOOK_OPTIONS'),
  );
  await assert.rejects(
    resources.webhooks.edit('50', null, { name: '  ' }),
    (err: unknown) => isYuzuhaError(err, 'WEBHOOK_NAME'),
  );
  await assert.rejects(
    resources.webhooks.edit('50', null, { avatar: new Uint8Array(0) }),
    (err: unknown) => isYuzuhaError(err, 'WEBHOOK_AVATAR'),
  );
  await assert.rejects(
    resources.webhooks.edit('50', null, { avatar: 'https://exemplo.com/nao-base64.png' }),
    (err: unknown) => isYuzuhaError(err, 'WEBHOOK_AVATAR'),
  );
  await assert.rejects(
    resources.webhooks.edit('50', null, { channelID: 'abc' }),
    (err: unknown) => isYuzuhaError(err, 'WEBHOOK_CHANNEL'),
  );
  await assert.rejects(
    resources.webhooks.fetchMessage('50', 'secret', ' ', { threadID: '777' }),
    (err: unknown) => isYuzuhaError(err, 'MESSAGE_ID'),
  );
  await assert.rejects(
    resources.webhooks.fetchMessage('50', 'secret', '900', { threadID: 'abc' }),
    (err: unknown) => isYuzuhaError(err, 'THREAD_ID'),
  );

  assert.equal(restCalls.length, 0);
});
