import { assertEmbedCount, httpURL } from './embeds.js';
import type { AllowedMentionsPolicy, Embed, MentionParse } from './messages.js';
import { YuzuhaError } from '../shared/errors.js';

export interface WebhookFileUrlInput {
  url: string;
  name: string;
  description?: string;
  spoiler?: boolean;
}

export interface WebhookFileBinaryInput {
  data: Uint8Array;
  name: string;
  description?: string;
  spoiler?: boolean;
}

export type WebhookFileInput = WebhookFileUrlInput | WebhookFileBinaryInput;

const SNOWFLAKE = /^\d{1,20}$/;
const SEND_KEYS = new Set(['content', 'username', 'avatarURL', 'embeds', 'files', 'allowedMentions', 'threadID']);
const EDIT_MESSAGE_KEYS = new Set(['content', 'embeds', 'files', 'allowedMentions', 'threadID']);
const MENTION_PARSE: readonly MentionParse[] = ['users', 'roles', 'everyone'];
const MAX_FILES = 10;
const MAX_FILE_BYTES = 10_000_000;
const MAX_MENTION_IDS = 100;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value)),
  );
}

export function assertPlainObject(value: unknown, message: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new YuzuhaError('WEBHOOK_OPTIONS', message);
  return value;
}

export function assertKnownKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new YuzuhaError('WEBHOOK_OPTIONS', `Opção desconhecida em ${label}: ${key}.`);
    }
  }
}

export function validateWebhookID(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new YuzuhaError('WEBHOOK_ID', 'Informe o ID do webhook.');
  }
  return value;
}

export function validateWebhookToken(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new YuzuhaError('WEBHOOK_TOKEN', 'Informe o token do webhook.');
  }
  return value;
}

export function validateWebhookMessageID(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new YuzuhaError('MESSAGE_ID', 'Informe o ID da mensagem.');
  }
  return value;
}

export function validateWebhookThreadID(value: unknown): string {
  if (typeof value !== 'string' || !SNOWFLAKE.test(value)) {
    throw new YuzuhaError('THREAD_ID', 'threadID deve ser um ID numérico de até 20 dígitos.');
  }
  return value;
}

export function validateAllowedMentions(value: unknown): AllowedMentionsPolicy {
  if (!isPlainObject(value)) {
    throw new YuzuhaError('MESSAGE_OPTION', 'allowedMentions deve ser um objeto.');
  }
  for (const key of Object.keys(value)) {
    if (!['parse', 'users', 'roles', 'repliedUser'].includes(key)) {
      throw new YuzuhaError('MESSAGE_OPTION', `allowedMentions desconhecido: ${key}.`);
    }
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
    const list = value[key];
    if (!Array.isArray(list) || list.length > MAX_MENTION_IDS
      || !list.every(item => typeof item === 'string' && SNOWFLAKE.test(item))) {
      throw new YuzuhaError('MESSAGE_OPTION', `${key} deve conter até ${MAX_MENTION_IDS} IDs válidos.`);
    }
    policy[key] = [...new Set(list as string[])];
  }
  if (value['repliedUser'] !== undefined) {
    if (typeof value['repliedUser'] !== 'boolean') {
      throw new YuzuhaError('MESSAGE_OPTION', 'repliedUser deve ser true ou false.');
    }
    policy.repliedUser = value['repliedUser'];
  }
  return policy;
}

export function validateWebhookFiles(raw: unknown): WebhookFileInput[] {
  if (!Array.isArray(raw) || raw.length > MAX_FILES) {
    throw new YuzuhaError('ATTACHMENTS', 'Envie até 10 anexos, com até 10 MB de bytes no total.');
  }
  let totalBytes = 0;
  return raw.map(entry => {
    if (!isPlainObject(entry)) {
      throw new YuzuhaError('ATTACHMENT', 'Cada anexo deve ser um objeto simples.');
    }
    const name = entry['name'];
    if (typeof name !== 'string' || !name.trim() || name.length > 255 || /[\r\n]/.test(name)) {
      throw new YuzuhaError('ATTACHMENT_NAME', 'Nome de anexo deve ter de 1 a 255 caracteres, sem quebras de linha.');
    }
    const description = entry['description'];
    if (description !== undefined && typeof description !== 'string') {
      throw new YuzuhaError('ATTACHMENT_DESCRIPTION', 'Descrição de anexo deve ser texto.');
    }
    const spoiler = entry['spoiler'];
    if (spoiler !== undefined && typeof spoiler !== 'boolean') {
      throw new YuzuhaError('ATTACHMENT', 'spoiler deve ser booleano.');
    }
    const hasData = entry['data'] !== undefined;
    const hasUrl = entry['url'] !== undefined;
    if (hasData === hasUrl) {
      throw new YuzuhaError('ATTACHMENT', 'Informe somente data ou url por anexo.');
    }
    if (hasData) {
      const data = entry['data'];
      if (!(data instanceof Uint8Array)) {
        throw new YuzuhaError('ATTACHMENTS', 'data do anexo deve ser Uint8Array.');
      }
      totalBytes += data.byteLength;
      if (totalBytes > MAX_FILE_BYTES) {
        throw new YuzuhaError('ATTACHMENTS', 'Envie de 1 a 10 anexos, com até 10 MB de bytes no total.');
      }
      return {
        data,
        name,
        ...(description === undefined ? {} : { description }),
        ...(spoiler === undefined ? {} : { spoiler }),
      };
    }
    const url = entry['url'];
    if (typeof url !== 'string') {
      throw new YuzuhaError('ATTACHMENT_URL', 'URL deve ser HTTP/HTTPS.');
    }
    httpURL(url, 'ATTACHMENT_URL');
    return {
      url,
      name,
      ...(description === undefined ? {} : { description }),
      ...(spoiler === undefined ? {} : { spoiler }),
    };
  });
}

