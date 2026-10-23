import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { LavalinkStats, MusicEvent, MusicNodeEvent, MusicPlayerUpdate, MusicTrack, RemoteMusicPlayer, TrackLoadResult } from '../../domain/music.js';
import type { MusicAudioStream, MusicBackend } from '../../ports/music.js';
import { openAudioStream } from './audio-stream.js';
import { abortable, cancellationError } from '../../services/cancellation.js';
import { YuzuhaError } from '../../shared/errors.js';
import { decodedTrack, decodedTracks, loadResult, musicEvent, nodeStats, record, remotePlayer, remotePlayers } from './protocol.js';
import { VERSION } from '../../shared/package.js';

export interface LavalinkInfo {
  version: { semver: string; major: number; minor: number; patch: number; preRelease: string | null; build: string | null };
  buildTime: number;
  git: { branch: string; commit: string; commitTime: number };
  jvm: string;
  lavaplayer: string;
  sourceManagers: string[];
  filters: string[];
  plugins: { name: string; version: string }[];
}
export interface LavalinkSocket {
  on(event: 'message', listener: (data: Buffer | ArrayBuffer | Buffer[]) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'close', listener: (code: number) => void): unknown;
  terminate(): void;
}
export interface LavalinkOptions {
  url: string;
  password: string;
  userID: string;
  clientName?: string;
  timeoutMs?: number;
  resumeTimeoutSeconds?: number;
  sessionID?: string;
  reconnect?: false | { attempts?: number; delayMs?: number; maxDelayMs?: number };
  maxResponseBytes?: number;
  maxPendingRequests?: number;
  maxPendingLoads?: number;
  maxAudioStreams?: number;
  audioIdleTimeoutMs?: number;
  cache?: false | { ttlMs?: number; capacity?: number; maxBytes?: number };
  fetch?: typeof globalThis.fetch;
  socketFactory?: (url: string, headers: Record<string, string>) => LavalinkSocket;
}
export interface LavalinkNodeEvents {
  ready: [session: { sessionID: string; resumed: boolean }];
  disconnect: [code: number];
  nodeError: [error: unknown];
  event: [event: MusicEvent];
  stats: [stats: LavalinkStats];
  lifecycle: [event: MusicNodeEvent];
}
export interface LavalinkDiagnostics {
  requests: number;
  pendingRequests: number;
  pendingLoads: number;
  coalescedLoads: number;
  cacheHits: number;
  cacheEntries: number;
  cacheBytes: number;
  activeAudioStreams: number;
}
type ConnectionState = 'idle' | 'connecting' | 'ready' | 'disconnected' | 'closed';
type CachedLoad = { value: TrackLoadResult; expires: number; bytes: number };
type Loading = { task: Promise<TrackLoadResult>; controller: AbortController; waiters: number };
function integer(value: number, min: number, max: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new YuzuhaError('LAVALINK_OPTIONS', `${name} deve ser inteiro entre ${min} e ${max}.`);
  return value;
}
function id(value: string): string {
  if (typeof value !== 'string' || !value || value.length > 128) throw new YuzuhaError('LAVALINK_ID', 'ID deve conter de 1 a 128 caracteres.');
  return encodeURIComponent(value);
}

export class LavalinkNode extends EventEmitter<LavalinkNodeEvents> implements MusicBackend {
  private readonly base: URL;
  private readonly headers: Record<string, string>;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeout: number;
  private readonly resumeTimeout: number;
  private readonly maxBytes: number;
  private readonly maxPending: number;
  private readonly maxPendingLoads: number;
  private readonly maxAudioStreams: number;
  private readonly audioIdleTimeout: number;
  private readonly audioStreams = new Map<string, { controller: AbortController; close?: () => Promise<void> }>();
  private readonly audioOpening = new Set<Promise<unknown>>();
  private readonly reconnect: { attempts: number; delayMs: number; maxDelayMs: number } | false;
  private readonly cacheOptions: { ttlMs: number; capacity: number; maxBytes: number } | false;
  private readonly cache = new Map<string, CachedLoad>();
  private readonly loading = new Map<string, Loading>();
  private loadWaiters = 0;
  private requests = 0;
  private coalescedLoads = 0;
  private cacheHits = 0;
  private cacheBytes = 0;
  private readonly shutdown = new AbortController();
  private readonly pending = new Set<Promise<unknown>>();
  private readonly socketFactory: NonNullable<LavalinkOptions['socketFactory']>;
  private socket?: LavalinkSocket;
  private connectTask?: Promise<void>;
  private rejectConnect?: (error: unknown) => void;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retries = 0;
  private connectionState: ConnectionState = 'idle';
  private session?: string;
  private closeTask?: Promise<void>;
  private nodeStats?: LavalinkStats;
  private statsReceivedAt = 0;

