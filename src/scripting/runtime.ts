import type { CommandContext } from '../commands/context.js';
import type { Program } from './ast.js';
import { Evaluator } from './evaluator.js';
import { defaultLimits, resolveLimits } from './limits.js';
import { parse } from './parser.js';
import { FunctionRegistry } from './registry.js';
import type { FunctionDefinition, Limits } from './types.js';

export class Runtime {
  private readonly registry = new FunctionRegistry();
  readonly limits: Readonly<Limits>;

  constructor(limits: Limits = defaultLimits) {
    this.limits = resolveLimits(limits);
  }

  register(fn: FunctionDefinition): this {
    this.registry.register(fn);
    return this;
  }

  registerAll(functions: FunctionDefinition[]): this {
    this.registry.registerAll(functions);
    return this;
  }

  functions(): FunctionDefinition[] { return this.registry.functions(); }

  compile(source: string, file?: string): Program {
    const program = parse(source, file);
    this.registry.validate(program);
    return program;
  }

  execute(program: Program, ctx: CommandContext): Promise<unknown> {
    return new Evaluator(program, ctx, this.registry, this.limits).run();
  }
}
