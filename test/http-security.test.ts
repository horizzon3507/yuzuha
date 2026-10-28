import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpService } from '../src/index.js';

function fakeFetch(handler: (url: string, init: RequestInit) => Response): typeof fetch {
  return async (input, init) => handler(String(input), init ?? {});
}

test('HTTP bloqueia redes locais e IPv4 mapeado em IPv6 antes do fetch', async () => {
  let calls = 0;
  const http = new HttpService({ fetch: fakeFetch(() => { calls++; return new Response('unsafe'); }) });
  const hosts = [
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '100.127.255.255', '127.0.0.1',
    '169.254.169.254', '172.16.0.1', '192.168.1.1', '198.18.0.1', '198.19.255.255',
    '224.0.0.1', '255.255.255.255', '[::]', '[::1]', '[fc00::1]', '[fdff::1]',
    '[fe80::1]', '[fe81::1]', '[fe9f::1]', '[feaf::1]', '[febf::1]', '[ff02::1]',
    '[::ffff:127.0.0.1]', '[::ffff:a9fe:a9fe]', '[::ffff:192.168.1.1]', '[::ffff:6440:1]',
    '2130706433', '0x7f000001', '0177.0.0.1',
  ];
  for (const host of hosts) {
    await assert.rejects(http.request({ method: 'GET', url: `http://${host}/metadata` }), { code: 'HTTP_PRIVATE' }, host);
  }
  assert.equal(calls, 0);
});

test('HTTP aceita IPv6 público literal e mantém limites exatos das sub-redes IPv4', async () => {
  const urls: string[] = [];
  const http = new HttpService({ fetch: fakeFetch(url => { urls.push(url); return new Response('ok'); }) });
  for (const host of ['[2606:4700:4700::1111]', '[::ffff:1.1.1.1]', '100.63.255.255', '100.128.0.1', '172.15.0.1', '172.32.0.1', '198.17.255.255', '198.20.0.1']) {
    assert.equal((await http.request({ method: 'GET', url: `https://${host}/` })).body, 'ok');
  }
  assert.equal(urls.length, 8);
});

test('HTTP revalida IPv6 mapeado privado em redirects e cancela o corpo intermediário', async () => {
  let calls = 0, cancelled = false;
  const http = new HttpService({ fetch: fakeFetch(() => {
    calls++;
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
      status: 307, headers: { location: 'http://[::ffff:7f00:1]/private' },
    });
  }) });
  await assert.rejects(http.request({ method: 'GET', url: 'https://1.1.1.1/start' }), { code: 'HTTP_PRIVATE' });
  assert.equal(calls, 1);
  assert.equal(cancelled, true);
});

test('allowPrivate explícito permite literais locais e continua respeitando a allowlist', async () => {
  let calls = 0;
  const http = new HttpService({ allowPrivate: true, allowedHosts: ['[::1]'], fetch: fakeFetch(() => {
    calls++; return new Response('local');
  }) });
  assert.equal((await http.request({ method: 'GET', url: 'http://[::1]/' })).body, 'local');
  await assert.rejects(http.request({ method: 'GET', url: 'http://127.0.0.1/' }), { code: 'HTTP_HOST' });
  assert.equal(calls, 1);
});

test('HTTP recusa credenciais na URL e corpos GET/HEAD antes do fetch', async () => {
  let calls = 0;
  const http = new HttpService({ fetch: fakeFetch(() => { calls++; return new Response('unsafe'); }) });
  for (const url of ['https://user:secret@1.1.1.1/', 'https://user@1.1.1.1/']) {
    await assert.rejects(http.request({ method: 'GET', url }), { code: 'HTTP_URL' });
  }
  for (const method of ['GET', 'HEAD']) {
    for (const body of ['', 'payload', new FormData()]) {
      await assert.rejects(http.request({ method, url: 'https://1.1.1.1/', body }), { code: 'HTTP_BODY' });
    }
  }
  assert.equal(calls, 0);
});

test('redirects preservam PUT/PATCH/DELETE em 301/302 e HEAD em 303', async () => {
  for (const [status, method] of [[301, 'PUT'], [302, 'PATCH'], [302, 'DELETE'], [303, 'HEAD']] as const) {
    const requests: RequestInit[] = [];
    const headers = { Accept: 'application/json', ...(method === 'HEAD' ? {} : { 'Content-Type': 'text/plain' }) };
    const body = method === 'HEAD' ? undefined : 'payload';
    const http = new HttpService({ fetch: fakeFetch((_url, init) => {
      requests.push({ ...init, headers: { ...init.headers } });
      return requests.length === 1
        ? new Response(null, { status, headers: { location: '/final' } })
        : new Response(null);
    }) });
    await http.request({ method, url: 'https://1.1.1.1/start', headers, body });
    assert.equal(requests[1]?.method, method);
    assert.equal(requests[1]?.body, body);
    assert.deepEqual(requests[1]?.headers, headers);
  }
});

test('redirects para GET removem corpo e seus cabeçalhos sem alterar headers do chamador', async () => {
  for (const [status, method] of [[301, 'POST'], [302, 'POST'], [303, 'PUT']] as const) {
    const requests: RequestInit[] = [];
    const headers = {
      'Content-Type': 'application/json', 'content-length': '2', 'Content-Encoding': 'identity',
      'Content-Language': 'pt', 'Content-Location': '/payload', Accept: 'application/json',
      Authorization: 'Bearer private',
    };
    const original = { ...headers };
    const http = new HttpService({ fetch: fakeFetch((_url, init) => {
      requests.push({ ...init, headers: { ...init.headers } });
      return requests.length === 1
        ? new Response(null, { status, headers: { location: '/final' } })
        : new Response('ok');
    }) });
    await http.request({ method, url: 'https://1.1.1.1/start', body: '{}', headers });
    assert.equal(requests[1]?.method, 'GET');
    assert.equal(requests[1]?.body, undefined);
    assert.deepEqual(requests[1]?.headers, { Accept: 'application/json', Authorization: 'Bearer private' });
    assert.deepEqual(headers, original);
  }
});
