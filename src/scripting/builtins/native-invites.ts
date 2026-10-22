import { parseDuration } from '../../domain/values.js';
import { YuzuhaError } from '../../errors.js';
import { defineFunctions } from './definition.js';

function inviteCode(raw: string): string {
  const path = raw.trim().split(/[?#]/)[0]!.replace(/\/+$/, '');
  const code = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
  if (!code) throw new YuzuhaError('INVITE', 'Informe o código ou a URL do convite.');
  return code;
}

function channelID(raw: string): string {
  const value = raw.trim();
  const mention = /^<#(\S+)>$/.exec(value);
  const id = mention?.[1] ?? value;
  if (!id) throw new YuzuhaError('CHANNEL', 'Informe o ID do canal.');
  return id;
}

export const inviteFunctions = defineFunctions(fn => {
  fn('invite', 'invites', 1, 1, '[codigo]', 'Mostra um convite por código ou URL.', async c => {
    return c.ctx.resources.invites.get(inviteCode(await c.text(0)));
  });
  fn('createInvite', 'invites', 1, 3, '[canal;maxUsos?;duracao?]', 'Cria um convite; duração como 1h, 0 nunca expira.', async c => {
    const id = channelID(await c.text(0));
    const maxRaw = c.count > 1 ? (await c.text(1)).trim() : '';
    let maxUses: number | undefined;
    if (maxRaw) {
      maxUses = /^\d+$/.test(maxRaw) ? Number(maxRaw) : NaN;
      if (!Number.isSafeInteger(maxUses) || (maxUses as number) < 0) {
        throw new YuzuhaError('INVITE', 'Máximo de usos deve ser um inteiro maior ou igual a 0.');
      }
    }
    const durationRaw = c.count > 2 ? (await c.text(2)).trim() : '';
    const maxAge = !durationRaw || durationRaw === '0' ? 0 : Math.floor(parseDuration(durationRaw) / 1000);
    return c.ctx.resources.invites.create(id, {
      ...(maxUses !== undefined ? { maxUses } : {}),
      maxAge,
    });
  });
  fn('deleteInvite', 'invites', 1, 1, '[codigo]', 'Apaga um convite por código ou URL.', async c => {
    await c.ctx.resources.invites.delete(inviteCode(await c.text(0)));
    return '';
  });
});
