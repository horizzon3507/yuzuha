import { randomInt } from 'node:crypto';
import { YuzuhaError } from '../../errors.js';
import { truthy } from '../values.js';
import { finite } from './arguments.js';
import { defineFunctions } from './definition.js';

export const valueFunctions = defineFunctions(fn => {
  fn('prop', 'values', 2, 2, '[objeto;propriedade]', 'Obtém uma propriedade própria de objeto.', async c => {
    const value = await c.arg(0), key = await c.text(1);
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) return '';
    return (value as Record<string, unknown>)[key];
  });
  fn('eq', 'values', 2, 2, '[a;b]', 'Compara igualdade textual.', async c => (await c.text(0)) === (await c.text(1)));
  fn('ne', 'values', 2, 2, '[a;b]', 'Compara diferença textual.', async c => (await c.text(0)) !== (await c.text(1)));
  fn('not', 'values', 1, 1, '[valor]', 'Inverte condição.', async c => !truthy(await c.arg(0)));
  fn('and', 'values', 2, 32, '[a;b;...]', 'E lógico com avaliação curta.', async c => {
    for (let i = 0; i < c.count; i++) if (!truthy(await c.arg(i))) return false;
    return true;
  });
  fn('or', 'values', 2, 32, '[a;b;...]', 'OU lógico com avaliação curta.', async c => {
    for (let i = 0; i < c.count; i++) if (truthy(await c.arg(i))) return true;
    return false;
  });
  fn('math', 'values', 3, 3, '[a;operador;b]', 'Calcula +, -, *, / ou % sem eval.', async c => {
    const a = finite(await c.text(0)), op = await c.text(1), b = finite(await c.text(2));
    const result = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : op === '/' ? a / b : op === '%' ? a % b : NaN;
    if (!Number.isFinite(result)) throw new YuzuhaError('MATH', 'Operação inválida ou resultado não finito.');
    return result;
  });
  fn('random', 'values', 2, 2, '[mínimo;máximo]', 'Inteiro aleatório com ambos os limites inclusivos.', async c => {
    const min = finite(await c.text(0)), max = finite(await c.text(1));
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min || max - min >= 2 ** 48 || !Number.isSafeInteger(max + 1)) throw new YuzuhaError('RANDOM', 'Intervalo inteiro inválido.');
    return randomInt(min, max + 1);
  });
  for (const [name, convert] of Object.entries({ lowercase: (s: string) => s.toLowerCase(), uppercase: (s: string) => s.toUpperCase(), trim: (s: string) => s.trim(), length: (s: string) => [...s].length })) {
    fn(name, 'values', 1, 1, '[texto]', 'Transformação de texto.', async c => convert(await c.text(0)));
  }
  fn('replace', 'values', 3, 3, '[texto;busca;substituição]', 'Substitui todas as ocorrências literais.', async c => {
    const value = await c.text(0), search = await c.text(1), replacement = await c.text(2);
    if (!search) throw new YuzuhaError('REPLACE', 'Busca vazia não é permitida.');
    if (value.length * Math.max(1, replacement.length) > 1_000_000) throw new YuzuhaError('REPLACE', 'Resultado potencial excede o limite.');
    return value.replaceAll(search, () => replacement);
  });
  fn('join', 'values', 2, 32, '[separador;valor;...]', 'Junta valores.', async c => {
    const separator = await c.text(0), values: string[] = [];
    for (let i = 1; i < c.count; i++) values.push(await c.text(i));
    return values.join(separator);
  });
  fn('timestamp', 'values', 0, 0, '', 'Timestamp Unix em milissegundos.', () => Date.now());
});
