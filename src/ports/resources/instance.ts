/** URLs de endpoint resolvidas da instância Fluxer. */
export interface InstanceEndpointsInfo {
  api: string;
  apiClient: string;
  apiPublic: string;
  gateway: string;
  media: string;
  staticCDN: string;
  marketing: string;
  admin: string;
  invite: string;
  gift: string;
  webapp: string;
}

/** Flags de recursos do documento de descoberta da instância. */
export interface InstanceFeaturesInfo {
  voiceEnabled: boolean;
  stripeEnabled: boolean;
  selfHosted: boolean;
  presignedAttachmentUploads: boolean;
  emailsEnabled: boolean;
}

/** Integrações opcionais de terceiros habilitadas na instância. */
export interface InstanceServicesInfo {
  gif: boolean;
  youtube: boolean;
  bluesky: boolean;
}

/** Descrição normalizada da instância: endpoints resolvidos e descoberta. */
export interface InstanceInfo {
  apiCodeVersion: number | null;
  codename: string | null;
  endpoints: InstanceEndpointsInfo;
  features: InstanceFeaturesInfo | null;
  registrationMode: 'open' | 'approval' | 'closed' | null;
  ssoEnabled: boolean | null;
  ssoEnforced: boolean | null;
  singleCommunity: boolean | null;
  singleCommunityGuildID: string | null;
  directMessagesDisabled: boolean | null;
  services: InstanceServicesInfo | null;
}

/** Informações de conexão do gateway (`GET /gateway/bot`). */
export interface GatewayInfo {
  url: string;
  shards: number;
  sessionStartLimit: {
    total: number;
    remaining: number;
    resetAfter: number;
    maxConcurrency: number;
  } | null;
}

/** Aplicação normalizada de `applications/@me` e `oauth2/applications/@me`. */
export interface ApplicationInfo {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  botPublic: boolean | null;
  botRequireCodeGrant: boolean | null;
  verifyKey: string | null;
  flags: number | null;
  ownerID: string | null;
  botID: string | null;
  redirectURIs: string[];
  clientSecret: string | null;
}

/** Metadados de emoji (`GET /emojis/{id}/metadata`). */
export interface EmojiMetadataInfo {
  id: string;
  guildID: string;
  name: string;
  animated: boolean;
  allowCloning: boolean;
}

/** Metadados de sticker (`GET /stickers/{id}/metadata`). */
export interface StickerMetadataInfo {
  id: string;
  guildID: string;
  name: string;
  animated: boolean;
  allowCloning: boolean;
}

/** Referência de emoji aceita por `resolveEmoji` além do texto. */
export interface EmojiReference {
  name: string;
  id?: string;
  animated?: boolean;
}

/** Introspecção da instância, do gateway e da aplicação do client. */
export interface InstanceResources {
  describe(): Promise<InstanceInfo>;
  gatewayInfo(): Promise<GatewayInfo>;
  application(): Promise<ApplicationInfo>;
  oauthApplications(): Promise<ApplicationInfo[]>;
  emojiMetadata(emojiID: string): Promise<EmojiMetadataInfo>;
  stickerMetadata(stickerID: string): Promise<StickerMetadataInfo>;
  resolveEmoji(emoji: string | EmojiReference, guildID?: string): Promise<string>;
}
