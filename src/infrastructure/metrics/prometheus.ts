import { isPlainRecord } from '../../domain/state-validation.js';
import type {
  CommandMetricEvent,
  DispatchDropMetricEvent,
  ErrorMetricEvent,
  MetricsSink,
  RetryMetricEvent,
  ScheduleMetricEvent,
} from '../../ports/metrics.js';
import { ConfigError } from '../../shared/errors.js';

export const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

export const DEFAULT_HISTOGRAM_BUCKETS: readonly number[] = Object.freeze([
  5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
]);

const DEFAULT_PREFIX = 'yuzuha';
const DEFAULT_MAX_SERIES = 10_000;
const MAX_SERIES_LIMIT = 1_000_000;
const MAX_BUCKETS = 128;
const METRIC_PREFIX_PATTERN = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;

export interface PrometheusMetricsOptions {
  /** Prefixo dos nomes de métricas (padrão `'yuzuha'`). */
  prefix?: string;
  /** Limites superiores em milissegundos para histogramas (ordem estritamente crescente). */
  buckets?: readonly number[];
  /** Limite máximo de séries distintas por família de métrica (padrão `10_000`). */
  maxSeries?: number;
}

interface HistogramEntry {
  readonly pairs: readonly (readonly [string, string])[];
  readonly buckets: number[];
  sum: number;
  count: number;
}

/** Escapa valores de labels segundo a especificação Prometheus text exposition `0.0.4`. */
export function escapePrometheusLabel(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
}

function formatLabels(pairs: readonly (readonly [string, string])[]): string {
  if (pairs.length === 0) return '';
  let out = '{';
  for (let i = 0; i < pairs.length; i++) {
    if (i > 0) out += ',';
    const [key, value] = pairs[i]!;
    out += `${key}="${escapePrometheusLabel(value)}"`;
  }
  out += '}';
  return out;
}

function formatMetricNumber(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0';
  return String(value);
}

function normalizePrefix(raw: unknown): string {
  if (raw === undefined) return DEFAULT_PREFIX;
  if (typeof raw !== 'string') {
    throw new ConfigError('METRICS_OPTIONS', 'prefix deve ser um texto válido.');
  }
  const trimmed = raw.replace(/_+$/, '');
  if (!trimmed || !METRIC_PREFIX_PATTERN.test(trimmed)) {
    throw new ConfigError('METRICS_OPTIONS', 'prefix deve seguir o padrão de nomes do Prometheus ([a-zA-Z_:][a-zA-Z0-9_:]*).');
  }
  return trimmed;
}

function normalizeBuckets(raw: unknown): readonly number[] {
  if (raw === undefined) return DEFAULT_HISTOGRAM_BUCKETS;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_BUCKETS) {
    throw new ConfigError('METRICS_OPTIONS', `buckets deve ser uma lista de 1 a ${MAX_BUCKETS} números positivos.`);
  }
  const normalized: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const value: unknown = raw[i];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new ConfigError('METRICS_OPTIONS', 'buckets deve conter apenas números finitos maiores que zero.');
    }
    if (i > 0 && value <= normalized[i - 1]!) {
      throw new ConfigError('METRICS_OPTIONS', 'buckets deve estar em ordem estritamente crescente.');
    }
    normalized.push(value);
  }
  return Object.freeze(normalized);
}

function normalizeMaxSeries(raw: unknown): number {
  if (raw === undefined) return DEFAULT_MAX_SERIES;
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 1 || raw > MAX_SERIES_LIMIT) {
    throw new ConfigError('METRICS_OPTIONS', `maxSeries deve ser um inteiro seguro entre 1 e ${MAX_SERIES_LIMIT}.`);
  }
  return raw;
}

/** Coletor e exportador Prometheus `0.0.4` em memória sem dependências externas. */
export class PrometheusMetrics implements MetricsSink {
  readonly contentType = PROMETHEUS_CONTENT_TYPE;
  readonly prefix: string;
  readonly buckets: readonly number[];
  private readonly maxSeries: number;

