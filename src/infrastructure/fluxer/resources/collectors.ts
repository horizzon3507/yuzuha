import { types } from 'node:util';
import type { Client, Message } from '@fluxerjs/core';
import { MessageCollector, ReactionCollector } from '@fluxerjs/core';
import type {
  AwaitMessageInput,
  AwaitReactionInput,
  AwaitReactionOptions,
  CollectedMessageInfo,
  CollectMessagesInput,
  CollectReactionsInput,
  CollectorsResources,
  ReactionVote,
} from '../../../ports/resources/collectors.js';
import { cancellationError } from '../../../services/cancellation.js';
import { YuzuhaError } from '../../../errors.js';
import { incoming } from '../messages.js';

type ReactionLike = { emojiIdentifier: string; emoji: { name: string }; messageId: string };

interface NormalizedAwaitReaction {
  messageID: string;
  emojis: string | string[] | undefined;
  emojisExplicit: boolean;
  timeMs: number;
  userID: string | undefined;
  signal: AbortSignal | undefined;
  filter: ((vote: ReactionVote) => boolean) | undefined;
}

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

function assertSyncFilter<T>(filter: unknown): ((item: T) => boolean) | undefined {
  if (filter === undefined) return undefined;
  if (typeof filter !== 'function' || types.isAsyncFunction(filter) || types.isGeneratorFunction(filter)) {
    throw new YuzuhaError('COLLECTOR_BOUNDS', 'filter do coletor deve ser uma função síncrona.');
  }
  return filter as (item: T) => boolean;
}

function evaluateFilter<T>(
  predicate: ((item: T) => boolean) | undefined,
  item: T,
  fail: (error: unknown) => void,
): boolean {
  if (predicate === undefined) return true;
  let matched: unknown;
  try {
    matched = predicate(item);
  } catch (error) {
    fail(error);
    return false;
  }
  if (typeof matched !== 'boolean') {
    if (matched !== null && (typeof matched === 'object' || typeof matched === 'function')) {
      const then = (matched as { then?: unknown }).then;
      if (typeof then === 'function') {
        void Promise.resolve(matched).catch(() => {});
      }
    }
    fail(new YuzuhaError('COLLECTOR_BOUNDS', 'filter do coletor deve retornar um booleano síncrono.'));
    return false;
  }
  return matched;
}

