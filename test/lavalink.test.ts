import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import type WebSocket from 'ws';
import { LavalinkNode, MusicManager } from '../src/music.js';
import type { LavalinkOptions } from '../src/music.js';
import { MockMusicBackend, mockTrack } from '../src/testing.js';

class Socket extends EventEmitter {
  closed = false;
  packet(payload: unknown): void { this.emit('message', Buffer.from(JSON.stringify(payload))); }
  terminate(): void { this.disconnect(); }
  disconnect(): void { if (!this.closed) { this.closed = true; this.emit('close', 1006); } }
}
function fixture(options: Partial<LavalinkOptions> = {}, autoReady = true) {
  const sockets: Socket[] = [], handshakes: { url: string; headers: Record<string, string> }[] = [];
  const requests: { url: URL; init: RequestInit }[] = [];
  const backend = new MockMusicBackend();
  const node = new LavalinkNode({ url: 'http://localhost:2333/proxy', password: 'mock-password', userID: '123', reconnect: false, cache: false,
    socketFactory(url, headers) {
      handshakes.push({ url, headers }); const socket = new Socket(); sockets.push(socket);
      if (autoReady) queueMicrotask(() => socket.packet({ op: 'ready', sessionId: `s${sockets.length}`, resumed: sockets.length > 1 }));
      return socket as unknown as WebSocket;
    },
    fetch: async (url, init) => {
      requests.push({ url: new URL(String(url)), init: init! });
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      const target = new URL(String(url));
      if (init?.method === 'PATCH' && target.pathname.includes('/players/')) {
        const guildID = decodeURIComponent(target.pathname.split('/').at(-1)!);
        return Response.json(await backend.updatePlayer(guildID, JSON.parse(String(init.body)), { noReplace: target.searchParams.get('noReplace') === 'true' }));
      }
      if (target.pathname.endsWith('/players')) return Response.json([...backend.players.values()]);
      if (target.pathname.includes('/players/')) return Response.json(backend.players.get(decodeURIComponent(target.pathname.split('/').at(-1)!)));
      return Response.json({ resuming: true, timeout: 60 });
    }, ...options,
  });
  return { node, sockets, handshakes, requests, backend };
}

test('Lavalink handshake distinguishes node and voice sessions and authenticates REST requests', async () => {
  const { node, handshakes, requests } = fixture();
  assert.throws(() => node.getPlayers(), { code: 'LAVALINK_NOT_READY' });
  const first = node.connect(); assert.equal(node.connect(), first); await first;
  assert.equal(node.state, 'ready'); assert.equal(node.sessionID, 's1'); assert.equal(node.available, true);
  assert.equal(handshakes[0]?.url, 'ws://localhost:2333/proxy/v4/websocket');
  assert.deepEqual(handshakes[0]?.headers, { Authorization: 'mock-password', 'User-Id': '123', 'Client-Name': 'yuzuha/0.1.6' });
  assert.deepEqual(JSON.parse(String(requests[0]?.init.body)), { resuming: true, timeout: 60 });
  await node.updatePlayer('guild/with space', { track: { encoded: 'encoded' }, voice: { token: 'mock', endpoint: 'mock', sessionId: 'voice-session' } }, { noReplace: true });
  const request = requests.at(-1)!;
  assert.equal(request.url.pathname, '/proxy/v4/sessions/s1/players/guild%2Fwith%20space'); assert.equal(request.url.search, '?noReplace=true');
  assert.equal(request.init.redirect, 'error'); assert.equal(new Headers(request.init.headers).get('Authorization'), 'mock-password');
  assert.equal(request.url.href.includes('mock-password'), false);
  await node.destroyPlayer('guild/with space'); assert.equal(requests.at(-1)?.init.method, 'DELETE');
  const closed = node.close(); assert.equal(node.close(), closed); await closed;
  await assert.rejects(node.connect(), { code: 'LAVALINK_CLOSED' });
});

