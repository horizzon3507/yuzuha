import type { ArgumentDefinition } from './definition.js';
import { assertCustomArgumentTypeName } from './arguments.js';
import { normalizeUrlProtocols } from '../domain/values.js';
import type { UrlArgumentOptions } from '../domain/values.js';
import type { MemberInfo } from '../ports/resources/users.js';
import { YuzuhaError } from '../shared/errors.js';

export type ArgumentSchema = Readonly<Record<string, ArgumentBuilder<any, boolean>>>;
export type InferArgument<B> = B extends ArgumentBuilder<infer T, infer Required>
  ? Required extends true ? T : T | undefined : never;

/** Immutable argument definition; a builder may safely be reused in multiple commands. */
export class ArgumentBuilder<T = unknown, Required extends boolean = false> {
  declare readonly valueType: T;
  declare readonly isRequired: Required;
  readonly definition: Readonly<Omit<ArgumentDefinition, 'name'>>;

  constructor(definition: Omit<ArgumentDefinition, 'name'>) {
    this.definition = Object.freeze({ ...definition,
      ...(definition.choices ? { choices: Object.freeze([...definition.choices]) } : {}),
      ...(definition.protocols ? { protocols: Object.freeze([...definition.protocols]) } : {}),
      ...(definition.validators ? { validators: Object.freeze(definition.validators.map(validator => Object.freeze({ ...validator }))) } : {}),
      ...(definition.aliases ? { aliases: Object.freeze([...definition.aliases]) } : {}),
    });
    Object.freeze(this);
  }

  private copy<V = T, R extends boolean = Required>(changes: Partial<ArgumentDefinition>): ArgumentBuilder<V, R> {
    return new ArgumentBuilder<V, R>({ ...this.definition, ...changes });
  }

  required(): ArgumentBuilder<T, true> { return this.copy<T, true>({ required: true }); }
  optional(): ArgumentBuilder<T, false> { return this.copy<T, false>({ required: false, defaultValue: undefined }); }
  default(value: T): ArgumentBuilder<T, true> { return this.copy<T, true>({ defaultValue: value, required: false }); }
  rest(): ArgumentBuilder<T, Required> { return this.copy({ rest: true }); }
  anywhere(): ArgumentBuilder<T, Required> {
    if (this.definition.type !== 'user') throw new YuzuhaError('ARGUMENT_SCHEMA', '.anywhere() só vale para arg.user().');
    return this.copy({ anywhere: true });
  }
  min(value: number): ArgumentBuilder<T, Required> { return this.copy({ min: value }); }
  max(value: number): ArgumentBuilder<T, Required> { return this.copy({ max: value }); }
  alias(...aliases: string[]): ArgumentBuilder<T, Required> { return this.copy({ aliases: [...aliases] }); }
  describe(description: string): ArgumentBuilder<T, Required> { return this.copy({ description }); }
  choices<const Values extends readonly T[]>(values: Values): ArgumentBuilder<Values[number], Required> {
    return this.copy<Values[number]>({ choices: [...values] });
  }
  validate(predicate: (value: T) => boolean, message: string): ArgumentBuilder<T, Required> {
    return this.copy({ validators: [...this.definition.validators ?? [], {
      check: value => predicate(value as T), message,
    }] });
  }
}

function buildUrlArgument(options?: UrlArgumentOptions): ArgumentBuilder<URL> {
  if (options === undefined) return new ArgumentBuilder({ type: 'url' });
  const prototype = options === null || typeof options !== 'object' || Array.isArray(options)
    ? undefined
    : Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new YuzuhaError('ARGUMENT_SCHEMA', 'Opções de arg.url() inválidas.');
  }
  if (options.protocols === undefined) return new ArgumentBuilder({ type: 'url' });
  return new ArgumentBuilder({
    type: 'url',
    protocols: normalizeUrlProtocols(options.protocols, 'ARGUMENT_SCHEMA'),
  });
}

function buildEnumArgument<const Values extends readonly [string, ...string[]]>(
  values: Values,
): ArgumentBuilder<Values[number]> {
  if (!Array.isArray(values) || values.length === 0 || values.some(item => typeof item !== 'string' || item.length === 0)) {
    throw new YuzuhaError('ARGUMENT_SCHEMA', 'arg.enum exige pelo menos um valor textual não vazio.');
  }
  return new ArgumentBuilder<Values[number]>({ type: 'enum', choices: [...values] });
}

export const arg = Object.freeze({
  string: (): ArgumentBuilder<string> => new ArgumentBuilder({ type: 'string' }),
  text: (): ArgumentBuilder<string> => new ArgumentBuilder({ type: 'string' }),
  number: (): ArgumentBuilder<number> => new ArgumentBuilder({ type: 'number' }),
  integer: (): ArgumentBuilder<number> => new ArgumentBuilder({ type: 'integer' }),
  user: (): ArgumentBuilder<string> => new ArgumentBuilder({ type: 'user' }),
  channel: (): ArgumentBuilder<string> => new ArgumentBuilder({ type: 'channel' }),
  role: (): ArgumentBuilder<string> => new ArgumentBuilder({ type: 'role' }),
  member: (): ArgumentBuilder<MemberInfo> => new ArgumentBuilder({ type: 'member' }),
  url: (options?: UrlArgumentOptions): ArgumentBuilder<URL> => buildUrlArgument(options),
  enum: <const Values extends readonly [string, ...string[]]>(values: Values): ArgumentBuilder<Values[number]> =>
    buildEnumArgument(values),
  duration: (): ArgumentBuilder<number> => new ArgumentBuilder({ type: 'duration' }),
  boolean: (): ArgumentBuilder<boolean> => new ArgumentBuilder({ type: 'boolean' }),
  custom: <T = unknown>(typeName: string): ArgumentBuilder<T> =>
    new ArgumentBuilder({ type: 'custom', customType: assertCustomArgumentTypeName(typeName) }),
});

export function argumentDefinitions(schema: ArgumentSchema): ArgumentDefinition[] {
  return Object.entries(schema).map(([name, builder]) => {
    if (!(builder instanceof ArgumentBuilder)) throw new YuzuhaError('COMMAND_ARGS', `Argumento ${name} deve usar arg.*.`);
    return { ...builder.definition, name };
  });
}
