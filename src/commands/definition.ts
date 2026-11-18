import type { CommandContext } from './context.js';
import { argumentDefinitions } from './builders.js';
import type { ArgumentSchema } from './builders.js';
import type { ArgumentValue } from './arguments.js';
import type { TypedArguments } from './typed-arguments.js';
import { parseDuration } from '../domain/values.js';
import type { HttpPolicy } from '../services/http.js';
import { YuzuhaError } from '../shared/errors.js';

export type CooldownScope = 'user' | 'channel' | 'guild' | 'global';

export interface CooldownOptions {
  duration: string | number;
  scope?: CooldownScope;
  uses?: number;
  bypass?: (ctx: CommandContext) => boolean | Promise<boolean>;
}

export interface ResolvedCooldown {
  readonly durationMs: number;
  readonly scope?: CooldownScope;
  readonly uses?: number;
  readonly bypass?: (ctx: CommandContext) => boolean | Promise<boolean>;
}

export function resolveCooldown(input: unknown): ResolvedCooldown {
  if (typeof input === 'string' || typeof input === 'number') {
    return { durationMs: parseDuration(input) };
  }
  const prototype = input === null || typeof input !== 'object' || Array.isArray(input)
    ? undefined : Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new YuzuhaError('COMMAND_METADATA', 'cooldown deve ser uma duração ou objeto de opções.');
  }
  const raw = input as Record<string, unknown>;
  if (typeof raw['duration'] !== 'string' && typeof raw['duration'] !== 'number') {
    throw new YuzuhaError('COMMAND_METADATA', 'cooldown.duration deve ser uma duração válida.');
  }
  let durationMs: number;
  try {
    durationMs = parseDuration(raw['duration']);
  } catch (error) {
    throw new YuzuhaError('COMMAND_METADATA', 'cooldown.duration deve ser uma duração válida.', { cause: error });
  }
  const scope = raw['scope'];
  if (scope !== undefined && scope !== 'user' && scope !== 'channel' && scope !== 'guild' && scope !== 'global') {
    throw new YuzuhaError('COMMAND_METADATA', "cooldown.scope deve ser 'user', 'channel', 'guild' ou 'global'.");
  }
  const uses = raw['uses'];
  if (uses !== undefined && (!Number.isSafeInteger(uses) || (uses as number) < 1)) {
    throw new YuzuhaError('COMMAND_METADATA', 'cooldown.uses deve ser um inteiro positivo.');
  }
  const bypass = raw['bypass'];
  if (bypass !== undefined && typeof bypass !== 'function') {
    throw new YuzuhaError('COMMAND_METADATA', 'cooldown.bypass deve ser uma função.');
  }
  return {
    durationMs,
    ...(scope !== undefined ? { scope } : {}),
    ...(uses !== undefined ? { uses: uses as number } : {}),
    ...(bypass !== undefined ? { bypass: bypass as (ctx: CommandContext) => boolean | Promise<boolean> } : {}),
  };
}

export interface ArgumentDefinition {
  name: string;
  type?: 'string' | 'number' | 'integer' | 'user' | 'duration' | 'boolean'
    | 'channel' | 'role' | 'member' | 'url' | 'enum' | 'custom';
  customType?: string;
  protocols?: readonly string[];
  required?: boolean;
  rest?: boolean;
  anywhere?: boolean;
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
  ownerOnly?: boolean;
  devOnly?: boolean;
  permissions?: string[];
  botPermissions?: string[];
  cooldown?: string | number | CooldownOptions;
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
