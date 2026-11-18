import type { IncomingMessage } from '../domain/messages.js';
import type { JsonValue, State } from '../domain/state.js';
import { isPlainRecord, validateVariableValue } from '../domain/state-validation.js';
import type { Store } from '../ports/store.js';
import { cloneValue } from '../shared/clone.js';
import { ConfigError, YuzuhaError } from '../shared/errors.js';

export type GuildSettingsRecord = Record<string, JsonValue | undefined>;
export type GuildSettingsValidator<T> = (candidate: T) => boolean | string | void;

export interface GuildSettingsOptions<T extends GuildSettingsRecord> {
  /** Store onde as configurações por servidor serão persistidas. */
  store: Store;
  /** Objeto JSON plano com os valores padrão mesclados em cada leitura. */
  defaults: T;
  /** Namespace da chave dedicada no store (padrão `'settings'`). */
  namespace?: string;
  /** Limite máximo de servidores em cache LRU (padrão `1_000`; `0` desativa o cache). */
  maxCacheEntries?: number;
  /** Tempo de vida das entradas do cache em ms (padrão `300_000`; `0` desativa o cache). */
  ttlMs?: number;
  /** Relógio usado pelo cache e leituras com TTL no store (padrão `Date.now`). */
  now?: () => number;
  /** Validador síncrono executado antes de persistir `set` ou `patch`. */
  validate?: GuildSettingsValidator<T>;
  /** Callback disparado após `set`, `patch` ou `reset` confirmado. */
  onChange?: (guildID: string, next: Readonly<T>) => void;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface LookupToken {
  readonly guildID: string;
  readonly globalEpoch: number;
  readonly keyEpoch: number;
}

const DEFAULT_NAMESPACE = 'settings';
const DEFAULT_MAX_CACHE_ENTRIES = 1_000;
const MAX_CACHE_ENTRIES_LIMIT = 1_000_000;
const DEFAULT_TTL_MS = 300_000;
const MAX_TTL_MS = 86_400_000;
const NAMESPACE_PATTERN = /^[a-zA-Z0-9._:-]{1,64}$/;

function assertGuildID(guildID: unknown): string {
  if (typeof guildID !== 'string' || !guildID.trim() || guildID !== guildID.trim() || guildID.length > 128) {
    throw new YuzuhaError('GUILD_REQUIRED', 'ID de servidor deve ter de 1 a 128 caracteres, sem espaços nas extremidades.');
  }
  return guildID;
}

function readPersistedFromState(state: Readonly<State>, key: string, now: number): JsonValue | undefined {
  const expiry = state.variableExpirations?.[key];
  if (!Object.hasOwn(state.variables, key) || (expiry !== undefined && expiry <= now)) return undefined;
  return state.variables[key];
}

function clonePlainObject<T extends GuildSettingsRecord>(source: T): T {
  const copy: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === '__proto__' || value === undefined) continue;
    copy[key] = cloneValue(value);
  }
  return copy as unknown as T;
}

function mergeWithDefaults<T extends GuildSettingsRecord>(
  defaults: T,
  persisted: Record<string, unknown> | undefined,
): T {
  const merged = clonePlainObject(defaults) as Record<string, JsonValue>;
  if (!persisted) return merged as unknown as T;
  for (const [key, value] of Object.entries(persisted)) {
    if (key === '__proto__' || value === undefined) continue;
    if (!validateVariableValue(value)) {
      throw new YuzuhaError('GUILD_SETTINGS_INVALID', `Valor JSON inválido no campo "${key}".`);
    }
    merged[key] = cloneValue(value);
  }
  return merged as unknown as T;
}

