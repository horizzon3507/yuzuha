import { Events } from '@fluxerjs/core';
import type { Client, ClientEventName, ClientEvents, Message, PartialMessage, ReactionEmojiPayload } from '@fluxerjs/core';
import { YuzuhaError } from '../errors.js';
import type { EventData, FrameworkEventName } from '../domain/events.js';
import type { NativeVoice } from '../ports/voice.js';
import { isVoiceEventName } from '../domain/events.js';
import { eventPayload, freezePayload } from './event-payloads.js';
import type { IncomingMessage } from '../domain/messages.js';
import type { EventContext } from '../commands/event-context.js';
import { incoming } from '../infrastructure/fluxer/messages.js';
import type { HttpPolicy } from '../services/http.js';

export type NativeListener<K extends ClientEventName> = (...args: ClientEvents[K]) => unknown | Promise<unknown>;
export interface EventDefinition<K extends ClientEventName> {
  event: K;
  once?: boolean;
  run: NativeListener<K>;
}
export interface NativeEvent {
  readonly event: FrameworkEventName;
  readonly once: boolean;
  readonly invoke: (args: unknown[]) => unknown | Promise<unknown>;
}
export interface ContextEventDefinition<K extends ClientEventName = ClientEventName> {
  event: K;
  once?: boolean;
  channelID?: string;
  actorID?: string;
  ignoreBots?: boolean;
  http?: HttpPolicy;
  run: (ctx: EventContext<K>, ...args: ClientEvents[K]) => unknown | Promise<unknown>;
}

const knownEvents = new Set<string>(Object.values(Events));

export interface AdaptedClientEvent<K extends ClientEventName = ClientEventName> {
  event: EventData<K>;
  message?: IncomingMessage;
}

function formatReactionEmoji(emoji: ReactionEmojiPayload | null | undefined): string | null {
  if (!emoji) return null;
  return emoji.id ? `${emoji.name ?? ''}:${emoji.id}` : emoji.name ?? null;
}

function toIncomingMessage(candidate: Message | PartialMessage | null | undefined): IncomingMessage | undefined {
  if (!candidate || ('partial' in candidate && candidate.partial) || !candidate.author) return undefined;
  if (Array.isArray((candidate as Message).mentions)) return incoming(candidate as Message);
  return {
    id: candidate.id,
    content: candidate.content ?? '',
    channelID: candidate.channelId,
    guildID: candidate.guildId ?? undefined,
    authorID: candidate.author.id,
    authorName: candidate.author.username ?? '',
    authorBot: Boolean(candidate.author.bot),
    mentions: [],
    raw: candidate,
  };
}

function channelGuildId(channel: unknown): string | null {
  if (!channel || typeof channel !== 'object' || !('guildId' in channel)) return null;
  const guildId = (channel as { guildId?: unknown }).guildId;
  return typeof guildId === 'string' ? guildId : null;
}

