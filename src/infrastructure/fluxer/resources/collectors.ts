import type { Client, Message } from '@fluxerjs/core';
import { MessageCollector, ReactionCollector } from '@fluxerjs/core';
import type { AwaitMessageInput, CollectedMessageInfo, CollectMessagesInput, CollectReactionsInput, CollectorsResources, ReactionVote } from '../../../ports/resources/collectors.js';
import { cancellationError } from '../../../services/cancellation.js';
import { YuzuhaError } from '../../../errors.js';
import { incoming } from '../messages.js';

type ReactionLike = { emojiIdentifier: string; emoji: { name: string }; messageId: string };

function info(message: Message): CollectedMessageInfo {
  return incoming(message);
}

function targets(emojis: string | string[]): string[] {
  return (Array.isArray(emojis) ? emojis : [emojis]).map(value => value.trim().toLowerCase()).filter(Boolean);
}

function matches(reaction: ReactionLike, wanted: string[]): boolean {
  const identifier = reaction.emojiIdentifier.toLowerCase();
  const name = reaction.emoji.name.toLowerCase();
  return wanted.includes(identifier) || wanted.includes(name);
}

function voteInfo(reaction: ReactionLike, userID: string): ReactionVote {
  return { userID, emoji: reaction.emoji.name, messageID: reaction.messageId };
}

function vote(reaction: ReactionLike, userID: string, wanted: string[]): ReactionVote | null {
  return matches(reaction, wanted) ? voteInfo(reaction, userID) : null;
}

const DEFAULT_MAX_BUFFER = 1_000;

function positiveBound(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
}

function resolveMaxBuffer(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_BUFFER;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new YuzuhaError('COLLECTOR_BOUNDS', 'maxBuffer do coletor deve ser um inteiro positivo.');
  }
  return value;
}

function requireBounds(time: number, max: number, signal: AbortSignal | undefined): void {
  if (time <= 0 && max <= 0 && signal === undefined) {
    throw new YuzuhaError('COLLECTOR_BOUNDS', 'Informe um limite para o coletor: timeMs, max ou signal.');
  }
}

class BoundedQueue<T> {
  private slots: Array<T | undefined>;
  private head = 0;
  private itemCount = 0;

  constructor(private readonly capacity: number) {
    this.slots = new Array<T | undefined>(Math.min(capacity, 64));
  }

  enqueue(item: T): void {
    if (this.itemCount === this.slots.length) {
      if (this.slots.length < this.capacity) {
        const nextCapacity = Math.min(this.capacity, this.slots.length * 2);
        const grown = new Array<T | undefined>(nextCapacity);
        for (let i = 0; i < this.itemCount; i++) {
          grown[i] = this.slots[(this.head + i) % this.slots.length];
        }
        this.slots = grown;
        this.head = 0;
      } else {
        this.slots[this.head] = item;
        this.head = (this.head + 1) % this.slots.length;
        return;
      }
    }
    const tail = (this.head + this.itemCount) % this.slots.length;
    this.slots[tail] = item;
    this.itemCount++;
  }

  dequeue(): T | undefined {
    if (this.itemCount === 0) return undefined;
    const item = this.slots[this.head];
    this.slots[this.head] = undefined;
    this.head = (this.head + 1) % this.slots.length;
    this.itemCount--;
    return item;
  }
}

/** Itera itens de um coletor do SDK: enfileira 'collect', encerra no 'end' e limpa ao sair. */
async function* pump<T>(maxBuffer: number, attach: (push: (item: T) => void, finish: () => void) => () => void): AsyncGenerator<T, void> {
  const buffer = new BoundedQueue<T>(maxBuffer);
  let ended = false;
  let waiting: (() => void) | undefined;
  const notify = (): void => { const wake = waiting; waiting = undefined; wake?.(); };
  const detach = attach(item => { buffer.enqueue(item); notify(); }, () => { ended = true; notify(); });
  try {
    for (;;) {
      const item = buffer.dequeue();
      if (item !== undefined) { yield item; continue; }
      if (ended) return;
      await new Promise<void>(resolve => { waiting = resolve; });
    }
  } finally {
    detach();
  }
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
    collectMessages(channelID: string, input: CollectMessagesInput): AsyncIterable<CollectedMessageInfo> {
      const time = positiveBound(input.timeMs);
      const max = positiveBound(input.max);
      const maxBuffer = resolveMaxBuffer(input.maxBuffer);
      requireBounds(time, max, input.signal);
      const filter = input.userID === undefined && input.contains === undefined
        ? undefined
        : (message: Message) =>
          (input.userID === undefined || message.author.id === input.userID) &&
          (input.contains === undefined || message.content.includes(input.contains));
      const signal = input.signal;
      return pump<CollectedMessageInfo>(maxBuffer, (push, finish) => {
        // O SDK exige time ou max; com só signal o teto de max é inalcançável e o abort encerra.
        const collector = new MessageCollector(client, channelID, {
          filter, time, max: time > 0 || max > 0 ? max : Number.MAX_SAFE_INTEGER,
        });
        let collectedCount = 0;
        const abort = (): void => collector.stop('user');
        collector.on('collect', message => {
          push(info(message));
          (collector as { collected?: { clear(): void } }).collected?.clear();
          collectedCount++;
          if (max > 0 && collectedCount >= max) collector.stop('limit');
        });
        collector.on('end', () => finish());
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) collector.stop('user');
        return () => { signal?.removeEventListener('abort', abort); collector.stop('user'); };
      });
    },
    collectReactions(channelID: string, input: CollectReactionsInput): AsyncIterable<ReactionVote> {
      const time = positiveBound(input.timeMs);
      const max = positiveBound(input.max);
      const maxBuffer = resolveMaxBuffer(input.maxBuffer);
      requireBounds(time, max, input.signal);
      if (!input.messageID) throw new YuzuhaError('COLLECTOR_MESSAGE', 'Informe a mensagem (messageID) para coletar reações.');
      const wanted = targets(input.emojis ?? []);
      const signal = input.signal;
      return pump<ReactionVote>(maxBuffer, (push, finish) => {
        const collector = new ReactionCollector(client, input.messageID, channelID, {
          time, max,
          filter: (reaction, user) => (input.userID === undefined || user.id === input.userID)
            && (wanted.length === 0 || matches(reaction, wanted)),
        });
        let collectedCount = 0;
        const abort = (): void => collector.stop('user');
        collector.on('collect', (reaction, user) => {
          push(voteInfo(reaction, user.id));
          (collector as { collected?: { clear(): void } }).collected?.clear();
          collectedCount++;
          if (max > 0 && collectedCount >= max) collector.stop('limit');
        });
        collector.on('end', () => finish());
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) collector.stop('user');
        return () => { signal?.removeEventListener('abort', abort); collector.stop('user'); };
      });
    },
  };
}
