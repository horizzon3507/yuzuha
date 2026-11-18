import { randomUUID } from 'node:crypto';
import { Events } from '@fluxerjs/core';
import type { Client, GuildMembersChunkPayload } from '@fluxerjs/core';
import { YuzuhaError } from '../../../errors.js';
import type {
  GatewayFetchedMembers,
  GatewayFetchMembersInput,
  GatewayResources,
} from '../../../ports/resources/gateway.js';
import type { MemberInfo } from '../../../ports/resources/users.js';
import { toMemberInfo } from './users.js';

const DEFAULT_FETCH_MEMBERS_TIMEOUT_MS = 15_000;
const MAX_FETCH_MEMBERS_TIMEOUT_MS = 120_000;

function abortError(signal?: AbortSignal): YuzuhaError {
  const reason = signal?.reason;
  if (reason instanceof YuzuhaError && reason.code === 'ABORTED') return reason;
  return new YuzuhaError(
    'ABORTED',
    'Busca de membros pelo gateway cancelada.',
    reason !== undefined ? { cause: reason } : undefined,
  );
}

export function createGatewayResources(client: Client): GatewayResources {
  const sendMembersRequest: GatewayResources['requestMembers'] = input => {
    client.requestGuildMembers({
      guildId: input.guildID,
      guildIds: input.guildIDs,
      query: input.query,
      limit: input.limit,
      userIds: input.userIDs,
      presences: input.presences,
      nonce: input.nonce,
    });
  };

  return {
    requestMembers: sendMembersRequest,
    fetchMembers(input: GatewayFetchMembersInput): Promise<GatewayFetchedMembers> {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return Promise.reject(new YuzuhaError('GUILD_OPTIONS', 'Opções de busca de membros inválidas.'));
      }
      const guildID = typeof input.guildID === 'string' ? input.guildID.trim() : '';
      if (!guildID) {
        return Promise.reject(new YuzuhaError('GUILD_REQUIRED', 'Informe guildID para buscar membros pelo gateway.'));
      }
      const timeoutMs = input.timeoutMs ?? DEFAULT_FETCH_MEMBERS_TIMEOUT_MS;
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_FETCH_MEMBERS_TIMEOUT_MS) {
        return Promise.reject(new YuzuhaError(
          'GATEWAY_TIMEOUT',
          `timeoutMs deve ser um inteiro entre 1 e ${MAX_FETCH_MEMBERS_TIMEOUT_MS} milissegundos.`,
        ));
      }
      if (input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 0)) {
        return Promise.reject(new YuzuhaError('LIMIT', 'limit deve ser um inteiro não negativo.'));
      }
      if (input.nonce !== undefined && (typeof input.nonce !== 'string' || !input.nonce.trim() || input.nonce.length > 64)) {
        return Promise.reject(new YuzuhaError('GUILD_OPTIONS', 'nonce deve ser um texto não vazio de até 64 caracteres.'));
      }
      if (input.signal?.aborted) {
        return Promise.reject(abortError(input.signal));
      }

      const nonce = input.nonce ?? randomUUID().replaceAll('-', '');
      const hasUserIDs = input.userIDs !== undefined;
      const query = input.query ?? (hasUserIDs ? undefined : '');
      const limit = input.limit ?? (hasUserIDs ? undefined : 0);

      return new Promise<GatewayFetchedMembers>((resolve, reject) => {
        let settled = false;
        let expectedCount: number | undefined;
        const chunks = new Map<number, GuildMembersChunkPayload>();

        const cleanup = (): void => {
          clearTimeout(timer);
          client.off(Events.GuildMembersChunk, listener);
          input.signal?.removeEventListener('abort', onAbort);
        };

        const finishResolve = (value: GatewayFetchedMembers): void => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(value);
        };

        const finishReject = (error: unknown): void => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        };

        const listener = (payload: GuildMembersChunkPayload): void => {
          if (settled || payload.guildId !== guildID || payload.nonce !== nonce) return;
          const count = payload.chunkCount;
          if (!Number.isSafeInteger(count) || count < 0) return;
          if (expectedCount === undefined) expectedCount = count;
          if (expectedCount === 0) {
            finishResolve({
              guildID,
              members: [],
              notFound: [...new Set(payload.notFound ?? [])],
              chunkCount: 0,
              nonce,
            });
            return;
          }
          if (Number.isSafeInteger(payload.chunkIndex) && payload.chunkIndex >= 0 && payload.chunkIndex < expectedCount) {
            chunks.set(payload.chunkIndex, payload);
          }
          if (chunks.size >= expectedCount || (payload.chunkIndex + 1 >= expectedCount && chunks.size === expectedCount)) {
            const ordered = [...chunks.entries()].sort((a, b) => a[0] - b[0]).map(entry => entry[1]);
            const seenMembers = new Map<string, MemberInfo>();
            const seenNotFound = new Set<string>();
            for (const chunk of ordered) {
              for (const member of chunk.members ?? []) {
                seenMembers.set(member.id, toMemberInfo(member));
              }
              for (const missing of chunk.notFound ?? []) {
                seenNotFound.add(missing);
              }
            }
            finishResolve({
              guildID,
              members: [...seenMembers.values()],
              notFound: [...seenNotFound],
              chunkCount: expectedCount,
              nonce,
            });
          }
        };

        const onAbort = (): void => finishReject(abortError(input.signal));
        const timer = setTimeout(() => {
          finishReject(new YuzuhaError('GATEWAY_TIMEOUT', 'O gateway não entregou todos os chunks de membros no prazo.'));
        }, timeoutMs);
        timer.unref?.();

        client.on(Events.GuildMembersChunk, listener);
        input.signal?.addEventListener('abort', onAbort, { once: true });
        if (input.signal?.aborted) {
          onAbort();
          return;
        }
        try {
          sendMembersRequest({
            guildID,
            query,
            limit,
            userIDs: input.userIDs,
            presences: input.presences,
            nonce,
          });
        } catch (error) {
          finishReject(error);
        }
      });
    },
    requestGuildCounts(guildIDs, nonce) {
      client.requestGuildCounts({ guildIds: guildIDs, nonce });
    },
    requestChannelCounts(input) {
      client.requestChannelMemberCounts({
        guildId: input.guildID, channelId: input.channelID, channelIds: input.channelIDs, nonce: input.nonce,
      });
    },
    requestForumUnreads(input) {
      client.requestForumUnreads({
        guildId: input.guildID, channelId: input.channelID,
        threads: input.threads.map(thread => ({ threadId: thread.threadID, ackMessageId: thread.ackMessageID })),
      });
    },
    subscribeThreads(input) {
      client.subscribeThreads({ guildId: input.guildID, threads: input.threads, threadIds: input.threadIDs });
    },
    send(shardID, payload) {
      client.sendToGateway(shardID, payload);
    },
  };
}
