import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { YuzuhaError } from '../shared/errors.js';
import { abortable } from './cancellation.js';

export interface HttpOptions {
  timeoutMs?: number;
  maxBytes?: number;
  allowedHosts?: string[];
  allowPrivate?: boolean;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  maxRequestBytes?: number;
}

export interface HttpPolicy {
  allowedHosts?: string[];
  timeoutMs?: number;
  maxBytes?: number;
  maxRequestBytes?: number;
}
export interface HttpMultipartPart { name: string; value: string | Uint8Array; filename?: string; contentType?: string }
export interface HttpStreamResponse extends Omit<HttpResponse, 'body'> { body: ReadableStream<Uint8Array> }

export interface HttpRequest {
  method: string;
  url: string;
  body?: string | FormData;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface HttpResponse<T = string> {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: T;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 5;

const privateNetworks = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) privateNetworks.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) privateNetworks.addSubnet(network, prefix, 'ipv6');

function privateIP(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return privateNetworks.check(address, 'ipv4');
  if (family === 6) return privateNetworks.check(address, 'ipv6');
  return false;
}

export class HttpService {
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly allowedHosts: string[];
  private readonly allowPrivate: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly signal?: AbortSignal;
  private readonly maxRequestBytes: number;

  constructor(options: HttpOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.allowedHosts = (options.allowedHosts ?? []).map(h => h.toLowerCase());
    this.allowPrivate = options.allowPrivate ?? false;
    this.fetchImpl = options.fetch ?? fetch;
    this.signal = options.signal;
    this.maxRequestBytes = options.maxRequestBytes ?? 10_000_000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new YuzuhaError('HTTP_OPTIONS', 'timeoutMs deve ser maior que zero.');
    if (!Number.isFinite(this.maxBytes) || this.maxBytes <= 0) throw new YuzuhaError('HTTP_OPTIONS', 'maxBytes deve ser maior que zero.');
    if (!Number.isSafeInteger(this.maxRequestBytes) || this.maxRequestBytes < 1) throw new YuzuhaError('HTTP_OPTIONS', 'maxRequestBytes deve ser inteiro positivo.');
  }

  withPolicy(policy: HttpPolicy): HttpService {
    const allowed = ['allowedHosts', 'timeoutMs', 'maxBytes', 'maxRequestBytes'];
    if (!policy || typeof policy !== 'object' || Array.isArray(policy) || Object.keys(policy).some(key => !allowed.includes(key))) throw new YuzuhaError('HTTP_POLICY', 'Política HTTP inválida.');
    let hosts = this.allowedHosts;
    if (policy.allowedHosts !== undefined) {
      if (!Array.isArray(policy.allowedHosts) || !policy.allowedHosts.length || policy.allowedHosts.some(host => typeof host !== 'string' || !/^[a-z0-9.-]+$/i.test(host))) throw new YuzuhaError('HTTP_POLICY', 'Informe hosts válidos na política HTTP.');
      hosts = policy.allowedHosts.map(host => host.toLowerCase()).filter(host => !this.allowedHosts.length || this.allowedHosts.includes(host));
      if (!hosts.length) throw new YuzuhaError('HTTP_POLICY', 'A política HTTP não permite nenhum host.');
    }
    for (const key of ['timeoutMs', 'maxBytes', 'maxRequestBytes'] as const) {
      if (policy[key] !== undefined && (!Number.isSafeInteger(policy[key]) || policy[key]! < 1)) throw new YuzuhaError('HTTP_POLICY', 'Limites da política devem ser inteiros positivos.');
    }
    return new HttpService({ timeoutMs: Math.min(this.timeoutMs, policy.timeoutMs ?? this.timeoutMs),
      maxBytes: Math.min(this.maxBytes, policy.maxBytes ?? this.maxBytes),
      maxRequestBytes: Math.min(this.maxRequestBytes, policy.maxRequestBytes ?? this.maxRequestBytes),
      allowedHosts: hosts, allowPrivate: this.allowPrivate, fetch: this.fetchImpl, signal: this.signal });
  }

