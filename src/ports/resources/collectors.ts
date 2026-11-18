import type { IncomingMessage } from '../../domain/messages.js';

export interface AwaitMessageInput {
  userID?: string;
  contains?: string;
  timeMs: number;
  signal?: AbortSignal;
  filter?: (message: CollectedMessageInfo) => boolean;
}

export interface AwaitReactionOptions {
  userID?: string;
  signal?: AbortSignal;
  filter?: (vote: ReactionVote) => boolean;
}

export interface AwaitReactionInput extends AwaitReactionOptions {
  messageID: string;
  emojis?: string | string[];
  timeMs: number;
}

export interface CollectMessagesInput {
  userID?: string;
  contains?: string;
  timeMs?: number;
  max?: number;
  maxBuffer?: number;
  signal?: AbortSignal;
  filter?: (message: CollectedMessageInfo) => boolean;
}

export interface CollectReactionsInput {
  messageID: string;
  emojis?: string | string[];
  userID?: string;
  timeMs?: number;
  max?: number;
  maxBuffer?: number;
  signal?: AbortSignal;
  filter?: (vote: ReactionVote) => boolean;
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
  awaitReaction(channelID: string, input: AwaitReactionInput): Promise<ReactionVote | null>;
  awaitReaction(
    channelID: string,
    messageID: string,
    emojis: string | string[],
    timeMs: number,
    options?: AwaitReactionOptions,
  ): Promise<ReactionVote | null>;
  awaitReaction(
    channelID: string,
    messageID: string,
    emojis: string | string[],
    timeMs: number,
    userID?: string,
    signal?: AbortSignal,
    filter?: (vote: ReactionVote) => boolean,
  ): Promise<ReactionVote | null>;
  collectMessages(channelID: string, input: CollectMessagesInput): AsyncIterable<CollectedMessageInfo>;
  collectReactions(channelID: string, input: CollectReactionsInput): AsyncIterable<ReactionVote>;
}
