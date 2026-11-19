import { cloneValue } from '../../shared/clone.js';
import type { State, Store } from '../../contracts.js';
import { TransactionQueue } from './queue.js';
import { assertSynchronous, emptyState } from './state.js';
import type { JsonValue } from '../../domain/state.js';
import type { StoredVariable } from '../../ports/store.js';
import {
  applyPendingCommit,
  createCommitView,
  createStateDraft,
  materializeReturnValue,
  validateAndBuildCommit,
} from './snapshot.js';
import type { PendingCommit, UndoRecord } from './snapshot.js';

export interface PreparedTransaction<T> {
  result: T;
  pending: PendingCommit | undefined;
}

export class MemoryStore implements Store {
  private static readonly noopCommit = MemoryStore.prototype.commit;
  protected state: State = emptyState();
  protected readonly queue = new TransactionQueue();

  protected async load(): Promise<void> {}
  protected async prepareAccess(): Promise<void> { await this.load(); }
  protected async commit(_state: State): Promise<void> {}

  read<T>(reader: (state: Readonly<State>) => T): Promise<T> {
    return this.queue.run(async () => {
      await this.prepareAccess();
      const { draft } = createStateDraft(this.state);
      const value = reader(draft);
      if (value && (typeof value === 'object' || typeof value === 'function')
        && typeof (value as { then?: unknown }).then === 'function') {
        return materializeReturnValue(await (value as unknown as PromiseLike<T>));
      }
      return materializeReturnValue(value);
    });
  }

  readVariable(key: string, now: () => number): Promise<JsonValue | undefined> {
    return this.queue.run(async () => {
      await this.prepareAccess();
      const expiry = this.state.variableExpirations?.[key];
      return Object.hasOwn(this.state.variables, key) && (expiry === undefined || expiry > now())
        ? cloneValue(this.state.variables[key]!) : undefined;
    });
  }

  readVariableEntry(key: string, clock: () => number): Promise<StoredVariable | undefined> {
    return this.queue.run(async () => {
      await this.prepareAccess();
      const now = clock(), expiry = this.state.variableExpirations?.[key];
      return Object.hasOwn(this.state.variables, key) && (expiry === undefined || expiry > now)
        ? { value: cloneValue(this.state.variables[key]!), expiresAt: expiry ?? null } : undefined;
    });
  }

  protected prepareTransaction<T>(writer: (state: State) => T): PreparedTransaction<T> {
    const { root, draft } = createStateDraft(this.state);
    const rawValue = writer(draft);
    assertSynchronous(rawValue);
    const pending = root.dirty ? validateAndBuildCommit(root) : undefined;
    const result = cloneValue(materializeReturnValue(rawValue));
    return { result, pending };
  }

  protected applyPreparedTransaction(pending: PendingCommit | undefined, undo?: UndoRecord): void {
    if (pending) applyPendingCommit(this.state, pending, undo);
  }

  update<T>(writer: (state: State) => T): Promise<T> {
    return this.queue.run(async () => {
      await this.load();
      const { result, pending } = this.prepareTransaction(writer);
      if (this.commit !== MemoryStore.noopCommit) {
        const nextView = pending ? createCommitView(this.state, pending) : this.state;
        await this.commit(nextView);
      }
      this.applyPreparedTransaction(pending);
      return result;
    });
  }
}
