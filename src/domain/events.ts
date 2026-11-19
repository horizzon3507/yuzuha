import type { ClientEventName } from '@fluxerjs/core';

/** Eventos do SDK acessíveis por `bot.scriptEvent`; `debug` e WebAuthn ficam só no modo nativo. */

export type EventValue = string | number | boolean | null | readonly EventValue[] | { readonly [key: string]: EventValue };
export type EventPayload = { readonly [key: string]: EventValue };
export const voiceSDKEvents = {
  ready: 'voiceReady', disconnect: 'voiceDisconnect', error: 'voiceError', serverLeave: 'voiceServerLeave',
  speakerStart: 'voiceSpeakerStart', speakerStop: 'voiceSpeakerStop',
} as const;
export type VoiceEventName = typeof voiceSDKEvents[keyof typeof voiceSDKEvents];
export function isVoiceEventName(name: string): name is VoiceEventName {
  return Object.values(voiceSDKEvents).some(event => event === name);
}
export type FrameworkEventName = ClientEventName | VoiceEventName;
export interface VoiceEvent {
  name: VoiceEventName;
  guildID: string;
  channelID: string;
  userID: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}
export type ScriptEventName = Exclude<ClientEventName, 'debug' | 'webauthnCredentialsUpdate'> | VoiceEventName;

export interface EventData<K extends FrameworkEventName = FrameworkEventName> {
  name: K;
  guildID: string | null;
  channelID: string | null;
  userID: string | null;
  userName: string | null;
  userBot: boolean;
  messageID: string | null;
  content: string | null;
  oldContent: string | null;
  emoji: string | null;
  /** Payload normalizado e redigido lido por `$eventData`. */
  data?: EventPayload;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export type ScriptEventData = EventData;
