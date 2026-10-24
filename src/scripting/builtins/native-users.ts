import type { ActivityType, PresenceStatus } from '../../ports/resources/common.js';
import type { FunctionCall } from '../types.js';
import { GuardError, YuzuhaError } from '../../errors.js';
import { defineFunctions } from './definition.js';
import { userID } from '../../domain/values.js';

const STATUSES = ['online', 'idle', 'dnd', 'invisible'] as const;
const ACTIVITY_TYPES = ['playing', 'listening', 'watching', 'competing', 'custom'] as const;

function own(value: object, key: string): unknown {
  if (!Object.hasOwn(value, key)) return '';
  return (value as Record<string, unknown>)[key];
}

/** Devolve '' quando o recurso indica ausência; nunca engole GuardError. */
async function found<T>(run: () => Promise<T>): Promise<T | ''> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof GuardError) throw error;
    const code = (error as { code?: unknown } | null | undefined)?.code;
    if (typeof code === 'string' && /NOT_FOUND|UNKNOWN/i.test(code)) return '';
    throw error;
  }
}

async function limit(c: FunctionCall, max: number, fallback: number): Promise<number> {
  if (c.count === 0) return fallback;
  const raw = await c.text(0);
  const value = Number(raw);
  if (!raw.trim() || !Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new YuzuhaError('LIMIT', `Limite deve ser um inteiro entre 1 e ${max}.`);
  }
  return value;
}

async function size(c: FunctionCall, index: number): Promise<number | undefined> {
  if (c.count <= index) return undefined;
  const raw = await c.text(index);
  const value = Number(raw);
  if (!raw.trim() || !Number.isSafeInteger(value) || value < 16 || value > 4096) {
    throw new YuzuhaError('SIZE', 'Tamanho deve ser um inteiro entre 16 e 4096.');
  }
  return value;
}

function sized(url: string | null, imageSize: number | undefined): string {
  if (!url) return '';
  if (imageSize === undefined) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('size', String(imageSize));
    return parsed.toString();
  } catch {
    return `${url}?size=${imageSize}`;
  }
}

function statusOf(raw: string): PresenceStatus {
  const value = raw.trim().toLowerCase();
  if ((STATUSES as readonly string[]).includes(value)) return value as PresenceStatus;
  throw new YuzuhaError('STATUS', 'Status deve ser online, idle, dnd ou invisible.');
}

function activityTypeOf(raw: string): ActivityType {
  const value = raw.trim().toLowerCase();
  if ((ACTIVITY_TYPES as readonly string[]).includes(value)) return value as ActivityType;
  throw new YuzuhaError('ACTIVITY', 'Tipo deve ser playing, listening, watching, competing ou custom.');
}

async function activityName(c: FunctionCall, index: number): Promise<string> {
  const name = await c.text(index);
  if (!name.trim()) throw new YuzuhaError('ACTIVITY', 'Nome da atividade não pode ser vazio.');
  return name;
}

