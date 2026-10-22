import type { FunctionCall, FunctionDefinition } from '../types.js';

type RegisterBuiltin = (
  name: string, category: string, minArgs: number, maxArgs: number,
  usage: string, description: string,
  execute: (call: FunctionCall) => unknown | Promise<unknown>, aliases?: string[],
) => void;

export function defineFunctions(setup: (register: RegisterBuiltin) => void): FunctionDefinition[] {
  const definitions: FunctionDefinition[] = [];
  setup((name, category, minArgs, maxArgs, usage, description, execute, aliases) => {
    definitions.push({ name, category, minArgs, maxArgs, usage: `$${name}${usage}`, description, execute, aliases });
  });
  return definitions;
}