/** Serviço tipado de configurações por servidor sobre `Store` com cache LRU+TTL e atualização atômica. */
export class GuildSettings<T extends GuildSettingsRecord = Record<string, JsonValue>> {
  readonly namespace: string;
  private readonly store: Store;
  private readonly defaults: T;
  private readonly maxCacheEntries: number;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly validateFn?: GuildSettingsValidator<T>;
  private readonly onChangeFn?: (guildID: string, next: Readonly<T>) => void;

  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly inFlight = new Map<string, number>();
  private readonly keyEpochs = new Map<string, number>();
  private readonly committedSeq = new Map<string, number>();
  private globalEpoch = 0;
  private writeSeq = 0;

  constructor(options: GuildSettingsOptions<T>) {
    if (!isPlainRecord(options)) {
      throw new ConfigError('GUILD_SETTINGS_OPTIONS', 'Opções de GuildSettings inválidas.');
    }
    const rawStore = options['store'] as Partial<Store> | null | undefined;
    if (
      !rawStore
      || typeof rawStore !== 'object'
      || typeof rawStore.read !== 'function'
      || typeof rawStore.update !== 'function'
      || (rawStore.readVariable !== undefined && typeof rawStore.readVariable !== 'function')
    ) {
      throw new ConfigError('GUILD_SETTINGS_OPTIONS', 'store deve implementar read e update.');
    }
    const rawDefaults = options['defaults'];
    if (!isPlainRecord(rawDefaults) || Object.hasOwn(rawDefaults, '__proto__') || !validateVariableValue(rawDefaults)) {
      throw new ConfigError('GUILD_SETTINGS_OPTIONS', 'defaults deve ser um objeto JSON plano válido.');
    }
    const rawNamespace = options['namespace'] ?? DEFAULT_NAMESPACE;
    if (typeof rawNamespace !== 'string' || !NAMESPACE_PATTERN.test(rawNamespace)) {
      throw new ConfigError('GUILD_SETTINGS_OPTIONS', 'namespace deve ter de 1 a 64 caracteres ([a-zA-Z0-9._:-]).');
    }
    const rawMaxCache = options['maxCacheEntries'] ?? DEFAULT_MAX_CACHE_ENTRIES;
    if (typeof rawMaxCache !== 'number' || !Number.isSafeInteger(rawMaxCache) || rawMaxCache < 0 || rawMaxCache > MAX_CACHE_ENTRIES_LIMIT) {
      throw new ConfigError('GUILD_SETTINGS_OPTIONS', `maxCacheEntries deve ser um inteiro seguro entre 0 e ${MAX_CACHE_ENTRIES_LIMIT}.`);
    }
    const rawTtl = options['ttlMs'] ?? DEFAULT_TTL_MS;
    if (typeof rawTtl !== 'number' || !Number.isSafeInteger(rawTtl) || rawTtl < 0 || rawTtl > MAX_TTL_MS) {
      throw new ConfigError('GUILD_SETTINGS_OPTIONS', `ttlMs deve ser um inteiro seguro entre 0 e ${MAX_TTL_MS}.`);
    }
    const rawNow = options['now'] ?? Date.now;
    if (typeof rawNow !== 'function') {
      throw new ConfigError('GUILD_SETTINGS_OPTIONS', 'now deve ser uma função.');
    }
    const rawValidate = options['validate'];
    if (rawValidate !== undefined && typeof rawValidate !== 'function') {
      throw new ConfigError('GUILD_SETTINGS_OPTIONS', 'validate deve ser uma função.');
    }
    const rawOnChange = options['onChange'];
    if (rawOnChange !== undefined && typeof rawOnChange !== 'function') {
      throw new ConfigError('GUILD_SETTINGS_OPTIONS', 'onChange deve ser uma função.');
    }

    this.store = rawStore as Store;
    this.defaults = clonePlainObject(rawDefaults as T);
    this.namespace = rawNamespace;
    this.maxCacheEntries = rawMaxCache;
    this.ttlMs = rawTtl;
    this.now = rawNow as () => number;
    this.validateFn = rawValidate as GuildSettingsValidator<T> | undefined;
    this.onChangeFn = rawOnChange as ((guildID: string, next: Readonly<T>) => void) | undefined;
  }

