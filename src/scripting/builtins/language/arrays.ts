import { YuzuhaError } from '../../../errors.js';
import { toJson } from '../arguments.js';
import { text } from '../../values.js';
import { defineFunctions } from '../definition.js';
import { deepEqual, integer, jsonClone, requireArray, typedScalar } from './common.js';

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  const left = text(a), right = text(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

export const arrayFunctions = defineFunctions(fn => {
  fn('array', 'language', 0, 64, '[valor;...]', 'Monta um array com os valores informados.', async c => {
    const result: unknown[] = [];
    for (let i = 0; i < c.count; i++) result.push(typedScalar(jsonClone(await c.arg(i))));
    return result;
  });
  fn('arrayPush', 'language', 2, 64, '[array;valor;...]', 'Retorna novo array com os valores adicionados.', async c => {
    const base = requireArray(await c.arg(0));
    const result = jsonClone(base) as unknown[];
    for (let i = 1; i < c.count; i++) result.push(typedScalar(jsonClone(await c.arg(i))));
    return result;
  });
  fn('arrayGet', 'language', 2, 3, '[array;índice;padrão?]', 'Obtém item por índice; retorna padrão se ausente.', async c => {
    const base = requireArray(await c.arg(0));
    const index = integer(await c.text(1), 'Índice');
    if (index < 0 || index >= base.length) return c.count > 2 ? await c.arg(2) : '';
    return base[index];
  });
  fn('arrayLength', 'language', 1, 1, '[array]', 'Quantidade de itens do array.', async c => requireArray(await c.arg(0)).length);
  fn('arraySlice', 'language', 2, 3, '[array;início;fim?]', 'Fatia do array; fim exclusivo.', async c => {
    const base = requireArray(await c.arg(0));
    const start = integer(await c.text(1), 'Início');
    const end = c.count > 2 ? integer(await c.text(2), 'Fim') : base.length;
    if (start < 0 || start > base.length) throw new YuzuhaError('INDEX', 'Início fora do intervalo.');
    if (end < start || end > base.length) throw new YuzuhaError('INDEX', 'Fim fora do intervalo.');
    return base.slice(start, end);
  });
  fn('arrayIncludes', 'language', 2, 2, '[array;valor]', 'Verifica se o array contém o valor.', async c => {
    const base = requireArray(await c.arg(0));
    const target = typedScalar(toJson(await c.arg(1)));
    return base.some(item => deepEqual(item, target));
  });
  fn('arrayIndexOf', 'language', 2, 2, '[array;valor]', 'Posição da primeira ocorrência, ou -1.', async c => {
    const base = requireArray(await c.arg(0));
    const target = typedScalar(toJson(await c.arg(1)));
    return base.findIndex(item => deepEqual(item, target));
  });
  fn('arrayJoin', 'language', 2, 2, '[array;separador]', 'Junta itens convertidos para texto.', async c => {
    const base = requireArray(await c.arg(0));
    const separator = await c.text(1);
    return base.map(item => text(item)).join(separator);
  });
  fn('arraySort', 'language', 1, 2, '[array;direção?]', 'Ordena cópia do array; direção asc ou desc.', async c => {
    const base = requireArray(await c.arg(0));
    const direction = c.count > 1 ? (await c.text(1)).trim().toLowerCase() : 'asc';
    if (direction !== 'asc' && direction !== 'desc') throw new YuzuhaError('SORT', 'Direção deve ser asc ou desc.');
    const result = [...base].sort(compareValues);
    if (direction === 'desc') result.reverse();
    return result;
  });
  fn('arrayReverse', 'language', 1, 1, '[array]', 'Retorna cópia invertida do array.', async c => [...requireArray(await c.arg(0))].reverse());
  fn('arrayUnique', 'language', 1, 1, '[array]', 'Remove duplicados, mantendo a primeira ocorrência.', async c => {
    const base = requireArray(await c.arg(0));
    const result: unknown[] = [];
    const primitives = new Set<unknown>(), objects: unknown[] = [];
    const negativeZero = Symbol();
    for (const item of base) {
      if (item !== null && typeof item === 'object') {
        if (objects.some(known => deepEqual(known, item))) continue;
        objects.push(item);
      } else {
        const key = Object.is(item, -0) ? negativeZero : item;
        if (primitives.has(key)) continue;
        primitives.add(key);
      }
      result.push(item);
    }
    return result;
  });
  for (const operation of ['Union', 'Intersection', 'Difference'] as const) {
    const descriptions = {
      Union: 'União sem duplicados; preserva a ordem da primeira ocorrência.',
      Intersection: 'Itens únicos do primeiro array presentes no segundo.',
      Difference: 'Itens únicos do primeiro array ausentes do segundo.',
    };
    fn(`array${operation}`, 'language', 2, 2, '[array;outroArray]', descriptions[operation] + ' Máximo de 1000 itens somados.', async c => {
      const left = requireArray(await c.arg(0)), right = requireArray(await c.arg(1));
      if (left.length + right.length > 1000) throw new YuzuhaError('ARRAY_SET', 'Operações de conjuntos aceitam até 1000 itens somados.');
      const result: unknown[] = [];
      for (const item of operation === 'Union' ? [...left, ...right] : left) {
        if (result.some(known => deepEqual(known, item))) continue;
        const contains = operation === 'Union' || right.some(known => deepEqual(known, item));
        if (operation === 'Difference' ? !contains : contains) result.push(item);
      }
      return result;
    });
  }
  fn('range', 'language', 2, 3, '[início;fim;passo?]', 'Sequência de números; no máximo 1000 itens.', async c => {
    const start = integer(await c.text(0), 'Início');
    const end = integer(await c.text(1), 'Fim');
    const step = c.count > 2 ? integer(await c.text(2), 'Passo') : start <= end ? 1 : -1;
    if (step === 0) throw new YuzuhaError('RANGE', 'Passo não pode ser zero.');
    if ((step > 0 && start > end) || (step < 0 && start < end)) throw new YuzuhaError('RANGE', 'Intervalo vazio para o passo informado.');
    const size = (BigInt(end) - BigInt(start)) / BigInt(step) + 1n;
    if (size > 1000n) throw new YuzuhaError('RANGE', 'Intervalo excede 1000 itens.');
    return Array.from({ length: Number(size) }, (_, index) => Number(BigInt(start) + BigInt(index) * BigInt(step)));
  });
  fn('paginate', 'language', 3, 3, '[array;página;tamanho]', 'Página 1-based do array.', async c => {
    const base = requireArray(await c.arg(0));
    const page = integer(await c.text(1), 'Página');
    const size = integer(await c.text(2), 'Tamanho');
    if (page < 1) throw new YuzuhaError('PAGINATE', 'Página começa em 1.');
    if (size < 1) throw new YuzuhaError('PAGINATE', 'Tamanho deve ser ao menos 1.');
    return base.slice((page - 1) * size, page * size);
  });
  fn('arrayConcat', 'language', 1, 64, '[array;...]', 'Concatena arrays sem alterar os originais.', async c => {
    const result: unknown[] = [];
    for (let index = 0; index < c.count; index++) {
      for (const item of requireArray(await c.arg(index))) result.push(item);
      c.checkOutput(result);
    }
    return result;
  });
  fn('arrayFlat', 'language', 1, 2, '[array;profundidade?]', 'Achata arrays; profundidade inteira entre 0 e 64.', async c => {
    const items = requireArray(await c.arg(0));
    const depth = c.count > 1 ? integer(await c.text(1), 'Profundidade') : 1;
    if (depth < 0 || depth > 64) throw new YuzuhaError('ARRAY_DEPTH', 'Profundidade deve estar entre 0 e 64.');
    return items.flat(depth);
  });
  fn('arrayChunk', 'language', 2, 2, '[array;tamanho]', 'Divide array em grupos do tamanho indicado.', async c => {
    const items = requireArray(await c.arg(0));
    const size = integer(await c.text(1), 'Tamanho');
    if (size < 1) throw new YuzuhaError('ARRAY_CHUNK', 'Tamanho deve ser ao menos 1.');
    const result: unknown[][] = [];
    for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
    return result;
  });
});
