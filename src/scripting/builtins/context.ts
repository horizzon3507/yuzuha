import type { FunctionCall } from '../types.js';
import { index } from './arguments.js';
import { defineFunctions } from './definition.js';

export const contextFunctions = defineFunctions(fn => {
  const zero = (name: string, description: string, run: (call: FunctionCall) => unknown) => fn(name, 'context', 0, 0, '', description, run);
  zero('authorID', 'ID do autor.', c => c.ctx.authorID);
  zero('authorName', 'Nome do autor.', c => c.ctx.authorName);
  zero('username', 'Nome do autor.', c => c.ctx.authorName);
  zero('botID', 'ID do bot.', c => c.ctx.transport.botID);
  zero('guildID', 'ID do servidor; vazio em DM.', c => c.ctx.guildID);
  zero('channelID', 'ID do canal; vazio se o evento não tiver canal.', c => c.ctx.channelID);
  zero('messageID', 'ID da mensagem.', c => c.ctx.message.id);
  zero('ping', 'Latência do gateway em ms.', c => c.ctx.transport.ping);
  zero('caseID', 'ID do último caso criado nesta execução.', c => c.ctx.lastCase?.id ?? '');
  zero('help', 'Ajuda dos comandos registrados.', c => c.ctx.help());
  fn('mentioned', 'context', 1, 1, '[posição]', 'Menção por posição, começando em 1; vazio se ausente.', async c => c.ctx.message.mentions[index(await c.text(0), 1) - 1] ?? '');
  fn('message', 'context', 0, 1, '[posição?]', 'Texto dos argumentos, ou argumento por posição começando em 0.', async c => c.count ? c.ctx.tokens[index(await c.text(0))] ?? '' : c.ctx.input);
  fn('messageSlice', 'context', 1, 2, '[início;fim?]', 'Fatia de argumentos, índice inicial 0 e fim exclusivo.', async c => c.ctx.tokens.slice(index(await c.text(0)), c.count > 1 ? index(await c.text(1)) : undefined).join(' '));
  fn('arg', 'context', 1, 1, '[nome]', 'Argumento declarativo convertido.', async c => c.ctx.args.get(await c.text(0)) ?? '');
});
