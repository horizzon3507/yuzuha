export interface InviteInfo {
  type?: number;
  createdAt?: string | null;
  expiresAt?: string | null;
  temporary?: boolean | null;
  maxAge?: number | null;
  memberCount?: number | null;
  presenceCount?: number | null;
  isGuild?: boolean;
  isGroupDM?: boolean;
  inviter?: import('./users.js').UserInfo | null;
  guildSnapshot?: { id: string; name: string; icon: string | null; banner: string | null; splash: string | null; features: string[] } | null;
  channelSnapshot?: { id: string; name: string | null; type: number; icon: string | null; parentId: string | null } | null;
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
