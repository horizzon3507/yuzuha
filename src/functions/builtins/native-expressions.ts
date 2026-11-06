import type { EmojiInfo, StickerInfo } from '../../ports/resources/expressions.js';
import { YuzuhaError } from '../../errors.js';
import { defineFunctions } from './definition.js';
import { emojiBatch } from '../../domain/resource-batches.js';

const EMOJI_PROPERTIES = new Set(['id', 'name', 'animated', 'url', 'mention']);
const STICKER_PROPERTIES = new Set(['id', 'name', 'description', 'tags']);

function emojiProperty(emoji: EmojiInfo, property?: string): unknown {
  if (property === undefined || property === '') return emoji;
  const key = property.toLowerCase();
  if (!EMOJI_PROPERTIES.has(key)) throw new YuzuhaError('EMOJI_PROPERTY', `Propriedade de emoji inválida: ${property}.`);
  if (key === 'mention') return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
  return emoji[key as 'id' | 'name' | 'animated' | 'url'];
}

function stickerProperty(sticker: StickerInfo, property?: string): unknown {
  if (property === undefined || property === '') return sticker;
  const key = property.toLowerCase();
  if (!STICKER_PROPERTIES.has(key)) throw new YuzuhaError('STICKER_PROPERTY', `Propriedade de sticker inválida: ${property}.`);
  return sticker[key as 'id' | 'name' | 'description' | 'tags'];
}

function validEmojiName(name: string): string {
  if (!/^\S{2,32}$/.test(name)) throw new YuzuhaError('EMOJI_NAME', 'Nome de emoji deve ter de 2 a 32 caracteres sem espaços.');
  return name;
}

function validImageURL(url: string): string {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    return url;
  } catch {
    throw new YuzuhaError('EMOJI_URL', 'URL da imagem deve ser HTTP/HTTPS.');
  }
}

