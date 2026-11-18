import { YuzuhaError } from '../shared/errors.js';

export interface ServiceKey<T> {
  readonly id: symbol;
  readonly description: string;
  readonly __type?: T;
}

export interface ServiceLookup {
  get<T>(key: ServiceKey<T>): T;
  resolve<T>(key: ServiceKey<T>): T | undefined;
}

export function assertServiceKey<T>(key: ServiceKey<T>): void {
  if (!key || typeof key !== 'object' || typeof key.id !== 'symbol'
    || typeof key.description !== 'string' || !key.description.trim()) {
    throw new YuzuhaError('SERVICE_KEY', 'Chave de serviço inválida.');
  }
}

export function createServiceKey<T>(description: string): ServiceKey<T> {
  if (typeof description !== 'string' || !description.trim()) {
    throw new YuzuhaError('SERVICE_KEY', 'A descrição da chave de serviço não pode ser vazia.');
  }
  return Object.freeze({ id: Symbol(description), description });
}