  private readonly commandsTotal = new Map<string, number>();
  private readonly commandDuration = new Map<string, HistogramEntry>();
  private readonly dispatchDroppedTotal = new Map<string, number>();
  private readonly errorsTotal = new Map<string, number>();
  private readonly transportRetriesTotal = new Map<string, number>();
  private transportRetryDelayTotalMs = 0;
  private readonly schedulerExecutionsTotal = new Map<string, number>();
  private readonly schedulerDuration = new Map<string, HistogramEntry>();
  private activeExecutionsGauge = 0;

  constructor(options?: PrometheusMetricsOptions) {
    if (options !== undefined && !isPlainRecord(options)) {
      throw new ConfigError('METRICS_OPTIONS', 'Opções de PrometheusMetrics inválidas.');
    }
    this.prefix = normalizePrefix(options?.prefix);
    this.buckets = normalizeBuckets(options?.buckets);
    this.maxSeries = normalizeMaxSeries(options?.maxSeries);
  }

  onCommand(event: CommandMetricEvent): void {
    const pairs: readonly (readonly [string, string])[] = [
      ['command', String(event.command)],
      ['outcome', String(event.outcome)],
    ];
    const key = formatLabels(pairs);
    this.incrementCounter(this.commandsTotal, key);
    if (Number.isFinite(event.durationMs)) {
      this.observeHistogram(this.commandDuration, key, pairs, Math.max(0, event.durationMs));
    }
  }

  onDispatchDropped(event: DispatchDropMetricEvent): void {
    const pairs: readonly (readonly [string, string])[] = event.guildID !== undefined && event.guildID !== ''
      ? [['reason', String(event.reason)], ['guild_id', String(event.guildID)]]
      : [['reason', String(event.reason)]];
    this.incrementCounter(this.dispatchDroppedTotal, formatLabels(pairs));
  }

  onError(event: ErrorMetricEvent): void {
    const pairs: readonly (readonly [string, string])[] = [
      ['source', String(event.source)],
      ['code', String(event.code)],
    ];
    this.incrementCounter(this.errorsTotal, formatLabels(pairs));
  }

  onTransportRetry(event: RetryMetricEvent): void {
    const pairs: readonly (readonly [string, string])[] = [['attempt', String(event.attempt)]];
    this.incrementCounter(this.transportRetriesTotal, formatLabels(pairs));
    if (Number.isFinite(event.delayMs) && event.delayMs > 0) {
      this.transportRetryDelayTotalMs += event.delayMs;
    }
  }

  onSchedule(event: ScheduleMetricEvent): void {
    const pairs: readonly (readonly [string, string])[] = [['outcome', String(event.outcome)]];
    const key = formatLabels(pairs);
    this.incrementCounter(this.schedulerExecutionsTotal, key);
    if (event.durationMs !== undefined && Number.isFinite(event.durationMs)) {
      this.observeHistogram(this.schedulerDuration, key, pairs, Math.max(0, event.durationMs));
    }
  }

  onActiveExecutions(activeExecutions: number): void {
    if (!Number.isFinite(activeExecutions)) return;
    this.activeExecutionsGauge = Math.max(0, Math.trunc(activeExecutions));
  }

  /** Reinicia todos os contadores, histogramas e gauges acumulados. */
  reset(): void {
    this.commandsTotal.clear();
    this.commandDuration.clear();
    this.dispatchDroppedTotal.clear();
    this.errorsTotal.clear();
    this.transportRetriesTotal.clear();
    this.transportRetryDelayTotalMs = 0;
    this.schedulerExecutionsTotal.clear();
    this.schedulerDuration.clear();
    this.activeExecutionsGauge = 0;
  }

