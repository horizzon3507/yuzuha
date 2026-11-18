import type { Message } from '@fluxerjs/core';
import type { IncomingMessage } from '../../contracts.js';

export function incoming(message: Message): IncomingMessage {
  const rawMentions = message.mentions;
  return {
    id: message.id,
    content: message.content,
    channelID: message.channelId,
    guildID: message.guildId ?? undefined,
    authorID: message.author.id,
    authorName: message.author.username ?? '',
    authorBot: Boolean(message.author.bot),
    mentions: Array.isArray(rawMentions)
      ? rawMentions.map(user => (typeof user === 'string' ? user : user.id))
      : [],
    raw: message,
  };
}
