export type CommandMetricOutcome = 'success' | 'guarded' | 'error';
export type DispatchDropReason = 'concurrency';
export type ErrorMetricSource = 'command' | 'event' | 'gateway' | 'scheduler' | 'hook';
export type ScheduleMetricOutcome = 'completed' | 'failed' | 'cancelled';

export interface CommandMetricEvent {
  readonly command: string;
  readonly outcome: CommandMetricOutcome;
  readonly durationMs: number;
}

export interface DispatchDropMetricEvent {
  readonly reason: DispatchDropReason;
  readonly guildID?: string;
}

export interface ErrorMetricEvent {
  readonly source: ErrorMetricSource;
  readonly code: string;
}

export interface RetryMetricEvent {
  readonly attempt: number;
  readonly delayMs: number;
}

export interface ScheduleMetricEvent {
  readonly outcome: ScheduleMetricOutcome;
  readonly durationMs?: number;
}

/** Porta opcional para observação de métricas operacionais do bot sem dependências externas. */
export interface MetricsSink {
  onCommand?(event: CommandMetricEvent): void;
  onDispatchDropped?(event: DispatchDropMetricEvent): void;
  onError?(event: ErrorMetricEvent): void;
  onTransportRetry?(event: RetryMetricEvent): void;
  onSchedule?(event: ScheduleMetricEvent): void;
  onActiveExecutions?(activeExecutions: number): void;
}
