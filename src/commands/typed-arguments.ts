import type { ArgumentValue } from './arguments.js';
import type { ArgumentSchema, InferArgument } from './builders.js';
import { GuardError } from '../shared/errors.js';

export class ArgumentBag extends Map<string, ArgumentValue> {
  require(name: string): ArgumentValue {
    const value = this.get(name);
    if (value === undefined) throw new GuardError(`Informe o argumento ${name}.`);
    return value;
  }

  string(name: string): string | undefined { return this.typed(name, 'string'); }
  number(name: string): number | undefined { return this.typed(name, 'number'); }
  boolean(name: string): boolean | undefined { return this.typed(name, 'boolean'); }

  private typed<T extends 'string' | 'number' | 'boolean'>(name: string, type: T):
    (T extends 'string' ? string : T extends 'number' ? number : boolean) | undefined {
    const value = this.get(name);
    if (value !== undefined && typeof value !== type) throw new GuardError(`O argumento ${name} deve ser ${type}.`);
    return value as (T extends 'string' ? string : T extends 'number' ? number : boolean) | undefined;
  }
}

export type TypedArguments<S extends ArgumentSchema> = Omit<ArgumentBag, 'get' | 'require'> & {
  get<K extends Extract<keyof S, string>>(name: K): InferArgument<S[K]>;
  require<K extends Extract<keyof S, string>>(name: K): Exclude<InferArgument<S[K]>, undefined>;
};
