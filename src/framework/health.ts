import { createServer } from 'node:http';
import type { IncomingMessage as HttpRequest, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { isPlainRecord } from '../domain/state-validation.js';
import { ConfigError } from '../errors.js';
import type { Yuzuha } from './bot.js';

export type HealthStatus = 'ok' | 'starting' | 'closed';

export interface HealthReport {
  readonly status: HealthStatus;
  readonly ready: boolean;
  readonly closing: boolean;
  readonly uptimeMs: number | null;
  readonly activeExecutions: number;
  readonly schedulerRunning: boolean;
  readonly timestamp: number;
}

export interface HealthMetricsSource {
  render(): string;
  readonly contentType?: string;
}

export interface HealthServerOptions {
  /** Porta TCP (`0..65535`); `0` aloca porta efêmera do sistema operacional. */
  port?: number;
  /** Endereço de escuta (padrão `'127.0.0.1'`). */
  host?: string;
  /** Rota primária de healthcheck (padrão `'/health'`; `'/healthz'` também é aceita). */
  path?: string;
  /** Exportador opcional exposto em `GET /metrics` (ex.: `PrometheusMetrics`). */
  metrics?: HealthMetricsSource;
}

export interface HealthServer {
  readonly host: string;
  readonly port: number;
  readonly path: string;
  readonly url: string;
  close(): Promise<void>;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PATH = '/health';
const HEALTHZ_PATH = '/healthz';
const METRICS_PATH = '/metrics';
const DEFAULT_METRICS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

function writeResponse(
  req: HttpRequest,
  res: ServerResponse,
  statusCode: number,
  contentType: string,
  payload: string,
  extraHeaders?: Record<string, string>,
): void {
  const body = Buffer.from(payload, 'utf8');
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': String(body.byteLength),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  if (req.method === 'HEAD') res.end();
  else res.end(body);
}

function normalizeOptions(options: unknown): {
  port: number;
  host: string;
  path: string;
  metrics?: HealthMetricsSource;
} {
  if (options !== undefined && !isPlainRecord(options)) {
    throw new ConfigError('HEALTH_OPTIONS', 'Opções do servidor de healthcheck inválidas.');
  }
  const rawPort = options?.['port'] ?? 0;
  if (typeof rawPort !== 'number' || !Number.isSafeInteger(rawPort) || rawPort < 0 || rawPort > 65_535) {
    throw new ConfigError('HEALTH_OPTIONS', 'port deve ser um inteiro seguro entre 0 e 65535.');
  }
  const rawHost = options?.['host'] ?? DEFAULT_HOST;
  if (typeof rawHost !== 'string' || !rawHost.trim() || rawHost !== rawHost.trim()) {
    throw new ConfigError('HEALTH_OPTIONS', 'host deve ser um endereço não vazio sem espaços nas extremidades.');
  }
  const rawPath = options?.['path'] ?? DEFAULT_PATH;
  if (typeof rawPath !== 'string' || !rawPath.startsWith('/') || rawPath.length > 256 || /[\s?#]/.test(rawPath)) {
    throw new ConfigError('HEALTH_OPTIONS', 'path deve iniciar com "/" e não conter espaços, "?" ou "#".');
  }
  const rawMetrics = options?.['metrics'];
  let metrics: HealthMetricsSource | undefined;
  if (rawMetrics !== undefined) {
    if (
      !rawMetrics
      || typeof rawMetrics !== 'object'
      || Array.isArray(rawMetrics)
      || typeof (rawMetrics as { render?: unknown }).render !== 'function'
    ) {
      throw new ConfigError('HEALTH_OPTIONS', 'metrics deve ser um objeto com o método render().');
    }
    const contentType = (rawMetrics as { contentType?: unknown }).contentType;
    if (contentType !== undefined && (typeof contentType !== 'string' || !contentType.trim())) {
      throw new ConfigError('HEALTH_OPTIONS', 'metrics.contentType deve ser um texto não vazio quando informado.');
    }
    if (rawPath === METRICS_PATH) {
      throw new ConfigError('HEALTH_OPTIONS', 'path de healthcheck não pode colidir com /metrics.');
    }
    metrics = rawMetrics as HealthMetricsSource;
  }
  return {
    port: rawPort,
    host: rawHost,
    path: rawPath,
    ...(metrics ? { metrics } : {}),
  };
}

/** Inicia um servidor HTTP leve (`node:http`) para sondas de saúde (`/health`, `/healthz`) e `/metrics` opcional. */
export async function startHealthServer(bot: Yuzuha, options?: HealthServerOptions): Promise<HealthServer> {
  if (!bot || typeof (bot as { health?: unknown }).health !== 'function') {
    throw new ConfigError('HEALTH_OPTIONS', 'bot deve ser uma instância válida com o método health().');
  }
  const resolved = normalizeOptions(options);

  const server = createServer((req, res) => {
    req.resume();
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      writeResponse(req, res, 405, JSON_CONTENT_TYPE, JSON.stringify({ error: 'Method Not Allowed' }), {
        Allow: 'GET, HEAD',
      });
      return;
    }

    const rawUrl = req.url ?? '/';
    const queryIndex = rawUrl.indexOf('?');
    const pathname = (queryIndex >= 0 ? rawUrl.slice(0, queryIndex) : rawUrl) || '/';

    if (pathname === resolved.path || pathname === HEALTHZ_PATH) {
      const report = bot.health();
      const statusCode = report.status === 'ok' ? 200 : 503;
      writeResponse(req, res, statusCode, JSON_CONTENT_TYPE, JSON.stringify(report));
      return;
    }

    if (resolved.metrics && pathname === METRICS_PATH) {
      try {
        const output = resolved.metrics.render();
        const contentType = resolved.metrics.contentType ?? DEFAULT_METRICS_CONTENT_TYPE;
        writeResponse(req, res, 200, contentType, output);
      } catch {
        writeResponse(req, res, 500, JSON_CONTENT_TYPE, JSON.stringify({ error: 'Metrics Render Failed' }));
      }
      return;
    }

    writeResponse(req, res, 404, JSON_CONTENT_TYPE, JSON.stringify({ error: 'Not Found' }));
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(resolved.port, resolved.host);
  });

  const address = server.address() as AddressInfo | string | null;
  const boundPort = typeof address === 'object' && address !== null ? address.port : resolved.port;
  const urlHost = resolved.host.includes(':') && !resolved.host.startsWith('[')
    ? `[${resolved.host}]`
    : resolved.host;

  let closeTask: Promise<void> | undefined;
  return Object.freeze({
    host: resolved.host,
    port: boundPort,
    path: resolved.path,
    url: `http://${urlHost}:${boundPort}${resolved.path}`,
    close(): Promise<void> {
      closeTask ??= new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) reject(error);
          else resolve();
        });
        server.closeIdleConnections?.();
        server.closeAllConnections?.();
      });
      return closeTask;
    },
  });
}
