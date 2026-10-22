import { YuzuhaError } from '../../errors.js';
import type { RoleInfo } from '../../ports/resources/roles.js';
import type { FunctionCall } from '../types.js';
import { defineFunctions } from './definition.js';
import { integer } from './language/common.js';

const ROLE_PROPERTIES = ['id', 'name', 'color', 'position', 'permissions', 'hoist', 'mentionable', 'unicodeEmoji', 'managed'] as const;
type RoleProperty = (typeof ROLE_PROPERTIES)[number];

function isRoleProperty(value: string): value is RoleProperty {
  return (ROLE_PROPERTIES as readonly string[]).includes(value);
}

function parseColor(raw: string): number | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  const hex = value.startsWith('#') ? value.slice(1) : value;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return parseInt(hex, 16);
  if (/^\d+$/.test(value)) {
    const number = Number(value);
    if (Number.isSafeInteger(number) && number >= 0 && number <= 0xffffff) return number;
  }
  throw new YuzuhaError('ROLE_COLOR', 'Cor inválida. Use #RRGGBB ou um número de 0 a 16777215.');
}

function parsePermissions(raw: string): string[] | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  const names = value.split(',').map(name => name.trim()).filter(Boolean);
  if (!names.length) return undefined;
  return names;
}

function pickProperty(role: RoleInfo, raw: string, fallback = false): unknown {
  const property = raw.trim();
  if (!property) {
    if (fallback) return role;
    throw new YuzuhaError('ROLE_PROPERTY', `Propriedade inválida. Use: ${ROLE_PROPERTIES.join(', ')}.`);
  }
  if (!isRoleProperty(property)) throw new YuzuhaError('ROLE_PROPERTY', `Propriedade inválida. Use: ${ROLE_PROPERTIES.join(', ')}.`);
  const value = role[property];
  return value === null ? '' : value;
}

function checkName(name: string): string {
  const value = name.trim();
  if (!value || value.length > 100) throw new YuzuhaError('ROLE_NAME', 'Nome do cargo deve ter entre 1 e 100 caracteres.');
  return value;
}

function optionalName(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  return checkName(value);
}

async function memberTarget(c: FunctionCall, index: number): Promise<string> {
  const value = (await c.text(index)).trim();
  if (!value) throw new YuzuhaError('ROLE_USER', 'Informe o usuário.');
  const mention = /^<@!?(\d+)>$/.exec(value)?.[1];
  if (mention) return mention;
  return value;
}

async function roleTarget(c: FunctionCall, index: number): Promise<string> {
  const value = (await c.text(index)).trim();
  if (!value) throw new YuzuhaError('ROLE_ARG', 'Informe o cargo.');
  return value;
}

export const roleFunctions = defineFunctions(fn => {
  fn('moveRole', 'roles', 2, 2, '[cargo;posição]', 'Move cargo com autorização e hierarquia do autor e do bot; posição a partir de 1.', async c => {
    const guildID = c.ctx.requireGuild();
    const role = await roleTarget(c, 0);
    const position = integer(await c.text(1), 'Posição');
    if (position < 1) throw new YuzuhaError('POSITION', 'Posição deve ser um inteiro a partir de 1.');
    await c.ctx.resources.roles.move(guildID, role, position);
    return '';
  });
  fn('role', 'roles', 1, 2, '[cargo;propriedade?]', 'Resolve cargo do servidor atual; retorna o cargo ou uma propriedade.', async c => {
    const guildID = c.ctx.requireGuild();
    const info = await c.ctx.resources.roles.resolve(guildID, await roleTarget(c, 0));
    if (c.count < 2) return info;
    return pickProperty(info, await c.text(1));
  });
  fn('roles', 'roles', 0, 0, '', 'Lista cargos do servidor ordenados por posição.', async c => {
    const guildID = c.ctx.requireGuild();
    return await c.ctx.resources.roles.list(guildID);
  });
  fn('hasRole', 'roles', 2, 2, '[usuário;cargo]', 'Verifica se o usuário possui o cargo.', async c => {
    const guildID = c.ctx.requireGuild();
    return await c.ctx.resources.roles.has(guildID, await memberTarget(c, 0), await roleTarget(c, 1));
  });
  fn('addRole', 'roles', 2, 2, '[usuário;cargo]', 'Adiciona cargo ao usuário.', async c => {
    const guildID = c.ctx.requireGuild();
    await c.ctx.resources.roles.add(guildID, await memberTarget(c, 0), await roleTarget(c, 1));
    return '';
  });
  fn('removeRole', 'roles', 2, 2, '[usuário;cargo]', 'Remove cargo do usuário.', async c => {
    const guildID = c.ctx.requireGuild();
    await c.ctx.resources.roles.remove(guildID, await memberTarget(c, 0), await roleTarget(c, 1));
    return '';
  });
  fn('createRole', 'roles', 1, 3, '[nome;cor?;permissões?]', 'Cria cargo; cor #RRGGBB ou número; permissões separadas por vírgula.', async c => {
    const guildID = c.ctx.requireGuild();
    const name = checkName(await c.text(0));
    const color = c.count > 1 ? parseColor(await c.text(1)) : undefined;
    const permissions = c.count > 2 ? parsePermissions(await c.text(2)) : undefined;
    return await c.ctx.resources.roles.create(guildID, { name, color, permissions });
  });
  fn('editRole', 'roles', 1, 4, '[cargo;nome?;cor?;permissões?]', 'Edita cargo; texto vazio mantém cada campo.', async c => {
    const guildID = c.ctx.requireGuild();
    const role = await roleTarget(c, 0);
    const name = c.count > 1 ? optionalName(await c.text(1)) : undefined;
    const color = c.count > 2 ? parseColor(await c.text(2)) : undefined;
    const permissions = c.count > 3 ? parsePermissions(await c.text(3)) : undefined;
    return await c.ctx.resources.roles.edit(guildID, role, { name, color, permissions });
  });
  fn('deleteRole', 'roles', 1, 1, '[cargo]', 'Exclui cargo do servidor.', async c => {
    const guildID = c.ctx.requireGuild();
    await c.ctx.resources.roles.delete(guildID, await roleTarget(c, 0));
    return '';
  });
});
