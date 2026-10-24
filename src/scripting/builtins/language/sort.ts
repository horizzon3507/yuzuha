import { YuzuhaError } from '../../../errors.js';
import { defineFunctions } from '../definition.js';
import { requireArray } from './common.js';
import { withLoopState } from './loops.js';
import { LOOP_MAX } from './state.js';

const LEFT = '__sortLeft';
const RIGHT = '__sortRight';

export const comparatorFunctions = defineFunctions(fn => {
  fn('sortLeft', 'language', 0, 0, '', 'Item da esquerda no comparador de arraySortWith; vazio fora dele.', c => c.ctx.vars.has(LEFT) ? c.ctx.vars.get(LEFT) : '');
  fn('sortRight', 'language', 0, 0, '', 'Item da direita no comparador de arraySortWith; vazio fora dele.', c => c.ctx.vars.has(RIGHT) ? c.ctx.vars.get(RIGHT) : '');
  fn('arraySortWith', 'language', 2, 2, '[array;comparador]', 'Ordenação estável com expressão numérica negativa/zero/positiva; máximo 1000 itens e 10000 comparações.', async c => {
    const input = requireArray(await c.arg(0));
    if (input.length > LOOP_MAX) throw new YuzuhaError('EXECUTION_LIMIT', `Array excede ${LOOP_MAX} itens.`);
    const saved = new Map([LEFT, RIGHT].filter(key => c.ctx.vars.has(key)).map(key => [key, c.ctx.vars.get(key)]));
    return withLoopState(c, async () => {
      let values = [...input];
      let comparisons = 0;
      try {
        for (let width = 1; width < values.length; width *= 2) {
          const merged: unknown[] = [];
          for (let start = 0; start < values.length; start += 2 * width) {
            const middle = Math.min(start + width, values.length);
            const end = Math.min(start + 2 * width, values.length);
            let left = start, right = middle;
            while (left < middle && right < end) {
              if (++comparisons > 10_000) throw new YuzuhaError('EXECUTION_LIMIT', 'Limite de comparações excedido.');
              c.ctx.vars.set(LEFT, values[left]);
              c.ctx.vars.set(RIGHT, values[right]);
              const raw = await c.fresh(1);
              const order = typeof raw === 'number' || (typeof raw === 'string' && raw.trim()) ? Number(raw) : NaN;
              if (!Number.isFinite(order)) throw new YuzuhaError('SORT_COMPARATOR', 'Comparador deve retornar um número finito.');
              merged.push(order <= 0 ? values[left++] : values[right++]);
            }
            merged.push(...values.slice(left, middle), ...values.slice(right, end));
          }
          values = merged;
        }
        c.checkOutput(values);
        return values;
      } finally {
        for (const key of [LEFT, RIGHT]) {
          if (saved.has(key)) c.ctx.vars.set(key, saved.get(key));
          else c.ctx.vars.delete(key);
        }
      }
    });
  });
});