export function adaptClientEvent<K extends ClientEventName>(name: K, args: Readonly<ClientEvents[K]>): AdaptedClientEvent<K> {
  const event: EventData<K> = {
    name,
    guildID: null,
    channelID: null,
    userID: null,
    userName: null,
    userBot: false,
    messageID: null,
    content: null,
    oldContent: null,
    emoji: null,
  };
  const raw: readonly unknown[] = args;
  let message: IncomingMessage | undefined;

  switch (name) {
    case 'guildMemberAdd':
    case 'guildMemberRemove': {
      const [member] = raw as Readonly<ClientEvents['guildMemberRemove']>;
      if (member) {
        Object.assign(event, {
          guildID: member.guild?.id ?? ('guildId' in member ? member.guildId : null) ?? null,
          userID: member.id ?? member.user?.id ?? null,
          userName: member.user?.username ?? null,
          userBot: Boolean(member.user?.bot),
        });
      }
      break;
    }
    case 'guildMemberUpdate': {
      const [oldMember, newMember] = raw as Readonly<ClientEvents['guildMemberUpdate']>;
      const member = newMember ?? oldMember;
      if (member) {
        Object.assign(event, {
          guildID: member.guild?.id ?? null,
          userID: member.id ?? member.user?.id ?? null,
          userName: member.user?.username ?? null,
          userBot: Boolean(member.user?.bot),
        });
      }
      break;
    }
    case 'messageCreate': {
      const [msg] = raw as Readonly<ClientEvents['messageCreate']>;
      if (msg) {
        Object.assign(event, {
          guildID: msg.guildId ?? null,
          channelID: msg.channelId ?? null,
          messageID: msg.id ?? null,
          userID: msg.author?.id ?? null,
          userName: msg.author?.username ?? null,
          userBot: Boolean(msg.author?.bot),
          content: msg.content ?? null,
        });
        message = toIncomingMessage(msg);
      }
      break;
    }
    case 'messageUpdate':
    case 'messageDelete': {
      const current = (name === 'messageUpdate' ? raw[1] : raw[0]) as Message | PartialMessage | undefined;
      const previous = name === 'messageUpdate' ? raw[0] as Message | null | undefined : null;
      if (current) {
        Object.assign(event, {
          guildID: current.guildId ?? null,
          channelID: current.channelId ?? null,
          messageID: current.id ?? null,
          userID: current.author?.id ?? ('authorId' in current ? current.authorId : null) ?? null,
          userName: current.author?.username ?? null,
          userBot: current.author?.bot ?? false,
          content: current.content ?? null,
          oldContent: previous?.content ?? null,
        });
        if (name === 'messageUpdate') message = toIncomingMessage(current);
      }
      break;
    }
    case 'messageDeleteBulk': {
      const [payload] = raw as Readonly<ClientEvents['messageDeleteBulk']>;
      if (payload) {
        Object.assign(event, {
          guildID: payload.guildId ?? channelGuildId(payload.channel),
          channelID: payload.channelId ?? null,
        });
      }
      break;
    }
    case 'messageReactionAdd':
    case 'messageReactionRemove': {
      const [payload] = raw as Readonly<ClientEvents['messageReactionAdd']>;
      if (payload) {
        Object.assign(event, {
          guildID: payload.reaction?.guildId ?? payload.message?.guildId ?? payload.member?.guild?.id
            ?? channelGuildId(payload.channel),
          channelID: payload.channelId ?? null,
          messageID: payload.messageId ?? null,
          userID: payload.userId ?? payload.user?.id ?? null,
          userName: payload.user?.username ?? null,
          userBot: payload.user?.bot ?? false,
          content: payload.message?.content ?? null,
          emoji: formatReactionEmoji(payload.emoji),
        });
        if (payload.message) message = toIncomingMessage(payload.message);
      }
      break;
    }
    case 'messageReactionAddMany': {
      const [payload] = raw as Readonly<ClientEvents['messageReactionAddMany']>;
      if (payload) {
        Object.assign(event, {
          guildID: payload.guildId ?? payload.message?.guildId ?? channelGuildId(payload.channel),
          channelID: payload.channelId ?? null,
          messageID: payload.messageId ?? null,
          content: payload.message?.content ?? null,
        });
        if (payload.message) message = toIncomingMessage(payload.message);
      }
      break;
    }
    case 'messageReactionRemoveAll': {
      const [payload] = raw as Readonly<ClientEvents['messageReactionRemoveAll']>;
      if (payload) {
        Object.assign(event, {
          guildID: payload.guildId ?? payload.message?.guildId ?? channelGuildId(payload.channel),
          channelID: payload.channelId ?? null,
          messageID: payload.messageId ?? null,
          content: payload.message?.content ?? null,
        });
        if (payload.message) message = toIncomingMessage(payload.message);
      }
      break;
    }
    case 'messageReactionRemoveEmoji': {
      const [payload] = raw as Readonly<ClientEvents['messageReactionRemoveEmoji']>;
      if (payload) {
        Object.assign(event, {
          guildID: payload.guildId ?? payload.message?.guildId ?? channelGuildId(payload.channel),
          channelID: payload.channelId ?? null,
          messageID: payload.messageId ?? null,
          content: payload.message?.content ?? null,
          emoji: formatReactionEmoji(payload.emoji),
        });
        if (payload.message) message = toIncomingMessage(payload.message);
      }
      break;
    }
    case 'guildCreate':
    case 'guildAvailable':
    case 'guildUnavailable':
    case 'guildDelete': {
      const [guild] = raw as Readonly<ClientEvents['guildCreate']>;
      if (guild) event.guildID = guild.id ?? null;
      break;
    }
    case 'guildUpdate': {
      const [oldGuild, newGuild] = raw as Readonly<ClientEvents['guildUpdate']>;
      const guild = newGuild ?? oldGuild;
      if (guild) event.guildID = guild.id ?? null;
      break;
    }
    case 'channelCreate':
    case 'channelDelete': {
      const [channel] = raw as Readonly<ClientEvents['channelCreate']>;
      if (channel) {
        event.channelID = channel.id ?? null;
        event.guildID = channelGuildId(channel);
      }
      break;
    }
    case 'channelUpdate': {
      const [oldChannel, newChannel] = raw as Readonly<ClientEvents['channelUpdate']>;
      const channel = newChannel ?? oldChannel;
      if (channel) {
        event.channelID = channel.id ?? null;
        event.guildID = channelGuildId(channel);
      }
      break;
    }
    case 'threadCreate':
    case 'threadDelete': {
      const [thread] = raw as Readonly<ClientEvents['threadDelete']>;
      if (thread) {
        event.channelID = thread.id ?? null;
        event.guildID = channelGuildId(thread);
        event.userID = 'ownerId' in thread && typeof thread.ownerId === 'string' ? thread.ownerId : null;
      }
      break;
    }
    case 'threadUpdate': {
      const [oldThread, newThread] = raw as Readonly<ClientEvents['threadUpdate']>;
      const thread = newThread ?? oldThread;
      if (thread) {
        event.channelID = thread.id ?? null;
        event.guildID = channelGuildId(thread);
        event.userID = 'ownerId' in thread && typeof thread.ownerId === 'string' ? thread.ownerId : null;
      }
      break;
    }
    case 'threadListSync': {
      const [payload] = raw as Readonly<ClientEvents['threadListSync']>;
      if (payload) {
        event.guildID = payload.guildId ?? null;
        event.channelID = payload.channelIds?.length === 1 ? payload.channelIds[0]! : null;
      }
      break;
    }
    case 'threadMemberUpdate': {
      const [member] = raw as Readonly<ClientEvents['threadMemberUpdate']>;
      if (member) {
        event.channelID = member.id ?? null;
        event.userID = member.userId ?? null;
      }
      break;
    }
    case 'threadMembersUpdate': {
      const [payload] = raw as Readonly<ClientEvents['threadMembersUpdate']>;
      if (payload) {
        event.guildID = payload.guildId ?? null;
        event.channelID = payload.id ?? null;
      }
      break;
    }
    case 'threadMemberListUpdate': {
      const [payload] = raw as Readonly<ClientEvents['threadMemberListUpdate']>;
      if (payload) {
        event.guildID = payload.guildId ?? null;
        event.channelID = payload.threadId ?? null;
      }
      break;
    }
    case 'forumUnreads': {
      const [payload] = raw as Readonly<ClientEvents['forumUnreads']>;
      if (payload) {
        event.guildID = payload.guildId ?? null;
        event.channelID = payload.channelId ?? null;
      }
      break;
    }
    case 'guildBanAdd':
    case 'guildBanRemove': {
      const [ban] = raw as Readonly<ClientEvents['guildBanAdd']>;
      if (ban) {
        Object.assign(event, {
          guildID: ban.guildId ?? null,
          userID: ban.user?.id ?? null,
          userName: ban.user?.username ?? null,
          userBot: Boolean(ban.user?.bot),
        });
      }
      break;
    }
    case 'guildRoleCreate': {
      const [role] = raw as Readonly<ClientEvents['guildRoleCreate']>;
      if (role) event.guildID = role.guildId ?? null;
      break;
    }
    case 'guildRoleUpdate': {
      const [oldRole, newRole] = raw as Readonly<ClientEvents['guildRoleUpdate']>;
      const role = newRole ?? oldRole;
      if (role) event.guildID = role.guildId ?? null;
      break;
    }
    case 'guildRoleDelete': {
      const [role, guildId] = raw as Readonly<ClientEvents['guildRoleDelete']>;
      event.guildID = (typeof guildId === 'string' ? guildId : null)
        ?? (role && typeof role === 'object' && 'guildId' in role && typeof role.guildId === 'string' ? role.guildId : null);
      break;
    }
    case 'guildEmojisUpdate':
    case 'guildStickersUpdate':
    case 'guildMembersChunk': {
      const [payload] = raw as Readonly<ClientEvents['guildEmojisUpdate']>;
      if (payload) event.guildID = payload.guildId ?? null;
      break;
    }
    case 'guildCountsUpdate': {
      const [payload] = raw as Readonly<ClientEvents['guildCountsUpdate']>;
      if (payload?.counts?.length === 1) event.guildID = payload.counts[0]!.guildId ?? null;
      break;
    }
    case 'channelMemberCountsUpdate': {
      const [payload] = raw as Readonly<ClientEvents['channelMemberCountsUpdate']>;
      if (payload?.counts?.length === 1) {
        event.guildID = payload.counts[0]!.guildId ?? null;
        event.channelID = payload.counts[0]!.channelId ?? null;
      }
      break;
    }
    case 'guildAuditLogEntryCreate': {
      const [payload] = raw as Readonly<ClientEvents['guildAuditLogEntryCreate']>;
      if (payload) {
        event.guildID = payload.guildId ?? null;
        event.userID = payload.userId ?? null;
      }
      break;
    }
    case 'voiceStateUpdate': {
      const [data] = raw as Readonly<ClientEvents['voiceStateUpdate']>;
      if (data) {
        Object.assign(event, {
          guildID: data.guild_id ?? data.member?.guild_id ?? null,
          channelID: data.channel_id ?? null,
          userID: data.user_id ?? data.member?.user?.id ?? null,
          userName: data.member?.user?.username ?? null,
          userBot: Boolean(data.member?.user?.bot),
        });
      }
      break;
    }
    case 'voiceStateAck': {
      const [data] = raw as Readonly<ClientEvents['voiceStateAck']>;
      if (data) {
        event.guildID = data.guild_id ?? data.canonical_state?.guild_id ?? null;
        event.channelID = data.channel_id ?? data.canonical_state?.channel_id ?? null;
        event.userID = data.canonical_state?.user_id ?? null;
      }
      break;
    }
    case 'voiceServerUpdate': {
      const [data] = raw as Readonly<ClientEvents['voiceServerUpdate']>;
      if (data) {
        event.guildID = data.guild_id ?? null;
        event.channelID = data.channel_id ?? null;
      }
      break;
    }
    case 'entranceSoundPlay': {
      const [data] = raw as Readonly<ClientEvents['entranceSoundPlay']>;
      if (data) {
        event.guildID = data.guild_id ?? null;
        event.channelID = data.channel_id ?? null;
        event.userID = data.user_id ?? null;
      }
      break;
    }
    case 'voiceStatesSync': {
      const [data] = raw as Readonly<ClientEvents['voiceStatesSync']>;
      if (data) event.guildID = data.guildId ?? null;
      break;
    }
    case 'channelPinsUpdate': {
      const [payload] = raw as Readonly<ClientEvents['channelPinsUpdate']>;
      if (payload) {
        event.guildID = payload.guildId ?? null;
        event.channelID = payload.channelId ?? null;
      }
      break;
    }
    case 'channelRecipientAdd':
    case 'channelRecipientRemove': {
      const [payload] = raw as Readonly<ClientEvents['channelRecipientAdd']>;
      if (payload) {
        Object.assign(event, {
          channelID: payload.channelId ?? null,
          userID: payload.user?.id ?? null,
          userName: payload.user?.username ?? null,
          userBot: Boolean(payload.user?.bot),
        });
      }
      break;
    }
    case 'inviteCreate': {
      const [invite] = raw as Readonly<ClientEvents['inviteCreate']>;
      if (invite) {
        Object.assign(event, {
          guildID: invite.guildSnapshot?.id ?? null,
          channelID: invite.channelSnapshot?.id ?? null,
          userID: invite.inviter?.id ?? null,
          userName: invite.inviter?.username ?? null,
          userBot: Boolean(invite.inviter?.bot),
        });
      }
      break;
    }
    case 'inviteDelete': {
      const [payload] = raw as Readonly<ClientEvents['inviteDelete']>;
      if (payload) {
        event.guildID = payload.guildId ?? null;
        event.channelID = payload.channelId ?? null;
      }
      break;
    }
    case 'typingStart': {
      const [payload] = raw as Readonly<ClientEvents['typingStart']>;
      if (payload) {
        event.guildID = payload.guildId ?? null;
        event.channelID = payload.channelId ?? null;
        event.userID = payload.userId ?? null;
      }
      break;
    }
    case 'userUpdate': {
      const [user] = raw as Readonly<ClientEvents['userUpdate']>;
      if (user) {
        Object.assign(event, {
          userID: user.id ?? null,
          userName: user.username ?? null,
          userBot: Boolean(user.bot),
        });
      }
      break;
    }
    case 'presenceUpdate': {
      const [payload] = raw as Readonly<ClientEvents['presenceUpdate']>;
      if (payload) {
        event.guildID = payload.guildId ?? null;
        event.userID = payload.userId ?? null;
      }
      break;
    }
    case 'presenceUpdateBulk': {
      const [payload] = raw as Readonly<ClientEvents['presenceUpdateBulk']>;
      if (payload) event.guildID = payload.guildId ?? null;
      break;
    }
    case 'webhooksUpdate': {
      const [payload] = raw as Readonly<ClientEvents['webhooksUpdate']>;
      if (payload) {
        event.guildID = payload.guildId ?? null;
        event.channelID = payload.channelId ?? null;
      }
      break;
    }
    default:
      break;
  }

  event.data = freezePayload(eventPayload(name, args as readonly unknown[]));
  return { event, ...(message ? { message } : {}) };
}

