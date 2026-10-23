import { resolve } from 'node:path';
import { validateArgumentDefinitions, validateFlagDefinitions } from '../commands/arguments.js';
import { commandHelp, commandUsage } from '../commands/help.js';
import type { Command } from '../context.js';
import { parseDuration } from '../context.js';
import { YuzuhaError } from '../errors.js';
import { loadCommands } from '../loader.js';
import type { Program } from '../parser.js';
import { permission } from '../permissions.js';
import type { Runtime } from '../runtime.js';
import type { HttpPolicy } from '../services/http.js';

export interface CompiledCommand {
  command: Command;
  definition: Command;
  program?: Program;
  directory?: string;
  children: Map<string, CompiledCommand>;
  lineage: Command[];
}

function validateMetadata(command: Command): void {
  if (!command || typeof command !== 'object') throw new YuzuhaError('COMMAND_BODY', 'Comando deve ser um objeto.');
  if ((command.code !== undefined && typeof command.code !== 'string')
    || (command.run !== undefined && typeof command.run !== 'function')) throw new YuzuhaError('COMMAND_BODY', 'code deve ser texto e run deve ser uma função.');
  for (const key of ['aliases', 'permissions', 'botPermissions', 'examples'] as const) {
    const value = command[key];
    if (value !== undefined && (!Array.isArray(value) || value.some(item => typeof item !== 'string'))) throw new YuzuhaError('COMMAND_METADATA', `${key} deve ser uma lista de textos.`);
  }
  for (const key of ['checks', 'middleware'] as const) {
    const value = command[key];
    if (value !== undefined && (!Array.isArray(value) || value.some(item => typeof item !== 'function'))) throw new YuzuhaError('COMMAND_METADATA', `${key} deve ser uma lista de funções.`);
  }
  for (const key of ['args', 'flags', 'subcommands'] as const) {
    if (command[key] !== undefined && (!Array.isArray(command[key]) || command[key]!.some(item => !item || typeof item !== 'object'))) throw new YuzuhaError('COMMAND_ARGS', `${key} deve ser uma lista de definições.`);
  }
  if ((command.description !== undefined && typeof command.description !== 'string')
    || (command.guildOnly !== undefined && typeof command.guildOnly !== 'boolean')
    || (command.hidden !== undefined && typeof command.hidden !== 'boolean')) throw new YuzuhaError('COMMAND_METADATA', 'description deve ser texto; guildOnly e hidden devem ser booleanos.');
}

function snapshot(command: Command): Command {
  const definitions = (items: Command['args']) => items?.map(arg => ({ ...arg, aliases: arg.aliases && [...arg.aliases], choices: arg.choices && [...arg.choices], validators: arg.validators?.map(validator => ({ ...validator })) }));
  return { ...command, aliases: command.aliases && [...command.aliases], permissions: command.permissions && [...command.permissions],
    botPermissions: command.botPermissions && [...command.botPermissions], args: definitions(command.args), flags: definitions(command.flags),
    examples: command.examples && [...command.examples], subcommands: command.subcommands?.map(snapshot),
    checks: command.checks && [...command.checks], middleware: command.middleware && [...command.middleware], http: command.http && structuredClone(command.http) };
}

function inheritedHttp(parent?: HttpPolicy, child?: HttpPolicy): HttpPolicy | undefined {
  if (!parent || !child) return child ?? parent;
  const policy = { ...parent };
  for (const [key, value] of Object.entries(child)) if (value !== undefined) Object.assign(policy, { [key]: value });
  for (const key of ['timeoutMs', 'maxBytes', 'maxRequestBytes'] as const) {
    if (parent[key] !== undefined && child[key] !== undefined) policy[key] = Math.min(parent[key], child[key]);
  }
  if (parent.allowedHosts && child.allowedHosts) {
    const allowed = new Set(parent.allowedHosts.map(host => host.toLowerCase()));
    policy.allowedHosts = child.allowedHosts.map(host => host.toLowerCase()).filter(host => allowed.has(host));
    if (!policy.allowedHosts.length) throw new YuzuhaError('HTTP_POLICY', 'As políticas HTTP do grupo e subcomando não permitem nenhum host.');
  }
  return policy;
}

export class CommandRegistry {
  private entries = new Map<string, CompiledCommand>();
  private loading: Promise<unknown> = Promise.resolve();
  constructor(private readonly runtime: Runtime, private readonly onScript: () => void = () => {},
    private readonly validate: (command: Command) => void = () => {}) {}

