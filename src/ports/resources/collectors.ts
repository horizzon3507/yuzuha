import type { IncomingMessage } from '../../domain/messages.js';

export interface AwaitMessageInput {
  userID?: string;
  contains?: string;
  timeMs: number;
  signal?: AbortSignal;
}

export interface CollectMessagesInput {
  userID?: string;
  contains?: string;
  timeMs?: number;
  max?: number;
  maxBuffer?: number;
  signal?: AbortSignal;
}

export interface CollectReactionsInput {
  messageID: string;
  emojis?: string | string[];
  userID?: string;
  timeMs?: number;
  max?: number;
  maxBuffer?: number;
  signal?: AbortSignal;
}

export interface CollectedMessageInfo extends IncomingMessage {
  id: string;
  channelID: string;
  guildID?: string;
  authorID: string;
  authorName: string;
  authorBot: boolean;
  content: string;
  mentions: string[];
  raw?: unknown;
}

export interface ReactionVote {
  userID: string;
  emoji: string;
  messageID?: string;
}

export interface CollectorsResources {
  awaitMessage(channelID: string, input: AwaitMessageInput): Promise<CollectedMessageInfo | null>;
  awaitReaction(channelID: string, messageID: string, emojis: string | string[],
    timeMs: number, userID?: string, signal?: AbortSignal): Promise<ReactionVote | null>;
  collectMessages(channelID: string, input: CollectMessagesInput): AsyncIterable<CollectedMessageInfo>;
  collectReactions(channelID: string, input: CollectReactionsInput): AsyncIterable<ReactionVote>;
}