  constructor(options: LavalinkOptions) {
    super();
    try { this.base = new URL(options.url); }
    catch { throw new YuzuhaError('LAVALINK_OPTIONS', 'Informe uma URL HTTP(S) válida para o Lavalink.'); }
    if (!['http:', 'https:'].includes(this.base.protocol) || this.base.username || this.base.password || this.base.search || this.base.hash) {
      throw new YuzuhaError('LAVALINK_OPTIONS', 'A URL deve usar HTTP(S), sem credenciais, query ou fragmento.');
    }
    this.base.pathname = this.base.pathname.replace(/\/$/, '') + '/';
    if (typeof options.password !== 'string' || !options.password || /[\r\n]/.test(options.password)) throw new YuzuhaError('LAVALINK_OPTIONS', 'Senha do Lavalink inválida.');
    id(options.userID);
    const clientName = options.clientName ?? `yuzuha/${VERSION}`;
    if (!/^[^\s/]+\/[^\s/]+$/.test(clientName) || /[\r\n]/.test(options.userID)) throw new YuzuhaError('LAVALINK_OPTIONS', 'Client-Name deve usar nome/versão e User-Id deve ser válido.');
    this.headers = { Authorization: options.password, 'User-Id': options.userID, 'Client-Name': clientName };
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.timeout = integer(options.timeoutMs ?? 10_000, 1, 300_000, 'timeoutMs');
    this.resumeTimeout = integer(options.resumeTimeoutSeconds ?? 60, 0, 3600, 'resumeTimeoutSeconds');
    this.maxBytes = integer(options.maxResponseBytes ?? 2_000_000, 1, 100_000_000, 'maxResponseBytes');
    this.maxPending = integer(options.maxPendingRequests ?? 128, 1, 10_000, 'maxPendingRequests');
    this.maxPendingLoads = integer(options.maxPendingLoads ?? 1024, 1, 100_000, 'maxPendingLoads');
    this.maxAudioStreams = integer(options.maxAudioStreams ?? 128, 1, 10_000, 'maxAudioStreams');
    this.audioIdleTimeout = integer(options.audioIdleTimeoutMs ?? 15_000, 1, 300_000, 'audioIdleTimeoutMs');
    this.reconnect = options.reconnect === false ? false : {
      attempts: integer(options.reconnect?.attempts ?? 5, 0, 100, 'reconnect.attempts'),
      delayMs: integer(options.reconnect?.delayMs ?? 1000, 1, 300_000, 'reconnect.delayMs'),
      maxDelayMs: integer(options.reconnect?.maxDelayMs ?? 30_000, 1, 300_000, 'reconnect.maxDelayMs'),
    };
    this.cacheOptions = options.cache === false ? false : {
      ttlMs: integer(options.cache?.ttlMs ?? 15_000, 1, 3_600_000, 'cache.ttlMs'),
      capacity: integer(options.cache?.capacity ?? 64, 1, 10_000, 'cache.capacity'),
      maxBytes: integer(options.cache?.maxBytes ?? 4_000_000, 1, 100_000_000, 'cache.maxBytes'),
    };
    if (options.sessionID !== undefined) id(options.sessionID);
    this.session = options.sessionID;
    this.socketFactory = options.socketFactory ?? ((url, headers) => new WebSocket(url, {
      headers, maxPayload: this.maxBytes, handshakeTimeout: this.timeout,
    }));
  }

  get state(): ConnectionState { return this.connectionState; }
  get available(): boolean { return this.connectionState === 'ready'; }
  get sessionID(): string | undefined { return this.session; }
  get stats(): LavalinkStats | undefined { return this.nodeStats && structuredClone(this.nodeStats); }
  get penalty(): number {
    const stats = this.nodeStats;
    if (!stats || performance.now() - this.statsReceivedAt > 90_000) return 0;
    const frames = this.audioStreams.size ? undefined : stats.frameStats;
    return stats.playingPlayers + stats.cpu.lavalinkLoad * 100
      + (frames ? (Math.max(0, frames.deficit) + frames.nulled) / 3000 * 100 : 0);
  }
  get diagnostics(): LavalinkDiagnostics {
    return { requests: this.requests, pendingRequests: this.pending.size, pendingLoads: this.loadWaiters,
      coalescedLoads: this.coalescedLoads, cacheHits: this.cacheHits, cacheEntries: this.cache.size, cacheBytes: this.cacheBytes,
      activeAudioStreams: this.audioStreams.size };
  }

