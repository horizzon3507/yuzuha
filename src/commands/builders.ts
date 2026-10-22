import type { ArgumentDefinition } from './definition.js';
import type { ArgumentValue } from './arguments.js';
import { YuzuhaError } from '../shared/errors.js';

export type ArgumentSchema = Readonly<Record<string, ArgumentBuilder<ArgumentValue, boolean>>>;
export type InferArgument<B> = B extends ArgumentBuilder<infer T, infer Required>
  ? Required extends true ? T : T | undefined : never;

/** Immutable argument definition; a builder may safely be reused in multiple commands. */
export class ArgumentBuilder<T extends ArgumentValue, Required extends boolean = false> {
  declare readonly valueType: T;
  declare readonly isRequired: Required;
  readonly definition: Readonly<Omit<ArgumentDefinition, 'name'>>;

  constructor(definition: Omit<ArgumentDefinition, 'name'>) {
    this.definition = Object.freeze({ ...definition,
      ...(definition.choices ? { choices: Object.freeze([...definition.choices]) } : {}),
      ...(definition.validators ? { validators: Object.freeze(definition.validators.map(validator => Object.freeze({ ...validator }))) } : {}),
    });
    Object.freeze(this);
  }

  private copy<V extends ArgumentValue = T, R extends boolean = Required>(changes: Partial<ArgumentDefinition>): ArgumentBuilder<V, R> {
    return new ArgumentBuilder<V, R>({ ...this.definition, ...changes });
  }

  required(): ArgumentBuilder<T, true> { return this.copy<T, true>({ required: true }); }
  optional(): ArgumentBuilder<T, false> { return this.copy<T, false>({ required: false, defaultValue: undefined }); }
  default(value: T): ArgumentBuilder<T, true> { return this.copy<T, true>({ defaultValue: value, required: false }); }
  rest(): ArgumentBuilder<T, Required> { return this.copy({ rest: true }); }
  min(value: number): ArgumentBuilder<T, Required> { return this.copy({ min: value }); }
  max(value: number): ArgumentBuilder<T, Required> { return this.copy({ max: value }); }
  choices<const Values extends readonly T[]>(values: Values): ArgumentBuilder<Values[number], Required> {
    return this.copy<Values[number]>({ choices: [...values] });
  }
  validate(predicate: (value: T) => boolean, message: string): ArgumentBuilder<T, Required> {
    return this.copy({ validators: [...this.definition.validators ?? [], {
      check: value => predicate(value as T), message,
    }] });
  }
}

export const arg = Object.freeze({
  string: (): ArgumentBuilder<string> => new ArgumentBuilder({ type: 'string' }),
  text: (): ArgumentBuilder<string> => new ArgumentBuilder({ type: 'string' }),
  number: (): ArgumentBuilder<number> => new ArgumentBuilder({ type: 'number' }),
  integer: (): ArgumentBuilder<number> => new ArgumentBuilder({ type: 'integer' }),
  user: (): ArgumentBuilder<string> => new ArgumentBuilder({ type: 'user' }),
  duration: (): ArgumentBuilder<number> => new ArgumentBuilder({ type: 'duration' }),
  boolean: (): ArgumentBuilder<boolean> => new ArgumentBuilder({ type: 'boolean' }),
});

export function argumentDefinitions(schema: ArgumentSchema): ArgumentDefinition[] {
  return Object.entries(schema).map(([name, builder]) => {
    if (!(builder instanceof ArgumentBuilder)) throw new YuzuhaError('COMMAND_ARGS', `Argumento ${name} deve usar arg.*.`);
    return { ...builder.definition, name };
  });
}
