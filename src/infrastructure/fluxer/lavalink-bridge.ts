import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import type { MusicAudioOutput, MusicAudioStream, MusicBackend } from '../../ports/music.js';
import type { FluxerVoiceConnection, NativeVoice } from '../../ports/voice.js';
import { abortable, cancellationError } from '../../services/cancellation.js';
import { YuzuhaError } from '../../shared/errors.js';

export interface FluxerLavalinkBridgeOptions {
  voice: NativeVoice;
  maxStreams?: number;
  reconnect?: false | { attempts?: number; delayMs?: number; maxDelayMs?: number };
}
type Entry = {
  guildID: string; channelID: string; node: MusicBackend; controller: AbortController;
  signal: AbortSignal; onAbort: () => void; onState: (connected: boolean, error?: unknown) => void;
  tail: Promise<void>; opening?: Promise<void>; retry?: Promise<void>; closing?: Promise<void>; ready: boolean; generation: number;
  connection?: FluxerVoiceConnection; audio?: MusicAudioStream; source?: Readable;
  onError?: (error: Error) => void; onDisconnect?: () => void;
  unsubscribe?: () => void;
};
function positive(value: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new YuzuhaError('MUSIC_AUDIO_OPTIONS', `Limite deve ser inteiro entre 1 e ${max}.`);
  return value;
}

/** Publishes the continuous output of the yuzuha-audio Lavalink plugin through Fluxer voice. */
export class FluxerLavalinkBridge implements MusicAudioOutput {
  private readonly entries = new Map<string, Entry>();
  private readonly subscriptions = new Map<MusicBackend, { entries: Set<Entry>; unsubscribe: () => void }>();
  private readonly voice: NativeVoice;
  private readonly limit: number;
  private readonly retries: number;
  private readonly retryDelay: number;
  private readonly maxDelay: number;
  private closed = false;
  private closeTask?: Promise<void>;

  constructor(options: FluxerLavalinkBridgeOptions) {
    this.voice = options.voice;
    this.limit = positive(options.maxStreams ?? 128, 10_000);
    this.retries = options.reconnect === false ? 0 : positive(options.reconnect?.attempts ?? 5, 100);
    this.retryDelay = options.reconnect === false ? 250 : positive(options.reconnect?.delayMs ?? 250, 300_000);
    this.maxDelay = options.reconnect === false ? 5000 : positive(options.reconnect?.maxDelayMs ?? 5000, 300_000);
  }
  get size(): number { return this.entries.size; }

  async connect(node: MusicBackend, guildID: string, channelID: string, signal: AbortSignal,
    onState: (connected: boolean, error?: unknown) => void): Promise<void> {
    if (this.closed) throw new YuzuhaError('MUSIC_AUDIO_CLOSED', 'A ponte de áudio está fechada.');
    if (signal.aborted) throw cancellationError();
    if (!node.openAudioStream) throw new YuzuhaError('MUSIC_AUDIO_UNSUPPORTED', 'O backend não oferece a saída de áudio yuzuha-audio.');
    let entry = this.entries.get(guildID);
    if (entry) {
      if (entry.closing || entry.channelID !== channelID || entry.node !== node || entry.signal !== signal) {
        throw new YuzuhaError('MUSIC_AUDIO_BUSY', 'Encerre a saída atual antes de alterar servidor, canal ou proprietário.');
      }
      entry.onState = onState;
      return this.open(entry);
    }
    if (this.entries.size >= this.limit) throw new YuzuhaError('MUSIC_AUDIO_LIMIT', 'Limite de saídas de áudio da ponte excedido.');
    if (this.voice.get(guildID)) throw new YuzuhaError('MUSIC_AUDIO_BUSY', 'A conexão de voz deste servidor já possui outro proprietário.');
    const onAbort = () => { void this.disconnect(guildID).catch(error => onState(false, error)); };
    entry = { guildID, channelID, node, signal, onAbort, onState, controller: new AbortController(),
      tail: Promise.resolve(), ready: false, generation: 0 };
    this.entries.set(guildID, entry);
    signal.addEventListener('abort', onAbort, { once: true });
    try { entry.unsubscribe = this.subscribe(entry); await this.open(entry); }
    catch (error) {
      try { await this.disconnect(guildID); }
      catch (cleanup) { throw new AggregateError([error, cleanup], 'Falha ao abrir e encerrar a ponte de áudio.'); }
      throw error;
    }
  }

  private subscribe(entry: Entry): (() => void) | undefined {
    const node = entry.node;
    if (!node.subscribeLifecycle) return undefined;
    let group = this.subscriptions.get(node);
    if (!group) {
      const entries = new Set<Entry>();
      const unsubscribe = node.subscribeLifecycle(event => {
        if (event.type !== 'ready' || !event.resumed) return;
        for (const owned of entries) if (!owned.ready && !owned.controller.signal.aborted) {
          void this.open(owned, false).catch(error => owned.onState(false, error));
        }
      });
      group = { entries, unsubscribe }; this.subscriptions.set(node, group);
    }
    const active = group; active.entries.add(entry);
    return () => {
      active.entries.delete(entry);
      if (!active.entries.size) { this.subscriptions.delete(node); active.unsubscribe(); }
    };
  }

