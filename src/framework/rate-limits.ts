import { YuzuhaError } from '../errors.js';

export class RateLimits {
  private readonly seen = new Map<string, number>();
  private readonly seenKeys: string[] = [];
  private readonly seenExpirations: number[] = [];
  private seenCursor = 0;
  private readonly cooldowns = new Map<string, number>();
  private nextSweep = 0;
  private nextExpiration = Infinity;

  constructor(private readonly now: () => number = Date.now) {}

  private sweep(time: number, force = false): void {
    if (time < this.nextExpiration || (!force && time < this.nextSweep)) return;
    this.nextExpiration = Infinity;
    for (const [key, until] of this.cooldowns) {
      if (until <= time) this.cooldowns.delete(key);
      else this.nextExpiration = Math.min(this.nextExpiration, until);
    }
    this.nextSweep = time + 1000;
  }

  duplicate(channelID: string, messageID: string): boolean {
    const time = this.now();
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
    const remaining = (this.cooldowns.get(key) ?? 0) - time;
    if (remaining > 0) return remaining;
    this.sweep(time);
    if (this.cooldowns.size >= 100_000 && !this.cooldowns.has(key)) {
      this.sweep(time, true);
      if (this.cooldowns.size >= 100_000) throw new YuzuhaError('COOLDOWN_CAPACITY', 'Capacidade de cooldown excedida.');
    }
    const until = time + duration;
    this.cooldowns.set(key, until);
    if (until < this.nextExpiration) this.nextExpiration = until;
    return 0;
  }
}
