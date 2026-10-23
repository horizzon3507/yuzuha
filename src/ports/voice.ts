import type { VoiceChannel } from '@fluxerjs/core';

export interface FluxerVoiceConnection {
  readonly playing: boolean;
  play(source: string | NodeJS.ReadableStream): Promise<void>;
  stop(): void;
  setVolume?(volume: number): void;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'disconnect', listener: () => void): unknown;
  off(event: 'error', listener: (error: Error) => void): unknown;
  off(event: 'disconnect', listener: () => void): unknown;
}
export interface FluxerVoiceDriver {
  join(channel: VoiceChannel): Promise<FluxerVoiceConnection>;
  leave(guildID: string): void;
  leaveChannel?(channelID: string): void;
}
export interface NativeVoice {
  join(channelID: string, options?: { guildID?: string }): Promise<FluxerVoiceConnection>;
  get(guildID: string): FluxerVoiceConnection | undefined;
  play(guildID: string, source: string | NodeJS.ReadableStream): Promise<void>;
  stop(guildID: string): void;
  setVolume(guildID: string, volume: number): void;
  leave(guildID: string): Promise<boolean>;
  close(): Promise<void>;
}
