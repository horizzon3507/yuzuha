import { EventEmitter } from 'node:events';
import type { Client, ClientOptions, DiscoveryOrigin } from '@fluxerjs/core';
import { ClientCluster, ClientClusterEvents } from '@fluxerjs/core/cluster';
import type {
  AddClientRuntimeOptions,
  ClientRuntime,
  ClientRuntimeStatus,
  RestartClientRuntimeOptions,
} from '@fluxerjs/core/cluster';
import { ConfigError, YuzuhaError } from '../shared/errors.js';
import { Yuzuha, resolveDestroyTimeout } from './bot.js';
import type { DestroyOptions, SignalHandlerOptions, YuzuhaOptions } from './options.js';

export const YuzuhaClusterEvents = ClientClusterEvents;
export type YuzuhaClusterEventName = (typeof YuzuhaClusterEvents)[keyof typeof YuzuhaClusterEvents];

export type ClusterBotOptions = Omit<YuzuhaOptions, 'client' | 'clientOptions'>;
export type ClusterBotOptionsInput<TMeta = unknown> =
  | ClusterBotOptions
  | ((runtime: ClientRuntime, meta?: TMeta) => ClusterBotOptions | Promise<ClusterBotOptions>);

export interface YuzuhaClusterEntry<TMeta = unknown> {
  readonly id: string;
  readonly bot: Yuzuha;
  readonly client: Client;
  readonly runtime: ClientRuntime;
  readonly status: ClientRuntimeStatus;
  readonly lastError?: Error;
  readonly meta?: TMeta;
}

export interface YuzuhaClusterEventMap<TMeta = unknown> {
  [YuzuhaClusterEvents.RuntimeAdded]: [entry: YuzuhaClusterEntry<TMeta>];
  [YuzuhaClusterEvents.RuntimeReady]: [entry: YuzuhaClusterEntry<TMeta>];
  [YuzuhaClusterEvents.RuntimeRemoved]: [entry: YuzuhaClusterEntry<TMeta>];
  [YuzuhaClusterEvents.RuntimeError]: [entry: YuzuhaClusterEntry<TMeta>, error: Error];
}

export type YuzuhaClusterEventListener<
  K extends keyof YuzuhaClusterEventMap<TMeta>,
  TMeta = unknown,
> = (...args: YuzuhaClusterEventMap<TMeta>[K]) => void;

export interface YuzuhaClusterOptions<TMeta = unknown> {
  createBot?: (runtime: ClientRuntime, meta?: TMeta) => Yuzuha | Promise<Yuzuha>;
  botOptions?: ClusterBotOptionsInput<TMeta>;
  setup?: (bot: Yuzuha, runtime: ClientRuntime, meta?: TMeta) => void | Promise<void>;
  suppressBetaWarning?: boolean;
}

export interface AddYuzuhaRuntimeOptions<TMeta = unknown> extends AddClientRuntimeOptions {
  meta?: TMeta;
  createBot?: (runtime: ClientRuntime, meta?: TMeta) => Yuzuha | Promise<Yuzuha>;
  botOptions?: ClusterBotOptionsInput<TMeta>;
  setup?: (bot: Yuzuha, runtime: ClientRuntime, meta?: TMeta) => void | Promise<void>;
}

export interface RestartYuzuhaRuntimeOptions extends RestartClientRuntimeOptions {
  timeoutMs?: number;
}

interface RuntimeRecipe<TMeta> {
  readonly prebuiltClient: boolean;
  readonly discovery?: DiscoveryOrigin;
  readonly clientOptions?: ClientOptions;
  readonly meta?: TMeta;
  readonly createBot?: (runtime: ClientRuntime, meta?: TMeta) => Yuzuha | Promise<Yuzuha>;
  readonly botOptions?: ClusterBotOptionsInput<TMeta>;
  readonly setup?: (bot: Yuzuha, runtime: ClientRuntime, meta?: TMeta) => void | Promise<void>;
}

