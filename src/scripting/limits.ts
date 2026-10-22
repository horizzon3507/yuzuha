import { YuzuhaError } from '../errors.js';
import type { Limits } from './types.js';

export const defaultLimits: Readonly<Limits> = Object.freeze({
  calls: 10_000,
  depth: 64,
  output: 100_000,
  timeoutMs: 10_000,
});

export function resolveLimits(limits: Limits): Readonly<Limits> {
  const snapshot = { ...limits };
  for (const key of Object.keys(defaultLimits) as (keyof Limits)[]) {
    const value = snapshot[key];
    if (!Number.isSafeInteger(value) || value < 1) throw new YuzuhaError('LIMITS', `Limite inválido: ${key}.`);
  }
  return Object.freeze(snapshot);
}
