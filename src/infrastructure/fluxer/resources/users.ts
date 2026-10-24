import type { Client, Guild, GuildMember, PresenceUpdateOptions, User, ProfilePayload } from '@fluxerjs/core';
import type { ActivityInfo, ActivityType, PresenceStatus } from '../../../ports/resources/common.js';
import { limitOf } from '../../../ports/resources/common.js';
import type {
  AuditLogInfo,
  BanInfo,
  GuildInfo,
  MemberInfo,
  UserInfo,
  UsersResources,
  LiveCountsInput,
  ProfileInfo,
} from '../../../ports/resources/users.js';
import { YuzuhaError } from '../../../errors.js';

/** Época Fluxer (01/01/2015 UTC) para derivar timestamps de snowflakes. */
const FLUXER_EPOCH = 1420070400000n;

function profileInfo(profile: ProfilePayload | null): ProfileInfo | null {
  if (!profile) return null;
  const fields = profile.userProfile;
  return { pronouns: fields?.pronouns ?? null, bio: fields?.bio ?? null, banner: fields?.banner ?? null,
    accentColor: fields?.accentColor ?? null, bannerColor: fields?.bannerColor ?? null, theme: fields?.theme ?? null,
    mutualGuildIDs: [...new Set([...(profile.mutualGuildIds ?? []), ...(profile.mutualGuilds ?? []).map(guild => guild.id)])],
    connectedAccounts: (profile.connectedAccounts ?? []).map(account => ({ name: account.name ?? null, type: account.type ?? null })) };
}

type CountsPayload = { counts: { guildId: string; channelId?: string; memberCount: number; onlineCount: number }[] };

function liveCounts<T>(client: Client, event: 'guildCountsUpdate' | 'channelMemberCountsUpdate',
  select: (payload: CountsPayload) => T | undefined, request: () => void, input: LiveCountsInput = {}): Promise<T> {
  const timeout = input.timeout ?? 5000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60_000) {
    return Promise.reject(new YuzuhaError('COUNTS_TIMEOUT', 'Timeout deve ser de 1 a 60000 milissegundos.'));
  }
  if (input.signal?.aborted) return Promise.reject(input.signal.reason ?? new YuzuhaError('ABORTED', 'Consulta cancelada.'));
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      client.off(event, listener);
      input.signal?.removeEventListener('abort', abort);
    };
    const listener = (payload: CountsPayload) => {
      const result = select(payload);
      if (result !== undefined) { cleanup(); resolve(result); }
    };
    const abort = () => { cleanup(); reject(input.signal?.reason ?? new YuzuhaError('ABORTED', 'Consulta cancelada.')); };
    const timer = setTimeout(() => { cleanup(); reject(new YuzuhaError('COUNTS_TIMEOUT', 'O gateway não respondeu com as contagens no prazo.')); }, timeout);
    client.on(event, listener);
    input.signal?.addEventListener('abort', abort, { once: true });
    try { request(); } catch (error) { cleanup(); reject(error); }
  });
}

/** Tipos de atividade do contrato para os códigos numéricos do gateway. */
const ACTIVITY_NUMBERS: Record<ActivityType, number> = {
  playing: 0,
  listening: 2,
  watching: 3,
  competing: 5,
  custom: 4,
};

function snowflakeTimestamp(id: string): number {
  return Number((BigInt(id) >> 22n) + FLUXER_EPOCH);
}

function toUserInfo(user: User): UserInfo {
  return {
    id: user.id,
    username: user.username,
    displayName: user.globalName ?? user.username,
    bot: user.bot,
    avatarURL: user.avatarURL(),
    bannerURL: user.bannerURL(),
    createdTimestamp: user.createdTimestamp,
  };
}

function toMemberInfo(member: GuildMember): MemberInfo {
  const user = member.user;
  return {
    id: member.id,
    username: user.username,
    displayName: member.displayName,
    bot: user.bot,
    avatarURL: member.displayAvatarURL(),
    bannerURL: member.bannerURL() ?? user.bannerURL(),
    createdTimestamp: user.createdTimestamp,
    nickname: member.nick,
    joinedTimestamp: member.joinedAt.getTime(),
    roles: [...member.roles.roleIds],
    permissions: member.permissions.bitfield.toString(),
    timedOutUntil: member.communicationDisabledUntil?.getTime() ?? null,
  };
}

function toGuildInfo(guild: Guild): GuildInfo {
  return {
    id: guild.id,
    name: guild.name,
    ownerID: guild.ownerId,
    iconURL: guild.iconURL(),
    bannerURL: guild.bannerURL(),
    memberCount: guild.memberCount,
    createdTimestamp: guild.createdTimestamp,
    features: [...guild.features],
  };
}

