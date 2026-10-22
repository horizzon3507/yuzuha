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
  aliases?: readonly string[];
  description?: string;
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
  flags?: ArgumentDefinition[];
  subcommands?: Command[];
  examples?: string[];
  file?: string;
  hidden?: boolean;
  checks?: CommandCheck[];
  middleware?: CommandMiddleware[];
  http?: HttpPolicy;
}

export type NativeCommandContext<S extends ArgumentSchema, F extends ArgumentSchema = ArgumentSchema> = Omit<CommandContext, 'args' | 'flags'> & { readonly args: TypedArguments<S>; readonly flags: TypedArguments<F> };
export type NativeCommandDefinition<S extends ArgumentSchema = {}, F extends ArgumentSchema = {}> = Omit<Command, 'args' | 'flags' | 'run'> & {
  args?: S;
  flags?: F;
  run?: (ctx: NativeCommandContext<S, F>) => unknown | Promise<unknown>;
};

export function defineCommand<const S extends ArgumentSchema = {}, const F extends ArgumentSchema = {}>(command: NativeCommandDefinition<S, F>): Command;
export function defineCommand<T extends Command>(command: T): T;
export function defineCommand(command: Command | NativeCommandDefinition<ArgumentSchema, ArgumentSchema>): Command {
  if ((!command.args || Array.isArray(command.args)) && (!command.flags || Array.isArray(command.flags))) return command as Command;
  return { ...command, args: command.args && (Array.isArray(command.args) ? command.args : argumentDefinitions(command.args)),
    flags: command.flags && (Array.isArray(command.flags) ? command.flags : argumentDefinitions(command.flags)), run: command.run as Command['run'] };
}