test('search coalesces concurrent requests and bounds LRU cache by entries, bytes and TTL', async t => {
  let calls = 0, now = 0;
  t.mock.method(performance, 'now', () => now);
  const { node } = fixture({ cache: { capacity: 2, ttlMs: 100, maxBytes: 10_000 }, fetch: async url => {
    calls++; return Response.json({ loadType: 'track', data: mockTrack(new URL(String(url)).searchParams.get('identifier')!) });
  } });
  const values = await Promise.all([node.loadTracks('hello & world'), node.loadTracks('hello & world')]);
  assert.equal(calls, 1); assert.equal(values[0]?.loadType, 'track');
  if (values[0]?.loadType === 'track') values[0].data.info.title = 'mutated';
  const original = await node.loadTracks('hello & world'); assert.equal(original.loadType === 'track' && original.data.info.title, 'hello & world');
  await node.loadTracks('b'); await node.loadTracks('hello & world'); await node.loadTracks('c');
  await node.loadTracks('hello & world'); assert.equal(calls, 3);
  await node.loadTracks('b'); assert.equal(calls, 4);
  now = 101; await node.loadTracks('b'); assert.equal(calls, 5); await node.close();
  const tiny = fixture({ cache: { maxBytes: 1 }, fetch: async () => { calls++; return Response.json({ loadType: 'track', data: mockTrack() }); } }).node;
  await tiny.loadTracks('a'); await tiny.loadTracks('a'); assert.equal(calls, 7); await tiny.close();
});

test('signaled searches do not share cancellation with another caller', async () => {
  let resolve!: () => void;
  const gate = new Promise<void>(done => { resolve = done; });
  const { node } = fixture({ fetch: async () => { await gate; return Response.json({ loadType: 'empty', data: null }); } });
  const controller = new AbortController();
  const one = node.loadTracks('a'), two = node.loadTracks('a', controller.signal);
  const rejected = assert.rejects(two, { code: 'EXECUTION_ABORTED' }); controller.abort();
  await rejected; resolve();
  assert.deepEqual(await one, { loadType: 'empty', data: null }); await node.close();
});

test('signaled search fanout uses one request, returns isolated copies and releases every waiter', async () => {
  let calls = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const { node } = fixture({ fetch: async () => { calls++; await gate; return Response.json({ loadType: 'track', data: mockTrack('a') }); } });
  const controllers = Array.from({ length: 100 }, () => new AbortController());
  const tasks = controllers.map(controller => node.loadTracks('same', controller.signal));
  const cancelled = assert.rejects(tasks[0]!, { code: 'EXECUTION_ABORTED' }); controllers[0]!.abort(); await cancelled;
  assert.equal(calls, 1); assert.equal(node.diagnostics.pendingLoads, 99); assert.equal(node.diagnostics.coalescedLoads, 99);
  release(); const tracks = await Promise.all(tasks.slice(1));
  if (tracks[0]!.loadType === 'track') tracks[0]!.data.info.title = 'mutated';
  assert.equal(tracks[1]!.loadType === 'track' && tracks[1]!.data.info.title, 'a');
  assert.equal(node.diagnostics.pendingLoads, 0); assert.equal(node.diagnostics.pendingRequests, 0); await node.close();
});

test('the last cancelled search aborts its request; waiter capacity is bounded independently of HTTP capacity', async () => {
  let requestSignal: AbortSignal | undefined;
  const { node } = fixture({ maxPendingLoads: 2, fetch: async (_url, init) => {
    requestSignal = init!.signal!;
    await new Promise<void>(resolve => requestSignal!.addEventListener('abort', () => resolve(), { once: true }));
    return Response.json({ loadType: 'empty', data: null });
  } });
  const one = new AbortController(), two = new AbortController();
  const first = node.loadTracks('same', one.signal), second = node.loadTracks('same', two.signal);
  await assert.rejects(node.loadTracks('same'), { code: 'LAVALINK_CAPACITY' });
  const firstRejection = assert.rejects(first, { code: 'EXECUTION_ABORTED' }); one.abort(); await firstRejection;
  assert.equal(requestSignal!.aborted, false);
  const secondRejection = assert.rejects(second, { code: 'EXECUTION_ABORTED' }); two.abort(); await secondRejection;
  assert.equal(requestSignal!.aborted, true); assert.equal(node.diagnostics.pendingLoads, 0); await node.close();
});

