import type { JsonValue } from '../../domain/state.js';
import { YuzuhaError } from '../../errors.js';

export function index(value: string, min = 0): number {
  const result = Number(value);
  if (!value.trim() || !Number.isSafeInteger(result) || result < min) throw new YuzuhaError('INDEX', `Índice deve ser inteiro >= ${min}.`);
  return result;
}

export function finite(value: string): number {
  const result = Number(value);
  if (!value.trim() || !Number.isFinite(result)) throw new YuzuhaError('NUMBER', 'Número inválido.');
  return result;
}

export function toJson(value: unknown): JsonValue {
  try { return JSON.parse(JSON.stringify(value)) as JsonValue; }
  catch (cause) { throw new YuzuhaError('JSON', 'Valor não pode ser salvo como JSON.', { cause }); }
}
