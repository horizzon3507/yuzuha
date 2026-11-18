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

const SNOWFLAKE_DIGITS = /^\d+$/;

/** Compares snowflake strings numerically without BigInt allocations. */
export function compareSnowflake(left: string, right: string): number {
  if (SNOWFLAKE_DIGITS.test(left) && SNOWFLAKE_DIGITS.test(right)) {
    return left.length - right.length || (left < right ? -1 : left > right ? 1 : 0);
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isAbove(member: ModerationMember, target: ModerationMember): boolean {
  if (member.rank !== target.rank) return member.rank > target.rank;
  if (!member.topRoleID || !target.topRoleID
    || !SNOWFLAKE_DIGITS.test(member.topRoleID) || !SNOWFLAKE_DIGITS.test(target.topRoleID)) return false;
  return compareSnowflake(member.topRoleID, target.topRoleID) < 0;
}
