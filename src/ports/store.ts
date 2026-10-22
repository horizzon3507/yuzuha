import type { State } from '../domain/state.js';

export interface Store {
  read<T>(reader: (state: Readonly<State>) => T): Promise<T>;
  update<T>(writer: (state: State) => T): Promise<T>;
  close?(): Promise<void>;
}
