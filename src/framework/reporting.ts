import type { CommandContext } from '../context.js';
import type { Payload } from '../contracts.js';
import { GuardError, PartialModerationError, YuzuhaError } from '../errors.js';
import type { ErrorReportInfo, YuzuhaOptions } from './options.js';
import { emitLog } from './logging.js';
import { errorCode } from '../services/scheduler.js';

export function userError(error: unknown, ctx?: CommandContext): string {
  if (error instanceof GuardError || error instanceof PartialModerationError) return error.message;
  if (ctx?.lastCase) return `A ação foi realizada e registrada no caso #${ctx.lastCase.id}, mas o comando não terminou.`;
  return 'Não foi possível concluir o comando.';
}

export async function reportError(
  options: YuzuhaOptions,
  error: unknown,
  ctx?: CommandContext,
  info?: Partial<Omit<ErrorReportInfo, 'ctx'>>,
): Promise<void> {
  const executionID = info?.executionID ?? ctx?.executionID;
  const reportInfo: ErrorReportInfo = Object.freeze({
    source: info?.source ?? (ctx ? 'command' : 'event'),
    ...(info?.event ? { event: info.event } : {}),
    ...(ctx ? { ctx } : {}),
    ...(executionID ? { executionID } : {}),
  });
  await emitLog(options, {
    event: 'error',
    errorCode: errorCode(error),
    source: reportInfo.source,
    ...(reportInfo.event ? { trigger: reportInfo.event } : {}),
    ...(executionID ? { executionID } : {}),
    ...(ctx ? { command: ctx.command.name } : {}),
  });
  try {
    if (options.onError) await options.onError(error, ctx, reportInfo);
    else console.error(`[yuzuha] ${error instanceof YuzuhaError ? error.code : 'UNEXPECTED_ERROR'}`, error);
  } catch { console.error('[yuzuha] ERROR_HANDLER_FAILED'); }
}

async function runGuardHook(
  options: YuzuhaOptions,
  error: GuardError,
  ctx: CommandContext,
): Promise<{ handled: true; reply: Payload | string | null } | { handled: false }> {
  const hook = error.reason === 'COOLDOWN'
    ? (options.hooks?.onCooldown ? () => options.hooks!.onCooldown!(error.remainingMs ?? 0, ctx, error) : undefined)
    : (options.hooks?.onDenied ? () => options.hooks!.onDenied!(error, ctx) : undefined);
  if (!hook) return { handled: false };
  try {
    const result = await hook();
    if (result === undefined) return { handled: false };
    return { handled: true, reply: result };
  } catch (hookError) {
    await reportError(options, hookError, ctx, {
      source: 'hook',
      event: error.reason === 'COOLDOWN' ? 'onCooldown' : 'onDenied',
    });
    return { handled: true, reply: userError(error, ctx) };
  }
}

export async function resolveErrorReply(
  options: YuzuhaOptions,
  error: unknown,
  ctx?: CommandContext,
): Promise<Payload | string | null> {
  if (error instanceof GuardError && ctx) {
    const guarded = await runGuardHook(options, error, ctx);
    if (guarded.handled) return guarded.reply;
  }
  if (options.errorReply) {
    try {
      const custom = await options.errorReply(error, ctx);
      if (custom !== undefined) return custom;
    } catch (replyHandlerError) {
      await reportError(options, replyHandlerError, ctx, { source: 'hook', event: 'errorReply' });
    }
  }
  return userError(error, ctx);
}
