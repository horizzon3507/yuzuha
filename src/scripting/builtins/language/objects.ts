import type { JsonValue } from '../../../domain/state.js';
import { YuzuhaError } from '../../../errors.js';
import { toJson } from '../arguments.js';
import { defineFunctions } from '../definition.js';
import { typedScalar } from './common.js';

function setOwn(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

function arrayIndex(segment: string): number {
  const index = Number(segment);
  if (!isIndex(segment) || !Number.isSafeInteger(index) || index < 0 || index >= 10_000) {
    throw new YuzuhaError('JSON_PATH', 'Índice no caminho JSON deve estar entre 0 e 9999.');
  }
  return index;
}

export function parsePath(path: string): string[] {
  if (path === '') return [];
  const segments = path.split('.');
  for (const segment of segments) {
    if (segment.length === 0) throw new YuzuhaError('JSON_PATH', 'Caminho JSON inválido. Use pontos e índices, ex. "a.0.b".');
  }
  return segments;
}

export function isIndex(segment: string): boolean {
  if (segment.length === 0) return false;
  for (const char of segment) {
    if (char < '0' || char > '9') return false;
  }
  return true;
}

function getByPath(value: unknown, segments: string[]): { found: boolean; value: unknown } {
  let current = value;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      if (!isIndex(segment)) return { found: false, value: undefined };
      const index = Number(segment);
      if (!Number.isSafeInteger(index) || index < 0 || index >= current.length) return { found: false, value: undefined };
      current = current[index];
      continue;
    }
    if (current !== null && typeof current === 'object') {
      if (!Object.hasOwn(current, segment)) return { found: false, value: undefined };
      current = (current as Record<string, unknown>)[segment];
      continue;
    }
    return { found: false, value: undefined };
  }
  return { found: true, value: current };
}

export function setJsonPath(base: unknown, segments: string[], fresh: unknown): JsonValue {
  if (segments.length === 0) return toJson(fresh);
  const root: unknown = base !== null && typeof base === 'object' ? structuredClone(base) : {};
  let current = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!;
    const next = segments[i + 1]!;
    const nextIsIndex = isIndex(next);
    if (Array.isArray(current)) {
      if (!isIndex(segment)) throw new YuzuhaError('JSON_PATH', 'Caminho JSON inválido para array.');
      const index = arrayIndex(segment);
      while (current.length <= index) current.push(nextIsIndex ? [] : {});
      const child = current[index];
      if (child !== null && typeof child === 'object') {
        current = child;
      } else {
        const created: unknown = nextIsIndex ? [] : {};
        current[index] = created;
        current = created;
      }
      continue;
    }
    if (current !== null && typeof current === 'object') {
      const record = current as Record<string, unknown>;
      const child = Object.hasOwn(record, segment) ? record[segment] : undefined;
      if (child !== null && typeof child === 'object') {
        current = child;
      } else {
        const created: unknown = nextIsIndex ? [] : {};
        setOwn(record, segment, created);
        current = created;
      }
      continue;
    }
    throw new YuzuhaError('JSON_PATH', 'Caminho JSON inválido.');
  }
  const last = segments.at(-1)!;
  if (Array.isArray(current)) {
    if (!isIndex(last)) throw new YuzuhaError('JSON_PATH', 'Caminho JSON inválido para array.');
    const index = arrayIndex(last);
    while (current.length <= index) current.push(null);
    current[index] = toJson(fresh);
    return root as JsonValue;
  }
  if (current !== null && typeof current === 'object') {
    setOwn(current, last, toJson(fresh));
    return root as JsonValue;
  }
  throw new YuzuhaError('JSON_PATH', 'Caminho JSON inválido.');
}

export function deleteJsonPath(base: unknown, segments: string[]): JsonValue {
  if (segments.length === 0) return null;
  if (base === null || typeof base !== 'object') return toJson(base);
  const root = structuredClone(base) as Record<string, unknown>;
  let current: unknown = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!;
    if (Array.isArray(current)) {
      if (!isIndex(segment)) return root as JsonValue;
      const index = Number(segment);
      if (!Number.isSafeInteger(index) || index < 0 || index >= current.length) return root as JsonValue;
      current = current[index];
      continue;
    }
    if (current !== null && typeof current === 'object') {
      const record = current as Record<string, unknown>;
      if (!Object.hasOwn(record, segment)) return root as JsonValue;
      current = record[segment];
      continue;
    }
    return root as JsonValue;
  }
  const last = segments.at(-1)!;
  if (Array.isArray(current)) {
    if (!isIndex(last)) return root as JsonValue;
    const index = Number(last);
    if (Number.isSafeInteger(index) && index >= 0 && index < current.length) current.splice(index, 1);
    return root as JsonValue;
  }
  if (current !== null && typeof current === 'object') delete (current as Record<string, unknown>)[last];
  return root as JsonValue;
}

