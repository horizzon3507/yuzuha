import { parseDuration } from '../../domain/values.js';
import { defineFunctions } from './definition.js';

/** Duração em ms: segundos puros ("10" = 10s) ou formato parseDuration ("500ms", "5s"...). */
function durationMs(raw: string): number {
  const value = raw.trim();
  if (/^\d+(?:\.\d+)?$/.test(value)) return parseDuration(Number(value) * 1000);
  return parseDuration(value);
}

export const collectorFunctions = defineFunctions(fn => {
  fn('awaitMessage', 'collectors', 1, 3, '[segundos;usuario?;canal?]', 'Aguarda mensagem e retorna o conteúdo ou vazio em timeout.', async c => {
    const timeMs = durationMs(await c.text(0));
    const userID = c.count > 1 ? (await c.text(1)).trim() : '';
    const channelArg = c.count > 2 ? (await c.text(2)).trim() : '';
    const collected = await c.wait(c.ctx.resources.collectors.awaitMessage(channelArg ? channelArg : c.ctx.message.channelID, {
      userID: userID ? userID : undefined, timeMs,
    }));
    return collected?.content ?? '';
  });
  fn('awaitReaction', 'collectors', 1, 3, '[segundos;emoji?;mensagem?]', 'Aguarda reação e retorna o userID ou vazio em timeout.', async c => {
    const timeMs = durationMs(await c.text(0));
    const emojiArg = c.count > 1 ? (await c.text(1)).trim() : '';
    const messageArg = c.count > 2 ? (await c.text(2)).trim() : '';
    const selected = await c.wait(c.ctx.resources.collectors.awaitReaction(
      c.ctx.message.channelID, messageArg ? messageArg : c.ctx.message.id,
      emojiArg ? emojiArg : '✅', timeMs));
    return selected?.userID ?? '';
  });
  fn('confirm', 'collectors', 1, 2, '[segundos;texto?]', 'Pede confirmação com ✅/❌ e retorna boolean.', async c => {
    const timeMs = durationMs(await c.text(0));
    const textArg = c.count > 1 ? (await c.text(1)).trim() : '';
    const channelID = c.ctx.message.channelID;
    const promptID = await c.ctx.reply(textArg ? textArg : 'Confirme reagindo abaixo.');
    try {
      await c.ctx.react('✅', promptID);
      await c.ctx.react('❌', promptID);
      const selected = await c.wait(c.ctx.resources.collectors.awaitReaction(
        channelID, promptID, ['✅', '❌'], timeMs, c.ctx.message.authorID));
      return selected !== null && (selected.emoji === '✅' || selected.emoji.toLowerCase() === 'white_check_mark');
    } finally {
      // Limpeza best-effort das reações do bot; nunca propaga erro.
      try {
        const native = c.ctx.nativeMessage;
        if (native !== undefined && native !== null && native.id === promptID && native.channelId === channelID) {
          await native.removeReaction('✅');
          await native.removeReaction('❌');
        }
      } catch { /* limpeza nunca falha o comando */ }
    }
  });
});
