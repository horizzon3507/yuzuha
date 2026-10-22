import { Invite } from '@fluxerjs/core';
import type { ChannelInviteCreateOptions, Client } from '@fluxerjs/core';
import type { InviteCreateInput, InviteInfo, InvitesResources } from '../../../ports/resources/invites.js';
import { YuzuhaError } from '../../../errors.js';

function extractCode(value: string): string {
  const path = value.trim().split(/[?#]/)[0]!.replace(/\/+$/, '');
  const code = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
  if (!code) throw new YuzuhaError('INVITE', 'Informe o código ou a URL do convite.');
  return code;
}

function toInviteInfo(invite: Invite): InviteInfo {
  return {
    code: invite.code,
    url: invite.url,
    guildID: invite.guildSnapshot?.id ?? null,
    channelID: invite.channelSnapshot?.id ?? null,
    inviterID: invite.inviter?.id ?? null,
    uses: invite.uses ?? null,
    maxUses: invite.maxUses ?? null,
    expiresTimestamp: invite.expiresAt?.getTime() ?? null,
  };
}

export function createInvitesResources(client: Client): InvitesResources {
  return {
    async get(codeOrURL): Promise<InviteInfo> {
      return toInviteInfo(await Invite.fetch(client, extractCode(codeOrURL)));
    },
    async create(channelID, input: InviteCreateInput = {}): Promise<InviteInfo> {
      const channel = await client.channels.fetch(channelID);
      if (!channel.isGuild()) throw new YuzuhaError('CHANNEL', 'Canal não pertence a um servidor.');
      const options: ChannelInviteCreateOptions = {
        ...(input.maxUses !== undefined ? { maxUses: input.maxUses } : {}),
        ...(input.maxAge !== undefined ? { maxAge: input.maxAge } : {}),
        ...(input.temporary !== undefined ? { temporary: input.temporary } : {}),
        ...(input.unique !== undefined ? { unique: input.unique } : {}),
      };
      return toInviteInfo(await channel.createInvite(options));
    },
    async delete(codeOrURL): Promise<void> {
      await (await Invite.fetch(client, extractCode(codeOrURL))).delete();
    },
    async list(guildID) { return (await (await client.guilds.resolve(guildID)).fetchInvites()).map(toInviteInfo); },
    async vanity(guildID) { return (await client.guilds.resolve(guildID)).fetchVanityURL(); },
    async setVanity(guildID, code) { return (await client.guilds.resolve(guildID)).editVanityURL(code); },
  };
}
