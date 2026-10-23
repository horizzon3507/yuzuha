import { cloneValue } from '../shared/clone.js';
import type { JsonValue, State, VariableScope } from '../domain/state.js';
import { assertSynchronous, variableKey } from '../domain/state.js';
import type { Store } from '../ports/store.js';
import { requireActor, requireGuild } from './authorization.js';
import type { ActorScope } from './authorization.js';
import { YuzuhaError } from '../shared/errors.js';

export interface VariableOptions {
  /** Milliseconds until expiry; omitted or null stores a persistent value. */
  ttlMs?: number | null;
}

export interface TransactionScope {
  get(name: string, fallback?: JsonValue): JsonValue;
  set(name: string, value: JsonValue, options?: VariableOptions): void;
  delete(name: string): void;
  update<T extends JsonValue>(name: string, updater: (current: JsonValue) => T, fallback?: JsonValue): T;
  expire(name: string, ttlMs: number | null): boolean;
  /** Remaining milliseconds, -1 for persistent values, -2 for missing values. */
  ttl(name: string): number;
}
export interface DataTransaction {
  readonly guild: TransactionScope;
  readonly user: TransactionScope;
  readonly global: TransactionScope;
  userFor(userID: string): TransactionScope;
}

type OperationTarget = { scope: VariableScope; name: string; userID?: string };
export type VariableOperation = OperationTarget & (
  | { op: 'get'; fallback?: JsonValue }
  | { op: 'set'; value: JsonValue; ttlMs?: number | null }
  | { op: 'delete' | 'ttl' }
  | { op: 'expire'; ttlMs: number | null }
  | { op: 'increment'; delta?: number; fallback?: number }
);
export const DATA_TRANSACTION_MAX = 100;

function userID(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 128) {
    throw new YuzuhaError('VARIABLE_USER', 'ID de usuário deve ter de 1 a 128 caracteres, sem espaços nas extremidades.');
  }
  return value;
}

function expiresAt(ttlMs: number | null | undefined, now: number): number | null {
  if (ttlMs === undefined || ttlMs === null) return null;
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 0 || !Number.isSafeInteger(now + ttlMs)) {
    throw new YuzuhaError('VARIABLE_TTL', 'TTL deve ser um inteiro não negativo em milissegundos, dentro do intervalo seguro.');
  }
  return now + ttlMs;
}

function present(state: Readonly<State>, key: string, now: number): boolean {
  const expiry = state.variableExpirations?.[key];
  return Object.hasOwn(state.variables, key) && (expiry === undefined || expiry > now);
}

function remove(state: State, key: string): void {
  delete state.variables[key];
  if (state.variableExpirations) delete state.variableExpirations[key];
}

function write(state: State, key: string, value: JsonValue, expiry: number | null): void {
  state.variables[key] = cloneValue(value);
  if (expiry === null) {
    if (state.variableExpirations) delete state.variableExpirations[key];
  } else {
    state.variableExpirations ??= {};
    state.variableExpirations[key] = expiry;
  }
}

export class VariableService {
  constructor(private readonly store: Store, private readonly scope: ActorScope,
    private readonly now: () => number = Date.now) {}

  forUser(id: string): VariableService {
    requireGuild(this.scope.guildID);
    return new VariableService(this.store, { ...this.scope, authorID: userID(id) }, this.now);
  }

  private key(scope: VariableScope, name: string, targetUserID?: string): string {
    const id = scope === 'guild' ? requireGuild(this.scope.guildID)
      : scope === 'user' ? targetUserID ?? requireActor(this.scope.authorID) : '';
    return variableKey(scope, id, name);
  }

  get(scope: VariableScope, name: string, fallback: JsonValue = null): Promise<JsonValue> {
    const key = this.key(scope, name);
    if (this.store.readVariable) return this.store.readVariable(key, this.now).then(value => value === undefined ? cloneValue(fallback) : value);
    return this.store.read(state => present(state, key, this.now()) ? state.variables[key]! : cloneValue(fallback));
  }

  async set(scope: VariableScope, name: string, value: JsonValue, options: VariableOptions = {}): Promise<void> {
    await this.transaction(data => data[scope].set(name, value, options));
  }

  async delete(scope: VariableScope, name: string): Promise<void> {
    await this.transaction(data => data[scope].delete(name));
  }

  update<T extends JsonValue>(scope: VariableScope, name: string, updater: (current: JsonValue) => T,
    fallback: JsonValue = null): Promise<T> {
    return this.transaction(data => data[scope].update(name, updater, fallback));
  }

  expire(scope: VariableScope, name: string, ttlMs: number | null): Promise<boolean> {
    return this.transaction(data => data[scope].expire(name, ttlMs));
  }

  ttl(scope: VariableScope, name: string): Promise<number> {
    const key = this.key(scope, name);
    return this.store.read(state => {
      const now = this.now();
      if (!present(state, key, now)) return -2;
      const expiry = state.variableExpirations?.[key];
      return expiry === undefined ? -1 : expiry - now;
    });
  }

