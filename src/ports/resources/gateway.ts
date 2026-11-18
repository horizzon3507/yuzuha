import type { GatewaySendPayload } from '@fluxerjs/types';
import type { MemberInfo } from './users.js';

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

/** Opções para buscar e aguardar todos os chunks de membros pelo gateway (opcode 8). */
export interface GatewayFetchMembersInput {
  guildID: string;
  query?: string;
  limit?: number;
  userIDs?: string[];
  presences?: boolean;
  nonce?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Resultado consolidado retornado por `gateway.fetchMembers`. */
export interface GatewayFetchedMembers {
  guildID: string;
  members: MemberInfo[];
  notFound: string[];
  chunkCount: number;
  nonce: string;
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
 * Operações de gateway. Os métodos `request*`, `subscribeThreads` e `send` são
 * fire-and-forget (os resultados chegam por eventos do client). Para aguardar a
 * resposta correlacionada use `fetchMembers`, `users.guildCounts` e `users.channelCounts`.
 */
export interface GatewayResources {
  requestMembers(input: GatewayMembersRequest): void;
  fetchMembers(input: GatewayFetchMembersInput): Promise<GatewayFetchedMembers>;
  requestGuildCounts(guildIDs: string[], nonce?: string): void;
  requestChannelCounts(input: ChannelCountsRequest): void;
  requestForumUnreads(input: ForumUnreadsRequest): void;
  subscribeThreads(input: ThreadSubscriptionInput): void;
  send(shardID: number, payload: GatewaySendPayload): void;
}