test('decode endpoints preserve encoded data and validate batches, legacy metadata and response shapes', async () => {
  const requests: { url: URL; init: RequestInit }[] = [];
  let malformed = false;
  const { node } = fixture({ fetch: async (url, init) => {
    const target = new URL(String(url)); requests.push({ url: target, init: init! });
    if (malformed) return Response.json([null]);
    if (target.pathname.endsWith('/decodetracks')) return Response.json(JSON.parse(String(init!.body)).map((encoded: string) => mockTrack(encoded)));
    const value: Partial<ReturnType<typeof mockTrack>> = mockTrack(target.searchParams.get('encodedTrack')!); delete value.userData; delete value.pluginInfo;
    return Response.json(value);
  } });
  const encoded = 'a+/=='; assert.equal((await node.decodeTrack(encoded)).encoded, encoded);
  assert.equal(requests[0]!.url.searchParams.get('encodedTrack'), encoded);
  assert.deepEqual((await node.decodeTracks(['a', 'b'])).map(track => track.encoded), ['a', 'b']);
  assert.equal(requests[1]!.init.method, 'POST');
  await assert.rejects(node.decodeTrack(''), { code: 'LAVALINK_TRACKS' });
  await assert.rejects(node.decodeTracks([]), { code: 'LAVALINK_TRACKS' });
  await assert.rejects(node.decodeTracks(new Array(2)), { code: 'LAVALINK_TRACKS' });
  malformed = true; await assert.rejects(node.decodeTrack('a'), { code: 'LAVALINK_PROTOCOL' });
  await assert.rejects(node.decodeTracks(['a']), { code: 'LAVALINK_PROTOCOL' }); await node.close();
});

test('replayed events wait for the session PATCH and lifecycle notification before delivery', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const { node, sockets } = fixture({ fetch: async () => { await gate; return Response.json({ resuming: true, timeout: 60 }); } }, false);
  const delivered: string[] = [];
  const off = node.subscribeLifecycle(event => delivered.push(event.type));
  node.subscribe(event => { assert.equal(node.available, true); delivered.push(event.op); });
  const connecting = node.connect(), socket = sockets[0]!;
  socket.packet({ op: 'ready', sessionId: 'resumed', resumed: true });
  socket.packet({ op: 'event', type: 'TrackEndEvent', guildId: '100', track: mockTrack(), reason: 'finished' });
  socket.packet({ op: 'playerUpdate', guildId: '100', state: { time: 2, position: 2000, connected: true, ping: 1 } });
  assert.deepEqual(delivered, []); release(); await connecting;
  assert.deepEqual(delivered, ['ready', 'event', 'playerUpdate']);
  socket.disconnect(); assert.equal(delivered.at(-1), 'disconnect');
  off(); await node.close(); assert.equal(delivered.at(-1), 'disconnect');
});

test('closing from a lifecycle listener reuses the same shutdown promise', async () => {
  const { node } = fixture(); let repeated: Promise<void> | undefined;
  node.subscribeLifecycle(event => { if (event.type === 'closed') repeated = node.close(); });
  const closing = node.close(); assert.equal(repeated, closing); await closing;
});

test('REST validates player identity, state, tracks and configuration before returning a successful response', async () => {
  const backend = new MockMusicBackend();
  const valid = await backend.updatePlayer('100', { track: { encoded: 'a' } });
  let override: unknown = valid;
  const { node } = fixture({ fetch: async url => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/players')) return Response.json([override]);
    if (path.endsWith('/players/100')) return Response.json(override);
    return Response.json({ resuming: true, timeout: 60 });
  } });
  await node.connect(); assert.equal((await node.getPlayer('100')).track?.encoded, 'a'); assert.equal((await node.getPlayers()).length, 1);
  for (const invalid of [{ ...valid, guildId: 'other' }, { ...valid, state: { ...valid.state, position: -1 } },
    { ...valid, state: { ...valid.state, ping: null } }, { ...valid, track: {} }, { ...valid, filters: [] }, { ...valid, voice: null }]) {
    override = invalid;
    await assert.rejects(node.updatePlayer('100', { paused: true }), { code: 'LAVALINK_PROTOCOL' });
  }
  override = {}; await assert.rejects(node.getPlayers(), { code: 'LAVALINK_PROTOCOL' }); await node.close();
});

