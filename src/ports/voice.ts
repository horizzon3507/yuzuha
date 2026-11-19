import type { VoiceChannel } from '@fluxerjs/core';
import type { VoiceEvent } from '../domain/events.js';

export interface FluxerVoiceConnection {
  readonly playing: boolean;
  readonly playingVideo?: boolean;
  isConnected?(): boolean;
  getVolume?(): number;
  stopVideo?(): void;
  play(source: string | NodeJS.ReadableStream): Promise<void>;
  stop(): void;
  setVolume?(volume: number): void;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'disconnect', listener: () => void): unknown;
  off(event: 'error', listener: (error: Error) => void): unknown;
  off(event: 'disconnect', listener: () => void): unknown;
  on(event: 'ready' | 'serverLeave', listener: () => void): unknown;
  off(event: 'ready' | 'serverLeave', listener: () => void): unknown;
  on(event: 'speakerStart' | 'speakerStop', listener: (payload: { participantId: string }) => void): unknown;
  off(event: 'speakerStart' | 'speakerStop', listener: (payload: { participantId: string }) => void): unknown;
}
export interface FluxerVoiceDriver {
  join(channel: VoiceChannel): Promise<FluxerVoiceConnection>;
  leave(guildID: string): void;
  leaveChannel?(channelID: string): void;
  updateVoiceState?(channelID: string, partial: { self_mute?: boolean; self_deaf?: boolean }): void;
}
export interface NativeVoice {
  subscribe(listener: (event: Readonly<VoiceEvent>) => void): () => void;
  channelID(guildID: string): string | undefined;
  updateVoiceState(guildID: string, partial: { self_mute?: boolean; self_deaf?: boolean }): Promise<void>;
  join(channelID: string, options?: { guildID?: string }): Promise<FluxerVoiceConnection>;
  get(guildID: string): FluxerVoiceConnection | undefined;
  play(guildID: string, source: string | NodeJS.ReadableStream): Promise<void>;
  stop(guildID: string): void;
  setVolume(guildID: string, volume: number): void;
  leave(guildID: string): Promise<boolean>;
  close(): Promise<void>;
}
