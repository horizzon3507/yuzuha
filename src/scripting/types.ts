import type { CommandContext } from '../commands/context.js';

export interface FunctionDefinition {
  name: string;
  aliases?: string[];
  description: string;
  category: string;
  minArgs: number;
  maxArgs: number;
  usage: string;
  execute: (call: FunctionCall) => unknown | Promise<unknown>;
}

export interface FunctionCall {
  ctx: CommandContext;
  count: number;
  arg(index: number): Promise<unknown>;
  fresh(index: number): Promise<unknown>;
  text(index: number): Promise<string>;
  all(): Promise<unknown[]>;
  /** Verifica saídas intermediárias contra o orçamento do runtime. */
  checkOutput(value: unknown): void;
  /** Aguarda uma operação externa sem consumir o prazo de execução do script. */
  wait<T>(promise: Promise<T>): Promise<T>;
}

export interface Limits { calls: number; depth: number; output: number; timeoutMs: number }
