import { YuzuhaError } from '../../errors.js';
import { defineFunctions } from './definition.js';

function required(value: string, code: string, message: string): string {
  if (!value.trim()) throw new YuzuhaError(code, message);
  return value;
}

export const webhookFunctions = defineFunctions(fn => {
  fn('createWebhook', 'webhooks', 2, 2, '[canal;nome]', 'Cria webhook no canal e retorna suas informações.', async c => {
    const channelID = await c.text(0);
    const name = required(await c.text(1), 'WEBHOOK_NAME', 'Informe o nome do webhook.');
    return c.ctx.resources.webhooks.create(channelID, name);
  });
  fn('webhooks', 'webhooks', 0, 1, '[canal?]', 'Lista webhooks do canal (padrão: canal atual).', async c =>
    c.ctx.resources.webhooks.list(c.count ? await c.text(0) : c.ctx.message.channelID));
  fn('sendWebhook', 'webhooks', 3, 3, '[id;token;texto]', 'Envia via webhook do servidor atual com ManageWebhooks do autor e bot; token não contorna autorização.', async c => {
    const id = required(await c.text(0), 'WEBHOOK_ID', 'Informe o ID do webhook.');
    const token = required(await c.text(1), 'WEBHOOK_TOKEN', 'Informe o token do webhook.');
    const content = required(await c.text(2), 'WEBHOOK_CONTENT', 'Informe o texto a enviar.');
    return await c.ctx.resources.webhooks.send(id, token, { content }) ?? '';
  });
  fn('editWebhook', 'webhooks', 2, 3, '[id;nome;token?]', 'Renomeia webhook do servidor atual com ManageWebhooks; sem token usa a autenticação do bot.', async c => {
    const id = required(await c.text(0), 'WEBHOOK_ID', 'Informe o ID do webhook.');
    const name = required(await c.text(1), 'WEBHOOK_NAME', 'Informe o novo nome do webhook.');
    await c.ctx.resources.webhooks.edit(id, c.count > 2 ? await c.text(2) || null : null, name);
    return '';
  });
  fn('deleteWebhook', 'webhooks', 1, 2, '[id;token?]', 'Apaga webhook do servidor atual com ManageWebhooks; token não contorna autorização.', async c => {
    const id = required(await c.text(0), 'WEBHOOK_ID', 'Informe o ID do webhook.');
    await c.ctx.resources.webhooks.delete(id, c.count > 1 ? await c.text(1) || null : null);
    return '';
  });
});
