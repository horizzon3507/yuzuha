import { defineFunctions } from './definition.js';
import { payload } from './payload.js';

export const messageFunctions = defineFunctions(fn => {
  fn('reply', 'messages', 1, 1, '[texto ou embed]', 'Responde sem pings e sem produzir texto adicional.', async c => { await c.ctx.reply(payload(await c.arg(0))); return ''; });
  fn('sendMessage', 'messages', 2, 2, '[canalID;texto ou embed]', 'Envia e retorna o ID da mensagem.', async c => c.ctx.transport.send(await c.text(0), payload(await c.arg(1))));
  fn('editMessage', 'messages', 3, 3, '[canalID;mensagemID;texto ou embed]', 'Edita mensagem.', async c => { await c.ctx.transport.edit(await c.text(0), await c.text(1), payload(await c.arg(2))); return ''; });
  fn('deleteMessage', 'messages', 2, 2, '[canalID;mensagemID]', 'Apaga mensagem.', async c => { await c.ctx.transport.delete(await c.text(0), await c.text(1)); return ''; });
  fn('react', 'messages', 1, 1, '[emoji]', 'Reage à mensagem que executou o comando.', async c => { await c.ctx.transport.react(c.ctx.message.channelID, c.ctx.message.id, await c.text(0)); return ''; });
});
