import type { JsonValue } from '../../../domain/state.js';
import { YuzuhaError } from '../../../errors.js';
import { toJson } from '../arguments.js';

export function jsonClone(value: unknown): JsonValue {
  if (value === undefined) return null;
  return toJson(value);
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a !== null && b !== null && typeof a === 'object') {
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      return a.every((item, index) => deepEqual(item, b[index]));
    }
    const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
    const keys = Object.keys(left);
    if (keys.length !== Object.keys(right).length) return false;
    return keys.every(key => Object.hasOwn(right, key) && deepEqual(left[key], right[key]));
  }
  return false;
}

export function integer(raw: string, label = 'Valor'): number {
  const value = Number(raw);
  if (!raw.trim() || !Number.isSafeInteger(value)) throw new YuzuhaError('INDEX', `${label} deve ser um número inteiro.`);
  return value;
}

export function finiteNumber(raw: string, label = 'Valor'): number {
  const value = Number(raw);
  if (!raw.trim() || !Number.isFinite(value)) throw new YuzuhaError('NUMBER', `${label} deve ser um número válido.`);
  return value;
}

export function requireArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new YuzuhaError('ARRAY', 'Valor deve ser um array.');
  return value;
}

/**
 * Converte escalares textuais exatos em números, booleanos ou null.
 * Aplicado apenas a estruturas de dados ($array, $object, push/pull), onde
 * literais como 1 e true devem preservar o tipo no JSON.
 */
export function typedScalar(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
    const number = Number(value);
    if (Number.isFinite(number) && String(number) === value) return number;
  }
  return value;
}

