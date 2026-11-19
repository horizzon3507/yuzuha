import { threadDefaultsInput, threadSelfInput } from '../../domain/entity-operations.js';
import { userID } from '../../domain/values.js';
import { GuardError, YuzuhaError } from '../../errors.js';
import type { FunctionCall } from '../runtime/types.js';
import { contextChannel } from './entities-info.js';
import { defineFunctions } from './definition.js';

async function target(c: FunctionCall, index = 0) {
  const id = (c.count > index ? await c.text(index) : c.ctx.message.channelID).trim();
  if (!id) throw new YuzuhaError('ARGUMENT', 'Informe o canal.');
  const channel = await contextChannel(c, id);
  return { id, channel };
}

export const entityChannelFunctions = defineFunctions(fn => {
  for (const method of ['addRecipient', 'removeRecipient'] as const) {
    fn(method, 'channels', 1, 1, '[usuário]', 'Altera destinatário somente no grupo DM atual; adicionar exige dono, remover terceiros também. Não altera o bot.', async c => {
      if (c.ctx.guildID) throw new GuardError('Esta operação exige o grupo DM atual.');
      const { id, channel } = await target(c, 1), member = userID(await c.text(0));
      if (channel.type !== 3 || !channel.recipientIDs?.includes(c.ctx.authorID)) throw new GuardError('Esta operação exige participação no grupo DM atual.');
      if (member === c.ctx.transport.botID) throw new GuardError('Não é permitido alterar o bot como destinatário.', 'BOT_TARGET');
      if (method === 'addRecipient' && channel.recipientIDs.includes(member)) throw new GuardError('O usuário já participa do grupo.', 'INVALID_ARGUMENT');
      if (method === 'removeRecipient' && !channel.recipientIDs.includes(member)) throw new GuardError('O usuário não participa do grupo.', 'INVALID_ARGUMENT');
      await c.ctx.resources.channels[method](id, member); return '';
    });
  }
  for (const method of ['acknowledgePins', 'clearReadState'] as const) {
    fn(method, 'messages', 0, 0, '', 'Atualiza o estado de leitura somente do canal atual; exige ReadMessageHistory de autor e bot.', async c => {
      await target(c); await c.ctx.resources.messages[method](c.ctx.message.channelID); return '';
    });
  }
  fn('typing', 'channels', 0, 0, '', 'Envia indicador de digitação no canal atual; exige SendMessages de autor e bot.', async c => {
    await target(c); await c.ctx.resources.channels.sendTyping(c.ctx.message.channelID); return '';
  });
  fn('rtcRegions', 'channels', 0, 1, '[canal?]', 'Lista regiões RTC do canal de voz do servidor atual.', async c => {
    c.ctx.requireGuild(); const { id, channel } = await target(c);
    if (![2, 13].includes(channel.type)) throw new YuzuhaError('ARGUMENT', 'Informe um canal de voz.');
    return c.ctx.resources.channels.rtcRegions(id);
  });
  fn('fetchSlowmode', 'channels', 0, 1, '[canal?]', 'Consulta modo lento atualizado do canal do servidor atual.', async c => {
    c.ctx.requireGuild(); const { id } = await target(c); return c.ctx.resources.channels.slowmode(id);
  });
  fn('setDefaultForumLayout', 'channels', 2, 2, '[canal;layout]', 'Define layout default/list/grid do fórum; vazio remove override. Exige ManageChannels de autor e bot.', async c => {
    c.ctx.requireGuild(); const { id, channel } = await target(c), layout = (await c.text(1)).trim();
    if (channel.type !== 15 || !['', 'default', 'list', 'grid'].includes(layout)) throw new YuzuhaError('ARGUMENT', 'Informe um fórum e layout default, list, grid ou vazio.');
    await c.ctx.resources.channels.setDefaultForumLayout(id, (layout || null) as 'default' | 'list' | 'grid' | null); return '';
  });
  fn('editThreadDefaults', 'threads', 2, 2, '[canal;opções]', 'Define autoArchiveDuration e slowmode padrão, null limpa; exige ManageChannels de autor e bot.', async c => {
    c.ctx.requireGuild(); const { id, channel } = await target(c), input = threadDefaultsInput(await c.arg(1));
    if (![0, 5, 15, 16].includes(channel.type)) throw new YuzuhaError('ARGUMENT', 'O canal deve aceitar threads.');
    await c.ctx.resources.channels.editThreadDefaults(id, input); return '';
  });
  fn('editThreadSelf', 'threads', 2, 2, '[thread;opções]', 'Edita apenas a associação do bot: flags, muted e muteConfig. Exige ViewChannel de autor e bot.', async c => {
    c.ctx.requireGuild(); const { id, channel } = await target(c), input = threadSelfInput(await c.arg(1));
    if (![10, 11, 12].includes(channel.type)) throw new YuzuhaError('ARGUMENT', 'Informe uma thread.');
    return await c.ctx.resources.threads.editSelf(id, input) ?? '';
  });
  fn('lockThread', 'threads', 2, 2, '[thread;bloquear]', 'Bloqueia ou desbloqueia thread com true/false e ManageChannels de autor e bot.', async c => {
    c.ctx.requireGuild(); const { id, channel } = await target(c), flag = await c.text(1);
    if (![10, 11, 12].includes(channel.type) || !['true', 'false'].includes(flag)) throw new YuzuhaError('ARGUMENT', 'Informe uma thread e true/false.');
    await c.ctx.resources.threads.setLocked(id, flag === 'true'); return '';
  });
  fn('deleteChannelOverwrite', 'channels', 2, 3, '[canal;alvo;motivo?]', 'Remove overwrite local com ManageRoles de autor e bot e hierarquia do alvo.', async c => {
    c.ctx.requireGuild(); const { id } = await target(c);
    await c.ctx.resources.channels.deleteOverwrite(id, userID(await c.text(1)), c.count > 2 ? await c.text(2) : undefined); return '';
  });
  fn('createDM', 'messages', 1, 1, '[usuário]', 'Abre DM com usuário por ID, sem enviar mensagem; retorna canal normalizado.', async c =>
    c.ctx.resources.users.createDM(userID(await c.text(0))));
});
