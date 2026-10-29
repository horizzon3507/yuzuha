import type { CanvasBuilder } from '../services/canvas.js';
import type { FunctionCall } from './types.js';

export interface CanvasExecutionState {
  canvases: Map<string, CanvasBuilder>;
  renderAttempts: number;
}

const callStates = new WeakMap<FunctionCall, CanvasExecutionState>();

export function createCanvasExecutionState(): CanvasExecutionState {
  return { canvases: new Map(), renderAttempts: 0 };
}

export function associateCanvasExecution(call: FunctionCall, state: CanvasExecutionState): void { callStates.set(call, state); }
export function releaseCanvasExecutionCall(call: FunctionCall): void { callStates.delete(call); }
export function clearCanvasExecution(state: CanvasExecutionState): void { state.canvases.clear(); state.renderAttempts = 0; }

export function canvasExecution(call: FunctionCall): CanvasExecutionState {
  const state = callStates.get(call);
  if (!state) throw Object.assign(new Error('Estado de Canvas fora da execução de um Evaluator.'), { code: 'CANVAS_STATE' });
  return state;
}
