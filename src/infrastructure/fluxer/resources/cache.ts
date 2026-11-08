import type { Client, GuildChannel } from '@fluxerjs/core';
import { YuzuhaError } from '../../../errors.js';
import type { CacheResources } from '../../../ports/resources/cache.js';
import { toMessageInfo } from './messages.js';
import { toGuildInfo, toMemberInfo, toUserInfo } from './users.js';
import { toChannelInfo } from './channels.js';

function bounded(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

export function createCacheResources(client: Client): CacheResources {
  return {
    async stats() {
      const sizes = client.cache.stats();
      const messages = client._messageCacheStats();
      const limits = client.cache.limits;
      return {
        ...sizes,
        messages: messages.messages,
        messageChannels: messages.channels,
        limits: {
          guilds: bounded(limits.guilds),
          channels: bounded(limits.channels),
          users: bounded(limits.users),
          members: bounded(limits.members),
          messages: limits.messages === false ? false : bounded(limits.messages),
          roles: bounded(limits.roles),
          emojis: bounded(limits.emojis),
          stickers: bounded(limits.stickers),
        },
      };
    },
    async sweepMessages(input = {}) {
      const { channelID, maxAgeMs, keep } = input;
      if (maxAgeMs !== undefined && (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 0)) {
        throw new YuzuhaError('SWEEP_AGE', 'maxAgeMs deve ser um inteiro não negativo.');
      }
      const cutoff = maxAgeMs === undefined ? null : Date.now() - maxAgeMs;
      return client.sweepMessages((message, channelId) => {
        if (cutoff !== null && message.createdAt.getTime() >= cutoff) return false;
        return keep ? !keep(toMessageInfo(message), channelId) : true;
      }, channelID);
    },
    async sweepMembers(input = {}) {
      const { guildID, keep } = input;
      return client.sweepMembers((member, guildId) => {
        if (guildID !== undefined && guildId !== guildID) return false;
        return keep ? !keep(toMemberInfo(member), guildId) : true;
      });
    },
    async sweepUsers(input = {}) {
      return client.cache.sweepUsers((user, id) => (input.keep ? !input.keep(toUserInfo(user), id) : true));
    },
    async sweepChannels(input = {}) {
      return client.cache.sweepChannels((channel, id) => (input.keep ? !input.keep(toChannelInfo(channel as GuildChannel), id) : true));
    },
    async sweepGuilds(input = {}) {
      return client.cache.sweepGuilds((guild, id) => (input.keep ? !input.keep(toGuildInfo(guild), id) : true));
    },
  };
}
