import type { ActivityInfo, PresenceInput, PresenceStatus } from './common.js';
import type { ChannelInfo } from './channels.js';
import type { AuditLogChangeInfo, AuditLogOptionsInfo, AuditLogQueryInput } from '../../domain/audit-log.js';

export type { AuditLogChangeInfo, AuditLogOptionsInfo, AuditLogQueryInput } from '../../domain/audit-log.js';

export interface UserInfo {
  avatar?: string | null;
  banner?: string | null;
  avatarColor?: number | null;
  discriminator?: string;
  flags?: number | null;
  globalName?: string | null;
  system?: boolean;
  id: string;
  username: string;
  displayName: string;
  bot: boolean;
  avatarURL: string | null;
  bannerURL: string | null;
  createdTimestamp: number;
}

export interface MemberInfo extends UserInfo {
  bannable?: boolean;
  kickable?: boolean;
  moderatable?: boolean;
  guildID?: string;
  partial?: boolean;
  deaf?: boolean;
  mute?: boolean;
  profileFlags?: number | null;
  mentionFlags?: number | null;
  nickname: string | null;
  joinedTimestamp: number;
  roles: string[];
  permissions: string;
  timedOutUntil: number | null;
}

export interface GuildInfo {
  permissions?: string;
  available?: boolean;
  afkChannelId?: string | null;
  afkTimeout?: number;
  banner?: string | null;
  bannerHeight?: number | null;
  bannerWidth?: number | null;
  icon?: string | null;
  splash?: string | null;
  splashURL?: string | null;
  splashHeight?: number | null;
  splashWidth?: number | null;
  splashCardAlignment?: number;
  embedSplash?: string | null;
  verificationLevel?: number;
  mfaLevel?: number;
  nsfwLevel?: number;
  nsfw?: boolean;
  contentWarningLevel?: number;
  contentWarningText?: string | null;
  disabledOperations?: number;
  defaultMessageNotifications?: number;
  explicitContentFilter?: number;
  messageHistoryCutoff?: string | null;
  systemChannelFlags?: number;
  systemChannelId?: string | null;
  rulesChannelId?: string | null;
  vanityURLCode?: string | null;
  onlineCount?: number | null;
  id: string;
  name: string;
  ownerID: string;
  iconURL: string | null;
  bannerURL: string | null;
  memberCount: number | null;
  createdTimestamp: number;
  features?: string[];
}

export interface BanInfo {
  guildID?: string;
  expiresAt?: string | null;
  user?: UserInfo;
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
  changes: AuditLogChangeInfo[];
  options: AuditLogOptionsInfo | null;
}

export interface UsersResources {
  profile(userID: string, guildID?: string): Promise<UserProfileInfo>;
  bannerURL(userID: string, guildID?: string, options?: { size?: number }): Promise<string | null>;
  guildCounts(guildID: string, input?: LiveCountsInput): Promise<GuildCountsInfo>;
  channelCounts(guildID: string, channelID: string, input?: LiveCountsInput): Promise<ChannelCountsInfo>;
  user(id: string): Promise<UserInfo>;
  member(guildID: string, userID: string): Promise<MemberInfo>;
  members(guildID: string, limit?: number): Promise<MemberInfo[]>;
  memberCount(guildID: string): Promise<number>;
  guild(guildID: string): Promise<GuildInfo>;
  bans(guildID: string, limit?: number): Promise<BanInfo[]>;
  getBan(guildID: string, userID: string): Promise<BanInfo | null>;
  resolveBan(guildID: string, query: string): Promise<import('../../domain/resolvers.js').ResolvedBan>;
  auditLogs(guildID: string, input?: number | AuditLogQueryInput): Promise<AuditLogInfo[]>;
  setPresence(status: PresenceStatus, activity?: ActivityInfo): Promise<void>;
  setPresence(input: PresenceInput): Promise<void>;
  setPresence(statusOrInput: PresenceStatus | PresenceInput, activity?: ActivityInfo): Promise<void>;
  searchMembers(guildID: string, query: string, limit?: number, offset?: number): Promise<MemberSearchPage>;
  setNickname(guildID: string, userID: string, nickname: string | null, reason: string): Promise<MemberInfo>;
  editGuild(guildID: string, input: GuildEditInput): Promise<GuildInfo>;
  me(guildID: string): Promise<MemberInfo>;
  transferOwnership(guildID: string, userID: string): Promise<void>;
  withdrawDiscoveryApplication(guildID: string): Promise<void>;
  discoveryStatus(guildID: string): Promise<DiscoveryStatusInfo>;
  applyForDiscovery(guildID: string, input: DiscoveryApplicationInput): Promise<DiscoveryApplicationInfo>;
  editDiscoveryApplication(guildID: string, input: DiscoveryApplicationInput): Promise<DiscoveryApplicationInfo>;
  createDM(userID: string): Promise<ChannelInfo>;
  leaveGuild?(guildID: string): Promise<void>;
}

export interface ProfileInfo {
  pronouns: string | null;
  bio: string | null;
  banner: string | null;
  bannerURL: string | null;
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
export interface DiscoveryApplicationInput {
  description?: string;
  primaryCategoryId?: number | string;
  keywords?: string[];
  primaryLanguage?: string;
}

export interface DiscoveryApplicationInfo {
  guildID: string;
  status: string;
  description: string;
  categoryType: number;
  primaryLanguage?: string | null;
  customTags?: string[];
  appliedAt?: string;
  reviewedAt?: string | null;
  guildNsfwLevel?: number | null;
}

export interface DiscoveryStatusInfo {
  application: DiscoveryApplicationInfo | null;
  eligible: boolean;
  minMemberCount: number;
}

export interface GuildEditInput {
  name?: string;
  icon?: string | null;
  banner?: string | null;
  systemChannelID?: string | null;
  afkChannelID?: string | null;
  afkTimeout?: number;
}
