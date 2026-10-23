import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { LavalinkNode } from '../src/music.js';
import type { LavalinkOptions } from '../src/music.js';

class Socket extends EventEmitter {
  terminate(): void { this.emit('close', 1000); }
}
function fixture(fetchAudio: typeof fetch, options: Partial<LavalinkOptions> = {}) {
  const requests: { url: URL; init: RequestInit }[] = [];
  const sockets: Socket[] = [];
  const node = new LavalinkNode({ url: 'http://localhost:2333/proxy', password: 'mock-only', userID: '123', reconnect: false,
    socketFactory() {
      const socket = new Socket(); sockets.push(socket);
      queueMicrotask(() => socket.emit('message', Buffer.from(JSON.stringify({ op: 'ready', sessionId: 'session', resumed: false }))));
      return socket;
    },
    fetch: async (url, init) => {
      requests.push({ url: new URL(String(url)), init: init! });
      return String(url).includes('/yuzuha/') ? fetchAudio(url, init) : Response.json({ resuming: true, timeout: 60 });
    }, ...options,
  });
  return { node, requests, sockets };
}
function audio(body: ReadableStream<Uint8Array>): Response {
  return new Response(body, { headers: { 'content-type': 'audio/webm', 'x-yuzuha-audio-version': '1' } });
}

test('audio streams authenticate the plugin endpoint, preserve proxy prefixes and stream without a whole-response buffer', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>, cancelled = 0;
  const { node, requests } = fixture(async () => audio(new ReadableStream({ start(value) { controller = value; }, cancel() { cancelled++; } })));
  await node.connect();
  const stream = await node.openAudioStream('guild/space');
  assert.equal(node.diagnostics.activeAudioStreams, 1);
  assert.equal(node.diagnostics.pendingRequests, 0);
  assert.equal(requests.at(-1)?.url.pathname, '/proxy/v4/yuzuha/sessions/session/players/guild%2Fspace/audio');
  assert.equal(new Headers(requests.at(-1)?.init.headers).get('authorization'), 'mock-only');
  assert.equal(requests.at(-1)?.init.redirect, 'error');
  controller.enqueue(Uint8Array.of(1, 2, 3));
  const iterator = stream.data[Symbol.asyncIterator]();
  assert.deepEqual((await iterator.next()).value, Uint8Array.of(1, 2, 3));
  await assert.rejects(stream.data[Symbol.asyncIterator]().next(), { code: 'LAVALINK_AUDIO_CONSUMED' });
  const pending = iterator.next(); await stream.close();
  assert.equal((await pending).done, true); assert.equal(cancelled, 1);
  assert.equal(node.diagnostics.activeAudioStreams, 0); await node.close();
});

test('audio stream lifetime exceeds REST handshake timeout and closes on caller cancellation', async () => {
  let cancelled = 0;
  const { node } = fixture(async () => audio(new ReadableStream({ start(controller) { controller.enqueue(Uint8Array.of(1)); }, cancel() { cancelled++; } })), { timeoutMs: 5 });
  await node.connect(); const controller = new AbortController();
  const stream = await node.openAudioStream('g', controller.signal);
  await delay(20); assert.equal(node.diagnostics.activeAudioStreams, 1);
  const iterator = stream.data[Symbol.asyncIterator](); assert.equal((await iterator.next()).done, false);
  controller.abort(); await stream.close(); assert.equal(cancelled, 1);
  assert.equal(node.diagnostics.activeAudioStreams, 0); await iterator.return?.(); await node.close();
});

test('audio rejects missing plugins and incompatible content before passing bytes to voice', async () => {
  for (const response of [new Response('missing', { status: 404 }), new Response('html'), Response.json({ protocol: 1 })]) {
    const { node } = fixture(async () => response); await node.connect();
    await assert.rejects(node.openAudioStream('g'), { code: response.status === 404 ? 'LAVALINK_AUDIO_PLUGIN' : 'LAVALINK_AUDIO_PROTOCOL' });
    assert.equal(node.diagnostics.activeAudioStreams, 0); await node.close();
  }
});

test('audio limits simultaneous guilds, duplicate consumers and individual chunk size', async () => {
  const { node } = fixture(async () => audio(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1_048_577)); } })), { maxAudioStreams: 1 });
  await node.connect(); const stream = await node.openAudioStream('g');
  await assert.rejects(node.openAudioStream('g'), { code: 'LAVALINK_AUDIO_BUSY' });
  await assert.rejects(node.openAudioStream('other'), { code: 'LAVALINK_AUDIO_LIMIT' });
  await assert.rejects(stream.data[Symbol.asyncIterator]().next(), { code: 'LAVALINK_AUDIO_LIMIT' });
  assert.equal(node.diagnostics.activeAudioStreams, 0); await node.close();
});

test('stalled audio reads time out and release their slot; node close cancels unconsumed streams', async () => {
  let cancelled = 0;
  const { node } = fixture(async () => audio(new ReadableStream({ cancel() { cancelled++; } })), { audioIdleTimeoutMs: 5 });
  await node.connect(); const stream = await node.openAudioStream('g');
  const reading = stream.data[Symbol.asyncIterator]().next();
  await Promise.all([assert.rejects(reading, { code: 'LAVALINK_AUDIO_TIMEOUT' }), delay(20)]);
  assert.equal(node.diagnostics.activeAudioStreams, 0); assert.equal(cancelled, 1);
  await node.openAudioStream('other'); await node.close(); assert.equal(cancelled, 2);
  assert.equal(node.diagnostics.activeAudioStreams, 0);
});

test('shutdown bounds even a fetch which ignores cancellation and cancels its late body', async () => {
  let release!: (value: Response) => void, cancelled = 0;
  const { node } = fixture(() => new Promise(resolve => { release = resolve; }));
  await node.connect(); const opening = node.openAudioStream('g');
  const rejected = assert.rejects(opening, { code: 'EXECUTION_ABORTED' }); await node.close(); await rejected;
  release(audio(new ReadableStream({ cancel() { cancelled++; } })));
  await delay(0); assert.equal(cancelled, 1); assert.equal(node.diagnostics.activeAudioStreams, 0);
});

test('Fluxer audio is balanced by CPU and players, without the unused Discord sender reporting false frame loss', async () => {
  const { node, sockets } = fixture(async () => audio(new ReadableStream()));
  await node.connect();
  sockets[0]!.emit('message', Buffer.from(JSON.stringify({ op: 'stats', players: 2, playingPlayers: 2, uptime: 120_000,
    cpu: { cores: 4, systemLoad: 0.3, lavalinkLoad: 0.2 }, memory: { free: 1, used: 1, allocated: 2, reservable: 3 },
    frameStats: { sent: 0, nulled: 0, deficit: 3000 } })));
  assert.equal(node.penalty, 122);
  const stream = await node.openAudioStream('g'); assert.equal(node.penalty, 22);
  assert.equal(node.stats?.frameStats?.deficit, 3000);
  await stream.close(); assert.equal(node.penalty, 122); await node.close();
});
