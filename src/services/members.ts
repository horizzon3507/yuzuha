import { isAbove } from '../domain/moderation.js';
import { hasPermission } from '../domain/permissions.js';
import { userID } from '../domain/values.js';
import type { UsersResources } from '../ports/resources/users.js';
import type { Transport } from '../ports/transport.js';
import { matchCandidates, mentionID, normalize, rankCandidates } from '../domain/resolvers.js';
import type { ResolvedBan, ResolvedMember, ResolvedUser } from '../domain/resolvers.js';
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
    if (nickname !== null && (typeof nickname !== 'string' || nickname.length > 32)) throw new GuardError('Apelido deve ter até 32 caracteres.', 'INVALID_ARGUMENT');
    if (!reason.trim() || reason.length > 512) throw new GuardError('Informe um motivo de até 512 caracteres.', 'INVALID_REASON');
    const [author, bot, member] = await Promise.all([
      this.transport.member(guildID, authorID), this.transport.member(guildID, this.transport.botID),
      this.transport.member(guildID, targetID),
    ]);
    const self = targetID === author.id, botSelf = targetID === bot.id;
    const authorAllowed = hasPermission(author.permissions, 'ManageNicknames', author.owner)
      || (self && hasPermission(author.permissions, 'ChangeNickname', author.owner));
    const botAllowed = hasPermission(bot.permissions, 'ManageNicknames', bot.owner)
      || (botSelf && hasPermission(bot.permissions, 'ChangeNickname', bot.owner));
    if (!authorAllowed) throw new GuardError('Você precisa da permissão ManageNicknames ou ChangeNickname para seu próprio apelido.', 'PERMISSION_MISSING_AUTHOR');
    if (!botAllowed) throw new GuardError('Preciso da permissão ManageNicknames.', 'PERMISSION_MISSING_BOT');
    if (member.owner || (!self && !author.owner && !isAbove(author, member)) || (!botSelf && !isAbove(bot, member))) {
      throw new GuardError('Não é possível alterar o apelido desse membro. Confira a hierarquia de cargos.', 'HIERARCHY');
    }
    return this.users().setNickname(guildID, targetID, nickname === '' ? null : nickname, reason);
  }

  async resolve(query: string): Promise<ResolvedMember> {
    const guildID = requireGuild(this.scope.guildID);
    const text = query.trim();
    const id = mentionID(text);
    if (id) {
      const member = await this.users().member(guildID, id).catch(error => { if (absent(error) === undefined) throw error; return null; });
      if (!member) return { status: 'missing', query: text };
      return { status: 'found', id, label: member.nickname ?? member.displayName ?? member.username, mention: `<@${id}>`, via: /^\d+$/.test(text) ? 'id' : 'mention' };
    }
    const members = await this.candidates(guildID, text);
    const match = matchCandidates(text, members.map(member => ({ id: member.id,
      label: member.nickname ?? member.displayName ?? member.username,
      names: [member.username, member.displayName, member.nickname] })));
    if (!match) return { status: 'missing', query: text };
    if (match.items.length === 1) {
      const member = match.items[0]!;
      return { status: 'found', id: member.id, label: member.label, mention: `<@${member.id}>`, via: match.kind };
    }
    return { status: 'ambiguous', candidates: rankCandidates(match.items.map(member => ({ id: member.id, label: member.label }))) };
  }

  private async candidates(guildID: string, query: string) {
    const hits = new Map<string, { userID: string; username: string; displayName: string; nickname: string | null }>();
    for (let pageIndex = 0; pageIndex < 10; pageIndex++) {
      const page = await this.users().searchMembers(guildID, query, 25, pageIndex * 25).catch(error => {
        if (error instanceof GuardError) throw error;
        return { members: [], total: null, hasMore: false, indexing: false };
      });
      for (const member of page.members) hits.set(member.userID, member);
      if (!page.hasMore) break;
    }
    if (!hits.size) {
      const listed = await this.users().members(guildID, 100);
      for (const member of listed) hits.set(member.id, { userID: member.id, username: member.username,
        displayName: member.displayName, nickname: member.nickname });
    }
    return [...hits.values()].map(member => ({ id: member.userID, username: member.username,
      displayName: member.displayName, nickname: member.nickname }));
  }

  async resolveUser(query: string): Promise<ResolvedUser> {
    const text = query.trim();
    const id = mentionID(text);
    if (!id) return { status: 'missing', query: text };
    const user = await this.users().user(id).catch(error => { if (absent(error) === undefined) throw error; return null; });
    if (!user) return { status: 'missing', query: text };
    return { status: 'found', id, label: user.displayName ?? user.username, mention: `<@${id}>`,
      via: /^\d+$/.test(text) ? 'id' : 'mention' };
  }

  async resolveBan(query: string): Promise<ResolvedBan> {
    const guildID = requireGuild(this.scope.guildID);
    return this.users().resolveBan(guildID, query);
  }
}


function absent(error: unknown): null | undefined {
  const candidate = error as { code?: number | string; status?: number; reason?: string } | null | undefined;
  if (candidate instanceof GuardError && candidate.reason === 'MEMBER_NOT_FOUND') return null;
  if (candidate?.status === 404 || candidate?.code === 10007 || candidate?.code === 10026 || candidate?.code === 'NOT_FOUND') return null;
  return undefined;
}
