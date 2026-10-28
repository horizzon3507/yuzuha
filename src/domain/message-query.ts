import { YuzuhaError } from '../shared/errors.js';

export interface MessageSearchInput {
  content?: string;
  contents?: string[];
  exactPhrases?: string[];
  guildID?: string;
  channelID?: string;
  channelIDs?: string[];
  excludeChannelIDs?: string[];
  authorID?: string;
  authorIDs?: string[];
  excludeAuthorIDs?: string[];
  authorType?: Array<'user' | 'bot' | 'webhook'>;
  excludeAuthorType?: Array<'user' | 'bot' | 'webhook'>;
  mentions?: string[];
  excludeMentions?: string[];
  mentionEveryone?: boolean;
  pinned?: boolean;
  includeNsfw?: boolean;
  has?: string[];
  excludeHas?: string[];
  minID?: string;
  maxID?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  page?: number;
  cursor?: string[];
}

export interface PinnedMessagesInput {
  limit?: number;
  before?: string;
}

const SEARCH_KEYS = new Set(['content', 'contents', 'exactPhrases', 'guildID', 'channelID', 'channelIDs',
  'excludeChannelIDs', 'authorID', 'authorIDs', 'excludeAuthorIDs', 'authorType', 'excludeAuthorType',
  'mentions', 'excludeMentions', 'mentionEveryone', 'pinned', 'includeNsfw', 'has', 'excludeHas',
  'minID', 'maxID', 'sortBy', 'sortOrder', 'limit', 'page', 'cursor']);
const ID_KEYS = new Set(['guildID', 'channelID', 'authorID', 'minID', 'maxID']);
const ID_ARRAY_KEYS = new Set(['channelIDs', 'excludeChannelIDs', 'authorIDs', 'excludeAuthorIDs', 'mentions', 'excludeMentions']);
const BOOLEAN_KEYS = new Set(['mentionEveryone', 'pinned', 'includeNsfw']);

function options(raw: unknown, keys: Set<string>): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) {
    throw new YuzuhaError('MESSAGE_OPTIONS', 'Opções de mensagens devem ser um objeto simples.');
  }
  const result = raw as Record<string, unknown>;
  if (Object.keys(result).some(key => !keys.has(key))) {
    throw new YuzuhaError('MESSAGE_OPTIONS', 'Propriedade de opções de mensagens desconhecida.');
  }
  return result;
}

function id(value: unknown, key: string): string {
  if (typeof value !== 'string' || !/^\d{1,20}$/.test(value)) {
    throw new YuzuhaError('MESSAGE_OPTIONS', `${key} deve ser um ID numérico de até 20 dígitos.`);
  }
  return value;
}

function text(value: unknown, key: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new YuzuhaError('MESSAGE_OPTIONS', `${key} deve ser texto de 1 a ${max} caracteres.`);
  }
  return value;
}

function integer(value: unknown, key: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    throw new YuzuhaError('MESSAGE_OPTIONS', `${key} deve ser inteiro entre ${min} e ${max}.`);
  }
  return Number(value);
}

export function messageSearchInput(raw: unknown): MessageSearchInput {
  const input = options(raw, SEARCH_KEYS), result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (ID_KEYS.has(key)) result[key] = id(value, key);
    else if (BOOLEAN_KEYS.has(key)) {
      if (typeof value !== 'boolean') throw new YuzuhaError('MESSAGE_OPTIONS', `${key} deve ser booleano.`);
      result[key] = value;
    } else if (key === 'limit' || key === 'page') {
      result[key] = key === 'limit' ? integer(value, key, 1, 100) : integer(value, key, 0, 9999);
    } else if (key === 'content' || key === 'sortBy' || key === 'sortOrder') {
      result[key] = text(value, key, key === 'content' ? 2000 : 100);
      if (key === 'sortOrder' && value !== 'asc' && value !== 'desc') {
        throw new YuzuhaError('MESSAGE_OPTIONS', 'sortOrder deve ser asc ou desc.');
      }
    } else {
      const maxItems = ID_ARRAY_KEYS.has(key) ? 100 : key === 'cursor' ? 10 : 20;
      const minItems = key === 'cursor' ? 0 : 1;
      if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
        throw new YuzuhaError('MESSAGE_OPTIONS', `${key} deve ser array de ${minItems} a ${maxItems} itens.`);
      }
      result[key] = Array.from(value, item => {
        if (ID_ARRAY_KEYS.has(key)) return id(item, key);
        const itemText = text(item, key, ['contents', 'exactPhrases', 'cursor'].includes(key) ? 2000 : 100);
        if ((key === 'authorType' || key === 'excludeAuthorType') && !['user', 'bot', 'webhook'].includes(itemText)) {
          throw new YuzuhaError('MESSAGE_OPTIONS', `${key} aceita user, bot ou webhook.`);
        }
        return itemText;
      });
    }
  }
  if (result['authorID'] !== undefined && result['authorIDs'] !== undefined) {
    throw new YuzuhaError('MESSAGE_OPTIONS', 'Use somente authorID ou authorIDs.');
  }
  if (result['page'] !== undefined && result['cursor'] !== undefined) {
    throw new YuzuhaError('MESSAGE_CURSOR', 'Use somente page ou cursor na busca.');
  }
  if (typeof result['minID'] === 'string' && typeof result['maxID'] === 'string'
    && BigInt(result['minID']) > BigInt(result['maxID'])) {
    throw new YuzuhaError('MESSAGE_OPTIONS', 'minID não pode ser maior que maxID.');
  }
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 32_768) {
    throw new YuzuhaError('MESSAGE_OPTIONS', 'Opções de busca excedem 32 KiB.');
  }
  return result as MessageSearchInput;
}

export function pinnedMessagesInput(raw: unknown = {}): PinnedMessagesInput {
  const input = options(raw, new Set(['limit', 'before']));
  const limit = input['limit'] === undefined ? 50 : integer(input['limit'], 'limit', 1, 100);
  const before = input['before'];
  if (before !== undefined && (typeof before !== 'string' || before.length > 64
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(before)
    || !Number.isFinite(Date.parse(before)))) {
    throw new YuzuhaError('MESSAGE_CURSOR', 'Cursor de fixadas deve ser um timestamp ISO com fuso.');
  }
  return { limit, ...(before === undefined ? {} : { before: before as string }) };
}

export function reactionUsersInput(raw: unknown = {}): { limit: number; after?: string } {
  const input = options(raw, new Set(['limit', 'after']));
  const limit = input['limit'] === undefined ? 100 : integer(input['limit'], 'limit', 1, 100);
  const after = input['after'];
  return { limit, ...(after === undefined ? {} : { after: id(after, 'after') }) };
}
