import { YuzuhaError } from '../../errors.js';
import { defineFunctions } from './definition.js';
import { integer } from './language/common.js';
import type { FunctionCall } from '../types.js';
import { GuardError } from '../../shared/errors.js';

const channelTypes: Record<string, number> = {
  texto: 0, text: 0,
  voz: 2, voice: 2,
  categoria: 4, category: 4,
  anuncio: 5, 'anúncio': 5, announcement: 5,
  forum: 15, 'fórum': 15,
  midia: 16, 'mídia': 16, media: 16,
};

const channelTypeNames = 'texto, voz, categoria, anuncio, forum ou midia';

function linkURL(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new YuzuhaError('CHANNEL_URL', 'Informe uma URL HTTP(S).'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new YuzuhaError('CHANNEL_URL', 'Informe uma URL HTTP(S) sem credenciais.');
  }
  return value;
}

async function managedChannel(c: FunctionCall, id: string) {
  const guildID = c.ctx.requireGuild();
  const channel = await c.ctx.resources.channels.get(id);
  if (channel.guildID !== guildID) throw new GuardError('O canal deve pertencer ao servidor atual.');
  return channel;
}

function channelID(raw: string): string {
  const value = raw.trim();
  const mention = /^<#(\S+)>$/.exec(value);
  const id = mention?.[1] ?? value;
  if (!id) throw new YuzuhaError('CHANNEL', 'Informe o ID do canal.');
  return id;
}

function channelType(raw: string): number {
  const key = raw.trim().toLowerCase();
  const mapped = Object.hasOwn(channelTypes, key) ? channelTypes[key] : undefined;
  if (mapped !== undefined) return mapped;
  if (/^\d+$/.test(key)) {
    const numeric = Number(key);
    if (numeric === 0 || numeric === 2 || numeric === 4 || numeric === 5 || numeric === 15 || numeric === 16) return numeric;
  }
  throw new YuzuhaError('CHANNEL_TYPE', `Tipo de canal inválido. Use ${channelTypeNames}.`);
}

function slowmodeSeconds(raw: string): number {
  const value = raw.trim();
  const seconds = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 21600) {
    throw new YuzuhaError('SLOWMODE', 'Slowmode deve ser um inteiro entre 0 e 21600 segundos.');
  }
  return seconds;
}

function optionalText(raw: string): string | undefined {
  const value = raw.trim();
  return value ? value : undefined;
}

function permissionList(raw: string): string[] {
  return raw.split(',').map(entry => entry.trim()).filter(entry => entry.length > 0);
}

function overwriteTarget(raw: string): { id: string; type?: 'role' | 'member' } {
  const value = raw.trim();
  const role = /^<@&(\S+)>$/.exec(value);
  if (role?.[1]) return { id: role[1], type: 'role' };
  const member = /^<@!?(\S+)>$/.exec(value);
  if (member?.[1]) return { id: member[1], type: 'member' };
  if (!value) throw new YuzuhaError('PERMS', 'Informe o cargo ou usuário alvo.');
  return { id: value };
}

function userTarget(raw: string): string {
  const value = raw.trim();
  const mention = /^<@!?(\S+)>$/.exec(value);
  const id = mention?.[1] ?? value;
  if (!id) throw new YuzuhaError('USER', 'Informe o usuário.');
  return id;
}

