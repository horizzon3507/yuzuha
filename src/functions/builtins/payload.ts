import type { AllowedMentionsPolicy, Embed, MentionParse, Payload } from '../../domain/messages.js';
import { assertEmbedCount, normalizeEmbed } from '../../domain/embeds.js';
import { YuzuhaError } from '../../errors.js';
import { AuthorizationService } from '../../services/authorization.js';
import type { FunctionCall } from '../runtime/types.js';
import { text } from '../runtime/values.js';
import { defineFunctions } from './definition.js';

const MESSAGE_KEYS = new Set(['content', 'embeds', 'tts', 'stickerIds', 'flags', 'allowedMentions']);
const MENTION_PARSE: MentionParse[] = ['users', 'roles', 'everyone'];
const SNOWFLAKE = /^\d{1,20}$/;
const MAX_STICKERS = 3;
const MAX_MENTION_IDS = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** IDs de Discord/Fluxer como texto; `$array[123]` entrega número, então inteiros seguros também valem. */
function snowflakes(value: unknown, max: number, label: string): string[] {
  const ids = Array.isArray(value) ? value.map(item => (typeof item === 'number' && Number.isSafeInteger(item) ? String(item) : item)) : undefined;
  if (!ids || ids.length > max || !ids.every(id => typeof id === 'string' && SNOWFLAKE.test(id))) {
    throw new YuzuhaError('MESSAGE_OPTION', `${label} deve ser um array de até ${max} IDs numéricos.`);
  }
  return ids as string[];
}

/** Converte o valor de `$reply`, `$sendMessage` e `$editMessage` em payload: texto, embed, lista de embeds ou objeto de mensagem. */
export async function payload(c: FunctionCall, value: unknown): Promise<Payload> {
  if (isRecord(value) && Object.keys(value).some(key => MESSAGE_KEYS.has(key))) return messagePayload(c, value);
  if (isRecord(value)) return { embeds: [normalizeEmbed(value)] };
  if (Array.isArray(value) && value.length && value.every(isRecord)) return { embeds: embedList(value) };
  const content = text(value);
  if (!content || content.length > 2000) throw new YuzuhaError('MESSAGE_LENGTH', 'Mensagem deve ter de 1 a 2000 caracteres.');
  return { content };
}

function embedList(value: unknown[]): Embed[] {
  const embeds = value.map(item => normalizeEmbed(item));
  assertEmbedCount(embeds.length);
  return embeds;
}

async function messagePayload(c: FunctionCall, value: Record<string, unknown>): Promise<Payload> {
  for (const key of Object.keys(value)) {
    if (!MESSAGE_KEYS.has(key)) throw new YuzuhaError('MESSAGE_KEY', `Campo de mensagem desconhecido: ${key}.`);
  }
  const result: Payload = {};
  const content = value['content'] === undefined || value['content'] === null ? '' : text(value['content']);
  if (content.length > 2000) throw new YuzuhaError('MESSAGE_LENGTH', 'Mensagem deve ter no máximo 2000 caracteres.');
  if (content) result.content = content;
  if (value['embeds'] !== undefined && value['embeds'] !== null) {
    const list = Array.isArray(value['embeds']) ? value['embeds'] : [value['embeds']];
    result.embeds = embedList(list);
  }
  if (!result.content && !result.embeds?.length) throw new YuzuhaError('MESSAGE_LENGTH', 'Mensagem precisa de texto ou de embed.');
  Object.assign(result, await messageOptions(c, value));
  return result;
}

