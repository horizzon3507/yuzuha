import type { AttachmentSpec, BinaryAttachmentSpec } from './common.js';
import type { APIMessage } from '@fluxerjs/types';
import type { MessageSearchInput, PinnedMessagesInput, PurgeInput } from '../../domain/message-query.js';
import type { ReceivedEmbed } from '../../domain/messages.js';
import type { UserInfo } from './users.js';
export type { MessageSearchInput, PinnedMessagesInput, PurgeInput } from '../../domain/message-query.js';

export interface AttachmentInfo {
  description?: string | null;
  spoiler?: boolean;
  id: string;
  name: string;
  url: string;
  size: number;
  contentType: string | null;
}

export interface MessageInfo {
  guildID?: string | null;
  author?: UserInfo;
  partial?: boolean;
  flags?: string;
  type?: number;
  tts?: boolean;
  nonce?: string | null;
  webhookId?: string | null;
  editedAt?: string | null;
  mentionEveryone?: boolean;
  mentionRoles?: string[];
  mentions?: UserInfo[];
  nsfwEmojis?: string[];
  messageReference?: { channelId: string; messageId: string; guildId: string | null; type?: number } | null;
  messageSnapshots?: MessageSnapshotInfo[];
  stickers?: MessageStickerInfo[];
  reactions?: ReactionInfo[];
  call?: { participants: string[]; endedAt: string | null } | null;
  thread?: import('./threads.js').ThreadInfo | null;
  referencedMessage?: Pick<MessageInfo, 'id' | 'channelID' | 'authorID' | 'content'> | null;
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

export interface MessageStickerInfo {
  id: string; name: string; description: string; tags: string[]; animated: boolean;
  url: string; createdTimestamp: number; createdAt: string;
}
export interface MessageSnapshotInfo {
  content: string | null; createdAt: string; editedAt: string | null;
  mentionUserIds: string[]; mentionRoles: string[]; type?: number;
  embeds: ReceivedEmbed[]; attachments: AttachmentInfo[]; stickers: MessageStickerInfo[];
}
export interface ReactionInfo {
  messageID: string; channelID: string; guildID: string | null;
  count: number; me: boolean; emoji: { id?: string; name: string; animated?: boolean }; emojiIdentifier: string;
}

export interface MessagesResources {
  preload(channelIDs: string[]): Promise<Record<string, MessageInfo | null>>;
  cached?(channelID: string, messageID: string): Promise<MessageInfo | null>;
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
  deleteAttachment(channelID: string, messageID: string, attachmentID: string): Promise<void>;
  sendTo(channelID: string, content: string): Promise<string>;
  bulkDelete(channelID: string, messageIDs: string[], options?: BulkDeleteOptions): Promise<string[]>;
  /** Opcional em adaptadores próprios; sem ele, `ctx.purge` lança `NATIVE_UNAVAILABLE`. */
  purge?(channelID: string, input: PurgeInput): Promise<PurgeResult>;
  bulkDeleteOwn(channelID: string): Promise<void>;
  acknowledgePins(channelID: string): Promise<void>;
  clearReadState(channelID: string): Promise<void>;
  purgeDM(channelID: string): Promise<number>;
}

export interface MessageCursor { before?: string; after?: string; around?: string }

/** Opções de `bulkDelete`. `fallback: 'each'` repete a exclusão mensagem a mensagem quando a rota em lote falha. */
export interface BulkDeleteOptions {
  fallback?: 'each';
}

/** Resultado de `messages.purge`. */
export interface PurgeResult {
  /** Mensagens apagadas vindas da listagem do canal; os IDs de `include` apagados não contam aqui. */
  deleted: number;
  /** Todos os IDs apagados, incluindo os de `include` que foram removidos. */
  deletedIDs: string[];
  /** Caminho usado: rota em lote ou exclusão individual após falha da rota. */
  via: 'bulk' | 'each';
}
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
