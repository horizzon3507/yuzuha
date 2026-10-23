import { cloneValue } from '../../shared/clone.js';
import type { State, Store } from '../../contracts.js';
import { TransactionQueue } from './queue.js';
import { assertState, assertSynchronous, emptyState } from './state.js';
import type { JsonValue } from '../../domain/state.js';

export class MemoryStore implements Store {
  protected state: State = emptyState();
  private readonly queue = new TransactionQueue();

  protected async load(): Promise<void> {}
  protected async commit(_state: State): Promise<void> {}

  read<T>(reader: (state: Readonly<State>) => T): Promise<T> {
    return this.queue.run(async () => { await this.load(); return reader(structuredClone(this.state)); });
  }

  readVariable(key: string, now: () => number): Promise<JsonValue | undefined> {
    return this.queue.run(async () => {
      await this.load();
      const expiry = this.state.variableExpirations?.[key];
      return Object.hasOwn(this.state.variables, key) && (expiry === undefined || expiry > now())
        ? cloneValue(this.state.variables[key]!) : undefined;
    });
  }

  update<T>(writer: (state: State) => T): Promise<T> {
    return this.queue.run(async () => {
      await this.load();
      const next = structuredClone(this.state);
      const value = writer(next);
      assertSynchronous(value);
      assertState(next);
      const result = cloneValue(value);
      await this.commit(next);
      this.state = next;
      return result;
    });
  }
}