export function validateContextEvent(definition: ContextEventDefinition<ClientEventName>): void {
  if (!definition || typeof definition !== 'object'
    || !knownEvents.has(definition.event)
    || typeof definition.run !== 'function'
    || (definition.once !== undefined && typeof definition.once !== 'boolean')
    || (definition.ignoreBots !== undefined && typeof definition.ignoreBots !== 'boolean')
    || [definition.channelID, definition.actorID].some(id => id !== undefined && (typeof id !== 'string' || !/^\d+$/.test(id)))) {
    throw new YuzuhaError('EVENT', 'Evento com contexto ou opções inválidos.');
  }
}

export function defineContextEvent<K extends ClientEventName>(definition: ContextEventDefinition<K>): Readonly<ContextEventDefinition<K>> {
  validateContextEvent(definition as unknown as ContextEventDefinition<ClientEventName>);
  return Object.freeze({
    ...definition,
    ...(definition.http !== undefined ? { http: structuredClone(definition.http) } : {}),
  });
}

export function defineEvent<K extends ClientEventName>(definition: EventDefinition<K>): NativeEvent {
  if (!knownEvents.has(definition.event) || typeof definition.run !== 'function'
    || (definition.once !== undefined && typeof definition.once !== 'boolean')) {
    throw new YuzuhaError('EVENT', 'Evento, callback ou opção once inválidos.');
  }
  const run = definition.run;
  return Object.freeze({ event: definition.event, once: definition.once ?? false,
    invoke: (args: unknown[]) => run(...args as ClientEvents[K]),
  });
}

