import type { ArgumentDefinition, Command } from '../commands/definition.js';
import { commandUsage } from '../commands/help.js';

export type ArgumentMetadata = Omit<ArgumentDefinition, 'validators'>;

export interface CommandMetadata {
  name: string;
  aliases?: string[];
  description?: string;
  usage: string;
  args: ArgumentMetadata[];
  flags: ArgumentMetadata[];
  examples: string[];
  subcommands: CommandMetadata[];
}

function argumentMetadata(definition: ArgumentDefinition): ArgumentMetadata {
  const { name, type, required, rest, choices, defaultValue, min, max, aliases, description } = definition;
  return { name, type, required, rest, choices: choices && [...choices], defaultValue, min, max,
    aliases: aliases && [...aliases], description };
}

export function commandCatalog(commands: readonly Command[], prefix = '', parent = ''): CommandMetadata[] {
  return commands.map(command => {
    const path = parent ? `${parent} ${command.name}` : command.name;
    return {
      name: command.name,
      aliases: command.aliases && [...command.aliases],
      description: command.description,
      usage: commandUsage({ ...command, name: path }, prefix),
      args: (command.args ?? []).map(argumentMetadata),
      flags: (command.flags ?? []).map(argumentMetadata),
      examples: [...command.examples ?? []],
      subcommands: commandCatalog(command.subcommands ?? [], prefix, path),
    };
  });
}
