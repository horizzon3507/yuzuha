import { userID } from '../../domain/values.js';
import { YuzuhaError } from '../../errors.js';
import type { AttachmentSpec, BinaryAttachmentSpec } from '../../ports/resources/common.js';
import type { GuildEditInput } from '../../ports/resources/users.js';
import type { ThreadEditInput } from '../../ports/resources/threads.js';
import type { FunctionCall } from '../types.js';
import { defineFunctions } from './definition.js';
import { messageSearchInput } from '../../domain/message-query.js';

async function required(c: FunctionCall, index: number, label: string): Promise<string> {
  const value = (await c.text(index)).trim();
  if (!value) throw new YuzuhaError('ARGUMENT', `${label} é obrigatório.`);
  return value;
}
async function number(c: FunctionCall, index: number, fallback: number, min: number, max: number): Promise<number> {
  const value = c.count > index ? (await c.text(index)).trim() : '';
  const result = value ? Number(value) : fallback;
  if (!Number.isSafeInteger(result) || result < min || result > max) throw new YuzuhaError('ARGUMENT', `Valor deve ser inteiro entre ${min} e ${max}.`);
  return result;
}
async function permissions(c: FunctionCall, name: string): Promise<string> {
  const guildID = c.ctx.requireGuild();
  await c.ctx.requirePermission(name);
  await c.ctx.requirePermission(name, true);
  return guildID;
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new YuzuhaError('OPTIONS', 'Opções devem ser um objeto.');
  if (Object.keys(value).some(key => !keys.includes(key))) throw new YuzuhaError('OPTIONS', 'Propriedade de opções desconhecida.');
  return value as Record<string, unknown>;
}
function base64(raw: string): Uint8Array {
  if (!raw || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw)) {
    throw new YuzuhaError('ATTACHMENT_BASE64', 'Informe base64 válido, sem prefixo data:.');
  }
  return Buffer.from(raw, 'base64');
}
function attachment(value: unknown): AttachmentSpec | BinaryAttachmentSpec {
  const file = object(value, ['url', 'base64', 'name', 'description']);
  if (typeof file.name !== 'string' || !file.name.trim() || file.name.length > 255) throw new YuzuhaError('ATTACHMENT_NAME', 'Nome de anexo deve ter de 1 a 255 caracteres.');
  if (file.description !== undefined && typeof file.description !== 'string') throw new YuzuhaError('ATTACHMENT_DESCRIPTION', 'Descrição deve ser texto.');
  if ((file.url === undefined) === (file.base64 === undefined)) throw new YuzuhaError('ATTACHMENT', 'Informe somente url ou base64 por anexo.');
  const common = { name: file.name, description: file.description as string | undefined };
  if (typeof file.base64 === 'string') return { ...common, data: base64(file.base64) };
  if (typeof file.url !== 'string' || !/^https?:\/\//i.test(file.url)) throw new YuzuhaError('ATTACHMENT_URL', 'URL deve ser HTTP/HTTPS.');
  return { ...common, url: file.url };
}

export const resourceExtras = defineFunctions(fn => {
  fn('dm', 'messages', 2, 2, '[usuário;conteúdo]', 'Envia mensagem direta e retorna o ID; não menciona usuários automaticamente.', async c =>
    c.ctx.resources.messages.dm(userID(await c.text(0)), await required(c, 1, 'Conteúdo')));
  fn('forward', 'messages', 3, 3, '[destino;canalOrigem;mensagem]', 'Encaminha uma mensagem para outro canal e retorna o novo ID.', async c =>
    c.ctx.resources.messages.forward(await required(c, 0, 'Destino'), await required(c, 1, 'Canal de origem'), await required(c, 2, 'Mensagem')));
  fn('searchMessages', 'messages', 1, 5, '[texto;canal?;limite?;cursor?;autor?]', 'Busca mensagens; retorna indexing, messages, total e cursor. Cursor é array retornado pela página anterior.', async c => {
    const content = await required(c, 0, 'Texto');
    const channelID = c.count > 1 ? (await c.text(1)).trim() || undefined : undefined;
    const limit = await number(c, 2, 25, 1, 100);
    const rawCursor = c.count > 3 ? await c.arg(3) : '';
    if (rawCursor !== '' && (!Array.isArray(rawCursor) || rawCursor.some(item => typeof item !== 'string'))) throw new YuzuhaError('MESSAGE_CURSOR', 'Cursor de busca deve ser array de textos.');
    const author = c.count > 4 ? (await c.text(4)).trim() : '';
    return c.ctx.resources.messages.search(messageSearchInput({ content, channelID, guildID: c.ctx.guildID || undefined, limit,
      cursor: rawCursor === '' ? undefined : rawCursor as string[], authorID: author ? userID(author) : undefined }));
  });
  fn('searchMessagesAdvanced', 'messages', 1, 1, '[opções]', 'Busca por filtros de conteúdo, IDs, autores, menções, anexos, datas e ordem; texto é opcional. Até 100 resultados, opções de até 32 KiB; page ou cursor exclusivos.', async c => {
    const input = messageSearchInput(await c.arg(0));
    if (input.guildID !== undefined) throw new YuzuhaError('MESSAGE_OPTIONS', 'guildID é definido pelo contexto do comando.');
    return c.ctx.resources.messages.search({ ...input, guildID: c.ctx.guildID || undefined,
      ...(!c.ctx.guildID && input.channelID === undefined ? { channelID: c.ctx.message.channelID } : {}) });
  });
  fn('fileBase64', 'messages', 2, 3, '[base64;nome;descrição?]', 'Monta um anexo base64 para $sendAttachments, sem enviá-lo.', async c => {
    const file = { base64: await c.text(0), name: await c.text(1), description: c.count > 2 ? await c.text(2) : undefined };
    attachment(file);
    return file;
  });
  fn('sendFileBase64', 'messages', 3, 4, '[canal;base64;nome;conteúdo?]', 'Decodifica base64 e envia um anexo binário, retornando o ID.', async c =>
    c.ctx.resources.messages.sendBytes(await required(c, 0, 'Canal'), [{ data: base64(await c.text(1)), name: await required(c, 2, 'Nome') }], c.count > 3 ? await c.text(3) : undefined));
  fn('sendAttachments', 'messages', 2, 3, '[canal;array;conteúdo?]', 'Envia de 1 a 10 anexos URL/base64 na mesma mensagem, com até 10 MB de bytes.', async c => {
    const channelID = await required(c, 0, 'Canal');
    const raw = await c.arg(1);
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > 10) throw new YuzuhaError('ATTACHMENTS', 'Envie um array de 1 a 10 anexos.');
    return c.ctx.resources.messages.sendAttachments(channelID, raw.map(attachment), c.count > 2 ? await c.text(2) : undefined);
  });
  fn('searchMembers', 'users', 1, 3, '[nome;limite?;offset?]', 'Busca membros por nome; retorna members, total, hasMore e indexing.', async c =>
    c.ctx.members.search(await required(c, 0, 'Nome'), await number(c, 1, 25, 1, 100), await number(c, 2, 0, 0, Number.MAX_SAFE_INTEGER)));
  fn('nickname', 'users', 3, 3, '[usuário;apelido;motivo]', 'Altera apelido com permissões e hierarquia; vazio remove. Retorna o membro.', async c =>
    c.ctx.members.setNickname(await c.text(0), await c.text(1) || null, await c.text(2)));
  fn('editGuild', 'users', 1, 1, '[opções]', 'Edita nome, ícone, banner, canal de sistema/AFK e timeout AFK; exige ManageGuild de autor e bot.', async c => {
    const guildID = await permissions(c, 'ManageGuild');
    const options = object(await c.arg(0), ['name', 'icon', 'banner', 'systemChannelID', 'afkChannelID', 'afkTimeout']);
    for (const [key, value] of Object.entries(options)) {
      if (key === 'afkTimeout') {
        if (!Number.isSafeInteger(value) || Number(value) < 0) throw new YuzuhaError('GUILD_OPTIONS', 'afkTimeout deve ser inteiro a partir de 0.');
      } else if (typeof value !== 'string' && !(key !== 'name' && value === null)) throw new YuzuhaError('GUILD_OPTIONS', `${key} deve ser texto${key === 'name' ? '' : ' ou null'}.`);
    }
    if (options.name !== undefined && (!String(options.name).trim() || String(options.name).length > 100)) throw new YuzuhaError('GUILD_OPTIONS', 'Nome deve ter de 1 a 100 caracteres.');
    return c.ctx.resources.users.editGuild(guildID, options as GuildEditInput);
  });
  fn('editThread', 'threads', 2, 2, '[thread;opções]', 'Edita nome, arquivamento, bloqueio, duração, slowmode e tags; exige ManageChannels.', async c => {
    await permissions(c, 'ManageChannels');
    const threadID = await required(c, 0, 'Thread');
    const input = object(await c.arg(1), ['name', 'archived', 'locked', 'autoArchiveDuration', 'slowmode', 'tags', 'reason']);
    for (const [key, value] of Object.entries(input)) {
      if (['archived', 'locked'].includes(key) && typeof value !== 'boolean') throw new YuzuhaError('THREAD_OPTIONS', `${key} deve ser booleano.`);
      if (['name', 'reason'].includes(key) && typeof value !== 'string') throw new YuzuhaError('THREAD_OPTIONS', `${key} deve ser texto.`);
      if (key === 'name' && (!String(value).trim() || String(value).length > 100)) throw new YuzuhaError('THREAD_OPTIONS', 'Nome deve ter de 1 a 100 caracteres.');
      if (key === 'autoArchiveDuration' && (typeof value !== 'number' || ![60, 1440, 4320, 10080].includes(value))) throw new YuzuhaError('THREAD_OPTIONS', 'Arquivamento inválido.');
      if (key === 'slowmode' && (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 21600)) throw new YuzuhaError('THREAD_OPTIONS', 'Slowmode deve estar entre 0 e 21600.');
      if (key === 'tags' && (!Array.isArray(value) || value.length > 5 || value.some(tag => typeof tag !== 'string'))) throw new YuzuhaError('THREAD_OPTIONS', 'Tags devem ser array de até 5 IDs.');
    }
    return c.ctx.resources.threads.edit(threadID, input as ThreadEditInput);
  });
  for (const method of ['join', 'leave'] as const) {
    fn(`${method}Thread`, 'threads', 1, 1, '[thread]', method === 'join' ? 'Faz o bot entrar na thread.' : 'Faz o bot sair da thread.', async c => {
      c.ctx.requireGuild();
      await c.ctx.resources.threads[method](await required(c, 0, 'Thread'));
      return '';
    });
  }
  fn('searchThreads', 'threads', 1, 4, '[canal;nome?;limite?;offset?]', 'Busca threads; retorna threads, total, hasMore, indexing e retryAfter.', async c => {
    c.ctx.requireGuild();
    return c.ctx.resources.threads.search(await required(c, 0, 'Canal'), {
      name: c.count > 1 ? await c.text(1) : undefined,
      limit: await number(c, 2, 25, 1, 25), offset: await number(c, 3, 0, 0, 9975),
    });
  });
  fn('invites', 'invites', 0, 0, '', 'Lista convites do servidor; exige ManageGuild de autor e bot.', async c =>
    c.ctx.resources.invites.list(await permissions(c, 'ManageGuild')));
  fn('vanity', 'invites', 0, 0, '', 'Obtém código e usos do convite personalizado do servidor.', async c =>
    c.ctx.resources.invites.vanity(c.ctx.requireGuild()));
  fn('setVanity', 'invites', 1, 1, '[código]', 'Define convite personalizado; vazio remove. Exige ManageGuild.', async c => {
    const guildID = await permissions(c, 'ManageGuild');
    const code = (await c.text(0)).trim();
    if (code && !/^[a-zA-Z0-9_-]{2,32}$/.test(code)) throw new YuzuhaError('VANITY', 'Código deve ter de 2 a 32 letras, números, _ ou -.');
    return c.ctx.resources.invites.setVanity(guildID, code || null);
  });
  for (const method of ['cloneEmoji', 'cloneSticker'] as const) {
    fn(method, 'expressions', 1, 1, '[idOrigem]', 'Clona expressão de outro servidor para o atual; exige ManageExpressions.', async c =>
      c.ctx.resources.expressions[method](await permissions(c, 'ManageExpressions'), await required(c, 0, 'ID de origem')));
  }
});