  async multipart(input: Omit<HttpRequest, 'body'> & { parts: HttpMultipartPart[] }): Promise<HttpResponse> {
    const method = input.method.trim().toUpperCase();
    if (method === 'GET' || method === 'HEAD') throw new YuzuhaError('HTTP_BODY', `${method} não aceita corpo.`);
    if (!Array.isArray(input.parts) || !input.parts.length || input.parts.length > 100) throw new YuzuhaError('HTTP_MULTIPART', 'Informe de 1 a 100 partes.');
    if (Object.keys(input.headers ?? {}).some(key => key.toLowerCase() === 'content-type')) throw new YuzuhaError('HTTP_MULTIPART', 'Content-Type multipart é definido automaticamente com boundary.');
    const body = new FormData();
    let total = 0;
    for (const part of input.parts) {
      if (!part || typeof part.name !== 'string' || !part.name || part.name.length > 128 || /[\r\n]/.test(part.name)
        || (typeof part.value !== 'string' && !(part.value instanceof Uint8Array))
        || (part.filename !== undefined && (typeof part.filename !== 'string' || !part.filename || part.filename.length > 255 || /[\r\n]/.test(part.filename)))
        || (part.contentType !== undefined && (typeof part.contentType !== 'string' || part.contentType.length > 127 || !/^[\w.+-]+\/[\w.+-]+$/.test(part.contentType)))) throw new YuzuhaError('HTTP_MULTIPART', 'Parte multipart inválida.');
      total += Buffer.byteLength(part.name) + Buffer.byteLength(part.filename ?? '') + Buffer.byteLength(part.contentType ?? '')
        + (typeof part.value === 'string' ? Buffer.byteLength(part.value) : part.value.byteLength);
      if (total > this.maxRequestBytes) throw new YuzuhaError('HTTP_REQUEST_TOO_LARGE', `Envio excede ${this.maxRequestBytes} bytes.`);
      if (typeof part.value === 'string') body.append(part.name, part.value);
      else body.append(part.name, new Blob([new Uint8Array(part.value)], { type: part.contentType ?? 'application/octet-stream' }), part.filename ?? 'file.bin');
    }
    const { parts: _parts, ...request } = input;
    return this.request({ ...request, method, body });
  }

  withSignal(signal: AbortSignal): HttpService {
    return bindHttp(this, signal);
  }

  private async checkHost(hostname: string): Promise<void> {
    const host = hostname.toLowerCase();
    if (this.allowedHosts.length > 0 && !this.allowedHosts.includes(host)) {
      throw new YuzuhaError('HTTP_HOST', `Host não permitido: ${hostname}.`);
    }
    if (this.allowPrivate) return;
    if (host === 'localhost') throw new YuzuhaError('HTTP_PRIVATE', 'Host privado bloqueado.');
    const address = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
    if (isIP(address)) {
      if (privateIP(address)) throw new YuzuhaError('HTTP_PRIVATE', 'Host privado bloqueado.');
      return;
    }
    let addresses: { address: string }[];
    try {
      addresses = await lookup(host, { all: true });
    } catch (cause) {
      throw new YuzuhaError('HTTP_DNS', `Não foi possível resolver o host: ${hostname}.`, { cause });
    }
    if (addresses.some(entry => privateIP(entry.address))) {
      throw new YuzuhaError('HTTP_PRIVATE', 'Host privado bloqueado.');
    }
  }

  private async checkURL(raw: string): Promise<URL> {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch (cause) {
      throw new YuzuhaError('HTTP_URL', 'URL inválida. Use http:// ou https://.', { cause });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new YuzuhaError('HTTP_URL', 'URL inválida. Use http:// ou https://.');
    }
    if (parsed.username || parsed.password) throw new YuzuhaError('HTTP_URL', 'Credenciais na URL não são permitidas. Use o cabeçalho Authorization.');
    await this.checkHost(parsed.hostname);
    return parsed;
  }

