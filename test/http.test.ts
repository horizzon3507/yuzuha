import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandContext, HttpService, MemoryStore } from '../src/index.js';
import { Runtime, defaultLimits, registerBuiltins } from '../src/functions.js';
import type { HttpOptions } from '../src/index.js';
import { MockTransport, mockMessage } from '../src/testing.js';

const PUBLIC_IP = '93.184.216.34';

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>): typeof fetch {
  return async (input, init) => handler(String(input), init ?? {});
}

test('HTTP lê corpo, status e cabeçalhos', async () => {
  const http = new HttpService({ fetch: fakeFetch(async () => new Response('olá', {
    status: 201, headers: { 'x-teste': 'sim', 'content-type': 'text/plain' },
  })) });
  const response = await http.request({ method: 'GET', url: `http://${PUBLIC_IP}/ok` });
  assert.equal(response.status, 201);
  assert.equal(response.ok, true);
  assert.equal(response.body, 'olá');
  assert.equal(response.headers['x-teste'], 'sim');
});

test('HTTP envia método, corpo e cabeçalhos', async () => {
  let seen: RequestInit | undefined;
  const http = new HttpService({ fetch: fakeFetch(async (_url, init) => {
    seen = init;
    return new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
  }) });
  await http.request({ method: 'POST', url: `https://${PUBLIC_IP}/criar`, body: '{"a":1}',
    headers: { 'Content-Type': 'application/json' } });
  assert.equal(seen?.method, 'POST');
  assert.equal(seen?.body, '{"a":1}');
  assert.deepEqual(seen?.headers, { 'Content-Type': 'application/json' });
  assert.equal(seen?.redirect, 'manual');
});

test('HTTP segue redirecionamentos e revalida o destino', async () => {
  const urls: string[] = [];
  const http = new HttpService({ fetch: fakeFetch(async url => {
    urls.push(url);
    return urls.length === 1
      ? new Response(null, { status: 302, headers: { location: `http://${PUBLIC_IP}/final` } })
      : new Response('fim');
  }) });
  const response = await http.request({ method: 'POST', url: `http://${PUBLIC_IP}/inicio`, body: 'x' });
  assert.equal(response.body, 'fim');
  assert.equal(urls.length, 2);
  assert.equal(urls[1], `http://${PUBLIC_IP}/final`);
});

test('HTTP bloqueia hosts privados, protocolos e hosts fora da allowlist', async () => {
  const http = new HttpService({ fetch: fakeFetch(async () => new Response('nunca')) });
  await assert.rejects(http.request({ method: 'GET', url: 'http://127.0.0.1/' }), /privado/);
  await assert.rejects(http.request({ method: 'GET', url: 'http://169.254.169.254/meta' }), /privado/);
  await assert.rejects(http.request({ method: 'GET', url: 'file:///etc/passwd' }), /URL inválida/);
  const restricted = new HttpService({ fetch: fakeFetch(async () => new Response('ok')), allowedHosts: ['exemplo.com'] });
  await assert.rejects(restricted.request({ method: 'GET', url: `http://${PUBLIC_IP}/` }), /não permitido/);
});

test('HTTP limita tamanho da resposta e tempo', async () => {
  const small = new HttpService({ maxBytes: 4, fetch: fakeFetch(async () => new Response('12345')) });
  await assert.rejects(small.request({ method: 'GET', url: `http://${PUBLIC_IP}/` }), /limite de 4 bytes/);
  const slow = new HttpService({ timeoutMs: 20, fetch: fakeFetch((_url, init) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  })) });
  await assert.rejects(slow.request({ method: 'GET', url: `http://${PUBLIC_IP}/` }), /excedeu 20ms/);
});

test('HTTP valida método, timeout e maxBytes', async () => {
  const http = new HttpService({ fetch: fakeFetch(async () => new Response('')) });
  await assert.rejects(http.request({ method: 'GET 1', url: `http://${PUBLIC_IP}/` }), /Método/);
  assert.throws(() => new HttpService({ timeoutMs: 0 }), /timeoutMs/);
  assert.throws(() => new HttpService({ maxBytes: 0 }), /maxBytes/);
});

function harness(http: Partial<HttpService> | undefined) {
  const transport = new MockTransport();
  const ctx = new CommandContext({ message: mockMessage('!test'), command: { name: 'test', code: '' },
    transport, store: new MemoryStore(), cooldown: () => 0,
    ...(http === undefined ? {} : { http: http as HttpService }) });
  const runtime = registerBuiltins(new Runtime(defaultLimits));
  return { run: (source: string) => runtime.execute(runtime.compile(source, 'net.yz'), ctx) };
}

test('$http retorna corpo e envia cabeçalhos analisados', async () => {
  const seen: unknown[] = [];
  const { run } = harness({ request: async (input: unknown) => {
    seen.push(input); return { status: 200, ok: true, headers: {}, body: 'resposta' };
  } } as Partial<HttpService>);
  assert.equal(await run('$http[get;https://exemplo.com]'), 'resposta');
  assert.equal(await run('$http[POST;https://exemplo.com;corpo;Content-Type: text/plain,X-Teste: 1]'), 'resposta');
  const { signal, ...request } = seen.at(-1) as import('../src/index.js').HttpRequest;
  assert.equal(signal?.aborted, false);
  assert.deepEqual(request, { method: 'POST', url: 'https://exemplo.com', body: 'corpo',
    headers: { 'Content-Type': 'text/plain', 'X-Teste': '1' } });
  await assert.rejects(run('$http[VOAR;https://exemplo.com]'), /Método/);
  await assert.rejects(run('$http[GET;https://exemplo.com;corpo]'), /não aceita corpo/);
  await assert.rejects(run('$http[GET;https://exemplo.com;;X: 1\nquebrado]'), /Cabeçalho inválido/);
});

