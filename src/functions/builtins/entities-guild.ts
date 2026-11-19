import { userID } from '../../domain/values.js';
import { discoveryInput, positionBatch } from '../../domain/entity-operations.js';
import { stickerBatch } from '../../domain/resource-batches.js';
import { GuardError } from '../../errors.js';
import { defineFunctions } from './definition.js';

export const entityGuildFunctions = defineFunctions(fn => {
  fn('applyForDiscovery', 'users', 1, 1, '[opções]', 'Envia candidatura à descoberta; description, primaryCategoryId, keywords e primaryLanguage. Exige ManageGuild de autor e bot.', async c =>
    c.ctx.resources.users.applyForDiscovery(c.ctx.requireGuild(), discoveryInput(await c.arg(0))));
  fn('editDiscoveryApplication', 'users', 1, 1, '[opções]', 'Edita candidatura à descoberta com validação completa e ManageGuild de autor e bot.', async c =>
    c.ctx.resources.users.editDiscoveryApplication(c.ctx.requireGuild(), discoveryInput(await c.arg(0))));
  fn('discoveryStatus', 'users', 0, 0, '', 'Consulta candidatura, elegibilidade e mínimo de membros; exige ManageGuild de autor e bot.', async c =>
    c.ctx.resources.users.discoveryStatus(c.ctx.requireGuild()));
  fn('withdrawDiscoveryApplication', 'users', 0, 0, '', 'Retira candidatura do servidor atual; exige ManageGuild de autor e bot.', async c => {
    await c.ctx.resources.users.withdrawDiscoveryApplication(c.ctx.requireGuild()); return '';
  });
  fn('transferOwnership', 'users', 2, 2, '[usuário;confirmação]', 'Transfere propriedade com confirmação TRANSFERIR; autor e bot devem ser donos, destino deve ser membro humano.', async c => {
    const guildID = c.ctx.requireGuild(), id = userID(await c.text(0));
    if (await c.text(1) !== 'TRANSFERIR') throw new GuardError('Confirme com TRANSFERIR para transferir a propriedade.', 'INVALID_ARGUMENT');
    await c.ctx.resources.users.transferOwnership(guildID, id); return '';
  });
  fn('setRolePositions', 'roles', 1, 1, '[posições]', 'Reposiciona de 1 a 100 cargos por id/position; valida lote, permissões e hierarquia inteira antes da API.', async c =>
    c.ctx.resources.roles.setRolePositions(c.ctx.requireGuild(), positionBatch(await c.arg(0))));
  fn('setRoleHoistPositions', 'roles', 1, 1, '[posições]', 'Define separadores de 1 a 100 cargos por id/position; null equivale a zero. Exige ManageRoles e hierarquia.', async c =>
    c.ctx.resources.roles.setRoleHoistPositions(c.ctx.requireGuild(), positionBatch(await c.arg(0), true)));
  fn('resetRoleHoistPositions', 'roles', 0, 0, '', 'Zera separadores de cargos; exige ManageRoles e hierarquia em todos os cargos afetados.', async c =>
    c.ctx.resources.roles.resetRoleHoistPositions(c.ctx.requireGuild()));
  fn('setChannelPositions', 'channels', 1, 1, '[posições]', 'Reposiciona de 1 a 100 canais por id/position; valida todos no servidor atual com ManageChannels de autor e bot.', async c => {
    await c.ctx.resources.channels.setChannelPositions(c.ctx.requireGuild(), positionBatch(await c.arg(0))); return '';
  });
  fn('createStickersBulk', 'expressions', 1, 1, '[figurinhas]', 'Cria de 1 a 50 figurinhas base64, até 10 MB; valida o lote inteiro, exige ManageExpressions e preserva success/failed.', async c =>
    c.ctx.resources.expressions.createStickersBulk(c.ctx.requireGuild(), stickerBatch(await c.arg(0))));
});
