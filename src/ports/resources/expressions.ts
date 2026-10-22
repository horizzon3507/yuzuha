export interface EmojiInfo {
  id: string;
  name: string;
  animated: boolean;
  url: string | null;
}

export interface StickerInfo {
  id: string;
  name: string;
  description: string | null;
  tags: string | null;
}

export interface ExpressionsResources {
  createEmojisBulk(guildID: string, inputs: EmojiCreateInput[]): Promise<EmojiBulkResult>;
  emoji(guildID: string, nameOrID: string): Promise<EmojiInfo>;
  emojis(guildID: string): Promise<EmojiInfo[]>;
  createEmoji(guildID: string, name: string, image: string, reason?: string): Promise<EmojiInfo>;
  deleteEmoji(guildID: string, nameOrID: string, reason?: string): Promise<void>;
  sticker(guildID: string, nameOrID: string): Promise<StickerInfo>;
  stickers(guildID: string): Promise<StickerInfo[]>;
  editEmoji(guildID: string, nameOrID: string, name: string, reason?: string): Promise<EmojiInfo>;
  createSticker(guildID: string, input: StickerCreateInput): Promise<StickerInfo>;
  editSticker(guildID: string, nameOrID: string, input: StickerEditInput): Promise<StickerInfo>;
  deleteSticker(guildID: string, nameOrID: string, reason?: string): Promise<void>;
  cloneEmoji(guildID: string, sourceID: string): Promise<EmojiInfo>;
  cloneSticker(guildID: string, sourceID: string): Promise<StickerInfo>;
}

export interface EmojiCreateInput { name: string; image: string }
export interface EmojiBulkResult {
  success: EmojiInfo[];
  failed: { name: string; error: string }[];
}

export interface StickerEditInput {
  name?: string;
  description?: string;
  reason?: string;
}

export interface StickerCreateInput extends StickerEditInput {
  name: string;
  /** Imagem em base64, conforme o contrato do SDK. */
  image: string;
  tags?: string[];
}
