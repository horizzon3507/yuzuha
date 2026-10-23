import type { JsonValue, State } from '../domain/state.js';

export interface Store {
  read<T>(reader: (state: Readonly<State>) => T): Promise<T>;
  update<T>(writer: (state: State) => T): Promise<T>;
  /** Evaluate the clock inside the serialized read; undefined means missing or expired. */
  readVariable?(key: string, now: () => number): Promise<JsonValue | undefined>;
  close?(): Promise<void>;
}
