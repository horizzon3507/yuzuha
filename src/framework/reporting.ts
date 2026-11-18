import type { CommandContext } from '../context.js';
import type { CaseRecord, Payload } from '../contracts.js';
import { defaultTranslator } from '../domain/i18n.js';
import type { MessageTranslator } from '../domain/i18n.js';
import { GuardError, PartialModerationError, YuzuhaError } from '../errors.js';
import type { ErrorReportInfo, YuzuhaOptions } from './options.js';
import { emitLog } from './logging.js';
import { currentExecution } from './execution.js';
import { errorCode } from '../services/scheduler.js';

export function userError(
  error: unknown,
  ctx?: { readonly lastCase?: CaseRecord; readonly t?: MessageTranslator },
  t: MessageTranslator = ctx?.t ?? defaultTranslator,
): string {
  if (error instanceof GuardError) return error.message;
  if (error instanceof PartialModerationError) {
    return error.hasCustomMessage ? error.message : t('moderationPartial', error.action, error.targetID);
  }
  if (ctx?.lastCase) return t('userErrorAfterCase', ctx.lastCase.id);
  return t('userErrorGeneric');
}

export async function reportError(
  options: YuzuhaOptions,
  error: unknown,
  ctx?: CommandContext,
  info?: Partial<Omit<ErrorReportInfo, 'ctx'>>,
): Promise<void> {
  const code = errorCode(error);
  const executionID = info?.executionID ?? ctx?.executionID ?? currentExecution()?.executionID;
  const reportInfo: ErrorReportInfo = Object.freeze({
    source: info?.source ?? (ctx ? 'command' : 'event'),
    ...(info?.event ? { event: info.event } : {}),
    ...(ctx ? { ctx } : {}),
    ...(executionID !== undefined ? { executionID } : {}),
  });
  await emitLog(options, {
    event: 'error',
    errorCode: code,
    source: reportInfo.source,
    ...(reportInfo.event ? { trigger: reportInfo.event } : {}),
    ...(executionID !== undefined ? { executionID } : {}),
    ...(ctx ? { command: ctx.command.name } : {}),
  });
  try {
    if (options.onError) {
      await options.onError(error, ctx, reportInfo);
    } else if (options.logger) {
      try {
        options.logger.error({
          code,
          source: reportInfo.source,
          ...(reportInfo.event ? { trigger: reportInfo.event } : {}),
          ...(executionID !== undefined ? { executionID } : {}),
          ...(ctx ? { command: ctx.command.name } : {}),
          err: error,
        }, '[yuzuha]');
      } catch {}
    } else if (options.logger !== false) {
      console.error(`[yuzuha] ${error instanceof YuzuhaError ? error.code : 'UNEXPECTED_ERROR'}`, error);
    }
  } catch {
    if (options.logger) {
      try { options.logger.error({ code: 'ERROR_HANDLER_FAILED' }, '[yuzuha]'); }
      catch { console.error('[yuzuha] ERROR_HANDLER_FAILED'); }
    } else if (options.logger !== false) {
      console.error('[yuzuha] ERROR_HANDLER_FAILED');
    }
  }
}

async function runGuardHook(
  options: YuzuhaOptions,
  error: GuardError,
  ctx: CommandContext,
  t?: MessageTranslator,
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
    return { handled: true, reply: userError(error, ctx, t) };
  }
}

export async function resolveErrorReply(
  options: YuzuhaOptions,
  error: unknown,
  ctx?: CommandContext,
  t?: MessageTranslator,
): Promise<Payload | string | null> {
  if (error instanceof GuardError && ctx) {
    const guarded = await runGuardHook(options, error, ctx, t);
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
  return userError(error, ctx, t);
}
