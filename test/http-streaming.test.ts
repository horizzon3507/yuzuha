import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { CommandContext, HttpService, MemoryStore, Yuzuha } from '../src/index.js';
import type { HttpMultipartPart, HttpPolicy } from '../src/services/http.js';
import { Runtime, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>): typeof fetch {
  return async (input, init) => handler(String(input), init ?? {});
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test('stream entrega primeiro chunk antes do fim e remove listener ao concluir', async () => {
  let output!: ReadableStreamDefaultController<Uint8Array>, signal!: AbortSignal;
  const http = new HttpService({ allowPrivate: true, fetch: fakeFetch((_url, init) => {
    signal = init.signal!;
    return new Response(new ReadableStream({ start(controller) { output = controller; } }), { status: 201, headers: { 'x-test': 'stream' } });
  }) });
  const response = await http.stream({ method: 'GET', url: 'https://stream.test/data' });
  const reader = response.body.getReader();
  output.enqueue(new Uint8Array([0, 255, 10]));
  assert.deepEqual(await reader.read(), { done: false, value: new Uint8Array([0, 255, 10]) });
  assert.equal(response.status, 201); assert.equal(response.ok, true); assert.equal(response.headers['x-test'], 'stream');
  assert.equal(getEventListeners(signal, 'abort').length, 1);
  output.enqueue(new Uint8Array([42])); output.close();
  assert.deepEqual((await reader.read()).value, new Uint8Array([42]));
  assert.equal((await reader.read()).done, true);
  assert.equal(getEventListeners(signal, 'abort').length, 0);
});

test('stream mantém timeout mesmo sem consumidor e cancela corpo subjacente', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let cancelled = false, signal!: AbortSignal;
  const http = new HttpService({ timeoutMs: 25, allowPrivate: true, fetch: fakeFetch((_url, init) => {
    signal = init.signal!;
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  }) });
  const response = await http.stream({ method: 'GET', url: 'https://stream.test/unread' });
  t.mock.timers.tick(25);
  await assert.rejects(response.body.getReader().read(), { code: 'HTTP_TIMEOUT' });
  assert.equal(cancelled, true); assert.equal(signal.aborted, true);
  assert.equal(getEventListeners(signal, 'abort').length, 0);
});

test('stream timeout durante read pendente normaliza erro e remove listener', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let cancelled = false, signal!: AbortSignal;
  const http = new HttpService({ timeoutMs: 25, allowPrivate: true, fetch: fakeFetch((_url, init) => {
    signal = init.signal!;
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  }) });
  const response = await http.stream({ method: 'GET', url: 'https://stream.test/read' });
  const pending = assert.rejects(response.body.getReader().read(), { code: 'HTTP_TIMEOUT' });
  t.mock.timers.tick(25); await pending;
  assert.equal(cancelled, true); assert.equal(getEventListeners(signal, 'abort').length, 0);
});

test('stream acumula limite em chunks e cancelamento do consumidor libera corpo e listener', async () => {
  for (const mode of ['overflow', 'cancel'] as const) {
    let cancelled = false, signal!: AbortSignal;
    const http = new HttpService({ maxBytes: 3, allowPrivate: true, fetch: fakeFetch((_url, init) => {
      signal = init.signal!;
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(new Uint8Array([1, 2])); controller.enqueue(new Uint8Array([3, 4]));
      }, cancel() { cancelled = true; } }));
    }) });
    const reader = (await http.stream({ method: 'GET', url: 'https://stream.test/limit' })).body.getReader();
    assert.deepEqual((await reader.read()).value, new Uint8Array([1, 2]));
    if (mode === 'overflow') await assert.rejects(reader.read(), { code: 'HTTP_BODY_TOO_LARGE' });
    else await reader.cancel('unused');
    assert.equal(cancelled, true); assert.equal(getEventListeners(signal, 'abort').length, 0);
  }
});

test('stream interrompe corpo em erro de content-length e abort antes de fetch', async () => {
  let cancelled = false, calls = 0;
  const http = new HttpService({ maxBytes: 3, allowPrivate: true, fetch: fakeFetch(() => {
    calls++;
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-length': '4' } });
  }) });
  await assert.rejects(http.stream({ method: 'GET', url: 'https://stream.test/limit' }), { code: 'HTTP_BODY_TOO_LARGE' });
  assert.equal(cancelled, true);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(http.stream({ method: 'GET', url: 'https://stream.test/preabort', signal: controller.signal }), { code: 'EXECUTION_ABORTED' });
  assert.equal(calls, 1);
});

