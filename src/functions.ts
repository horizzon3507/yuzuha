import type { Command } from './context.js';
import { Runtime } from './functions/runtime/runtime.js';
import { defaultLimits } from './functions/runtime/limits.js';
import { registerBuiltins } from './functions/builtins/index.js';
import type { FunctionDefinition, Limits } from './functions/runtime/types.js';
import type { ScriptEngine } from './ports/script-engine.js';

export { Runtime } from './functions/runtime/runtime.js';
export { defaultLimits } from './functions/runtime/limits.js';
export { text, truthy } from './functions/runtime/values.js';
export type { FunctionCall, FunctionDefinition, Limits } from './functions/runtime/types.js';
export { parse } from './functions/runtime/parser.js';
export type { Program, Node, CallNode, TextNode } from './functions/runtime/ast.js';
export { builtinFunctions, registerBuiltins } from './functions/builtins/index.js';
export { validateEmbed } from './functions/builtins/embeds.js';
export type { ScriptEngine, ScriptFunctionDefinition, ScriptLimits } from './ports/script-engine.js';

/**
 * Marca um comando escrito em function mode. O bot precisa de um engine;
 * veja `functions()`.
 */
export function script(command: Command): Command {
  return command;
}

export interface FunctionsOptions {
  limits?: Partial<Limits>;
  functions?: FunctionDefinition[];
}

/** Cria o motor de function mode com os builtins registrados. Use `engine: functions()` no bot. */
export function functions(options: FunctionsOptions = {}): ScriptEngine {
  const runtime = new Runtime({ ...defaultLimits, ...options.limits });
  if (options.functions?.length) runtime.registerAll(options.functions);
  return registerBuiltins(runtime);
}
