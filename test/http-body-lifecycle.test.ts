import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpService } from '../src/services/http.js';

test('requestBytes preserves values when the response source reuses its byte buffer', async () => {
  const buffer = new Uint8Array([0, 255]); let reads = 0;
  const source = new ReadableStream<Uint8Array>({ pull(controller) {
    if (reads === 2) { controller.close(); return; }
    buffer[0] = ++reads; controller.enqueue(buffer);
  } }, { highWaterMark: 0 });
  const http = new HttpService({ allowPrivate: true, fetch: async () => new Response(source) });
  const response = await http.requestBytes({ method: 'GET', url: 'https://response.test' });
  assert.deepEqual(response.body, new Uint8Array([1, 255, 2, 255]));
  assert.equal(source.locked, false);
});

test('HTTP releases source readers even when cancellation never finishes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const mode of ['consumer', 'overflow', 'abort', 'timeout'] as const) {
    let cancelled = false;
    const controller = new AbortController();
    const source = new ReadableStream<Uint8Array>({
      start(output) { if (mode === 'overflow') output.enqueue(new Uint8Array([1, 2])); },
      cancel() { cancelled = true; return new Promise<void>(() => {}); },
    });
    const http = new HttpService({ allowPrivate: true, maxBytes: 1, timeoutMs: 25, fetch: async () => new Response(source) });
    const response = await http.stream({ method: 'GET', url: 'https://response.test', signal: controller.signal });
    const reader = response.body.getReader();
    if (mode === 'consumer') await reader.cancel();
    else {
      const pending = assert.rejects(reader.read(), {
        code: mode === 'overflow' ? 'HTTP_BODY_TOO_LARGE' : mode === 'abort' ? 'EXECUTION_ABORTED' : 'HTTP_TIMEOUT',
      });
      if (mode === 'abort') controller.abort();
      else if (mode === 'timeout') t.mock.timers.tick(25);
      await pending;
    }
    assert.equal(cancelled, true, mode);
    assert.equal(source.locked, false, mode);
    reader.releaseLock();
  }
});
