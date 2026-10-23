import { YuzuhaError } from '../errors.js';

export class RateLimits {
  private readonly seen = new Map<string, number>();
  private readonly seenKeys: string[] = [];
  private readonly seenExpirations: number[] = [];
  private seenCursor = 0;
  private readonly cooldowns = new Map<string, number>();
  private nextSweep = 0;

  constructor(private readonly now: () => number = Date.now) {}

  private sweep(time: number): void {
    if (time < this.nextSweep) return;
    for (const [key, until] of this.cooldowns) if (until <= time) this.cooldowns.delete(key);
    this.nextSweep = time + 1000;
  }

  duplicate(channelID: string, messageID: string): boolean {
    const time = this.now();
    this.sweep(time);
    const key = `${channelID.length}:${channelID}${messageID}`;
    if ((this.seen.get(key) ?? 0) > time) return true;
    const previous = this.seenKeys[this.seenCursor];
    if (previous !== undefined && this.seen.get(previous) === this.seenExpirations[this.seenCursor]) this.seen.delete(previous);
    const until = time + 60_000;
    this.seen.set(key, until);
    this.seenKeys[this.seenCursor] = key; this.seenExpirations[this.seenCursor] = until;
    this.seenCursor = (this.seenCursor + 1) % 10_000;
    return false;
  }

  cooldown(key: string, duration: number): number {
    const time = this.now();
    this.sweep(time);
    const remaining = (this.cooldowns.get(key) ?? 0) - time;
    if (remaining > 0) return remaining;
    if (this.cooldowns.size >= 100_000) throw new YuzuhaError('COOLDOWN_CAPACITY', 'Capacidade de cooldown excedida.');
    this.cooldowns.set(key, time + duration);
    return 0;
  }
}
