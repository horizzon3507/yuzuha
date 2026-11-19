import type { ClientEvents } from '@fluxerjs/core';
import type { EventData, ScriptEventData, ScriptEventName } from '../domain/events.js';
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
export const scriptEventNames = [
  'ready', 'resumed', 'error', 'shardReady', 'shardResumed', 'shardDisconnect', 'shardReconnecting', 'shardError',
  'shardingRequired', 'messageCreate', 'messageUpdate', 'messageDelete', 'messageDeleteBulk', 'messageReactionAdd',
  'messageReactionAddMany', 'messageReactionRemove', 'messageReactionRemoveAll', 'messageReactionRemoveEmoji',
  'guildCreate', 'guildAvailable', 'guildUnavailable', 'guildUpdate', 'guildDelete', 'guildCountsUpdate',
  'guildAuditLogEntryCreate', 'channelCreate', 'channelUpdate', 'channelDelete', 'channelPinsUpdate',
  'channelRecipientAdd', 'channelRecipientRemove', 'channelMemberCountsUpdate', 'threadCreate', 'threadUpdate',
  'threadDelete', 'threadListSync', 'threadMemberUpdate', 'threadMembersUpdate', 'threadMemberListUpdate',
  'forumUnreads', 'guildMemberAdd', 'guildMemberUpdate', 'guildMemberRemove', 'guildMembersChunk', 'guildBanAdd',
  'guildBanRemove', 'guildEmojisUpdate', 'guildStickersUpdate', 'guildRoleCreate', 'guildRoleUpdate',
  'guildRoleDelete', 'voiceStateUpdate', 'voiceStateAck', 'voiceServerUpdate', 'entranceSoundPlay', 'voiceStatesSync',
  'inviteCreate', 'inviteDelete', 'typingStart', 'userUpdate', 'userConnectionsUpdate', 'presenceUpdate',
  'presenceUpdateBulk', 'webhooksUpdate',
] as const satisfies readonly ScriptEventName[];

/** Falha a compilação se um evento seguro do SDK ficar sem adaptação de script. */
export type MissingScriptEvents = Exclude<ScriptEventName, typeof scriptEventNames[number]>;
const scriptEventsComplete: [MissingScriptEvents] extends [never] ? true : never = true;
void scriptEventsComplete;

export function validateScriptEvent(value: ScriptEventDefinition): void {
  if (!(scriptEventNames as readonly string[]).includes(value.event) || typeof value.code !== 'string'
    || (value.once !== undefined && typeof value.once !== 'boolean')
    || (value.ignoreBots !== undefined && typeof value.ignoreBots !== 'boolean')
    || [value.channelID, value.actorID].some(id => id !== undefined && (typeof id !== 'string' || !/^\d+$/.test(id)))) {
    throw new YuzuhaError('SCRIPT_EVENT', 'Evento de script ou opções inválidos.');
  }
}

export function adaptScriptEvent<K extends ScriptEventName>(name: K, args: unknown[]): { event: EventData<K> & ScriptEventData; message?: IncomingMessage } {
  return adaptClientEvent(name, args as ClientEvents[K]);
}
