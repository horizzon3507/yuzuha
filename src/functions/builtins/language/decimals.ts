import { decimal, decimalCompare, decimalRound } from '../../../domain/decimal.js';
import { defineFunctions } from '../definition.js';
import { integer } from './common.js';

export const decimalFunctions = defineFunctions(fn => {
  fn('decimal', 'language', 3, 4, '[a;operador;b;casas?]', 'Aritmética decimal exata em texto, até 1000 dígitos; divisão usa 18 casas por padrão e empates arredondam para longe de zero.', async c =>
    decimal(await c.text(0), await c.text(1), await c.text(2), c.count > 3 ? integer(await c.text(3), 'Casas') : undefined));
  fn('decimalCompare', 'language', 2, 2, '[a;b]', 'Compara decimais sem conversão para Number; retorna -1, 0 ou 1.', async c => decimalCompare(await c.text(0), await c.text(1)));
  fn('decimalRound', 'language', 2, 2, '[valor;casas]', 'Arredonda decimal em texto; empates para longe de zero e zeros finais são removidos.', async c => decimalRound(await c.text(0), integer(await c.text(1), 'Casas')));
});
