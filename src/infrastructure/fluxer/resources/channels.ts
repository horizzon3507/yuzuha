import { OverwriteType } from '@fluxerjs/core';
import type { ChannelEditOptions, ChannelType, Client, GuildChannel, PermissionResolvable } from '@fluxerjs/core';
import type { ChannelCreateInput, ChannelEditInput, ChannelInfo, ChannelOverwriteInput, ChannelsResources } from '../../../ports/resources/channels.js';
import { YuzuhaError } from '../../../errors.js';

type ChannelExtras = {
  topic?: string | null;
  rateLimitPerUser?: number | null;
  nsfw?: boolean | null;
  url?: string | null;
  contentWarningLevel?: number | null;
  contentWarningText?: string | null;
};

function toChannelInfo(channel: GuildChannel): ChannelInfo {
  const extras = channel as GuildChannel & ChannelExtras;
  return {
    id: channel.id,
    name: channel.name ?? '',
    type: Number(channel.type),
    guildID: channel.guildId ?? null,
    parentID: channel.parentId ?? null,
    position: channel.position ?? 0,
    topic: extras.topic ?? null,
    slowmode: extras.rateLimitPerUser ?? 0,
    nsfw: extras.nsfw ?? false,
    url: extras.url ?? null,
    contentWarningLevel: extras.contentWarningLevel ?? null,
    contentWarningText: extras.contentWarningText ?? null,
  };
}

async function guildChannel(client: Client, channelID: string): Promise<GuildChannel> {
  const channel = await client.channels.fetch(channelID);
  if (!channel.isGuild()) throw new YuzuhaError('CHANNEL', 'Canal não pertence a um servidor.');
  return channel;
}

