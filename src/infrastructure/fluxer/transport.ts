import { Client, Message } from '@fluxerjs/core';
import type { IncomingMessage, ModerationAction, ModerationMember, Payload, Transport } from '../../contracts.js';
import { YuzuhaError } from '../../errors.js';
import { safePayload as safe } from './payload.js';
import type { VoiceModerationOptions } from '../../domain/moderation.js';

export class FluxerTransport implements Transport {
  constructor(public readonly client: Client) {}
  get botID(): string { return this.client.user?.id ?? ''; }
  get ping(): number { return this.client.readyAt ? this.client.ws.ping : -1; }
  async reply(message: IncomingMessage, payload: Payload): Promise<string> {
    if (message.raw instanceof Message) return (await message.raw.reply(safe(payload))).id;
    return (await this.client.channels.send(message.channelID, { ...safe(payload), replyTo: { channelId: message.channelID, messageId: message.id, guildId: message.guildID } })).id;
  }
  async send(channelID: string, payload: Payload): Promise<string> {
    return (await this.client.channels.send(channelID, safe(payload))).id;
  }
  async edit(channelID: string, messageID: string, payload: Payload): Promise<void> {
    await (await this.client.channels.fetchMessage(channelID, messageID)).edit(safe(payload));
  }
  async delete(channelID: string, messageID: string): Promise<void> {
    await (await this.client.channels.fetchMessage(channelID, messageID)).delete();
  }
  async react(channelID: string, messageID: string, emoji: string): Promise<void> {
    await (await this.client.channels.fetchMessage(channelID, messageID)).react(emoji);
  }
  async member(guildID: string, userID: string, channelID?: string): Promise<ModerationMember> {
    const guild = await this.client.guilds.fetch(guildID, { force: true });
    await guild.fetchRoles();
    const member = await guild.members.fetch(userID, { force: true });
    const roles = [...member.roles.cache.values(), ...[guild.roles.get(guildID)].filter(role => role !== undefined)];
    roles.sort((a, b) => b.position - a.position || (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0));
    if (!roles.length) throw new YuzuhaError('ROLES_UNAVAILABLE', 'Não foi possível verificar os cargos.');
    let permissions = member.permissions.bitfield;
    if (channelID) {
      const channel = await this.client.channels.fetch(channelID);
      if (!channel.isGuild() || channel.guildId !== guildID) {
        throw new YuzuhaError('CHANNEL_GUILD', 'O canal deve pertencer ao mesmo servidor.');
      }
      permissions = member.permissionsIn(channel).bitfield;
    }
    return { id: userID, owner: guild.ownerId === userID, permissions,
      rank: roles[0]!.position, topRoleID: roles[0]!.id };
  }
  async moderate(guildID: string, action: ModerationAction, targetID: string, reason: string, duration?: number, voice?: VoiceModerationOptions): Promise<void> {
    if (action === 'move' && voice?.channelID) {
      const channel = await this.client.channels.fetch(voice.channelID);
      if (!channel.isGuild() || !channel.isVoice() || channel.guildId !== guildID) {
        throw new YuzuhaError('VOICE_CHANNEL', 'O destino deve ser um canal de voz do mesmo servidor.');
      }
    }
    const guild = await this.client.guilds.resolve(guildID);
    if (action === 'ban') await guild.ban(targetID, { reason, deleteMessageDays: duration ?? 0 });
    else if (action === 'kick') await guild.kick(targetID, reason);
    else if (action === 'unban') await guild.unban(targetID, reason);
    else {
      const member = await guild.members.fetch(targetID, { force: true });
      if (action === 'timeout') await member.timeout(duration!, reason);
      else if (action === 'move') await member.edit({ channelId: voice!.channelID!, reason });
      else if (action === 'mute') await member.edit({ mute: voice!.enabled!, reason });
      else if (action === 'deafen') await member.edit({ deaf: voice!.enabled!, reason });
      else throw new YuzuhaError('MODERATION_ACTION', 'Ação de moderação inválida.');
    }
  }
}