  /** Quantidade atual de servidores armazenados no cache em memória. */
  get cacheSize(): number {
    return this.cache.size;
  }

  /** Chave dedicada usada no `Store` para um servidor. */
  keyFor(guildID: string): string {
    const id = assertGuildID(guildID);
    return `guild:${id}:__settings__:${this.namespace}`;
  }

  /** Lê as configurações efetivas do servidor (mesclando `defaults` + persistido) usando cache LRU+TTL. */
  async get(guildID: string): Promise<T> {
    const id = assertGuildID(guildID);
    const cached = this.readCache(id);
    if (cached !== undefined) return cached;

    const token = this.captureToken(id);
    try {
      const key = `guild:${id}:__settings__:${this.namespace}`;
      const persisted = this.store.readVariable
        ? await this.store.readVariable(key, this.now)
        : await this.store.read(state => readPersistedFromState(state, key, this.now()));
      if (persisted !== undefined && (!isPlainRecord(persisted) || Object.hasOwn(persisted, '__proto__'))) {
        throw new YuzuhaError('GUILD_SETTINGS_INVALID', 'Configuração persistida do servidor não é um objeto JSON plano.');
      }
      const merged = mergeWithDefaults(this.defaults, persisted);
      this.writeCacheIfCurrent(token, merged);
      return cloneValue(merged);
    } finally {
      this.releaseToken(token);
    }
  }

  /** Substitui as configurações do servidor após validação síncrona e atualiza o cache. */
  async set(guildID: string, value: T): Promise<T> {
    const id = assertGuildID(guildID);
    if (!isPlainRecord(value) || Object.hasOwn(value, '__proto__')) {
      throw new YuzuhaError('GUILD_SETTINGS_INVALID', 'As configurações do servidor devem ser um objeto JSON plano.');
    }
    const key = `guild:${id}:__settings__:${this.namespace}`;
    this.bumpKeyEpoch(id);
    let seq = 0;
    const committed = await this.store.update(state => {
      const next = mergeWithDefaults(this.defaults, value);
      this.assertValid(next);
      state.variables[key] = cloneValue(next) as JsonValue;
      if (state.variableExpirations) delete state.variableExpirations[key];
      seq = ++this.writeSeq;
      this.committedSeq.set(id, seq);
      return next;
    });
    this.bumpKeyEpoch(id);
    if (this.committedSeq.get(id) === seq) {
      this.writeCacheDirect(id, committed);
    }
    this.onChangeFn?.(id, Object.freeze(cloneValue(committed)));
    return cloneValue(committed);
  }

  /** Aplica uma atualização parcial atômica sobre o valor persistido do servidor. */
  async patch(guildID: string, partial: Partial<T>): Promise<T> {
    const id = assertGuildID(guildID);
    if (!isPlainRecord(partial) || Object.hasOwn(partial, '__proto__')) {
      throw new YuzuhaError('GUILD_SETTINGS_INVALID', 'A atualização parcial deve ser um objeto JSON plano.');
    }
    const key = `guild:${id}:__settings__:${this.namespace}`;
    this.bumpKeyEpoch(id);
    let seq = 0;
    const committed = await this.store.update(state => {
      const persisted = readPersistedFromState(state, key, this.now());
      if (persisted !== undefined && (!isPlainRecord(persisted) || Object.hasOwn(persisted, '__proto__'))) {
        throw new YuzuhaError('GUILD_SETTINGS_INVALID', 'Configuração persistida do servidor não é um objeto JSON plano.');
      }
      const next = mergeWithDefaults(this.defaults, persisted) as Record<string, JsonValue>;
      for (const [field, fieldValue] of Object.entries(partial)) {
        if (field === '__proto__') {
          throw new YuzuhaError('GUILD_SETTINGS_INVALID', 'Campo proibido em configurações do servidor.');
        }
        if (fieldValue === undefined) continue;
        if (!validateVariableValue(fieldValue)) {
          throw new YuzuhaError('GUILD_SETTINGS_INVALID', `Valor JSON inválido no campo "${field}".`);
        }
        next[field] = cloneValue(fieldValue);
      }
      const typedNext = next as unknown as T;
      this.assertValid(typedNext);
      state.variables[key] = cloneValue(typedNext) as JsonValue;
      if (state.variableExpirations) delete state.variableExpirations[key];
      seq = ++this.writeSeq;
      this.committedSeq.set(id, seq);
      return typedNext;
    });
    this.bumpKeyEpoch(id);
    if (this.committedSeq.get(id) === seq) {
      this.writeCacheDirect(id, committed);
    }
    this.onChangeFn?.(id, Object.freeze(cloneValue(committed)));
    return cloneValue(committed);
  }

