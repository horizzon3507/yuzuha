import { parseDuration } from '../../domain/values.js';
import type { FunctionCall } from '../types.js';
import { finite } from './arguments.js';
import { defineFunctions } from './definition.js';
import { YuzuhaError } from '../../shared/errors.js';

export const moderationFunctions = defineFunctions(fn => {
  for (const [name, action] of [['moveMember', 'move'], ['muteMember', 'mute'], ['deafenMember', 'deafen']] as const) {
    for (const record of [false, true]) {
      fn(record ? `mod${name[0]!.toUpperCase()}${name.slice(1)}` : name, 'moderation', 3, 3,
        action === 'move' ? '[usuário;canalOuVazio;motivo]' : '[usuário;ativar;motivo]',
        `Modera voz com permissões e hierarquia${record ? ', registra caso e define $caseID' : ''}.`, async c => {
          const target = await c.text(0), raw = (await c.text(1)).trim();
          let options;
          if (action === 'move') options = { record, channelID: raw ? /^<#(\d+)>$/.exec(raw)?.[1] ?? raw : null };
          else {
            if (raw !== 'true' && raw !== 'false') throw new YuzuhaError('VOICE_STATE', 'Ativar deve ser true ou false.');
            options = { record, enabled: raw === 'true' };
          }
          await c.ctx.moderate(action, target, await c.text(2), options);
          return '';
        });
    }
  }
  for (const action of ['ban', 'kick', 'timeout', 'unban'] as const) {
    const timeout = action === 'timeout';
    const execute = (record: boolean) => async (c: FunctionCall) => {
      const target = await c.text(0);
      const duration = timeout ? parseDuration(await c.text(1)) : undefined;
      const reason = await c.text(timeout ? 2 : 1);
      await c.ctx.moderate(action, target, reason, { record, duration, deleteMessageDays: action === 'ban' && c.count > 2 ? finite(await c.text(2)) : 0 });
      return '';
    };
    const usage = timeout ? '[usuário;duração;motivo]' : action === 'ban' ? '[usuário;motivo;diasDeHistórico?]' : '[usuário;motivo]';
    fn(action, 'moderation', timeout ? 3 : 2, timeout || action === 'ban' ? 3 : 2, usage, 'Modera com guards e hierarquia, sem criar caso.', execute(false));
    fn(`mod${action[0]!.toUpperCase()}${action.slice(1)}`, 'moderation', timeout ? 3 : 2, timeout || action === 'ban' ? 3 : 2, usage, 'Modera com guards e hierarquia e cria caso; define $caseID.', execute(true));
  }
});
