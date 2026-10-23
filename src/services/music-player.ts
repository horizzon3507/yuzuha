import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { MusicEvent, MusicFilters, MusicPlayerState, MusicPlayerUpdate, MusicTrack, MusicVoiceState, TrackLoadResult } from '../domain/music.js';
import { isMusicPlayerState } from '../domain/music-state.js';
import { TrackQueue } from '../domain/track-queue.js';
import type { MusicAudioOutput, MusicBackend } from '../ports/music.js';
import { cancellationError } from './cancellation.js';
import { YuzuhaError } from '../shared/errors.js';
import type { MusicVoiceAdapter } from './music.js';

export interface MusicPlayerEvents {
  trackStart: [track: MusicTrack];
  trackEnd: [track: MusicTrack, reason: string];
  queueEnd: [];
  playerError: [error: unknown];
  voiceClose: [code: number];
  nodeDisconnect: [code: number];
  recovered: [];
}
const marker = '__yuzuhaPlayback';

function trackSnapshot(track: MusicTrack): MusicTrack {
  if (!track || typeof track.encoded !== 'string' || !track.encoded || !track.info || typeof track.info.title !== 'string'
    || typeof track.info.length !== 'number' || !Number.isFinite(track.info.length) || track.info.length < 0) {
    throw new YuzuhaError('MUSIC_TRACK', 'Faixa inválida: informe encoded e metadados de áudio.');
  }
  return structuredClone(track);
}
function voiceSnapshot(voice: MusicVoiceState, channelID: string): MusicVoiceState {
  if (!voice || [voice.token, voice.endpoint, voice.sessionId].some(value => typeof value !== 'string' || !value)
    || (voice.channelId != null && voice.channelId !== channelID)) throw new YuzuhaError('MUSIC_VOICE_STATE', 'A ponte deve retornar token, endpoint e sessionId válidos para o canal solicitado.');
  return { ...structuredClone(voice), channelId: channelID };
}
export class MusicPlayer extends EventEmitter<MusicPlayerEvents> {
  private readonly tracks: TrackQueue<MusicTrack>;
  private readonly shutdown = new AbortController();
  private tail: Promise<unknown> = Promise.resolve();
  private playing: MusicTrack | null = null;
  private advanceTarget?: { track: MusicTrack; dequeue: boolean; requeue?: MusicTrack };
  private playbackID?: string;
  private readonly playbackPrefix = randomUUID();
  private sequence = 0;
  private playerState?: MusicPlayerState;
  private stateReceivedAt = 0;
  private filters: MusicFilters = {};
  private voiceState?: MusicVoiceState;
  private sessionVersion = 0;
  private recoveryRequired = false;
  private recoveryTask?: Promise<void>;
  private pending = 0;
  private readonly pendingEvents = new Set<string>();
  private channel?: string;
  private voiceJoined = false;
  private audioConnected = false;
  private paused = false;
  private playerVolume = 100;
  private repeat: 'off' | 'track' | 'queue' = 'off';
  private closing = false;
  private closeTask?: Promise<void>;

