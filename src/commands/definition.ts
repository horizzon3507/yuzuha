import type { CommandContext } from './context.js';
import { argumentDefinitions } from './builders.js';
import type { ArgumentSchema } from './builders.js';
import type { ArgumentValue } from './arguments.js';
import type { TypedArguments } from './typed-arguments.js';
import type { HttpPolicy } from '../services/http.js';

export interface ArgumentDefinition {
  name: string;
  type?: 'string' | 'number' | 'integer' | 'user' | 'duration' | 'boolean';
  required?: boolean;
  rest?: boolean;
  choices?: readonly ArgumentValue[];
  defaultValue?: ArgumentValue;
  min?: number;
  max?: number;
  validators?: readonly { readonly check: (value: ArgumentValue) => boolean; readonly message: string }[];
}

export type CommandCheck = (ctx: CommandContext) => boolean | string | void | Promise<boolean | string | void>;
export type CommandMiddleware = (ctx: CommandContext, next: () => Promise<void>) => Promise<void>;

export interface Command {
  name: string;
  aliases?: string[];
  description?: string;
  code?: string;
  run?: (ctx: CommandContext) => unknown | Promise<unknown>;
  guildOnly?: boolean;
  permissions?: string[];
  botPermissions?: string[];
  cooldown?: string | number;
  args?: ArgumentDefinition[];
  file?: string;
  hidden?: boolean;
  checks?: CommandCheck[];
  middleware?: CommandMiddleware[];
  http?: HttpPolicy;
}

export type NativeCommandContext<S extends ArgumentSchema> = Omit<CommandContext, 'args'> & { readonly args: TypedArguments<S> };
export type NativeCommandDefinition<S extends ArgumentSchema> = Omit<Command, 'args' | 'run'> & {
  args: S;
  run?: (ctx: NativeCommandContext<S>) => unknown | Promise<unknown>;
};

export function defineCommand<const S extends ArgumentSchema>(command: NativeCommandDefinition<S>): Command;
export function defineCommand<T extends Command>(command: T): T;
export function defineCommand(command: Command | NativeCommandDefinition<ArgumentSchema>): Command {
  if (!command.args || Array.isArray(command.args)) return command as Command;
  const run = (command as NativeCommandDefinition<ArgumentSchema>).run;
  return { ...command, args: argumentDefinitions(command.args),
    run: run ? context => run(context as NativeCommandContext<ArgumentSchema>) : undefined,
  };
}
