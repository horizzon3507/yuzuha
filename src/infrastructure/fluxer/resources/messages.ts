import { AttachmentBuilder, Message } from '@fluxerjs/core';
import type { Client } from '@fluxerjs/core';
import { limitOf } from '../../../ports/resources/common.js';
import type { AttachmentSpec, BinaryAttachmentSpec } from '../../../ports/resources/common.js';
import { YuzuhaError } from '../../../errors.js';
import type { MessageInfo, MessagesResources } from '../../../ports/resources/messages.js';
import { preloadChannels } from '../../../domain/resource-batches.js';
import { messageSearchInput, pinnedMessagesInput } from '../../../domain/message-query.js';

function info(message: Message): MessageInfo {
  return {
    id: message.id, channelID: message.channelId, authorID: message.author.id,
    authorName: message.author.username, content: message.content,
    createdTimestamp: message.createdAt.getTime(), pinned: message.pinned,
    attachments: [...message.attachments.values()].map(attachment => ({
      id: attachment.id, name: attachment.filename, url: attachment.url ?? '',
      size: attachment.size, contentType: attachment.contentType,
    })),
  };
}

function order(messages: MessageInfo[]): MessageInfo[] {
  return [...messages].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
}

export function createMessagesResources(client: Client): MessagesResources {
  const send = async (channelID: string, files: (AttachmentSpec | BinaryAttachmentSpec)[], content?: string): Promise<string> => {
    if (files.length < 1 || files.length > 10 || files.reduce((size, file) => size + ('data' in file ? file.data.byteLength : 0), 0) > 10_000_000) {
      throw new YuzuhaError('ATTACHMENTS', 'Envie de 1 a 10 anexos, com até 10 MB de bytes no total.');
    }
    const builders = files.map(file => {
      if (!file.name.trim() || file.name.length > 255) throw new YuzuhaError('ATTACHMENT_NAME', 'Nome de anexo deve ter de 1 a 255 caracteres.');
      return new AttachmentBuilder('data' in file ? Buffer.from(file.data) : file.url,
        { name: file.name, description: file.description });
    });
    return (await client.channels.send(channelID, { content, files: builders,
      attachments: builders.map((builder, id) => builder.toJSON(id)),
      allowedMentions: { parse: [], repliedUser: false },
    })).id;
  };
  return {
    async preload(channelIDs) {
      const ids = preloadChannels(channelIDs);
      const result = await client.preloadMessages(ids);
      return Object.fromEntries(ids.map(id => [id, result[id] ? info(new Message(client, result[id])) : null]));
    },
    async fetch(channelID: string, messageID: string): Promise<MessageInfo> {
      return info(await client.channels.fetchMessage(channelID, messageID));
    },
    async list(channelID, limit, cursor = {}): Promise<MessageInfo[]> {
      if (Object.values(cursor).filter(value => value !== undefined).length > 1) {
        throw new YuzuhaError('MESSAGE_CURSOR', 'Use apenas um cursor: before, after ou around.');
      }
      const channel = await client.channels.fetch(channelID, { force: true });
      if (!channel.isTextBased()) throw new YuzuhaError('CHANNEL_TEXT', 'Canal sem suporte a mensagens.');
      const messages = await channel.messages.fetch({ limit: limitOf(limit, 20, 100), ...cursor });
      return order([...messages.values()].map(info));
    },
    async pin(channelID: string, messageID: string): Promise<void> {
      await (await client.channels.fetchMessage(channelID, messageID)).pin();
    },
    async unpin(channelID: string, messageID: string): Promise<void> {
      await (await client.channels.fetchMessage(channelID, messageID)).unpin();
    },
    async pinned(channelID: string, limit?: number): Promise<MessageInfo[]> {
      if (limit !== undefined) limit = pinnedMessagesInput({ limit }).limit;
      const channel = await client.channels.fetch(channelID, { force: true });
      if (!channel.isTextBased()) throw new YuzuhaError('CHANNEL_TEXT', 'Canal sem suporte a mensagens.');
      const messages = limit === undefined
        ? await channel.fetchPinnedMessages()
        : await channel.fetchPinnedMessagesPage({ limit }).then(page => page.messages);
      return order(messages.map(info));
    },
    async pinnedPage(channelID, input) {
      const options = pinnedMessagesInput(input);
      const channel = await client.channels.fetch(channelID, { force: true });
      if (!channel.isTextBased()) throw new YuzuhaError('CHANNEL_TEXT', 'Canal sem suporte a mensagens.');
      const page = await channel.fetchPinnedMessagesPage(options);
      return { messages: page.messages.map(info), pinnedAt: [...page.pinnedAt], hasMore: page.hasMore,
        nextBefore: page.hasMore ? page.pinnedAt.at(-1) ?? null : null };
    },
    sendFiles: send,
    async dm(userID, content): Promise<string> {
      const user = await client.users.fetch(userID);
      return (await user.send({ content, allowedMentions: { parse: [], repliedUser: false } })).id;
    },
    async forward(channelID, sourceChannelID, messageID): Promise<string> {
      return (await client.channels.send(channelID, {
        forward: { channelId: sourceChannelID, messageId: messageID },
        allowedMentions: { parse: [], repliedUser: false },
      })).id;
    },
    async search(rawInput) {
      const input = messageSearchInput(rawInput);
      const result = await client.searchMessages({ content: input.content,
        contextGuildId: input.guildID, contextChannelId: input.channelID,
        channelIds: input.channelIDs ?? (input.channelID ? [input.channelID] : undefined),
        authorIds: input.authorIDs ?? (input.authorID ? [input.authorID] : undefined),
        hitsPerPage: limitOf(input.limit, 25, 100), cursor: input.cursor,
        ...(input.contents === undefined ? {} : { contents: input.contents }),
        ...(input.exactPhrases === undefined ? {} : { exactPhrases: input.exactPhrases }),
        ...(input.excludeChannelIDs === undefined ? {} : { excludeChannelIds: input.excludeChannelIDs }),
        ...(input.excludeAuthorIDs === undefined ? {} : { excludeAuthorIds: input.excludeAuthorIDs }),
        ...(input.authorType === undefined ? {} : { authorType: input.authorType }),
        ...(input.excludeAuthorType === undefined ? {} : { excludeAuthorType: input.excludeAuthorType }),
        ...(input.mentions === undefined ? {} : { mentions: input.mentions }),
        ...(input.excludeMentions === undefined ? {} : { excludeMentions: input.excludeMentions }),
        ...(input.mentionEveryone === undefined ? {} : { mentionEveryone: input.mentionEveryone }),
        ...(input.pinned === undefined ? {} : { pinned: input.pinned }),
        ...(input.includeNsfw === undefined ? {} : { includeNsfw: input.includeNsfw }),
        ...(input.has === undefined ? {} : { has: input.has }),
        ...(input.excludeHas === undefined ? {} : { excludeHas: input.excludeHas }),
        ...(input.minID === undefined ? {} : { minId: input.minID }),
        ...(input.maxID === undefined ? {} : { maxId: input.maxID }),
        ...(input.sortBy === undefined ? {} : { sortBy: input.sortBy }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        ...(input.page === undefined ? {} : { page: input.page }) });
      if ('indexing' in result) return { indexing: true, messages: [], total: 0, cursor: null };
      return { indexing: false, messages: result.messages.map(data => info(new Message(client, data))),
        total: result.total, cursor: result.cursor ?? null };
    },
    sendBytes: send,
    sendAttachments: send,
    async removeReaction(channelID, messageID, emoji, userID): Promise<void> {
      await (await client.channels.fetchMessage(channelID, messageID)).removeReaction(emoji, userID);
    },
    async clearReactions(channelID, messageID, emoji): Promise<void> {
      const message = await client.channels.fetchMessage(channelID, messageID);
      if (emoji === undefined) await message.removeAllReactions();
      else await message.removeReactionEmoji(emoji);
    },
    async reactionUsers(channelID, messageID, emoji, limit = 100, after): Promise<string[]> {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new YuzuhaError('MESSAGE_LIMIT', 'Limite deve ser um inteiro entre 1 e 100.');
      }
      const message = await client.channels.fetchMessage(channelID, messageID);
      return (await message.fetchReactionUsers(emoji, { limit, after })).map(user => user.id);
    },
  };
}
