import { GuardError } from '../../errors.js';
import { truthy } from '../values.js';
import { defineFunctions } from './definition.js';

export const guardFunctions = defineFunctions(fn => {
  fn('onlyIf', 'guards', 2, 2, '[condição;erro]', 'Encerra se a condição for falsa; aceita ==, !=, >, <, >= e <=.', async c => {
    if (!truthy(await c.arg(0))) throw new GuardError(await c.text(1));
    return '';
  }, ['require']);
  fn('requireGuild', 'guards', 0, 1, '[erro?]', 'Exige execução em servidor.', async c => {
    if (!c.ctx.guildID) throw new GuardError(c.count ? await c.text(0) : 'Este comando só funciona em servidores.');
    return '';
  }, ['onlyGuild']);
  fn('onlyPerms', 'guards', 1, 2, '[permissão;erro?]', 'Exige permissão do autor no servidor.', async c => {
    await c.ctx.requirePermission(await c.text(0), false, c.count > 1 ? await c.text(1) : undefined);
    return '';
  }, ['requirePermission']);
  fn('onlyBotPerms', 'guards', 1, 2, '[permissão;erro?]', 'Exige permissão do bot no servidor.', async c => {
    await c.ctx.requirePermission(await c.text(0), true, c.count > 1 ? await c.text(1) : undefined);
    return '';
  }, ['requireBotPermission']);
  fn('cooldown', 'guards', 1, 2, '[duração;erro?]', 'Cooldown por autor/canal/servidor/comando; erro aceita {remaining}.', async c => {
    c.ctx.cooldown(await c.text(0), c.count > 1 ? await c.text(1) : undefined);
    return '';
  });
});
