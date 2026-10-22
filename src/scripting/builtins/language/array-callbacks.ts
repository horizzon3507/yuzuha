import { YuzuhaError } from '../../../errors.js';
import type { FunctionCall } from '../../types.js';
import { text, truthy } from '../../values.js';
import { defineFunctions } from '../definition.js';
import { requireArray } from './common.js';
import { withLoopState } from './loops.js';
import { LOOP_ACCUMULATOR_KEY, LOOP_INDEX_KEY, LOOP_MAX, LOOP_VALUE_KEY } from './state.js';

async function items(c: FunctionCall): Promise<unknown[]> {
  const value = requireArray(await c.arg(0));
  if (value.length > LOOP_MAX) throw new YuzuhaError('EXECUTION_LIMIT', `Array excede o limite de ${LOOP_MAX} itens.`);
  return [...value];
}

function iteration(c: FunctionCall, values: unknown[], index: number): void {
  c.ctx.vars.set(LOOP_INDEX_KEY, index);
  c.ctx.vars.set(LOOP_VALUE_KEY, values[index]);
}

export const arrayCallbackFunctions = defineFunctions(fn => {
  for (const [name, description] of [
    ['arrayMap', 'Retorna um array com o resultado da expressão para cada item.'],
    ['arrayFilter', 'Retorna os itens cuja expressão é verdadeira.'],
    ['arraySome', 'Retorna true no primeiro item com expressão verdadeira; false se nenhum.'],
    ['arrayEvery', 'Retorna false no primeiro item com expressão falsa; true se todos, inclusive array vazio.'],
    ['arrayFind', 'Retorna o primeiro item com expressão verdadeira, ou null se ausente.'],
  ] as const) {
    fn(name, 'language', 2, 2, '[array;expressão]', `${description} Usa $loopValue/$loopIndex; máximo 1000 itens.`, async c => {
      const values = await items(c);
      return withLoopState(c, async () => {
        const result: unknown[] = [];
        for (let index = 0; index < values.length; index++) {
          iteration(c, values, index);
          const value = await c.fresh(1);
          const matches = truthy(value);
          if (name === 'arraySome' && matches) return true;
          if (name === 'arrayEvery' && !matches) return false;
          if (name === 'arrayFind' && matches) return values[index];
          if (name === 'arrayMap') result.push(value);
          if (name === 'arrayFilter' && matches) result.push(values[index]);
          c.checkOutput(result);
        }
        if (name === 'arraySome') return false;
        if (name === 'arrayEvery') return true;
        if (name === 'arrayFind') return null;
        return result;
      });
    });
  }
  fn('arrayReduce', 'language', 3, 3, '[array;inicial;expressão]', 'Reduz até 1000 itens usando $loopAccumulator, $loopValue e $loopIndex.', async c => {
    const values = await items(c);
    let accumulator = await c.arg(1);
    return withLoopState(c, async () => {
      for (let index = 0; index < values.length; index++) {
        iteration(c, values, index);
        c.ctx.vars.set(LOOP_ACCUMULATOR_KEY, accumulator);
        accumulator = await c.fresh(2);
        c.checkOutput(accumulator);
      }
      return accumulator;
    });
  });
  fn('arraySortBy', 'language', 2, 3, '[array;chave;direção?]', 'Ordena até 1000 itens por chaves de mesmo tipo, texto ou número; calculadas uma vez por item. Asc/desc preservam empates.', async c => {
    const values = await items(c);
    const direction = c.count > 2 ? (await c.text(2)).trim().toLowerCase() : 'asc';
    if (direction !== 'asc' && direction !== 'desc') throw new YuzuhaError('SORT', 'Direção deve ser asc ou desc.');
    return withLoopState(c, async () => {
      const keyed: { value: unknown; key: string | number }[] = [];
      for (let index = 0; index < values.length; index++) {
        iteration(c, values, index);
        const key = await c.fresh(1);
        if (typeof key !== 'string' && (typeof key !== 'number' || !Number.isFinite(key))) {
          throw new YuzuhaError('SORT_KEY', 'Chave de ordenação deve ser texto ou número finito.');
        }
        if (keyed.length && typeof keyed[0]!.key !== typeof key) {
          throw new YuzuhaError('SORT_KEY', 'Chaves de ordenação devem ter o mesmo tipo.');
        }
        keyed.push({ value: values[index], key });
      }
      const sign = direction === 'asc' ? 1 : -1;
      return keyed.sort((a, b) => {
        const left = typeof a.key === 'number' && typeof b.key === 'number' ? a.key : text(a.key);
        const right = typeof a.key === 'number' && typeof b.key === 'number' ? b.key : text(b.key);
        return (left < right ? -1 : left > right ? 1 : 0) * sign;
      }).map(item => item.value);
    });
  });
});
