import { GuardError, YuzuhaError } from '../shared/errors.js';

export function userID(value: string): string {
  const id = /^(?:<@!?(\d+)>|(\d+))$/.exec(value.trim());
  if (!id) throw new GuardError('Mencione um usuário ou informe um ID válido.');
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
