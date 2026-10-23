import type { MusicEvent, MusicNodeEvent, MusicPlayerUpdate, MusicTrack, RemoteMusicPlayer, TrackLoadResult } from '../domain/music.js';
import type { MusicBackend } from '../ports/music.js';
import { cancellationError } from '../services/cancellation.js';

export function mockTrack(identifier = 'track', overrides: Partial<Omit<MusicTrack, 'info'>> & { info?: Partial<MusicTrack['info']> } = {}): MusicTrack {
  return structuredClone({ encoded: identifier, pluginInfo: {}, userData: {}, ...overrides, info: {
    identifier, title: identifier, author: 'Mock artist', length: 180_000, isStream: false,
    isSeekable: true, position: 0, uri: `https://example.com/${encodeURIComponent(identifier)}`, sourceName: 'mock', ...overrides.info,
  } });
}

export class MockMusicBackend implements MusicBackend {
  available = true;
  penalty = 0;
  readonly updates: { guildID: string; update: MusicPlayerUpdate }[] = [];
  readonly destroyed: string[] = [];
  readonly loads: string[] = [];
  readonly results = new Map<string, TrackLoadResult>();
  readonly players = new Map<string, RemoteMusicPlayer>();
  private readonly listeners = new Set<(event: MusicEvent) => void>();
  private readonly lifecycleListeners = new Set<(event: MusicNodeEvent) => void>();
  failNextUpdate?: Error;
  failDestroy?: Error;
  beforeUpdate?: (guildID: string, update: MusicPlayerUpdate, signal?: AbortSignal) => void | Promise<void>;
  get subscriptionCount(): number { return this.listeners.size; }
  get lifecycleSubscriptionCount(): number { return this.lifecycleListeners.size; }
  async loadTracks(identifier: string, signal?: AbortSignal): Promise<TrackLoadResult> {
    if (signal?.aborted) throw cancellationError();
    this.loads.push(identifier);
    return structuredClone(this.results.get(identifier) ?? { loadType: 'empty', data: null });
  }
  async updatePlayer(guildID: string, update: MusicPlayerUpdate, options: { noReplace?: boolean; signal?: AbortSignal } = {}): Promise<RemoteMusicPlayer> {
    if (options.signal?.aborted) throw cancellationError();
    await this.beforeUpdate?.(guildID, update, options.signal);
    if (options.signal?.aborted) throw cancellationError();
    if (this.failNextUpdate) { const error = this.failNextUpdate; this.failNextUpdate = undefined; throw error; }
    this.updates.push({ guildID, update: structuredClone(update) });
    const player = this.players.get(guildID) ?? { guildId: guildID, track: null, volume: 100, paused: false,
      state: { time: 0, position: 0, connected: true, ping: 0 },
      voice: { token: 'mock', endpoint: 'mock', sessionId: 'mock' }, filters: {} };
    if (update.track && (!options.noReplace || !player.track)) {
      player.track = 'encoded' in update.track && update.track.encoded === null ? null
        : mockTrack('encoded' in update.track ? update.track.encoded! : update.track.identifier, { userData: update.track.userData ?? {} });
      player.state.position = 0;
    }
    if (update.volume !== undefined) player.volume = update.volume;
    if (update.paused !== undefined) player.paused = update.paused;
    if (update.voice) player.voice = structuredClone(update.voice);
    if (update.filters) player.filters = structuredClone(update.filters);
    if (update.position !== undefined) player.state.position = update.position;
    this.players.set(guildID, player);
    return structuredClone(player);
  }
  async destroyPlayer(guildID: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw cancellationError();
    if (this.failDestroy) throw this.failDestroy;
    this.destroyed.push(guildID); this.players.delete(guildID);
  }
  subscribe(listener: (event: MusicEvent) => void): () => void {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  emit(event: MusicEvent): void { for (const listener of this.listeners) listener(structuredClone(event)); }
  subscribeLifecycle(listener: (event: MusicNodeEvent) => void): () => void {
    this.lifecycleListeners.add(listener); return () => { this.lifecycleListeners.delete(listener); };
  }
  emitLifecycle(event: MusicNodeEvent): void {
    this.available = event.type === 'ready';
    if (event.type === 'ready' && !event.resumed) this.players.clear();
    for (const listener of this.lifecycleListeners) listener(structuredClone(event));
  }
}
