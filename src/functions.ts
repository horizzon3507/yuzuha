import type { Command } from './context.js';

export { Runtime, defaultLimits, text, truthy } from './runtime.js';
export type { FunctionCall, FunctionDefinition, Limits } from './runtime.js';
export { parse } from './parser.js';
export type { Program, Node, CallNode, TextNode } from './parser.js';
export { builtinFunctions, registerBuiltins } from './scripting/builtins/index.js';
export { validateEmbed } from './scripting/builtins/embeds.js';

/**
 * Marca um comando escrito em function mode. O runtime de funções é ativado
 * automaticamente ao registrar um comando com `code`.
 */
export function script(command: Command): Command {
  return command;
}
