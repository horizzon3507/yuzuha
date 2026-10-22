import type { IncomingMessage, Payload } from '../domain/messages.js';
import type { ModerationAction, ModerationMember, VoiceModerationOptions } from '../domain/moderation.js';

export interface Transport {
  readonly botID: string;
  readonly ping: number;
  reply(message: IncomingMessage, payload: Payload): Promise<string>;
  send(channelID: string, payload: Payload): Promise<string>;
  edit(channelID: string, messageID: string, payload: Payload): Promise<void>;
  delete(channelID: string, messageID: string): Promise<void>;
  react(channelID: string, messageID: string, emoji: string): Promise<void>;
  member(guildID: string, userID: string, channelID?: string): Promise<ModerationMember>;
  moderate(guildID: string, action: ModerationAction, targetID: string,
    reason: string, duration?: number, voice?: VoiceModerationOptions): Promise<void>;
}
