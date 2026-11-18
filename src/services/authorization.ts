import { defaultTranslator } from '../domain/i18n.js';
import type { MessageTranslator } from '../domain/i18n.js';
import type { ModerationAction, ModerationMember } from '../domain/moderation.js';
import { isAbove } from '../domain/moderation.js';
import { hasPermission } from '../domain/permissions.js';
import type { Transport } from '../ports/transport.js';
import { GuardError } from '../shared/errors.js';

export interface ActorScope {
  guildID: string;
  authorID: string;
}

export function requireGuild(guildID: string, t: MessageTranslator = defaultTranslator): string {
  if (!guildID) throw new GuardError(t('notInGuild'), 'NOT_IN_GUILD');
  return guildID;
}

export function requireActor(authorID: string, t: MessageTranslator = defaultTranslator): string {
  if (!authorID) throw new GuardError(t('noAuthor'), 'NO_AUTHOR');
  return authorID;
}

/** Per-command in-flight and resolved member lookup memoization with rejection eviction. */
export class MemberMemo {
  private readonly cache = new Map<string, Promise<ModerationMember>>();

  constructor(private readonly transport: Transport) {}

  get(guildID: string, userID: string, channelID?: string): Promise<ModerationMember> {
    const key = `${guildID}\0${userID}\0${channelID ?? ''}`;
    const existing = this.cache.get(key);
    if (existing) return existing;
    const pending = this.transport.member(guildID, userID, channelID).catch(error => {
      if (this.cache.get(key) === pending) this.cache.delete(key);
      throw error;
    });
    this.cache.set(key, pending);
    return pending;
  }

  invalidate(guildID?: string, userID?: string): void {
    if (guildID === undefined && userID === undefined) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      const [entryGuild, entryUser] = key.split('\0');
      if ((guildID === undefined || entryGuild === guildID)
        && (userID === undefined || entryUser === userID)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

function assertPermission(
  member: ModerationMember,
  name: string,
  bot = false,
  message?: string,
  t: MessageTranslator = defaultTranslator,
): void {
  if (!hasPermission(member.permissions, name, member.owner)) {
    throw new GuardError(
      message ?? (bot ? t('permissionMissingBot', name) : t('permissionMissingAuthor', name)),
      bot ? 'PERMISSION_MISSING_BOT' : 'PERMISSION_MISSING_AUTHOR',
    );
  }
}

export class AuthorizationService {
  constructor(
    private readonly transport: Transport,
    private readonly scope: ActorScope,
    private readonly memo?: MemberMemo,
    private readonly t: MessageTranslator = defaultTranslator,
  ) {}

  private member(guildID: string, userID: string, channelID?: string): Promise<ModerationMember> {
    return this.memo ? this.memo.get(guildID, userID, channelID) : this.transport.member(guildID, userID, channelID);
  }

  async requireGuildDeparture(): Promise<string> {
    const guildID = requireGuild(this.scope.guildID, this.t);
    const actorID = requireActor(this.scope.authorID, this.t);
    const [authorResult, botResult] = await Promise.allSettled([
      this.member(guildID, actorID),
      this.member(guildID, this.transport.botID),
    ]);
    if (authorResult.status === 'rejected') throw authorResult.reason;
    if (!authorResult.value.owner) throw new GuardError(this.t('guildDepartureOwnerOnly'), 'PERMISSION_MISSING_AUTHOR');
    if (botResult.status === 'rejected') throw botResult.reason;
    if (botResult.value.owner) throw new GuardError(this.t('guildDepartureBotIsOwner'), 'PERMISSION_MISSING_BOT');
    return guildID;
  }

  async requirePermission(name: string, bot = false, message?: string, channelID?: string): Promise<void> {
    const guildID = requireGuild(this.scope.guildID, this.t);
    const authorID = bot ? this.transport.botID : requireActor(this.scope.authorID, this.t);
    const member = await this.member(guildID, authorID, channelID);
    assertPermission(member, name, bot, message, this.t);
  }

  async requireBothPermissions(name: string, channelID?: string): Promise<[ModerationMember, ModerationMember]> {
    const guildID = requireGuild(this.scope.guildID, this.t);
    const actorID = requireActor(this.scope.authorID, this.t);
    const [authorResult, botResult] = await Promise.allSettled([
      this.member(guildID, actorID, channelID),
      this.member(guildID, this.transport.botID, channelID),
    ]);
    if (authorResult.status === 'rejected') throw authorResult.reason;
    assertPermission(authorResult.value, name, false, undefined, this.t);
    if (botResult.status === 'rejected') throw botResult.reason;
    assertPermission(botResult.value, name, true, undefined, this.t);
    return [authorResult.value, botResult.value];
  }

  async requireModeratable(action: ModerationAction, targetID: string, channelID?: string | null): Promise<void> {
    const guildID = requireGuild(this.scope.guildID, this.t);
    const flag = { ban: 'BanMembers', unban: 'BanMembers', kick: 'KickMembers', timeout: 'ModerateMembers',
      move: 'MoveMembers', mute: 'MuteMembers', deafen: 'DeafenMembers' }[action];
    const [warmedAuthor, warmedBot] = await this.requireBothPermissions(flag);
    if (action === 'move' && channelID) await this.requireBothPermissions(flag, channelID);
    if (targetID === this.scope.authorID) throw new GuardError(this.t('moderationSelfTarget'), 'SELF_TARGET');
    if (targetID === this.transport.botID) throw new GuardError(this.t('moderationBotTarget'), 'BOT_TARGET');
    if (action === 'unban') return;

    const [author, bot, target] = await Promise.all([
      this.memo ? this.member(guildID, this.scope.authorID) : Promise.resolve(warmedAuthor),
      this.memo ? this.member(guildID, this.transport.botID) : Promise.resolve(warmedBot),
      this.transport.member(guildID, targetID),
    ]);
    if (target.owner) {
      throw new GuardError(this.t('moderationOwnerTarget'), 'OWNER_TARGET');
    }
    if ((!author.owner && !isAbove(author, target)) || !isAbove(bot, target)) {
      throw new GuardError(this.t('moderationHierarchy'), 'HIERARCHY');
    }
    if (action === 'timeout' && hasPermission(target.permissions, 'Administrator')) {
      throw new GuardError(this.t('moderationAdminImmune'), 'ADMIN_IMMUNE');
    }
  }
}