  /** Serializa as métricas no formato Prometheus text exposition `0.0.4`. */
  render(): string {
    const lines: string[] = [];
    const p = this.prefix;

    this.renderCounter(
      lines,
      `${p}_commands_total`,
      'Total de execuções de comandos por comando e desfecho.',
      this.commandsTotal,
    );
    this.renderHistogram(
      lines,
      `${p}_command_duration_milliseconds`,
      'Duração das execuções de comandos em milissegundos.',
      this.commandDuration,
    );
    this.renderCounter(
      lines,
      `${p}_dispatch_dropped_total`,
      'Total de despachos descartados por limite operacional.',
      this.dispatchDroppedTotal,
    );
    this.renderCounter(
      lines,
      `${p}_errors_total`,
      'Total de erros reportados por origem e código.',
      this.errorsTotal,
    );
    this.renderCounter(
      lines,
      `${p}_transport_retries_total`,
      'Total de retentativas de transporte por número de tentativa.',
      this.transportRetriesTotal,
    );

    lines.push(`# HELP ${p}_transport_retry_delay_milliseconds_total Soma dos atrasos de retentativa de transporte em milissegundos.`);
    lines.push(`# TYPE ${p}_transport_retry_delay_milliseconds_total counter`);
    lines.push(`${p}_transport_retry_delay_milliseconds_total ${formatMetricNumber(this.transportRetryDelayTotalMs)}`);

    this.renderCounter(
      lines,
      `${p}_scheduler_executions_total`,
      'Total de execuções do agendador por desfecho.',
      this.schedulerExecutionsTotal,
    );
    this.renderHistogram(
      lines,
      `${p}_scheduler_duration_milliseconds`,
      'Duração das execuções do agendador em milissegundos.',
      this.schedulerDuration,
    );

    lines.push(`# HELP ${p}_active_executions Quantidade atual de execuções ativas no bot.`);
    lines.push(`# TYPE ${p}_active_executions gauge`);
    lines.push(`${p}_active_executions ${formatMetricNumber(this.activeExecutionsGauge)}`);

    return `${lines.join('\n')}\n`;
  }

  private incrementCounter(map: Map<string, number>, key: string): void {
    const existing = map.get(key);
    if (existing !== undefined) {
      map.set(key, existing + 1);
      return;
    }
    if (map.size >= this.maxSeries) return;
    map.set(key, 1);
  }

  private observeHistogram(
    map: Map<string, HistogramEntry>,
    key: string,
    pairs: readonly (readonly [string, string])[],
    value: number,
  ): void {
    let entry = map.get(key);
    if (!entry) {
      if (map.size >= this.maxSeries) return;
      entry = {
        pairs,
        buckets: new Array<number>(this.buckets.length).fill(0),
        sum: 0,
        count: 0,
      };
      map.set(key, entry);
    }
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]!) entry.buckets[i]!++;
    }
    entry.sum += value;
    entry.count++;
  }

  private renderCounter(lines: string[], name: string, help: string, map: ReadonlyMap<string, number>): void {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} counter`);
    for (const [labels, count] of [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
      lines.push(`${name}${labels} ${formatMetricNumber(count)}`);
    }
  }

  private renderHistogram(
    lines: string[],
    name: string,
    help: string,
    map: ReadonlyMap<string, HistogramEntry>,
  ): void {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} histogram`);
    for (const [labels, entry] of [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
      for (let i = 0; i < this.buckets.length; i++) {
        const bucketLabels = formatLabels([...entry.pairs, ['le', String(this.buckets[i]!)]]);
        lines.push(`${name}_bucket${bucketLabels} ${formatMetricNumber(entry.buckets[i]!)}`);
      }
      const infLabels = formatLabels([...entry.pairs, ['le', '+Inf']]);
      lines.push(`${name}_bucket${infLabels} ${formatMetricNumber(entry.count)}`);
      lines.push(`${name}_sum${labels} ${formatMetricNumber(entry.sum)}`);
      lines.push(`${name}_count${labels} ${formatMetricNumber(entry.count)}`);
    }
  }
}

/** Cria uma instância configurada de {@link PrometheusMetrics}. */
export function createPrometheusMetrics(options?: PrometheusMetricsOptions): PrometheusMetrics {
  return new PrometheusMetrics(options);
}
