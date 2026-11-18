import { GuardError, YuzuhaError } from '../shared/errors.js';
import { defaultTranslator } from './i18n.js';
import type { MessageTranslator } from './i18n.js';

export function userID(value: string, t: MessageTranslator = defaultTranslator): string {
  const id = /^(?:<@!?(\d+)>|(\d+))$/.exec(value.trim());
  if (!id) throw new GuardError(t('argUser'), 'INVALID_ARGUMENT');
  return (id[1] ?? id[2])!;
}

export function channelID(value: string, t: MessageTranslator = defaultTranslator): string {
  const id = /^(?:<#(\d+)>|(\d+))$/.exec(value.trim());
  if (!id) throw new GuardError(t('argChannel'), 'INVALID_ARGUMENT');
  return (id[1] ?? id[2])!;
}

export function roleID(value: string, t: MessageTranslator = defaultTranslator): string {
  const id = /^(?:<@&(\d+)>|(\d+))$/.exec(value.trim());
  if (!id) throw new GuardError(t('argRole'), 'INVALID_ARGUMENT');
  return (id[1] ?? id[2])!;
}

export interface UrlArgumentOptions {
  protocols?: readonly string[];
}

export const DEFAULT_URL_PROTOCOLS: readonly string[] = Object.freeze(['http:', 'https:']);
const FORBIDDEN_URL_PROTOCOLS: ReadonlySet<string> = new Set(['javascript:', 'data:', 'vbscript:']);

export function normalizeUrlProtocols(
  protocols: readonly string[],
  errorCode: 'ARGUMENT_SCHEMA' | 'COMMAND_ARGS' = 'ARGUMENT_SCHEMA',
): readonly string[] {
  if (!Array.isArray(protocols) || protocols.length === 0) {
    throw new YuzuhaError(errorCode, 'protocols deve ser uma lista não vazia de protocolos.');
  }
  const normalized: string[] = [];
  for (const entry of protocols) {
    if (typeof entry !== 'string') {
      throw new YuzuhaError(errorCode, 'protocols deve conter apenas textos.');
    }
    const trimmed = entry.trim().toLowerCase();
    const scheme = trimmed.endsWith(':') ? trimmed : `${trimmed}:`;
    if (!/^[a-z][a-z0-9+.-]*:$/.test(scheme) || FORBIDDEN_URL_PROTOCOLS.has(scheme)) {
      throw new YuzuhaError(errorCode, `Protocolo de URL inválido ou proibido: ${entry}.`);
    }
    if (!normalized.includes(scheme)) normalized.push(scheme);
  }
  return Object.freeze(normalized);
}

export function parseArgumentUrl(
  value: string,
  protocols: readonly string[] = DEFAULT_URL_PROTOCOLS,
  label?: string,
  t: MessageTranslator = defaultTranslator,
): URL {
  const raw = value.trim();
  if (!raw || /\s/u.test(raw)) {
    throw new GuardError(t('argUrl', label), 'INVALID_ARGUMENT');
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new GuardError(t('argUrl', label), 'INVALID_ARGUMENT');
  }
  if (FORBIDDEN_URL_PROTOCOLS.has(parsed.protocol) || !protocols.includes(parsed.protocol)) {
    throw new GuardError(
      t('argUrlProtocol', protocols.map(protocol => protocol.slice(0, -1)), label),
      'INVALID_ARGUMENT',
    );
  }
  if (parsed.username || parsed.password) {
    throw new GuardError(t('argUrlCredentials', label), 'INVALID_ARGUMENT');
  }
  return parsed;
}

export function parseDuration(value: string | number): number {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value > 0) return value;
  } else {
    const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/.exec(value.trim());
    if (match) {
      const ms = Number(match[1]) * ({ ms: 1, s: 1000, m: 60_000, h: 3600_000, d: 86400_000 }[match[2]!]!);
      if (Number.isSafeInteger(ms) && ms > 0) return ms;
    }
  }
  throw new YuzuhaError('DURATION', 'Duração inválida. Use 500ms, 5s, 10m, 2h ou 1d.');
}

export const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

const DURATION_UNITS: [number, string, string][] = [
  [86_400_000, 'dia', 'dias'],
  [3_600_000, 'hora', 'horas'],
  [60_000, 'minuto', 'minutos'],
  [1_000, 'segundo', 'segundos'],
  [1, 'milissegundo', 'milissegundos'],
];

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || !Number.isInteger(ms) || ms <= 0) {
    throw new YuzuhaError('DURATION', 'Informe uma duração inteira positiva em milissegundos.');
  }
  const parts: string[] = [];
  let rest = ms;
  for (const [size, singular, plural] of DURATION_UNITS) {
    if (parts.length === 2) break;
    const count = Math.floor(rest / size);
    if (count <= 0) continue;
    parts.push(`${count} ${count === 1 ? singular : plural}`);
    rest -= count * size;
  }
  return parts.length === 1 ? parts[0]! : `${parts[0]} e ${parts[1]}`;
}
