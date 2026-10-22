import { parseDuration } from '../../domain/values.js';
import { defineFunctions } from './definition.js';
import { YuzuhaError } from '../../errors.js';
import type { RetryPolicy, SchedulePatch } from '../../services/scheduler.js';

function options(value: unknown): SchedulePatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new YuzuhaError('SCHEDULE', 'Opções devem ser objeto.');
  const allowed = ['command', 'input', 'due', 'interval', 'maxAttempts', 'retryDelayMs', 'retryBackoff', 'retryJitter', 'cron', 'timezone', 'missedRun'];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new YuzuhaError('SCHEDULE', 'Opção de agendamento desconhecida.');
  return value as SchedulePatch;
}

export const scheduleFunctions = defineFunctions(fn => {
  fn('schedule', 'schedule', 2, 4, '[duração;comando;entrada?;retry?]', 'Agenda execução única; retry recebe maxAttempts, retryDelayMs, retryBackoff e retryJitter.', async c => {
    const scheduler = c.ctx.scheduler;
    const duration = parseDuration(await c.text(0));
    const command = (await c.text(1)).trim();
    const input = c.count > 2 ? await c.text(2) : '';
    const retry = c.count > 3 ? options(await c.arg(3)) : {};
    if (Object.keys(retry).some(key => !['maxAttempts', 'retryDelayMs', 'retryBackoff', 'retryJitter'].includes(key))) throw new YuzuhaError('SCHEDULE', 'Informe somente opções de retry.');
    return await scheduler.add({ ...retry as RetryPolicy, guildID: c.ctx.guildID, channelID: c.ctx.message.channelID,
      authorID: c.ctx.authorID, command, input, due: c.ctx.now() + duration });
  });
  fn('scheduleEvery', 'schedule', 2, 4, '[duração;comando;entrada?;retry?]', 'Agenda execução repetida; retry recebe maxAttempts, retryDelayMs, retryBackoff e retryJitter.', async c => {
    const scheduler = c.ctx.scheduler;
    const duration = parseDuration(await c.text(0));
    const command = (await c.text(1)).trim();
    const input = c.count > 2 ? await c.text(2) : '';
    const retry = c.count > 3 ? options(await c.arg(3)) : {};
    if (Object.keys(retry).some(key => !['maxAttempts', 'retryDelayMs', 'retryBackoff', 'retryJitter'].includes(key))) throw new YuzuhaError('SCHEDULE', 'Informe somente opções de retry.');
    return await scheduler.add({ ...retry as RetryPolicy, guildID: c.ctx.guildID, channelID: c.ctx.message.channelID,
      authorID: c.ctx.authorID, command, input, due: c.ctx.now() + duration, interval: duration });
  });
  fn('scheduleCron', 'schedule', 3, 5, '[expressão;fuso;comando;entrada?;opções?]', 'Agenda cron de cinco campos em fuso IANA; opções recebem missedRun (run-once ou skip) e retry com jitter.', async c => {
    const expression = await c.text(0), timezone = await c.text(1), command = (await c.text(2)).trim();
    const input = c.count > 3 ? await c.text(3) : '';
    const policy = c.count > 4 ? options(await c.arg(4)) : {};
    if (Object.keys(policy).some(key => !['missedRun', 'maxAttempts', 'retryDelayMs', 'retryBackoff', 'retryJitter'].includes(key))) {
      throw new YuzuhaError('SCHEDULE', 'Cron recebe somente missedRun e opções de retry.');
    }
    return c.ctx.scheduler.addCron({ ...policy as RetryPolicy & Pick<SchedulePatch, 'missedRun'>, expression, timezone,
      guildID: c.ctx.guildID, channelID: c.ctx.message.channelID, authorID: c.ctx.authorID, command, input });
  });
  fn('unschedule', 'schedule', 1, 1, '[id]', 'Cancela um agendamento; retorna true/false.', async c => {
    const scheduler = c.ctx.scheduler;
    return await scheduler.cancel(await c.text(0), { guildID: c.ctx.guildID, authorID: c.ctx.authorID });
  });
  fn('editSchedule', 'schedule', 2, 2, '[id;opções]', 'Edita seu agendamento, cron/fuso, política e retry; interval ou cron null remove a repetição correspondente.', async c =>
    c.ctx.scheduler.edit(await c.text(0), options(await c.arg(1)), { guildID: c.ctx.guildID, authorID: c.ctx.authorID }));
  fn('pauseSchedule', 'schedule', 1, 1, '[id]', 'Pausa seu agendamento, preservando o vencimento e a política de retry.', async c =>
    c.ctx.scheduler.pause(await c.text(0), { guildID: c.ctx.guildID, authorID: c.ctx.authorID }));
  fn('resumeSchedule', 'schedule', 1, 2, '[id;duração?]', 'Retoma seu agendamento; duração opcional define novo vencimento a partir de agora.', async c =>
    c.ctx.scheduler.resume(await c.text(0), c.count > 1 ? c.ctx.now() + parseDuration(await c.text(1)) : undefined,
      { guildID: c.ctx.guildID, authorID: c.ctx.authorID }));
  fn('schedules', 'schedule', 0, 0, '', 'Lista agendamentos do servidor atual.', async c => {
    const scheduler = c.ctx.scheduler;
    const guildID = c.ctx.guildID;
    const all = await scheduler.list();
    return all.filter(item => item.guildID === guildID)
      .map(item => ({ id: item.id, command: item.command, input: item.input, due: item.due,
        authorID: item.authorID, paused: item.paused ?? false, maxAttempts: item.maxAttempts ?? 5,
        retryDelayMs: item.retryDelayMs ?? 30_000, retryBackoff: item.retryBackoff ?? 1, retryJitter: item.retryJitter ?? 0,
        ...(item.cron === undefined ? {} : { cron: item.cron, timezone: item.timezone, missedRun: item.missedRun ?? 'run-once' }),
        ...(item.interval === undefined ? {} : { interval: item.interval }) }));
  });
  fn('scheduleHistory', 'schedule', 0, 0, '', 'Lista o histórico dos seus agendamentos no servidor atual.', c =>
    c.ctx.scheduler.history({ guildID: c.ctx.guildID, authorID: c.ctx.authorID }));
  fn('failedSchedules', 'schedule', 0, 0, '', 'Lista suas execuções agendadas encerradas com falha.', c =>
    c.ctx.scheduler.failed({ guildID: c.ctx.guildID, authorID: c.ctx.authorID }));
  fn('retrySchedule', 'schedule', 1, 2, '[execução;duração?]', 'Reagenda uma falha operacional sua; guards e efeitos de moderação impedem reexecução.', async c =>
    c.ctx.scheduler.retry(await c.text(0), c.count > 1 ? c.ctx.now() + parseDuration(await c.text(1)) : c.ctx.now(),
      { guildID: c.ctx.guildID, authorID: c.ctx.authorID }));
});
