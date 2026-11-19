import type { ClientEventName } from '@fluxerjs/core';

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
export type ScriptEventName = 'guildMemberAdd' | 'guildMemberRemove' | 'messageUpdate' | 'messageDelete' | 'messageReactionAdd' | 'messageReactionRemove' | VoiceEventName;

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
  errorCode?: string | null;
  errorMessage?: string | null;
}

export type ScriptEventData = EventData;
