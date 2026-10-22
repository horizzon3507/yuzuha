import { YuzuhaError } from '../../../errors.js';
import { text } from '../../values.js';
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
  try { return await run(); }
  finally { restore(c.ctx.vars, saved); }
}

/** Corpo pode ocupar vários argumentos; todos são reavaliados por iteração. */
async function runBody(c: FunctionCall): Promise<string> {
  let result = '';
  for (let i = 1; i < c.count; i++) {
    result += text(await c.fresh(i));
    c.checkOutput(result);
  }
  return result;
}

export const loopFunctions = defineFunctions(fn => {
  fn('repeat', 'language', 2, 32, '[vezes;corpo;...]', 'Repete o corpo reavaliando a cada iteração; retorna a concatenação.', async c => {
    const times = integer(await c.text(0), 'Vezes');
    if (times < 0) throw new YuzuhaError('REPEAT_COUNT', 'Vezes deve ser ao menos 0.');
    if (times > LOOP_MAX) throw new YuzuhaError('REPEAT_COUNT', `Vezes excede o limite de ${LOOP_MAX}.`);
    const saved = snapshot(c.ctx.vars);
    let result = '';
    try {
      for (let i = 0; i < times; i++) {
        c.ctx.vars.set(LOOP_INDEX_KEY, i);
        c.ctx.vars.delete(LOOP_VALUE_KEY);
        result += await runBody(c);
        c.checkOutput(result);
      }
      return result;
    } finally {
      restore(c.ctx.vars, saved);
    }
  });
  fn('forEach', 'language', 2, 32, '[array;corpo;...]', 'Concatena o corpo para cada item, com $loopValue e $loopIndex.', async c => {
    const items = requireArray(await c.arg(0));
    if (items.length > LOOP_MAX) throw new YuzuhaError('FOREACH', `Array excede o limite de ${LOOP_MAX} itens.`);
    const saved = snapshot(c.ctx.vars);
    let result = '';
    try {
      for (let i = 0; i < items.length; i++) {
        c.ctx.vars.set(LOOP_INDEX_KEY, i);
        c.ctx.vars.set(LOOP_VALUE_KEY, items[i]);
        result += await runBody(c);
        c.checkOutput(result);
      }
      return result;
    } finally {
      restore(c.ctx.vars, saved);
    }
  });
  fn('loopIndex', 'language', 0, 0, '', 'Índice da iteração atual; vazio fora de loops.', c => c.ctx.vars.get(LOOP_INDEX_KEY) ?? '');
  fn('loopValue', 'language', 0, 0, '', 'Valor da iteração atual; vazio fora de loops.', c => c.ctx.vars.has(LOOP_VALUE_KEY) ? c.ctx.vars.get(LOOP_VALUE_KEY) : '');
  fn('loopAccumulator', 'language', 0, 0, '', 'Acumulador atual de $arrayReduce; vazio fora da redução.', c => c.ctx.vars.has(LOOP_ACCUMULATOR_KEY) ? c.ctx.vars.get(LOOP_ACCUMULATOR_KEY) : '');
});
