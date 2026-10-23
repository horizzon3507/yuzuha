import type { LavalinkStats, MusicEvent, MusicTrack, RemoteMusicPlayer, TrackLoadResult } from '../../domain/music.js';
import { isMusicPlayerState as state } from '../../domain/music-state.js';
import { YuzuhaError } from '../../shared/errors.js';

export function record(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonnegative = (value: unknown): boolean => finite(value) && value >= 0;
export function nodeStats(value: unknown): LavalinkStats {
  if (!record(value) || !nonnegative(value.players) || !nonnegative(value.playingPlayers) || !nonnegative(value.uptime)
    || !record(value.cpu) || !nonnegative(value.cpu.cores) || !nonnegative(value.cpu.systemLoad) || !nonnegative(value.cpu.lavalinkLoad)
    || !record(value.memory) || !['free', 'used', 'allocated', 'reservable'].every(key => nonnegative((value.memory as Record<string, unknown>)[key]))
    || (value.frameStats != null && (!record(value.frameStats) || !nonnegative(value.frameStats.sent) || !nonnegative(value.frameStats.nulled) || !finite(value.frameStats.deficit)))) {
    throw new YuzuhaError('LAVALINK_PROTOCOL', 'Estatísticas inválidas do Lavalink.');
  }
  return value as unknown as LavalinkStats;
}
function track(value: unknown): value is MusicTrack {
  if (!record(value) || typeof value.encoded !== 'string' || !record(value.info)) return false;
  // Lavalink 4.0 omitted empty metadata before 4.0.1 made it unconditional.
  if (value.pluginInfo === undefined) value.pluginInfo = {};
  if (value.userData === undefined) value.userData = {};
  const info = value.info;
  return typeof info.identifier === 'string' && typeof info.title === 'string' && typeof info.author === 'string'
    && typeof info.sourceName === 'string' && typeof info.isSeekable === 'boolean' && typeof info.isStream === 'boolean'
    && finite(info.length) && info.length >= 0 && finite(info.position) && info.position >= 0
    && (info.uri === null || typeof info.uri === 'string') && record(value.pluginInfo) && record(value.userData);
}
export function decodedTrack(value: unknown): MusicTrack {
  if (!track(value)) throw new YuzuhaError('LAVALINK_PROTOCOL', 'Faixa inválida do Lavalink.');
  return value;
}
export function decodedTracks(value: unknown): MusicTrack[] {
  if (!Array.isArray(value) || !value.every(track)) throw new YuzuhaError('LAVALINK_PROTOCOL', 'Lista de faixas inválida do Lavalink.');
  return value;
}
function exception(value: unknown): boolean {
  return record(value) && (value.message === null || typeof value.message === 'string')
    && ['common', 'suspicious', 'fault'].includes(String(value.severity)) && typeof value.cause === 'string';
}
export function remotePlayer(value: unknown, guildID?: string): RemoteMusicPlayer {
  if (!record(value) || typeof value.guildId !== 'string' || !value.guildId || (guildID !== undefined && value.guildId !== guildID)
    || (value.track !== null && !track(value.track)) || !Number.isSafeInteger(value.volume) || Number(value.volume) < 0 || Number(value.volume) > 1000
    || typeof value.paused !== 'boolean' || !state(value.state) || !record(value.filters) || !record(value.voice)
    || !['token', 'endpoint', 'sessionId'].every(key => typeof (value.voice as Record<string, unknown>)[key] === 'string')
    || (value.voice.channelId != null && typeof value.voice.channelId !== 'string')) {
    throw new YuzuhaError('LAVALINK_PROTOCOL', 'Player inválido do Lavalink.');
  }
  return value as unknown as RemoteMusicPlayer;
}
export function remotePlayers(value: unknown): RemoteMusicPlayer[] {
  if (!Array.isArray(value)) throw new YuzuhaError('LAVALINK_PROTOCOL', 'Lista de players inválida do Lavalink.');
  return value.map(player => remotePlayer(player));
}
export function loadResult(value: unknown): TrackLoadResult {
  if (record(value)) {
    const data = value.data;
    switch (value.loadType) {
      case 'track': if (track(data)) return value as unknown as TrackLoadResult; break;
      case 'playlist':
        if (record(data) && record(data.info) && typeof data.info.name === 'string' && Number.isSafeInteger(data.info.selectedTrack)
          && record(data.pluginInfo) && Array.isArray(data.tracks) && data.tracks.every(track)) return value as unknown as TrackLoadResult;
        break;
      case 'search': if (Array.isArray(data) && data.every(track)) return value as unknown as TrackLoadResult; break;
      case 'empty': if (data === null) return value as unknown as TrackLoadResult; break;
      case 'error': if (exception(data)) return value as unknown as TrackLoadResult;
    }
  }
  throw new YuzuhaError('LAVALINK_PROTOCOL', 'Resultado de busca inválido do Lavalink.');
}
export function musicEvent(value: Record<string, unknown>): MusicEvent | undefined {
  if (typeof value.guildId !== 'string' || !value.guildId) throw new YuzuhaError('LAVALINK_PROTOCOL', 'Evento de player sem servidor.');
  let valid = false;
  if (value.op === 'playerUpdate') valid = state(value.state);
  else switch (value.type) {
    case 'TrackStartEvent': valid = track(value.track); break;
    case 'TrackEndEvent': valid = track(value.track) && ['finished', 'loadFailed', 'stopped', 'replaced', 'cleanup'].includes(String(value.reason)); break;
    case 'TrackExceptionEvent': valid = track(value.track) && exception(value.exception); break;
    case 'TrackStuckEvent': valid = track(value.track) && finite(value.thresholdMs); break;
    case 'WebSocketClosedEvent': valid = finite(value.code) && typeof value.reason === 'string' && typeof value.byRemote === 'boolean'; break;
    default: return;
  }
  if (!valid) throw new YuzuhaError('LAVALINK_PROTOCOL', 'Evento de player inválido do Lavalink.');
  return value as unknown as MusicEvent;
}
