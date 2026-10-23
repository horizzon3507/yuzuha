import { YuzuhaError } from '../shared/errors.js';

/** FIFO with amortized constant-time removal and a bounded number of live entries. */
export class TrackQueue<T> {
  private entries: (T | undefined)[] = [];
  private head = 0;
  constructor(readonly capacity = 1000) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 100_000) throw new YuzuhaError('MUSIC_QUEUE_LIMIT', 'A fila aceita de 1 a 100000 itens.');
  }
  get size(): number { return this.entries.length - this.head; }
  enqueue(...items: T[]): number { return this.add(items); }
  add(items: readonly T[]): number {
    if (items.length > this.capacity - this.size) throw new YuzuhaError('MUSIC_QUEUE_LIMIT', 'A fila de músicas está cheia.');
    for (const item of items) this.entries.push(item);
    return this.size;
  }
  peek(): T | undefined { return this.entries[this.head]; }
  at(index: number): T | undefined { this.index(index); return this.entries[this.head + index]; }
  slice(start = 0, count = this.size - start): T[] {
    this.index(start, true); this.count(count, this.size - start);
    return this.entries.slice(this.head + start, this.head + start + count) as T[];
  }
  indexOf(item: T): number {
    const index = this.entries.indexOf(item, this.head); return index < 0 ? -1 : index - this.head;
  }
  insert(index: number, items: readonly T[]): number {
    this.index(index, true);
    if (items.length > this.capacity - this.size) throw new YuzuhaError('MUSIC_QUEUE_LIMIT', 'A fila de músicas está cheia.');
    if (index === this.size) return this.add(items);
    if (!index && this.head >= items.length) {
      this.head -= items.length;
      for (let i = 0; i < items.length; i++) this.entries[this.head + i] = items[i];
    } else {
      this.entries = this.entries.slice(this.head, this.head + index).concat(items, this.entries.slice(this.head + index)); this.head = 0;
    }
    return this.size;
  }
  remove(index: number, count = 1): T[] {
    this.index(index, count === 0); this.count(count, this.size - index);
    if (!count) return [];
    const removed = this.entries.splice(this.head + index, count) as T[];
    if (!this.size) this.clear();
    return removed;
  }
  move(from: number, to: number): void {
    this.index(from); this.index(to);
    if (from === to) return;
    const [item] = this.entries.splice(this.head + from, 1);
    this.entries.splice(this.head + to, 0, item);
  }
  shuffle(random: () => number = Math.random): void {
    const entries = this.toArray();
    for (let index = entries.length - 1; index > 0; index--) {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new YuzuhaError('MUSIC_QUEUE_RANDOM', 'random deve retornar um número entre 0 (inclusivo) e 1 (exclusivo).');
      const other = Math.floor(value * (index + 1));
      [entries[index], entries[other]] = [entries[other]!, entries[index]!];
    }
    this.entries = entries; this.head = 0;
  }
  private index(index: number, end = false): void {
    if (!Number.isSafeInteger(index) || index < 0 || index > this.size - (end ? 0 : 1)) throw new YuzuhaError('MUSIC_QUEUE_INDEX', 'Índice fora da fila.');
  }
  private count(count: number, max: number): void {
    if (!Number.isSafeInteger(count) || count < 0 || count > max) throw new YuzuhaError('MUSIC_QUEUE_INDEX', 'Quantidade fora da fila.');
  }
  dequeue(): T | undefined {
    if (!this.size) return;
    const value = this.entries[this.head];
    this.entries[this.head++] = undefined;
    if (this.head === this.entries.length) this.clear();
    else if (this.head >= 1024 && this.head * 2 >= this.entries.length) {
      this.entries = this.entries.slice(this.head); this.head = 0;
    }
    return value;
  }
  clear(): void { this.entries = []; this.head = 0; }
  toArray(): T[] { return this.entries.slice(this.head) as T[]; }
}
