import { EventEmitter } from 'node:events';
import type { Client } from '@fluxerjs/core';
import { YuzuhaError } from '../../shared/errors.js';
import type { FluxerVoiceConnection, FluxerVoiceDriver, NativeVoice } from '../../ports/voice.js';
type Connection = { channelID: string; connection: FluxerVoiceConnection; onError: (error: Error) => void; onDisconnect: () => void };

function leave(driver: FluxerVoiceDriver, guildID: string, channelID: string): void {
  if (driver.leaveChannel) driver.leaveChannel(channelID); else driver.leave(guildID);
}

/** Loads the official voice package only when a native voice channel is joined. */
export class FluxerVoice extends EventEmitter<{ voiceError: [error: Error, guildID: string] }> implements NativeVoice {
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
      const connection = await driver.join(channel);
      if (this.closed) { leave(driver, channel.guildId, channelID); throw new YuzuhaError('VOICE_CLOSED', 'A voz foi encerrada durante a conexão.'); }
      const onError = (error: Error) => { this.emit('voiceError', error, channel.guildId); };
      const onDisconnect = () => {
        if (this.connections.get(channel.guildId)?.connection === connection) this.connections.delete(channel.guildId);
        connection.off('error', onError); connection.off('disconnect', onDisconnect);
      };
      connection.on('error', onError);
      connection.on('disconnect', onDisconnect);
      this.connections.set(channel.guildId, { channelID, connection, onError, onDisconnect });
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
  stop(guildID: string): void { this.connection(guildID).stop(); }
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
    finally { entry.connection.off('error', entry.onError); entry.connection.off('disconnect', entry.onDisconnect); this.connections.delete(guildID); }
    return true;
  }
  close(): Promise<void> {
    if (this.closeTask) return this.closeTask;
    this.closed = true;
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
