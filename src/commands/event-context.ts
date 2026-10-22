import { randomUUID } from 'node:crypto';
import { CommandContext } from './context.js';
import type { ContextOptions } from './context.js';
import type { ScriptEventData } from '../domain/events.js';
import type { IncomingMessage } from '../domain/messages.js';
import type { HttpPolicy } from '../services/http.js';

export interface EventContextOptions extends Omit<ContextOptions, 'message' | 'command' | 'event' | 'messageAvailable' | 'actor'> {
  event: ScriptEventData;
  message?: IncomingMessage;
  channelID?: string;
  actorID?: string;
  policy?: HttpPolicy;
}

export class EventContext extends CommandContext {
  declare readonly event: Readonly<ScriptEventData>;
  private readonly outputChannel?: string;
  constructor(options: EventContextOptions) {
    const event = options.event;
    super({ ...options, command: { name: `event:${event.name}`, http: options.policy }, event, messageAvailable: options.message !== undefined,
      actor: { guildID: event.guildID ?? '', authorID: options.actorID ?? event.userID ?? '' },
      message: options.message ?? { id: `event-${randomUUID()}`, content: '', authorID: event.userID ?? '',
        authorName: event.userName ?? '', authorBot: event.userBot, channelID: options.channelID ?? event.channelID ?? '',
        guildID: event.guildID ?? undefined, mentions: [] } });
    this.outputChannel = options.channelID;
  }
  override get channelID(): string { return this.outputChannel ?? super.channelID; }
}
