import type { State } from '../domain/state.js';
import { isState } from '../domain/state-validation.js';
import type { Store } from '../ports/store.js';
import { YuzuhaError } from '../shared/errors.js';

export interface StoreStatistics {
  schema: 2;
  variables: number;
  activeVariables: number;
  expiredVariables: number;
  expirationEntries: number;
  orphanExpirations: number;
  cases: number;
  guildsWithCases: number;
  schedules: number;
  pausedSchedules: number;
  runningSchedules: number;
  historyEntries: number;
  /** UTF-8 bytes of compact JSON, excluding database and filesystem overhead. */
  jsonBytes: number;
}
export interface CleanupOptions { limit?: number; cursor?: string | null }
export interface CleanupResult {
  scanned: number;
  removed: number;
  orphanExpirationsRemoved: number;
  cursor: string | null;
}
export interface StateBackup {
  format: 'yuzuha-state';
  version: 1;
  createdAt: string;
  state: State;
}
export interface RestoreOptions {
  policy: 'replace' | 'merge';
  /** Defaults to true. Set false explicitly to commit the validated state. */
  dryRun?: boolean;
}
export interface RestoreReport {
  policy: 'replace' | 'merge';
  dryRun: boolean;
  before: StoreStatistics;
  after: StoreStatistics;
}

function statistics(state: Readonly<State>, now: number): StoreStatistics {
  const keys = Object.keys(state.variables), expirations = state.variableExpirations ?? {};
  const expired = keys.filter(key => Object.hasOwn(expirations, key) && expirations[key]! <= now).length;
  return {
    schema: state.schema, variables: keys.length, activeVariables: keys.length - expired,
    expiredVariables: expired, expirationEntries: Object.keys(expirations).length,
    orphanExpirations: Object.keys(expirations).filter(key => !Object.hasOwn(state.variables, key)).length,
    cases: Object.values(state.cases).reduce((sum, cases) => sum + cases.length, 0),
    guildsWithCases: Object.keys(state.cases).length, schedules: state.schedules.length,
    pausedSchedules: state.schedules.filter(task => task.paused).length,
    runningSchedules: state.schedules.filter(task => task.runningAt != null || task.claimID != null).length,
    historyEntries: state.scheduleHistory?.length ?? 0,
    jsonBytes: new TextEncoder().encode(JSON.stringify(state)).byteLength,
  };
}

function checkState(value: unknown): asserts value is State {
  if (!isState(value)) throw new YuzuhaError('BACKUP_INVALID', 'Backup contém estado inválido ou schema desconhecido.');
  if (new Set(value.schedules.map(task => task.id)).size !== value.schedules.length
    || new Set(value.scheduleHistory?.map(run => run.id)).size !== (value.scheduleHistory?.length ?? 0)) {
    throw new YuzuhaError('BACKUP_CONFLICT', 'IDs de tarefas e execuções devem ser únicos.');
  }
}

function idle(state: Readonly<State>): void {
  if (state.schedules.some(task => task.runningAt != null || task.claimID != null)) {
    throw new YuzuhaError('BACKUP_RUNNING', 'Encerre e aguarde as execuções agendadas antes de criar ou restaurar o backup.');
  }
}

function decodeBackup(value: unknown): StateBackup {
  let snapshot: unknown;
  try { snapshot = structuredClone(value); }
  catch (cause) { throw new YuzuhaError('BACKUP_INVALID', 'Backup deve conter apenas dados JSON.', { cause }); }
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new YuzuhaError('BACKUP_INVALID', 'Envelope de backup inválido.');
  }
  const backup = snapshot as Record<string, unknown>;
  if (backup['format'] !== 'yuzuha-state' || backup['version'] !== 1
    || typeof backup['createdAt'] !== 'string' || !Number.isFinite(Date.parse(backup['createdAt']))
    || Object.keys(backup).some(key => !['format', 'version', 'createdAt', 'state'].includes(key))) {
    throw new YuzuhaError('BACKUP_INVALID', 'Formato ou versão do backup inválidos.');
  }
  checkState(backup['state']);
  idle(backup['state']);
  return backup as unknown as StateBackup;
}

function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>, keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
}

function mergeByID<T extends { id: string }>(target: readonly T[], source: readonly T[], kind: string): T[] {
  const result = [...target], known = new Map(result.map(item => [item.id, item]));
  for (const item of source) {
    const current = known.get(item.id);
    if (current && !same(current, item)) throw new YuzuhaError('BACKUP_CONFLICT', `Conflito em ${kind}: ${item.id}.`);
    if (!current) { result.push(item); known.set(item.id, item); }
  }
  return result;
}

