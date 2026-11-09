import { GuardError, YuzuhaError } from '../shared/errors.js';

export type ResolvedLabel = { id: string; label: string };
export type ResolvedMember = { status: 'found'; id: string; label: string; mention: string; via: 'mention' | 'id' | 'exact' | 'prefix' }
  | { status: 'ambiguous'; candidates: ResolvedLabel[] }
  | { status: 'missing'; query: string };
export type ResolvedBan = { status: 'found'; id: string; label: string; reason: string | null; via: 'mention' | 'id' | 'exact' | 'prefix' }
  | { status: 'ambiguous'; candidates: ResolvedLabel[] }
  | { status: 'missing'; query: string };
export type ResolvedUser = { status: 'found'; id: string; label: string; mention: string; via: 'mention' | 'id' }
  | { status: 'missing'; query: string };

export function normalize(query: string): string {
  return query.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function mentionID(query: string): string | undefined {
  const match = /^<@!?(\d+)>$/.exec(query.trim()) ?? /^(\d+)$/.exec(query.trim());
  return match?.[1];
}

export function matchCandidates<T extends { id: string; names: (string | null | undefined)[] }>(
    query: string, items: T[]): { kind: 'exact' | 'prefix'; items: T[] } | undefined {
  const wanted = normalize(query);
  if (!wanted) return;
  const exact = items.filter(item => item.names.some(name => name && normalize(name) === wanted));
  if (exact.length) return { kind: 'exact', items: exact };
  const prefix = items.filter(item => item.names.some(name => name && normalize(name).startsWith(wanted)));
  if (prefix.length) return { kind: 'prefix', items: prefix };
  return;
}

export function rankCandidates(candidates: { id: string; label: string }[]): { id: string; label: string }[] {
  return [...candidates].sort((a, b) => a.label.localeCompare(b.label) || (a.id < b.id ? -1 : 1)).slice(0, 5);
}

export function cleanReason(text: string, options: { maxLength?: number } = {}): string {
  const maxLength = options.maxLength ?? 512;
  if (!Number.isSafeInteger(maxLength) || maxLength < 1) throw new YuzuhaError('REASON_LIMIT', 'maxLength deve ser inteiro positivo.');
  const cleaned = text.replace(/<@[!&]?\d+>|<#\d+>/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}
