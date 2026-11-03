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
  signal?: AbortSignal;
}

export interface CollectReactionsInput {
  messageID: string;
  emojis?: string | string[];
  userID?: string;
  timeMs?: number;
  max?: number;
  signal?: AbortSignal;
}

export interface CollectedMessageInfo {
  id: string;
  channelID: string;
  authorID: string;
  content: string;
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
