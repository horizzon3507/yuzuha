import { ScriptError, YuzuhaError } from '../errors.js';
import type { CallNode, Node, Program } from './ast.js';
import type { FunctionDefinition } from './types.js';

export class FunctionRegistry {
  private entries = new Map<string, FunctionDefinition>();

  register(definition: FunctionDefinition): void {
    const names = [definition.name, ...(definition.aliases ?? [])];
    if (!Number.isSafeInteger(definition.minArgs) || !Number.isSafeInteger(definition.maxArgs)
      || definition.minArgs < 0 || definition.maxArgs < definition.minArgs) {
      throw new YuzuhaError('FUNCTION', 'Aridade inválida.');
    }
    if (typeof definition.execute !== 'function') throw new YuzuhaError('FUNCTION', 'Função precisa de execute.');
    const normalized = names.map(name => name.replace(/^\$/, '').toLowerCase());
    if (new Set(normalized).size !== normalized.length) throw new YuzuhaError('FUNCTION', 'Alias duplicado.');
    for (const name of normalized) {
      if (!/^[a-z_][a-z_0-9]*$/.test(name) || this.entries.has(name)) {
        throw new YuzuhaError('FUNCTION', `Função inválida ou duplicada: $${name}.`);
      }
    }
    const fn = Object.freeze({ ...definition, aliases: definition.aliases ? [...definition.aliases] : undefined });
    if (fn.aliases) Object.freeze(fn.aliases);
    for (const name of normalized) this.entries.set(name, fn);
  }

  registerAll(definitions: FunctionDefinition[]): void {
    const staged = new FunctionRegistry();
    for (const definition of [...this.functions(), ...definitions]) staged.register(definition);
    this.entries = staged.entries;
  }

  functions(): FunctionDefinition[] { return [...new Set(this.entries.values())]; }

  resolve(node: CallNode, program: Program): FunctionDefinition {
    const fn = this.entries.get(node.name.toLowerCase());
    if (!fn) throw new ScriptError('UNKNOWN_FUNCTION', `Função desconhecida: $${node.name}.`, program.source, node.offset, program.file);
    if (node.args.length < fn.minArgs || node.args.length > fn.maxArgs) {
      throw new ScriptError('ARITY', `Uso: ${fn.usage}`, program.source, node.offset, program.file);
    }
    return fn;
  }

  validate(program: Program): void {
    const visit = (nodes: Node[]) => {
      for (const node of nodes) {
        if (node.kind !== 'call') continue;
        this.resolve(node, program);
        node.args.forEach(visit);
      }
    };
    visit(program.nodes);
  }
}
