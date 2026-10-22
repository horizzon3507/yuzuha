export interface AwaitMessageInput {
  userID?: string;
  contains?: string;
  timeMs: number;
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
}

export interface CollectorsResources {
  awaitMessage(channelID: string, input: AwaitMessageInput): Promise<CollectedMessageInfo | null>;
  awaitReaction(channelID: string, messageID: string, emojis: string | string[],
    timeMs: number, userID?: string, signal?: AbortSignal): Promise<ReactionVote | null>;
}
