import type { MusicEvent, MusicNodeEvent, MusicPlayerUpdate, RemoteMusicPlayer, TrackLoadResult } from '../domain/music.js';

export interface MusicAudioStream {
  readonly format: 'webm-opus';
  readonly data: AsyncIterable<Uint8Array>;
  close(): Promise<void>;
}
export interface MusicAudioOutput {
  connect(node: MusicBackend, guildID: string, channelID: string, signal: AbortSignal,
    onState: (connected: boolean, error?: unknown) => void): Promise<void>;
  disconnect(guildID: string): Promise<void>;
}

export interface MusicBackend {
  readonly available?: boolean;
  /** Additional load used alongside the number of players managed locally. */
  readonly penalty?: number;
  loadTracks(identifier: string, signal?: AbortSignal): Promise<TrackLoadResult>;
  updatePlayer(guildID: string, update: MusicPlayerUpdate, options?: { noReplace?: boolean; signal?: AbortSignal }): Promise<RemoteMusicPlayer>;
  destroyPlayer(guildID: string, signal?: AbortSignal): Promise<void>;
  openAudioStream?(guildID: string, signal?: AbortSignal): Promise<MusicAudioStream>;
  subscribe(listener: (event: MusicEvent) => void): () => void;
  subscribeLifecycle?(listener: (event: MusicNodeEvent) => void): () => void;
}
