import type { ArgumentDefinition, Command } from './definition.js';

function placeholder(argument: ArgumentDefinition): string {
  const value = `${argument.name}${argument.rest ? '...' : ''}`;
  return argument.required && argument.defaultValue === undefined ? `<${value}>` : `[${value}]`;
}

export function commandUsage(command: Command, prefix = ''): string {
  const args = (command.args ?? []).map(placeholder);
  const flags = (command.flags ?? []).map(flag => {
    const value = `--${flag.name}${flag.type === 'boolean' ? '' : ` <${flag.type ?? 'string'}>`}`;
    return flag.required && flag.defaultValue === undefined ? value : `[${value}]`;
  });
  if (command.subcommands?.length) args.push('<subcomando>');
  return [`${prefix}${command.name}`, ...args, ...flags].join(' ');
}

export function commandHelp(command: Command, prefix = ''): string {
  const lines = [`Uso: ${commandUsage(command, prefix)}`];
  if (command.description) lines.push(command.description);
  if (command.aliases?.length) lines.push(`Aliases: ${command.aliases.join(', ')}`);
  const describe = (argument: ArgumentDefinition, flag: boolean): string => {
    const name = flag ? `--${argument.name}${argument.aliases?.length ? ` (${argument.aliases.map(alias => `${alias.length === 1 ? '-' : '--'}${alias}`).join(', ')})` : ''}` : argument.name;
    const details = [argument.type ?? 'string', argument.required && argument.defaultValue === undefined ? 'obrigatório' : 'opcional'];
    if (argument.choices) details.push(`escolhas: ${argument.choices.join(', ')}`);
    if (argument.defaultValue !== undefined) details.push(`padrão: ${String(argument.defaultValue)}`);
    if (argument.min !== undefined) details.push(`mínimo: ${argument.min}`);
    if (argument.max !== undefined) details.push(`máximo: ${argument.max}`);
    return `${name}: ${details.join('; ')}${argument.description ? `. ${argument.description}` : ''}`;
  };
  if (command.args?.length) lines.push('Argumentos:', ...command.args.map(argument => describe(argument, false)));
  if (command.flags?.length) lines.push('Flags:', ...command.flags.map(argument => describe(argument, true)));
  const children = command.subcommands?.filter(child => !child.hidden) ?? [];
  if (children.length) lines.push('Subcomandos:', ...children.map(child => `${prefix}${command.name} ${child.name}${child.description ? `: ${child.description}` : ''}`));
  if (command.examples?.length) lines.push('Exemplos:', ...command.examples);
  return lines.join('\n');
}