export interface NormalizedWebhookSend {
  content?: string;
  username?: string;
  avatarURL?: string;
  embeds?: Embed[];
  files?: WebhookFileInput[];
  allowedMentions?: AllowedMentionsPolicy;
  threadID?: string;
}

export function normalizeWebhookSendInput(raw: unknown): NormalizedWebhookSend {
  const input = assertPlainObject(raw, 'Entrada de envio do webhook deve ser um objeto simples.');
  assertKnownKeys(input, SEND_KEYS, 'WebhookSendInput');

  if (input['content'] !== undefined && typeof input['content'] !== 'string') {
    throw new YuzuhaError('WEBHOOK_CONTENT', 'content deve ser texto.');
  }
  const rawContent = input['content'] as string | undefined;
  const hasContent = rawContent !== undefined && rawContent.trim().length > 0;

  let username: string | undefined;
  if (input['username'] !== undefined) {
    if (typeof input['username'] !== 'string' || !input['username'].trim()) {
      throw new YuzuhaError('WEBHOOK_NAME', 'username do webhook não pode ser vazio.');
    }
    username = input['username'];
  }

  let avatarURL: string | undefined;
  if (input['avatarURL'] !== undefined) {
    if (typeof input['avatarURL'] !== 'string') {
      throw new YuzuhaError('EMBED_URL', 'avatarURL deve ser uma URL HTTP/HTTPS.');
    }
    avatarURL = httpURL(input['avatarURL'], 'EMBED_URL');
  }

  let embeds: Embed[] | undefined;
  if (input['embeds'] !== undefined) {
    if (!Array.isArray(input['embeds'])) {
      throw new YuzuhaError('EMBED', 'embeds deve ser uma lista.');
    }
    assertEmbedCount(input['embeds'].length);
    if (input['embeds'].length > 0) embeds = input['embeds'] as Embed[];
  }

  let files: WebhookFileInput[] | undefined;
  if (input['files'] !== undefined) {
    const validated = validateWebhookFiles(input['files']);
    if (validated.length > 0) files = validated;
  }

  if (!hasContent && !embeds?.length && !files?.length) {
    throw new YuzuhaError('WEBHOOK_CONTENT', 'Informe texto, embeds ou anexos para enviar pelo webhook.');
  }

  const allowedMentions = input['allowedMentions'] === undefined
    ? undefined
    : validateAllowedMentions(input['allowedMentions']);
  const threadID = input['threadID'] === undefined
    ? undefined
    : validateWebhookThreadID(input['threadID']);

  return {
    ...(hasContent ? { content: rawContent } : {}),
    ...(username === undefined ? {} : { username }),
    ...(avatarURL === undefined ? {} : { avatarURL }),
    ...(embeds === undefined ? {} : { embeds }),
    ...(files === undefined ? {} : { files }),
    ...(allowedMentions === undefined ? {} : { allowedMentions }),
    ...(threadID === undefined ? {} : { threadID }),
  };
}

export interface NormalizedWebhookMessageEdit {
  content?: string | null;
  embeds?: Embed[];
  files?: WebhookFileInput[];
  allowedMentions?: AllowedMentionsPolicy;
  threadID?: string;
}

export function normalizeWebhookMessageEditInput(raw: unknown): NormalizedWebhookMessageEdit {
  const input = assertPlainObject(raw, 'Entrada de edição de mensagem de webhook deve ser um objeto simples.');
  assertKnownKeys(input, EDIT_MESSAGE_KEYS, 'WebhookMessageEditInput');

  if (input['content'] !== undefined && input['content'] !== null && typeof input['content'] !== 'string') {
    throw new YuzuhaError('WEBHOOK_CONTENT', 'content deve ser texto ou null.');
  }
  const content = input['content'] as string | null | undefined;

  let embeds: Embed[] | undefined;
  if (input['embeds'] !== undefined) {
    if (!Array.isArray(input['embeds'])) {
      throw new YuzuhaError('EMBED', 'embeds deve ser uma lista.');
    }
    assertEmbedCount(input['embeds'].length);
    embeds = input['embeds'] as Embed[];
  }

  const files = input['files'] === undefined ? undefined : validateWebhookFiles(input['files']);
  const allowedMentions = input['allowedMentions'] === undefined
    ? undefined
    : validateAllowedMentions(input['allowedMentions']);
  const threadID = input['threadID'] === undefined
    ? undefined
    : validateWebhookThreadID(input['threadID']);

  if (content === undefined && embeds === undefined && files === undefined && allowedMentions === undefined) {
    throw new YuzuhaError('WEBHOOK_CONTENT', 'Informe ao menos um campo para editar a mensagem do webhook.');
  }

  return {
    ...(content === undefined ? {} : { content }),
    ...(embeds === undefined ? {} : { embeds }),
    ...(files === undefined ? {} : { files }),
    ...(allowedMentions === undefined ? {} : { allowedMentions }),
    ...(threadID === undefined ? {} : { threadID }),
  };
}
