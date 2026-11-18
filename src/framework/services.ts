import { YuzuhaError } from '../errors.js';
import { assertServiceKey, createServiceKey } from '../ports/services.js';
import type { ServiceKey, ServiceLookup } from '../ports/services.js';

export { assertServiceKey, createServiceKey };
export type { ServiceKey, ServiceLookup };

export class ServiceContainer implements ServiceLookup {
  private readonly entries = new Map<symbol, unknown>();

  provide<T>(key: ServiceKey<T>, value: T): void {
    assertServiceKey(key);
    if (this.entries.has(key.id)) {
      throw new YuzuhaError('SERVICE_DUPLICATE', `Serviço já registrado: ${key.description}.`);
    }
    this.entries.set(key.id, value);
  }

  has(key: ServiceKey<unknown>): boolean {
    assertServiceKey(key);
    return this.entries.has(key.id);
  }

  get<T>(key: ServiceKey<T>): T {
    assertServiceKey(key);
    if (!this.entries.has(key.id)) {
      throw new YuzuhaError('SERVICE_MISSING', `Serviço não registrado: ${key.description}.`);
    }
    return this.entries.get(key.id) as T;
  }

  resolve<T>(key: ServiceKey<T>): T | undefined {
    assertServiceKey(key);
    if (!this.entries.has(key.id)) return undefined;
    return this.entries.get(key.id) as T;
  }

  delete(key: ServiceKey<unknown>): boolean {
    return this.entries.delete(key.id);
  }
}
