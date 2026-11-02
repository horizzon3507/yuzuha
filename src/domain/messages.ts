export type EmbedType = 'rich' | 'image' | 'video' | 'gifv' | 'article' | 'link';

/** Imagem, miniatura ou mídia de embed enviado. Alt text opcional em `description`. */
export interface EmbedMedia {
  url: string;
  description?: string;
}

export interface EmbedAuthor {
  name: string;
  url?: string;
  iconURL?: string;
}

export interface EmbedFooter {
  text: string;
  iconURL?: string;
}

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

/** Embed de envio. Campos ausentes não são enviados. */
export interface Embed {
  url?: string;
  title?: string;
  description?: string;
  color?: number;
  /** Data ISO-8601 com fuso, exibida no rodapé do embed. */
  timestamp?: string;
  author?: EmbedAuthor;
  fields?: EmbedField[];
  footer?: EmbedFooter;
  image?: EmbedMedia;
  thumbnail?: EmbedMedia;
}

/** Mídia de embed recebido (somente leitura, preenchida pelo unfurl do Fluxer). */
export interface ReceivedEmbedMedia {
  url: string;
  proxyURL: string | null;
  contentType: string | null;
  width: number | null;
  height: number | null;
  description: string | null;
}

/** Embed recebido em uma mensagem. Os campos de resposta (`type`, `provider`, `video`, `audio`, `nsfw`, `children`) não são enviáveis. */
export interface ReceivedEmbed {
  type: EmbedType;
  url: string | null;
  title: string | null;
  color: number | null;
  timestamp: string | null;
  description: string | null;
  author: { name: string | null; url: string | null; iconURL: string | null } | null;
  image: ReceivedEmbedMedia | null;
  thumbnail: ReceivedEmbedMedia | null;
  footer: { text: string; iconURL: string | null } | null;
  fields: EmbedField[];
  provider: { name: string | null; url: string | null; iconURL: string | null } | null;
  video: ReceivedEmbedMedia | null;
  audio: ReceivedEmbedMedia | null;
  nsfw: boolean;
  children: ReceivedEmbed[];
  html: string | null;
  htmlWidth: number | null;
  htmlHeight: number | null;
}

export type MentionParse = 'users' | 'roles' | 'everyone';

/** Menções permitidas. Ausente = padrão seguro: nenhuma menção e sem ping ao autor respondido. */
export interface AllowedMentionsPolicy {
  parse?: MentionParse[];
  users?: string[];
  roles?: string[];
  repliedUser?: boolean;
}

/** Mensagem alvo de resposta explícita (somente API nativa). */
export interface ReplyTarget {
  channelID: string;
  messageID: string;
  guildID?: string;
}

export interface Payload {
  content?: string;
  embeds?: Embed[];
  files?: { url: string; name: string; description?: string }[];
  allowedMentions?: AllowedMentionsPolicy;
  tts?: boolean;
  stickerIds?: string[];
  flags?: number;
  reply?: ReplyTarget;
}

export interface IncomingMessage {
  id: string;
  content: string;
  authorID: string;
  authorName: string;
  authorBot: boolean;
  channelID: string;
  guildID?: string;
  mentions: string[];
  raw?: unknown;
}
