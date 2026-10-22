import { YuzuhaError } from '../errors.js';

export class RateLimits {
  private readonly seen = new Map<string, number>();
  private readonly cooldowns = new Map<string, number>();
  private nextSweep = 0;

  constructor(private readonly now: () => number = Date.now) {}

  private sweep(time: number): void {
    if (time < this.nextSweep) return;
    for (const map of [this.seen, this.cooldowns]) {
      for (const [key, until] of map) if (until <= time) map.delete(key);
    }
    this.nextSweep = time + 1000;
  }

  duplicate(channelID: string, messageID: string): boolean {
    const time = this.now();
    this.sweep(time);
    const key = JSON.stringify([channelID, messageID]);
    if ((this.seen.get(key) ?? 0) > time) return true;
    if (this.seen.size >= 10_000) this.seen.delete(this.seen.keys().next().value!);
    this.seen.set(key, time + 60_000);
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
