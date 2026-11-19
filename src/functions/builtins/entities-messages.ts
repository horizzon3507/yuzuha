import { GuardError, YuzuhaError } from '../../errors.js';
import { userID } from '../../domain/values.js';
import type { FunctionCall } from '../runtime/types.js';
import { contextChannel } from './entities-info.js';
import { defineFunctions } from './definition.js';

async function channel(c: FunctionCall, index: number) {
  const id = c.count > index ? (await c.text(index)).trim() : c.ctx.message.channelID;
  if (!id) throw new YuzuhaError('ARGUMENT', 'Informe o canal.');
  await contextChannel(c, id); return id;
}
async function limit(c: FunctionCall, index: number, fallback = 100) {
  const raw = c.count > index ? await c.text(index) : String(fallback), value = Number(raw);
  if (!raw.trim() || !Number.isSafeInteger(value) || value < 1 || value > 100) throw new GuardError('Limite deve ser inteiro de 1 a 100.', 'INVALID_ARGUMENT');
  return value;
}

export const entityMessageFunctions = defineFunctions(fn => {
  fn('deleteAttachment', 'messages', 2, 3, '[mensagem;anexo;canal?]', 'Remove anexo de mensagem; autor próprio ou ManageMessages, sempre com autoridade do bot.', async c => {
    const id = await channel(c, 2), messageID = (await c.text(0)).trim(), attachmentID = (await c.text(1)).trim();
    if (!/^\d{1,20}$/.test(messageID) || !/^\d{1,20}$/.test(attachmentID)) throw new GuardError('Informe IDs numéricos de mensagem e anexo.', 'INVALID_ARGUMENT');
    await c.ctx.resources.messages.deleteAttachment(id, messageID, attachmentID); return '';
  });
  fn('bulkDelete', 'messages', 1, 2, '[mensagens;canal?]', 'Apaga de 1 a 100 IDs com ManageMessages de autor e bot; preserva resultado parcial sem repetir a API.', async c => {
    const id = await channel(c, 1), input = await c.arg(0);
    if (!Array.isArray(input) || input.length < 1 || input.length > 100
      || input.some(id => typeof id !== 'string' || !/^\d{1,20}$/.test(id))) throw new GuardError('Informe array de 1 a 100 IDs numéricos como textos.', 'INVALID_ARGUMENT');
    return c.ctx.resources.messages.bulkDelete(id, [...new Set(input as string[])]);
  });
  fn('purgeMessages', 'messages', 1, 3, '[limite;autor?;canal?]', 'Apaga até 100 mensagens recentes com filtro opcional; exige ManageMessages de autor e bot.', async c => {
    const count = await limit(c, 0), id = await channel(c, 2), actor = c.count > 1 ? (await c.text(1)).trim() : '';
    const purge = c.ctx.resources.messages.purge;
    if (!purge) throw new YuzuhaError('NATIVE_UNAVAILABLE', 'O recurso de mensagens não implementa purge.');
    return purge.call(c.ctx.resources.messages, id, { limit: count, ...(actor ? { authorID: userID(actor) } : {}) });
  });
  fn('bulkDeleteMyMessages', 'messages', 0, 2, '[limite?;canal?]', 'Apaga somente mensagens do bot em janela de até 100 mensagens; exige ManageMessages de autor e bot, sem rota global de sessão.', async c => {
    const count = await limit(c, 0), id = await channel(c, 1), purge = c.ctx.resources.messages.purge;
    if (!purge) throw new YuzuhaError('NATIVE_UNAVAILABLE', 'O recurso de mensagens não implementa purge.');
    return purge.call(c.ctx.resources.messages, id, { limit: count, authorID: c.ctx.transport.botID });
  });
});