function normalizeAwaitReaction(
  messageIDOrInput: string | AwaitReactionInput,
  emojis?: string | string[],
  timeMs?: number,
  userIDOrOptions?: string | AwaitReactionOptions,
  signal?: AbortSignal,
  filter?: (vote: ReactionVote) => boolean,
): NormalizedAwaitReaction {
  if (typeof messageIDOrInput === 'object' && messageIDOrInput !== null) {
    const predicate = assertSyncFilter<ReactionVote>(messageIDOrInput.filter);
    if (!messageIDOrInput.messageID) {
      throw new YuzuhaError('COLLECTOR_MESSAGE', 'Informe a mensagem (messageID) para aguardar reações.');
    }
    return {
      messageID: messageIDOrInput.messageID,
      emojis: messageIDOrInput.emojis,
      emojisExplicit: messageIDOrInput.emojis !== undefined,
      timeMs: messageIDOrInput.timeMs,
      userID: messageIDOrInput.userID,
      signal: messageIDOrInput.signal,
      filter: predicate,
    };
  }
  if (typeof userIDOrOptions === 'object' && userIDOrOptions !== null) {
    return {
      messageID: messageIDOrInput,
      emojis,
      emojisExplicit: true,
      timeMs: timeMs!,
      userID: userIDOrOptions.userID,
      signal: userIDOrOptions.signal,
      filter: assertSyncFilter<ReactionVote>(userIDOrOptions.filter),
    };
  }
  return {
    messageID: messageIDOrInput,
    emojis,
    emojisExplicit: true,
    timeMs: timeMs!,
    userID: userIDOrOptions,
    signal,
    filter: assertSyncFilter<ReactionVote>(filter),
  };
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

/** Itera itens de um coletor do SDK: enfileira 'collect', encerra no 'end' e limpa ao sair ou falhar. */
async function* pump<T>(
  maxBuffer: number,
  attach: (push: (item: T) => void, finish: () => void, fail: (error: unknown) => void) => () => void,
): AsyncGenerator<T, void> {
  const buffer = new BoundedQueue<T>(maxBuffer);
  let ended = false;
  let failed = false;
  let failure: unknown;
  let waiting: (() => void) | undefined;
  let detached = false;
  let detach: (() => void) | undefined;
  const notify = (): void => { const wake = waiting; waiting = undefined; wake?.(); };
  const cleanup = (): void => {
    if (detached) return;
    detached = true;
    detach?.();
  };
  detach = attach(
    item => { if (!ended && !failed) { buffer.enqueue(item); notify(); } },
    () => { ended = true; notify(); },
    error => {
      if (failed) return;
      failed = true;
      failure = error;
      cleanup();
      notify();
    },
  );
  if (failed) cleanup();
  try {
    for (;;) {
      const item = buffer.dequeue();
      if (item !== undefined) { yield item; continue; }
      if (failed) throw failure;
      if (ended) return;
      await new Promise<void>(resolve => { waiting = resolve; });
    }
  } finally {
    cleanup();
  }
}

export function createCollectorsResources(client: Client): CollectorsResources {
  function awaitReaction(
    channelID: string,
    messageIDOrInput: string | AwaitReactionInput,
    emojis?: string | string[],
    timeMs?: number,
    userIDOrOptions?: string | AwaitReactionOptions,
    signal?: AbortSignal,
    filter?: (vote: ReactionVote) => boolean,
  ): Promise<ReactionVote | null> {
    let parsed: NormalizedAwaitReaction;
    try {
      parsed = normalizeAwaitReaction(messageIDOrInput, emojis, timeMs, userIDOrOptions, signal, filter);
    } catch (error) {
      return Promise.reject(error);
    }
    if (parsed.signal?.aborted) return Promise.reject(cancellationError());
    return new Promise<ReactionVote | null>((resolve, reject) => {
      const wanted = parsed.emojis === undefined ? [] : targets(parsed.emojis);
      if (parsed.emojisExplicit && wanted.length === 0) { resolve(null); return; }
      let settled = false;
      let lastMatched: ReactionVote | undefined;
      let collector: ReactionCollector | undefined;
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        parsed.signal?.removeEventListener('abort', abort);
        try { collector?.stop('user'); } finally { reject(error); }
      };
      collector = new ReactionCollector(client, parsed.messageID, channelID, {
        max: 1,
        time: parsed.timeMs,
        filter: (reaction, user) => {
          lastMatched = undefined;
          if (parsed.userID !== undefined && user.id !== parsed.userID) return false;
          if (wanted.length > 0 && !matches(reaction, wanted)) return false;
          const candidate = voteInfo(reaction, user.id);
          if (!evaluateFilter(parsed.filter, candidate, fail)) return false;
          lastMatched = candidate;
          return true;
        },
      });
      const finish = (value: ReactionVote | null, reason: 'time' | 'limit' | 'user'): void => {
        if (settled) return;
        settled = true;
        parsed.signal?.removeEventListener('abort', abort);
        try { collector!.stop(reason); } finally { resolve(value); }
      };
      const abort = (): void => fail(cancellationError());
      collector.on('collect', (reaction, user) => finish(lastMatched ?? voteInfo(reaction, user.id), 'limit'));
      collector.on('end', collected => {
        if (settled) return;
        const first = [...collected.values()][0];
        finish(first === undefined ? null : (lastMatched ?? voteInfo(first.reaction, first.user.id)), 'time');
      });
      parsed.signal?.addEventListener('abort', abort, { once: true });
      if (parsed.signal?.aborted) abort();
    });
  }

  return {
    awaitMessage(channelID: string, input: AwaitMessageInput): Promise<CollectedMessageInfo | null> {
      let predicate: ((message: CollectedMessageInfo) => boolean) | undefined;
      try {
        predicate = assertSyncFilter<CollectedMessageInfo>(input.filter);
      } catch (error) {
        return Promise.reject(error);
      }
      if (input.signal?.aborted) return Promise.reject(cancellationError());
      return new Promise<CollectedMessageInfo | null>((resolve, reject) => {
        let settled = false;
        let lastMatched: CollectedMessageInfo | undefined;
        let collector: MessageCollector | undefined;
        const fail = (error: unknown): void => {
          if (settled) return;
          settled = true;
          input.signal?.removeEventListener('abort', abort);
          try { collector?.stop('user'); } finally { reject(error); }
        };
        const hasFilter = input.userID !== undefined || input.contains !== undefined || predicate !== undefined;
        const filter = !hasFilter
          ? undefined
          : (message: Message): boolean => {
            lastMatched = undefined;
            if (input.userID !== undefined && message.author.id !== input.userID) return false;
            if (input.contains !== undefined && !message.content.includes(input.contains)) return false;
            if (predicate === undefined) return true;
            const mapped = info(message);
            if (!evaluateFilter(predicate, mapped, fail)) return false;
            lastMatched = mapped;
            return true;
          };
        collector = new MessageCollector(client, channelID, { filter, max: 1, time: input.timeMs });
        const finish = (value: CollectedMessageInfo | null, reason: 'time' | 'limit' | 'user'): void => {
          if (settled) return;
          settled = true;
          input.signal?.removeEventListener('abort', abort);
          try { collector!.stop(reason); } finally { resolve(value); }
        };
        const abort = (): void => fail(cancellationError());
        collector.on('collect', message => finish(lastMatched ?? info(message), 'limit'));
        collector.on('end', collected => {
          if (settled) return;
          const first = [...collected.values()][0];
          finish(first === undefined ? null : (lastMatched ?? info(first)), 'time');
        });
        input.signal?.addEventListener('abort', abort, { once: true });
        if (input.signal?.aborted) abort();
      });
    },
    awaitReaction: awaitReaction as CollectorsResources['awaitReaction'],
    collectMessages(channelID: string, input: CollectMessagesInput): AsyncIterable<CollectedMessageInfo> {
      const time = positiveBound(input.timeMs);
      const max = positiveBound(input.max);
      const maxBuffer = resolveMaxBuffer(input.maxBuffer);
      const predicate = assertSyncFilter<CollectedMessageInfo>(input.filter);
      requireBounds(time, max, input.signal);
      const signal = input.signal;
      return pump<CollectedMessageInfo>(maxBuffer, (push, finish, fail) => {
        let collector: MessageCollector | undefined;
        let stopped = false;
        let lastMatched: CollectedMessageInfo | undefined;
        const stop = (): void => {
          if (stopped) return;
          stopped = true;
          signal?.removeEventListener('abort', abort);
          collector?.stop('user');
        };
        const onFail = (error: unknown): void => {
          stop();
          fail(error);
        };
        const hasFilter = input.userID !== undefined || input.contains !== undefined || predicate !== undefined;
        const filter = !hasFilter
          ? undefined
          : (message: Message): boolean => {
            lastMatched = undefined;
            if (input.userID !== undefined && message.author.id !== input.userID) return false;
            if (input.contains !== undefined && !message.content.includes(input.contains)) return false;
            if (predicate === undefined) return true;
            const mapped = info(message);
            if (!evaluateFilter(predicate, mapped, onFail)) return false;
            lastMatched = mapped;
            return true;
          };
        // O SDK exige time ou max; com só signal o teto de max é inalcançável e o abort encerra.
        collector = new MessageCollector(client, channelID, {
          filter, time, max: time > 0 || max > 0 ? max : Number.MAX_SAFE_INTEGER,
        });
        let collectedCount = 0;
        const abort = (): void => collector!.stop('user');
        collector.on('collect', message => {
          const item = lastMatched ?? info(message);
          lastMatched = undefined;
          push(item);
          (collector as { collected?: { clear(): void } }).collected?.clear();
          collectedCount++;
          if (max > 0 && collectedCount >= max) collector!.stop('limit');
        });
        collector.on('end', () => finish());
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) collector.stop('user');
        if (stopped) collector.stop('user');
        return stop;
      });
    },
    collectReactions(channelID: string, input: CollectReactionsInput): AsyncIterable<ReactionVote> {
      const time = positiveBound(input.timeMs);
      const max = positiveBound(input.max);
      const maxBuffer = resolveMaxBuffer(input.maxBuffer);
      const predicate = assertSyncFilter<ReactionVote>(input.filter);
      requireBounds(time, max, input.signal);
      if (!input.messageID) throw new YuzuhaError('COLLECTOR_MESSAGE', 'Informe a mensagem (messageID) para coletar reações.');
      const wanted = targets(input.emojis ?? []);
      const signal = input.signal;
      return pump<ReactionVote>(maxBuffer, (push, finish, fail) => {
        let collector: ReactionCollector | undefined;
        let stopped = false;
        let lastMatched: ReactionVote | undefined;
        const stop = (): void => {
          if (stopped) return;
          stopped = true;
          signal?.removeEventListener('abort', abort);
          collector?.stop('user');
        };
        const onFail = (error: unknown): void => {
          stop();
          fail(error);
        };
        collector = new ReactionCollector(client, input.messageID, channelID, {
          time, max,
          filter: (reaction, user) => {
            lastMatched = undefined;
            if (input.userID !== undefined && user.id !== input.userID) return false;
            if (wanted.length > 0 && !matches(reaction, wanted)) return false;
            if (predicate === undefined) return true;
            const candidate = voteInfo(reaction, user.id);
            if (!evaluateFilter(predicate, candidate, onFail)) return false;
            lastMatched = candidate;
            return true;
          },
        });
        let collectedCount = 0;
        const abort = (): void => collector!.stop('user');
        collector.on('collect', (reaction, user) => {
          const item = lastMatched ?? voteInfo(reaction, user.id);
          lastMatched = undefined;
          push(item);
          (collector as { collected?: { clear(): void } }).collected?.clear();
          collectedCount++;
          if (max > 0 && collectedCount >= max) collector!.stop('limit');
        });
        collector.on('end', () => finish());
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) collector.stop('user');
        if (stopped) collector.stop('user');
        return stop;
      });
    },
  };
}
