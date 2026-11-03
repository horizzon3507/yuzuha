import type { Client } from '@fluxerjs/core';
import type { GatewayResources } from '../../../ports/resources/gateway.js';

export function createGatewayResources(client: Client): GatewayResources {
  return {
    requestMembers(input) {
      client.requestGuildMembers({
        guildId: input.guildID, guildIds: input.guildIDs, query: input.query, limit: input.limit,
        userIds: input.userIDs, presences: input.presences, nonce: input.nonce,
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