test('node lifecycle and manager rebuild a lost session together through the validated REST path', async () => {
  const { node, backend, sockets } = fixture({}, false);
  const initial = node.connect(); sockets[0]!.packet({ op: 'ready', sessionId: 'old', resumed: false }); await initial;
  const manager = new MusicManager({ nodes: [node] }), player = manager.createPlayer('100');
  player.enqueue([mockTrack('a'), mockTrack('b')]); await player.play(); await player.pause(); await player.seek(2000);
  const old = backend.players.get('100')!.track!; sockets[0]!.disconnect(); backend.players.clear();
  const reconnecting = node.connect(); sockets[1]!.packet({ op: 'ready', sessionId: 'new', resumed: false }); await reconnecting; await manager.drain();
  assert.equal(player.current?.encoded, 'a'); assert.equal(player.queueSize, 1); assert.equal(player.isPaused, true);
  const remote = await node.getPlayer('100'); assert.equal(remote.state.position, 2000); assert.equal(remote.track?.encoded, 'a');
  sockets[1]!.packet({ op: 'event', type: 'TrackEndEvent', guildId: '100', track: old, reason: 'finished' }); await player.drain();
  assert.equal(player.current?.encoded, 'a'); await manager.close(); await node.close();
});

test('resume buffer is bounded and malformed statistics cannot influence node selection', async t => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const buffered = fixture({ maxPendingLoads: 1, fetch: async () => { await gate; return Response.json({}); } }, false);
  const rejection = assert.rejects(buffered.node.connect(), { code: 'LAVALINK_RESPONSE_LIMIT' });
  buffered.sockets[0]!.packet({ op: 'ready', sessionId: 's', resumed: true });
  const event = { op: 'event', type: 'TrackStartEvent', guildId: '100', track: mockTrack() };
  buffered.sockets[0]!.packet(event); buffered.sockets[0]!.packet(event); await rejection; release(); await buffered.node.close();
  let now = 0; t.mock.method(performance, 'now', () => now);
  const { node, sockets } = fixture(); await node.connect(); const errors: unknown[] = []; node.on('nodeError', error => errors.push(error));
  const stats = { op: 'stats', players: 5, playingPlayers: 2, uptime: 1,
    cpu: { cores: 4, systemLoad: 0.3, lavalinkLoad: 0.2 }, memory: { free: 1, used: 1, allocated: 2, reservable: 3 },
    frameStats: { sent: 5000, nulled: 60, deficit: 0 } };
  sockets[0]!.packet(stats); assert.equal(node.penalty, 24);
  sockets[0]!.packet({ ...stats, cpu: { lavalinkLoad: 'invalid' } }); assert.equal(errors.length, 1); assert.equal(node.penalty, 24);
  now = 90_001; assert.equal(node.penalty, 0); await node.close();
});

test('REST limits response size, discards failed bodies and rejects malformed payloads', async () => {
  for (const sample of ['limit', 'length', 'json', 'shape', 'http']) {
    let cancelled = false;
    const { node } = fixture({ maxResponseBytes: 80, fetch: async () => {
      if (sample === 'json') return new Response('not json');
      if (sample === 'shape') return Response.json({ loadType: 'search', data: [null] });
      return new Response(new ReadableStream({ start(control) { control.enqueue(new TextEncoder().encode('x'.repeat(100))); }, cancel() { cancelled = true; } }),
        { status: sample === 'http' ? 401 : 200, headers: sample === 'length' ? { 'Content-Length': '100' } : {} });
    } });
    const code = sample === 'http' ? 'LAVALINK_HTTP' : ['limit', 'length'].includes(sample) ? 'LAVALINK_RESPONSE_LIMIT' : 'LAVALINK_PROTOCOL';
    await assert.rejects(node.loadTracks('a'), (error: unknown) => { assert.equal((error as { code: string }).code, code); assert.equal(String(error).includes('mock-password'), false); return true; });
    if (['limit', 'length', 'http'].includes(sample)) assert.equal(cancelled, true);
    await node.close();
  }
});

