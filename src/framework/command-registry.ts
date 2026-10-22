import { resolve } from 'node:path';
import { validateArgumentDefinitions } from '../commands/arguments.js';
import type { Command } from '../context.js';
import { parseDuration } from '../context.js';
import { YuzuhaError } from '../errors.js';
import { loadCommands } from '../loader.js';
import type { Program } from '../parser.js';
import { permission } from '../permissions.js';
import type { Runtime } from '../runtime.js';

export interface CompiledCommand { command: Command; program?: Program; directory?: string }

function validateMetadata(command: Command): void {
  if (!command || typeof command !== 'object') throw new YuzuhaError('COMMAND_BODY', 'Comando deve ser um objeto.');
  if ((command.code !== undefined && typeof command.code !== 'string')
    || (command.run !== undefined && typeof command.run !== 'function')) {
    throw new YuzuhaError('COMMAND_BODY', 'code deve ser texto e run deve ser uma função.');
  }
  for (const key of ['aliases', 'permissions', 'botPermissions'] as const) {
    const value = command[key];
    if (value !== undefined && (!Array.isArray(value) || value.some(item => typeof item !== 'string'))) {
      throw new YuzuhaError('COMMAND_METADATA', `${key} deve ser uma lista de textos.`);
    }
  }
  for (const key of ['checks', 'middleware'] as const) {
    const value = command[key];
    if (value !== undefined && (!Array.isArray(value) || value.some(item => typeof item !== 'function'))) {
      throw new YuzuhaError('COMMAND_METADATA', `${key} deve ser uma lista de funções.`);
    }
  }
  if (command.args !== undefined && (!Array.isArray(command.args) || command.args.some(arg => !arg || typeof arg !== 'object'))) {
    throw new YuzuhaError('COMMAND_ARGS', 'args deve ser uma lista de definições.');
  }
  if ((command.description !== undefined && typeof command.description !== 'string')
    || (command.guildOnly !== undefined && typeof command.guildOnly !== 'boolean')
    || (command.hidden !== undefined && typeof command.hidden !== 'boolean')) {
    throw new YuzuhaError('COMMAND_METADATA', 'description deve ser texto; guildOnly e hidden devem ser booleanos.');
  }
}

function snapshot(command: Command): Command {
  const result: Command = { ...command,
    aliases: command.aliases && [...command.aliases], permissions: command.permissions && [...command.permissions],
    botPermissions: command.botPermissions && [...command.botPermissions],
    args: command.args?.map(arg => ({ ...arg, choices: arg.choices && [...arg.choices], validators: arg.validators?.map(validator => ({ ...validator })) })),
    checks: command.checks && [...command.checks], middleware: command.middleware && [...command.middleware],
    http: command.http && structuredClone(command.http),
  };
  return result;
}

export class CommandRegistry {
  private entries = new Map<string, CompiledCommand>();
  private loading: Promise<unknown> = Promise.resolve();
  constructor(private readonly runtime: Runtime, private readonly onScript: () => void = () => {},
    private readonly validate: (command: Command) => void = () => {}) {}

  private compile(input: Command, directory?: string, runtime = this.runtime): CompiledCommand {
    validateMetadata(input);
    this.validate(input);
    validateArgumentDefinitions(input.args ?? [], input.name);
    const command = snapshot(input);
    const names = [command.name, ...(command.aliases ?? [])];
    if (names.some(n => typeof n !== 'string' || !/^[\p{L}\p{N}_-]+$/u.test(n))) throw new YuzuhaError('COMMAND_NAME', 'Nome ou alias inválido.');
    if (new Set(names.map(n => n.toLowerCase())).size !== names.length) throw new YuzuhaError('COMMAND_DUPLICATE', `Nome ou alias duplicado: ${command.name}.`);
    if ((typeof command.code === 'string') === (typeof command.run === 'function')) throw new YuzuhaError('COMMAND_BODY', `Comando ${command.name} precisa de code ou run, exclusivamente.`);
    for (const p of [...(command.permissions ?? []), ...(command.botPermissions ?? [])]) permission(p);
    if (command.cooldown !== undefined) parseDuration(command.cooldown);
    if (command.code !== undefined) this.onScript();
    return { command, directory, program: command.code === undefined ? undefined : runtime.compile(command.code, command.file ?? command.name) };
  }

  private insert(next: Map<string, CompiledCommand>, entry: CompiledCommand): void {
    for (const name of [entry.command.name, ...(entry.command.aliases ?? [])].map(n => n.toLowerCase())) {
      if (next.has(name)) throw new YuzuhaError('COMMAND_DUPLICATE', `Nome ou alias duplicado: ${name}.`);
      next.set(name, entry);
    }
  }

  add(command: Command): void {
    this.prepare([command])();
  }

  prepare(commands: Command[], runtime = this.runtime): () => void {
    const next = new Map(this.entries);
    for (const command of commands) this.insert(next, this.compile(command, undefined, runtime));
    return () => { this.entries = next; };
  }

  load(directory: string, mode: 'replace' | 'append' | 'reload'): Promise<void> {
    const path = resolve(directory);
    const nextLoad = this.loading.then(async () => {
      const loaded = await loadCommands(path);
      const next = new Map(mode === 'replace' ? [] : [...this.entries].filter(([, item]) => mode !== 'reload' || item.directory !== path));
      for (const command of loaded) this.insert(next, this.compile(command, path));
      this.entries = next;
    });
    this.loading = nextLoad.catch(() => {});
    return nextLoad;
  }

  find(name: string): CompiledCommand | undefined { return this.entries.get(name); }
  list(): Command[] { return [...new Set(this.entries.values())].map(item => snapshot(item.command)); }
  help(): string { return this.list().filter(c => !c.hidden).map(c => `${c.name}${c.description ? `: ${c.description}` : ''}`).join('\n'); }
}
