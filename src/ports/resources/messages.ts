import type { AttachmentSpec, BinaryAttachmentSpec } from './common.js';
import type { APIMessage } from '@fluxerjs/types';
import type { MessageSearchInput, PinnedMessagesInput } from '../../domain/message-query.js';
import type { ReceivedEmbed } from '../../domain/messages.js';
export type { MessageSearchInput, PinnedMessagesInput } from '../../domain/message-query.js';

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
  /** Embeds recebidos, normalizados em camelCase e somente leitura. */
  embeds: ReceivedEmbed[];
}

export interface MessagesResources {
  preload(channelIDs: string[]): Promise<Record<string, MessageInfo | null>>;
  fetch(channelID: string, messageID: string): Promise<MessageInfo>;
  list(channelID: string, limit?: number, cursor?: MessageCursor): Promise<MessageInfo[]>;
  pin(channelID: string, messageID: string): Promise<void>;
  unpin(channelID: string, messageID: string): Promise<void>;
  pinned(channelID: string, limit?: number): Promise<MessageInfo[]>;
  pinnedPage(channelID: string, input?: PinnedMessagesInput): Promise<PinnedMessagesPage>;
  sendFiles(channelID: string, files: AttachmentSpec[], content?: string): Promise<string>;
  removeReaction(channelID: string, messageID: string, emoji: string, userID?: string): Promise<void>;
  clearReactions(channelID: string, messageID: string, emoji?: string): Promise<void>;
  reactionUsers(channelID: string, messageID: string, emoji: string, limit?: number, after?: string): Promise<string[]>;
  reactionUsersPage(channelID: string, messageID: string, emoji: string, limit?: number, after?: string): Promise<ReactionUsersPage>;
  dm(userID: string, content: string): Promise<string>;
  forward(channelID: string, sourceChannelID: string, messageID: string): Promise<string>;
  search(input: MessageSearchInput): Promise<MessageSearchPage>;
  searchAll(input: MessageSearchInput): Promise<MessageSearchPage>;
  bulkFetch(requests: BulkFetchRequest[], input?: BulkFetchInput): Promise<MessageInfo[] | BulkFetchRawChannel[]>;
  sendBytes(channelID: string, files: BinaryAttachmentSpec[], content?: string): Promise<string>;
  sendAttachments(channelID: string, files: (AttachmentSpec | BinaryAttachmentSpec)[], content?: string): Promise<string>;
  bulkDelete(channelID: string, messageIDs: string[]): Promise<string[]>;
  bulkDeleteOwn(channelID: string): Promise<void>;
  acknowledgePins(channelID: string): Promise<void>;
  clearReadState(channelID: string): Promise<void>;
}

export interface MessageCursor { before?: string; after?: string; around?: string }
export interface PinnedMessagesPage {
  messages: MessageInfo[];
  pinnedAt: string[];
  hasMore: boolean;
  nextBefore: string | null;
}
export interface ReactionUsersPage {
  users: string[];
  hasMore: boolean;
  nextAfter: string | null;
}
export interface MessageSearchPage {
  indexing: boolean;
  messages: MessageInfo[];
  total: number;
  cursor: string[] | null;
}

/** Janela de mensagens de um canal dentro de um `bulkFetch`. */
export interface BulkFetchRequest {
  channelID: string;
  limit: number;
  before?: string;
  after?: string;
  around?: string;
}

export interface BulkFetchInput {
  /** `false` retorna o payload bruto da API; o padrão hidrata e normaliza. */
  hydrate?: boolean;
}

/** Canal do retorno bruto de `bulkFetch` quando `hydrate` é `false`. */
export interface BulkFetchRawChannel {
  channelID: string;
  messages: APIMessage[];
}