function merge(target: State, source: State): State {
  const result = structuredClone(target);
  for (const [key, value] of Object.entries(source.variables)) {
    Object.defineProperty(result.variables, key, { value: structuredClone(value), writable: true, enumerable: true, configurable: true });
    if (Object.hasOwn(source.variableExpirations ?? {}, key)) {
      result.variableExpirations ??= {};
      Object.defineProperty(result.variableExpirations, key, {
        value: source.variableExpirations![key], writable: true, enumerable: true, configurable: true,
      });
    } else if (result.variableExpirations) delete result.variableExpirations[key];
  }
  for (const [key, expiry] of Object.entries(source.variableExpirations ?? {})) {
    if (!Object.hasOwn(result.variables, key)) {
      result.variableExpirations ??= {};
      Object.defineProperty(result.variableExpirations, key, { value: expiry, writable: true, enumerable: true, configurable: true });
    }
  }
  for (const [guild, cases] of Object.entries(source.cases)) {
    const current = Object.hasOwn(result.cases, guild) ? result.cases[guild]! : [];
    for (let index = 0; index < Math.min(current.length, cases.length); index++) {
      if (!same(current[index], cases[index])) throw new YuzuhaError('BACKUP_CONFLICT', `Conflito no caso ${guild}/${index + 1}.`);
    }
    Object.defineProperty(result.cases, guild, { value: cases.length > current.length ? cases : current,
      writable: true, enumerable: true, configurable: true });
  }
  result.schedules = mergeByID(result.schedules, source.schedules, 'tarefa');
  if (source.scheduleHistory !== undefined || result.scheduleHistory !== undefined) {
    result.scheduleHistory = mergeByID(result.scheduleHistory ?? [], source.scheduleHistory ?? [], 'execução');
  }
  return result;
}

export class StateMaintenance {
  constructor(private readonly store: Store, private readonly now: () => number = Date.now) {}

  stats(): Promise<StoreStatistics> {
    return this.store.read(state => statistics(state, this.now()));
  }

  cleanupExpired(options: CleanupOptions = {}): Promise<CleanupResult> {
    const limit = options.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000) {
      throw new YuzuhaError('CLEANUP_LIMIT', 'Limite de limpeza deve estar entre 1 e 10000.');
    }
    const cursor = options.cursor ?? null;
    if (cursor !== null && typeof cursor !== 'string') {
      throw new YuzuhaError('CLEANUP_CURSOR', 'Cursor de limpeza inválido.');
    }
    return this.store.update(state => {
      const now = this.now(), expirations = state.variableExpirations ?? {};
      const keys = Object.keys(expirations).sort().filter(key => cursor === null || key > cursor);
      const batch = keys.slice(0, limit);
      let removed = 0, orphanExpirationsRemoved = 0;
      for (const key of batch) {
        if (!Object.hasOwn(state.variables, key)) { delete expirations[key]; orphanExpirationsRemoved++; }
        else if (expirations[key]! <= now) { delete state.variables[key]; delete expirations[key]; removed++; }
      }
      return { scanned: batch.length, removed, orphanExpirationsRemoved,
        cursor: keys.length > batch.length ? batch.at(-1)! : null };
    });
  }

  backup(): Promise<StateBackup> {
    return this.store.read(state => {
      checkState(state);
      idle(state);
      return { format: 'yuzuha-state', version: 1, createdAt: new Date(this.now()).toISOString(), state };
    });
  }

  async restore(value: unknown, options: RestoreOptions): Promise<RestoreReport> {
    if (!options || !['replace', 'merge'].includes(options.policy)
      || (options.dryRun !== undefined && typeof options.dryRun !== 'boolean')) {
      throw new YuzuhaError('BACKUP_POLICY', 'Declare policy replace ou merge e dryRun booleano.');
    }
    const source = decodeBackup(value).state, dryRun = options.dryRun ?? true, policy = options.policy;
    const prepare = (target: State): { next: State; report: RestoreReport } => {
      checkState(target);
      idle(target);
      const next = policy === 'replace' ? structuredClone(source) : merge(target, source);
      checkState(next);
      const now = this.now();
      return { next, report: { policy, dryRun, before: statistics(target, now), after: statistics(next, now) } };
    };
    if (dryRun) return this.store.read(target => prepare(target).report);
    return this.store.update(target => {
      const { next, report } = prepare(target);
      for (const key of Object.keys(target)) delete (target as unknown as Record<string, unknown>)[key];
      for (const [key, value] of Object.entries(next)) {
        Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });
      }
      return report;
    });
  }
}
