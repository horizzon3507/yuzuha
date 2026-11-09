import { GuardError, YuzuhaError } from '../shared/errors.js';

export function userID(value: string): string {
  const id = /^(?:<@!?(\d+)>|(\d+))$/.exec(value.trim());
  if (!id) throw new GuardError('Mencione um usuário ou informe um ID válido.', 'INVALID_ARGUMENT');
  return (id[1] ?? id[2])!;
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
