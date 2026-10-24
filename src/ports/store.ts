import type { VariableQuery, VariablePage } from '../domain/variable-query.js';
import type { JsonValue, State } from '../domain/state.js';

export interface Store {
  read<T>(reader: (state: Readonly<State>) => T): Promise<T>;
  update<T>(writer: (state: State) => T): Promise<T>;
  /** Evaluate the clock inside the serialized read; undefined means missing or expired. */
  readVariable?(key: string, now: () => number): Promise<JsonValue | undefined>;
  queryVariables?(query: VariableQuery, now: () => number): Promise<VariablePage>;
  close?(): Promise<void>;
}