  private open(entry: Entry, refresh = true): Promise<void> {
    if (!refresh && entry.opening) return entry.opening;
    const task = entry.tail.catch(() => {}).then(async () => {
      if (entry.controller.signal.aborted) throw cancellationError();
      if (entry.ready) entry.onState(false);
      await this.stopStream(entry);
      if (entry.controller.signal.aborted) throw cancellationError();
      if (!entry.connection || this.voice.get(entry.guildID) !== entry.connection) {
        this.detach(entry);
        entry.connection = await this.voice.join(entry.channelID, { guildID: entry.guildID });
        if (this.voice.get(entry.guildID) !== entry.connection) throw new YuzuhaError('MUSIC_AUDIO_GUILD', 'A conexão de voz não pertence ao servidor solicitado.');
        entry.onError = error => this.interrupted(entry, error);
        entry.onDisconnect = () => this.interrupted(entry, new YuzuhaError('MUSIC_AUDIO_DISCONNECTED', 'O Fluxer encerrou a conexão de voz.'));
        entry.connection.on('error', entry.onError); entry.connection.on('disconnect', entry.onDisconnect);
      }
      if (entry.controller.signal.aborted) throw cancellationError();
      const generation = ++entry.generation;
      const audio = await entry.node.openAudioStream!(entry.guildID, entry.controller.signal);
      entry.audio = audio;
      if (entry.controller.signal.aborted) { await this.stopStream(entry); throw cancellationError(); }
      const source = Readable.from(audio.data, { objectMode: false, highWaterMark: 16_384 });
      entry.source = source;
      const interrupted = (error?: Error) => {
        if (generation === entry.generation && !entry.controller.signal.aborted) this.interrupted(entry,
          error ?? new YuzuhaError('MUSIC_AUDIO_ENDED', 'A saída contínua de áudio foi encerrada.'));
      };
      source.on('error', interrupted); source.once('end', interrupted);
      try {
        const connection = entry.connection;
        const publication = this.voice.play(entry.guildID, source);
        void publication.then(() => {
          if (entry.controller.signal.aborted && this.voice.get(entry.guildID) !== connection) connection.stop();
        }, () => {}).catch(error => entry.onState(false, error));
        await abortable(publication, entry.controller.signal);
        if (entry.controller.signal.aborted) throw cancellationError();
        if (source.destroyed || source.readableEnded) throw new YuzuhaError('MUSIC_AUDIO_ENDED', 'A saída de áudio encerrou durante a conexão.');
        entry.ready = true; entry.onState(true);
      } catch (error) { await this.stopStream(entry); throw error; }
    });
    entry.tail = task; entry.opening = task;
    const clear = () => { if (entry.opening === task) entry.opening = undefined; };
    void task.then(clear, clear); return task;
  }

  private interrupted(entry: Entry, error: unknown): void {
    if (!entry.ready || entry.controller.signal.aborted) return;
    entry.ready = false; entry.onState(false, error);
    entry.tail = entry.tail.catch(() => {}).then(() => this.stopStream(entry));
    void entry.tail.catch(failure => entry.onState(false, failure));
    if (entry.retry || !this.retries) return;
    const task = (async () => {
      for (let attempt = 0; attempt < this.retries && !entry.controller.signal.aborted && !entry.ready; attempt++) {
        try {
          await delay(Math.min(this.maxDelay, this.retryDelay * 2 ** attempt), undefined, { signal: entry.controller.signal, ref: false });
          if (entry.ready) return;
          if (entry.node.available === false) continue;
          await this.open(entry, false);
        } catch (failure) { if (!entry.controller.signal.aborted) entry.onState(false, failure); }
      }
    })();
    entry.retry = task;
    void task.then(() => { if (entry.retry === task) entry.retry = undefined; }, failure => {
      entry.retry = undefined; if (!entry.controller.signal.aborted) entry.onState(false, failure);
    });
  }

  private detach(entry: Entry): void {
    if (entry.onError) entry.connection?.off('error', entry.onError);
    if (entry.onDisconnect) entry.connection?.off('disconnect', entry.onDisconnect);
    entry.onError = undefined; entry.onDisconnect = undefined;
  }
  private async stopStream(entry: Entry): Promise<void> {
    entry.generation++; entry.ready = false;
    entry.source?.destroy(); entry.source = undefined;
    const audio = entry.audio; entry.audio = undefined;
    try { await audio?.close(); }
    finally { entry.connection?.stop(); }
  }
  disconnect(guildID: string): Promise<void> {
    const entry = this.entries.get(guildID);
    if (!entry) return Promise.resolve();
    if (entry.closing) return entry.closing;
    entry.closing = Promise.resolve().then(async () => {
      entry.unsubscribe?.(); entry.unsubscribe = undefined;
      await entry.tail.catch(() => {});
      await entry.retry;
      this.detach(entry);
      const results = await Promise.allSettled([this.stopStream(entry), this.voice.leave(guildID)]);
      this.entries.delete(guildID); entry.onState(false);
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Falha ao encerrar a ponte de áudio.');
    });
    entry.controller.abort(); entry.signal.removeEventListener('abort', entry.onAbort);
    return entry.closing;
  }
  close(): Promise<void> {
    if (this.closeTask) return this.closeTask;
    this.closed = true;
    this.closeTask = Promise.resolve().then(() => Promise.allSettled([...this.entries.keys()].map(guildID => this.disconnect(guildID)))).then(results => {
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failures.length) throw new AggregateError(failures.map(result => result.reason), 'Falha ao encerrar as saídas de áudio.');
    });
    return this.closeTask;
  }
}
