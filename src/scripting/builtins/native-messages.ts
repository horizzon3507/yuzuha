import type { MessageInfo } from '../../ports/resources/messages.js';
import { YuzuhaError } from '../../errors.js';
import { defineFunctions } from './definition.js';
import { preloadChannels } from '../../domain/resource-batches.js';
import { pinnedMessagesInput, reactionUsersInput } from '../../domain/message-query.js';

const PROPERTIES: Record<string, (info: MessageInfo) => unknown> = {
  id: info => info.id,
  conteudo: info => info.content,
  content: info => info.content,
  autor: info => info.authorID,
  authorid: info => info.authorID,
  authorname: info => info.authorName,
  autorname: info => info.authorName,
  canal: info => info.channelID,
  channelid: info => info.channelID,
  criadoem: info => info.createdTimestamp,
  createdtimestamp: info => info.createdTimestamp,
  fixada: info => info.pinned,
  pinned: info => info.pinned,
  anexos: info => info.attachments,
  attachments: info => info.attachments,
};

function attachmentUrl(raw: string): string {
  const url = raw.trim();
  if (!/^https?:\/\/\S+$/i.test(url)) throw new YuzuhaError('ATTACHMENT_URL', 'URL do anexo inválida. Use http(s)://...');
  return url;
}

function attachmentName(url: string, raw?: string): string {
  const name = raw?.trim() ?? '';
  if (name) return name;
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    if (last) return decodeURIComponent(last);
  } catch { /* usa padrão abaixo */ }
  return 'arquivo';
}

function messageLimit(raw: string, fallback: number): number {
  const value = raw.trim();
  if (!value) return fallback;
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new YuzuhaError('MESSAGE_LIMIT', 'Limite deve ser um inteiro entre 1 e 100.');
  }
  return limit;
}

