export interface InviteInfo {
  code: string;
  url: string;
  guildID: string | null;
  channelID: string | null;
  inviterID: string | null;
  uses: number | null;
  maxUses: number | null;
  expiresTimestamp: number | null;
}

export interface InviteCreateInput {
  maxAge?: number;
  maxUses?: number;
  temporary?: boolean;
  unique?: boolean;
  reason?: string;
}

export interface InvitesResources {
  get(codeOrURL: string): Promise<InviteInfo>;
  create(channelID: string, input?: InviteCreateInput): Promise<InviteInfo>;
  delete(codeOrURL: string): Promise<void>;
  list(guildID: string): Promise<InviteInfo[]>;
  vanity(guildID: string): Promise<{ code: string | null; uses: number }>;
  setVanity(guildID: string, code: string | null): Promise<{ code: string | null; uses: number }>;
}
