import type { ActivityInfo, PresenceStatus } from './common.js';

export interface UserInfo {
  id: string;
  username: string;
  displayName: string;
  bot: boolean;
  avatarURL: string | null;
  bannerURL: string | null;
  createdTimestamp: number;
}

export interface MemberInfo extends UserInfo {
  nickname: string | null;
  joinedTimestamp: number;
  roles: string[];
  permissions: string;
  timedOutUntil: number | null;
}

export interface GuildInfo {
  id: string;
  name: string;
  ownerID: string;
  iconURL: string | null;
  bannerURL: string | null;
  memberCount: number | null;
  createdTimestamp: number;
}

export interface BanInfo {
  userID: string;
  username: string;
  reason: string | null;
}

export interface AuditLogInfo {
  id: string;
  actionType: number;
  userID: string | null;
  targetID: string | null;
  reason: string | null;
  createdTimestamp: number;
}

export interface UsersResources {
  profile(userID: string, guildID?: string): Promise<UserProfileInfo>;
  guildCounts(guildID: string, input?: LiveCountsInput): Promise<GuildCountsInfo>;
  channelCounts(guildID: string, channelID: string, input?: LiveCountsInput): Promise<ChannelCountsInfo>;
  user(id: string): Promise<UserInfo>;
  member(guildID: string, userID: string): Promise<MemberInfo>;
  members(guildID: string, limit?: number): Promise<MemberInfo[]>;
  memberCount(guildID: string): Promise<number>;
  guild(guildID: string): Promise<GuildInfo>;
  bans(guildID: string, limit?: number): Promise<BanInfo[]>;
  auditLogs(guildID: string, limit?: number): Promise<AuditLogInfo[]>;
  setPresence(status: PresenceStatus, activity?: ActivityInfo): Promise<void>;
  searchMembers(guildID: string, query: string, limit?: number, offset?: number): Promise<MemberSearchPage>;
  setNickname(guildID: string, userID: string, nickname: string | null, reason: string): Promise<MemberInfo>;
  editGuild(guildID: string, input: GuildEditInput): Promise<GuildInfo>;
}

export interface ProfileInfo {
  pronouns: string | null;
  bio: string | null;
  banner: string | null;
  accentColor: number | null;
  bannerColor: number | null;
  theme: string | null;
  mutualGuildIDs: string[];
  connectedAccounts: { name: string | null; type: string | null }[];
}

export interface UserProfileInfo {
  user: UserInfo;
  member: MemberInfo | null;
  globalProfile: ProfileInfo | null;
  serverProfile: ProfileInfo | null;
}

export interface LiveCountsInput {
  timeout?: number;
  signal?: AbortSignal;
}

export interface GuildCountsInfo {
  guildID: string;
  memberCount: number;
  onlineCount: number;
}

export interface ChannelCountsInfo extends GuildCountsInfo {
  channelID: string;
}

export interface MemberSearchPage {
  members: { userID: string; username: string; displayName: string; nickname: string | null }[];
  total: number | null;
  hasMore: boolean;
  indexing: boolean;
}
export interface GuildEditInput {
  name?: string;
  icon?: string | null;
  banner?: string | null;
  systemChannelID?: string | null;
  afkChannelID?: string | null;
  afkTimeout?: number;
}
