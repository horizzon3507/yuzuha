import type { MusicVoiceState, TrackLoadResult } from '../domain/music.js';
import { MusicPlayer } from './music-player.js';
import type { MusicAudioOutput, MusicBackend } from '../ports/music.js';
import { YuzuhaError } from '../shared/errors.js';

export { MusicPlayer } from './music-player.js';
export type { MusicPlayerEvents } from './music-player.js';

export interface MusicVoiceAdapter {
  join(guildID: string, channelID: string, signal: AbortSignal): Promise<MusicVoiceState>;
  leave(guildID: string): Promise<void>;
}
export interface MusicManagerOptions {
  nodes: readonly MusicBackend[];
  voice?: MusicVoiceAdapter;
  audio?: MusicAudioOutput;
  maxPlayers?: number;
  queueLimit?: number;
  maxPendingControls?: number;
  recoveryConcurrency?: number;
  onError?: (error: unknown, player: MusicPlayer) => void;
}
export interface MusicPlayerOptions { queueLimit?: number; node?: MusicBackend; maxPendingControls?: number }
function positive(value: number, max: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new YuzuhaError('MUSIC_OPTIONS', `${name} deve ser inteiro entre 1 e ${max}.`);
  return value;
}

export class MusicManager {
  private readonly players = new Map<string, MusicPlayer>();
  private readonly nodes: readonly MusicBackend[];
  private readonly subscriptions: (() => void)[];
  private readonly counts = new Map<MusicBackend, number>();
  private readonly maxPlayers: number;
  private readonly queueLimit: number;
  private readonly maxPendingControls: number;
  private readonly recoveryConcurrency: number;
  private readonly recoveries = new Map<MusicBackend, Promise<void>>();
  private readonly recoveryVersions = new Map<MusicBackend, number>();
  private closing = false;
  private closeTask?: Promise<void>;