  /** Remove as configurações customizadas do servidor, restaurando `defaults`. */
  async reset(guildID: string): Promise<T> {
    const id = assertGuildID(guildID);
    const key = `guild:${id}:__settings__:${this.namespace}`;
    this.bumpKeyEpoch(id);
    let seq = 0;
    await this.store.update(state => {
      delete state.variables[key];
      if (state.variableExpirations) delete state.variableExpirations[key];
      seq = ++this.writeSeq;
      this.committedSeq.set(id, seq);
    });
    const restored = cloneValue(this.defaults);
    this.bumpKeyEpoch(id);
    if (this.committedSeq.get(id) === seq) {
      this.writeCacheDirect(id, restored);
    }
    this.onChangeFn?.(id, Object.freeze(cloneValue(this.defaults)));
    return restored;
  }

  /** Invalida o cache de um servidor específico ou de todos os servidores. */
  invalidate(guildID?: string): void {
    if (guildID === undefined) {
      this.globalEpoch++;
      this.cache.clear();
      this.inFlight.clear();
      this.keyEpochs.clear();
      this.committedSeq.clear();
      return;
    }
    const id = assertGuildID(guildID);
    this.cache.delete(id);
    this.committedSeq.delete(id);
    this.bumpKeyEpoch(id);
  }

  private assertValid(candidate: T): void {
    if (!validateVariableValue(candidate)) {
      throw new YuzuhaError('GUILD_SETTINGS_INVALID', 'As configurações do servidor contêm valores JSON inválidos.');
    }
    if (!this.validateFn) return;
    let outcome: boolean | string | void;
    try {
      outcome = this.validateFn(cloneValue(candidate));
    } catch (error) {
      if (error instanceof YuzuhaError && error.code === 'GUILD_SETTINGS_INVALID') throw error;
      const message = error instanceof Error && error.message ? error.message : 'Configurações do servidor inválidas.';
      throw new YuzuhaError('GUILD_SETTINGS_INVALID', message, { cause: error });
    }
    if (outcome && (typeof outcome === 'object' || typeof outcome === 'function') && 'then' in (outcome as object)) {
      void Promise.resolve(outcome).catch(() => {});
      throw new YuzuhaError('GUILD_SETTINGS_INVALID', 'O validador de GuildSettings deve ser síncrono.');
    }
    if (outcome === false) {
      throw new YuzuhaError('GUILD_SETTINGS_INVALID', 'Configurações do servidor recusadas pela validação.');
    }
    if (typeof outcome === 'string') {
      throw new YuzuhaError('GUILD_SETTINGS_INVALID', outcome || 'Configurações do servidor inválidas.');
    }
  }

  private get cacheEnabled(): boolean {
    return this.maxCacheEntries > 0 && this.ttlMs > 0;
  }

  private readCache(guildID: string): T | undefined {
    if (!this.cacheEnabled) return undefined;
    const entry = this.cache.get(guildID);
    if (!entry) return undefined;
    if (this.now() >= entry.expiresAt) {
      this.cache.delete(guildID);
      return undefined;
    }
    this.cache.delete(guildID);
    this.cache.set(guildID, entry);
    return cloneValue(entry.value);
  }

