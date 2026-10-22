import { randomUUID } from 'node:crypto';
import type { ScheduleExecutionRecord, ScheduleRecord } from '../domain/state.js';
import { assertTimezone, nextCron, parseCron } from '../domain/cron.js';
import type { MissedRunPolicy } from '../domain/cron.js';
import type { Store } from '../ports/store.js';
import { GuardError, PartialModerationError, YuzuhaError } from '../shared/errors.js';

export interface RetryPolicy { maxAttempts?: number; retryDelayMs?: number; retryBackoff?: number; retryJitter?: number }
export interface ScheduleInput extends RetryPolicy {
  guildID: string;
  channelID: string;
  authorID: string;
  command: string;
  input: string;
  due: number;
  interval?: number;
  paused?: boolean;
  cron?: string;
  timezone?: string;
  missedRun?: MissedRunPolicy;
}
export interface CronScheduleInput extends Omit<ScheduleInput, 'due' | 'interval' | 'cron'> {
  expression: string;
  timezone: string;
  after?: number;
}
export interface SchedulePatch extends RetryPolicy {
  command?: string;
  input?: string;
  due?: number;
  interval?: number | null;
  cron?: string | null;
  timezone?: string;
  missedRun?: MissedRunPolicy;
}
export interface ScheduleAccess { guildID: string; authorID: string }
export class ScheduleExecutionError extends YuzuhaError {
  constructor(public readonly retryable: boolean, cause?: unknown) {
    super('SCHEDULE_EXECUTION', 'O comando agendado não foi concluído.', { cause });
  }
}
const ORPHAN_MS = 5 * 60_000;
const MAX_DELAY = 7 * 86400_000;

export interface SchedulerEvent {
  event: 'schedule.start' | 'schedule.finish' | 'schedule.error';
  scheduleID?: string;
  executionID?: string;
  status?: ScheduleExecutionRecord['status'];
  durationMs?: number;
  errorCode?: string;
  retryable?: boolean;
}
export interface SchedulerOptions {
  leaseMs?: number;
  heartbeatMs?: number;
  historyLimit?: number;
  now?: () => number;
  concurrency?: number;
  random?: () => number;
  onEvent?: (event: SchedulerEvent) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
}
export function errorCode(error: unknown): string {
  return error instanceof YuzuhaError && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code) ? error.code : 'UNEXPECTED_ERROR';
}

function assertInput(input: ScheduleInput): void {
  for (const key of ['guildID', 'channelID', 'authorID', 'command', 'input'] as const) {
    if (typeof input[key] !== 'string') throw new YuzuhaError('SCHEDULE', 'Agendamento precisa de textos válidos.');
  }
  if (!input.command.trim()) throw new YuzuhaError('SCHEDULE', 'Informe o comando a agendar.');
  if (!Number.isFinite(input.due)) throw new YuzuhaError('SCHEDULE', 'Vencimento do agendamento inválido.');
  if (input.interval !== undefined && (!Number.isSafeInteger(input.interval) || input.interval <= 0)) throw new YuzuhaError('SCHEDULE', 'Intervalo do agendamento inválido.');
  if (input.paused !== undefined && typeof input.paused !== 'boolean') throw new YuzuhaError('SCHEDULE', 'paused deve ser booleano.');
  if (input.maxAttempts !== undefined && (!Number.isSafeInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 100)) throw new YuzuhaError('SCHEDULE', 'maxAttempts deve estar entre 1 e 100.');
  if (input.retryDelayMs !== undefined && (!Number.isSafeInteger(input.retryDelayMs) || input.retryDelayMs < 1 || input.retryDelayMs > MAX_DELAY)) throw new YuzuhaError('SCHEDULE', 'retryDelayMs deve ser inteiro entre 1 e 604800000.');
  if (input.retryBackoff !== undefined && (!Number.isFinite(input.retryBackoff) || input.retryBackoff < 1 || input.retryBackoff > 10)) throw new YuzuhaError('SCHEDULE', 'retryBackoff deve estar entre 1 e 10.');
  if (input.retryJitter !== undefined && (!Number.isFinite(input.retryJitter) || input.retryJitter < 0 || input.retryJitter > 1)) throw new YuzuhaError('SCHEDULE', 'retryJitter deve estar entre 0 e 1.');
  if (input.cron !== undefined) {
    if (input.interval !== undefined) throw new YuzuhaError('SCHEDULE', 'Escolha cron ou intervalo para a repetição.');
    parseCron(input.cron);
    assertTimezone(input.timezone!);
    if (input.missedRun !== undefined && input.missedRun !== 'skip' && input.missedRun !== 'run-once') {
      throw new YuzuhaError('SCHEDULE', 'missedRun deve ser skip ou run-once.');
    }
  } else if (input.timezone !== undefined || input.missedRun !== undefined) throw new YuzuhaError('SCHEDULE', 'Fuso e política de execuções perdidas precisam de cron.');
}
function accessible(item: ScheduleRecord, access?: ScheduleAccess): boolean {
  return !access || (item.guildID === access.guildID && item.authorID === access.authorID);
}