  constructor(readonly guildID: string, readonly node: MusicBackend, capacity: number,
    private readonly voice?: MusicVoiceAdapter, private readonly onError: (error: unknown) => void = () => {},
    private readonly release: () => void = () => {}, private readonly maxPendingControls = 128,
    private readonly audio?: MusicAudioOutput) {
    super(); this.tracks = new TrackQueue(capacity);
    if (!Number.isSafeInteger(maxPendingControls) || maxPendingControls < 1 || maxPendingControls > 10_000) throw new YuzuhaError('MUSIC_OPTIONS', 'maxPendingControls deve ser inteiro entre 1 e 10000.');
  }
  get current(): MusicTrack | null { return this.playing && structuredClone(this.playing); }
  get queue(): MusicTrack[] { return structuredClone(this.tracks.toArray()); }
  get queueSize(): number { return this.tracks.size; }
  get state(): MusicPlayerState | undefined { return this.playerState && { ...this.playerState }; }
  get position(): number {
    if (!this.playing || !this.playerState) return 0;
    const timescale = this.filters.timescale;
    const speed = (timescale?.speed ?? 1) * (timescale?.rate ?? 1);
    const elapsed = this.paused || !this.playerState.connected || this.recoveryRequired ? 0 : Math.max(0, performance.now() - this.stateReceivedAt) * speed;
    const position = Math.max(0, this.playerState.position + elapsed);
    return Math.floor(this.playing.info.isStream ? position : Math.min(this.playing.info.length, position));
  }
  get isRecovering(): boolean { return this.recoveryRequired; }
  get pendingControls(): number { return this.pending; }
  get activeFilters(): MusicFilters { return structuredClone(this.filters); }
  get voiceChannelID(): string | undefined { return this.channel; }
  get isPaused(): boolean { return this.paused; }
  get volume(): number { return this.playerVolume; }
  get loop(): 'off' | 'track' | 'queue' { return this.repeat; }
  setLoop(mode: 'off' | 'track' | 'queue'): void {
    this.assertOpen();
    if (!['off', 'track', 'queue'].includes(mode)) throw new YuzuhaError('MUSIC_LOOP', 'Loop deve ser off, track ou queue.');
    this.repeat = mode;
  }
  enqueue(tracks: MusicTrack | readonly MusicTrack[]): number {
    this.assertOpen();
    const items = Array.isArray(tracks) ? tracks : [tracks as MusicTrack];
    if (items.length > this.tracks.capacity - this.tracks.size) throw new YuzuhaError('MUSIC_QUEUE_LIMIT', 'A fila de músicas está cheia.');
    return this.tracks.add(Array.from(items, trackSnapshot));
  }
  clearQueue(): void { this.assertOpen(); this.tracks.clear(); }
  queuePage(start = 0, count = Math.min(25, this.tracks.size - start)): MusicTrack[] {
    return structuredClone(this.tracks.slice(start, count));
  }
  remove(index: number, count = 1): MusicTrack[] {
    this.assertOpen();
    const removed = structuredClone(this.tracks.slice(index, count)); this.tracks.remove(index, count); return removed;
  }
  move(from: number, to: number): void { this.assertOpen(); this.tracks.move(from, to); }
  shuffle(random?: () => number): void { this.assertOpen(); this.tracks.shuffle(random); }
  enqueueResult(result: TrackLoadResult, searchIndex = 0): number {
    this.assertOpen();
    switch (result.loadType) {
      case 'track': return this.enqueue(result.data);
      case 'playlist': return this.enqueue(result.data.tracks);
      case 'search':
        if (!Number.isSafeInteger(searchIndex) || searchIndex < 0 || searchIndex >= result.data.length) {
          if (!result.data.length && searchIndex === 0) return this.tracks.size;
          throw new YuzuhaError('MUSIC_SEARCH_INDEX', 'Resultado de busca fora do intervalo.');
        }
        return this.enqueue(result.data[searchIndex]!);
      case 'empty': return this.tracks.size;
      case 'error': throw new YuzuhaError('MUSIC_LOAD', result.data.message ?? 'Não foi possível carregar as músicas.');
    }
  }
  private assertOpen(): void { if (this.closing) throw new YuzuhaError('MUSIC_CLOSED', 'O player está fechado.'); }
  private serialize<T>(work: () => Promise<T>, kind: 'control' | 'event' | 'recovery' = 'control'): Promise<T> {
    if (this.closing) return Promise.reject(new YuzuhaError('MUSIC_CLOSED', 'O player está fechado.'));
    if (kind === 'control' && this.pending >= this.maxPendingControls) return Promise.reject(new YuzuhaError('MUSIC_CONTROL_LIMIT', 'Limite de controles pendentes do player excedido.'));
    if (kind === 'control') this.pending++;
    const task = this.tail.then(() => {
      this.assertOpen();
      if (this.recoveryRequired && kind !== 'recovery') throw new YuzuhaError('MUSIC_RECOVERY_REQUIRED', 'Aguarde a recuperação do player ou chame recover() após corrigir a falha.');
      return work();
    });
    const complete = () => { if (kind === 'control') this.pending--; };
    this.tail = task.then(complete, complete);
    return task;
  }
  private async update(update: MusicPlayerUpdate): Promise<MusicPlayerState> {
    const version = this.sessionVersion;
    const remote = await this.node.updatePlayer(this.guildID, update, { signal: this.shutdown.signal });
    if (this.shutdown.signal.aborted) throw cancellationError();
    if (version !== this.sessionVersion) throw new YuzuhaError('MUSIC_SESSION_CHANGED', 'A sessão mudou durante o controle; o estado local foi preservado.');
    if (!remote || remote.guildId !== this.guildID || !isMusicPlayerState(remote.state)) throw new YuzuhaError('MUSIC_STATE', 'O backend retornou um estado de player inválido.');
    return { ...remote.state };
  }
  private acceptState(state: MusicPlayerState): void {
    this.playerState = this.audio ? { ...state, connected: this.audioConnected } : state;
    this.stateReceivedAt = performance.now();
  }
  private readonly audioState = (connected: boolean, error?: unknown): void => {
    const position = this.position;
    this.audioConnected = connected;
    if (this.playerState) this.acceptState({ ...this.playerState, position });
    if (!this.closing && error !== undefined) { this.emit('playerError', error); this.onError(error); }
  };
  private commitQueue(track: MusicTrack, dequeue: boolean, requeue?: MusicTrack): void {
    if (dequeue) {
      if (this.tracks.peek() === track) this.tracks.dequeue();
      else { const index = this.tracks.indexOf(track); if (index >= 0) this.tracks.remove(index); }
    }
    if (requeue && this.tracks.size < this.tracks.capacity) this.tracks.enqueue(requeue);
  }
  private async start(track: MusicTrack, dequeue: boolean, requeue?: MusicTrack): Promise<MusicTrack> {
    const playbackID = `${this.playbackPrefix}:${++this.sequence}`;
    const remote = await this.update({ track: { encoded: track.encoded, userData: { ...track.userData, [marker]: playbackID } }, paused: false, endTime: null });
    this.commitQueue(track, dequeue, requeue);
    this.playing = track; this.advanceTarget = undefined; this.playbackID = playbackID; this.paused = false; this.acceptState(remote);
    return structuredClone(track);
  }
  play(): Promise<MusicTrack | null> {
    return this.serialize(async () => {
      if (this.playing) return structuredClone(this.playing);
      if (this.advanceTarget) return this.start(this.advanceTarget.track, this.advanceTarget.dequeue, this.advanceTarget.requeue);
      const next = this.tracks.peek(); return next ? this.start(next, true) : null;
    });
  }
  skip(): Promise<MusicTrack | null> {
    return this.serialize(async () => {
      const next = this.tracks.peek();
      if (next) return this.start(next, true);
      await this.update({ track: { encoded: null } });
      this.playing = null; this.advanceTarget = undefined; this.playbackID = undefined; this.paused = false; return null;
    });
  }
  stop(clearQueue = true): Promise<void> {
    return this.serialize(async () => {
      await this.update({ track: { encoded: null } });
      this.playing = null; this.advanceTarget = undefined; this.playbackID = undefined; this.paused = false;
      if (clearQueue) this.tracks.clear();
    });
  }
  pause(paused = true): Promise<void> {
    return this.serialize(async () => {
      if (typeof paused !== 'boolean') throw new YuzuhaError('MUSIC_PAUSED', 'paused deve ser booleano.');
      const remote = await this.update({ paused }); this.paused = paused; this.acceptState(remote);
    });
  }
  setVolume(volume: number): Promise<void> {
    return this.serialize(async () => {
      if (!Number.isSafeInteger(volume) || volume < 0 || volume > 1000) throw new YuzuhaError('MUSIC_VOLUME', 'Volume deve ser inteiro entre 0 e 1000.');
      const remote = await this.update({ volume }); this.playerVolume = volume; this.acceptState(remote);
    });
  }
  seek(position: number): Promise<void> {
    return this.serialize(async () => {
      if (!this.playing?.info.isSeekable || !Number.isSafeInteger(position) || position < 0 || position > this.playing.info.length) throw new YuzuhaError('MUSIC_SEEK', 'Posição inválida ou faixa sem seek.');
      const remote = await this.update({ position }); this.acceptState(remote);
    });
  }
  setFilters(filters: MusicFilters): Promise<void> {
    const snapshot = structuredClone(filters);
    return this.serialize(async () => {
      if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new YuzuhaError('MUSIC_FILTERS', 'Filtros devem ser um objeto.');
      for (const key of ['speed', 'rate', 'pitch'] as const) {
        const value = snapshot.timescale?.[key];
        if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new YuzuhaError('MUSIC_FILTERS', `timescale.${key} deve ser positivo e finito.`);
      }
      if (!Number.isFinite((snapshot.timescale?.speed ?? 1) * (snapshot.timescale?.rate ?? 1))) throw new YuzuhaError('MUSIC_FILTERS', 'O produto de speed e rate deve ser finito.');
      const remote = await this.update({ filters: snapshot }); this.filters = snapshot; this.acceptState(remote);
    });
  }
  connect(channelID: string): Promise<void> {
    return this.serialize(async () => {
      if (!this.voice && !this.audio) throw new YuzuhaError('MUSIC_VOICE_ADAPTER', 'Configure FluxerLavalinkBridge com o plugin yuzuha-audio ou um adaptador de voz compatível.');
      if (typeof channelID !== 'string' || !channelID.trim() || channelID.length > 128) throw new YuzuhaError('MUSIC_CHANNEL', 'Informe um canal de voz válido.');
      if (this.audio && this.channel && this.channel !== channelID) throw new YuzuhaError('MUSIC_CHANNEL', 'Encerre o player antes de mudar seu canal de voz.');
      if (this.audio) {
        await this.audio.connect(this.node, this.guildID, channelID, this.shutdown.signal, this.audioState);
        this.voiceJoined = true;
        try { const remote = await this.update({}); this.channel = channelID; this.acceptState(remote); }
        catch (error) {
          try { await this.audio.disconnect(this.guildID); this.voiceJoined = false; }
          catch (cleanup) { throw new AggregateError([error, cleanup], 'A conexão falhou e a saída de áudio não pôde ser encerrada.'); }
          throw error;
        }
        return;
      }
      const joined = await this.voice!.join(this.guildID, channelID, this.shutdown.signal);
      this.voiceJoined = true;
      try {
        if (this.shutdown.signal.aborted) throw cancellationError();
        const voice = voiceSnapshot(joined, channelID);
        const remote = await this.update({ voice });
        this.voiceState = structuredClone(voice); this.channel = channelID; this.acceptState(remote);
      } catch (error) {
        this.channel = undefined;
        try { await this.voice!.leave(this.guildID); this.voiceJoined = false; }
        catch (cleanup) { throw new AggregateError([error, cleanup], 'A conexão falhou e a voz não pôde ser encerrada.'); }
        throw error;
      }
    });
  }
  invalidateSession(): void {
    if (this.closing) return;
    const position = this.position;
    this.sessionVersion++; this.recoveryRequired = true;
    if (this.playerState) this.acceptState({ ...this.playerState, position });
  }
  recover(): Promise<void> {
    if (this.recoveryTask) return this.recoveryTask;
    if (!this.recoveryRequired) return Promise.resolve();
    const task = this.serialize(async () => {
      if (this.node.available === false) throw new YuzuhaError('MUSIC_NODE_UNAVAILABLE', 'O node de música está indisponível.');
      const version = this.sessionVersion;
      if (this.channel && this.audio) await this.audio.connect(this.node, this.guildID, this.channel, this.shutdown.signal, this.audioState);
      const voice = this.channel && this.voice ? voiceSnapshot(await this.voice.join(this.guildID, this.channel, this.shutdown.signal), this.channel) : this.voiceState;
      if (this.shutdown.signal.aborted) throw cancellationError();
      if (version !== this.sessionVersion) throw new YuzuhaError('MUSIC_SESSION_CHANGED', 'A sessão mudou durante a recuperação.');
      const advance = !this.playing ? this.advanceTarget : undefined;
      const track = this.playing ?? advance?.track;
      const playbackID = track ? `${this.playbackPrefix}:${++this.sequence}` : undefined;
      const remote = await this.update({
        track: { encoded: track?.encoded ?? null, ...(track ? { userData: { ...track.userData, [marker]: playbackID } } : {}) },
        ...(track?.info.isSeekable && !track.info.isStream ? { position: advance ? 0 : this.position } : {}),
        volume: this.playerVolume, paused: this.paused, filters: this.filters, endTime: null,
        ...(voice ? { voice } : {}),
      });
      if (advance) this.commitQueue(advance.track, advance.dequeue, advance.requeue);
      this.playing = track ?? null; this.advanceTarget = undefined;
      this.playbackID = playbackID; this.voiceState = voice && structuredClone(voice);
      this.acceptState(remote); this.recoveryRequired = false; this.emit('recovered');
    }, 'recovery');
    this.recoveryTask = task;
    const clear = () => { if (this.recoveryTask === task) this.recoveryTask = undefined; };
    void task.then(clear, clear); return task;
  }
  receive(node: MusicBackend, event: MusicEvent): void {
    if (this.closing || node !== this.node || event.guildId !== this.guildID) return;
    if (this.recoveryRequired) return;
    if (event.op === 'playerUpdate') {
      if (!isMusicPlayerState(event.state)) throw new YuzuhaError('MUSIC_STATE', 'O backend enviou um estado de player inválido.');
      this.acceptState({ ...event.state }); return;
    }
    const playback = event.type === 'WebSocketClosedEvent' ? 'voice' : event.track.userData?.[marker];
    if (playback !== 'voice' && playback !== this.playbackID && playback !== `${this.playbackPrefix}:${this.sequence}`) return;
    const key = `${event.type}:${String(playback)}`;
    if (this.pendingEvents.has(key)) return;
    this.pendingEvents.add(key);
    const work = this.serialize(async () => {
      if (event.type === 'WebSocketClosedEvent') { this.emit('voiceClose', event.code); return; }
      if (!this.playbackID || event.track?.userData?.[marker] !== this.playbackID) return;
      if (event.type === 'TrackStartEvent') { this.emit('trackStart', structuredClone(event.track)); return; }
      if (event.type === 'TrackExceptionEvent') { this.emit('playerError', event.exception); return; }
      if (event.type === 'TrackStuckEvent') { this.emit('playerError', new YuzuhaError('MUSIC_TRACK_STUCK', 'A faixa parou de fornecer áudio.')); return; }
      const previous = this.playing;
      if (!previous) return;
      this.emit('trackEnd', structuredClone(previous), event.reason);
      if (event.reason !== 'finished' && event.reason !== 'loadFailed') {
        if (event.reason !== 'replaced') { this.playing = null; this.playbackID = undefined; }
        return;
      }
      this.playing = null; this.playbackID = undefined;
      if (this.repeat === 'track' && event.reason === 'finished') {
        this.advanceTarget = { track: previous, dequeue: false }; await this.start(previous, false); return;
      }
      const next = this.tracks.peek();
      const repeatQueue = this.repeat === 'queue' && event.reason === 'finished';
      if (next) { this.advanceTarget = { track: next, dequeue: true, requeue: repeatQueue ? previous : undefined }; await this.start(next, true, repeatQueue ? previous : undefined); }
      else if (repeatQueue) { this.advanceTarget = { track: previous, dequeue: false }; await this.start(previous, false); }
      else this.emit('queueEnd');
    }, 'event');
    const complete = () => { this.pendingEvents.delete(key); };
    void work.then(complete, complete);
    void work.catch(error => { this.emit('playerError', error); this.onError(error); });
  }
  /** Waits for controls and events already received, without closing the player. */
  async drain(): Promise<void> { await this.tail; }
  destroy(): Promise<void> {
    if (this.closeTask) return this.closeTask;
    this.closing = true; this.shutdown.abort();
    this.closeTask = this.tail.then(async () => {
      const results = await Promise.allSettled([this.node.destroyPlayer(this.guildID), ...(this.voiceJoined && this.voice ? [this.voice.leave(this.guildID)] : []),
        ...(this.voiceJoined && this.audio ? [this.audio.disconnect(this.guildID)] : [])]);
      this.tracks.clear(); this.playing = null; this.advanceTarget = undefined; this.playbackID = undefined; this.channel = undefined; this.voiceJoined = false; this.voiceState = undefined;
      this.pendingEvents.clear(); this.release(); this.removeAllListeners();
      const failures = results.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
      if (failures.length) throw new AggregateError(failures.map(item => item.reason), 'Falha ao destruir o player de música.');
    });
    return this.closeTask;
  }
}
