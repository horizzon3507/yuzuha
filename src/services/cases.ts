import type { CaseRecord } from '../domain/moderation.js';
import type { Store } from '../ports/store.js';

export type NewCase = Omit<CaseRecord, 'id' | 'createdAt'>;

export class CaseService {
  constructor(private readonly store: Store) {}

  async ready(): Promise<void> { await this.store.read(() => undefined); }

  create(input: NewCase): Promise<CaseRecord> {
    return this.store.update(state => {
      const cases = state.cases[input.guildID] ??= [];
      const record: CaseRecord = {
        id: cases.length + 1,
        guildID: input.guildID,
        action: input.action,
        targetID: input.targetID,
        moderatorID: input.moderatorID,
        reason: input.reason,
        createdAt: new Date().toISOString(),
      };
      if (input.duration !== undefined) record.duration = input.duration;
      if (input.channelID !== undefined) record.channelID = input.channelID;
      if (input.enabled !== undefined) record.enabled = input.enabled;
      cases.push(record);
      return record;
    });
  }

  find(guildID: string, id: number): Promise<CaseRecord | undefined> {
    return this.store.read(state => state.cases[guildID]?.find(record => record.id === id));
  }
}
