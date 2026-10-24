import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { CommandContext, MemoryStore } from '../src/index.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';

function fixture() {
  const files: Uint8Array[] = [];
  const abort = new AbortController();
  const ctx = new CommandContext({ message: mockMessage('!export'), command: { name: 'export' }, store: new MemoryStore(),
    transport: new MockTransport(), cooldown: () => 0, signal: abort.signal,
    resources: mockResources({ messages: { sendBytes: async (_id, input) => { files.push(input[0]!.data); return 'sent'; } } }) });
  return { ctx, files, abort };
}

test('stream attachments copy reused byte chunks and send only a complete validated payload', async () => {
  const f = fixture();
  const data = new Uint8Array([1, 2]); let reads = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(c) {
    if (reads++ === 2) { c.close(); return; }
    data[0] = reads; c.enqueue(data);
  } }, { highWaterMark: 0 });
  assert.equal(await f.ctx.sendStream(stream, { name: 'export.bin' }), 'sent');
  assert.deepEqual(f.files[0], new Uint8Array([1, 2, 2, 2]));
  assert.equal(stream.locked, false);
  assert.equal(getEventListeners(f.abort.signal, 'abort').length, 0);
});

test('stream attachment overflow, cancellation and timeout discard the payload and close readers', async () => {
  for (const mode of ['overflow', 'abort', 'timeout'] as const) {
    const f = fixture(); let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ start(c) { if (mode === 'overflow') c.enqueue(new Uint8Array(3)); }, cancel() { cancelled = true; } });
    const pending = f.ctx.sendStream(stream, { name: 'export.bin', maxBytes: 2, timeoutMs: mode === 'timeout' ? 5 : 1000 });
    const assertion = assert.rejects(pending, { code: mode === 'overflow' ? 'EXECUTION_LIMIT' : mode === 'abort' ? 'EXECUTION_ABORTED' : 'ATTACHMENT_TIMEOUT' });
    if (mode === 'abort') f.abort.abort();
    await assertion;
    assert.deepEqual(f.files, []); assert.equal(cancelled, true); assert.equal(stream.locked, false);
  }
});

test('stream attachment validation precedes consumption and source failures do not upload partial bytes', async () => {
  const f = fixture(); let reads = 0;
  const invalid = new ReadableStream<Uint8Array>({ pull() { reads++; } }, { highWaterMark: 0 });
  await assert.rejects(f.ctx.sendStream(invalid, { name: 'bad\nname' }), { code: 'ATTACHMENT_NAME' });
  assert.equal(reads, 0); assert.equal(invalid.locked, false);
  const failed = new ReadableStream<Uint8Array>({ pull(c) { c.error(new Error('source failed')); } });
  await assert.rejects(f.ctx.sendStream(failed, { name: 'data.bin' }), /source failed/);
  assert.deepEqual(f.files, []); assert.equal(failed.locked, false);
});