export const userFunctions = defineFunctions(fn => {
  fn('guildFeatures', 'users', 0, 0, '', 'Retorna as features do servidor atual como array; exige suporte do recurso.', c => c.ctx.guildFeatures());
  fn('leaveGuild', 'users', 0, 0, '', 'Remove o bot do servidor atual; somente o dono do servidor pode executar.', async c => {
    await c.ctx.leaveGuild();
    return '';
  });
  fn('userProfile', 'users', 1, 1, '[usuário]', 'Busca usuário, perfil global e perfil/membro do servidor atual quando disponível.', async c => {
    return c.ctx.resources.users.profile(userID(await c.text(0)), c.ctx.guildID || undefined);
  });
  fn('guildCounts', 'users', 0, 1, '[timeout?]', 'Solicita contagens ao vivo de membros e online ao gateway; timeout em milissegundos.', async c => {
    const guildID = c.ctx.requireGuild();
    const timeout = c.count ? Number(await c.text(0)) : 5000;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60_000) throw new YuzuhaError('COUNTS_TIMEOUT', 'Timeout deve ser de 1 a 60000 milissegundos.');
    return c.ctx.resources.users.guildCounts(guildID, { timeout, signal: c.ctx.signal });
  });
  fn('channelCounts', 'users', 0, 2, '[canal?;timeout?]', 'Solicita contagens ao vivo do canal ao gateway, aguardando o evento correspondente.', async c => {
    const guildID = c.ctx.requireGuild();
    const raw = c.count ? (await c.text(0)).trim() : '';
    const channelID = raw ? /^<#(\d+)>$/.exec(raw)?.[1] ?? raw : c.ctx.message.channelID;
    const timeout = c.count > 1 ? Number(await c.text(1)) : 5000;
    if (!/^\d+$/.test(channelID)) throw new YuzuhaError('CHANNEL_ID', 'Informe o ID do canal.');
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 60_000) throw new YuzuhaError('COUNTS_TIMEOUT', 'Timeout deve ser de 1 a 60000 milissegundos.');
    return c.ctx.resources.users.channelCounts(guildID, channelID, { timeout, signal: c.ctx.signal });
  });
  fn('user', 'users', 1, 2, '[id;propriedade?]', 'Usuário por ID, ou uma propriedade própria; vazio se não existir.', async c => {
    const id = await c.text(0);
    const info = await found(() => c.ctx.resources.users.user(id));
    if (info === '') return '';
    return c.count > 1 ? own(info, await c.text(1)) : info;
  });
  fn('member', 'users', 1, 2, '[id;propriedade?]', 'Membro do servidor atual, ou propriedade; vazio se não existir.', async c => {
    const guildID = c.ctx.requireGuild(), id = await c.text(0);
    const info = await found(() => c.ctx.resources.users.member(guildID, id));
    if (info === '') return '';
    return c.count > 1 ? own(info, await c.text(1)) : info;
  });
  fn('members', 'users', 0, 1, '[limite?]', 'Membros do servidor atual; padrão 50, máximo 1000.', async c => {
    const guildID = c.ctx.requireGuild();
    return c.ctx.resources.users.members(guildID, await limit(c, 1000, 50));
  });
  fn('avatar', 'users', 1, 2, '[id;tamanho?]', 'URL do avatar; tamanho de 16 a 4096; vazio se ausente.', async c => {
    const id = await c.text(0), imageSize = await size(c, 1);
    const info = await found(() => c.ctx.resources.users.user(id));
    if (info === '') return '';
    return sized(info.avatarURL, imageSize);
  });
  fn('displayName', 'users', 1, 1, '[id]', 'Nome de exibição do usuário; vazio se não existir.', async c => {
    const id = await c.text(0);
    const info = await found(() => c.ctx.resources.users.user(id));
    return info ? info.displayName : '';
  });
  fn('memberCount', 'users', 0, 0, '', 'Total de membros do servidor atual.', async c =>
    c.ctx.resources.users.memberCount(c.ctx.requireGuild()));
  fn('userBanner', 'users', 1, 2, '[id;tamanho?]', 'URL do banner do usuário; tamanho de 16 a 4096; vazio se ausente.', async c => {
    const id = await c.text(0), imageSize = await size(c, 1);
    const info = await found(() => c.ctx.resources.users.user(id));
    if (info === '') return '';
    return sized(info.bannerURL, imageSize);
  });
  fn('userCreated', 'users', 1, 1, '[id]', 'Criação da conta em milissegundos; vazio se não existir.', async c => {
    const id = await c.text(0);
    const info = await found(() => c.ctx.resources.users.user(id));
    return info ? info.createdTimestamp : '';
  });
  fn('guild', 'users', 0, 1, '[propriedade?]', 'Servidor atual, ou uma propriedade própria.', async c => {
    const info = await c.ctx.resources.users.guild(c.ctx.requireGuild());
    return c.count ? own(info, await c.text(0)) : info;
  });
  fn('guildIcon', 'users', 0, 1, '[tamanho?]', 'URL do ícone do servidor atual; vazio se ausente.', async c =>
    sized((await c.ctx.resources.users.guild(c.ctx.requireGuild())).iconURL, await size(c, 0)));
  fn('guildBanner', 'users', 0, 1, '[tamanho?]', 'URL do banner do servidor atual; vazio se ausente.', async c =>
    sized((await c.ctx.resources.users.guild(c.ctx.requireGuild())).bannerURL, await size(c, 0)));
  fn('bans', 'users', 0, 1, '[limite?]', 'Banimentos do servidor atual; padrão 50, máximo 1000.', async c => {
    const guildID = c.ctx.requireGuild();
    return c.ctx.resources.users.bans(guildID, await limit(c, 1000, 50));
  });
  fn('auditLogs', 'users', 0, 1, '[limite?]', 'Logs de auditoria do servidor atual; padrão 50, máximo 100.', async c => {
    const guildID = c.ctx.requireGuild();
    return c.ctx.resources.users.auditLogs(guildID, await limit(c, 100, 50));
  });
  fn('setPresence', 'users', 1, 3, '[status;atividade?;tipo?]', 'Define presença: status e atividade opcional (playing por padrão).', async c => {
    const status = statusOf(await c.text(0));
    if (c.count < 2) {
      await c.ctx.resources.users.setPresence(status);
      return '';
    }
    const name = await activityName(c, 1);
    const type = c.count > 2 ? activityTypeOf(await c.text(2)) : 'playing';
    await c.ctx.resources.users.setPresence(status, { type, name });
    return '';
  });
  fn('setStatus', 'users', 1, 1, '[status]', 'Define o status da presença; limpa a atividade.', async c => {
    await c.ctx.resources.users.setPresence(statusOf(await c.text(0)));
    return '';
  });
  fn('setActivity', 'users', 1, 2, '[atividade;tipo?]', 'Define a atividade com status online.', async c => {
    const name = await activityName(c, 0);
    const type = c.count > 1 ? activityTypeOf(await c.text(1)) : 'playing';
    await c.ctx.resources.users.setPresence('online', { type, name });
    return '';
  });
});
