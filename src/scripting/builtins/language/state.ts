import type { JsonValue } from '../../../domain/state.js';
import { YuzuhaError } from '../../../errors.js';
import { toJson } from '../arguments.js';
import { defineFunctions } from '../definition.js';
import { deepEqual, integer, typedScalar } from './common.js';
import { parsePath, setJsonPath } from './objects.js';

export const LOOP_INDEX_KEY = '__loopIndex';
export const LOOP_VALUE_KEY = '__loopValue';
export const LOOP_ACCUMULATOR_KEY = '__loopAccumulator';
export const LOOP_MAX = 1000;

export const stateFunctions = defineFunctions(fn => {
  for (const [suffix, property] of [['Var', 'global'], ['GuildVar', 'guild'], ['UserVar', 'user']] as const) {
    fn(`increment${suffix}`, 'language', 1, 2, '[nome;delta?]', 'Incrementa número persistente de forma atômica; retorna o novo valor.', async c => {
      const name = await c.text(0);
      const delta = c.count > 1 ? Number(await c.text(1)) : 1;
      if (!Number.isFinite(delta)) throw new YuzuhaError('INCREMENT', 'Delta deve ser um número finito.');
      return c.ctx.data[property].update(name, current => {
        const base = current === null ? 0 : typeof current === 'string' && current.trim() !== '' && Number.isFinite(Number(current)) ? Number(current) : current;
        if (typeof base !== 'number' || !Number.isFinite(base)) throw new YuzuhaError('INCREMENT', 'Variável atual não é um número.');
        const next = base + delta;
        if (!Number.isFinite(next)) throw new YuzuhaError('INCREMENT', 'Resultado não é um número finito.');
        return next;
      }, null);
    });
    fn(`push${suffix}`, 'language', 2, 2, '[nome;valor]', 'Adiciona item a array persistente; cria se ausente.', async c => {
      const name = await c.text(0);
      const item = typedScalar(toJson(await c.arg(1))) as JsonValue;
      return c.ctx.data[property].update(name, current => {
        if (current === null) return [item];
        if (!Array.isArray(current)) throw new YuzuhaError('PUSH', 'Variável atual não é um array.');
        return [...current, item];
      }, null);
    });
    fn(`pull${suffix}`, 'language', 2, 2, '[nome;valor]', 'Remove todas as ocorrências do valor em array persistente.', async c => {
      const name = await c.text(0);
      const target = typedScalar(toJson(await c.arg(1))) as JsonValue;
      return c.ctx.data[property].update(name, current => {
        if (current === null) return [];
        if (!Array.isArray(current)) throw new YuzuhaError('PULL', 'Variável atual não é um array.');
        return current.filter(item => !deepEqual(item, target));
      }, null);
    });
    fn(`set${suffix}Path`, 'language', 3, 3, '[nome;caminho;novo]', 'Atualiza caminho em objeto persistente de forma atômica; cria a estrutura ausente e retorna o valor completo.', async c => {
      const name = await c.text(0);
      const segments = parsePath(await c.text(1));
      const fresh = typedScalar(toJson(await c.arg(2)));
      return c.ctx.data[property].update(name, current => setJsonPath(current, segments, fresh), null);
    });
  }
  fn('caseList', 'language', 0, 2, '[página?;tamanho?]', 'Lista casos do servidor; página 1-based, tamanho padrão 10, máximo 100.', async c => {
    const page = c.count > 0 ? integer(await c.text(0), 'Página') : 1;
    const size = c.count > 1 ? integer(await c.text(1), 'Tamanho') : 10;
    if (page < 1) throw new YuzuhaError('CASE_LIST', 'Página começa em 1.');
    if (size < 1 || size > 100) throw new YuzuhaError('CASE_LIST', 'Tamanho deve estar entre 1 e 100.');
    const guildID = c.ctx.requireGuild();
    const records = await c.ctx.store.read(state => state.cases[guildID] ?? []);
    return structuredClone(records.slice((page - 1) * size, page * size));
  });
  fn('caseCount', 'language', 0, 0, '', 'Quantidade de casos do servidor atual.', async c => {
    const guildID = c.ctx.requireGuild();
    return c.ctx.store.read(state => (state.cases[guildID] ?? []).length);
  });
});
