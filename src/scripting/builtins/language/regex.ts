import { runRegex } from '../../regex.js';
import { defineFunctions } from '../definition.js';
import { integer } from './common.js';

export const regexFunctions = defineFunctions(fn => {
  for (const [name, operation] of [['regexTest', 'test'], ['regexMatch', 'match'], ['regexReplace', 'replace']] as const) {
    const replacing = operation === 'replace';
    fn(name, 'language', replacing ? 3 : 2, replacing ? 5 : 4,
      replacing ? '[texto;padrão;substituição;flags?;timeoutMs?]' : '[texto;padrão;flags?;timeoutMs?]',
      'Regex em worker isolado; flags gimsu, prazo padrão 500 ms, até 1000 correspondências e saída limitada.', async c => {
        const flagIndex = replacing ? 3 : 2;
        return runRegex({ operation, text: await c.text(0), pattern: await c.text(1),
          replacement: replacing ? await c.text(2) : undefined,
          flags: c.count > flagIndex ? await c.text(flagIndex) : '',
          timeoutMs: c.count > flagIndex + 1 ? integer(await c.text(flagIndex + 1), 'Prazo') : undefined,
          signal: c.ctx.signal });
      });
  }
});
