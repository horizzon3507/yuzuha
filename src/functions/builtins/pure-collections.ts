import { Collection, LimitedCollection } from '@fluxerjs/collection';
import { GuardError } from '../../errors.js';
import { defineFunctions } from './definition.js';
import { withLoopState } from './language/loops.js';
import { LOOP_INDEX_KEY, LOOP_MAX, LOOP_VALUE_KEY } from './language/state.js';
import { truthy } from '../runtime/values.js';

type Key = string | number;
type Entry = [Key, unknown];

function invalid(message: string): never { throw new GuardError(message, 'INVALID_ARGUMENT'); }

function key(value: unknown): Key {
  if (typeof value === 'string' || (typeof value === 'number' && Number.isSafeInteger(value))) return value;
  return invalid('Chave de coleção deve ser texto ou inteiro seguro.');
}

function entries(value: unknown): Entry[] {
  if (!Array.isArray(value) || value.length > LOOP_MAX) return invalid('Coleção deve ter até 1000 pares [chave, valor].');
  const keys = new Set<Key>();
  return value.map(item => {
    if (!Array.isArray(item) || item.length !== 2) return invalid('Entrada de coleção deve ser um par [chave, valor].');
    const id = key(item[0]);
    if (keys.has(id)) return invalid('Chave de coleção duplicada.');
    keys.add(id);
    return [id, item[1]];
  });
}

function count(raw: unknown, min: number): number {
  const value = typeof raw === 'string' && /^\d{1,4}$/.test(raw) ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > LOOP_MAX)
    return invalid(`Quantidade de coleção deve ser inteira entre ${min} e ${LOOP_MAX}.`);
  return value;
}

function capacity(raw: unknown): number | undefined {
  return raw === undefined || raw === null || raw === '' ? undefined : count(raw, 1);
}

export const pureCollectionFunctions = defineFunctions(fn => {
  fn('sdkCollection', 'sdk', 2, 5, '[operação;pares;arg1?;arg2?;arg3?]',
    'Coleção local de até 1000 pares únicos [chave, valor], sem acesso ao cache real. Operações: clone, concat (outros pares), first/last/random (quantidade?), values, text, describe (capacidade?), set (chave;valor;capacidade?), partition (predicado), sweep (predicado?). Predicados usam $loopValue (par) e $loopIndex. set retorna entries/evicted (par removido em FIFO ou null); sweep retorna entries/removed.',
    async c => {
      const op = await c.text(0);
      const input = entries(await c.arg(1));
      if (op === 'set' && c.count >= 4) {
        const id = key(await c.arg(2));
        const value = await c.arg(3);
        const maxSize = c.count === 5 ? capacity(await c.arg(4)) : undefined;
        if (maxSize !== undefined && maxSize < input.length) invalid('Capacidade menor que a coleção.');
        let evicted: Entry | null = null;
        const collection = new LimitedCollection<Key, unknown>({ maxSize, onEvict: (id, value) => { evicted = [id, value]; } });
        for (const [id, value] of input) collection.set(id, value);
        collection.set(id, value);
        if (collection.size > LOOP_MAX) invalid('Coleção excede 1000 entradas.');
        return { entries: [...collection], evicted };
      }
      if (c.count > 3) return invalid('Argumentos de coleção inválidos.');
      if (op === 'partition' || op === 'sweep') {
        if (op === 'partition' && c.count !== 3) invalid('Informe o predicado da partição.');
        if (c.count === 2) return { entries: [], removed: input.length };
        return withLoopState(c, async () => {
          const pass: Entry[] = [], fail: Entry[] = [];
          for (const [index, entry] of input.entries()) {
            c.ctx.vars.set(LOOP_INDEX_KEY, index);
            c.ctx.vars.set(LOOP_VALUE_KEY, entry);
            (truthy(await c.fresh(2)) ? pass : fail).push(entry);
          }
          return op === 'partition' ? [pass, fail] : { entries: fail, removed: pass.length };
        });
      }
      if (op === 'describe') {
        const maxSize = c.count === 3 ? capacity(await c.arg(2)) ?? null : null;
        if (maxSize !== null && maxSize < input.length) invalid('Capacidade menor que a coleção.');
        return { entries: input, maxSize, bounded: maxSize !== null };
      }
      const collection = new Collection<Key, unknown>(input);
      if (op === 'concat' && c.count === 3) {
        const next = collection.concat(new Collection(entries(await c.arg(2))));
        if (next.size > LOOP_MAX) invalid('Coleção excede 1000 entradas.');
        return [...next];
      }
      if (op === 'first' || op === 'last' || op === 'random') {
        if (c.count === 3) return collection[op](count(await c.arg(2), 0));
        return collection[op]() ?? null;
      }
      if (c.count === 2) {
        if (op === 'clone') return input;
        if (op === 'values') return collection.toJSON();
        if (op === 'text') return collection.toString();
      }
      return invalid('Operação de coleção inválida.');
    });
});
