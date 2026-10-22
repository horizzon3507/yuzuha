import { GuardError, PartialModerationError, ScriptError, StopExecution, YuzuhaError } from '../../errors.js';
import { truthy } from '../values.js';
import { defineFunctions } from './definition.js';

export const flowFunctions = defineFunctions(fn => {
  fn('let', 'flow', 2, 2, '[nome;valor]', 'Define variável local sem produzir texto.', async c => {
    const key = await c.text(0);
    c.ctx.vars.set(key, await c.arg(1));
    return '';
  });
  fn('get', 'flow', 1, 1, '[nome]', 'Recupera variável local preservando seu tipo.', async c => c.ctx.vars.get(await c.text(0)) ?? '');
  fn('if', 'flow', 2, 3, '[condição;então;senão?]', 'Avalia somente o ramo escolhido.', async c => truthy(await c.arg(0)) ? c.arg(1) : c.count > 2 ? c.arg(2) : '');
  fn('stop', 'flow', 0, 0, '', 'Encerra a execução sem resposta automática.', () => { throw new StopExecution(); });
  fn('throw', 'flow', 1, 1, '[mensagem]', 'Emite erro explícito.', async c => { throw new YuzuhaError('USER_ERROR', await c.text(0)); });
  fn('try', 'flow', 2, 2, '[operação;fallback]', 'Captura erros de operações; guards, limites e ações parciais continuam sendo erros.', async c => {
    try { return await c.arg(0); }
    catch (error) {
      if (error instanceof GuardError || error instanceof StopExecution || error instanceof PartialModerationError
        || (error instanceof ScriptError && ['EXECUTION_LIMIT', 'OUTPUT_LIMIT', 'EXECUTION_ABORTED'].includes(error.code))) throw error;
      return c.arg(1);
    }
  });
});
