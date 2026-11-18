import { YuzuhaError } from '../shared/errors.js';

export interface AuditLogQueryInput {
  limit?: number;
  userID?: string;
  actionType?: number;
  before?: string;
  after?: string;
}

export interface AuditLogChangeInfo {
  key: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface AuditLogOptionsInfo {
  deleteMemberDays?: string;
  membersRemoved?: string;
  channelID?: string;
  messageID?: string;
  count?: string;
  id?: string;
  type?: string;
  roleName?: string;
  applicationID?: string;
  [key: string]: string | undefined;
}

const QUERY_KEYS = new Set(['limit', 'userID', 'actionType', 'before', 'after']);
const SNOWFLAKE = /^\d{1,20}$/;

const KNOWN_OPTION_KEYS: Record<string, string> = {
  delete_member_days: 'deleteMemberDays',
  deleteMemberDays: 'deleteMemberDays',
  members_removed: 'membersRemoved',
  membersRemoved: 'membersRemoved',
  channel_id: 'channelID',
  channelId: 'channelID',
  channelID: 'channelID',
  message_id: 'messageID',
  messageId: 'messageID',
  messageID: 'messageID',
  role_name: 'roleName',
  roleName: 'roleName',
  application_id: 'applicationID',
  applicationId: 'applicationID',
  applicationID: 'applicationID',
  count: 'count',
  id: 'id',
  type: 'type',
};

function normalizeOptionKey(key: string): string {
  const known = KNOWN_OPTION_KEYS[key];
  if (known !== undefined) return known;
  return key
    .replace(/_id$/i, 'ID')
    .replace(/Id$/, 'ID')
    .replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function normalizeAuditLogOptions(raw: Record<string, string> | null | undefined): AuditLogOptionsInfo | null {
  if (!raw) return null;
  const normalized: AuditLogOptionsInfo = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    normalized[normalizeOptionKey(key)] = String(value);
  }
  return normalized;
}

function assertLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new YuzuhaError('LIMIT', 'Limite deve ser um inteiro entre 1 e 100.');
  }
  return value;
}

function assertSnowflake(value: unknown, key: string, code: 'AUDIT_LOG_CURSOR' | 'AUDIT_LOG_OPTIONS'): string {
  if (typeof value !== 'string' || !SNOWFLAKE.test(value)) {
    throw new YuzuhaError(code, `${key} deve ser um ID numérico de até 20 dígitos.`);
  }
  return value;
}

export function auditLogQueryInput(raw?: number | AuditLogQueryInput): Required<Pick<AuditLogQueryInput, 'limit'>> & Omit<AuditLogQueryInput, 'limit'> {
  if (raw === undefined) return { limit: 50 };
  if (typeof raw === 'number') return { limit: assertLimit(raw) };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) {
    throw new YuzuhaError('AUDIT_LOG_OPTIONS', 'Opções de auditoria devem ser um número ou objeto simples.');
  }
  const input = raw as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!QUERY_KEYS.has(key)) {
      throw new YuzuhaError('AUDIT_LOG_OPTIONS', `Filtro de auditoria desconhecido: ${key}.`);
    }
  }
  const limit = input['limit'] === undefined ? 50 : assertLimit(input['limit']);
  const userID = input['userID'] === undefined
    ? undefined
    : assertSnowflake(input['userID'], 'userID', 'AUDIT_LOG_OPTIONS');
  let actionType: number | undefined;
  if (input['actionType'] !== undefined) {
    const candidate = input['actionType'];
    if (typeof candidate !== 'number' || !Number.isSafeInteger(candidate) || candidate < 1) {
      throw new YuzuhaError('AUDIT_LOG_OPTIONS', 'actionType deve ser um inteiro positivo.');
    }
    actionType = candidate;
  }
  const before = input['before'] === undefined
    ? undefined
    : assertSnowflake(input['before'], 'before', 'AUDIT_LOG_CURSOR');
  const after = input['after'] === undefined
    ? undefined
    : assertSnowflake(input['after'], 'after', 'AUDIT_LOG_CURSOR');
  if (before !== undefined && after !== undefined) {
    throw new YuzuhaError('AUDIT_LOG_CURSOR', 'Use apenas um cursor de paginação: before ou after.');
  }
  return {
    limit,
    ...(userID === undefined ? {} : { userID }),
    ...(actionType === undefined ? {} : { actionType }),
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
  };
}
