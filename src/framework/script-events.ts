import type { ClientEvents, Message, PartialMessage } from '@fluxerjs/core';
import type { ScriptEventData, ScriptEventName } from '../domain/events.js';
import type { IncomingMessage } from '../domain/messages.js';
import type { HttpPolicy } from '../services/http.js';
import { incoming } from '../infrastructure/fluxer/messages.js';
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
export const scriptEventNames: readonly ScriptEventName[] = ['guildMemberAdd', 'guildMemberRemove', 'messageUpdate', 'messageDelete', 'messageReactionAdd', 'messageReactionRemove'];

export function validateScriptEvent(value: ScriptEventDefinition): void {
  if (!scriptEventNames.includes(value.event) || typeof value.code !== 'string'
    || (value.once !== undefined && typeof value.once !== 'boolean')
    || (value.ignoreBots !== undefined && typeof value.ignoreBots !== 'boolean')
    || [value.channelID, value.actorID].some(id => id !== undefined && (typeof id !== 'string' || !/^\d+$/.test(id)))) {
    throw new YuzuhaError('SCRIPT_EVENT', 'Evento de script ou opções inválidos.');
  }
}

export function adaptScriptEvent(name: ScriptEventName, args: unknown[]): { event: ScriptEventData; message?: IncomingMessage } {
  const event: ScriptEventData = { name, guildID: null, channelID: null, userID: null, userName: null,
    userBot: false, messageID: null, content: null, oldContent: null, emoji: null };
  let message: IncomingMessage | undefined;
  if (name === 'guildMemberAdd' || name === 'guildMemberRemove') {
    const member = (args as ClientEvents['guildMemberRemove'])[0];
    Object.assign(event, { guildID: member.guild.id, userID: member.id, userName: member.user.username, userBot: member.user.bot });
  } else if (name === 'messageUpdate' || name === 'messageDelete') {
    const current = (name === 'messageUpdate' ? args[1] : args[0]) as Message | PartialMessage;
    const previous = name === 'messageUpdate' ? args[0] as Message | null : null;
    Object.assign(event, { guildID: current.guildId, channelID: current.channelId, messageID: current.id,
      userID: current.author?.id ?? ('authorId' in current ? current.authorId : null),
      userName: current.author?.username ?? null, userBot: current.author?.bot ?? false,
      content: current.content, oldContent: previous?.content ?? null });
    if (name === 'messageUpdate' && !('partial' in current && current.partial)) message = incoming(current as Message);
  } else {
    const payload = (args as ClientEvents['messageReactionAdd'])[0];
    Object.assign(event, { guildID: payload.reaction.guildId ?? payload.message?.guildId ?? payload.member?.guild.id
      ?? (payload.channel && 'guildId' in payload.channel ? payload.channel.guildId : null),
      channelID: payload.channelId, messageID: payload.messageId, userID: payload.userId,
      userName: payload.user.username, userBot: payload.user.bot, content: payload.message?.content ?? null,
      emoji: payload.emoji.id ? `${payload.emoji.name ?? ''}:${payload.emoji.id}` : payload.emoji.name ?? null });
    if (payload.message) message = incoming(payload.message);
  }
  return { event, ...(message ? { message } : {}) };
}
