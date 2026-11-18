import type { ArgumentDefinition, Command } from './definition.js';
import { defaultTranslator } from '../domain/i18n.js';
import type { MessageTranslator } from '../domain/i18n.js';

function placeholder(argument: ArgumentDefinition): string {
  const value = `${argument.name}${argument.rest ? '...' : ''}`;
  return argument.required && argument.defaultValue === undefined ? `<${value}>` : `[${value}]`;
}

export function commandUsage(
  command: Command,
  prefix = '',
  t: MessageTranslator = defaultTranslator,
): string {
  const args = (command.args ?? []).map(placeholder);
  const flags = (command.flags ?? []).map(flag => {
    const value = `--${flag.name}${flag.type === 'boolean' ? '' : ` <${flag.type ?? 'string'}>`}`;
    return flag.required && flag.defaultValue === undefined ? value : `[${value}]`;
  });
  if (command.subcommands?.length) args.push(t('usageSubcommand'));
  return [`${prefix}${command.name}`, ...args, ...flags].join(' ');
}

export function commandHelp(
  command: Command,
  prefix = '',
  t: MessageTranslator = defaultTranslator,
): string {
  const lines = [t('usageLine', commandUsage(command, prefix, t))];
  if (command.description) lines.push(command.description);
  if (command.aliases?.length) lines.push(t('helpAliases', command.aliases));
  const describe = (argument: ArgumentDefinition, flag: boolean): string => {
    const name = flag ? `--${argument.name}${argument.aliases?.length ? ` (${argument.aliases.map(alias => `${alias.length === 1 ? '-' : '--'}${alias}`).join(', ')})` : ''}` : argument.name;
    const details = [argument.type ?? 'string', argument.required && argument.defaultValue === undefined ? t('helpRequired') : t('helpOptional')];
    if (argument.choices) details.push(t('helpChoices', argument.choices));
    if (argument.defaultValue !== undefined) details.push(t('helpDefault', String(argument.defaultValue)));
    if (argument.min !== undefined) details.push(t('helpMin', argument.min));
    if (argument.max !== undefined) details.push(t('helpMax', argument.max));
    return `${name}: ${details.join('; ')}${argument.description ? `. ${argument.description}` : ''}`;
  };
  if (command.args?.length) lines.push(t('helpArgumentsHeader'), ...command.args.map(argument => describe(argument, false)));
  if (command.flags?.length) lines.push(t('helpFlagsHeader'), ...command.flags.map(argument => describe(argument, true)));
  const children = command.subcommands?.filter(child => !child.hidden) ?? [];
  if (children.length) lines.push(t('helpSubcommandsHeader'), ...children.map(child => `${prefix}${command.name} ${child.name}${child.description ? `: ${child.description}` : ''}`));
  if (command.examples?.length) lines.push(t('helpExamplesHeader'), ...command.examples);
  return lines.join('\n');
}
