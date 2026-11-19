import type { CanvasBuilder } from '../../services/canvas.js';
import type { FunctionCall } from './types.js';

export interface CanvasExecutionState {
  canvases: Map<string, CanvasBuilder>;
  renderAttempts: number;
}

export class ScriptCall implements FunctionCall {
  #canvas: CanvasExecutionState | undefined;

  constructor(
    public ctx: FunctionCall['ctx'],
    public count: number,
    public arg: FunctionCall['arg'],
    public fresh: FunctionCall['fresh'],
    public checkOutput: FunctionCall['checkOutput'],
    public text: FunctionCall['text'],
    public all: FunctionCall['all'],
    public wait: FunctionCall['wait'],
    state: CanvasExecutionState,
  ) { this.#canvas = state; }

  static state(call: FunctionCall): CanvasExecutionState {
    if (!(#canvas in call) || !call.#canvas) {
      throw Object.assign(new Error('Estado de Canvas fora da execução de um Evaluator.'), { code: 'CANVAS_STATE' });
    }
    return call.#canvas;
  }

  static release(call: FunctionCall): void { if (#canvas in call) call.#canvas = undefined; }
}

export function createCanvasExecutionState(): CanvasExecutionState {
  return { canvases: new Map(), renderAttempts: 0 };
}

export function releaseCanvasExecutionCall(call: FunctionCall): void { ScriptCall.release(call); }
export function clearCanvasExecution(state: CanvasExecutionState): void { state.canvases.clear(); state.renderAttempts = 0; }

export function canvasExecution(call: FunctionCall): CanvasExecutionState {
  return ScriptCall.state(call);
}