export class Scheduler {
  private timer?: NodeJS.Timeout;
  private readonly activeClaims = new Set<string>();
  private readonly executions = new Set<Promise<void>>();
  private readonly controllers = new Set<AbortController>();
  private generation = 0;
  private readonly leaseMs: number;
  private readonly heartbeatMs: number;
  private readonly historyLimit: number;
  private readonly now: () => number;
  private readonly concurrency: number;
  private ticking?: Promise<void>;
  constructor(private readonly store: Store,
    private readonly execute: (task: ScheduleRecord, signal: AbortSignal) => Promise<void>,
    private readonly options: SchedulerOptions = {}) {
    this.leaseMs = options.leaseMs ?? ORPHAN_MS;
    this.heartbeatMs = options.heartbeatMs ?? Math.max(1, Math.floor(this.leaseMs / 3));
    this.historyLimit = options.historyLimit ?? 1000;
    this.now = options.now ?? Date.now;
    this.concurrency = options.concurrency ?? 1;
    if (!Number.isSafeInteger(this.leaseMs) || this.leaseMs < 3
      || !Number.isSafeInteger(this.heartbeatMs) || this.heartbeatMs < 1 || this.heartbeatMs >= this.leaseMs
      || !Number.isSafeInteger(this.historyLimit) || this.historyLimit < 1 || this.historyLimit > 10_000
      || !Number.isSafeInteger(this.concurrency) || this.concurrency < 1 || this.concurrency > 128
      || (options.random !== undefined && typeof options.random !== 'function')) {
      throw new YuzuhaError('SCHEDULE_OPTIONS', 'Lease, heartbeat, concorrência ou limite do histórico inválido.');
    }
  }

  private async notify(event: SchedulerEvent): Promise<void> {
    try { await this.options.onEvent?.(event); } catch (error) { await this.report(error); }
  }
  private async report(error: unknown): Promise<void> {
    try {
      await this.options.onEvent?.({ event: 'schedule.error', errorCode: errorCode(error) });
      if (this.options.onError) await this.options.onError(error);
      else console.error(`[yuzuha] ${errorCode(error)}`);
    } catch { console.error('[yuzuha] SCHEDULE_ERROR_HANDLER_FAILED'); }
  }

  async add(input: ScheduleInput): Promise<string> {
    assertInput(input);
    if (input.cron !== undefined) nextCron(input.cron, input.timezone!, input.due - 1);
    const record: ScheduleRecord = { ...structuredClone(input), id: randomUUID(), attempts: 0, runningAt: null };
    await this.store.update(state => { state.schedules.push(record); });
    return record.id;
  }
  async addCron(input: CronScheduleInput): Promise<string> {
    const { expression, after = this.now(), ...fields } = input;
    return this.add({ ...fields, cron: expression, missedRun: input.missedRun ?? 'run-once',
      due: nextCron(expression, input.timezone, after) });
  }
  cancel(id: string, access?: ScheduleAccess): Promise<boolean> {
    return this.store.update(state => {
      const index = state.schedules.findIndex(item => item.id === id && accessible(item, access));
      if (index < 0) return false;
      state.schedules.splice(index, 1);
      return true;
    });
  }
  list(): Promise<ScheduleRecord[]> { return this.store.read(state => state.schedules); }
  history(access?: ScheduleAccess): Promise<ScheduleExecutionRecord[]> {
    return this.store.read(state => (state.scheduleHistory ?? []).filter(item => accessible(item.task, access)));
  }
  failed(access?: ScheduleAccess): Promise<ScheduleExecutionRecord[]> {
    return this.store.read(state => (state.scheduleHistory ?? []).filter(item => item.status === 'failed' && accessible(item.task, access)));
  }
  retry(executionID: string, due = this.now(), access?: ScheduleAccess): Promise<string | null> {
    if (!Number.isFinite(due)) throw new YuzuhaError('SCHEDULE', 'Vencimento do agendamento inválido.');
    return this.store.update(state => {
      const entry = (state.scheduleHistory ?? []).find(item => item.id === executionID && item.status === 'failed' && accessible(item.task, access));
      if (!entry) return null;
      if (!entry.retryable) throw new YuzuhaError('SCHEDULE_UNSAFE_RETRY', 'Esta execução terminou com guard ou possível efeito de moderação e não permite reexecução.');
      const task = { ...structuredClone(entry.task), id: randomUUID(), due, attempts: 0, runningAt: null, claimID: null, paused: false };
      state.schedules.push(task);
      return task.id;
    });
  }

