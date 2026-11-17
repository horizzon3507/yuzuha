import type { VariableQuery, VariablePage } from '../domain/variable-query.js';
import type { JsonValue, ScheduleRecord, State } from '../domain/state.js';

export interface ScheduleClaimRequest {
  now: number;
  limit: number;
  globalConcurrency?: number;
  createClaimID: () => string;
  canClaim?: () => boolean;
}

export interface ScheduleClaimResult {
  claimed: ScheduleRecord[];
  nextDue: number | null;
}

export interface ScheduleRecoveryResult {
  freed: number;
  nextDue: number | null;
}

export interface Store {
  read<T>(reader: (state: Readonly<State>) => T): Promise<T>;
  update<T>(writer: (state: State) => T): Promise<T>;
  /** Evaluate the clock inside the serialized read; undefined means missing or expired. */
  readVariable?(key: string, now: () => number): Promise<JsonValue | undefined>;
  queryVariables?(query: VariableQuery, now: () => number): Promise<VariablePage>;
  /** Atomically claim up to `limit` eligible due schedules without loading full state. */
  claimDueSchedules?(request: ScheduleClaimRequest): Promise<ScheduleClaimResult>;
  /** Release stale running claims whose `runningAt` is strictly older than `cutoffRunningAt`. */
  recoverSchedules?(cutoffRunningAt: number, activeClaimIDs: ReadonlySet<string>): Promise<ScheduleRecoveryResult>;
  close?(): Promise<void>;
}
