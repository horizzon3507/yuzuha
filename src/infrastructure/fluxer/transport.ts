import { Client, Message } from '@fluxerjs/core';
import type { IncomingMessage, ModerationAction, ModerationMember, Payload, Transport } from '../../contracts.js';
import { GuardError, YuzuhaError } from '../../errors.js';
import { isNotFound, isTransientError, isUndeliveredSend, resolvePolicy, withRetry } from '../../services/retry.js';
import type { Reliability } from '../../services/retry.js';
import { replyTarget, safePayload as safe } from './payload.js';
import { compareSnowflake } from '../../domain/moderation.js';
import type { VoiceModerationOptions } from '../../domain/moderation.js';

export class FluxerTransport implements Transport {
  constructor(public readonly client: Client, private readonly reliability: Reliability = {}) {}

  private reliably<T>(fn: (attempt: number) => Promise<T>, safe = isTransientError): Promise<T> {
    return withRetry(fn, this.reliability, safe);
  }
  get botID(): string { return this.client.user?.id ?? ''; }
  get ping(): number { return this.client.readyAt ? this.client.ws.ping : -1; }
  async reply(message: IncomingMessage, payload: Payload): Promise<string> {
    if (message.raw instanceof Message && !payload.reply) {
      return message.raw.reply(safe(payload)).then(m => m.id)
        .catch(error => isNotFound(error)
          ? this.client.channels.send(message.channelID, { ...safe(payload) }).then(m => m.id)
          : Promise.reject(error));
    }
    const replyTo = payload.reply ? replyTarget(payload.reply) : { channelId: message.channelID, messageId: message.id, guildId: message.guildID };
    return this.reliably(() => this.client.channels.send(message.channelID, { ...safe(payload), replyTo }).then(m => m.id)
      .catch(error => isNotFound(error)
        ? this.client.channels.send(message.channelID, { ...safe(payload) }).then(m => m.id)
        : Promise.reject(error)), isUndeliveredSend);
  }
  async send(channelID: string, payload: Payload): Promise<string> {
    const replyTo = payload.reply ? replyTarget(payload.reply) : undefined;
    return this.reliably(() => this.client.channels.send(channelID, { ...safe(payload), ...(replyTo ? { replyTo } : {}) }).then(m => m.id),
      isUndeliveredSend);
  }
  async edit(channelID: string, messageID: string, payload: Payload): Promise<void> {
    // Edição não aceita resposta, TTS nem stickers: esses campos são descartados aqui.
    const { tts: _tts, stickerIds: _stickers, ...options } = safe(payload);
    await this.reliably(async () => { await (await this.client.channels.fetchMessage(channelID, messageID)).edit(options); });
  }
  async delete(channelID: string, messageID: string): Promise<void> {
    await this.reliably(async attempt => {
      await this.client.channels.fetchMessage(channelID, messageID)
        .then(message => message.delete())
        .catch(error => { if (attempt > 0 && isNotFound(error)) return; throw error; });
    });
  }
  async react(channelID: string, messageID: string, emoji: string): Promise<void> {
    await this.reliably(async () => { await (await this.client.channels.fetchMessage(channelID, messageID)).react(emoji); });
  }
  async member(guildID: string, userID: string, channelID?: string): Promise<ModerationMember> {
    const fetchMember = async () => {
      const guild = await this.client.guilds.fetch(guildID, { force: true });
      await guild.fetchRoles();
      const member = await guild.members.fetch(userID, { force: true }).catch(error => { throw missingTarget('timeout', error) ?? error; });
      return { guild, member };
    };
    const [{ guild, member }, channel] = await Promise.all([
      fetchMember(),
      channelID ? this.client.channels.fetch(channelID) : Promise.resolve(undefined),
    ]);
    const topRole = pickTopRole(member.roles.cache.values(), guild.roles.get(guildID));
    if (!topRole) throw new YuzuhaError('ROLES_UNAVAILABLE', 'Não foi possível verificar os cargos.');
    let permissions = member.permissions.bitfield;
    if (channelID) {
      if (!channel || !channel.isGuild() || channel.guildId !== guildID) {
        throw new YuzuhaError('CHANNEL_GUILD', 'O canal deve pertencer ao mesmo servidor.');
      }
      permissions = member.permissionsIn(channel).bitfield;
    }
    return { id: userID, owner: guild.ownerId === userID, permissions,
      rank: topRole.position, topRoleID: topRole.id };
  }
  async moderate(guildID: string, action: ModerationAction, targetID: string, reason: string, duration?: number, voice?: VoiceModerationOptions): Promise<void> {
    if (action === 'move' && voice?.channelID) {
      const channel = await this.client.channels.fetch(voice.channelID);
      if (!channel.isGuild() || !channel.isVoice() || channel.guildId !== guildID) {
        throw new YuzuhaError('VOICE_CHANNEL', 'O destino deve ser um canal de voz do mesmo servidor.');
      }
    }
    const guild = await this.client.guilds.resolve(guildID);
    const guard = (error: unknown): never => { throw missingTarget(action, error) ?? error; };
    if (action === 'ban') await guild.ban(targetID, { reason, deleteMessageDays: duration ?? 0 }).catch(guard);
    else if (action === 'kick') await guild.kick(targetID, reason).catch(guard);
    else if (action === 'unban') await guild.unban(targetID, reason).catch(guard);
    else {
      const member = await guild.members.fetch(targetID, { force: true }).catch(guard);
      if (action === 'timeout') await member.timeout(duration!, reason);
      else if (action === 'move') await member.edit({ channelId: voice!.channelID!, reason });
      else if (action === 'mute') await member.edit({ mute: voice!.enabled!, reason });
      else if (action === 'deafen') await member.edit({ deaf: voice!.enabled!, reason });
      else throw new YuzuhaError('MODERATION_ACTION', 'Ação de moderação inválida.');
    }
  }
}


interface RankedRole {
  id: string;
  position: number;
}

function pickTopRole(roles: Iterable<RankedRole>, defaultRole?: RankedRole): RankedRole | undefined {
  let best: RankedRole | undefined;
  const consider = (role: RankedRole) => {
    if (!best || role.position > best.position
      || (role.position === best.position && compareSnowflake(role.id, best.id) < 0)) {
      best = role;
    }
  };
  for (const role of roles) consider(role);
  if (defaultRole) consider(defaultRole);
  return best;
}

function missingTarget(action: string, error: unknown): GuardError | undefined {
  const candidate = error as { code?: number | string; status?: number } | null | undefined;
  if (candidate?.code !== 10007 && candidate?.code !== 10026 && candidate?.status !== 404) return;
  return action === 'unban'
    ? new GuardError('Este usuário não está banido.', 'NOT_BANNED')
    : new GuardError('Membro não encontrado.', 'MEMBER_NOT_FOUND');
}
