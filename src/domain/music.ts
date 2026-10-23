export interface MusicTrack {
  encoded: string;
  info: {
    identifier: string;
    isSeekable: boolean;
    author: string;
    length: number;
    isStream: boolean;
    position: number;
    title: string;
    uri: string | null;
    artworkUrl?: string | null;
    isrc?: string | null;
    sourceName: string;
  };
  pluginInfo: Record<string, unknown>;
  userData: Record<string, unknown>;
}

export interface TrackException { message: string | null; severity: 'common' | 'suspicious' | 'fault'; cause: string }
export type TrackLoadResult =
  | { loadType: 'track'; data: MusicTrack }
  | { loadType: 'playlist'; data: { info: { name: string; selectedTrack: number }; pluginInfo: Record<string, unknown>; tracks: MusicTrack[] } }
  | { loadType: 'search'; data: MusicTrack[] }
  | { loadType: 'empty'; data: null }
  | { loadType: 'error'; data: TrackException };

export interface MusicVoiceState { token: string; endpoint: string; sessionId: string; channelId?: string | null }
export interface MusicPlayerState { time: number; position: number; connected: boolean; ping: number }
export interface MusicFilters {
  volume?: number;
  equalizer?: { band: number; gain: number }[];
  karaoke?: { level?: number; monoLevel?: number; filterBand?: number; filterWidth?: number };
  timescale?: { speed?: number; pitch?: number; rate?: number };
  tremolo?: { frequency?: number; depth?: number };
  vibrato?: { frequency?: number; depth?: number };
  rotation?: { rotationHz?: number };
  distortion?: { sinOffset?: number; sinScale?: number; cosOffset?: number; cosScale?: number; tanOffset?: number; tanScale?: number; offset?: number; scale?: number };
  channelMix?: { leftToLeft?: number; leftToRight?: number; rightToLeft?: number; rightToRight?: number };
  lowPass?: { smoothing?: number };
  pluginFilters?: Record<string, unknown>;
}
export interface MusicPlayerUpdate {
  track?: { encoded: string | null; userData?: Record<string, unknown> } | { identifier: string; userData?: Record<string, unknown> };
  position?: number;
  endTime?: number | null;
  volume?: number;
  paused?: boolean;
  filters?: MusicFilters;
  voice?: MusicVoiceState;
}
export interface RemoteMusicPlayer {
  guildId: string;
  track: MusicTrack | null;
  volume: number;
  paused: boolean;
  state: MusicPlayerState;
  voice: MusicVoiceState;
  filters: MusicFilters;
}
export type TrackEndReason = 'finished' | 'loadFailed' | 'stopped' | 'replaced' | 'cleanup';
export type MusicEvent =
  | { op: 'playerUpdate'; guildId: string; state: MusicPlayerState }
  | { op: 'event'; type: 'TrackStartEvent'; guildId: string; track: MusicTrack }
  | { op: 'event'; type: 'TrackEndEvent'; guildId: string; track: MusicTrack; reason: TrackEndReason }
  | { op: 'event'; type: 'TrackExceptionEvent'; guildId: string; track: MusicTrack; exception: TrackException }
  | { op: 'event'; type: 'TrackStuckEvent'; guildId: string; track: MusicTrack; thresholdMs: number }
  | { op: 'event'; type: 'WebSocketClosedEvent'; guildId: string; code: number; reason: string; byRemote: boolean };

export interface LavalinkStats {
  players: number;
  playingPlayers: number;
  uptime: number;
  memory: { free: number; used: number; allocated: number; reservable: number };
  cpu: { cores: number; systemLoad: number; lavalinkLoad: number };
  frameStats?: { sent: number; nulled: number; deficit: number } | null;
}

export type MusicNodeEvent =
  | { type: 'ready'; sessionID: string; resumed: boolean }
  | { type: 'disconnect'; code: number }
  | { type: 'closed' };
