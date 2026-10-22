import type { JsonValue, VariableScope } from '../domain/state.js';
import type { VariableService } from './variables.js';
import type { DataTransaction } from './variables.js';
import type { VariableOptions } from './variables.js';

export class ScopedData {
  constructor(private readonly variables: VariableService, private readonly scope: VariableScope) {}

  get(name: string, fallback: JsonValue = null): Promise<JsonValue> {
    return this.variables.get(this.scope, name, fallback);
  }

  set(name: string, value: JsonValue, options?: VariableOptions): Promise<void> {
    return this.variables.set(this.scope, name, value, options);
  }

  delete(name: string): Promise<void> {
    return this.variables.delete(this.scope, name);
  }

  update<T extends JsonValue>(name: string, updater: (current: JsonValue) => T, fallback: JsonValue = null): Promise<T> {
    return this.variables.update(this.scope, name, updater, fallback);
  }

  expire(name: string, ttlMs: number | null): Promise<boolean> {
    return this.variables.expire(this.scope, name, ttlMs);
  }

  ttl(name: string): Promise<number> {
    return this.variables.ttl(this.scope, name);
  }
}

export interface NativeData {
  readonly guild: ScopedData;
  readonly user: ScopedData;
  readonly global: ScopedData;
  userFor(userID: string): ScopedData;
  transaction<T>(writer: (data: DataTransaction) => T): Promise<T>;
}
