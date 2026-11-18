import { ConfigError } from '../errors.js';
import type { MetricsSink } from '../ports/metrics.js';

const METRIC_METHODS = [
  'onCommand',
  'onDispatchDropped',
  'onError',
  'onTransportRetry',
  'onSchedule',
  'onActiveExecutions',
] as const;

export function assertMetricsSink(metrics: unknown): MetricsSink | undefined {
  if (metrics === undefined) return undefined;
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    throw new ConfigError('METRICS_OPTIONS', 'metrics deve ser um objeto MetricsSink válido.');
  }
  const candidate = metrics as Record<string, unknown>;
  for (const method of METRIC_METHODS) {
    if (candidate[method] !== undefined && typeof candidate[method] !== 'function') {
      throw new ConfigError('METRICS_OPTIONS', `metrics.${method} deve ser uma função quando informado.`);
    }
  }
  return metrics as MetricsSink;
}

export function emitMetric(sink: MetricsSink | undefined, invoke: (metrics: MetricsSink) => unknown): void {
  if (!sink) return;
  try {
    const result = invoke(sink);
    if (
      (typeof result === 'object' || typeof result === 'function')
      && result !== null
      && typeof (result as PromiseLike<unknown>).then === 'function'
    ) {
      void Promise.resolve(result).catch(() => {});
    }
  } catch {
    // Exceções em MetricsSink customizado nunca devem interromper comandos ou eventos.
  }
}