interface InternalClusterEntry<TMeta> {
  readonly id: string;
  readonly bot: Yuzuha;
  runtime: ClientRuntime;
  readonly meta?: TMeta;
  destroyPromise?: Promise<void>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertBotOptionsObject(value: unknown, label: string): ClusterBotOptions {
  if (!isPlainObject(value)) {
    throw new ConfigError('CLUSTER_OPTIONS', `${label} deve ser um objeto de opções do Yuzuha.`);
  }
  if ('client' in value && value.client !== undefined) {
    throw new ConfigError('CLUSTER_OPTIONS', `${label} não pode definir client; use a opção client do runtime.`);
  }
  if ('clientOptions' in value && value.clientOptions !== undefined) {
    throw new ConfigError('CLUSTER_OPTIONS', `${label} não pode definir clientOptions; use clientOptions no runtime.`);
  }
  return value as ClusterBotOptions;
}

function validateBotOptionsInput(
  input: unknown,
  label: string,
): void {
  if (input === undefined || typeof input === 'function') return;
  assertBotOptionsObject(input, label);
}

async function resolveBotOptionsInput<TMeta>(
  input: ClusterBotOptionsInput<TMeta> | undefined,
  runtime: ClientRuntime,
  meta: TMeta | undefined,
  label: string,
): Promise<ClusterBotOptions | undefined> {
  if (input === undefined) return undefined;
  const resolved = typeof input === 'function' ? await input(runtime, meta) : input;
  return assertBotOptionsObject(resolved, label);
}

function validateRuntimeId(id: unknown): string {
  if (typeof id !== 'string' || !id.trim()) {
    throw new ConfigError('CLUSTER_OPTIONS', 'id do runtime deve ser uma string não vazia.');
  }
  return id.trim();
}

function validateRuntimeToken(token: unknown): string {
  if (typeof token !== 'string') {
    throw new ConfigError('CLUSTER_OPTIONS', 'token do runtime deve ser uma string.');
  }
  const trimmed = token.trim();
  if (!trimmed) {
    throw new ConfigError('TOKEN_MISSING', 'Informe um token não vazio para o runtime do cluster.');
  }
  return trimmed;
}

/**
 * Supervisor em memória para múltiplos bots `Yuzuha` com tokens independentes no mesmo processo.
 * Delega conexões ao `ClientCluster` do SDK sem reter tokens em estado acessível.
 */
export class YuzuhaCluster<TMeta = unknown> extends EventEmitter {
  private readonly cluster: ClientCluster;
  private readonly clusterOptions: YuzuhaClusterOptions<TMeta>;
  private readonly entries = new Map<string, InternalClusterEntry<TMeta>>();
  private readonly recipes = new Map<string, RuntimeRecipe<TMeta>>();
  private readonly staging = new Map<string, { recipe: RuntimeRecipe<TMeta>; createdBot?: Yuzuha }>();
  private readonly pendingAdds = new Map<string, { abort: AbortController; task: Promise<YuzuhaClusterEntry<TMeta>> }>();
  private readonly signalDisposers = new Set<() => void>();
  private closed = false;
  private closeTask?: Promise<void>;

  constructor(options?: YuzuhaClusterOptions<TMeta>) {
    super();
    this.setMaxListeners(0);
    if (options !== undefined && !isPlainObject(options)) {
      throw new ConfigError('CLUSTER_OPTIONS', 'Opções de YuzuhaCluster devem ser um objeto.');
    }
    if (options?.createBot !== undefined && typeof options.createBot !== 'function') {
      throw new ConfigError('CLUSTER_OPTIONS', 'createBot deve ser uma função.');
    }
    if (options?.createBot !== undefined && options.botOptions !== undefined) {
      throw new ConfigError('CLUSTER_OPTIONS', 'Informe apenas um entre createBot e botOptions em YuzuhaClusterOptions.');
    }
    validateBotOptionsInput(options?.botOptions, 'botOptions');
    if (options?.setup !== undefined && typeof options.setup !== 'function') {
      throw new ConfigError('CLUSTER_OPTIONS', 'setup deve ser uma função.');
    }
    if (options?.suppressBetaWarning !== undefined && typeof options.suppressBetaWarning !== 'boolean') {
      throw new ConfigError('CLUSTER_OPTIONS', 'suppressBetaWarning deve ser booleano.');
    }

    this.clusterOptions = options ? { ...options } : {};
    this.cluster = new ClientCluster({
      suppressBetaWarning: options?.suppressBetaWarning ?? true,
      configure: runtime => this.configureRuntime(runtime),
    });

    this.cluster.on(ClientClusterEvents.RuntimeReady, runtime => {
      const entry = this.entries.get(runtime.id);
      if (!entry || entry.runtime.client !== runtime.client) return;
      entry.runtime = runtime;
      this.emit(YuzuhaClusterEvents.RuntimeReady, this.toPublicEntry(entry));
    });

    this.cluster.on(ClientClusterEvents.RuntimeError, (runtime, error) => {
      const entry = this.entries.get(runtime.id);
      if (!entry || entry.runtime.client !== runtime.client) return;
      entry.runtime = runtime;
      this.emit(YuzuhaClusterEvents.RuntimeError, this.toPublicEntry(entry), error);
    });
  }

