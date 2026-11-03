import type { GatewaySendPayload } from '@fluxerjs/types';

/** Pedido de membros de servidor pelo gateway (opcode 8). */
export interface GatewayMembersRequest {
  guildID?: string;
  guildIDs?: string[];
  query?: string;
  limit?: number;
  userIDs?: string[];
  presences?: boolean;
  nonce?: string;
}

/** Pedido de contagens de membros por canal dentro de um servidor (opcode 16). */
export interface ChannelCountsRequest {
  guildID: string;
  channelID?: string;
  channelIDs?: string[];
  nonce?: string;
}

/** Pedido de não lidos de posts em um canal de fórum ou mídia (opcode 28). */
export interface ForumUnreadsRequest {
  guildID: string;
  channelID: string;
  threads: { threadID: string; ackMessageID?: string }[];
}

/** Assinatura de tráfego de threads em um servidor (opcode 14). */
export interface ThreadSubscriptionInput {
  guildID: string;
  threads?: boolean;
  threadIDs?: string[];
}

/**
 * Pedidos brutos ao gateway. São fire-and-forget: os resultados chegam por
 * eventos do client (ex.: `guildCountsUpdate`, `channelMemberCountsUpdate`,
 * `forumUnreads`, `threadMemberListUpdate`). Para aguardar a resposta use
 * `users.guildCounts` e `users.channelCounts`, que encapsulam pedido e espera.
 */
export interface GatewayResources {
  requestMembers(input: GatewayMembersRequest): void;
  requestGuildCounts(guildIDs: string[], nonce?: string): void;
  requestChannelCounts(input: ChannelCountsRequest): void;
  requestForumUnreads(input: ForumUnreadsRequest): void;
  subscribeThreads(input: ThreadSubscriptionInput): void;
  send(shardID: number, payload: GatewaySendPayload): void;
}