export const resourceMessageFunctions = defineFunctions(fn => {
  fn('preloadMessages', 'messages', 1, 1, '[canais]', 'Busca a última mensagem de até 100 canais; recebe array de IDs e retorna objeto por canal.', async c => {
    return c.ctx.resources.messages.preload(preloadChannels(await c.arg(0)));
  });
  fn('removeReaction', 'messages', 2, 4, '[mensagem;emoji;usuário?;canal?]', 'Remove a reação do bot ou de um usuário da mensagem.', async c => {
    const messageID = required(await c.text(0), 'ID da mensagem');
    const emoji = required(await c.text(1), 'Emoji');
    const user = c.count > 2 ? (await c.text(2)).trim() : '';
    const userID = user ? user.replace(/^<@!?(\d+)>$/, '$1') : undefined;
    const channelID = c.count > 3 ? (await c.text(3)).trim() || c.ctx.message.channelID : c.ctx.message.channelID;
    await c.ctx.resources.messages.removeReaction(channelID, messageID, emoji, userID);
    return '';
  });
  fn('clearReactions', 'messages', 1, 3, '[mensagem;emoji?;canal?]', 'Remove todas as reações ou somente as de um emoji.', async c => {
    const messageID = required(await c.text(0), 'ID da mensagem');
    const emoji = c.count > 1 ? (await c.text(1)).trim() || undefined : undefined;
    const channelID = c.count > 2 ? (await c.text(2)).trim() || c.ctx.message.channelID : c.ctx.message.channelID;
    await c.ctx.resources.messages.clearReactions(channelID, messageID, emoji);
    return '';
  });
  fn('reactionUsers', 'messages', 2, 5, '[mensagem;emoji;limite?;após?;canal?]', 'Lista IDs de usuários que reagiram; limite de 1 a 100 e cursor por usuário.', async c => {
    const messageID = required(await c.text(0), 'ID da mensagem');
    const emoji = required(await c.text(1), 'Emoji');
    const limit = c.count > 2 ? messageLimit(await c.text(2), 100) : 100;
    const after = c.count > 3 ? (await c.text(3)).trim() || undefined : undefined;
    const channelID = c.count > 4 ? (await c.text(4)).trim() || c.ctx.message.channelID : c.ctx.message.channelID;
    return c.ctx.resources.messages.reactionUsers(channelID, messageID, emoji, limit, after);
  });
  fn('reactionUsersPage', 'messages', 2, 5, '[mensagem;emoji;limite?;após?;canal?]', 'Retorna users com IDs, hasMore e nextAfter; limite de 1 a 100 e cursor por usuário.', async c => {
    const messageID = required(await c.text(0), 'ID da mensagem');
    const emoji = required(await c.text(1), 'Emoji');
    const rawLimit = c.count > 2 ? (await c.text(2)).trim() : '';
    const rawAfter = c.count > 3 ? (await c.text(3)).trim() || undefined : undefined;
    const { limit, after } = reactionUsersInput({ limit: rawLimit ? Number(rawLimit) : undefined, after: rawAfter });
    const channelID = c.count > 4 ? (await c.text(4)).trim() || c.ctx.message.channelID : c.ctx.message.channelID;
    return c.ctx.resources.messages.reactionUsersPage(channelID, messageID, emoji, limit, after);
  });
  fn('fetchMessage', 'messages', 2, 3, '[canal;mensagem;propriedade?]', 'Busca uma mensagem e retorna objeto ou propriedade.', async c => {
    const channelID = (await c.text(0)).trim(), messageID = (await c.text(1)).trim();
    if (!channelID) throw new YuzuhaError('MESSAGE_CHANNEL', 'Canal da mensagem é obrigatório.');
    if (!messageID) throw new YuzuhaError('MESSAGE_ID', 'ID da mensagem é obrigatório.');
    const info = await c.ctx.resources.messages.fetch(channelID, messageID);
    if (c.count < 3) return info;
    return lookup(info, await c.text(2));
  });
  fn('messages', 'messages', 1, 5, '[canal;limite?;before?;after?;around?]', 'Lista mensagens, da mais recente para a mais antiga; aceita somente um cursor por chamada.', async c => {
    const channelID = (await c.text(0)).trim();
    if (!channelID) throw new YuzuhaError('MESSAGE_CHANNEL', 'Canal da mensagem é obrigatório.');
    const limit = c.count > 1 ? messageLimit(await c.text(1), 20) : 20;
    if (c.count <= 2) return c.ctx.resources.messages.list(channelID, limit);
    const cursor: { before?: string; after?: string; around?: string } = {};
    for (const [index, key] of [[2, 'before'], [3, 'after'], [4, 'around']] as const) {
      const value = c.count > index ? (await c.text(index)).trim() : '';
      if (value) cursor[key] = value;
    }
    if (Object.keys(cursor).length > 1) throw new YuzuhaError('MESSAGE_CURSOR', 'Use somente um cursor: before, after ou around.');
    return c.ctx.resources.messages.list(channelID, limit, cursor);
  });
  fn('pin', 'messages', 1, 2, '[mensagem;canal?]', 'Fixa uma mensagem no canal.', async c => {
    const messageID = (await c.text(0)).trim();
    if (!messageID) throw new YuzuhaError('MESSAGE_ID', 'ID da mensagem é obrigatório.');
    const channelID = c.count > 1 && (await c.text(1)).trim() ? (await c.text(1)).trim() : c.ctx.message.channelID;
    await c.ctx.resources.messages.pin(channelID, messageID);
    return '';
  });
  fn('unpin', 'messages', 1, 2, '[mensagem;canal?]', 'Desafixa uma mensagem do canal.', async c => {
    const messageID = (await c.text(0)).trim();
    if (!messageID) throw new YuzuhaError('MESSAGE_ID', 'ID da mensagem é obrigatório.');
    const channelID = c.count > 1 && (await c.text(1)).trim() ? (await c.text(1)).trim() : c.ctx.message.channelID;
    await c.ctx.resources.messages.unpin(channelID, messageID);
    return '';
  });
  fn('pinnedMessages', 'messages', 0, 2, '[canal?;limite?]', 'Lista mensagens fixadas, da mais recente para a mais antiga.', async c => {
    const first = c.count > 0 ? (await c.text(0)).trim() : '';
    const channelID = first ? first : c.ctx.message.channelID;
    return c.ctx.resources.messages.pinned(channelID, c.count > 1 ? messageLimit(await c.text(1), 20) : undefined);
  });
  fn('pinnedMessagesPage', 'messages', 0, 3, '[canal?;limite?;before?]', 'Pagina mensagens por data de fixação; retorna messages, pinnedAt, hasMore e nextBefore. Cursor ISO da página anterior.', async c => {
    const channelID = c.count > 0 ? (await c.text(0)).trim() || c.ctx.message.channelID : c.ctx.message.channelID;
    const limit = c.count > 1 ? messageLimit(await c.text(1), 50) : 50;
    const before = c.count > 2 ? (await c.text(2)).trim() || undefined : undefined;
    return c.ctx.resources.messages.pinnedPage(channelID, pinnedMessagesInput({ limit, before }));
  });
  fn('sendFiles', 'messages', 2, 4, '[canal;url;nome?;conteudo?]', 'Envia um anexo e retorna o ID da mensagem.', async c => {
    const channelID = (await c.text(0)).trim();
    if (!channelID) throw new YuzuhaError('MESSAGE_CHANNEL', 'Canal da mensagem é obrigatório.');
    const url = attachmentUrl(await c.text(1));
    const name = attachmentName(url, c.count > 2 ? await c.text(2) : undefined);
    const content = c.count > 3 ? await c.text(3) : undefined;
    return c.ctx.resources.messages.sendFiles(channelID, [{ url, name }],
      content === undefined || content === '' ? undefined : content);
  });
  fn('attachment', 'messages', 1, 2, '[url;nome?]', 'Monta especificação de anexo sem enviar.', async c => {
    const url = attachmentUrl(await c.text(0));
    return { url, name: attachmentName(url, c.count > 1 ? await c.text(1) : undefined) };
  });
});

function required(raw: string, label: string): string {
  const value = raw.trim();
  if (!value) throw new YuzuhaError('MESSAGE_ARGUMENT', `${label} é obrigatório.`);
  return value;
}

function lookup(info: MessageInfo, raw: string): unknown {
  const key = raw.trim().toLowerCase();
  if (!key) return info;
  const property = Object.hasOwn(PROPERTIES, key) ? PROPERTIES[key] : undefined;
  if (!property) throw new YuzuhaError('MESSAGE_PROPERTY', `Propriedade desconhecida: ${raw.trim()}.`);
  return property(info);
}
