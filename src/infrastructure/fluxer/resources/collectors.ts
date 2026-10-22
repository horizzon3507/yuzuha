import type { Client, Message } from '@fluxerjs/core';
import { MessageCollector, ReactionCollector } from '@fluxerjs/core';
import type { AwaitMessageInput, CollectedMessageInfo, CollectorsResources, ReactionVote } from '../../../ports/resources/collectors.js';
import { cancellationError } from '../../../services/cancellation.js';

function info(message: Message): CollectedMessageInfo {
  return { id: message.id, channelID: message.channelId, authorID: message.author.id, content: message.content };
}

function targets(emojis: string | string[]): string[] {
  return (Array.isArray(emojis) ? emojis : [emojis]).map(value => value.trim().toLowerCase()).filter(Boolean);
}

function vote(reaction: { emojiIdentifier: string; emoji: { name: string } }, userID: string, wanted: string[]): ReactionVote | null {
  const identifier = reaction.emojiIdentifier.toLowerCase();
  const name = reaction.emoji.name.toLowerCase();
  if (!wanted.includes(identifier) && !wanted.includes(name)) return null;
  return { userID, emoji: reaction.emoji.name };
}

export function createCollectorsResources(client: Client): CollectorsResources {
  return {
    awaitMessage(channelID: string, input: AwaitMessageInput): Promise<CollectedMessageInfo | null> {
      if (input.signal?.aborted) return Promise.reject(cancellationError());
      return new Promise<CollectedMessageInfo | null>((resolve, reject) => {
        const filter = input.userID === undefined && input.contains === undefined
          ? undefined
          : (message: Message) =>
            (input.userID === undefined || message.author.id === input.userID) &&
            (input.contains === undefined || message.content.includes(input.contains));
        let settled = false;
        const collector = new MessageCollector(client, channelID, { filter, max: 1, time: input.timeMs });
        const finish = (value: CollectedMessageInfo | null, reason: 'time' | 'limit' | 'user'): void => {
          if (settled) return;
          settled = true;
          input.signal?.removeEventListener('abort', abort);
          try { collector.stop(reason); } finally { resolve(value); }
        };
        const abort = (): void => {
          if (settled) return;
          settled = true;
          input.signal?.removeEventListener('abort', abort);
          try { collector.stop('user'); } finally { reject(cancellationError()); }
        };
        collector.on('collect', message => finish(info(message), 'limit'));
        collector.on('end', collected => {
          if (settled) return;
          const first = [...collected.values()][0];
          finish(first === undefined ? null : info(first), 'time');
        });
        input.signal?.addEventListener('abort', abort, { once: true });
        if (input.signal?.aborted) abort();
      });
    },
    awaitReaction(channelID: string, messageID: string, emojis: string | string[], timeMs: number, userID?: string, signal?: AbortSignal): Promise<ReactionVote | null> {
      if (signal?.aborted) return Promise.reject(cancellationError());
      return new Promise<ReactionVote | null>((resolve, reject) => {
        const wanted = targets(emojis);
        if (wanted.length === 0) { resolve(null); return; }
        let settled = false;
        const collector = new ReactionCollector(client, messageID, channelID, {
          max: 1, time: timeMs,
          filter: (reaction, user) => (userID === undefined || user.id === userID)
            && vote(reaction, user.id, wanted) !== null,
        });
        const finish = (value: ReactionVote | null, reason: 'time' | 'limit' | 'user'): void => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener('abort', abort);
          try { collector.stop(reason); } finally { resolve(value); }
        };
        const abort = (): void => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener('abort', abort);
          try { collector.stop('user'); } finally { reject(cancellationError()); }
        };
        collector.on('collect', (reaction, user) => finish(vote(reaction, user.id, wanted), 'limit'));
        collector.on('end', collected => {
          if (settled) return;
          const first = [...collected.values()][0];
          finish(first === undefined ? null : vote(first.reaction, first.user.id, wanted), 'time');
        });
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
      });
    },
  };
}
