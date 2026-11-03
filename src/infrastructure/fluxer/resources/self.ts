import type { Client, ClientUser } from '@fluxerjs/core';
import { YuzuhaError } from '../../../errors.js';
import type { SelfResources } from '../../../ports/resources/self.js';
import { toUserInfo } from './users.js';

function selfUser(client: Client): ClientUser {
  const user = client.user;
  if (!user) {
    throw new YuzuhaError('NOT_READY', 'O cliente ainda não está pronto; o usuário autenticado não está disponível.');
  }
  return user;
}

export function createSelfResources(client: Client): SelfResources {
  return {
    async fetch() {
      return toUserInfo(await selfUser(client).fetch());
    },
    async guilds(input) {
      const guilds = await selfUser(client).fetchGuilds({ withCounts: input?.withCounts ?? false });
      return guilds.map(guild => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        owner: guild.owner ?? false,
        permissions: guild.permissions ?? null,
        features: guild.features ?? [],
        memberCount: guild.approximateMemberCount ?? null,
        onlineCount: guild.approximatePresenceCount ?? null,
      }));
    },
    async leaveGuild(guildID, verification) {
      await selfUser(client).leaveGuild(guildID, verification);
    },
    async deleteMyMessages(guildID, verification) {
      await selfUser(client).bulkDeleteMyMessagesInGuild(guildID, verification);
    },
  };
}