function mergeJson(base: unknown, patch: unknown): JsonValue {
  if (base !== null && patch !== null && typeof base === 'object' && typeof patch === 'object'
    && !Array.isArray(base) && !Array.isArray(patch)) {
    const result: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(base)) setOwn(result, key, toJson(value));
    for (const [key, value] of Object.entries(patch)) {
      setOwn(result, key, Object.hasOwn(base, key) ? mergeJson((base as Record<string, unknown>)[key], value) : toJson(value));
    }
    return result;
  }
  return toJson(patch);
}

export const objectFunctions = defineFunctions(fn => {
  for (const [name, operation] of [['jsonValues', Object.values], ['jsonEntries', Object.entries]] as const) {
    fn(name, 'language', 1, 1, '[valor]', 'Lista valores ou pares de chaves e valores próprios de objeto ou array.', async c => {
      const value = await c.arg(0);
      if (value === null || typeof value !== 'object') throw new YuzuhaError('JSON_OBJECT', 'Valor não é objeto nem array.');
      return operation(value);
    });
  }
  fn('object', 'language', 0, 64, '[chave;valor;...]', 'Monta objeto com pares chave;valor. Número ímpar de argumentos é erro.', async c => {
    if (c.count % 2 === 1) throw new YuzuhaError('OBJECT', 'Número ímpar de argumentos em $object. Use pares chave;valor.');
    const result: Record<string, unknown> = {};
    for (let i = 0; i < c.count; i += 2) {
      const key = await c.text(i);
      setOwn(result, key, typedScalar(toJson(await c.arg(i + 1))));
    }
    return result;
  });
  fn('jsonEncode', 'language', 1, 1, '[valor]', 'Codifica valor como texto JSON.', async c => {
    const value = await c.arg(0);
    try {
      const encoded = JSON.stringify(value);
      return encoded === undefined ? '' : encoded;
    } catch (cause) {
      throw new YuzuhaError('JSON_ENCODE', 'Valor não pode ser codificado como JSON.', { cause });
    }
  });
  fn('jsonDecode', 'language', 1, 1, '[texto]', 'Decodifica texto JSON. Erro se inválido.', async c => {
    const raw = await c.text(0);
    try {
      return JSON.parse(raw);
    } catch (cause) {
      throw new YuzuhaError('JSON_DECODE', 'JSON inválido.', { cause });
    }
  });
  fn('jsonGet', 'language', 2, 3, '[valor;caminho;padrão?]', 'Lê caminho com pontos e índices, ex. "a.0.b". Retorna padrão se ausente.', async c => {
    const value = await c.arg(0);
    const path = await c.text(1);
    const segments = parsePath(path);
    if (segments.length === 0) return value;
    const result = getByPath(value, segments);
    if (result.found) return result.value as unknown;
    return c.count > 2 ? await c.arg(2) : '';
  });
  fn('jsonSet', 'language', 3, 3, '[valor;caminho;novo]', 'Retorna cópia com caminho alterado, sem mutar o original.', async c => {
    const base = await c.arg(0);
    const path = await c.text(1);
    const fresh = toJson(await c.arg(2));
    return setJsonPath(base, parsePath(path), fresh);
  });
  fn('jsonDelete', 'language', 2, 2, '[valor;caminho]', 'Retorna cópia sem o caminho; remove índice de array. Caminho ausente não altera.', async c => {
    const base = await c.arg(0);
    const path = await c.text(1);
    return deleteJsonPath(base, parsePath(path));
  });
  fn('jsonMerge', 'language', 1, 64, '[valor;...]', 'Mescla objetos em profundidade, sem mutar; o último valor vence e arrays são substituídos.', async c => {
    let result: JsonValue = toJson(await c.arg(0));
    for (let i = 1; i < c.count; i++) result = mergeJson(result, await c.arg(i));
    return result;
  });
  fn('jsonKeys', 'language', 1, 1, '[valor]', 'Lista chaves próprias de objeto ou índices de array.', async c => {
    const value = await c.arg(0);
    if (value === null || typeof value !== 'object') throw new YuzuhaError('JSON_KEYS', 'Valor não é objeto nem array.');
    return Object.keys(value);
  });
  fn('hasProp', 'language', 2, 2, '[valor;chave]', 'Verifica propriedade própria de objeto.', async c => {
    const value = await c.arg(0);
    const key = await c.text(1);
    return value !== null && typeof value === 'object' && Object.hasOwn(value, key);
  });
});
