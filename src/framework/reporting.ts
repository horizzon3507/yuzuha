import type { CommandContext } from '../context.js';
import { GuardError, PartialModerationError, YuzuhaError } from '../errors.js';
import type { YuzuhaOptions } from './options.js';
import { emitLog } from './logging.js';
import { errorCode } from '../services/scheduler.js';

export function userError(error: unknown, ctx?: CommandContext): string {
  if (error instanceof GuardError || error instanceof PartialModerationError) return error.message;
  if (ctx?.lastCase) return `A ação foi realizada e registrada no caso #${ctx.lastCase.id}, mas o comando não terminou.`;
  return 'Não foi possível concluir o comando.';
}

export async function reportError(options: YuzuhaOptions, error: unknown, ctx?: CommandContext): Promise<void> {
  await emitLog(options, { event: 'error', errorCode: errorCode(error), ...(ctx ? { executionID: ctx.executionID, command: ctx.command.name } : {}) });
  try {
    if (options.onError) await options.onError(error, ctx);
    else console.error(`[yuzuha] ${error instanceof YuzuhaError ? error.code : 'UNEXPECTED_ERROR'}`, error);
  } catch { console.error('[yuzuha] ERROR_HANDLER_FAILED'); }
}