/** Opções de envio (tts, stickers, flags, menções). Relaxar menções ou usar TTS exige a permissão do autor. */
async function messageOptions(c: FunctionCall, value: Record<string, unknown>): Promise<Partial<Payload>> {
  const result: Partial<Payload> = {};
  if (value['tts'] !== undefined) {
    if (typeof value['tts'] !== 'boolean') throw new YuzuhaError('MESSAGE_OPTION', 'tts deve ser true ou false.');
    if (value['tts']) await requireAuthor(c, 'SendTtsMessages', 'Você precisa da permissão SendTtsMessages para enviar TTS.');
    result.tts = value['tts'];
  }
  if (value['stickerIds'] !== undefined) {
    result.stickerIds = snowflakes(value['stickerIds'], MAX_STICKERS, 'stickerIds');
  }
  if (value['flags'] !== undefined) {
    const flags = value['flags'];
    if (typeof flags !== 'number' || !Number.isSafeInteger(flags) || flags < 0 || flags > 0x7FFFFFFF) {
      throw new YuzuhaError('MESSAGE_OPTION', 'flags deve ser um inteiro não negativo de 32 bits.');
    }
    result.flags = flags;
  }
  if (value['allowedMentions'] !== undefined) result.allowedMentions = await mentionPolicy(c, value['allowedMentions']);
  return result;
}

async function mentionPolicy(c: FunctionCall, value: unknown): Promise<AllowedMentionsPolicy> {
  if (!isRecord(value)) throw new YuzuhaError('MESSAGE_OPTION', 'allowedMentions deve ser um objeto.');
  for (const key of Object.keys(value)) {
    if (!['parse', 'users', 'roles', 'repliedUser'].includes(key)) throw new YuzuhaError('MESSAGE_OPTION', `allowedMentions desconhecido: ${key}.`);
  }
  const policy: AllowedMentionsPolicy = {};
  if (value['parse'] !== undefined) {
    const parse = value['parse'];
    if (!Array.isArray(parse) || !parse.every(item => MENTION_PARSE.includes(item as MentionParse))) {
      throw new YuzuhaError('MESSAGE_OPTION', 'parse aceita somente users, roles e everyone.');
    }
    policy.parse = [...new Set(parse as MentionParse[])];
  }
  for (const key of ['users', 'roles'] as const) {
    if (value[key] === undefined) continue;
    policy[key] = snowflakes(value[key], MAX_MENTION_IDS, key);
  }
  if (value['repliedUser'] !== undefined) {
    if (typeof value['repliedUser'] !== 'boolean') throw new YuzuhaError('MESSAGE_OPTION', 'repliedUser deve ser true ou false.');
    policy.repliedUser = value['repliedUser'];
  }
  const relaxes = (policy.parse?.length ?? 0) > 0 || !!policy.users?.length || !!policy.roles?.length || policy.repliedUser === true;
  if (relaxes) await requireAuthor(c, 'MentionEveryone', 'Você precisa da permissão MentionEveryone para liberar menções.');
  return policy;
}

async function requireAuthor(c: FunctionCall, name: string, message: string): Promise<void> {
  const auth = new AuthorizationService(c.ctx.transport, { guildID: c.ctx.guildID ?? '', authorID: c.ctx.message.authorID });
  await auth.requirePermission(name, false, message);
}

export const payloadFunctions = defineFunctions(fn => {
  fn('embeds', 'embeds', 1, 10, '[embed;embed;...]', 'Monta lista de até 10 embeds validados, para $reply, $sendMessage ou $editMessage.', async c =>
    embedList(await c.all()));
  fn('addEmbed', 'embeds', 2, 2, '[lista;embed]', 'Retorna nova lista de embeds com o embed no final, respeitando o limite de 10.', async c => {
    const current = await c.arg(0);
    const list = Array.isArray(current) ? current : [current];
    return embedList([...list, await c.arg(1)]);
  });
  fn('messageOptions', 'messages', 1, 3, '[tts?;stickerIds?;flags?]', 'Opções de envio para mesclar com $jsonMerge e um payload com conteúdo ou embeds. TTS exige SendTtsMessages; menções, MentionEveryone.', async c => {
    const value: Record<string, unknown> = {};
    if (c.count > 0 && (await c.text(0)).trim() !== '') value['tts'] = (await c.text(0)).trim().toLowerCase() === 'true';
    if (c.count > 1 && (await c.text(1)).trim() !== '') value['stickerIds'] = (await c.text(1)).split(',').map(id => id.trim()).filter(Boolean);
    if (c.count > 2 && (await c.text(2)).trim() !== '') value['flags'] = Number((await c.text(2)).trim());
    return messageOptions(c, value);
  });
});