export function createUsersResources(client: Client): UsersResources {
  return {
    async leaveGuild(guildID) {
      if (!client.user) throw new YuzuhaError('NATIVE_UNAVAILABLE', 'O client ainda não possui um usuário autenticado.');
      await client.user.leaveGuild(guildID);
    },
    async profile(userID, guildID) {
      const result = await client.users.fetchWithProfile(userID, { guildId: guildID });
      return { user: toUserInfo(result.user), member: result.member ? toMemberInfo(result.member) : null,
        globalProfile: profileInfo(result.globalProfile), serverProfile: profileInfo(result.serverProfile) };
    },
    async guildCounts(guildID, input) {
      return liveCounts(client, 'guildCountsUpdate', payload => {
        const count = payload.counts.find(item => item.guildId === guildID);
        return count ? { guildID, memberCount: count.memberCount, onlineCount: count.onlineCount } : undefined;
      }, () => client.requestGuildCounts({ guildIds: [guildID] }), input);
    },
    async channelCounts(guildID, channelID, input) {
      return liveCounts(client, 'channelMemberCountsUpdate', payload => {
        const count = payload.counts.find(item => item.guildId === guildID && item.channelId === channelID);
        return count ? { guildID, channelID, memberCount: count.memberCount, onlineCount: count.onlineCount } : undefined;
      }, () => client.requestChannelMemberCounts({ guildId: guildID, channelId: channelID }), input);
    },
    async user(id: string): Promise<UserInfo> {
      return toUserInfo(await client.users.fetch(id, { force: true }));
    },
    async member(guildID: string, userID: string): Promise<MemberInfo> {
      const guild = await client.guilds.resolve(guildID);
      return toMemberInfo(await guild.members.fetch(userID, { force: true }));
    },
    async members(guildID: string, limit?: number): Promise<MemberInfo[]> {
      const guild = await client.guilds.resolve(guildID);
      return (await guild.members.fetch({ limit: limitOf(limit, 50, 1000) })).map(toMemberInfo);
    },
    async memberCount(guildID: string): Promise<number> {
      const guild = await client.guilds.fetch(guildID, { force: true });
      if (guild.memberCount !== null) return guild.memberCount;
      return (await guild.members.fetch({ limit: 1000 })).length;
    },
    async guild(guildID: string): Promise<GuildInfo> {
      return toGuildInfo(await client.guilds.fetch(guildID, { force: true }));
    },
    async bans(guildID: string, limit?: number): Promise<BanInfo[]> {
      const guild = await client.guilds.fetch(guildID, { force: true });
      const capped = limitOf(limit, 50, 1000);
      return (await guild.fetchBans()).slice(0, capped)
        .map(ban => ({ userID: ban.user.id, username: ban.user.username, reason: ban.reason }));
    },
    async auditLogs(guildID: string, limit?: number): Promise<AuditLogInfo[]> {
      const guild = await client.guilds.fetch(guildID, { force: true });
      const { entries } = await guild.fetchAuditLogs({ limit: limitOf(limit, 50, 100) });
      return entries.map(entry => ({
        id: entry.id,
        actionType: entry.actionType,
        userID: entry.userId,
        targetID: entry.targetId,
        reason: entry.reason,
        createdTimestamp: snowflakeTimestamp(entry.id),
      }));
    },
    async searchMembers(guildID, query, limit, offset = 0) {
      if (!Number.isSafeInteger(offset) || offset < 0) throw new YuzuhaError('MEMBER_OFFSET', 'Offset deve ser inteiro a partir de 0.');
      const guild = await client.guilds.resolve(guildID);
      const result = await guild.members.search({ query, limit: limitOf(limit, 25, 100), offset });
      return { members: result.members.map(hit => ({ userID: hit.userId, username: hit.username,
        displayName: hit.nickname ?? hit.globalName ?? hit.username, nickname: hit.nickname })),
        total: result.total ?? null, hasMore: result.hasMore ?? false, indexing: result.indexing ?? false };
    },
    async setNickname(guildID, userID, nickname, reason) {
      const guild = await client.guilds.resolve(guildID);
      const member = await guild.members.fetch(userID, { force: true });
      return toMemberInfo(await member.edit({ nick: nickname, reason }));
    },
    async editGuild(guildID, input) {
      const guild = await client.guilds.resolve(guildID);
      const { systemChannelID, afkChannelID, ...fields } = input;
      return toGuildInfo(await guild.edit({ ...fields, systemChannelId: systemChannelID, afkChannelId: afkChannelID }));
    },
    async setPresence(status: PresenceStatus, activity?: ActivityInfo): Promise<void> {
      const self = client.user;
      if (!self) throw new YuzuhaError('NOT_READY', 'O cliente ainda não está pronto para definir presença.');
      let presence: PresenceUpdateOptions = { status };
      if (activity !== undefined) {
        presence = activity.type === 'custom'
          ? { status, customStatus: { text: activity.name } }
          : {
            status,
            activities: [{
              name: activity.name,
              type: ACTIVITY_NUMBERS[activity.type],
              ...(activity.url === undefined ? {} : { url: activity.url }),
            }],
          };
      }
      self.setPresence(presence);
    },
  };
}
