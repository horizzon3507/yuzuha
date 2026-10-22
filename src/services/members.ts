import { isAbove } from '../domain/moderation.js';
import { hasPermission } from '../domain/permissions.js';
import { userID } from '../domain/values.js';
import type { UsersResources } from '../ports/resources/users.js';
import type { Transport } from '../ports/transport.js';
import { GuardError } from '../shared/errors.js';
import { requireActor, requireGuild } from './authorization.js';
import type { ActorScope } from './authorization.js';

export class MemberService {
  constructor(private readonly transport: Transport, private readonly scope: ActorScope,
    private readonly users: () => UsersResources) {}

  search(query: string, limit = 25, offset = 0) {
    const guildID = requireGuild(this.scope.guildID);
    return this.users().searchMembers(guildID, query, limit, offset);
  }

  async setNickname(target: string | { id: string }, nickname: string | null, reason: string) {
    const guildID = requireGuild(this.scope.guildID);
    const authorID = requireActor(this.scope.authorID);
    const targetID = userID(typeof target === 'string' ? target : target.id);
    if (nickname !== null && (typeof nickname !== 'string' || nickname.length > 32)) throw new GuardError('Apelido deve ter até 32 caracteres.');
    if (!reason.trim() || reason.length > 512) throw new GuardError('Informe um motivo de até 512 caracteres.');
    const [author, bot, member] = await Promise.all([
      this.transport.member(guildID, authorID), this.transport.member(guildID, this.transport.botID),
      this.transport.member(guildID, targetID),
    ]);
    const self = targetID === author.id, botSelf = targetID === bot.id;
    const authorAllowed = hasPermission(author.permissions, 'ManageNicknames', author.owner)
      || (self && hasPermission(author.permissions, 'ChangeNickname', author.owner));
    const botAllowed = hasPermission(bot.permissions, 'ManageNicknames', bot.owner)
      || (botSelf && hasPermission(bot.permissions, 'ChangeNickname', bot.owner));
    if (!authorAllowed) throw new GuardError('Você precisa da permissão ManageNicknames ou ChangeNickname para seu próprio apelido.');
    if (!botAllowed) throw new GuardError('Preciso da permissão ManageNicknames.');
    if (member.owner || (!self && !author.owner && !isAbove(author, member)) || (!botSelf && !isAbove(bot, member))) {
      throw new GuardError('Não é possível alterar o apelido desse membro. Confira a hierarquia de cargos.');
    }
    return this.users().setNickname(guildID, targetID, nickname === '' ? null : nickname, reason);
  }
}