  transaction<T>(writer: (data: DataTransaction) => T): Promise<T> {
    return this.store.update(state => {
      const now = this.now();
      let active = true;
      const key = (scope: VariableScope, name: string, targetUserID?: string) => {
        if (!active) throw new YuzuhaError('TRANSACTION_CLOSED', 'A transação já terminou.');
        return this.key(scope, name, targetUserID);
      };
      const scope = (name: VariableScope, targetUserID?: string): TransactionScope => Object.freeze({
        get: (property: string, fallback: JsonValue = null) => {
          const id = key(name, property, targetUserID);
          return cloneValue(present(state, id, now) ? state.variables[id]! : fallback);
        },
        set: (property: string, value: JsonValue, options: VariableOptions = {}) => {
          write(state, key(name, property, targetUserID), value, expiresAt(options.ttlMs, now));
        },
        delete: (property: string) => { remove(state, key(name, property, targetUserID)); },
        update: <V extends JsonValue>(property: string, updater: (current: JsonValue) => V, fallback: JsonValue = null): V => {
          const id = key(name, property, targetUserID), exists = present(state, id, now);
          const value = updater(cloneValue(exists ? state.variables[id]! : fallback));
          assertSynchronous(value);
          write(state, id, value, exists ? state.variableExpirations?.[id] ?? null : null);
          return value;
        },
        expire: (property: string, ttlMs: number | null) => {
          const expiry = expiresAt(ttlMs, now), id = key(name, property, targetUserID);
          if (!present(state, id, now)) { remove(state, id); return false; }
          if (expiry === null) {
            if (state.variableExpirations) delete state.variableExpirations[id];
          } else {
            state.variableExpirations ??= {};
            state.variableExpirations[id] = expiry;
          }
          return true;
        },
        ttl: (property: string) => {
          const id = key(name, property, targetUserID);
          if (!present(state, id, now)) return -2;
          const expiry = state.variableExpirations?.[id];
          return expiry === undefined ? -1 : expiry - now;
        },
      });
      let guildScope: TransactionScope | undefined, userScope: TransactionScope | undefined, globalScope: TransactionScope | undefined;
      const data = Object.freeze({ get guild() { return guildScope ??= scope('guild'); },
        get user() { return userScope ??= scope('user'); },
        get global() { return globalScope ??= scope('global'); },
        userFor: (id: string) => {
          if (!active) throw new YuzuhaError('TRANSACTION_CLOSED', 'A transação já terminou.');
          requireGuild(this.scope.guildID);
          return scope('user', userID(id));
        },
      });
      try { return writer(data); }
      finally { active = false; }
    });
  }
}

export function dataOperations(value: unknown): VariableOperation[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > DATA_TRANSACTION_MAX) {
    throw new YuzuhaError('DATA_TRANSACTION', `Transação deve conter de 1 a ${DATA_TRANSACTION_MAX} operações.`);
  }
  const fields: Record<string, string[]> = {
    get: ['fallback'], set: ['value', 'ttlMs'], delete: [], ttl: [], expire: ['ttlMs'], increment: ['delta', 'fallback'],
  };
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || typeof item.op !== 'string' || !Object.hasOwn(fields, item.op)
      || !['guild', 'user', 'global'].includes(item.scope) || typeof item.name !== 'string') {
      throw new YuzuhaError('DATA_TRANSACTION', 'Operação deve declarar op, scope e name válidos.');
    }
    variableKey(item.scope, '', item.name);
    const allowed = new Set(['op', 'scope', 'name', 'userID', ...fields[item.op]!]);
    if (Object.keys(item).some(field => !allowed.has(field))) {
      throw new YuzuhaError('DATA_TRANSACTION', 'Operação contém campos desconhecidos.');
    }
    if (item.userID !== undefined) {
      if (item.scope !== 'user') throw new YuzuhaError('DATA_TRANSACTION', 'userID exige scope user.');
      userID(item.userID);
    }
    if (item.op === 'set' && !Object.hasOwn(item, 'value')) throw new YuzuhaError('DATA_TRANSACTION', 'set exige value.');
    if (item.op === 'expire' && !Object.hasOwn(item, 'ttlMs')) throw new YuzuhaError('DATA_TRANSACTION', 'expire exige ttlMs.');
    if (item.ttlMs !== undefined) expiresAt(item.ttlMs, Date.now());
    if (item.op === 'increment' && ((item.delta !== undefined && !Number.isFinite(item.delta))
      || (item.fallback !== undefined && !Number.isFinite(item.fallback)))) {
      throw new YuzuhaError('DATA_TRANSACTION', 'delta e fallback devem ser números finitos.');
    }
  }
  return cloneValue(value) as VariableOperation[];
}

export function executeDataOperations(data: DataTransaction, operations: readonly VariableOperation[]): JsonValue[] {
  return operations.map(operation => {
    const scope = operation.userID === undefined ? data[operation.scope] : data.userFor(operation.userID);
    switch (operation.op) {
      case 'get': return scope.get(operation.name, operation.fallback);
      case 'set': scope.set(operation.name, operation.value, { ttlMs: operation.ttlMs }); return null;
      case 'delete': scope.delete(operation.name); return null;
      case 'ttl': return scope.ttl(operation.name);
      case 'expire': return scope.expire(operation.name, operation.ttlMs);
      case 'increment': return scope.update(operation.name, current => {
        if (typeof current !== 'number' || !Number.isFinite(current)) throw new YuzuhaError('DATA_TRANSACTION', 'increment exige variável numérica.');
        const next = current + (operation.delta ?? 1);
        if (!Number.isFinite(next)) throw new YuzuhaError('DATA_TRANSACTION', 'Resultado de increment não é finito.');
        return next;
      }, operation.fallback ?? 0);
    }
  });
}
