import type { MessageInfo } from './messages.js';
import type { ChannelInfo } from './channels.js';
import type { GuildInfo, MemberInfo, UserInfo } from './users.js';

/** Limites resolvidos do cache; `null` indica ilimitado. */
export interface CacheLimitsInfo {
  guilds: number | null;
  channels: number | null;
  users: number | null;
  members: number | null;
  /** `false` quando o cache de mensagens está desabilitado. */
  messages: number | false | null;
  roles: number | null;
  emojis: number | null;
  stickers: number | null;
  cascading?: boolean;
}

/** Tamanhos atuais dos buckets de cache com os limites aplicados. */
export interface CacheStatsInfo {
  guilds: number;
  channels: number;
  users: number;
  members: number;
  messages: number;
  messageChannels: number;
  roles: number;
  emojis: number;
  stickers: number;
  limits: CacheLimitsInfo;
}

/**
 * Filtro de limpeza do cache de mensagens. Sem `maxAgeMs` nem `keep`,
 * todas as mensagens do escopo são removidas. `keep` retorna verdadeiro
 * para manter a mensagem no cache.
 */
export interface MessageSweepInput {
  channelID?: string;
  maxAgeMs?: number;
  keep?: (message: MessageInfo, channelID: string) => boolean;
}

/**
 * Filtro de limpeza do cache de membros. Sem `keep`, todos os membros
 * do escopo são removidos. `keep` retorna verdadeiro para manter o membro.
 */
export interface MemberSweepInput {
  guildID?: string;
  keep?: (member: MemberInfo, guildID: string) => boolean;
}

/**
 * Filtro de limpeza do cache de usuários. Sem `keep`, todos os usuários
 * do escopo são removidos. `keep` retorna verdadeiro para manter o usuário.
 */
export interface UserSweepInput {
  keep?: (user: UserInfo, userID: string) => boolean;
}

/** Filtro de limpeza do cache de canais. `keep` retorna verdadeiro para manter o canal. */
export interface ChannelSweepInput {
  keep?: (channel: ChannelInfo, channelID: string) => boolean;
}

/** Filtro de limpeza do cache de servidores. `keep` retorna verdadeiro para manter o servidor. */
export interface GuildSweepInput {
  keep?: (guild: GuildInfo, guildID: string) => boolean;
}

/** Inspeção e limpeza dos caches locais do client. */
export interface CacheResources {
  stats(): Promise<CacheStatsInfo>;
  sweepMessages(input?: MessageSweepInput): Promise<number>;
  sweepMembers(input?: MemberSweepInput): Promise<number>;
  sweepUsers(input?: UserSweepInput): Promise<number>;
  sweepChannels(input?: ChannelSweepInput): Promise<number>;
  sweepGuilds(input?: GuildSweepInput): Promise<number>;
  cascadeChannel(channelID: string): Promise<void>;
  cascadeGuild(guildID: string): Promise<void>;
}
