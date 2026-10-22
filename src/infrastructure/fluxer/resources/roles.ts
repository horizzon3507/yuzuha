import type { Client, Guild, Role } from '@fluxerjs/core';
import type { RoleCreateInput, RoleEditInput, RoleInfo, RolesResources } from '../../../ports/resources/roles.js';
import { YuzuhaError } from '../../../errors.js';

function toInfo(role: Role): RoleInfo {
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    position: role.position,
    permissions: role.permissions.bitfield.toString(),
    hoist: role.hoist,
    mentionable: role.mentionable,
    unicodeEmoji: role.unicodeEmoji,
    managed: Reflect.get(role, 'managed') === true,
  };
}

function roleNotFound(): YuzuhaError {
  return new YuzuhaError('ROLE_NOT_FOUND', 'Cargo não encontrado.');
}

async function getGuild(client: Client, guildID: string): Promise<Guild> {
  if (!guildID) throw new YuzuhaError('GUILD_REQUIRED', 'Esta operação exige um servidor.');
  return client.guilds.resolve(guildID);
}

async function resolveRole(guild: Guild, query: string): Promise<Role> {
  const text = query.trim();
  if (!text) throw new YuzuhaError('ROLE_ARG', 'Informe o cargo.');
  const id = await guild.resolveRoleId(text);
  if (!id) throw roleNotFound();
  try {
    return guild.roles.get(id) ?? await guild.fetchRole(id);
  } catch (error) {
    if ((error as { code?: unknown })?.code === 'ROLE_NOT_FOUND') throw roleNotFound();
    throw error;
  }
}

function checkName(name: string): string {
  const value = name.trim();
  if (!value || value.length > 100) throw new YuzuhaError('ROLE_NAME', 'Nome do cargo deve ter entre 1 e 100 caracteres.');
  return value;
}

export function createRolesResources(client: Client): RolesResources {
  return {
    async resolve(guildID: string, role: string): Promise<RoleInfo> {
      const guild = await getGuild(client, guildID);
      return toInfo(await resolveRole(guild, role));
    },
    async list(guildID: string): Promise<RoleInfo[]> {
      const guild = await getGuild(client, guildID);
      const roles = await guild.fetchRoles();
      return roles.map(toInfo).sort((a, b) => b.position - a.position);
    },
    async has(guildID: string, userID: string, role: string): Promise<boolean> {
      const guild = await getGuild(client, guildID);
      const target = await resolveRole(guild, role);
      const member = await guild.members.fetch(userID, { force: true });
      return member.roles.has(target.id);
    },
    async add(guildID: string, userID: string, role: string): Promise<void> {
      const guild = await getGuild(client, guildID);
      const target = await resolveRole(guild, role);
      const member = await guild.members.fetch(userID, { force: true });
      await member.roles.add(target.id);
    },
    async remove(guildID: string, userID: string, role: string): Promise<void> {
      const guild = await getGuild(client, guildID);
      const target = await resolveRole(guild, role);
      const member = await guild.members.fetch(userID, { force: true });
      await member.roles.remove(target.id);
    },
    async create(guildID: string, input: RoleCreateInput): Promise<RoleInfo> {
      const guild = await getGuild(client, guildID);
      const created = await guild.createRole({
        name: checkName(input.name),
        color: input.color,
        permissions: input.permissions,
        reason: input.reason,
      });
      if (input.hoist !== undefined || input.mentionable !== undefined) {
        await created.edit({ hoist: input.hoist, mentionable: input.mentionable });
      }
      return toInfo(created);
    },
    async edit(guildID: string, role: string, input: RoleEditInput): Promise<RoleInfo> {
      const guild = await getGuild(client, guildID);
      const target = await resolveRole(guild, role);
      const options: { name?: string; color?: number; permissions?: string[]; hoist?: boolean; mentionable?: boolean; reason?: string } = {};
      if (input.name !== undefined) options.name = checkName(input.name);
      if (input.color !== undefined) options.color = input.color;
      if (input.permissions !== undefined) options.permissions = input.permissions;
      if (input.hoist !== undefined) options.hoist = input.hoist;
      if (input.mentionable !== undefined) options.mentionable = input.mentionable;
      if (input.reason !== undefined) options.reason = input.reason;
      if (Object.keys(options).length === 0) return toInfo(target);
      return toInfo(await target.edit(options));
    },
    async delete(guildID: string, role: string, reason?: string): Promise<void> {
      const guild = await getGuild(client, guildID);
      await (await resolveRole(guild, role)).delete(reason);
    },
    async move(guildID, role, position): Promise<void> {
      if (!Number.isSafeInteger(position) || position < 0) throw new YuzuhaError('POSITION', 'Posição deve ser um inteiro a partir de 0.');
      const guild = await getGuild(client, guildID);
      const target = await resolveRole(guild, role);
      await guild.setRolePositions([{ id: target.id, position }]);
    },
  };
}