test('redirecionamentos descartam corpo também no limite e em Location inválido', async () => {
  for (const location of ['/loop', 'http://[invalid']) {
    let calls = 0, cancelled = 0;
    const http = new HttpService({ allowPrivate: true, fetch: fakeFetch(() => {
      calls++;
      return new Response(new ReadableStream({ cancel() { cancelled++; } }), {
        status: 302, headers: { location },
      });
    }) });
    await assert.rejects(http.stream({ method: 'GET', url: 'https://redirect.test/start' }),
      location === '/loop' ? { code: 'HTTP_REDIRECT' } : { code: 'ERR_INVALID_URL' });
    assert.equal(calls, location === '/loop' ? 6 : 1);
    assert.equal(cancelled, calls);
  }
});

test('multipart preserva bytes, campos repetidos e boundary gerado pelo fetch', async () => {
  let form!: FormData, boundary = '', encoded = Buffer.alloc(0);
  const binary = new Uint8Array([0, 255, 254, 13, 10, 1]);
  const http = new HttpService({ allowPrivate: true, fetch: fakeFetch(async (url, init) => {
    assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'manual');
    form = init.body as FormData;
    const request = new Request(url, init);
    boundary = request.headers.get('content-type')!;
    encoded = Buffer.from(await request.arrayBuffer());
    return new Response('enviado', { status: 202 });
  }) });
  const response = await http.multipart({ method: 'POST', url: 'https://upload.test/form', parts: [
    { name: 'tag', value: 'um' }, { name: 'tag', value: 'dois' },
    { name: 'arquivo', value: binary, filename: 'dados.bin', contentType: 'application/octet-stream' },
  ] });
  assert.equal(response.status, 202); assert.equal(response.body, 'enviado');
  assert.deepEqual(form.getAll('tag'), ['um', 'dois']);
  const file = form.get('arquivo') as File;
  assert.equal(file.name, 'dados.bin'); assert.equal(file.type, 'application/octet-stream');
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), binary);
  assert.match(boundary, /^multipart\/form-data; boundary=.+/);
  assert.ok(encoded.includes(Buffer.from(binary)));
  assert.ok(encoded.includes(Buffer.from(`--${boundary.split('boundary=')[1]}`)));
});

test('multipart recusa partes inválidas, cabeçalho manual e payload excessivo antes de fetch', async () => {
  let calls = 0;
  const http = new HttpService({ allowPrivate: true, maxRequestBytes: 8, fetch: fakeFetch(() => { calls++; return new Response('ok'); }) });
  for (const parts of [[], Array.from({ length: 101 }, () => ({ name: 'x', value: '' })),
    [{ name: '', value: '' }], [{ name: 'x\nmal', value: '' }], [{ name: 'x', value: '', filename: 'mal\r.txt' }],
    [{ name: 'x', value: new Uint8Array(), contentType: 'text/plain\r\nX: y' }],
    [{ name: 'x', value: 'éééé' }], [{ name: 'x', value: new Uint8Array(8) }]]) {
    await assert.rejects(http.multipart({ method: 'POST', url: 'https://upload.test/form', parts }));
  }
  await assert.rejects(http.multipart({ method: 'POST', url: 'https://upload.test/form', parts: [{ name: 'x', value: '' }],
    headers: { 'cOnTeNt-TyPe': 'multipart/form-data' } }), { code: 'HTTP_MULTIPART' });
  assert.equal(calls, 0);
});

test('multipart valida tipos de metadados e métodos sem corpo antes de fetch', async () => {
  let calls = 0;
  const http = new HttpService({ allowPrivate: true, fetch: fakeFetch(() => { calls++; return new Response('ok'); }) });
  const parts = [{ name: 'x', value: new Uint8Array([1]), filename: 123 }] as unknown as HttpMultipartPart[];
  await assert.rejects(http.multipart({ method: 'POST', url: 'https://upload.test/form', parts }), { code: 'HTTP_MULTIPART' });
  for (const method of ['GET', 'HEAD']) await assert.rejects(http.multipart({ method, url: 'https://upload.test/form', parts: [{ name: 'x', value: '' }] }), { code: 'HTTP_BODY' });
  assert.equal(calls, 0);
});