  private captureToken(guildID: string): LookupToken | undefined {
    if (!this.cacheEnabled) return undefined;
    this.inFlight.set(guildID, (this.inFlight.get(guildID) ?? 0) + 1);
    return {
      guildID,
      globalEpoch: this.globalEpoch,
      keyEpoch: this.keyEpochs.get(guildID) ?? 0,
    };
  }

  private releaseToken(token: LookupToken | undefined): void {
    if (!token || token.globalEpoch !== this.globalEpoch) return;
    const next = (this.inFlight.get(token.guildID) ?? 0) - 1;
    if (next <= 0) {
      this.inFlight.delete(token.guildID);
      this.keyEpochs.delete(token.guildID);
    } else {
      this.inFlight.set(token.guildID, next);
    }
  }

  private bumpKeyEpoch(guildID: string): void {
    this.cache.delete(guildID);
    if ((this.inFlight.get(guildID) ?? 0) > 0) {
      this.keyEpochs.set(guildID, (this.keyEpochs.get(guildID) ?? 0) + 1);
    }
  }

  private writeCacheIfCurrent(token: LookupToken | undefined, value: T): void {
    if (!token || !this.cacheEnabled) return;
    if (token.globalEpoch !== this.globalEpoch) return;
    if ((this.keyEpochs.get(token.guildID) ?? 0) !== token.keyEpoch) return;
    this.writeCacheDirect(token.guildID, value);
  }

  private writeCacheDirect(guildID: string, value: T): void {
    if (!this.cacheEnabled) return;
    const now = this.now();
    if (this.cache.has(guildID)) {
      this.cache.delete(guildID);
    } else if (this.cache.size >= this.maxCacheEntries) {
      for (const [candidateID, candidate] of this.cache) {
        if (now >= candidate.expiresAt) this.cache.delete(candidateID);
        if (this.cache.size < this.maxCacheEntries) break;
      }
      while (this.cache.size >= this.maxCacheEntries) {
        const oldest = this.cache.keys().next().value;
        if (oldest === undefined) break;
        this.cache.delete(oldest);
      }
    }
    this.cache.set(guildID, { value: cloneValue(value), expiresAt: now + this.ttlMs });
  }
}

function clonePrefixValue(value: string | readonly string[]): string | string[] {
  return Array.isArray(value) ? [...value] : (value as string);
}

/**
 * Cria um resolvedor dinâmico de prefixo para `YuzuhaOptions.prefix` apoiado em {@link GuildSettings}.
 * Retorna `fallback` sincronamente em DMs (`!message.guildID`) e consulta `settings.get(guildID)` em servidores.
 */
export function guildPrefix<T extends GuildSettingsRecord & { prefix?: string | string[] | null }>(
  settings: GuildSettings<T>,
  fallback: string | string[] = '!',
): (message: IncomingMessage) => string | string[] | Promise<string | string[]> {
  if (!settings || typeof (settings as { get?: unknown }).get !== 'function') {
    throw new ConfigError('GUILD_SETTINGS_OPTIONS', 'settings deve ser uma instância válida de GuildSettings.');
  }
  const candidates = Array.isArray(fallback) ? [...fallback] : [fallback];
  if (candidates.length === 0 || candidates.some(item => typeof item !== 'string' || !item || /\s/.test(item))) {
    throw new ConfigError('PREFIX', 'Prefixos devem ser textos não vazios sem espaços.');
  }
  const safeFallback: string | readonly string[] = Array.isArray(fallback) ? Object.freeze(candidates) : fallback;

  return (message: IncomingMessage): string | string[] | Promise<string | string[]> => {
    if (!message.guildID) return clonePrefixValue(safeFallback);
    return settings.get(message.guildID).then(current => {
      const configured = current.prefix;
      if (configured === undefined || configured === null) return clonePrefixValue(safeFallback);
      return clonePrefixValue(configured);
    });
  };
}

