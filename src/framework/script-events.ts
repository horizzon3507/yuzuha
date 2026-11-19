import type { ClientEvents } from '@fluxerjs/core';
import type { EventData, ScriptEventData, ScriptEventName, VoiceEvent, VoiceEventName } from '../domain/events.js';
import { isVoiceEventName } from '../domain/events.js';
import type { IncomingMessage } from '../domain/messages.js';
import type { HttpPolicy } from '../services/http.js';
import { adaptClientEvent } from './events.js';
import { YuzuhaError } from '../shared/errors.js';

export interface ScriptEventDefinition {
  event: ScriptEventName;
  code: string;
  once?: boolean;
  channelID?: string;
  actorID?: string;
  ignoreBots?: boolean;
  http?: HttpPolicy;
}
export const scriptEventNames: readonly ScriptEventName[] = ['guildMemberAdd', 'guildMemberRemove', 'messageUpdate', 'messageDelete', 'messageReactionAdd', 'messageReactionRemove',
  'voiceReady', 'voiceDisconnect', 'voiceError', 'voiceServerLeave', 'voiceSpeakerStart', 'voiceSpeakerStop'];

export function validateScriptEvent(value: ScriptEventDefinition): void {
  if (!scriptEventNames.includes(value.event) || typeof value.code !== 'string'
    || (value.once !== undefined && typeof value.once !== 'boolean')
    || (value.ignoreBots !== undefined && typeof value.ignoreBots !== 'boolean')
    || [value.channelID, value.actorID].some(id => id !== undefined && (typeof id !== 'string' || !/^\d+$/.test(id)))) {
    throw new YuzuhaError('SCRIPT_EVENT', 'Evento de script ou opções inválidos.');
  }
}

export function adaptScriptEvent<K extends ScriptEventName>(name: K, args: unknown[]): { event: EventData<K> & ScriptEventData; message?: IncomingMessage } {
  if (isVoiceEventName(name)) {
    const value = args[0] as Readonly<VoiceEvent>;
    return { event: { name, guildID: value.guildID, channelID: value.channelID, userID: value.userID,
      userName: null, userBot: false, messageID: null, content: null, oldContent: null, emoji: null,
      errorCode: value.errorCode, errorMessage: value.errorMessage } };
  }
  return adaptClientEvent(name as Exclude<K, VoiceEventName>, args as ClientEvents[Exclude<K, VoiceEventName>]) as { event: EventData<K> & ScriptEventData; message?: IncomingMessage };
}