  override on<K extends keyof YuzuhaClusterEventMap<TMeta>>(
    event: K,
    listener: YuzuhaClusterEventListener<K, TMeta>,
  ): this;
  override on(event: string | symbol, listener: (...args: unknown[]) => void): this;
  override on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  override once<K extends keyof YuzuhaClusterEventMap<TMeta>>(
    event: K,
    listener: YuzuhaClusterEventListener<K, TMeta>,
  ): this;
  override once(event: string | symbol, listener: (...args: unknown[]) => void): this;
  override once(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.once(event, listener);
  }

  override off<K extends keyof YuzuhaClusterEventMap<TMeta>>(
    event: K,
    listener: YuzuhaClusterEventListener<K, TMeta>,
  ): this;
  override off(event: string | symbol, listener: (...args: unknown[]) => void): this;
  override off(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.off(event, listener);
  }

  override emit<K extends keyof YuzuhaClusterEventMap<TMeta>>(
    event: K,
    ...args: YuzuhaClusterEventMap<TMeta>[K]
  ): boolean;
  override emit(event: string | symbol, ...args: unknown[]): boolean;
  override emit(event: string | symbol, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }

  get size(): number {
    return this.entries.size;
  }

  has(id: string): boolean {
    return typeof id === 'string' && this.entries.has(id.trim());
  }

  get(id: string): YuzuhaClusterEntry<TMeta> | undefined {
    if (typeof id !== 'string') return undefined;
    const entry = this.entries.get(id.trim());
    return entry ? this.toPublicEntry(entry) : undefined;
  }

  values(): YuzuhaClusterEntry<TMeta>[] {
    return [...this.entries.values()].map(entry => this.toPublicEntry(entry));
  }

  *runtimeValues(): IterableIterator<YuzuhaClusterEntry<TMeta>> {
    for (const entry of this.entries.values()) {
      yield this.toPublicEntry(entry);
    }
  }

