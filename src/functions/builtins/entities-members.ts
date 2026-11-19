import { memberEditInput } from '../../domain/entity-operations.js';
import { userID } from '../../domain/values.js';
import { defineFunctions } from './definition.js';
import { entityProperty } from './entities-info.js';

export const entityMemberFunctions = defineFunctions(fn => {
  fn('editMember', 'users', 2, 2, '[usuário;opções]', 'Edita apelido e/ou cargos em uma chamada com motivo obrigatório; valida permissões, hierarquia e cargos de todo o lote.', async c =>
    c.ctx.resources.users.editMember(c.ctx.requireGuild(), userID(await c.text(0)), memberEditInput(await c.arg(1))));
  fn('setMemberRoles', 'roles', 3, 3, '[usuário;cargos;motivo]', 'Substitui cargos do membro de forma atômica; até 100 IDs como textos, array vazio limpa. Exige ManageRoles e hierarquia.', async c => {
    const input = memberEditInput({ roles: await c.arg(1), reason: await c.text(2) });
    return c.ctx.resources.users.editMember(c.ctx.requireGuild(), userID(await c.text(0)), input);
  });
  fn('guildMe', 'users', 0, 1, '[propriedade?]', 'Busca o membro do bot no servidor atual; campo opcional segue whitelist de membro, sem cache nativo.', async c => {
    const info = await c.ctx.resources.users.me(c.ctx.requireGuild());
    return c.count ? entityProperty(info, await c.text(0), 'member') : info;
  });
});
