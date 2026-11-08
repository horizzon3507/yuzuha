export interface ScriptLimits { calls: number; depth: number; output: number; timeoutMs: number }

/** Chamada de função `$` vista pela framework; a forma completa vive em `yuzuha/functions`. */
export interface ScriptFunctionCall {
  /** O contexto concreto é fornecido pelo engine; em `yuzuha/functions` ele é tipado. */
  ctx: any;
  count: number;
  arg(index: number): Promise<unknown>;
  fresh(index: number): Promise<unknown>;
  text(index: number): Promise<string>;
  all(): Promise<unknown[]>;
  checkOutput(value: unknown): void;
  wait<T>(promise: Promise<T>): Promise<T>;
}

export interface ScriptFunctionDefinition {
  name: string;
  aliases?: string[];
  description: string;
  category: string;
  minArgs: number;
  maxArgs: number;
  usage: string;
  execute: (call: ScriptFunctionCall) => unknown | Promise<unknown>;
}

/**
 * Motor de function mode instalado no bot. O programa compilado e o contexto
 * de execução são opacos para a framework; `yuzuha/functions` provê a
 * implementação de referência via `functions()`.
 */
/** Programas compilados executam na engine que compilou o programa. */
export interface ScriptEngine {
  readonly limits: Readonly<ScriptLimits>;
  compile(code: string, name?: string): unknown;
  execute(program: unknown, ctx: unknown): Promise<unknown>;
  functions(): ScriptFunctionDefinition[];
  registerAll(definitions: ScriptFunctionDefinition[]): unknown;
  /** Cópia temporária para validar instalações antes de confirmá-las. */
  fork(): ScriptEngine;
  text(value: unknown): string;
}