  edit(id: string, patch: SchedulePatch, access?: ScheduleAccess): Promise<boolean> {
    const allowed = ['command', 'input', 'due', 'interval', 'maxAttempts', 'retryDelayMs', 'retryBackoff', 'retryJitter', 'cron', 'timezone', 'missedRun'];
    if (Object.keys(patch).some(key => !allowed.includes(key))) throw new YuzuhaError('SCHEDULE', 'Campo de agendamento desconhecido.');
    return this.change(id, access, item => {
      const { interval, cron, ...fields } = patch;
      Object.assign(item, fields);
      if (interval === null) delete item.interval;
      else if (interval !== undefined) item.interval = interval;
      if (cron === null) { delete item.cron; delete item.timezone; delete item.missedRun; }
      else if (cron !== undefined) item.cron = cron;
      assertInput(item);
      if (item.cron !== undefined && (cron !== undefined || patch.timezone !== undefined) && patch.due === undefined) {
        item.due = nextCron(item.cron, item.timezone!, this.now()); item.attempts = 0;
      }
    });
  }
  pause(id: string, access?: ScheduleAccess): Promise<boolean> {
    return this.change(id, access, item => { item.paused = true; });
  }
  resume(id: string, due?: number, access?: ScheduleAccess): Promise<boolean> {
    return this.change(id, access, item => {
      item.paused = false; item.attempts = 0;
      if (due !== undefined) item.due = due;
      assertInput(item);
    });
  }
  private change(id: string, access: ScheduleAccess | undefined, update: (item: ScheduleRecord) => void): Promise<boolean> {
    return this.store.update(state => {
      const item = state.schedules.find(task => task.id === id && accessible(task, access));
      if (!item) return false;
      if (item.runningAt != null) throw new YuzuhaError('SCHEDULE_RUNNING', 'Aguarde a tarefa em execução antes de editá-la, pausar ou retomar.');
      update(item);
      return true;
    });
  }