  private async readBody(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let completed = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) { completed = true; break; }
        if (value) {
          total += value.length;
          if (total > this.maxBytes) throw new YuzuhaError('HTTP_BODY_TOO_LARGE', `Resposta excede o limite de ${this.maxBytes} bytes.`);
          chunks.push(value);
        }
      }
    } finally {
      if (!completed) void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
    return merged;
  }

  async request(input: HttpRequest): Promise<HttpResponse> {
    const response = await this.requestBytes(input);
    return { ...response, body: new TextDecoder().decode(response.body) };
  }

  async requestBytes(input: HttpRequest): Promise<HttpResponse<Uint8Array>> {
    const response = await this.stream(input);
    return { ...response, body: await this.readBody(response.body) };
  }

  async stream(input: HttpRequest): Promise<HttpStreamResponse> {
    const method = input.method.trim().toUpperCase();
    if (!/^[A-Z]+$/.test(method)) throw new YuzuhaError('HTTP_METHOD', 'Método HTTP inválido.');
    if ((method === 'GET' || method === 'HEAD') && input.body !== undefined) throw new YuzuhaError('HTTP_BODY', `${method} não aceita corpo.`);
    let currentURL = input.url;
    let currentMethod = method;
    let currentBody = input.body;
    let uploadSize = typeof input.body === 'string' ? Buffer.byteLength(input.body) : 0;
    if (input.body instanceof FormData) for (const [name, value] of input.body.entries()) uploadSize += Buffer.byteLength(name)
      + (typeof value === 'string' ? Buffer.byteLength(value) : value.size + Buffer.byteLength(value.name) + Buffer.byteLength(value.type));
    if (uploadSize > this.maxRequestBytes) throw new YuzuhaError('HTTP_REQUEST_TOO_LARGE', `Envio excede ${this.maxRequestBytes} bytes.`);
    const headers = { ...input.headers };
    const controller = new AbortController();
    const external = [this.signal, input.signal].filter((signal): signal is AbortSignal => signal !== undefined);
    const signal = AbortSignal.any([...external, controller.signal]);
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let handedOff = false;
    const aborted = (): YuzuhaError => external.some(signal => signal.aborted)
      ? new YuzuhaError('EXECUTION_ABORTED', 'Execução cancelada.')
      : new YuzuhaError('HTTP_TIMEOUT', `Requisição excedeu ${this.timeoutMs}ms.`);
    try {
      if (signal.aborted) throw new YuzuhaError('EXECUTION_ABORTED', 'Execução cancelada.');
      for (let redirect = 0; ; redirect++) {
        const target = await abortable(this.checkURL(currentURL), signal);
        let response: Response;
        try {
          const pending = this.fetchImpl(target.toString(), {
            method: currentMethod, headers, body: currentBody, signal, redirect: 'manual',
          });
          void pending.then(late => {
            if (signal.aborted) void late.body?.cancel().catch(() => {});
          }, () => {});
          response = await abortable(pending, signal);
        } catch (error) {
          if (signal.aborted) throw error;
          throw new YuzuhaError('HTTP_NETWORK', 'Falha de rede na requisição HTTP.', { cause: error });
        }
        const location = response.headers.get('location');
        if (location && [301, 302, 303, 307, 308].includes(response.status)) {
          void response.body?.cancel().catch(() => {});
          if (redirect >= MAX_REDIRECTS) throw new YuzuhaError('HTTP_REDIRECT', 'Redirecionamentos em excesso.');
          const next = new URL(location, target.toString());
          if (next.origin !== target.origin) {
            for (const key of Object.keys(headers)) {
              if (['authorization', 'proxy-authorization', 'cookie'].includes(key.toLowerCase())) delete headers[key];
            }
          }
          if ((response.status === 303 && currentMethod !== 'GET' && currentMethod !== 'HEAD')
            || ((response.status === 301 || response.status === 302) && currentMethod === 'POST')) {
            currentMethod = 'GET';
            currentBody = undefined;
            for (const key of Object.keys(headers)) {
              if (['content-encoding', 'content-language', 'content-location', 'content-type', 'content-length'].includes(key.toLowerCase())) delete headers[key];
            }
          }
          currentURL = next.toString();
          continue;
        }
        if (Number(response.headers.get('content-length')) > this.maxBytes) {
          void response.body?.cancel().catch(() => {});
          throw new YuzuhaError('HTTP_BODY_TOO_LARGE', `Resposta excede o limite de ${this.maxBytes} bytes.`);
        }
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => { responseHeaders[key] = value; });
        const reader = response.body?.getReader();
        let finished = false, bytes = 0;
        let abort: () => void;
        const finish = (): void => { finished = true; clearTimeout(timer); signal.removeEventListener('abort', abort); };
        const cancel = (): void => { if (reader) void reader.cancel().finally(() => reader.releaseLock()).catch(() => {}); };
        const body = new ReadableStream<Uint8Array>({
          start(output) {
            abort = () => { if (!finished) { finish(); cancel(); output.error(aborted()); } };
            signal.addEventListener('abort', abort, { once: true });
            if (signal.aborted) abort();
            else if (!reader) { finish(); output.close(); }
          },
          pull: async output => {
            if (finished || !reader) return;
            try {
              const next = await reader.read();
              if (finished) return;
              if (next.done) { finish(); reader.releaseLock(); output.close(); return; }
              bytes += next.value.byteLength;
              if (bytes > this.maxBytes) throw new YuzuhaError('HTTP_BODY_TOO_LARGE', `Resposta excede o limite de ${this.maxBytes} bytes.`);
              output.enqueue(next.value);
            } catch (error) { if (!finished) { finish(); cancel(); output.error(signal.aborted ? aborted() : error); } }
          },
          cancel() { finish(); cancel(); },
        }, { highWaterMark: 0 });
        handedOff = true;
        return { status: response.status, ok: response.ok, headers: responseHeaders, body };
      }
    } catch (error) {
      if (external.some(signal => signal.aborted)) throw new YuzuhaError('EXECUTION_ABORTED', 'Execução cancelada.');
      if (controller.signal.aborted) throw new YuzuhaError('HTTP_TIMEOUT', `Requisição excedeu ${this.timeoutMs}ms.`);
      throw error;
    } finally {
      if (!handedOff) clearTimeout(timer);
    }
  }
}

class BoundHttpService extends HttpService {
  constructor(private readonly service: HttpService, private readonly boundSignal: AbortSignal) { super(); }
  private input(input: HttpRequest): HttpRequest {
    return { ...input, signal: input.signal ? AbortSignal.any([this.boundSignal, input.signal]) : this.boundSignal };
  }
  override request(input: HttpRequest): Promise<HttpResponse> { return this.service.request(this.input(input)); }
  override requestBytes(input: HttpRequest): Promise<HttpResponse<Uint8Array>> { return this.service.requestBytes(this.input(input)); }
  override stream(input: HttpRequest): Promise<HttpStreamResponse> { return this.service.stream(this.input(input)); }
  override multipart(input: Omit<HttpRequest, 'body'> & { parts: HttpMultipartPart[] }): Promise<HttpResponse> {
    return this.service.multipart({ ...input, signal: input.signal ? AbortSignal.any([this.boundSignal, input.signal]) : this.boundSignal });
  }
  override withPolicy(policy: HttpPolicy): HttpService { return bindHttp(this.service.withPolicy(policy), this.boundSignal); }
}

export function bindHttp(service: HttpService, signal: AbortSignal): HttpService {
  return new BoundHttpService(service, signal);
}