export const expressionFunctions = defineFunctions(fn => {
  fn('createEmojisBulk', 'expressions', 1, 1, '[emojis]', 'Cria de 1 a 50 emojis com name e image em base64; retorna success e failed sem ocultar falhas parciais.', async c => {
    const batch = emojiBatch(await c.arg(0));
    return c.ctx.resources.expressions.createEmojisBulk(c.ctx.requireGuild(), batch);
  });
  fn('editEmoji', 'expressions', 2, 3, '[nomeOuID;novoNome;motivo?]', 'Renomeia um emoji do servidor e retorna suas informações.', async c => {
    const guildID = c.ctx.requireGuild();
    const query = (await c.text(0)).trim();
    if (!query) throw new YuzuhaError('EMOJI_QUERY', 'Informe o nome, ID ou menção do emoji.');
    return c.ctx.resources.expressions.editEmoji(guildID, query, validEmojiName(await c.text(1)), c.count > 2 ? await c.text(2) : undefined);
  });
  fn('createSticker', 'expressions', 2, 5, '[nome;imagemBase64;descrição?;tags?;motivo?]', 'Cria sticker com imagem em base64; tags separadas por vírgula.', async c => {
    const guildID = c.ctx.requireGuild();
    const name = stickerName(await c.text(0));
    const image = (await c.text(1)).trim();
    if (!image || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image)) {
      throw new YuzuhaError('STICKER_IMAGE', 'Imagem do sticker deve ser base64 válido, sem prefixo data:.');
    }
    const description = c.count > 2 ? await c.text(2) : undefined;
    if (description !== undefined && description.length > 100) throw new YuzuhaError('STICKER_DESCRIPTION', 'Descrição deve ter no máximo 100 caracteres.');
    const tags = c.count > 3 ? (await c.text(3)).split(',').map(tag => tag.trim()).filter(Boolean) : undefined;
    const reason = c.count > 4 ? await c.text(4) : undefined;
    return c.ctx.resources.expressions.createSticker(guildID, { name, image, description, tags, reason });
  });
  fn('editSticker', 'expressions', 1, 4, '[nomeOuID;novoNome?;descrição?;motivo?]', 'Edita sticker; nome vazio mantém e descrição vazia limpa.', async c => {
    const guildID = c.ctx.requireGuild();
    const query = (await c.text(0)).trim();
    if (!query) throw new YuzuhaError('STICKER_QUERY', 'Informe o nome ou ID do sticker.');
    const rawName = c.count > 1 ? (await c.text(1)).trim() : '';
    const name = rawName ? stickerName(rawName) : undefined;
    const description = c.count > 2 ? await c.text(2) : undefined;
    if (description !== undefined && description.length > 100) throw new YuzuhaError('STICKER_DESCRIPTION', 'Descrição deve ter no máximo 100 caracteres.');
    return c.ctx.resources.expressions.editSticker(guildID, query, {
      name, description, reason: c.count > 3 ? await c.text(3) : undefined,
    });
  });
  fn('deleteSticker', 'expressions', 1, 2, '[nomeOuID;motivo?]', 'Apaga um sticker do servidor.', async c => {
    const guildID = c.ctx.requireGuild();
    const query = (await c.text(0)).trim();
    if (!query) throw new YuzuhaError('STICKER_QUERY', 'Informe o nome ou ID do sticker.');
    await c.ctx.resources.expressions.deleteSticker(guildID, query, c.count > 1 ? await c.text(1) : undefined);
    return '';
  });
  fn('emoji', 'expressions', 1, 2, '[nomeOuID;propriedade?]', 'Busca emoji do servidor por ID, nome ou menção.', async c => {
    const query = await c.text(0);
    if (!query.trim()) throw new YuzuhaError('EMOJI_QUERY', 'Informe o nome, ID ou menção do emoji.');
    const emoji = await c.ctx.resources.expressions.emoji(c.ctx.requireGuild(), query);
    return emojiProperty(emoji, c.count > 1 ? await c.text(1) : undefined);
  });
  fn('emojis', 'expressions', 0, 0, '', 'Lista emojis do servidor atual.', async c =>
    c.ctx.resources.expressions.emojis(c.ctx.requireGuild()));
  fn('createEmoji', 'expressions', 2, 2, '[nome;url]', 'Exige ManageExpressions de autor e bot antes de baixar a imagem por HTTP, converter para base64 e criar emoji no servidor.', async c => {
    const guildID = c.ctx.requireGuild();
    const name = validEmojiName(await c.text(0));
    const url = validImageURL(await c.text(1));
    await c.ctx.requirePermission('ManageExpressions');
    await c.ctx.requirePermission('ManageExpressions', true);
    const response = await c.wait(c.ctx.http.requestBytes({ method: 'GET', url }));
    if (!response.ok) throw new YuzuhaError('EMOJI_IMAGE', `Não foi possível baixar a imagem: HTTP ${response.status}.`);
    return c.ctx.resources.expressions.createEmoji(guildID, name, Buffer.from(response.body).toString('base64'));
  });
  fn('deleteEmoji', 'expressions', 1, 1, '[nomeOuID]', 'Apaga emoji do servidor.', async c => {
    const query = await c.text(0);
    if (!query.trim()) throw new YuzuhaError('EMOJI_QUERY', 'Informe o nome, ID ou menção do emoji.');
    await c.ctx.resources.expressions.deleteEmoji(c.ctx.requireGuild(), query);
    return '';
  });
  fn('sticker', 'expressions', 1, 2, '[nomeOuID;propriedade?]', 'Busca sticker do servidor por ID ou nome.', async c => {
    const query = await c.text(0);
    if (!query.trim()) throw new YuzuhaError('STICKER_QUERY', 'Informe o nome ou ID do sticker.');
    const sticker = await c.ctx.resources.expressions.sticker(c.ctx.requireGuild(), query);
    return stickerProperty(sticker, c.count > 1 ? await c.text(1) : undefined);
  });
  fn('stickers', 'expressions', 0, 0, '', 'Lista stickers do servidor atual.', async c =>
    c.ctx.resources.expressions.stickers(c.ctx.requireGuild()));
});

function stickerName(raw: string): string {
  const value = raw.trim();
  if (value.length < 2 || value.length > 30) throw new YuzuhaError('STICKER_NAME', 'Nome do sticker deve ter de 2 a 30 caracteres.');
  return value;
}