  constructor(private readonly options: MusicManagerOptions) {
    if (options.voice && options.audio) throw new YuzuhaError('MUSIC_OPTIONS', 'Configure apenas uma saída de áudio ou um adaptador de voz.');
    if (!Array.isArray(options.nodes) || !options.nodes.length || new Set(options.nodes).size !== options.nodes.length) throw new YuzuhaError('MUSIC_OPTIONS', 'Informe nodes distintos para a música.');
    this.nodes = [...options.nodes];
    this.maxPlayers = positive(options.maxPlayers ?? 1000, 100_000, 'maxPlayers');
    this.queueLimit = positive(options.queueLimit ?? 1000, 100_000, 'queueLimit');
    this.maxPendingControls = positive(options.maxPendingControls ?? 128, 10_000, 'maxPendingControls');
    this.recoveryConcurrency = positive(options.recoveryConcurrency ?? 4, 128, 'recoveryConcurrency');
    this.subscriptions = [];
    try {
      for (const node of this.nodes) {
        this.subscriptions.push(node.subscribe(event => this.players.get(event.guildId)?.receive(node, event)));
        if (node.subscribeLifecycle) this.subscriptions.push(node.subscribeLifecycle(event => {
          if (this.closing) return;
          if (event.type === 'ready' && !event.resumed) void this.recoverNode(node).catch(() => {});
          else if (event.type === 'disconnect') {
            for (const player of this.players.values()) if (player.node === node) player.emit('nodeDisconnect', event.code);
          }
        }));
      }
    } catch (error) { for (const unsubscribe of this.subscriptions) unsubscribe(); throw error; }
  }
  get size(): number { return this.players.size; }
  get(guildID: string): MusicPlayer | undefined { return this.players.get(guildID); }
  createPlayer(guildID: string, options: MusicPlayerOptions = {}): MusicPlayer {
    if (this.closing) throw new YuzuhaError('MUSIC_CLOSED', 'O gerenciador de música está fechado.');
    if (typeof guildID !== 'string' || !guildID.trim() || guildID.length > 128) throw new YuzuhaError('MUSIC_GUILD', 'Informe um servidor válido.');
    const existing = this.players.get(guildID); if (existing) return existing;
    if (this.players.size >= this.maxPlayers) throw new YuzuhaError('MUSIC_CAPACITY', 'Limite de players excedido.');
    const node = options.node ?? this.selectNode();
    if (!node || node.available === false) throw new YuzuhaError('MUSIC_NODE_UNAVAILABLE', 'Nenhum node de música disponível.');
    if (!this.nodes.includes(node)) throw new YuzuhaError('MUSIC_NODE', 'O node não pertence a este gerenciador.');
    const player = new MusicPlayer(guildID, node, positive(options.queueLimit ?? this.queueLimit, 100_000, 'queueLimit'), this.options.voice,
      error => this.options.onError?.(error, player), () => {
        if (this.players.get(guildID) === player) { this.players.delete(guildID); this.counts.set(node, (this.counts.get(node) ?? 1) - 1); }
      }, positive(options.maxPendingControls ?? this.maxPendingControls, 10_000, 'maxPendingControls'), this.options.audio);
    this.players.set(guildID, player); this.counts.set(node, (this.counts.get(node) ?? 0) + 1);
    return player;
  }
  search(identifier: string, signal?: AbortSignal): Promise<TrackLoadResult> {
    if (this.closing) return Promise.reject(new YuzuhaError('MUSIC_CLOSED', 'O gerenciador de música está fechado.'));
    const node = this.selectNode();
    return node ? node.loadTracks(identifier, signal) : Promise.reject(new YuzuhaError('MUSIC_NODE_UNAVAILABLE', 'Nenhum node de música disponível.'));
  }
  private selectNode(): MusicBackend | undefined {
    let best: MusicBackend | undefined, score = Infinity;
    for (const node of this.nodes) {
      if (node.available === false) continue;
      const penalty = node.penalty;
      const load = (this.counts.get(node) ?? 0) + (typeof penalty === 'number' && Number.isFinite(penalty) && penalty >= 0 ? penalty : 0);
      if (load < score) { score = load; best = node; }
    }
    return best;
  }
  recoverNode(node: MusicBackend): Promise<void> {
    if (this.closing) return Promise.reject(new YuzuhaError('MUSIC_CLOSED', 'O gerenciador de música está fechado.'));
    if (!this.nodes.includes(node)) return Promise.reject(new YuzuhaError('MUSIC_NODE', 'O node não pertence a este gerenciador.'));
    const players = [...this.players.values()].filter(player => player.node === node);
    for (const player of players) player.invalidateSession();
    const version = (this.recoveryVersions.get(node) ?? 0) + 1; this.recoveryVersions.set(node, version);
    const previous = this.recoveries.get(node) ?? Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      if (this.closing || this.recoveryVersions.get(node) !== version) return;
      let next = 0;
      const failures: unknown[] = [];
      const worker = async () => {
        while (!this.closing && this.recoveryVersions.get(node) === version && next < players.length) {
          const player = players[next++]!;
          if (this.players.get(player.guildID) !== player) continue;
          try { await player.recover(); }
          catch (error) {
            if (this.closing) return;
            failures.push(error); player.emit('playerError', error); this.options.onError?.(error, player);
          }
        }
      };
      const results = await Promise.allSettled(Array.from({ length: Math.min(players.length, this.recoveryConcurrency) }, worker));
      for (const result of results) if (result.status === 'rejected') failures.push(result.reason);
      if (failures.length) throw new AggregateError(failures, 'Falha ao recuperar players de música.');
    });
    this.recoveries.set(node, task);
    const clear = () => { if (this.recoveries.get(node) === task) this.recoveries.delete(node); };
    void task.then(clear, clear); return task;
  }
  async drain(): Promise<void> {
    await Promise.allSettled([...this.recoveries.values()]);
    await Promise.all([...this.players.values()].map(player => player.drain()));
  }
  async destroyPlayer(guildID: string): Promise<boolean> {
    const player = this.players.get(guildID); if (!player) return false;
    await player.destroy(); return true;
  }
  close(): Promise<void> {
    if (this.closeTask) return this.closeTask;
    this.closing = true;
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.closeTask = Promise.allSettled([...this.players.values()].map(player => player.destroy())).then(async results => {
      await Promise.allSettled([...this.recoveries.values()]);
      const failures = results.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
      if (failures.length) throw new AggregateError(failures.map(item => item.reason), 'Falha ao encerrar players de música.');
    });
    return this.closeTask;
  }
}
