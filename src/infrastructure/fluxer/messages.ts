import type { Message } from '@fluxerjs/core';
import type { IncomingMessage } from '../../contracts.js';

export function incoming(message: Message): IncomingMessage {
  return { id: message.id, content: message.content, channelID: message.channelId,
    guildID: message.guildId ?? undefined, authorID: message.author.id,
    authorName: message.author.username, authorBot: message.author.bot,
    mentions: message.mentions.map(user => user.id), raw: message };
}
