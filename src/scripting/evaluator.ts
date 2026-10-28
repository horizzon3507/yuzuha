import { performance } from 'node:perf_hooks';
import type { CommandContext } from '../commands/context.js';
import { GuardError, PartialModerationError, ScriptError, StopExecution, YuzuhaError } from '../errors.js';
import type { CallNode, Node, Program } from './ast.js';
import type { FunctionRegistry } from './registry.js';
import type { Limits } from './types.js';
import { text } from './values.js';
import { LoopControl } from './control-flow.js';

export class Evaluator {
  private calls = 0;
  private deadline: number;
  private waits = 0;
  private waitStarted = 0;

  constructor(
    private readonly program: Program,
    private readonly ctx: CommandContext,
    private readonly registry: FunctionRegistry,
    private readonly limits: Readonly<Limits>,
  ) {
    this.deadline = performance.now() + limits.timeoutMs;
  }

  async run(): Promise<unknown> {
    try { return await this.evaluate(this.program.nodes, 0); }
    catch (error) { if (error instanceof StopExecution) return ''; throw error; }
  }

  private check(offset: number, depth: number): void {
    if (this.ctx.signal.aborted) throw this.error('EXECUTION_ABORTED', 'Execução cancelada.', offset);
    if (this.calls > this.limits.calls || depth > this.limits.depth || performance.now() > this.deadline) {
      throw this.error('EXECUTION_LIMIT', 'Limite de execução excedido.', offset);
    }
  }

  private checkOutput(value: unknown, offset: number): void {
    if (text(value).length > this.limits.output) throw this.error('OUTPUT_LIMIT', 'Saída excede o limite.', offset);
  }

  private error(code: string, message: string, offset: number): ScriptError {
    return new ScriptError(code, message, this.program.source, offset, this.program.file);
  }

  private evaluate(nodes: Node[], depth: number): unknown | Promise<unknown> {
    this.check(nodes[0]?.offset ?? 0, depth);
    if (nodes.length === 0) return '';
    if (nodes.length === 1) {
      const node = nodes[0]!;
      if (node.kind === 'call') return this.invoke(node, depth);
      this.checkOutput(node.value, node.offset);
      return node.value;
    }
    return this.sequence(nodes, depth);
  }

  private async sequence(nodes: Node[], depth: number): Promise<unknown> {
    let soleCall: CallNode | undefined;
    for (const node of nodes) {
      if (node.kind === 'text' && !node.value.trim()) continue;
      if (node.kind === 'text' || soleCall) { soleCall = undefined; break; }
      soleCall = node;
    }
    const soleValue = soleCall ? await this.invoke(soleCall, depth) : undefined;
    if (soleValue !== null && typeof soleValue === 'object') return soleValue;
    let result = '';
    for (const node of nodes) {
      this.check(node.offset, depth);
      result += node.kind === 'text' ? node.value : text(node === soleCall ? soleValue : await this.invoke(node, depth));
      this.checkOutput(result, node.offset);
    }
    return result;
  }

  private async invoke(node: CallNode, depth: number): Promise<unknown> {
    this.calls++;
    this.check(node.offset, depth);
    const fn = this.registry.resolve(node, this.program);
    let values: (Promise<unknown> | undefined)[] | undefined;
    const fresh = (index: number): Promise<unknown> => {
      try { return Promise.resolve(this.evaluate(node.args[index] ?? [], depth + 1)); }
      catch (error) { return Promise.reject(error); }
    };
    const arg = (index: number): Promise<unknown> => {
      values ??= [];
      return values[index] ??= fresh(index);
    };
    try {
      const result = await fn.execute({
        ctx: this.ctx,
        count: node.args.length,
        arg,
        fresh,
        checkOutput: value => this.checkOutput(value, node.offset),
        text: async index => text(await arg(index)),
        all: async () => {
          const result: unknown[] = [];
          for (let i = 0; i < node.args.length; i++) result.push(await arg(i));
          return result;
        },
        wait: async <T>(operation: Promise<T>): Promise<T> => {
          if (this.waits++ === 0) this.waitStarted = performance.now();
          try { return await operation; }
          finally {
            const finished = performance.now();
            this.deadline += finished - this.waitStarted;
            this.waitStarted = finished;
            this.waits--;
          }
        },
      });
      this.check(node.offset, depth);
      this.checkOutput(result, node.offset);
      return result;
    } catch (error) {
      if (error instanceof GuardError || error instanceof StopExecution || error instanceof ScriptError || error instanceof PartialModerationError || error instanceof LoopControl) throw error;
      if (error instanceof YuzuhaError && ['EXECUTION_LIMIT', 'OUTPUT_LIMIT', 'EXECUTION_ABORTED'].includes(error.code)) {
        throw this.error(error.code, error.message, node.offset);
      }
      throw new ScriptError('FUNCTION_ERROR', `Falha em $${node.name}: ${error instanceof YuzuhaError ? error.message : 'a operação não pôde ser concluída'}.`,
        this.program.source, node.offset, this.program.file, { cause: error });
    }
  }
}