  tick(now = this.now()): Promise<void> {
    if (!Number.isFinite(now)) return Promise.reject(new YuzuhaError('SCHEDULE', 'Instante do relógio inválido.'));
    if (this.ticking) return this.ticking;
    const work = this.runTick(now, this.generation);
    this.ticking = work;
    this.executions.add(work);
    void work.finally(() => {
      if (this.ticking === work) this.ticking = undefined;
      this.executions.delete(work);
    }).catch(() => {});
    return work;
  }
  private async runTick(now: number, generation: number): Promise<void> {
    const due = await this.store.read(state => state.schedules
      .filter(item => !item.paused && item.due <= now && item.runningAt == null).map(item => item.id));
    let cursor = 0;
    const workers = Array.from({ length: Math.min(this.concurrency, due.length) }, async () => {
      while (cursor < due.length && generation === this.generation) {
        const id = due[cursor++]!;
        const task = await this.store.update(state => {
          const item = state.schedules.find(task => task.id === id);
          if (generation !== this.generation || !item || item.paused || item.due > now || item.runningAt != null) return null;
          if (item.cron !== undefined && item.attempts === 0 && item.missedRun === 'skip' && item.due + 60_000 <= now) {
            item.due = nextCron(item.cron, item.timezone!, Math.floor(now / 60_000) * 60_000 - 1);
            if (item.due > now) return null;
          }
          item.runningAt = now; item.claimID = randomUUID();
          return item;
        });
        if (task) await this.runTask(task, now, generation);
      }
    });
    const results = await Promise.allSettled(workers);
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }
  private async runTask(task: ScheduleRecord, now: number, generation: number): Promise<void> {
    const id = task.id, claimID = task.claimID!;
    const snapshot = structuredClone(task);
    this.activeClaims.add(claimID);
    const controller = new AbortController();
    this.controllers.add(controller);
    if (generation !== this.generation) controller.abort();
    const started = this.now();
    let heartbeat = Promise.resolve();
    const timer = setInterval(() => {
      heartbeat = heartbeat.then(async () => {
        const held = await this.store.update(state => {
          const current = state.schedules.find(item => item.id === id && item.claimID === claimID);
          if (!current) return false;
          current.runningAt = now + Math.max(0, this.now() - started);
          return true;
        });
        if (!held) controller.abort();
      }).catch(async error => { controller.abort(); await this.report(error); });
    }, this.heartbeatMs);
    timer.unref();
    let ok = false, retryable = true, code: string | undefined;
    await this.notify({ event: 'schedule.start', scheduleID: id, executionID: claimID });
    try {
      if (controller.signal.aborted) throw new YuzuhaError('SCHEDULE_ABORTED', 'Execução cancelada.');
      await this.execute(task, controller.signal); ok = true;
    }
    catch (error) {
      code = errorCode(error);
      retryable = !(error instanceof GuardError || error instanceof PartialModerationError
        || (error instanceof ScheduleExecutionError && !error.retryable));
    }
    clearInterval(timer);
    await heartbeat;
    const finishedAt = now + Math.max(0, this.now() - started);
    let status: ScheduleExecutionRecord['status'] = ok ? 'success' : 'failed';
    try {
      await this.store.update(state => {
        const index = state.schedules.findIndex(item => item.id === id && item.claimID === claimID);
        if (index < 0) return;
        const current = state.schedules[index]!;
        if (ok && current.cron !== undefined) {
          try {
            current.due = nextCron(current.cron, current.timezone!, finishedAt);
            current.attempts = 0;
          } catch (error) {
            if (!(error instanceof YuzuhaError) || error.code !== 'CRON_UNREACHABLE') throw error;
            state.schedules.splice(index, 1);
            status = 'failed'; retryable = false; code = error.code;
          }
        } else if (ok && current.interval !== undefined) {
          const missed = Math.floor((now - current.due) / current.interval);
          const steps = Number.isFinite(missed) && missed >= 0 ? missed + 1 : 1;
          const next = current.due + steps * current.interval;
          current.due = Number.isFinite(next) && next > now ? next : now + Math.max(1, current.interval);
          current.attempts = 0;
        } else if (!ok && retryable && current.attempts + 1 < (current.maxAttempts ?? 5)) {
          let delay = Math.min(MAX_DELAY, (current.retryDelayMs ?? 30_000) * (current.retryBackoff ?? 1) ** current.attempts);
          if (current.retryJitter) {
            const random = (this.options.random ?? Math.random)();
            if (!Number.isFinite(random) || random < 0 || random > 1) throw new YuzuhaError('SCHEDULE_RANDOM', 'A fonte de jitter deve retornar um número entre 0 e 1.');
            delay = Math.min(MAX_DELAY, Math.max(1, Math.round(delay * (1 + (2 * random - 1) * current.retryJitter))));
          }
          current.due = now + delay;
          current.attempts++;
          status = 'retrying';
        } else { state.schedules.splice(index, 1); }
        if (state.schedules.includes(current)) { current.runningAt = null; current.claimID = null; }
        const history = state.scheduleHistory ??= [];
        history.push({ id: claimID, task: snapshot, startedAt: now, finishedAt, status, retryable,
          ...(code ? { errorCode: code } : {}) });
        if (history.length > this.historyLimit) history.splice(0, history.length - this.historyLimit);
      });
      await this.notify({ event: 'schedule.finish', scheduleID: id, executionID: claimID,
        status, durationMs: finishedAt - now, retryable, ...(code ? { errorCode: code } : {}) });
    } finally { this.activeClaims.delete(claimID); this.controllers.delete(controller); }
  }
  async recover(now = this.now()): Promise<number> {
    const stale = (item: ScheduleRecord): boolean => item.runningAt != null && now - item.runningAt > this.leaseMs
      && !this.activeClaims.has(item.claimID ?? '');
    if (!await this.store.read(state => state.schedules.some(stale))) return 0;
    return this.store.update(state => {
      let freed = 0;
      for (const item of state.schedules) {
        if (stale(item)) {
          item.runningAt = null; item.claimID = null; freed++;
        }
      }
      return freed;
    });
  }
  start(intervalMs = 1000): void {
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1) throw new YuzuhaError('SCHEDULE', 'Intervalo do relógio deve ser inteiro positivo.');
    if (this.timer) return;
    const generation = this.generation;
    const cycle = (): void => {
      const work = this.recover().then(async () => {
        if (generation === this.generation) await this.tick();
      }).catch(error => this.report(error));
      this.executions.add(work);
      void work.finally(() => this.executions.delete(work)).catch(() => {});
    };
    cycle();
    this.timer = setInterval(cycle, intervalMs);
    this.timer.unref();
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined; this.generation++;
    for (const controller of this.controllers) controller.abort();
  }
  async drain(): Promise<void> { await Promise.allSettled([...this.executions]); }
}
