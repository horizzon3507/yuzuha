import type { JsonValue, State, VariableScope } from './state.js';
import { variableKey } from './state.js';
import { YuzuhaError } from '../shared/errors.js';

export interface VariableQueryOptions { prefix?: string; after?: string; limit?: number }
export interface VariableQuery {
  scope: VariableScope;
  subject: string;
  prefix: string;
  after?: string;
  limit: number;
}
export interface VariableEntry { name: string; value: JsonValue; ttlMs: number }
export interface VariablePage { entries: VariableEntry[]; nextCursor: string | null }

export function queryOptions(options: VariableQueryOptions): Required<Pick<VariableQueryOptions, 'prefix' | 'limit'>> & Pick<VariableQueryOptions, 'after'> {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(key => !['prefix', 'after', 'limit'].includes(key))) throw new YuzuhaError('VARIABLE_QUERY', 'Opções de consulta inválidas.');
  const { prefix = '', after, limit = 50 } = options;
  if (typeof prefix !== 'string' || prefix.length > 128 || (after !== undefined && (typeof after !== 'string' || after.length > 128))
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new YuzuhaError('VARIABLE_QUERY', 'Prefixo/cursor até 128 caracteres; limit deve ser inteiro de 1 a 100.');
  return { prefix, after, limit };
}

/** Hex UTF-16 code units preserve JavaScript ordinal order in SQLite's binary index. */
export function variableNameKey(name: string): string {
  let result = '';
  for (let i = 0; i < name.length; i++) result += name.charCodeAt(i).toString(16).padStart(4, '0');
  return result;
}

export function variableIdentity(key: string): [VariableScope, string, string] | undefined {
  let parts: unknown;
  try { parts = JSON.parse(key); } catch { return undefined; }
  if (!Array.isArray(parts) || parts.length !== 3 || !['global', 'guild', 'user'].includes(parts[0])
    || typeof parts[1] !== 'string' || typeof parts[2] !== 'string' || !parts[2] || parts[2].length > 128) return undefined;
  return variableKey(parts[0], parts[1], parts[2]) === key ? parts as [VariableScope, string, string] : undefined;
}

export function variablePage(entries: VariableEntry[], limit: number): VariablePage {
  const more = entries.length > limit;
  const page = entries.slice(0, limit);
  return { entries: page, nextCursor: more ? page.at(-1)!.name : null };
}

export function queryState(state: Readonly<State>, query: VariableQuery, now: number): VariablePage {
  const entries: VariableEntry[] = [];
  for (const [key, value] of Object.entries(state.variables)) {
    const parts = variableIdentity(key);
    if (!parts || parts[0] !== query.scope || parts[1] !== query.subject || !parts[2].startsWith(query.prefix)
      || (query.after !== undefined && parts[2] <= query.after)) continue;
    const expiry = state.variableExpirations?.[key];
    if (expiry !== undefined && expiry <= now) continue;
    entries.push({ name: parts[2], value, ttlMs: expiry === undefined ? -1 : expiry - now });
  }
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return variablePage(entries, query.limit);
}