interface Binding { event: FrameworkEventName; identity: unknown; wrapper: (...args: unknown[]) => void }

export class NativeEvents {
  private readonly bindings = new Set<Binding>();
  private closed = false;
  private readonly unsubscribeVoice?: () => void;

  constructor(private client: Client, private readonly schedule: (work: () => unknown | Promise<unknown>, event: FrameworkEventName) => void, voice?: NativeVoice) {
    this.unsubscribeVoice = voice?.subscribe(event => {
      if (this.closed) return;
      for (const binding of [...this.bindings]) if (binding.event === event.name) binding.wrapper(event);
    });
  }

  rebind(nextClient: Client): void {
    if (this.client === nextClient) return;
    for (const binding of this.bindings) {
      if (isVoiceEventName(binding.event)) continue;
      this.client.off(binding.event, binding.wrapper);
      if (!this.closed) nextClient.on(binding.event, binding.wrapper);
    }
    this.client = nextClient;
  }

  validate(event: NativeEvent): void {
    if ((!knownEvents.has(event.event) && !isVoiceEventName(event.event)) || typeof event.invoke !== 'function' || typeof event.once !== 'boolean') {
      throw new YuzuhaError('EVENT', 'Use defineEvent para registrar eventos de um plugin.');
    }
  }

  add(event: NativeEvent, identity: unknown = event): () => void {
    if (this.closed) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
    this.validate(event);
    const binding: Binding = { event: event.event, identity, wrapper: (...args) => {
      if (event.once) this.remove(binding);
      this.schedule(() => event.invoke(args), event.event);
    } };
    this.bindings.add(binding);
    if (!isVoiceEventName(event.event)) this.client.on(event.event, binding.wrapper);
    return () => this.remove(binding);
  }

  off(event: ClientEventName, identity: unknown): void {
    for (const binding of this.bindings) if (binding.event === event && binding.identity === identity) this.remove(binding);
  }

  private remove(binding: Binding): void {
    if (!isVoiceEventName(binding.event)) this.client.off(binding.event, binding.wrapper);
    this.bindings.delete(binding);
  }

  close(): void { this.closed = true; this.unsubscribeVoice?.(); for (const binding of this.bindings) this.remove(binding); }
}