function validateExtras(input: ChannelEditInput): void {
  if (input.url !== undefined && input.url !== null) {
    let url: URL;
    try { url = new URL(input.url); } catch { throw new YuzuhaError('CHANNEL_URL', 'URL de canal deve ser HTTP(S).'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new YuzuhaError('CHANNEL_URL', 'URL de canal deve ser HTTP(S) sem credenciais.');
    }
  }
  if (input.contentWarningLevel !== undefined && input.contentWarningLevel !== null
    && input.contentWarningLevel !== 0 && input.contentWarningLevel !== 1) {
    throw new YuzuhaError('CONTENT_WARNING', 'Aviso de conteúdo aceita 0, 1 ou null.');
  }
  if (input.contentWarningText !== undefined && input.contentWarningText !== null
    && (typeof input.contentWarningText !== 'string' || input.contentWarningText.length > 1000)) {
    throw new YuzuhaError('CONTENT_WARNING', 'Texto do aviso deve ter até 1000 caracteres.');
  }
}

async function overwriteKind(client: Client, channel: GuildChannel, targetID: string, hint?: 'role' | 'member'): Promise<OverwriteType> {
  if (hint === 'member') return OverwriteType.Member;
  if (hint === 'role') return OverwriteType.Role;
  if (channel.guildId) {
    const guild = await client.guilds.resolve(channel.guildId);
    if (guild.roles.get(targetID) !== undefined) return OverwriteType.Role;
    try {
      await guild.fetchRole(targetID);
      return OverwriteType.Role;
    } catch {
      return OverwriteType.Member;
    }
  }
  return OverwriteType.Role;
}

export function createChannelsResources(client: Client): ChannelsResources {
  return {
    async get(channelID): Promise<ChannelInfo> {
      return toChannelInfo(await guildChannel(client, channelID));
    },
    async list(guildID, limit?): Promise<ChannelInfo[]> {
      const guild = await client.guilds.resolve(guildID);
      const channels = [...await guild.fetchChannels()]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      return (limit === undefined ? channels : channels.slice(0, limit)).map(toChannelInfo);
    },
    async create(guildID, input: ChannelCreateInput): Promise<ChannelInfo> {
      validateExtras(input);
      if (input.type === 998 && !input.url) throw new YuzuhaError('CHANNEL_URL', 'Canal de link exige uma URL HTTP(S).');
      const guild = await client.guilds.resolve(guildID);
      const created = await guild.createChannel({
        name: input.name,
        type: (input.type ?? 0) as ChannelType,
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.contentWarningLevel !== undefined ? { contentWarningLevel: input.contentWarningLevel } : {}),
        ...(input.contentWarningText !== undefined ? { contentWarningText: input.contentWarningText } : {}),
        ...(input.parentID !== undefined ? { parentId: input.parentID } : {}),
        ...(input.topic !== undefined ? { topic: input.topic } : {}),
        ...(input.slowmode !== undefined ? { rateLimitPerUser: input.slowmode } : {}),
        ...(input.nsfw !== undefined ? { nsfw: input.nsfw } : {}),
      });
      return toChannelInfo(created);
    },
    async edit(channelID, input: ChannelEditInput): Promise<ChannelInfo> {
      validateExtras(input);
      const channel = await guildChannel(client, channelID);
      const options: ChannelEditOptions = {
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.contentWarningLevel !== undefined ? { contentWarningLevel: input.contentWarningLevel } : {}),
        ...(input.contentWarningText !== undefined ? { contentWarningText: input.contentWarningText } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.parentID !== undefined ? { parentId: input.parentID } : {}),
        ...(input.topic !== undefined ? { topic: input.topic } : {}),
        ...(input.slowmode !== undefined ? { rateLimitPerUser: input.slowmode } : {}),
        ...(input.nsfw !== undefined ? { nsfw: input.nsfw } : {}),
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      };
      return toChannelInfo(await channel.edit(options));
    },
    async delete(channelID, reason?): Promise<void> {
      const channel = await guildChannel(client, channelID);
      if (reason === undefined) await channel.delete();
      else await channel.delete({ reason });
    },
    async setSlowmode(channelID, seconds, reason?): Promise<void> {
      const channel = await guildChannel(client, channelID);
      if (reason === undefined) await channel.edit({ rateLimitPerUser: seconds });
      else await channel.edit({ rateLimitPerUser: seconds, reason });
    },
    async overwrite(channelID, targetID, input: ChannelOverwriteInput): Promise<void> {
      const channel = await guildChannel(client, channelID);
      await channel.permissionOverwrites.edit(targetID, {
        type: await overwriteKind(client, channel, targetID, input.type),
        ...(input.allow !== undefined ? { allow: input.allow as PermissionResolvable } : {}),
        ...(input.deny !== undefined ? { deny: input.deny as PermissionResolvable } : {}),
      });
    },
    async permissionsFor(guildID, channelID, userID): Promise<string> {
      const guild = await client.guilds.resolve(guildID);
      const channel = await guildChannel(client, channelID);
      const member = await guild.fetchMember(userID);
      return member.permissionsIn(channel).toJSON();
    },
    async move(channelID, position): Promise<void> {
      if (!Number.isSafeInteger(position) || position < 0) throw new YuzuhaError('POSITION', 'Posição deve ser um inteiro a partir de 0.');
      const channel = await guildChannel(client, channelID);
      if (!channel.guildId) throw new YuzuhaError('GUILD_REQUIRED', 'Esta operação exige um servidor.');
      const guild = await client.guilds.resolve(channel.guildId);
      await guild.setChannelPositions([{ id: channel.id, position }]);
    },
    async setCategory(channelID, parentID, reason): Promise<ChannelInfo> {
      const channel = await guildChannel(client, channelID);
      if (parentID !== null) {
        const parent = await guildChannel(client, parentID);
        if (!parent.isCategory() || parent.guildId !== channel.guildId) {
          throw new YuzuhaError('CHANNEL_CATEGORY', 'Categoria deve pertencer ao mesmo servidor do canal.');
        }
      }
      return toChannelInfo(await channel.edit({ parentId: parentID, reason }));
    },
  };
}
