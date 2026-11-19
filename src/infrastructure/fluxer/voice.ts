import { EventEmitter } from 'node:events';
import type { Client } from '@fluxerjs/core';
import { YuzuhaError } from '../../shared/errors.js';
import type { FluxerVoiceConnection, FluxerVoiceDriver, NativeVoice } from '../../ports/voice.js';
import type { VoiceEvent, VoiceEventName } from '../../domain/events.js';
import { voiceSDKEvents } from '../../domain/events.js';
type Connection = { channelID: string; connection: FluxerVoiceConnection; onDisconnect: () => void;
  state: { self_mute: boolean; self_deaf: boolean } };

function leave(driver: FluxerVoiceDriver, guildID: string, channelID: string): void {
  if (driver.leaveChannel) driver.leaveChannel(channelID); else driver.leave(guildID);
}

/** Loads the official voice package only when a native voice channel is joined. */
export class FluxerVoice extends EventEmitter<{ voiceError: [error: Error, guildID: string]; voiceEvent: [event: Readonly<VoiceEvent>] }> implements NativeVoice {
  private driver?: Promise<FluxerVoiceDriver>;
  private readonly connections = new Map<string, Connection>();
  private readonly pending = new Map<string, { channelID: string; task: Promise<FluxerVoiceConnection> }>();
  private closed = false;
  private closeTask?: Promise<void>;
  constructor(private readonly client: Client, driver?: FluxerVoiceDriver) {
    super(); if (driver) this.driver = Promise.resolve(driver);
  }
  private getDriver(): Promise<FluxerVoiceDriver> {
    return this.driver ??= (async () => {
      const packageName: string = '@fluxerjs/voice';
      let voice: { getVoiceManager(client: Client): FluxerVoiceDriver };
      try { voice = await import(packageName) as typeof voice; }
      catch { throw new YuzuhaError('VOICE_DEPENDENCY', 'Instale @fluxerjs/voice para reproduzir áudio nativo no Fluxer.'); }
      return voice.getVoiceManager(this.client);
    })();
  }
  get size(): number { return this.connections.size; }
  subscribe(listener: (event: Readonly<VoiceEvent>) => void): () => void {
    if (this.closed) return () => {};
    this.on('voiceEvent', listener);
    return () => { this.off('voiceEvent', listener); };
  }
  channelID(guildID: string): string | undefined { return this.connections.get(guildID)?.channelID; }
  async updateVoiceState(guildID: string, partial: { self_mute?: boolean; self_deaf?: boolean }): Promise<void> {
    this.connection(guildID);
    const driver = await this.getDriver();
    if (!driver.updateVoiceState) throw new YuzuhaError('VOICE_UNSUPPORTED', 'O driver não permite atualizar o estado de voz.');
    this.connection(guildID);
    const entry = this.connections.get(guildID)!;
    const state = { self_mute: partial.self_mute ?? entry.state.self_mute,
      self_deaf: partial.self_deaf ?? entry.state.self_deaf };
    driver.updateVoiceState(entry.channelID, state);
    entry.state = state;
  }
  get(guildID: string): FluxerVoiceConnection | undefined { return this.connections.get(guildID)?.connection; }
  async join(channelID: string, options: { guildID?: string } = {}): Promise<FluxerVoiceConnection> {
    if (this.closed) throw new YuzuhaError('VOICE_CLOSED', 'A voz está encerrada.');
    const channel = await this.client.channels.fetch(channelID);
    if (!channel?.isVoice()) throw new YuzuhaError('VOICE_CHANNEL', 'O canal informado não é um canal de voz.');
    if (options.guildID !== undefined && channel.guildId !== options.guildID) throw new YuzuhaError('VOICE_GUILD', 'O canal de voz pertence a outro servidor.');
    if (this.closed) throw new YuzuhaError('VOICE_CLOSED', 'A voz está encerrada.');
    const existing = this.connections.get(channel.guildId);
    if (existing) {
      if (existing.channelID !== channelID) throw new YuzuhaError('VOICE_CHANNEL', 'Saia do canal atual antes de conectar a outro canal no mesmo servidor.');
      return existing.connection;
    }
    const pending = this.pending.get(channel.guildId);
    if (pending) {
      if (pending.channelID !== channelID) throw new YuzuhaError('VOICE_CHANNEL', 'Já há uma conexão de voz pendente neste servidor.');
      return pending.task;
    }
    const task = (async () => {
      const driver = await this.getDriver();
      if (this.closed) throw new YuzuhaError('VOICE_CLOSED', 'A voz está encerrada.');
      const publish = (name: VoiceEventName, userID: string | null = null, errorCode: string | null = null) => {
        if (!this.closed) this.emit('voiceEvent', Object.freeze({ name, guildID: channel.guildId, channelID, userID,
          errorCode, errorMessage: name === 'voiceError' ? 'Falha na conexão de voz.' : null }));
      };
      const onError = (error: Error) => {
        const code = (error as { code?: unknown })?.code;
        publish(voiceSDKEvents.error, null, typeof code === 'string' && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE'].includes(code) ? code : 'VOICE_STATE');
        this.emit('voiceError', error, channel.guildId);
      };
      const connection = await driver.join(channel).catch(error => { onError(error); throw error; });
      if (this.closed) { leave(driver, channel.guildId, channelID); throw new YuzuhaError('VOICE_CLOSED', 'A voz foi encerrada durante a conexão.'); }
      const onReady = () => publish(voiceSDKEvents.ready);
      const onServerLeave = () => publish(voiceSDKEvents.serverLeave);
      let speakerWindow = performance.now(), speakerCount = 0;
      const speaker = (name: 'voiceSpeakerStart' | 'voiceSpeakerStop', payload: { participantId: string }) => {
        if (typeof payload?.participantId !== 'string' || !/^\d{1,128}$/.test(payload.participantId)) return;
        const now = performance.now();
        if (now - speakerWindow >= 1000) { speakerWindow = now; speakerCount = 0; }
        if (speakerCount++ >= 20) return;
        publish(name, payload.participantId);
      };
      const onSpeakerStart = (payload: { participantId: string }) => speaker(voiceSDKEvents.speakerStart, payload);
      const onSpeakerStop = (payload: { participantId: string }) => speaker(voiceSDKEvents.speakerStop, payload);
      const onDisconnect = () => {
        if (this.connections.get(channel.guildId)?.connection !== connection) return;
        publish(voiceSDKEvents.disconnect);
        if (this.connections.get(channel.guildId)?.connection === connection) this.connections.delete(channel.guildId);
        connection.off('error', onError); connection.off('disconnect', onDisconnect);
        connection.off('ready', onReady);
        if (this.closed) connection.off('serverLeave', onServerLeave);
        else setImmediate(() => connection.off('serverLeave', onServerLeave));
        connection.off('speakerStart', onSpeakerStart); connection.off('speakerStop', onSpeakerStop);
      };
      connection.on('error', onError);
      connection.on('disconnect', onDisconnect);
      connection.on('ready', onReady); connection.on('serverLeave', onServerLeave);
      connection.on('speakerStart', onSpeakerStart); connection.on('speakerStop', onSpeakerStop);
      this.connections.set(channel.guildId, { channelID, connection, onDisconnect, state: { self_mute: false, self_deaf: false } });
      onReady();
      return connection;
    })();
    this.pending.set(channel.guildId, { channelID, task });
    try { return await task; }
    finally { if (this.pending.get(channel.guildId)?.task === task) this.pending.delete(channel.guildId); }
  }
  private connection(guildID: string): FluxerVoiceConnection {
    if (this.closed) throw new YuzuhaError('VOICE_CLOSED', 'A voz está encerrada.');
    const connection = this.get(guildID);
    if (!connection) throw new YuzuhaError('VOICE_NOT_CONNECTED', 'Entre em um canal de voz antes de reproduzir áudio.');
    return connection;
  }
  async play(guildID: string, source: string | NodeJS.ReadableStream): Promise<void> {
    const connection = this.connection(guildID);
    let setupError: Error | undefined;
    const capture = (error: Error) => { setupError = error; };
    connection.on('error', capture);
    try { await connection.play(source); if (setupError) throw setupError; }
    finally { connection.off('error', capture); }
  }
  stop(guildID: string): void {
    const connection = this.connection(guildID);
    try { connection.stop(); } finally { connection.stopVideo?.(); }
  }
  setVolume(guildID: string, volume: number): void {
    const connection = this.connection(guildID);
    if (!connection.setVolume) throw new YuzuhaError('VOICE_UNSUPPORTED', 'Esta conexão de voz não fornece controle de volume.');
    if (!Number.isSafeInteger(volume) || volume < 0 || volume > 200) throw new YuzuhaError('VOICE_VOLUME', 'Volume nativo deve ser inteiro entre 0 e 200.');
    connection.setVolume(volume);
  }
  async leave(guildID: string): Promise<boolean> {
    await this.pending.get(guildID)?.task.catch(() => {});
    const entry = this.connections.get(guildID); if (!entry) return false;
    const driver = await this.getDriver();
    try { try { entry.connection.stop(); } finally { leave(driver, guildID, entry.channelID); } }
    finally { entry.onDisconnect(); }
    return true;
  }
  close(): Promise<void> {
    if (this.closeTask) return this.closeTask;
    this.closed = true;
    this.removeAllListeners('voiceEvent');
    this.closeTask = (async () => {
      await Promise.allSettled([...this.pending.values()].map(entry => entry.task));
      const results = await Promise.allSettled([...this.connections.keys()].map(guildID => this.leave(guildID)));
      this.removeAllListeners();
      const failures = results.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
      if (failures.length) throw new AggregateError(failures.map(item => item.reason), 'Falha ao encerrar a voz do Fluxer.');
    })();
    return this.closeTask;
  }
}
