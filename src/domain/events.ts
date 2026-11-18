import type { ClientEventName } from '@fluxerjs/core';

export type ScriptEventName = 'guildMemberAdd' | 'guildMemberRemove' | 'messageUpdate' | 'messageDelete' | 'messageReactionAdd' | 'messageReactionRemove';

export interface EventData<K extends ClientEventName = ClientEventName> {
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
}

export type ScriptEventData = EventData;
