import type { ModerationMember } from '../domain/moderation.js';
import { isAbove } from '../domain/moderation.js';
import { hasPermission, permission } from '../domain/permissions.js';
import { emojiBatch } from '../domain/resource-batches.js';
import type { Resources } from '../ports/resources.js';
import type { RoleInfo } from '../ports/resources/roles.js';
import type { Transport } from '../ports/transport.js';
import { GuardError } from '../shared/errors.js';
import { AuthorizationService, requireGuild } from './authorization.js';
import type { ActorScope } from './authorization.js';

export function bindAuthorizedResources(source: Resources, transport: Transport, scope: ActorScope): Resources {
  const authorization = new AuthorizationService(transport, scope);
  const guild = (id: string) => {
    if (id !== requireGuild(scope.guildID)) throw new GuardError('O recurso deve pertencer ao servidor atual.');
    return id;
  };
  const allowed = async (name: string, channelID?: string) => {
    await authorization.requirePermission(name, false, undefined, channelID);
    await authorization.requirePermission(name, true, undefined, channelID);
  };
  const actors = async (): Promise<[ModerationMember, ModerationMember]> => Promise.all([
    transport.member(requireGuild(scope.guildID), scope.authorID),
    transport.member(requireGuild(scope.guildID), transport.botID),
  ]);
  const permissions = async (names: string[] | undefined, channelID?: string) => {
    for (const name of names ?? []) {
      permission(name);
      await allowed(name, channelID);
    }
  };
  const roleHierarchy = async (role: RoleInfo, everyone = false) => {
    if (role.managed !== false || (!everyone && role.id === scope.guildID)) {
      throw new GuardError('Cargos gerenciados e @everyone não podem ser alterados por esta operação.');
    }
    if (everyone && role.id === scope.guildID) return;
    const [author, bot] = await actors();
    const target = { id: role.id, owner: false, rank: role.position, topRoleID: role.id, permissions: 0n };
    if ((!author.owner && !isAbove(author, target)) || !isAbove(bot, target)) {
      throw new GuardError('O cargo deve estar abaixo dos cargos do autor e do bot.');
    }
  };
  const memberHierarchy = async (id: string) => {
    const [author, bot] = await actors();
    const target = await transport.member(requireGuild(scope.guildID), id);
    if (target.owner || (id !== author.id && !author.owner && !isAbove(author, target))
      || (id !== bot.id && !isAbove(bot, target))) {
      throw new GuardError('O membro deve estar abaixo dos cargos do autor e do bot.');
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
    requireGuild(scope.guildID);
    const target = await source.channels.get(id);
    guild(target.guildID ?? '');
    await allowed(flag, id);
    return target;
  };
  const parent = async (id: string) => {
    const target = await channel(id);
    if (target.type !== 4) throw new GuardError('O canal pai deve ser uma categoria.');
  };
  const webhook = async (id: string) => {
    requireGuild(scope.guildID);
    const target = await source.webhooks.fetch(id);
    guild(target.guildID);
    await channel(target.channelID, 'ManageWebhooks');
  };
  const expressions = async (guildID: string) => {
    guild(guildID);
    await allowed('ManageExpressions');
  };
  return { users: source.users, messages: source.messages, collectors: source.collectors,
    threads: source.threads, invites: source.invites, expressions: {
    emoji: source.expressions.emoji.bind(source.expressions), emojis: source.expressions.emojis.bind(source.expressions),
    sticker: source.expressions.sticker.bind(source.expressions), stickers: source.expressions.stickers.bind(source.expressions),
    async createEmoji(...args) {
      await expressions(args[0]);
      return source.expressions.createEmoji(...args);
    },
    async editEmoji(...args) {
      await expressions(args[0]);
      return source.expressions.editEmoji(...args);
    },
    async deleteEmoji(...args) {
      await expressions(args[0]);
      return source.expressions.deleteEmoji(...args);
    },
    async createSticker(...args) {
      await expressions(args[0]);
      return source.expressions.createSticker(...args);
    },
    async editSticker(...args) {
      await expressions(args[0]);
      return source.expressions.editSticker(...args);
    },
    async deleteSticker(...args) {
      await expressions(args[0]);
      return source.expressions.deleteSticker(...args);
    },
    async cloneEmoji(...args) {
      await expressions(args[0]);
      return source.expressions.cloneEmoji(...args);
    },
    async cloneSticker(...args) {
      await expressions(args[0]);
      return source.expressions.cloneSticker(...args);
    },
    async createEmojisBulk(guildID, inputs) {
      const batch = emojiBatch(inputs);
      await expressions(guildID);
      return source.expressions.createEmojisBulk(guildID, batch);
    },
  }, roles: {
    resolve: source.roles.resolve.bind(source.roles), list: source.roles.list.bind(source.roles),
    has: source.roles.has.bind(source.roles),
    async add(guildID, userID, query) {
      const target = await role(guildID, query);
      await memberHierarchy(userID);
      await permissionsFromRole(target);
      return source.roles.add(guildID, userID, target.id);
    },
    async remove(guildID, userID, query) {
      const target = await role(guildID, query);
      await memberHierarchy(userID);
      return source.roles.remove(guildID, userID, target.id);
    },
    async create(guildID, input) {
      guild(guildID);
      await allowed('ManageRoles');
      await permissions(input.permissions);
      return source.roles.create(guildID, input);
    },
    async edit(guildID, query, input) {
      const target = await role(guildID, query);
      await permissions(input.permissions);
      return source.roles.edit(guildID, target.id, input);
    },
    async delete(guildID, query, reason) {
      const target = await role(guildID, query);
      return source.roles.delete(guildID, target.id, reason);
    },
    async move(guildID, query, position) {
      const target = await role(guildID, query);
      if (!Number.isSafeInteger(position) || position < 1) throw new GuardError('Posição de cargo deve ser um inteiro maior que zero.');
      await roleHierarchy({ ...target, position });
      return source.roles.move(guildID, target.id, position);
    },
  }, channels: {
    get: source.channels.get.bind(source.channels), list: source.channels.list.bind(source.channels),
    permissionsFor: source.channels.permissionsFor.bind(source.channels),
    async create(guildID, input) {
      guild(guildID);
      if (input.parentID) await parent(input.parentID);
      else await allowed('ManageChannels');
      return source.channels.create(guildID, input);
    },
    async edit(id, input) {
      await channel(id);
      if (input.parentID) await parent(input.parentID);
      return source.channels.edit(id, input);
    },
    async delete(id, reason) { await channel(id); return source.channels.delete(id, reason); },
    async setSlowmode(id, seconds, reason) { await channel(id); return source.channels.setSlowmode(id, seconds, reason); },
    async move(id, position) { await channel(id); return source.channels.move(id, position); },
    async setCategory(id, parentID, reason) {
      await channel(id);
      if (parentID) await parent(parentID);
      return source.channels.setCategory(id, parentID, reason);
    },
    async overwrite(id, targetID, input) {
      await channel(id, 'ManageRoles');
      const roles = await source.roles.list(requireGuild(scope.guildID));
      const targetRole = roles.find(candidate => candidate.id === targetID);
      if (input.type === 'role' || (input.type === undefined && targetRole)) {
        if (!targetRole) throw new GuardError('Cargo não encontrado no servidor atual.');
        await roleHierarchy(targetRole, true);
      } else await memberHierarchy(targetID);
      await permissions(input.allow, id);
      await permissions(input.deny, id);
      return source.channels.overwrite(id, targetID, { ...input, type: targetRole && input.type !== 'member' ? 'role' : 'member' });
    },
  }, webhooks: {
    async fetch(id) {
      requireGuild(scope.guildID);
      const target = await source.webhooks.fetch(id);
      guild(target.guildID);
      await channel(target.channelID, 'ManageWebhooks');
      return target;
    },
    async create(id, name, reason) { await channel(id, 'ManageWebhooks'); return source.webhooks.create(id, name, reason); },
    async list(id) { await channel(id, 'ManageWebhooks'); return source.webhooks.list(id); },
    async send(id, token, input) { await webhook(id); return source.webhooks.send(id, token, input); },
    async edit(id, token, name) { await webhook(id); return source.webhooks.edit(id, token, name); },
    async delete(id, token) { await webhook(id); return source.webhooks.delete(id, token); },
  } };

  async function permissionsFromRole(target: RoleInfo) {
    const [author, bot] = await actors();
    const bits = BigInt(target.permissions);
    for (const actor of [author, bot]) {
      if (!hasPermission(actor.permissions, 'Administrator', actor.owner) && (bits & actor.permissions) !== bits) {
        throw new GuardError('O cargo contém permissões que o autor ou o bot não possui.');
      }
    }
  }
}