test('políticas intersectam hosts, mantêm bloqueio privado e não ampliam limites', async () => {
  let calls = 0;
  const base = new HttpService({ allowedHosts: ['a.test', 'b.test'], allowPrivate: true, maxBytes: 3, maxRequestBytes: 3,
    fetch: fakeFetch(() => { calls++; return new Response('1234'); }) });
  const narrowed = base.withPolicy({ allowedHosts: ['b.test', 'c.test'], maxBytes: 1000, maxRequestBytes: 1000 });
  await assert.rejects(narrowed.request({ method: 'GET', url: 'https://a.test' }), { code: 'HTTP_HOST' });
  await assert.rejects(narrowed.request({ method: 'GET', url: 'https://c.test' }), { code: 'HTTP_HOST' });
  await assert.rejects(narrowed.request({ method: 'GET', url: 'https://b.test' }), { code: 'HTTP_BODY_TOO_LARGE' });
  await assert.rejects(narrowed.request({ method: 'POST', url: 'https://b.test', body: '1234' }), { code: 'HTTP_REQUEST_TOO_LARGE' });
  assert.equal(calls, 1);
  assert.throws(() => narrowed.withPolicy({ allowedHosts: ['a.test'] }), { code: 'HTTP_POLICY' });
  const safe = new HttpService({ fetch: fakeFetch(() => { throw new Error('sem fetch'); }) }).withPolicy({ allowedHosts: ['127.0.0.1'] });
  await assert.rejects(safe.request({ method: 'GET', url: 'http://127.0.0.1' }), { code: 'HTTP_PRIVATE' });
  assert.throws(() => base.withPolicy({ allowPrivate: true } as HttpPolicy), { code: 'HTTP_POLICY' });
});

test('política de host é revalidada nos redirects e credenciais saem ao mudar origem', async () => {
  let requests: { url: string; headers: Headers }[] = [];
  const base = new HttpService({ allowPrivate: true, allowedHosts: ['a.test', 'b.test'], fetch: fakeFetch((url, init) => {
    requests.push({ url, headers: new Headers(init.headers) });
    return requests.length === 1 ? new Response(null, { status: 307, headers: { location: 'https://b.test/final' } }) : new Response('ok');
  }) });
  const restricted = base.withPolicy({ allowedHosts: ['a.test'] });
  await assert.rejects(restricted.stream({ method: 'GET', url: 'https://a.test/start' }), { code: 'HTTP_HOST' });
  assert.equal(requests.length, 1);
  requests = [];
  const reader = (await base.withPolicy({ allowedHosts: ['a.test', 'b.test'] }).stream({ method: 'POST', url: 'https://a.test/start',
    headers: { authorization: 'secret', cookie: 'secret', 'proxy-authorization': 'secret', accept: 'text/plain' }, body: 'x' })).body.getReader();
  assert.equal(requests.length, 2);
  for (const name of ['authorization', 'cookie', 'proxy-authorization']) assert.equal(requests[1]!.headers.has(name), false);
  assert.equal(requests[1]!.headers.get('accept'), 'text/plain');
  await reader.cancel();
});

test('withPolicy e métodos vinculados preservam cancelamento de contexto e request', async () => {
  for (const method of ['stream', 'multipart'] as const) {
    const outer = new AbortController(), inner = new AbortController(), entered = deferred();
    let signal!: AbortSignal;
    const base = new HttpService({ allowPrivate: true, fetch: fakeFetch((_url, init) => {
      signal = init.signal!; entered.resolve();
      return new Response(new ReadableStream());
    }) });
    const service = base.withSignal(outer.signal).withPolicy({ allowedHosts: ['b.test'] }).withSignal(new AbortController().signal);
    const input = { method: 'POST', url: 'https://b.test/form', signal: inner.signal };
    if (method === 'stream') {
      const response = await service.stream(input);
      const pending = assert.rejects(response.body.getReader().read(), { code: 'EXECUTION_ABORTED' });
      outer.abort(); await pending;
    } else {
      const work = service.multipart({ ...input, parts: [{ name: 'x', value: 'y' }] });
      const pending = assert.rejects(work, { code: 'EXECUTION_ABORTED' });
      await entered.promise; inner.abort(); await pending;
    }
    assert.equal(signal.aborted, true); assert.equal(getEventListeners(signal, 'abort').length, 0);
  }
});

