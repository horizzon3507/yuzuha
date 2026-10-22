export interface ModerationMember {
  id: string;
  owner: boolean;
  permissions: bigint;
  rank: number;
  topRoleID?: string;
}

export type ModerationAction = 'ban' | 'kick' | 'timeout' | 'unban' | 'move' | 'mute' | 'deafen';

export interface VoiceModerationOptions {
  channelID?: string | null;
  enabled?: boolean;
}

export interface ModerationOptions extends VoiceModerationOptions {
  record?: boolean;
  duration?: number;
  deleteMessageDays?: number;
}

export interface CaseRecord {
  id: number;
  guildID: string;
  action: ModerationAction;
  targetID: string;
  moderatorID: string;
  reason: string;
  createdAt: string;
  duration?: number;
  channelID?: string | null;
  enabled?: boolean;
}

export function isAbove(member: ModerationMember, target: ModerationMember): boolean {
  if (member.rank !== target.rank) return member.rank > target.rank;
  if (!member.topRoleID || !target.topRoleID
    || !/^\d+$/.test(member.topRoleID) || !/^\d+$/.test(target.topRoleID)) return false;
  return BigInt(member.topRoleID) < BigInt(target.topRoleID);
}
