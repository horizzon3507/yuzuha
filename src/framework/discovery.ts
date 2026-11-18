import type { Client, ClientOptions, DiscoveryOrigin } from '@fluxerjs/core';
import { ConfigError } from '../errors.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertHttpOrigin(raw: unknown, label: string): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ConfigError('DISCOVERY_OPTIONS', `${label} deve ser uma URL HTTP(S) não vazia.`);
  }
  const trimmed = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ConfigError('DISCOVERY_OPTIONS', `${label} deve ser uma URL HTTP(S) válida.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConfigError('DISCOVERY_OPTIONS', `${label} deve usar protocolo http: ou https:.`);
  }
  return trimmed;
}

export function assertClientOptions(clientOptions: unknown): ClientOptions | undefined {
  if (clientOptions === undefined) return undefined;
  if (!isPlainObject(clientOptions)) {
    throw new ConfigError('OPTIONS', 'clientOptions deve ser um objeto.');
  }
  return clientOptions as ClientOptions;
}

export function validateDiscoveryOptions(
  discovery: unknown,
  client: Client | undefined,
  clientOptions: ClientOptions | undefined,
): DiscoveryOrigin | undefined {
  if (discovery === undefined) return undefined;
  if (client !== undefined) {
    throw new ConfigError('DISCOVERY_OPTIONS', 'Não informe client e discovery simultaneamente.');
  }
  if (clientOptions?.instance !== undefined) {
    throw new ConfigError('DISCOVERY_OPTIONS', 'Não informe clientOptions.instance junto com discovery.');
  }
  if (typeof discovery === 'string') {
    return assertHttpOrigin(discovery, 'discovery');
  }
  if (isPlainObject(discovery)) {
    for (const key of Object.keys(discovery)) {
      if (key !== 'api' && key !== 'version') {
        throw new ConfigError('DISCOVERY_OPTIONS', `Campo desconhecido em discovery: ${key}.`);
      }
    }
    const api = assertHttpOrigin(discovery.api, 'discovery.api');
    if (discovery.version !== undefined && (typeof discovery.version !== 'string' || !discovery.version.trim())) {
      throw new ConfigError('DISCOVERY_OPTIONS', 'discovery.version deve ser um texto não vazio quando informado.');
    }
    return {
      api,
      ...(discovery.version !== undefined ? { version: discovery.version.trim() } : {}),
    };
  }
  throw new ConfigError('DISCOVERY_OPTIONS', 'discovery deve ser uma URL HTTP(S) ou objeto { api, version? }.');
}
