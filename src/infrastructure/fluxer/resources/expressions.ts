import type { Client, GuildEmoji, GuildSticker } from '@fluxerjs/core';
import { YuzuhaError } from '../../../errors.js';
import { emojiBatch } from '../../../domain/resource-batches.js';
import type { EmojiInfo, ExpressionsResources, StickerInfo } from '../../../ports/resources/expressions.js';

function toEmojiInfo(emoji: GuildEmoji): EmojiInfo {
  return { id: emoji.id, name: emoji.name, animated: emoji.animated, url: emoji.url ?? null };
}

function toStickerInfo(sticker: GuildSticker): StickerInfo {
  return {
    id: sticker.id,
    name: sticker.name,
    description: sticker.description || null,
    tags: sticker.tags.length ? sticker.tags.join(', ') : null,
  };
}

function mentionEmojiID(value: string): string | null {
  return value.match(/^<a?:[^:>]+:(\d+)>$/)?.[1] ?? null;
}

export function createExpressionsResources(client: Client): ExpressionsResources {
  const guild = (guildID: string) => client.guilds.resolve(guildID);

  const resolveEmoji = async (guildID: string, nameOrID: string): Promise<GuildEmoji> => {
    const server = await guild(guildID);
    const mentionID = mentionEmojiID(nameOrID.trim());
    const id = mentionID ?? (/^\d+$/.test(nameOrID.trim()) ? nameOrID.trim() : null);
    if (id) return server.fetchEmoji(id);
    const wanted = nameOrID.trim().toLowerCase();
    const all = await server.fetchEmojis();
    const found = all.find(emoji => emoji.name.toLowerCase() === wanted || emoji.id === nameOrID.trim());
    if (!found) throw new YuzuhaError('EMOJI_NOT_FOUND', `Emoji "${nameOrID}" não encontrado.`);
    return found;
  };

  const resolveSticker = async (guildID: string, nameOrID: string): Promise<GuildSticker> => {
    const server = await guild(guildID);
    const wanted = nameOrID.trim();
    if (/^\d+$/.test(wanted)) {
      return server.fetchSticker(wanted);
    }
    const all = await server.fetchStickers();
    const lower = wanted.toLowerCase();
    const found = all.find(sticker => sticker.id === wanted || sticker.name.toLowerCase() === lower);
    if (!found) throw new YuzuhaError('STICKER_NOT_FOUND', `Sticker "${nameOrID}" não encontrado.`);
    return found;
  };

  return {
    createEmojisBulk: async (guildID, inputs) => {
      const batch = emojiBatch(inputs);
      if (!guildID) throw new YuzuhaError('GUILD_REQUIRED', 'Esta operação exige um servidor.');
      const result = await (await guild(guildID)).createEmojisBulk(batch);
      return { success: result.success.map(toEmojiInfo), failed: result.failed.map(item => ({ name: item.name, error: item.error })) };
    },
    emoji: async (guildID, nameOrID) => toEmojiInfo(await resolveEmoji(guildID, nameOrID)),
    emojis: async guildID => (await (await guild(guildID)).fetchEmojis()).map(toEmojiInfo),
    createEmoji: async (guildID, name, image, reason) =>
      toEmojiInfo(await (await guild(guildID)).createEmoji({ name, image, reason })),
    deleteEmoji: async (guildID, nameOrID, reason) => {
      await (await resolveEmoji(guildID, nameOrID)).delete(reason);
    },
    sticker: async (guildID, nameOrID) => toStickerInfo(await resolveSticker(guildID, nameOrID)),
    stickers: async guildID => (await (await guild(guildID)).fetchStickers()).map(toStickerInfo),
    editEmoji: async (guildID, nameOrID, name, reason) =>
      toEmojiInfo(await (await resolveEmoji(guildID, nameOrID)).edit({ name, reason })),
    createSticker: async (guildID, input) =>
      toStickerInfo(await (await guild(guildID)).createSticker(input)),
    editSticker: async (guildID, nameOrID, input) =>
      toStickerInfo(await (await resolveSticker(guildID, nameOrID)).edit(input)),
    deleteSticker: async (guildID, nameOrID, reason) => {
      await (await resolveSticker(guildID, nameOrID)).delete(reason);
    },
    cloneEmoji: async (guildID, sourceID) => toEmojiInfo(await (await guild(guildID)).cloneEmoji(sourceID)),
    cloneSticker: async (guildID, sourceID) => toStickerInfo(await (await guild(guildID)).cloneSticker(sourceID)),
  };
}
