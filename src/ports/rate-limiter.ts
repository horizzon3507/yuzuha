export interface RateLimiter {
  /** Attempts to claim a cooldown window; returns remaining ms (> 0 if blocked, 0 if granted). */
  cooldown(key: string, durationMs: number, maxUses?: number): number | Promise<number>;
  /** Checks and marks (channelID, messageID) as seen within dedupe window; returns true if duplicate. */
  duplicate(channelID: string, messageID: string): boolean | Promise<boolean>;
  close?(): Promise<void>;
}