export const channelFunctions = defineFunctions(fn => {
  fn('createLinkChannel', 'channels', 2, 3, '[nome;url;categoria?]', 'Cria um canal de link com autorização do autor e do bot.', async c => {
    const guildID = c.ctx.requireGuild();
    const name = (await c.text(0)).trim(), url = linkURL(await c.text(1));
    if (!name || name.length > 100) throw new YuzuhaError('CHANNEL_NAME', 'Nome deve ter de 1 a 100 caracteres.');
    const rawParent = c.count > 2 ? (await c.text(2)).trim() : '';
    const parentID = rawParent ? channelID(rawParent) : undefined;
    if (parentID) {
      const parent = await managedChannel(c, parentID);
      if (parent.type !== 4) throw new GuardError('O canal pai deve ser uma categoria.');
    }
    return c.ctx.resources.channels.create(guildID, { name, type: 998, url, ...(parentID ? { parentID } : {}) });
  });
  fn('editLinkChannel', 'channels', 2, 3, '[canal;url;motivo?]', 'Altera a URL de um canal de link do servidor atual.', async c => {
    const id = channelID(await c.text(0)), url = linkURL(await c.text(1));
    if ((await managedChannel(c, id)).type !== 998) throw new GuardError('O canal informado deve ser de link.');
    return c.ctx.resources.channels.edit(id, { url, ...(c.count > 2 ? { reason: await c.text(2) } : {}) });
  });
  fn('setContentWarning', 'channels', 2, 4, '[canal;nível;texto?;motivo?]', 'Define aviso de conteúdo: 0 herda, 1 ativa, vazio remove o override.', async c => {
    const id = channelID(await c.text(0)), raw = (await c.text(1)).trim();
    const contentWarningLevel = raw === '' ? null : Number(raw);
    if (contentWarningLevel !== null && contentWarningLevel !== 0 && contentWarningLevel !== 1) {
      throw new YuzuhaError('CONTENT_WARNING', 'Nível deve ser 0, 1 ou vazio.');
    }
    const contentWarningText = c.count > 2 ? await c.text(2) : undefined;
    if (contentWarningText !== undefined && contentWarningText.length > 1000) throw new YuzuhaError('CONTENT_WARNING', 'Texto deve ter até 1000 caracteres.');
    await managedChannel(c, id);
    return c.ctx.resources.channels.edit(id, { contentWarningLevel,
      ...(contentWarningText === undefined ? {} : { contentWarningText: contentWarningText || null }),
      ...(c.count > 3 ? { reason: await c.text(3) } : {}) });
  });
  fn('moveChannel', 'channels', 2, 2, '[canal;posição]', 'Move um canal para a posição indicada, a partir de 0.', async c => {
    c.ctx.requireGuild();
    const id = channelID(await c.text(0));
    const position = integer(await c.text(1), 'Posição');
    if (position < 0) throw new YuzuhaError('POSITION', 'Posição deve ser um inteiro a partir de 0.');
    await c.ctx.resources.channels.move(id, position);
    return '';
  });
  fn('setCategory', 'channels', 2, 3, '[canal;categoria;motivo?]', 'Define a categoria do canal; categoria vazia remove o vínculo.', async c => {
    c.ctx.requireGuild();
    const id = channelID(await c.text(0));
    const raw = (await c.text(1)).trim();
    return c.ctx.resources.channels.setCategory(id, raw ? channelID(raw) : null, c.count > 2 ? await c.text(2) : undefined);
  });
  fn('channel', 'channels', 1, 2, '[canal;propriedade?]', 'Mostra um canal; com propriedade, mostra só ela.', async c => {
    const info = await c.ctx.resources.channels.get(channelID(await c.text(0)));
    if (c.count < 2) return info;
    const key = (await c.text(1)).trim();
    if (!key || !Object.hasOwn(info, key)) return key ? '' : info;
    return (info as unknown as Record<string, unknown>)[key];
  });
  fn('channels', 'channels', 0, 0, '', 'Lista os canais do servidor atual por posição.', async c => {
    return c.ctx.resources.channels.list(c.ctx.requireGuild());
  });
  fn('createChannel', 'channels', 1, 3, '[nome;tipo?;categoria?]', 'Cria um canal e mostra os dados.', async c => {
    const name = (await c.text(0)).trim();
    if (!name) throw new YuzuhaError('CHANNEL', 'Informe o nome do canal.');
    const type = c.count > 1 ? channelType(await c.text(1)) : 0;
    const parentID = c.count > 2 ? optionalText(await c.text(2)) : undefined;
    return c.ctx.resources.channels.create(c.ctx.requireGuild(), {
      name, type, ...(parentID !== undefined ? { parentID } : {}),
    });
  });
  fn('editChannel', 'channels', 1, 4, '[canal;nome?;topico?;slowmode?]', 'Edita um canal; vazio mantém.', async c => {
    const id = channelID(await c.text(0));
    const name = c.count > 1 ? optionalText(await c.text(1)) : undefined;
    const topic = c.count > 2 ? optionalText(await c.text(2)) : undefined;
    const slowRaw = c.count > 3 ? (await c.text(3)).trim() : '';
    const slowmode = slowRaw ? slowmodeSeconds(slowRaw) : undefined;
    return c.ctx.resources.channels.edit(id, {
      ...(name !== undefined ? { name } : {}),
      ...(topic !== undefined ? { topic } : {}),
      ...(slowmode !== undefined ? { slowmode } : {}),
    });
  });
  fn('deleteChannel', 'channels', 1, 1, '[canal]', 'Apaga um canal.', async c => {
    await c.ctx.resources.channels.delete(channelID(await c.text(0)));
    return '';
  });
  fn('slowmode', 'channels', 1, 2, '[segundos;canal?]', 'Define o modo lento (0 a 21600s).', async c => {
    const seconds = slowmodeSeconds(await c.text(0));
    const raw = c.count > 1 ? (await c.text(1)).trim() : '';
    const id = raw ? channelID(raw) : c.ctx.message.channelID;
    await c.ctx.resources.channels.setSlowmode(id, seconds);
    return '';
  });
  fn('channelPerms', 'channels', 2, 4, '[canal;alvo;permitir?;negar?]', 'Define permissões locais; listas separadas por vírgula.', async c => {
    c.ctx.requireGuild();
    const id = channelID(await c.text(0));
    const target = overwriteTarget(await c.text(1));
    const allow = c.count > 2 ? permissionList(await c.text(2)) : [];
    const deny = c.count > 3 ? permissionList(await c.text(3)) : [];
    await c.ctx.resources.channels.overwrite(id, target.id, {
      ...(target.type !== undefined ? { type: target.type } : {}),
      ...(allow.length > 0 ? { allow } : {}),
      ...(deny.length > 0 ? { deny } : {}),
    });
    return '';
  });
  fn('channelPermsOf', 'channels', 2, 2, '[canal;usuario]', 'Permissões efetivas do usuário no canal.', async c => {
    const guildID = c.ctx.requireGuild();
    return c.ctx.resources.channels.permissionsFor(guildID, channelID(await c.text(0)), userTarget(await c.text(1)));
  });
});