  private compile(input: Command, directory?: string, runtime = this.runtime, ancestors: CompiledCommand[] = [], seen = new Set<Command>()): CompiledCommand {
    if (ancestors.length >= 32 || seen.has(input)) throw new YuzuhaError('COMMAND_TREE', 'Árvore de comandos cíclica ou com mais de 32 níveis.');
    validateMetadata(input);
    this.validate(input);
    validateArgumentDefinitions(input.args ?? [], input.name);
    validateFlagDefinitions(input.flags ?? [], input.name);
    const names = [input.name, ...(input.aliases ?? [])];
    if (names.some(n => typeof n !== 'string' || !/^[\p{L}\p{N}_-]+$/u.test(n))) throw new YuzuhaError('COMMAND_NAME', 'Nome ou alias inválido.');
    if (new Set(names.map(n => n.toLowerCase())).size !== names.length) throw new YuzuhaError('COMMAND_DUPLICATE', `Nome ou alias duplicado: ${input.name}.`);
    const handlers = Number(typeof input.code === 'string') + Number(typeof input.run === 'function');
    if (handlers > 1 || (!handlers && !input.subcommands?.length)) throw new YuzuhaError('COMMAND_BODY', `Comando ${input.name} precisa de code ou run, exclusivamente, ou subcomandos.`);
    if (input.subcommands?.length && (input.args?.length || input.flags?.length)) throw new YuzuhaError('COMMAND_GROUP_ARGS', 'Grupos não aceitam argumentos ou flags; declare-os nos subcomandos.');
    for (const p of [...(input.permissions ?? []), ...(input.botPermissions ?? [])]) permission(p);
    if (input.cooldown !== undefined) parseDuration(input.cooldown);
    const definition = snapshot({ ...input, subcommands: undefined });
    const parent = ancestors.at(-1)?.command;
    const command: Command = { ...definition, name: parent ? `${parent.name} ${definition.name}` : definition.name,
      guildOnly: Boolean(parent?.guildOnly || definition.guildOnly), hidden: Boolean(parent?.hidden || definition.hidden),
      permissions: [...parent?.permissions ?? [], ...definition.permissions ?? []], botPermissions: [...parent?.botPermissions ?? [], ...definition.botPermissions ?? []],
      checks: [...parent?.checks ?? [], ...definition.checks ?? []], middleware: [...parent?.middleware ?? [], ...definition.middleware ?? []],
      http: inheritedHttp(parent?.http, definition.http) };
    this.validate(command);
    const ownGuard = { ...definition, name: command.name };
    const entry: CompiledCommand = { command, definition, directory, children: new Map(), lineage: [...ancestors.at(-1)?.lineage ?? [], ownGuard] };
    const visiting = new Set(seen).add(input);
    for (const child of input.subcommands ?? []) this.insert(entry.children, this.compile(child, directory, runtime, [...ancestors, entry], visiting));
    definition.subcommands = [...new Set(entry.children.values())].map(child => child.definition);
    command.subcommands = definition.subcommands;
    if (command.code !== undefined) {
      this.onScript();
      entry.program = runtime.compile(command.code, command.file ?? command.name);
    }
    return entry;
  }

  private insert(next: Map<string, CompiledCommand>, entry: CompiledCommand): void {
    for (const name of [entry.definition.name, ...(entry.definition.aliases ?? [])].map(n => n.toLowerCase())) {
      if (next.has(name)) throw new YuzuhaError('COMMAND_DUPLICATE', `Nome ou alias duplicado: ${name}.`);
      next.set(name, entry);
    }
  }
  add(command: Command): void {
    const entry = this.compile(command);
    for (const name of [entry.definition.name, ...(entry.definition.aliases ?? [])]) {
      if (this.entries.has(name.toLowerCase())) throw new YuzuhaError('COMMAND_DUPLICATE', `Nome ou alias duplicado: ${name}.`);
    }
    this.insert(this.entries, entry);
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
  find(name: string): CompiledCommand | undefined { return this.entries.get(name.toLowerCase()); }
  resolve(name: string, input: string): { compiled: CompiledCommand; input: string } | undefined {
    const root = this.find(name);
    if (!root) return;
    let compiled: CompiledCommand = root;
    while (compiled.children.size) {
      const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(input.trim());
      const child: CompiledCommand | undefined = match ? compiled.children.get(match[1]!.toLowerCase()) : undefined;
      if (!child) break;
      compiled = child; input = match![2] ?? '';
    }
    return { compiled, input };
  }
  list(): Command[] { return [...new Set(this.entries.values())].map(item => snapshot(item.definition)); }
  help(path?: string, prefix = ''): string {
    if (!path) return this.list().filter(command => !command.hidden).map(command => `${commandUsage(command, prefix)}${command.description ? `: ${command.description}` : ''}`).join('\n');
    const [name, ...parts] = path.trim().split(/\s+/);
    const resolved = this.resolve(name ?? '', parts.join(' '));
    return resolved && !resolved.input && !resolved.compiled.command.hidden ? commandHelp(resolved.compiled.command, prefix) : '';
  }
}
