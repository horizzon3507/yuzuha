import type { AttachmentSpec, BinaryAttachmentSpec } from './common.js';

export interface AttachmentInfo {
  id: string;
  name: string;
  url: string;
  size: number;
  contentType: string | null;
}

export interface MessageInfo {
  id: string;
  channelID: string;
  authorID: string;
  authorName: string;
  content: string;
  createdTimestamp: number;
  pinned: boolean;
  attachments: AttachmentInfo[];
}

export interface MessagesResources {
  preload(channelIDs: string[]): Promise<Record<string, MessageInfo | null>>;
  fetch(channelID: string, messageID: string): Promise<MessageInfo>;
  list(channelID: string, limit?: number, cursor?: MessageCursor): Promise<MessageInfo[]>;
  pin(channelID: string, messageID: string): Promise<void>;
  unpin(channelID: string, messageID: string): Promise<void>;
  pinned(channelID: string, limit?: number): Promise<MessageInfo[]>;
  sendFiles(channelID: string, files: AttachmentSpec[], content?: string): Promise<string>;
  removeReaction(channelID: string, messageID: string, emoji: string, userID?: string): Promise<void>;
  clearReactions(channelID: string, messageID: string, emoji?: string): Promise<void>;
  reactionUsers(channelID: string, messageID: string, emoji: string, limit?: number, after?: string): Promise<string[]>;
  dm(userID: string, content: string): Promise<string>;
  forward(channelID: string, sourceChannelID: string, messageID: string): Promise<string>;
  search(input: MessageSearchInput): Promise<MessageSearchPage>;
  sendBytes(channelID: string, files: BinaryAttachmentSpec[], content?: string): Promise<string>;
  sendAttachments(channelID: string, files: (AttachmentSpec | BinaryAttachmentSpec)[], content?: string): Promise<string>;
}

export interface MessageCursor { before?: string; after?: string; around?: string }
export interface MessageSearchInput {
  content: string;
  guildID?: string;
  channelID?: string;
  authorID?: string;
  limit?: number;
  cursor?: string[];
}
export interface MessageSearchPage {
  indexing: boolean;
  messages: MessageInfo[];
  total: number;
  cursor: string[] | null;
}
