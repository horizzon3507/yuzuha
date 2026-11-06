import { YuzuhaError } from '../../errors.js';
import { dataOperations, executeDataOperations } from '../../services/variables.js';
import { finite, index, toJson } from './arguments.js';
import { defineFunctions } from './definition.js';

export const storageFunctions = defineFunctions(fn => {
  fn('queryVars', 'storage', 1, 2, '[escopo;opções?]', 'Consulta prefixo de variáveis global/guild/user; opções prefix, after e limit (1–100); retorna entries e nextCursor.', async c => {
    const scope = await c.text(0);
    if (scope !== 'global' && scope !== 'guild' && scope !== 'user') throw new YuzuhaError('VARIABLE_QUERY', 'Escopo deve ser global, guild ou user.');
    const options = c.count > 1 ? await c.arg(1) : {};
    return c.ctx.data[scope].query(options as import('../../domain/variable-query.js').VariableQueryOptions);
  });
  fn('case', 'storage', 1, 1, '[número]', 'Consulta caso do servidor atual.', async c => {
    c.ctx.requireGuild();
    return await c.ctx.case(index(await c.text(0), 1)) ?? null;
  });
  for (const [suffix, scope] of [['Var', 'global'], ['GuildVar', 'guild'], ['UserVar', 'user']] as const) {
    fn(`get${suffix}`, 'storage', 1, 2, '[nome;padrão?]', 'Lê variável persistente do escopo.', async c => {
      const name = await c.text(0), fallback = c.count > 1 ? toJson(await c.arg(1)) : null;
      return c.ctx.variable(scope, name, fallback);
    });
    fn(`set${suffix}`, 'storage', 2, 3, '[nome;valor;ttlMs?]', 'Salva variável do escopo; TTL opcional em milissegundos. Sem TTL, o valor é persistente.', async c => {
      const name = await c.text(0);
      const value = toJson(await c.arg(1));
      const ttl = c.count > 2 ? await c.arg(2) : null;
      await c.ctx.data[scope].set(name, value, { ttlMs: ttl === null || ttl === 'null' ? null : finite(String(ttl)) });
      return '';
    });
    fn(`delete${suffix}`, 'storage', 1, 1, '[nome]', 'Remove variável persistente do escopo.', async c => {
      if (scope === 'guild') c.ctx.requireGuild();
      await c.ctx.deleteVariable(scope, await c.text(0));
      return '';
    });
    fn(`ttl${suffix}`, 'storage', 1, 1, '[nome]', 'Retorna TTL restante em milissegundos; -1 persistente, -2 ausente ou expirada.', async c => {
      return c.ctx.data[scope].ttl(await c.text(0));
    });
    fn(`expire${suffix}`, 'storage', 2, 2, '[nome;ttlMs]', 'Define expiração em milissegundos; null remove TTL, zero expira imediatamente. Retorna se o valor existia.', async c => {
      const name = await c.text(0), ttl = await c.arg(1);
      return c.ctx.data[scope].expire(name, ttl === null || ttl === 'null' ? null : finite(String(ttl)));
    });
  }
  fn('dataTransaction', 'storage', 1, 1, '[operações]', 'Executa atomicamente 1–100 operações JSON get/set/delete/increment/expire/ttl entre escopos; retorna resultados na ordem.', async c => {
    const operations = dataOperations(await c.arg(0));
    return c.ctx.data.transaction(data => {
      const result = executeDataOperations(data, operations);
      c.checkOutput(result);
      return result;
    });
  });
});
