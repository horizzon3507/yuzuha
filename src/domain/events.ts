export type ScriptEventName = 'guildMemberAdd' | 'guildMemberRemove' | 'messageUpdate' | 'messageDelete' | 'messageReactionAdd' | 'messageReactionRemove';
export interface ScriptEventData {
  name: ScriptEventName;
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
