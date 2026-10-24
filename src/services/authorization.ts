import type { ModerationAction } from '../domain/moderation.js';
import { isAbove } from '../domain/moderation.js';
import { hasPermission } from '../domain/permissions.js';
import type { Transport } from '../ports/transport.js';
import { GuardError } from '../shared/errors.js';

export interface ActorScope {
  guildID: string;
  authorID: string;
}

export function requireGuild(guildID: string): string {
  if (!guildID) throw new GuardError('Este comando só funciona em servidores.');
  return guildID;
}

export function requireActor(authorID: string): string {
  if (!authorID) throw new GuardError('Esta operação exige um autor identificado.');
  return authorID;
}

export class AuthorizationService {
  constructor(private readonly transport: Transport, private readonly scope: ActorScope) {}

  async requireGuildDeparture(): Promise<string> {
    const guildID = requireGuild(this.scope.guildID);
    const author = await this.transport.member(guildID, requireActor(this.scope.authorID));
    if (!author.owner) throw new GuardError('Somente o dono do servidor pode remover o bot por este comando.');
    const bot = await this.transport.member(guildID, this.transport.botID);
    if (bot.owner) throw new GuardError('O bot não pode sair de um servidor do qual é dono.');
    return guildID;
  }

  async requirePermission(name: string, bot = false, message?: string, channelID?: string): Promise<void> {
    const guildID = requireGuild(this.scope.guildID);
    const authorID = bot ? this.transport.botID : requireActor(this.scope.authorID);
    const member = await this.transport.member(guildID, authorID, channelID);
    if (!hasPermission(member.permissions, name, member.owner)) {
      throw new GuardError(message ?? (bot ? `Preciso da permissão ${name}.` : `Você precisa da permissão ${name}.`));
    }
  }

  async requireModeratable(action: ModerationAction, targetID: string, channelID?: string | null): Promise<void> {
    const guildID = requireGuild(this.scope.guildID);
    const flag = { ban: 'BanMembers', unban: 'BanMembers', kick: 'KickMembers', timeout: 'ModerateMembers',
      move: 'MoveMembers', mute: 'MuteMembers', deafen: 'DeafenMembers' }[action];
    await this.requirePermission(flag);
    await this.requirePermission(flag, true);
    if (action === 'move' && channelID) {
      await this.requirePermission(flag, false, undefined, channelID);
      await this.requirePermission(flag, true, undefined, channelID);
    }
    if (targetID === this.scope.authorID) throw new GuardError('Você não pode moderar a si mesmo.');
    if (targetID === this.transport.botID) throw new GuardError('Você não pode moderar este bot.');
    if (action === 'unban') return;

    const [author, bot, target] = await Promise.all([
      this.transport.member(guildID, this.scope.authorID),
      this.transport.member(guildID, this.transport.botID),
      this.transport.member(guildID, targetID),
    ]);
    if (target.owner || (!author.owner && !isAbove(author, target)) || !isAbove(bot, target)) {
      throw new GuardError('Não é possível moderar esse membro. Confira a hierarquia de cargos.');
    }
    if (action === 'timeout' && hasPermission(target.permissions, 'Administrator')) {
      throw new GuardError('Não é possível silenciar um administrador.');
    }
  }
}
