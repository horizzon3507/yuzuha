import type { UserInfo } from './users.js';

/** Credenciais para verificação sudo (ações elevadas): senha e/ou MFA. */
export interface SudoVerification {
  password?: string;
  mfaMethod?: 'totp' | 'webauthn';
  mfaCode?: string;
  webauthnResponse?: Record<string, unknown>;
  webauthnChallenge?: string;
}

/** Servidor parcial retornado por `GET /users/@me/guilds`. */
export interface SelfGuildInfo {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string | null;
  features: string[];
  memberCount: number | null;
  onlineCount: number | null;
}

/** Operações sobre o usuário autenticado (`client.user`). */
export interface SelfResources {
  fetch(): Promise<UserInfo>;
  guilds(input?: { withCounts?: boolean }): Promise<SelfGuildInfo[]>;
  leaveGuild(guildID: string, verification?: SudoVerification): Promise<void>;
  deleteMyMessages(guildID: string, verification?: SudoVerification): Promise<void>;
}
