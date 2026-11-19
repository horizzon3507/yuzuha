import { randomUUID } from 'node:crypto';
import type { ClientEventName, ClientEvents } from '@fluxerjs/core';
import { CommandContext } from './context.js';
import type { ContextOptions } from './context.js';
import type { EventData, FrameworkEventName, VoiceEvent } from '../domain/events.js';
import type { IncomingMessage } from '../domain/messages.js';
import type { HttpPolicy } from '../services/http.js';

type EventArgs<K extends FrameworkEventName> = K extends ClientEventName ? ClientEvents[K] : [Readonly<VoiceEvent>];

export interface EventContextOptions<K extends FrameworkEventName = FrameworkEventName>
  extends Omit<ContextOptions, 'message' | 'command' | 'event' | 'messageAvailable' | 'actor'> {
  event: EventData<K>;
  eventArgs?: Readonly<EventArgs<K>>;
  message?: IncomingMessage;
  channelID?: string;
  actorID?: string;
  policy?: HttpPolicy;
}

export class EventContext<K extends FrameworkEventName = FrameworkEventName> extends CommandContext {
  declare readonly event: Readonly<EventData<K>>;
  readonly eventArgs: Readonly<EventArgs<K>>;
  private readonly outputChannel?: string;
  constructor(options: EventContextOptions<K>) {
    const event = options.event;
    super({ ...options, command: { name: `event:${event.name}`, http: options.policy }, event, messageAvailable: options.message !== undefined,
      actor: { guildID: event.guildID ?? '', authorID: options.actorID ?? event.userID ?? '' },
      message: options.message ?? { id: `event-${randomUUID()}`, content: '', authorID: event.userID ?? '',
        authorName: event.userName ?? '', authorBot: event.userBot, channelID: options.channelID ?? event.channelID ?? '',
        guildID: event.guildID ?? undefined, mentions: [] } });
    this.eventArgs = Object.freeze([...(options.eventArgs ?? [])]) as unknown as Readonly<EventArgs<K>>;
    this.outputChannel = options.channelID;
  }
  override get channelID(): string { return this.outputChannel ?? super.channelID; }
}
