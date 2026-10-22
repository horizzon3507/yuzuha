export interface Embed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline: boolean }[];
  footer?: { text: string };
  image?: { url: string };
  thumbnail?: { url: string };
}

export interface Payload {
  content?: string;
  embeds?: Embed[];
  files?: { url: string; name: string; description?: string }[];
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
