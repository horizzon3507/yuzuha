import { OverwriteType, ForumLayout, PermissionFlags, PermissionOverwrite } from '@fluxerjs/core';
import { Routes } from '@fluxerjs/types';
import type { ChannelEditOptions, ChannelType, Client, DMChannel, GuildChannel, PermissionResolvable } from '@fluxerjs/core';
import type { ChannelCreateInput, ChannelEditInput, ChannelInfo, ChannelOverwriteInput, ChannelsResources } from '../../../ports/resources/channels.js';
import { GuardError, YuzuhaError } from '../../../errors.js';

type ChannelExtras = {
  topic?: string | null;
  rateLimitPerUser?: number | null;
  nsfw?: boolean | null;
  url?: string | null;
  contentWarningLevel?: number | null;
  contentWarningText?: string | null;
};

export function toChannelInfo(channel: GuildChannel): ChannelInfo {
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

async function dmChannel(client: Client, channelID: string): Promise<DMChannel> {
  const channel = await client.channels.fetch(channelID);
  if (!channel.isDM()) throw new YuzuhaError('CHANNEL_DM', 'Esta operação exige um canal de DM.');
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
      const channel = await client.channels.fetch(channelID);
      if (channel.isDM()) {
        return { id: channel.id, name: channel.name ?? '', type: Number(channel.type), guildID: null,
          parentID: null, position: 0, topic: null, slowmode: 0, nsfw: false,
          recipientIDs: channel.recipients.map(user => user.id), ownerID: channel.ownerId };
      }
      return toChannelInfo(await guildChannel(client, channelID));
    },
    async addRecipient(channelID, userID): Promise<void> {
      const channel = await dmChannel(client, channelID);
      await channel.addRecipient(userID);
    },
    async removeRecipient(channelID, userID, options): Promise<void> {
      const channel = await dmChannel(client, channelID);
      await channel.removeRecipient(userID, options?.silent === undefined ? undefined : { silent: options.silent });
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
    async slowmode(channelID): Promise<number> {
      const channel = await guildChannel(client, channelID);
      return (await channel.fetchSlowmode()).rateLimitPerUser ?? 0;
    },
    async sendTyping(channelID): Promise<void> {
      const channel = await guildChannel(client, channelID);
      if (!channel.isTextBased()) throw new YuzuhaError('CHANNEL_TEXT', 'Canal sem suporte a mensagens.');
      await channel.sendTyping();
    },
    async rtcRegions(channelID) {
      const channel = await guildChannel(client, channelID);
      return (await channel.fetchRtcRegions()).map(region => ({ id: region.id, name: region.name, emoji: region.emoji }));
    },
    async overwrite(channelID, targetID, input: ChannelOverwriteInput, options?: { merge?: boolean }): Promise<void> {
      const channel = await guildChannel(client, channelID);
      if (!options?.merge) {
        if (input.neutral !== undefined) throw new YuzuhaError('CHANNEL_OVERWRITE', 'neutral só é aceito com merge: true.');
        await channel.permissionOverwrites.edit(targetID, {
          type: await overwriteKind(client, channel, targetID, input.type),
          ...(input.allow !== undefined ? { allow: input.allow as PermissionResolvable } : {}),
          ...(input.deny !== undefined ? { deny: input.deny as PermissionResolvable } : {}),
        });
        return;
      }
      for (const name of [...(input.allow ?? []), ...(input.deny ?? []), ...(input.neutral ?? [])]) validatePermission(name);
      const existing = channel.permissionOverwrites.cache.get(targetID);
      const bits = (names: string[]) => names.reduce((acc, name) => acc | PermissionFlags[name as keyof typeof PermissionFlags], 0n);
      const allowBits = bits(input.allow ?? []);
      const denyBits = bits(input.deny ?? []);
      const neutralBits = bits(input.neutral ?? []);
      const allow = ((existing?.allow.bitfield ?? 0n) | allowBits) & ~denyBits & ~neutralBits;
      const deny = ((existing?.deny.bitfield ?? 0n) | denyBits) & ~allowBits & ~neutralBits;
      const type = await overwriteKind(client, channel, targetID, input.type);
      if (input.reason !== undefined) {
        await client.rest.put(Routes.channelPermission(channel.id, targetID), {
          body: { type, allow: String(allow), deny: String(deny) }, auth: true, headers: { 'X-Audit-Log-Reason': input.reason } });
        channel.permissionOverwrites.cache.set(targetID, new PermissionOverwrite({ id: targetID, type, allow: String(allow), deny: String(deny) } as never));
      } else {
        await channel.permissionOverwrites.edit(targetID, { type, allow, deny });
      }
    },
    async lock(channelID, options = {}) {
      const channel = await guildChannel(client, channelID);
      const permission = lockPermission(channel, options.permission);
      const targetID = options.targetID ?? channel.guildId!;
      await this.overwrite(channelID, targetID, { deny: [permission], reason: options.reason }, { merge: true });
      return { channelID, targetID, permission, locked: true };
    },
    async unlock(channelID, options = {}) {
      const channel = await guildChannel(client, channelID);
      const permission = lockPermission(channel, options.permission);
      const targetID = options.targetID ?? channel.guildId!;
      await this.overwrite(channelID, targetID, { neutral: [permission], reason: options.reason }, { merge: true });
      return { channelID, targetID, permission, locked: false };
    },
    async permissionsFor(guildID, channelID, userID): Promise<string> {
      const guild = await client.guilds.resolve(guildID);
      const channel = await guildChannel(client, channelID);
      const member = await guild.fetchMember(userID);
      return member.permissionsIn(channel).toJSON();
    },
    async editThreadDefaults(channelID, input): Promise<void> {
      const channel = await guildChannel(client, channelID);
      const edit = (channel as { editThreadDefaults?: unknown }).editThreadDefaults;
      if (typeof edit !== 'function') throw new YuzuhaError('CHANNEL_THREAD', 'O canal não suporta padrões de thread.');
      const { slowmode, autoArchiveDuration, reason } = input;
      await (edit as (options: Record<string, unknown>) => Promise<unknown>).call(channel, {
        autoArchiveDuration: autoArchiveDuration === null ? null : autoArchiveDuration,
        rateLimitPerUser: slowmode, reason });
    },
    async setDefaultForumLayout(channelID, layout, reason): Promise<void> {
      const channel = await guildChannel(client, channelID);
      if (!channel.isForum()) throw new YuzuhaError('CHANNEL_FORUM', 'Layout padrão exige um canal de fórum.');
      const value = layout === null ? null : { default: ForumLayout.Default, list: ForumLayout.List, grid: ForumLayout.Grid }[layout];
      await channel.setDefaultForumLayout(value, reason);
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

function validatePermission(name: string): void {
  if (!(name in PermissionFlags)) throw new GuardError(`Permissão desconhecida: ${name}.`, 'INVALID_ARGUMENT');
}
function lockPermission(channel: GuildChannel, permission?: string): string {
  if (permission !== undefined) { validatePermission(permission); return permission; }
  if (channel.isVoice()) return 'Connect';
  if (channel.isText()) return 'SendMessages';
  throw new GuardError('Este tipo de canal não suporta bloqueio.', 'INVALID_ARGUMENT');
}
