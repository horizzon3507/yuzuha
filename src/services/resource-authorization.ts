import type { ModerationMember } from '../domain/moderation.js';
import { isAbove } from '../domain/moderation.js';
import { auditLogQueryInput } from '../domain/audit-log.js';
import type { AuditLogQueryInput } from '../domain/audit-log.js';
import { normalizeWebhookEditInput, normalizeWebhookMessageOptions } from '../domain/webhooks.js';
import { hasPermission, permission } from '../domain/permissions.js';
import { emojiBatch } from '../domain/resource-batches.js';
import type { Resources } from '../ports/resources.js';
import type { RoleInfo } from '../ports/resources/roles.js';
import type { ThreadDefaultsInput, ThreadSelfEditInput } from '../ports/resources/threads.js';
import type { Transport } from '../ports/transport.js';
import { GuardError, YuzuhaError } from '../shared/errors.js';
import { AuthorizationService, MemberMemo, requireGuild } from './authorization.js';
import type { ActorScope } from './authorization.js';
import { defaultTranslator } from '../domain/i18n.js';
import type { MessageTranslator } from '../domain/i18n.js';

export function bindAuthorizedResources(
  source: Resources,
  transport: Transport,
  scope: ActorScope,
  sharedMemo?: MemberMemo,
  t: MessageTranslator = defaultTranslator,
): Resources {
  const createGuards = (memo: MemberMemo) => {
    const authorization = new AuthorizationService(transport, scope, memo, t);
    const guild = (id: string) => {
      if (id !== requireGuild(scope.guildID, t)) throw new GuardError('O recurso deve pertencer ao servidor atual.', 'GENERIC');
      return id;
    };
    const allowed = async (name: string, channelID?: string) => {
      await authorization.requireBothPermissions(name, channelID);
    };
    const actors = async (): Promise<[ModerationMember, ModerationMember]> => Promise.all([
      memo.get(requireGuild(scope.guildID, t), scope.authorID),
      memo.get(requireGuild(scope.guildID, t), transport.botID),
    ]);
    const permissions = async (names: string[] | undefined, channelID?: string) => {
      for (const name of names ?? []) {
        permission(name);
        await allowed(name, channelID);
      }
    };
    const roleHierarchy = async (role: RoleInfo, everyone = false) => {
      if (role.managed !== false || (!everyone && role.id === scope.guildID)) {
        throw new GuardError('Cargos gerenciados e @everyone não podem ser alterados por esta operação.', 'HIERARCHY');
      }
      if (everyone && role.id === scope.guildID) return;
      const [author, bot] = await actors();
      const target = { id: role.id, owner: false, rank: role.position, topRoleID: role.id, permissions: 0n };
      if ((!author.owner && !isAbove(author, target)) || !isAbove(bot, target)) {
        throw new GuardError('O cargo deve estar abaixo dos cargos do autor e do bot.', 'HIERARCHY');
      }
    };
    const memberHierarchy = async (id: string) => {
      const [author, bot, target] = await Promise.all([
        memo.get(requireGuild(scope.guildID, t), scope.authorID),
        memo.get(requireGuild(scope.guildID, t), transport.botID),
        transport.member(requireGuild(scope.guildID, t), id),
      ]);
      if (target.owner || (id !== author.id && !author.owner && !isAbove(author, target))
        || (id !== bot.id && !isAbove(bot, target))) {
        throw new GuardError('O membro deve estar abaixo dos cargos do autor e do bot.', 'HIERARCHY');
      }
    };
    const role = async (guildID: string, query: string) => {
      guild(guildID);
      await allowed('ManageRoles');
      const target = await source.roles.resolve(guildID, query);
      await roleHierarchy(target);
      return target;
    };
    const channel = async (id: string, flag = 'ManageChannels') => {
      requireGuild(scope.guildID, t);
      const target = await source.channels.get(id);
      guild(target.guildID ?? '');
      await allowed(flag, id);
      return target;
    };
    const dm = async (id: string) => {
      const target = await source.channels.get(id);
      if (target.guildID !== null || !target.recipientIDs?.includes(scope.authorID)) {
        throw new GuardError('Esta operação exige um canal de DM do qual o autor participe.', 'GENERIC');
      }
      return target;
    };
    const parent = async (id: string) => {
      const target = await channel(id);
      if (target.type !== 4) throw new GuardError('O canal pai deve ser uma categoria.', 'INVALID_ARGUMENT');
    };
    const webhook = async (id: string) => {
      requireGuild(scope.guildID, t);
      const target = await source.webhooks.fetch(id);
      guild(target.guildID);
      await channel(target.channelID, 'ManageWebhooks');
      return target;
    };
    const expressions = async (guildID: string) => {
      guild(guildID);
      await allowed('ManageExpressions');
    };
    const permissionsFromRole = async (target: RoleInfo) => {
      const [author, bot] = await actors();
      const bits = BigInt(target.permissions);
      for (const actor of [author, bot]) {
        if (!hasPermission(actor.permissions, 'Administrator', actor.owner) && (bits & actor.permissions) !== bits) {
          throw new GuardError('O cargo contém permissões que o autor ou o bot não possui.', 'HIERARCHY');
        }
      }
    };
    return {
      authorization, guild, allowed, actors, permissions, roleHierarchy, memberHierarchy,
      role, channel, dm, parent, webhook, expressions, permissionsFromRole,
    };
  };
  const sharedGuards = sharedMemo ? createGuards(sharedMemo) : undefined;
  const guards = () => sharedGuards ?? createGuards(new MemberMemo(transport));
  const mutate = async <T>(fn: () => Promise<T>): Promise<T> => {
    try { return await fn(); }
    finally { sharedMemo?.clear(); }
  };

  return { users: Object.assign(Object.create(source.users), {
    async transferOwnership(guildID: string, userID: string) {
      const g = guards();
      requireGuild(guildID, t);
      const [author] = await g.actors();
      if (!author.owner) throw new GuardError('Apenas o dono do servidor pode transferir a propriedade.', 'PERMISSION_MISSING_AUTHOR');
      const target = await source.users.member(guildID, userID);
      if (target.bot) throw new GuardError('A propriedade não pode ser transferida para um bot.', 'BOT_TARGET');
      return mutate(() => source.users.transferOwnership(guildID, userID));
    },
    async resolveBan(guildID: string, query: string) {
      const g = guards();
      g.guild(guildID);
      await g.allowed('BanMembers');
      return source.users.resolveBan(guildID, query);
    },
    async auditLogs(guildID: string, input?: number | AuditLogQueryInput) {
      const g = guards();
      g.guild(guildID);
      await g.allowed('ViewAuditLog');
      auditLogQueryInput(input);
      return input === undefined ? source.users.auditLogs(guildID) : source.users.auditLogs(guildID, input);
    },
  }), messages: Object.assign(Object.create(source.messages), {
    async deleteAttachment(channelID: string, messageID: string, attachmentID: string) {
      const g = guards();
      const message = await source.messages.fetch(channelID, messageID);
      const needAuthor = message.authorID !== scope.authorID;
      const needBot = message.authorID !== transport.botID;
      if (needAuthor && needBot) await g.authorization.requireBothPermissions('ManageMessages', channelID);
      else {
        if (needAuthor) await g.authorization.requirePermission('ManageMessages', false, undefined, channelID);
        if (needBot) await g.authorization.requirePermission('ManageMessages', true, undefined, channelID);
      }
      return source.messages.deleteAttachment(channelID, messageID, attachmentID);
    },
    async bulkDelete(channelID: string, messageIDs: string[], options?: { fallback?: 'each' }) {
      const g = guards();
      await g.channel(channelID, 'ManageMessages');
      const ids = [...new Set(messageIDs)];
      if (!ids.length) throw new GuardError('Informe ao menos uma mensagem para apagar.', 'INVALID_ARGUMENT');
      if (ids.length > 100) throw new YuzuhaError('BULK_DELETE_LIMIT', 'Exclusão em massa aceita no máximo 100 mensagens por chamada.');
      return source.messages.bulkDelete(channelID, ids, options);
    },
    purge: source.messages.purge === undefined ? undefined : async (channelID: string, input: import('../ports/resources/messages.js').PurgeInput) => {
      const g = guards();
      await g.channel(channelID, 'ManageMessages');
      return source.messages.purge!(channelID, input);
    },
    async bulkDeleteOwn(channelID: string) { const g = guards(); await g.channel(channelID, 'SendMessages'); return source.messages.bulkDeleteOwn(channelID); },
    async acknowledgePins(channelID: string) { const g = guards(); await g.channel(channelID, 'ReadMessageHistory'); return source.messages.acknowledgePins(channelID); },
    async clearReadState(channelID: string) { const g = guards(); await g.channel(channelID, 'ReadMessageHistory'); return source.messages.clearReadState(channelID); },
    async purgeDM(channelID: string) {
      const g = guards();
      const channel = await source.channels.get(channelID);
      if (channel.type === 999) {
        throw new GuardError('O canal de anotações pessoais só pode ser esvaziado por bot.resources.messages.purgeDM.', 'GENERIC');
      }
      await g.dm(channelID);
      return source.messages.purgeDM(channelID);
    },
  }), collectors: source.collectors,
    threads: Object.assign(Object.create(source.threads), {
    async setLocked(threadID: string, locked: boolean, reason?: string) {
      const g = guards();
      await g.channel(threadID);
      return source.threads.setLocked(threadID, locked, reason);
    },
    async editSelf(threadID: string, input: ThreadSelfEditInput) { const g = guards(); await g.channel(threadID, 'ViewChannel'); return source.threads.editSelf(threadID, input); },
    async editDefaults(parentID: string, input: ThreadDefaultsInput) { const g = guards(); await g.channel(parentID); return source.threads.editDefaults(parentID, input); },
  }), invites: source.invites, gateway: source.gateway,
    instance: source.instance, self: source.self, cache: source.cache, expressions: {
    emoji: source.expressions.emoji.bind(source.expressions), emojis: source.expressions.emojis.bind(source.expressions),
    sticker: source.expressions.sticker.bind(source.expressions), stickers: source.expressions.stickers.bind(source.expressions),
    async createEmoji(...args) {
      const g = guards();
      await g.expressions(args[0]);
      return source.expressions.createEmoji(...args);
    },
    async editEmoji(...args) {
      const g = guards();
      await g.expressions(args[0]);
      return source.expressions.editEmoji(...args);
    },
    async deleteEmoji(...args) {
      const g = guards();
      await g.expressions(args[0]);
      return source.expressions.deleteEmoji(...args);
    },
    async createSticker(...args) {
      const g = guards();
      await g.expressions(args[0]);
      return source.expressions.createSticker(...args);
    },
    async createStickersBulk(...args) {
      const g = guards();
      await g.expressions(args[0]);
      return source.expressions.createStickersBulk(...args);
    },
    async editSticker(...args) {
      const g = guards();
      await g.expressions(args[0]);
      return source.expressions.editSticker(...args);
    },
    async deleteSticker(...args) {
      const g = guards();
      await g.expressions(args[0]);
      return source.expressions.deleteSticker(...args);
    },
    async cloneEmoji(...args) {
      const g = guards();
      await g.expressions(args[0]);
      return source.expressions.cloneEmoji(...args);
    },
    async cloneSticker(...args) {
      const g = guards();
      await g.expressions(args[0]);
      return source.expressions.cloneSticker(...args);
    },
    async createEmojisBulk(guildID, inputs) {
      const g = guards();
      const batch = emojiBatch(inputs);
      await g.expressions(guildID);
      return source.expressions.createEmojisBulk(guildID, batch);
    },
  }, roles: {
    resolve: source.roles.resolve.bind(source.roles), list: source.roles.list.bind(source.roles),
    has: source.roles.has.bind(source.roles),
    async add(guildID, userID, query) {
      const g = guards();
      const target = await g.role(guildID, query);
      await g.memberHierarchy(userID);
      await g.permissionsFromRole(target);
      return mutate(() => source.roles.add(guildID, userID, target.id));
    },
    async remove(guildID, userID, query) {
      const g = guards();
      const target = await g.role(guildID, query);
      await g.memberHierarchy(userID);
      return mutate(() => source.roles.remove(guildID, userID, target.id));
    },
    async create(guildID, input) {
      const g = guards();
      g.guild(guildID);
      await g.allowed('ManageRoles');
      await g.permissions(input.permissions);
      return mutate(() => source.roles.create(guildID, input));
    },
    async edit(guildID, query, input) {
      const g = guards();
      const target = await g.role(guildID, query);
      await g.permissions(input.permissions);
      return mutate(() => source.roles.edit(guildID, target.id, input));
    },
    async delete(guildID, query, reason) {
      const g = guards();
      const target = await g.role(guildID, query);
      return mutate(() => source.roles.delete(guildID, target.id, reason));
    },
    async setRoleHoistPositions(guildID: string, updates: { id: string; position: number | null }[]) {
      const g = guards();
      g.guild(guildID);
      await g.allowed('ManageRoles');
      for (const update of updates) await g.roleHierarchy(await g.role(guildID, update.id));
      return mutate(() => source.roles.setRoleHoistPositions(guildID, updates));
    },
    async resetRoleHoistPositions(guildID: string) {
      const g = guards();
      g.guild(guildID);
      await g.allowed('ManageRoles');
      return mutate(() => source.roles.resetRoleHoistPositions(guildID));
    },
    async move(guildID, query, position) {
      const g = guards();
      const target = await g.role(guildID, query);
      if (!Number.isSafeInteger(position) || position < 1) throw new GuardError('Posição de cargo deve ser um inteiro maior que zero.', 'INVALID_ARGUMENT');
      await g.roleHierarchy({ ...target, position });
      return mutate(() => source.roles.move(guildID, target.id, position));
    },
  }, channels: {
    get: source.channels.get.bind(source.channels), list: source.channels.list.bind(source.channels),
    permissionsFor: source.channels.permissionsFor.bind(source.channels),
    async create(guildID, input) {
      const g = guards();
      g.guild(guildID);
      if (input.parentID) await g.parent(input.parentID);
      else await g.allowed('ManageChannels');
      return source.channels.create(guildID, input);
    },
    async edit(id, input) {
      const g = guards();
      await g.channel(id);
      if (input.parentID) await g.parent(input.parentID);
      return source.channels.edit(id, input);
    },
    async delete(id, reason) { const g = guards(); await g.channel(id); return source.channels.delete(id, reason); },
    async addRecipient(id, userID) {
      const g = guards();
      const target = await g.dm(id);
      if (!target.ownerID || target.ownerID !== scope.authorID) {
        throw new GuardError('Apenas o dono do grupo pode adicionar participantes.', 'PERMISSION_MISSING_AUTHOR');
      }
      return source.channels.addRecipient(id, userID);
    },
    async removeRecipient(id, userID, options) {
      const g = guards();
      const target = await g.dm(id);
      if (userID !== scope.authorID && (!target.ownerID || target.ownerID !== scope.authorID)) {
        throw new GuardError('Apenas o dono do grupo pode remover outros participantes.', 'PERMISSION_MISSING_AUTHOR');
      }
      return source.channels.removeRecipient(id, userID, options);
    },
    async setSlowmode(id, seconds, reason) { const g = guards(); await g.channel(id); return source.channels.setSlowmode(id, seconds, reason); },
    slowmode: source.channels.slowmode.bind(source.channels),
    async sendTyping(id) { const g = guards(); await g.channel(id, 'SendMessages'); return source.channels.sendTyping(id); },
    rtcRegions: source.channels.rtcRegions.bind(source.channels),
    async move(id, position) { const g = guards(); await g.channel(id); return source.channels.move(id, position); },
    async editThreadDefaults(id, input) { const g = guards(); await g.channel(id); return source.channels.editThreadDefaults(id, input); },
    async setDefaultForumLayout(id, layout, reason) { const g = guards(); await g.channel(id); return source.channels.setDefaultForumLayout(id, layout, reason); },
    async setCategory(id, parentID, reason) {
      const g = guards();
      await g.channel(id);
      if (parentID) await g.parent(parentID);
      return source.channels.setCategory(id, parentID, reason);
    },
    async overwrite(id, targetID, input, options) {
      const g = guards();
      await g.channel(id, 'ManageRoles');
      const roles = await source.roles.list(requireGuild(scope.guildID, t));
      const targetRole = roles.find(candidate => candidate.id === targetID);
      if (input.type === 'role' || (input.type === undefined && targetRole)) {
        if (!targetRole) throw new GuardError('Cargo não encontrado no servidor atual.', 'GENERIC');
        await g.roleHierarchy(targetRole, true);
      } else await g.memberHierarchy(targetID);
      await g.permissions(input.allow, id);
      await g.permissions(input.deny, id);
      await g.permissions(input.neutral, id);
      return mutate(() => source.channels.overwrite(id, targetID, { ...input, type: targetRole && input.type !== 'member' ? 'role' : 'member' }, options));
    },
    async lock(id: string, options: { permission?: string; targetID?: string; reason?: string } = {}) {
      const g = guards();
      await g.channel(id, 'ManageChannels');
      return mutate(() => source.channels.lock(id, options));
    },
    async unlock(id: string, options: { permission?: string; targetID?: string; reason?: string } = {}) {
      const g = guards();
      await g.channel(id, 'ManageChannels');
      return mutate(() => source.channels.unlock(id, options));
    },
  }, webhooks: {
    async fetch(id) {
      const g = guards();
      requireGuild(scope.guildID, t);
      const target = await source.webhooks.fetch(id);
      g.guild(target.guildID);
      await g.channel(target.channelID, 'ManageWebhooks');
      return target;
    },
    async create(id, name, reason) { const g = guards(); await g.channel(id, 'ManageWebhooks'); return source.webhooks.create(id, name, reason); },
    async list(id) { const g = guards(); await g.channel(id, 'ManageWebhooks'); return source.webhooks.list(id); },
    async send(id, token, input) { const g = guards(); await g.webhook(id); return source.webhooks.send(id, token, input); },
    async fetchMessage(id, token, messageID, options) {
      const g = guards();
      await g.webhook(id);
      normalizeWebhookMessageOptions(options);
      return options === undefined
        ? source.webhooks.fetchMessage(id, token, messageID)
        : source.webhooks.fetchMessage(id, token, messageID, options);
    },
    async editMessage(id, token, messageID, input) { const g = guards(); await g.webhook(id); return source.webhooks.editMessage(id, token, messageID, input); },
    async deleteMessage(id, token, messageID, options) {
      const g = guards();
      await g.webhook(id);
      normalizeWebhookMessageOptions(options);
      return options === undefined
        ? source.webhooks.deleteMessage(id, token, messageID)
        : source.webhooks.deleteMessage(id, token, messageID, options);
    },
    async edit(id, token, input, reason) {
      const g = guards();
      const target = await g.webhook(id);
      const patch = normalizeWebhookEditInput(input);
      if (patch.channelID !== undefined && patch.channelID !== target.channelID) {
        await g.channel(patch.channelID, 'ManageWebhooks');
      }
      return reason === undefined ? source.webhooks.edit(id, token, input) : source.webhooks.edit(id, token, input, reason);
    },
    async delete(id, token) { const g = guards(); await g.webhook(id); return source.webhooks.delete(id, token); },
  } };
}