  async add(input: AddYuzuhaRuntimeOptions<TMeta>): Promise<YuzuhaClusterEntry<TMeta>> {
    if (this.closed) {
      throw new YuzuhaError('CLUSTER_CLOSED', 'O cluster está encerrado.');
    }
    if (!isPlainObject(input)) {
      throw new ConfigError('CLUSTER_OPTIONS', 'As opções do runtime devem ser um objeto.');
    }
    const id = validateRuntimeId(input.id);
    const token = validateRuntimeToken(input.token);

    if (this.entries.has(id) || this.pendingAdds.has(id) || this.cluster.has(id)) {
      throw new ConfigError('CLUSTER_OPTIONS', `O runtime "${id}" já está registrado no cluster.`);
    }
    if (input.createBot !== undefined && typeof input.createBot !== 'function') {
      throw new ConfigError('CLUSTER_OPTIONS', 'createBot do runtime deve ser uma função.');
    }
    if (input.createBot !== undefined && input.botOptions !== undefined) {
      throw new ConfigError('CLUSTER_OPTIONS', 'Informe apenas um entre createBot e botOptions no runtime.');
    }
    validateBotOptionsInput(input.botOptions, 'runtime.botOptions');
    if (input.setup !== undefined && typeof input.setup !== 'function') {
      throw new ConfigError('CLUSTER_OPTIONS', 'setup do runtime deve ser uma função.');
    }

    const sourceCount = [
      input.discovery !== undefined,
      input.client !== undefined,
      input.clientOptions !== undefined,
    ].filter(Boolean).length;
    if (sourceCount > 1) {
      throw new ConfigError('CLUSTER_OPTIONS', 'Informe apenas um entre discovery, clientOptions ou client.');
    }

    // Armazena apenas metadados não sensíveis para reconstrução futura em restart() — nunca o token.
    const recipe: RuntimeRecipe<TMeta> = Object.freeze({
      prebuiltClient: input.client !== undefined,
      ...(input.discovery !== undefined ? { discovery: input.discovery } : {}),
      ...(input.clientOptions !== undefined ? { clientOptions: input.clientOptions } : {}),
      ...(input.meta !== undefined ? { meta: input.meta } : {}),
      ...(input.createBot !== undefined ? { createBot: input.createBot } : {}),
      ...(input.botOptions !== undefined ? { botOptions: input.botOptions } : {}),
      ...(input.setup !== undefined ? { setup: input.setup } : {}),
    });

    const abort = new AbortController();
    const onExternalAbort = () => abort.abort();
    input.signal?.addEventListener('abort', onExternalAbort, { once: true });
    if (input.signal?.aborted) abort.abort();

    const task = (async (): Promise<YuzuhaClusterEntry<TMeta>> => {
      const staged = { recipe, createdBot: undefined as Yuzuha | undefined };
      this.staging.set(id, staged);
      try {
        const runtime = await this.cluster.add({
          id,
          token,
          ...(input.discovery !== undefined ? { discovery: input.discovery } : {}),
          ...(input.clientOptions !== undefined ? { clientOptions: input.clientOptions } : {}),
          ...(input.client !== undefined ? { client: input.client } : {}),
          signal: abort.signal,
        });
        const entry = this.entries.get(id);
        if (!entry) {
          throw new YuzuhaError('CLUSTER_CLOSED', `O runtime "${id}" foi removido durante a inicialização.`);
        }
        entry.runtime = runtime;
        return this.toPublicEntry(entry);
      } catch (error) {
        const existing = this.entries.get(id);
        const botToDestroy = existing?.bot ?? staged.createdBot;
        if (existing && (!staged.createdBot || existing.bot === staged.createdBot)) {
          this.entries.delete(id);
          this.recipes.delete(id);
        }
        if (botToDestroy) {
          await botToDestroy.destroy().catch(() => {});
        }
        throw error;
      } finally {
        this.staging.delete(id);
      }
    })();

    this.pendingAdds.set(id, { abort, task });
    try {
      return await task;
    } finally {
      if (this.pendingAdds.get(id)?.task === task) {
        this.pendingAdds.delete(id);
      }
      input.signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  async addAll(
    inputs: readonly AddYuzuhaRuntimeOptions<TMeta>[],
  ): Promise<PromiseSettledResult<YuzuhaClusterEntry<TMeta>>[]> {
    if (this.closed) {
      throw new YuzuhaError('CLUSTER_CLOSED', 'O cluster está encerrado.');
    }
    if (!Array.isArray(inputs)) {
      throw new ConfigError('CLUSTER_OPTIONS', 'addAll exige uma lista de entradas de runtime.');
    }
    return Promise.allSettled(inputs.map(input => this.add(input)));
  }

  async restart(id: string, opts: RestartYuzuhaRuntimeOptions): Promise<YuzuhaClusterEntry<TMeta>> {
    if (this.closed) {
      throw new YuzuhaError('CLUSTER_CLOSED', 'O cluster está encerrado.');
    }
    const key = validateRuntimeId(id);
    if (!isPlainObject(opts)) {
      throw new ConfigError('CLUSTER_OPTIONS', 'As opções de restart devem ser um objeto.');
    }
    const token = validateRuntimeToken(opts.token);
    if (opts.timeoutMs !== undefined) {
      resolveDestroyTimeout({ timeoutMs: opts.timeoutMs });
    }

    const existing = this.entries.get(key);
    const recipe = this.recipes.get(key);
    if (!existing || !recipe) {
      throw new YuzuhaError('NOT_FOUND', `Runtime "${key}" não encontrado no cluster.`);
    }
    if (recipe.prebuiltClient) {
      throw new ConfigError(
        'CLUSTER_OPTIONS',
        `O runtime "${key}" foi adicionado com um Client pré-construído e não pode ser reiniciado.`,
      );
    }

    await this.remove(key, opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : undefined);
    if (this.closed) {
      throw new YuzuhaError('CLUSTER_CLOSED', 'O cluster foi encerrado durante o reinício.');
    }
    return this.add({
      id: key,
      token,
      ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
      ...(recipe.discovery !== undefined ? { discovery: recipe.discovery } : {}),
      ...(recipe.clientOptions !== undefined ? { clientOptions: recipe.clientOptions } : {}),
      ...(recipe.meta !== undefined ? { meta: recipe.meta } : {}),
      ...(recipe.createBot !== undefined ? { createBot: recipe.createBot } : {}),
      ...(recipe.botOptions !== undefined ? { botOptions: recipe.botOptions } : {}),
      ...(recipe.setup !== undefined ? { setup: recipe.setup } : {}),
    });
  }

  async remove(id: string, options?: DestroyOptions): Promise<boolean> {
    const timeoutMs = resolveDestroyTimeout(options);
    const key = typeof id === 'string' ? id.trim() : '';
    if (!key) return false;

    const pending = this.pendingAdds.get(key);
    const existing = this.entries.get(key);
    if (!pending && !existing && !this.cluster.has(key)) return false;

    if (pending) {
      pending.abort.abort();
      await this.cluster.remove(key).catch(() => false);
      await pending.task.catch(() => {});
    }

    const current = this.entries.get(key);
    if (!current) {
      this.recipes.delete(key);
      const removedFromCluster = await this.cluster.remove(key);
      return Boolean(pending) || removedFromCluster;
    }

    current.destroyPromise ??= (async () => {
      let destroyFailure: unknown;
      try {
        await current.bot.destroy(timeoutMs !== undefined ? { timeoutMs } : undefined);
      } catch (error) {
        destroyFailure = error;
      } finally {
        try {
          await this.cluster.remove(key);
        } finally {
          this.entries.delete(key);
          this.recipes.delete(key);
          this.emit(YuzuhaClusterEvents.RuntimeRemoved, this.toPublicEntry(current));
        }
      }
      if (destroyFailure !== undefined) throw destroyFailure;
    })();

    await current.destroyPromise;
    return true;
  }

  /** Instala handlers de sinais do processo para encerrar o cluster de forma controlada e retorna um removedor idempotente. */
  handleSignals(options?: SignalHandlerOptions): () => void {
    if (this.closed) {
      throw new YuzuhaError('CLUSTER_CLOSED', 'O cluster está encerrado.');
    }
    if (options !== undefined && !isPlainObject(options as unknown)) {
      throw new ConfigError('SHUTDOWN_OPTIONS', 'Opções de tratamento de sinais inválidas.');
    }
    const timeoutMs = resolveDestroyTimeout(options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : undefined);
    const rawSignals = options?.signals === undefined ? (['SIGINT', 'SIGTERM'] as const) : options.signals;
    if (!Array.isArray(rawSignals) || rawSignals.length === 0 || rawSignals.some(sig => typeof sig !== 'string' || !sig)) {
      throw new ConfigError('SHUTDOWN_OPTIONS', 'signals deve ser uma lista não vazia de nomes de sinais.');
    }
    const uniqueSignals = [...new Set(rawSignals)];
    const rawTarget = options?.target ?? process;
    if (!rawTarget || typeof (rawTarget as { on?: unknown }).on !== 'function' || typeof (rawTarget as { off?: unknown }).off !== 'function') {
      throw new ConfigError('SHUTDOWN_OPTIONS', 'target deve implementar on e off.');
    }
    if (options?.onExit !== undefined && typeof options.onExit !== 'function') {
      throw new ConfigError('SHUTDOWN_OPTIONS', 'onExit deve ser uma função.');
    }
    const target = rawTarget as {
      on(event: string, listener: (...args: unknown[]) => void): unknown;
      off(event: string, listener: (...args: unknown[]) => void): unknown;
    };
    const onExit = options?.onExit;
    let disposed = false;
    const onSignal = (): void => {
      dispose();
      void this.destroy(timeoutMs !== undefined ? { timeoutMs } : undefined).then(
        () => { onExit?.(0); },
        () => { onExit?.(1); },
      );
    };
    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      this.signalDisposers.delete(dispose);
      for (const sig of uniqueSignals) target.off(sig, onSignal);
    };
    for (const sig of uniqueSignals) target.on(sig, onSignal);
    this.signalDisposers.add(dispose);
    return dispose;
  }

  async destroy(options?: DestroyOptions): Promise<void> {
    const timeoutMs = resolveDestroyTimeout(options);
    for (const dispose of [...this.signalDisposers]) dispose();
    if (this.closeTask) return this.closeTask;
    this.closed = true;

    for (const pending of this.pendingAdds.values()) {
      pending.abort.abort();
    }

    this.closeTask = (async () => {
      const ids = new Set<string>([
        ...this.entries.keys(),
        ...this.pendingAdds.keys(),
        ...Array.from(this.cluster.runtimeValues(), rt => rt.id),
      ]);
      const results = await Promise.allSettled(
        [...ids].map(id => this.remove(id, timeoutMs !== undefined ? { timeoutMs } : undefined)),
      );
      try {
        await this.cluster.destroy();
      } finally {
        this.entries.clear();
        this.recipes.clear();
        this.staging.clear();
        this.removeAllListeners();
      }
      const failures = results.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
      if (failures.length) {
        throw new AggregateError(failures.map(item => item.reason), 'Falha ao encerrar um ou mais bots do cluster.');
      }
    })();

    return this.closeTask;
  }

  private async configureRuntime(runtime: ClientRuntime): Promise<void> {
    const staged = this.staging.get(runtime.id);
    const recipe = staged?.recipe;
    const meta = recipe?.meta;
    const factory = recipe?.createBot ?? this.clusterOptions.createBot;

    let bot: Yuzuha;
    if (factory) {
      const candidate = await factory(runtime, meta);
      if (!(candidate instanceof Yuzuha)) {
        throw new ConfigError('CLUSTER_OPTIONS', 'createBot deve retornar uma instância de Yuzuha.');
      }
      if (candidate.client !== runtime.client) {
        await candidate.destroy().catch(() => {});
        throw new ConfigError('CLUSTER_OPTIONS', 'createBot deve construir Yuzuha usando runtime.client.');
      }
      bot = candidate;
    } else {
      const sharedOptions = await resolveBotOptionsInput(this.clusterOptions.botOptions, runtime, meta, 'botOptions');
      const runtimeOptions = await resolveBotOptionsInput(recipe?.botOptions, runtime, meta, 'runtime.botOptions');
      const merged: ClusterBotOptions = {
        ...sharedOptions,
        ...runtimeOptions,
      };
      bot = new Yuzuha({
        ...(merged.store === undefined && merged.name === undefined && /^[a-zA-Z0-9_-]+$/.test(runtime.id)
          ? { name: runtime.id }
          : {}),
        ...merged,
        client: runtime.client,
      });
    }

    if (staged) staged.createdBot = bot;

    try {
      await this.clusterOptions.setup?.(bot, runtime, meta);
      await recipe?.setup?.(bot, runtime, meta);
      bot.bindClusterRuntime(id => {
        const runtimes = [];
        if (id !== undefined) {
          const runtime = this.cluster.get(id);
          if (runtime) runtimes.push({ id: runtime.id, status: runtime.status });
        } else {
          for (const runtime of this.cluster.runtimeValues()) {
            runtimes.push({ id: runtime.id, status: runtime.status });
            if (runtimes.length >= 100) break;
          }
        }
        return { size: this.cluster.size, runtimes };
      });
    } catch (error) {
      await bot.destroy().catch(() => {});
      if (staged) staged.createdBot = undefined;
      throw error;
    }

    const entry: InternalClusterEntry<TMeta> = {
      id: runtime.id,
      bot,
      runtime,
      ...(meta !== undefined ? { meta } : {}),
    };
    this.entries.set(runtime.id, entry);
    if (recipe) this.recipes.set(runtime.id, recipe);
    this.emit(YuzuhaClusterEvents.RuntimeAdded, this.toPublicEntry(entry));
  }

  private toPublicEntry(entry: InternalClusterEntry<TMeta>): YuzuhaClusterEntry<TMeta> {
    const cluster = this.cluster;
    return {
      id: entry.id,
      bot: entry.bot,
      client: entry.runtime.client,
      get runtime(): ClientRuntime {
        return cluster.get(entry.id) ?? entry.runtime;
      },
      get status(): ClientRuntimeStatus {
        return (cluster.get(entry.id) ?? entry.runtime).status;
      },
      get lastError(): Error | undefined {
        return (cluster.get(entry.id) ?? entry.runtime).lastError;
      },
      ...(entry.meta !== undefined ? { meta: entry.meta } : {}),
    };
  }
}

export type {
  AddClientRuntimeOptions,
  ClientRuntime,
  ClientRuntimeStatus,
  RestartClientRuntimeOptions,
};