test('request cancellation and close settle even when injected fetch ignores its signal', async () => {
  let resolve!: (response: Response) => void;
  const gate = new Promise<Response>(done => { resolve = done; });
  const { node } = fixture({ maxPendingRequests: 1, fetch: async () => gate });
  const controller = new AbortController();
  const request = node.getInfo(controller.signal); await assert.rejects(node.getStats(), { code: 'LAVALINK_CAPACITY' });
  const rejected = assert.rejects(request, { code: 'EXECUTION_ABORTED' }); controller.abort(); await rejected;
  const second = node.getInfo(); const aborted = assert.rejects(second, { code: 'EXECUTION_ABORTED' });
  await node.close(); await aborted;
  let cancelled = false; resolve(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); assert.equal(cancelled, true);
});

test('REST timeout also bounds a stalled streaming body', async t => {
  const keepAlive = setInterval(() => {}, 1000); t.after(() => clearInterval(keepAlive));
  let cancelled = false;
  const { node } = fixture({ timeoutMs: 15, fetch: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })) });
  await assert.rejects(node.getInfo(), { code: 'LAVALINK_TIMEOUT' }); assert.equal(cancelled, true); await node.close();
});

test('ready timeout and malformed ready reject the connection and clean up the socket', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const first = fixture({ timeoutMs: 100 }, false);
  const timeout = assert.rejects(first.node.connect(), { code: 'LAVALINK_TIMEOUT' }); t.mock.timers.tick(100); await timeout;
  assert.equal(first.sockets[0]?.closed, true); await first.node.close();
  const second = fixture({}, false); const invalid = assert.rejects(second.node.connect(), { code: 'LAVALINK_PROTOCOL' });
  second.sockets[0]!.packet({ op: 'ready', sessionId: '', resumed: false }); await invalid; await second.node.close();
});

test('event decoding isolates unknown extensions, validates tracks and unsubscribes', async () => {
  const { node, sockets } = fixture(); const errors: unknown[] = [], events: unknown[] = [];
  node.on('nodeError', error => errors.push(error)); const off = node.subscribe(event => events.push(event));
  await node.connect(); const socket = sockets[0]!;
  socket.packet({ op: 'event', guildId: '100', type: 'ExtensionEvent' }); assert.equal(events.length, 0);
  socket.packet({ op: 'event', guildId: '100', type: 'TrackEndEvent', track: null, reason: 'finished' }); assert.equal(errors.length, 1);
  socket.packet({ op: 'event', guildId: '100', type: 'TrackEndEvent', track: mockTrack(), reason: 'finished' }); assert.equal(events.length, 1);
  const { pluginInfo: _pluginInfo, userData: _userData, ...legacy } = mockTrack();
  socket.packet({ op: 'event', guildId: '100', type: 'TrackStartEvent', track: legacy }); assert.equal(events.length, 2);
  assert.deepEqual((events[1] as { track: { userData: unknown } }).track.userData, {});
  off(); socket.packet({ op: 'playerUpdate', guildId: '100', state: { time: 0, position: 2, connected: true, ping: 3 } }); assert.equal(events.length, 2);
  await node.close(); assert.equal(node.listenerCount('event'), 0);
});

test('reconnect uses bounded backoff and offers the previous session for resumption', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { node, sockets, handshakes } = fixture({ reconnect: { attempts: 2, delayMs: 10, maxDelayMs: 20 } });
  await node.connect(); sockets[0]!.disconnect(); assert.equal(node.available, false);
  const ready = once(node, 'ready'); t.mock.timers.tick(10); const [session] = await ready;
  assert.equal(session.resumed, true); assert.equal(handshakes[1]?.headers['Session-Id'], 's1'); assert.equal(node.sessionID, 's2');
  sockets[1]!.disconnect(); await node.close(); t.mock.timers.tick(1000); assert.equal(handshakes.length, 2);
});

test('invalid URLs, budgets and identities are rejected before networking', () => {
  for (const options of [{ url: 'ftp://localhost' }, { url: 'http://name:password@localhost' }, { url: 'http://localhost?secret=x' },
    { timeoutMs: 0 }, { userID: '' }, { password: '\r\n' }, { maxResponseBytes: Infinity }, { clientName: 'no-version' }]) {
    assert.throws(() => fixture(options), /./);
  }
});
