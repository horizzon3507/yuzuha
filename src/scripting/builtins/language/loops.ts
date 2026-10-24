import { YuzuhaError } from '../../../errors.js';
import { text } from '../../values.js';
import { truthy } from '../../values.js';
import { loopFrame, setLoopFrame, LoopControl } from '../../control-flow.js';
import { defineFunctions } from '../definition.js';
import type { FunctionCall } from '../../types.js';
import { integer, requireArray } from './common.js';
import { LOOP_ACCUMULATOR_KEY, LOOP_INDEX_KEY, LOOP_MAX, LOOP_VALUE_KEY } from './state.js';

function snapshot(vars: Map<string, unknown>): Map<string, unknown> {
  return new Map([LOOP_INDEX_KEY, LOOP_VALUE_KEY, LOOP_ACCUMULATOR_KEY]
    .filter(key => vars.has(key)).map(key => [key, vars.get(key)]));
}

function restore(vars: Map<string, unknown>, saved: ReturnType<typeof snapshot>): void {
  for (const key of [LOOP_INDEX_KEY, LOOP_VALUE_KEY, LOOP_ACCUMULATOR_KEY]) {
    if (saved.has(key)) vars.set(key, saved.get(key));
    else vars.delete(key);
  }
}

export async function withLoopState<T>(c: FunctionCall, run: () => Promise<T>): Promise<T> {
  const saved = snapshot(c.ctx.vars);
  const frame = loopFrame(c.ctx);
  // Array callbacks have their own scope but are not break/continue targets.
  setLoopFrame(c.ctx, undefined);
  try { return await run(); }
  finally { restore(c.ctx.vars, saved); setLoopFrame(c.ctx, frame); }
}

/** Corpo pode ocupar vários argumentos; todos são reavaliados por iteração. */
async function runBody(c: FunctionCall, frame: object): Promise<{ value: string; stop: boolean }> {
  let result = '';
  try {
    for (let i = 1; i < c.count; i++) {
      result += text(await c.fresh(i));
      c.checkOutput(result);
    }
  } catch (error) {
    if (!(error instanceof LoopControl) || error.frame !== frame) throw error;
    return { value: result, stop: error.action === 'break' };
  }
  return { value: result, stop: false };
}

export const loopFunctions = defineFunctions(fn => {
  for (const action of ['break', 'continue'] as const) {
    fn(action, 'language', 0, 0, '', action === 'break' ? 'Encerra o loop mais próximo; exige corpo de repeat, forEach ou while.' : 'Avança para a próxima iteração do loop mais próximo.', c => {
      const frame = loopFrame(c.ctx);
      if (typeof frame !== 'object' || frame === null) throw new YuzuhaError('LOOP_CONTEXT', `$${action} exige um corpo de loop ativo.`);
      throw new LoopControl(frame, action);
    });
  }
  fn('while', 'language', 2, 32, '[condição;corpo;...]', 'Reavalia condição e corpo; máximo 1000 iterações, com cancelamento e orçamento compartilhados.', async c => {
    const saved = snapshot(c.ctx.vars);
    const previousFrame = loopFrame(c.ctx);
    const frame = {};
    let result = '';
    try {
      for (let index = 0; ; index++) {
        setLoopFrame(c.ctx, undefined);
        c.ctx.vars.set(LOOP_INDEX_KEY, index);
        c.ctx.vars.delete(LOOP_VALUE_KEY);
        if (!truthy(await c.fresh(0))) return result;
        if (index === LOOP_MAX) throw new YuzuhaError('EXECUTION_LIMIT', `Loop excede ${LOOP_MAX} iterações.`);
        setLoopFrame(c.ctx, frame);
        const part = await runBody(c, frame);
        result += part.value;
        c.checkOutput(result);
        if (part.stop) return result;
      }
    } finally { restore(c.ctx.vars, saved); setLoopFrame(c.ctx, previousFrame); }
  });
  fn('repeat', 'language', 2, 32, '[vezes;corpo;...]', 'Repete o corpo reavaliando a cada iteração; retorna a concatenação.', async c => {
    const times = integer(await c.text(0), 'Vezes');
    if (times < 0) throw new YuzuhaError('REPEAT_COUNT', 'Vezes deve ser ao menos 0.');
    if (times > LOOP_MAX) throw new YuzuhaError('REPEAT_COUNT', `Vezes excede o limite de ${LOOP_MAX}.`);
    const saved = snapshot(c.ctx.vars);
    const previousFrame = loopFrame(c.ctx);
    const frame = {};
    let result = '';
    try {
      for (let i = 0; i < times; i++) {
        setLoopFrame(c.ctx, frame);
        c.ctx.vars.set(LOOP_INDEX_KEY, i);
        c.ctx.vars.delete(LOOP_VALUE_KEY);
        const part = await runBody(c, frame);
        result += part.value;
        c.checkOutput(result);
        if (part.stop) break;
      }
      return result;
    } finally {
      restore(c.ctx.vars, saved);
      setLoopFrame(c.ctx, previousFrame);
    }
  });
  fn('forEach', 'language', 2, 32, '[array;corpo;...]', 'Concatena o corpo para cada item, com $loopValue e $loopIndex.', async c => {
    const items = requireArray(await c.arg(0));
    if (items.length > LOOP_MAX) throw new YuzuhaError('FOREACH', `Array excede o limite de ${LOOP_MAX} itens.`);
    const saved = snapshot(c.ctx.vars);
    const previousFrame = loopFrame(c.ctx);
    const frame = {};
    let result = '';
    try {
      for (let i = 0; i < items.length; i++) {
        setLoopFrame(c.ctx, frame);
        c.ctx.vars.set(LOOP_INDEX_KEY, i);
        c.ctx.vars.set(LOOP_VALUE_KEY, items[i]);
        const part = await runBody(c, frame);
        result += part.value;
        c.checkOutput(result);
        if (part.stop) break;
      }
      return result;
    } finally {
      restore(c.ctx.vars, saved);
      setLoopFrame(c.ctx, previousFrame);
    }
  });
  fn('loopIndex', 'language', 0, 0, '', 'Índice da iteração atual; vazio fora de loops.', c => c.ctx.vars.get(LOOP_INDEX_KEY) ?? '');
  fn('loopValue', 'language', 0, 0, '', 'Valor da iteração atual; vazio fora de loops.', c => c.ctx.vars.has(LOOP_VALUE_KEY) ? c.ctx.vars.get(LOOP_VALUE_KEY) : '');
  fn('loopAccumulator', 'language', 0, 0, '', 'Acumulador atual de $arrayReduce; vazio fora da redução.', c => c.ctx.vars.has(LOOP_ACCUMULATOR_KEY) ? c.ctx.vars.get(LOOP_ACCUMULATOR_KEY) : '');
});