test('command.http aplica política antes de vincular sinal de contexto', async () => {
  const controller = new AbortController();
  let output!: ReadableStreamDefaultController<Uint8Array>;
  const service = new HttpService({ allowPrivate: true, allowedHosts: ['a.test', 'b.test'], fetch: fakeFetch(() =>
    new Response(new ReadableStream({ start(value) { output = value; } }))) });
  const ctx = new CommandContext({ message: mockMessage('!ping'), command: { name: 'ping', http: { allowedHosts: ['b.test'], maxBytes: 2 }, run() {} },
    transport: new MockTransport(), store: new MemoryStore(), cooldown: () => 0, http: service, signal: controller.signal });
  await assert.rejects(ctx.http.stream({ method: 'GET', url: 'https://a.test' }), { code: 'HTTP_HOST' });
  const response = await ctx.http.stream({ method: 'GET', url: 'https://b.test' });
  const reader = response.body.getReader(); output.enqueue(new Uint8Array([1, 2, 3]));
  await assert.rejects(reader.read(), { code: 'HTTP_BODY_TOO_LARGE' });
  const second = await ctx.http.stream({ method: 'GET', url: 'https://b.test' });
  const pending = assert.rejects(second.body.getReader().read(), { code: 'EXECUTION_ABORTED' });
  controller.abort(); await pending;
});

test('command.http inválida é recusada no registro sem mudar comandos', async t => {
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false,
    http: new HttpService({ allowedHosts: ['a.test'] }) });
  t.after(() => bot.destroy());
  assert.throws(() => bot.command({ name: 'bad', http: { allowedHosts: ['b.test'] }, run() {} }), { code: 'HTTP_POLICY' });
  assert.equal(await bot.handle(mockMessage('!bad')), 'ignored');
});

test('$httpMultipart preserva base64 canônico e recusa representações ambíguas', async () => {
  let captured!: FormData;
  const service = new HttpService({ allowPrivate: true, fetch: fakeFetch((_url, input) => { captured = input.body as FormData; return new Response('ok'); }) });
  const ctx = new CommandContext({ message: mockMessage('!ping'), command: { name: 'ping', code: '' }, transport: new MockTransport(),
    store: new MemoryStore(), cooldown: () => 0, http: service });
  const runtime = registerBuiltins(new Runtime());
  const run = (source: string) => runtime.execute(runtime.compile(source, 'multipart.yz'), ctx);
  assert.equal(await run('$httpMultipart[POST;https://upload.test;$array[$object[name;arquivo;base64;AP8=;filename;dados.bin]]]'), 'ok');
  assert.deepEqual(new Uint8Array(await (captured.get('arquivo') as File).arrayBuffer()), new Uint8Array([0, 255]));
  for (const value of ['AB==', 'AP9=', 'AP8', 'AP8=\n', '%%%']) {
    await assert.rejects(run(`$httpMultipart[POST;https://upload.test;$array[$object[name;arquivo;base64;${value}]]]`));
  }
  await assert.rejects(run('$httpMultipart[POST;https://upload.test;$array[$object[name;x;value;texto;base64;AA==]]]'));
});

test('$try não captura cancelamento durante upload multipart', async () => {
  const controller = new AbortController(), entered = deferred();
  const service = new HttpService({ allowPrivate: true, fetch: fakeFetch(() => {
    entered.resolve(); return new Response(new ReadableStream());
  }) });
  const ctx = new CommandContext({ message: mockMessage('!ping'), command: { name: 'ping', code: '' }, transport: new MockTransport(),
    store: new MemoryStore(), cooldown: () => 0, http: service, signal: controller.signal });
  const runtime = registerBuiltins(new Runtime());
  const work = runtime.execute(runtime.compile('$try[$httpMultipart[POST;https://upload.test;$array[$object[name;x;value;y]]];fallback]'), ctx);
  const pending = assert.rejects(work, { code: 'EXECUTION_ABORTED' });
  await entered.promise; controller.abort(); await pending;
  await setImmediate();
});