test('$httpJson decodifica JSON e define Content-Type', async () => {
  let headers: Record<string, string> | undefined;
  const { run } = harness({ request: async (input: { headers?: Record<string, string> }) => {
    headers = input.headers; return { status: 200, ok: true, headers: {}, body: '{"a":1}' };
  } } as Partial<HttpService>);
  assert.deepEqual(await run('$httpJson[POST;https://exemplo.com;{"a":1}]'), { a: 1 });
  assert.deepEqual(headers, { 'Content-Type': 'application/json' });
  const invalid = harness({ request: async () => ({ status: 200, ok: true, headers: {}, body: 'não' }) } as Partial<HttpService>);
  await assert.rejects(invalid.run('$httpJson[GET;https://exemplo.com]'), /JSON válido/);
  const empty = harness({ request: async () => ({ status: 204, ok: true, headers: {}, body: '' }) } as Partial<HttpService>);
  assert.equal(await empty.run('$httpJson[GET;https://exemplo.com]'), null);
});

test('$http exige serviço configurado', async () => {
  const { run } = harness(undefined);
  await assert.rejects(run('$http[GET;https://exemplo.com]'), /HTTP não foi fornecido/);
});

test('$http não consome o prazo de execução do script', async () => {
  const transport = new MockTransport();
  const ctx = new CommandContext({ message: mockMessage('!test'), command: { name: 'test', code: '' },
    transport, store: new MemoryStore(), cooldown: () => 0,
    http: { request: async () => {
      await new Promise(resolve => setTimeout(resolve, 40));
      return { status: 200, ok: true, headers: {}, body: '{"ok":true}' };
    } } as Partial<HttpService> as HttpService });
  const runtime = registerBuiltins(new Runtime({ ...defaultLimits, timeoutMs: 10 }));
  const run = (source: string) => runtime.execute(runtime.compile(source, 'net.yz'), ctx);
  assert.equal(await run('$http[GET;https://exemplo.com]'), '{"ok":true}');
  assert.deepEqual(await run('$httpJson[GET;https://exemplo.com]'), { ok: true });
});

test('HTTP binário preserva bytes que não são UTF-8', async () => {
  const bytes = new Uint8Array([0, 255, 137, 80, 78, 71]);
  const http = new HttpService({ fetch: fakeFetch(async () => new Response(bytes)) });
  const response = await http.requestBytes({ method: 'GET', url: `https://${PUBLIC_IP}/image` });
  assert.equal(response.ok, true);
  assert.deepEqual(response.body, bytes);
});

test('HTTP binário revalida redirecionamentos e cancela streams ao exceder bytes', async () => {
  let fetched = 0;
  const redirected = new HttpService({ fetch: fakeFetch(async () => {
    fetched++;
    return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/privado' } });
  }) });
  await assert.rejects(redirected.requestBytes({ method: 'GET', url: `https://${PUBLIC_IP}/image` }), /privado/);
  assert.equal(fetched, 1);
  let cancelled = false;
  const limited = new HttpService({ maxBytes: 4, fetch: fakeFetch(async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(5)); },
    cancel() { cancelled = true; },
  }))) });
  await assert.rejects(limited.requestBytes({ method: 'GET', url: `https://${PUBLIC_IP}/image` }), /limite de 4/);
  assert.equal(cancelled, true);
});

test('HTTP não encaminha credenciais a outra origem e mantém cabeçalhos públicos', async () => {
  const requests: { headers: Record<string, string>; method?: string; body?: BodyInit | null }[] = [];
  const inputHeaders = { Authorization: 'Bearer secreto', Cookie: 'sessão', 'Proxy-Authorization': 'proxy', Accept: 'image/png' };
  const http = new HttpService({ fetch: fakeFetch(async (_url, init) => {
    requests.push({ headers: { ...init.headers as Record<string, string> }, method: init.method, body: init.body });
    return requests.length === 1
      ? new Response(null, { status: 307, headers: { location: 'https://1.1.1.1/destino' } })
      : new Response('ok');
  }) });
  await http.request({ method: 'POST', url: `https://${PUBLIC_IP}/origem`, headers: inputHeaders, body: 'corpo' });
  assert.deepEqual(requests[0]?.headers, inputHeaders);
  assert.deepEqual(requests[1], { headers: { Accept: 'image/png' }, method: 'POST', body: 'corpo' });
  assert.equal(inputHeaders.Authorization, 'Bearer secreto');
});

test('HTTP preserva credenciais em redirecionamentos dentro da origem', async () => {
  let fetched = 0;
  const http = new HttpService({ fetch: fakeFetch(async (_url, init) => {
    assert.deepEqual(init.headers, { Authorization: 'Bearer secreto' });
    return ++fetched === 1
      ? new Response(null, { status: 302, headers: { location: '/final' } })
      : new Response('ok');
  }) });
  assert.equal((await http.request({ method: 'GET', url: `https://${PUBLIC_IP}/inicio`, headers: { Authorization: 'Bearer secreto' } })).body, 'ok');
  assert.equal(fetched, 2);
});

test('HTTP converte timeout de leitura de stream em erro HTTP_TIMEOUT', async () => {
  const http = new HttpService({ timeoutMs: 20, fetch: fakeFetch(async (_url, init) => new Response(new ReadableStream({
    start(controller) { init.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError'))); },
  }))) });
  await assert.rejects(http.requestBytes({ method: 'GET', url: `https://${PUBLIC_IP}/lento` }),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'HTTP_TIMEOUT');
});