  connect(): Promise<void> {
    if (this.connectionState === 'closed') return Promise.reject(new YuzuhaError('LAVALINK_CLOSED', 'O node Lavalink está fechado.'));
    if (this.connectTask) return this.connectTask;
    if (this.connectionState === 'ready') return Promise.resolve();
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = undefined; }
    this.connectionState = 'connecting';
    const task = new Promise<void>((resolve, reject) => {
      let settled = false, initializing = false;
      const buffered: MusicEvent[] = []; let bufferedBytes = 0;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        this.rejectConnect = undefined;
        if (this.connectionState !== 'closed') this.connectionState = 'disconnected';
        this.socket?.terminate(); reject(error);
      };
      const timer = setTimeout(() => fail(new YuzuhaError('LAVALINK_TIMEOUT', 'O Lavalink não confirmou a sessão no prazo.')), this.timeout);
      this.rejectConnect = fail;
      try {
        const url = new URL('v4/websocket', this.base); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const headers = { ...this.headers, ...(this.session ? { 'Session-Id': this.session } : {}) };
        const socket = this.socketFactory(url.href, headers); this.socket = socket;
        socket.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
          if (this.socket !== socket || this.connectionState === 'closed') return;
          try {
            const size = Array.isArray(data) ? data.reduce((sum, part) => sum + part.byteLength, 0) : data.byteLength;
            if (size > this.maxBytes) throw new YuzuhaError('LAVALINK_RESPONSE_LIMIT', 'Evento do Lavalink excede o limite.');
            const payload: unknown = JSON.parse(Array.isArray(data) ? Buffer.concat(data).toString() : Buffer.from(data as ArrayBuffer).toString());
            if (!record(payload) || typeof payload.op !== 'string') throw new YuzuhaError('LAVALINK_PROTOCOL', 'Evento inválido do Lavalink.');
            if (payload.op === 'ready') {
              if (settled || initializing) return;
              if (typeof payload.sessionId !== 'string' || !payload.sessionId || typeof payload.resumed !== 'boolean') throw new YuzuhaError('LAVALINK_PROTOCOL', 'Sessão inválida do Lavalink.');
              initializing = true; this.session = payload.sessionId;
              const ready = { sessionID: payload.sessionId, resumed: payload.resumed };
              void this.request('PATCH', `v4/sessions/${id(payload.sessionId)}`, { resuming: this.resumeTimeout > 0, timeout: this.resumeTimeout }).then(() => {
                if (settled || this.socket !== socket || this.connectionState === 'closed') return;
                settled = true; clearTimeout(timer); this.rejectConnect = undefined;
                this.connectionState = 'ready'; this.retries = 0; resolve();
                this.emit('lifecycle', { type: 'ready', ...ready });
                if (this.connectionState !== 'ready') return;
                for (const event of buffered) this.emit('event', event);
                buffered.length = 0; bufferedBytes = 0; this.emit('ready', ready);
              }, fail);
            } else if (payload.op === 'stats') {
              this.nodeStats = nodeStats(payload);
              this.statsReceivedAt = performance.now();
              this.emit('stats', structuredClone(this.nodeStats));
            } else if (payload.op === 'event' || payload.op === 'playerUpdate') {
              const event = musicEvent(payload);
              if (event) {
                if (this.connectionState === 'ready') this.emit('event', event);
                else {
                  if (buffered.length >= this.maxPendingLoads || bufferedBytes + size > this.maxBytes) throw new YuzuhaError('LAVALINK_RESPONSE_LIMIT', 'Eventos da retomada excedem o limite de buffer.');
                  buffered.push(event); bufferedBytes += size;
                }
              }
            }
          } catch (error) {
            const failure = error instanceof YuzuhaError ? error : new YuzuhaError('LAVALINK_PROTOCOL', 'Não foi possível ler o evento do Lavalink.');
            if (!settled) fail(failure); else this.emit('nodeError', failure);
          }
        });
        socket.on('error', () => {
          const error = new YuzuhaError('LAVALINK_CONNECTION', 'Falha na conexão WebSocket com o Lavalink.');
          if (!settled) fail(error); else if (this.connectionState !== 'closed') this.emit('nodeError', error);
        });
        socket.on('close', (code: number) => {
          if (this.socket !== socket || this.connectionState === 'closed') return;
          const wasReady = this.connectionState === 'ready';
          this.socket = undefined; this.connectionState = 'disconnected';
          if (!settled) fail(new YuzuhaError('LAVALINK_CONNECTION', 'O Lavalink fechou a conexão antes de confirmar a sessão.'));
          this.emit('disconnect', code);
          this.emit('lifecycle', { type: 'disconnect', code });
          if (wasReady) this.scheduleReconnect();
        });
      } catch { fail(new YuzuhaError('LAVALINK_CONNECTION', 'Não foi possível abrir o WebSocket do Lavalink.')); }
    });
    this.connectTask = task;
    const clear = () => { if (this.connectTask === task) this.connectTask = undefined; };
    void task.then(clear, clear);
    return task;
  }

  private scheduleReconnect(): void {
    if (!this.reconnect || this.retryTimer || this.connectionState === 'closed' || this.retries >= this.reconnect.attempts) return;
    const delay = Math.min(this.reconnect.maxDelayMs, this.reconnect.delayMs * 2 ** this.retries++);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.connect().catch(error => { this.emit('nodeError', error); this.scheduleReconnect(); });
    }, delay);
    this.retryTimer.unref();
  }

  subscribe(listener: (event: MusicEvent) => void): () => void {
    this.on('event', listener);
    return () => { this.off('event', listener); };
  }
  subscribeLifecycle(listener: (event: MusicNodeEvent) => void): () => void {
    this.on('lifecycle', listener); return () => { this.off('lifecycle', listener); };
  }

  private playerPath(guildID?: string): string {
    if (this.connectionState !== 'ready' || !this.session) throw new YuzuhaError('LAVALINK_NOT_READY', 'Conecte o node Lavalink antes de controlar players.');
    return `v4/sessions/${id(this.session)}/players${guildID === undefined ? '' : `/${id(guildID)}`}`;
  }

  async loadTracks(identifier: string, signal?: AbortSignal): Promise<TrackLoadResult> {
    if (this.connectionState === 'closed') throw new YuzuhaError('LAVALINK_CLOSED', 'O node Lavalink está fechado.');
    if (signal?.aborted) throw cancellationError();
    if (typeof identifier !== 'string' || !identifier.trim() || identifier.length > 4096) throw new YuzuhaError('LAVALINK_IDENTIFIER', 'Busca deve conter de 1 a 4096 caracteres.');
    const cached = this.cache.get(identifier);
    if (cached) {
      this.cache.delete(identifier);
      if (cached.expires > performance.now()) { this.cache.set(identifier, cached); this.cacheHits++; return structuredClone(cached.value); }
      this.cacheBytes -= cached.bytes;
    }
    if (this.loadWaiters >= this.maxPendingLoads) throw new YuzuhaError('LAVALINK_CAPACITY', 'Limite de buscas pendentes ao Lavalink excedido.');
    let flight = this.loading.get(identifier);
    if (!flight) {
      const controller = new AbortController();
      const task = this.request<unknown>('GET', `v4/loadtracks?identifier=${encodeURIComponent(identifier)}`, undefined, controller.signal).then(result => {
        const value = loadResult(result);
        if (this.cacheOptions && !this.shutdown.signal.aborted && !controller.signal.aborted && value.loadType !== 'error') {
          const bytes = Buffer.byteLength(JSON.stringify(value));
          if (bytes <= this.cacheOptions.maxBytes) {
            const previous = this.cache.get(identifier);
            if (previous) { this.cache.delete(identifier); this.cacheBytes -= previous.bytes; }
            while (this.cache.size && (this.cache.size >= this.cacheOptions.capacity || this.cacheBytes + bytes > this.cacheOptions.maxBytes)) {
              const key = this.cache.keys().next().value!;
              this.cacheBytes -= this.cache.get(key)!.bytes; this.cache.delete(key);
            }
            this.cache.set(identifier, { value, expires: performance.now() + this.cacheOptions.ttlMs, bytes }); this.cacheBytes += bytes;
          }
        }
        return value;
      });
      flight = { task, controller, waiters: 0 }; this.loading.set(identifier, flight);
      const active = flight;
      const clear = () => { if (this.loading.get(identifier) === active) this.loading.delete(identifier); };
      void task.then(clear, clear);
    } else this.coalescedLoads++;
    flight.waiters++; this.loadWaiters++;
    try { return structuredClone(await (signal ? abortable(flight.task, signal) : flight.task)); }
    finally {
      flight.waiters--; this.loadWaiters--;
      if (!flight.waiters && this.loading.get(identifier) === flight) { this.loading.delete(identifier); flight.controller.abort(); }
    }
  }

  async decodeTrack(encoded: string, signal?: AbortSignal): Promise<MusicTrack> {
    this.encoded(encoded);
    return decodedTrack(await this.request('GET', `v4/decodetrack?encodedTrack=${encodeURIComponent(encoded)}`, undefined, signal));
  }
  async decodeTracks(encoded: readonly string[], signal?: AbortSignal): Promise<MusicTrack[]> {
    if (!Array.isArray(encoded) || encoded.length < 1 || encoded.length > 1000) throw new YuzuhaError('LAVALINK_TRACKS', 'Informe de 1 a 1000 faixas codificadas.');
    const snapshot = Array.from(encoded, value => { this.encoded(value); return value; });
    if (Buffer.byteLength(JSON.stringify(snapshot)) > this.maxBytes) throw new YuzuhaError('LAVALINK_TRACKS', 'Lote de faixas excede o limite de bytes.');
    const tracks = decodedTracks(await this.request('POST', 'v4/decodetracks', snapshot, signal));
    if (tracks.length !== snapshot.length) throw new YuzuhaError('LAVALINK_PROTOCOL', 'O Lavalink retornou um número diferente de faixas.');
    return tracks;
  }
  private encoded(value: string): void {
    if (typeof value !== 'string' || !value || value.length > 65_536) throw new YuzuhaError('LAVALINK_TRACKS', 'Faixa codificada deve conter de 1 a 65536 caracteres.');
  }

  getInfo(signal?: AbortSignal): Promise<LavalinkInfo> { return this.request('GET', 'v4/info', undefined, signal); }
  getStats(signal?: AbortSignal): Promise<LavalinkStats> { return this.request('GET', 'v4/stats', undefined, signal).then(nodeStats); }
  getPlayers(signal?: AbortSignal): Promise<RemoteMusicPlayer[]> { return this.request('GET', this.playerPath(), undefined, signal).then(remotePlayers); }
  getPlayer(guildID: string, signal?: AbortSignal): Promise<RemoteMusicPlayer> {
    return this.request('GET', this.playerPath(guildID), undefined, signal).then(value => remotePlayer(value, guildID));
  }
  updatePlayer(guildID: string, update: MusicPlayerUpdate, options: { noReplace?: boolean; signal?: AbortSignal } = {}): Promise<RemoteMusicPlayer> {
    if (!update || typeof update !== 'object' || Array.isArray(update)) throw new YuzuhaError('LAVALINK_UPDATE', 'Atualização de player inválida.');
    if (update.volume !== undefined) integer(update.volume, 0, 1000, 'volume');
    if (update.position !== undefined) integer(update.position, 0, Number.MAX_SAFE_INTEGER, 'position');
    return this.request('PATCH', `${this.playerPath(guildID)}?noReplace=${options.noReplace ?? false}`, update, options.signal).then(value => remotePlayer(value, guildID));
  }
  async destroyPlayer(guildID: string, signal?: AbortSignal): Promise<void> { await this.request('DELETE', this.playerPath(guildID), undefined, signal); }

  async openAudioStream(guildID: string, signal?: AbortSignal): Promise<MusicAudioStream> {
    const path = this.playerPath(guildID).replace('v4/sessions/', 'v4/yuzuha/sessions/') + '/audio';
    if (signal?.aborted) throw cancellationError();
    if (this.audioStreams.has(guildID)) throw new YuzuhaError('LAVALINK_AUDIO_BUSY', 'Já há uma saída de áudio neste servidor.');
    if (this.audioStreams.size >= this.maxAudioStreams) throw new YuzuhaError('LAVALINK_AUDIO_LIMIT', 'Limite de saídas de áudio excedido.');
    const entry: { controller: AbortController; close?: () => Promise<void> } = { controller: new AbortController() };
    this.audioStreams.set(guildID, entry);
    const combined = AbortSignal.any([this.shutdown.signal, entry.controller.signal, ...(signal ? [signal] : [])]);
    const release = () => { if (this.audioStreams.get(guildID) === entry) this.audioStreams.delete(guildID); };
    const task = openAudioStream({ url: new URL(path, this.base), password: this.headers.Authorization!, fetch: this.fetcher,
      timeout: this.timeout, idleTimeout: this.audioIdleTimeout, controller: entry.controller, signal: combined, release });
    this.requests++; this.audioOpening.add(task);
    try {
      const stream = await task; entry.close = stream.close;
      if (combined.aborted) { await stream.close(); throw cancellationError(); }
      return stream;
    } finally { this.audioOpening.delete(task); }
  }

  private request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    if (this.shutdown.signal.aborted) return Promise.reject(new YuzuhaError('LAVALINK_CLOSED', 'O node Lavalink está fechado.'));
    if (signal?.aborted) return Promise.reject(cancellationError());
    if (this.pending.size >= this.maxPending) return Promise.reject(new YuzuhaError('LAVALINK_CAPACITY', 'Limite de requisições simultâneas ao Lavalink excedido.'));
    this.requests++;
    const timeout = AbortSignal.timeout(this.timeout);
    const combined = AbortSignal.any([this.shutdown.signal, timeout, ...(signal ? [signal] : [])]);
    const task = (async () => {
      let response: Response | undefined;
      try {
        const fetching = this.fetcher(new URL(path, this.base), { method, redirect: 'error', signal: combined,
          headers: { Authorization: this.headers.Authorization!, 'Content-Type': 'application/json' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        void fetching.then(late => { if (combined.aborted && !late.body?.locked) void late.body?.cancel().catch(() => {}); }, () => {});
        response = await abortable(fetching, combined);
        if (combined.aborted) throw cancellationError();
        if (!response.ok) throw new YuzuhaError('LAVALINK_HTTP', `O Lavalink respondeu com HTTP ${response.status}.`);
        if (response.status === 204) { await response.body?.cancel(); return undefined as T; }
        if (Number(response.headers.get('content-length')) > this.maxBytes) throw new YuzuhaError('LAVALINK_RESPONSE_LIMIT', 'Resposta do Lavalink excede o limite.');
        const reader = response.body?.getReader();
        if (!reader) throw new YuzuhaError('LAVALINK_PROTOCOL', 'O Lavalink retornou uma resposta vazia.');
        const chunks: Uint8Array[] = []; let size = 0;
        try {
          while (true) {
            if (combined.aborted) throw cancellationError();
            const part = await abortable(reader.read(), combined); if (part.done) break;
            size += part.value.byteLength;
            if (size > this.maxBytes) throw new YuzuhaError('LAVALINK_RESPONSE_LIMIT', 'Resposta do Lavalink excede o limite.');
            chunks.push(part.value);
          }
        } catch (error) { await reader.cancel().catch(() => {}); throw error; }
        finally { reader.releaseLock(); }
        if (combined.aborted) throw cancellationError();
        try { return JSON.parse(Buffer.concat(chunks, size).toString('utf8')) as T; }
        catch { throw new YuzuhaError('LAVALINK_PROTOCOL', 'O Lavalink retornou JSON inválido.'); }
      } catch (error) {
        if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {});
        if (signal?.aborted || this.shutdown.signal.aborted) throw cancellationError();
        if (timeout.aborted) throw new YuzuhaError('LAVALINK_TIMEOUT', 'A requisição ao Lavalink excedeu o prazo.');
        if (error instanceof YuzuhaError) throw error;
        throw new YuzuhaError('LAVALINK_CONNECTION', 'Não foi possível completar a requisição ao Lavalink.');
      }
    })();
    this.pending.add(task);
    const clear = () => { this.pending.delete(task); };
    void task.then(clear, clear);
    return task;
  }

  close(): Promise<void> {
    if (this.closeTask) return this.closeTask;
    this.connectionState = 'closed';
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.shutdown.abort(); this.rejectConnect?.(cancellationError()); this.socket?.terminate(); this.socket = undefined;
    const audio = [...this.audioStreams.values()].map(entry => { entry.controller.abort(); return entry.close?.(); });
    this.audioStreams.clear();
    this.cache.clear(); this.cacheBytes = 0; this.loading.clear();
    this.closeTask = Promise.allSettled([...this.pending, ...this.audioOpening, ...audio, ...(this.connectTask ? [this.connectTask] : [])]).then(() => { this.removeAllListeners(); });
    this.emit('lifecycle', { type: 'closed' });
    return this.closeTask;
  }
}
