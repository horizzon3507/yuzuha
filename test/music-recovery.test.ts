import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicManager, TrackQueue } from '../src/music.js';
import { MockMusicBackend, mockTrack } from '../src/testing.js';
import type { MusicEvent } from '../src/music.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function finished(backend: MockMusicBackend, guildID = '100'): MusicEvent {
  return { op: 'event', type: 'TrackEndEvent', guildId: guildID, track: structuredClone(backend.players.get(guildID)!.track!), reason: 'finished' };
}

test('queue edits preserve logical indices after a long dequeue cycle and fail atomically', () => {
  const queue = new TrackQueue<number>(5000);
  queue.add(Array.from({ length: 4000 }, (_, i) => i));
  for (let i = 0; i < 3000; i++) queue.dequeue();
  const expected = Array.from({ length: 1000 }, (_, i) => i + 3000);
  queue.insert(0, [-1, -2]); expected.unshift(-1, -2);
  queue.insert(10, [7, 8]); expected.splice(10, 0, 7, 8);
  queue.move(2, 20); expected.splice(20, 0, expected.splice(2, 1)[0]!);
  queue.move(30, 0); expected.unshift(expected.splice(30, 1)[0]!);
  assert.deepEqual(queue.remove(8, 5), expected.splice(8, 5));
  assert.deepEqual(queue.toArray(), expected); assert.deepEqual(queue.slice(10, 4), expected.slice(10, 14));
  assert.equal(queue.at(3), expected[3]);
  const before = queue.toArray();
  for (const action of [() => queue.remove(-1), () => queue.move(0, queue.size), () => queue.slice(0, 9000), () => queue.insert(0, new Array(5000))]) assert.throws(action);
  let calls = 0;
  assert.throws(() => queue.shuffle(() => ++calls === 3 ? NaN : 0.5), { code: 'MUSIC_QUEUE_RANDOM' });
  assert.deepEqual(queue.toArray(), before);
  queue.shuffle(() => 0); assert.equal(queue.size, before.length);
  assert.deepEqual([...queue.toArray()].sort((a, b) => a - b), [...before].sort((a, b) => a - b));
});

test('player edits and pages copy only the requested tracks; playlist loading is atomic', async () => {
  const backend = new MockMusicBackend(), manager = new MusicManager({ nodes: [backend], queueLimit: 4 });
  const player = manager.createPlayer('100');
  player.enqueueResult({ loadType: 'playlist', data: { info: { name: 'Mix', selectedTrack: -1 }, pluginInfo: {}, tracks: [mockTrack('a'), mockTrack('b'), mockTrack('c')] } });
  const page = player.queuePage(1, 1); page[0]!.info.title = 'mutated'; assert.equal(player.queuePage(1, 1)[0]?.info.title, 'b');
  player.move(2, 0); assert.equal(player.queuePage()[0]?.encoded, 'c');
  assert.equal(player.remove(1)[0]?.encoded, 'a');
  player.enqueueResult({ loadType: 'search', data: [mockTrack('d'), mockTrack('e')] }, 1);
  assert.deepEqual(player.queue.map(track => track.encoded), ['c', 'b', 'e']);
  assert.throws(() => player.enqueueResult({ loadType: 'search', data: [mockTrack()] }, 2), { code: 'MUSIC_SEARCH_INDEX' });
  assert.throws(() => player.enqueue([mockTrack('f'), mockTrack('g')]), { code: 'MUSIC_QUEUE_LIMIT' });
  assert.throws(() => player.enqueueResult({ loadType: 'error', data: { message: 'source unavailable', severity: 'common', cause: 'test' } }), { code: 'MUSIC_LOAD' });
  assert.equal(player.enqueueResult({ loadType: 'empty', data: null }), 3);
  player.shuffle(() => 0); assert.equal(player.queueSize, 3); await manager.close();
});

test('moving the selected queue entry during a pending play removes that exact entry on success', async () => {
  const backend = new MockMusicBackend(), manager = new MusicManager({ nodes: [backend] }), player = manager.createPlayer('100');
  const entered = deferred(), gate = deferred();
  backend.beforeUpdate = async () => { entered.resolve(); await gate.promise; };
  player.enqueue([mockTrack('a'), mockTrack('b'), mockTrack('c')]);
  const playing = player.play(); await entered.promise; player.move(0, 2); gate.resolve(); await playing;
  assert.equal(player.current?.encoded, 'a'); assert.deepEqual(player.queue.map(track => track.encoded), ['b', 'c']);
  await manager.close();
});

test('pending controls are bounded while terminal events retain capacity and are deduplicated', async () => {
  const backend = new MockMusicBackend(), manager = new MusicManager({ nodes: [backend], maxPendingControls: 2 }), player = manager.createPlayer('100');
  player.enqueue([mockTrack('a'), mockTrack('b'), mockTrack('c')]); await player.play();
  const entered = deferred(), gate = deferred();
  backend.beforeUpdate = async () => { entered.resolve(); await gate.promise; };
  const volume = player.setVolume(80); await entered.promise; const paused = player.pause();
  assert.equal(player.pendingControls, 2); await assert.rejects(player.seek(100), { code: 'MUSIC_CONTROL_LIMIT' });
  const event = finished(backend); for (let i = 0; i < 1000; i++) backend.emit(event);
  gate.resolve(); await Promise.all([volume, paused]); await player.drain();
  assert.equal(player.pendingControls, 0); assert.equal(player.current?.encoded, 'b'); assert.equal(player.queueSize, 1);
  assert.equal(backend.updates.filter(item => item.update.track).length, 2); await manager.close();
});

test('position uses a monotonic clock, pause, connection state, duration and timescale', async t => {
  let now = 0; t.mock.method(performance, 'now', () => now);
  const backend = new MockMusicBackend(), manager = new MusicManager({ nodes: [backend] }), player = manager.createPlayer('100');
  player.enqueue(mockTrack('a', { info: { length: 10_000 } })); await player.play();
  now = 1000; assert.equal(player.position, 1000);
  await player.seek(2000); await player.pause(); now = 6000; assert.equal(player.position, 2000);
  await player.pause(false); await player.setFilters({ timescale: { speed: 2, rate: 1.5 } });
  now = 7000; assert.equal(player.position, 5000); now = 20_000; assert.equal(player.position, 10_000);
  backend.emit({ op: 'playerUpdate', guildId: '100', state: { time: 1, position: 400, connected: false, ping: -1 } });
  now += 2000; assert.equal(player.position, 400);
  await assert.rejects(player.setFilters({ timescale: { rate: 0 } }), { code: 'MUSIC_FILTERS' });
  await assert.rejects(player.setFilters({ timescale: { speed: 1e300, rate: 1e300 } }), { code: 'MUSIC_FILTERS' });
  const filters = player.activeFilters; filters.timescale!.speed = 7; assert.equal(player.activeFilters.timescale?.speed, 2);
  await manager.close();
});

test('an invalid successful backend reply cannot commit the queue, pause or volume, and accepted state is copied', async () => {
  const backend = new MockMusicBackend(), manager = new MusicManager({ nodes: [backend] }), player = manager.createPlayer('100');
  player.enqueue([mockTrack('a'), mockTrack('b')]); await player.play();
  const update = backend.updatePlayer.bind(backend); let valid = false;
  let returned: Awaited<ReturnType<typeof update>> | undefined;
  backend.updatePlayer = async (...args) => {
    returned = await update(...args);
    if (!valid) returned.state.position = NaN;
    return returned;
  };
  await assert.rejects(player.skip(), { code: 'MUSIC_STATE' });
  assert.equal(player.current?.encoded, 'a'); assert.equal(player.queueSize, 1);
  await assert.rejects(player.pause(), { code: 'MUSIC_STATE' }); assert.equal(player.isPaused, false);
  await assert.rejects(player.setVolume(10), { code: 'MUSIC_STATE' }); assert.equal(player.volume, 100);
  valid = true; await manager.recoverNode(backend);
  const before = player.state!.position; returned!.state.position = 99_999; assert.equal(player.state!.position, before);
  assert.equal(player.current?.encoded, 'a'); assert.equal(player.queueSize, 1); await manager.close();
});

test('node selection accounts for reported load and excludes unavailable nodes', async () => {
  const busy = new MockMusicBackend(), idle = new MockMusicBackend(); busy.penalty = 200;
  const manager = new MusicManager({ nodes: [busy, idle] });
  assert.equal(manager.createPlayer('100').node, idle); await manager.search('scsearch:test'); assert.equal(idle.loads.length, 1);
  idle.available = false; assert.equal(manager.createPlayer('101').node, busy);
  await manager.close(); assert.equal(busy.lifecycleSubscriptionCount + idle.lifecycleSubscriptionCount, 0);
});

test('voice bridges receive channelId for Lavalink 4.2 and mismatched credentials are cleaned up', async () => {
  const backend = new MockMusicBackend(); let leaves = 0;
  const manager = new MusicManager({ nodes: [backend], voice: {
    async join(_guild, channel) { return { token: 'token', endpoint: 'mock', sessionId: 'voice', ...(channel === 'bad' ? { channelId: 'other' } : {}) }; },
    async leave() { leaves++; },
  } });
  const player = manager.createPlayer('100'); await player.connect('200'); assert.equal(backend.players.get('100')?.voice.channelId, '200');
  await assert.rejects(player.connect('bad'), { code: 'MUSIC_VOICE_STATE' }); assert.equal(leaves, 1); assert.equal(player.voiceChannelID, undefined);
  await manager.close(); assert.equal(leaves, 1);
});

test('a resumed session preserves playback without PATCH; a lost session restores state and refreshes voice', async t => {
  let now = 0, joins = 0; t.mock.method(performance, 'now', () => now);
  const backend = new MockMusicBackend(), manager = new MusicManager({ nodes: [backend], voice: {
    async join(_guild, channel) { joins++; return { token: `token${joins}`, endpoint: 'mock', sessionId: `voice${joins}`, channelId: channel }; }, async leave() {},
  } });
  const player = manager.createPlayer('100'); let recovered = 0; player.on('recovered', () => { recovered++; });
  await player.connect('200'); player.enqueue([mockTrack('a'), mockTrack('b')]); await player.play();
  await player.seek(4500); await player.pause(); await player.setVolume(65); await player.setFilters({ timescale: { speed: 1.25 } }); player.setLoop('queue');
  const old = finished(backend), count = backend.updates.length;
  backend.emitLifecycle({ type: 'disconnect', code: 1006 }); now = 10_000;
  backend.emitLifecycle({ type: 'ready', sessionID: 'same', resumed: true }); await manager.drain();
  assert.equal(backend.updates.length, count); assert.equal(joins, 1);
  backend.emitLifecycle({ type: 'ready', sessionID: 'new', resumed: false });
  assert.equal(player.isRecovering, true); await manager.drain();
  assert.equal(player.isRecovering, false); assert.equal(recovered, 1); assert.equal(joins, 2);
  const remote = backend.players.get('100')!;
  assert.equal(remote.track?.encoded, 'a'); assert.equal(remote.state.position, 4500); assert.equal(remote.paused, true);
  assert.equal(remote.volume, 65); assert.equal(remote.filters.timescale?.speed, 1.25); assert.equal(remote.voice.channelId, '200');
  assert.equal(player.loop, 'queue'); assert.deepEqual(player.queue.map(track => track.encoded), ['b']);
  backend.emit(old); await player.drain(); assert.equal(player.current?.encoded, 'a'); await manager.close();
});

test('recovery concurrency stays bounded across many guilds and leaves queues intact', async () => {
  const backend = new MockMusicBackend(), manager = new MusicManager({ nodes: [backend], recoveryConcurrency: 2 });
  for (let i = 0; i < 12; i++) { const player = manager.createPlayer(String(i)); player.enqueue([mockTrack('a'), mockTrack('b')]); await player.play(); }
  let active = 0, peak = 0;
  backend.beforeUpdate = async () => { peak = Math.max(peak, ++active); await new Promise<void>(resolve => setImmediate(resolve)); active--; };
  backend.emitLifecycle({ type: 'ready', sessionID: 'new', resumed: false }); await manager.drain();
  assert.equal(peak, 2); assert.equal(backend.players.size, 12);
  for (let i = 0; i < 12; i++) assert.equal(manager.get(String(i))?.queueSize, 1);
  await manager.close();
});

test('failed recovery reports errors and retains state until an explicit retry succeeds', async () => {
  const backend = new MockMusicBackend(), failures: unknown[] = [];
  const manager = new MusicManager({ nodes: [backend], onError(error) { failures.push(error); } }), player = manager.createPlayer('100');
  player.enqueue([mockTrack('a'), mockTrack('b')]); await player.play(); await player.pause();
  backend.failNextUpdate = new Error('recovery failed');
  await assert.rejects(manager.recoverNode(backend), AggregateError);
  assert.equal(failures.length, 1); assert.equal(player.current?.encoded, 'a'); assert.equal(player.queueSize, 1); assert.equal(player.isRecovering, true);
  await assert.rejects(player.skip(), { code: 'MUSIC_RECOVERY_REQUIRED' });
  const first = player.recover(); assert.equal(player.recover(), first); await first;
  assert.equal(player.isRecovering, false); assert.equal(player.current?.encoded, 'a'); assert.equal(player.isPaused, true);
  await manager.close();
});

test('late PATCH from a lost session cannot commit queue changes before recovery', async () => {
  const backend = new MockMusicBackend(), manager = new MusicManager({ nodes: [backend] }), player = manager.createPlayer('100');
  player.enqueue([mockTrack('a'), mockTrack('b')]); await player.play();
  const entered = deferred(), gate = deferred();
  backend.beforeUpdate = async () => { entered.resolve(); await gate.promise; };
  const skipping = player.skip(); await entered.promise;
  const rejected = assert.rejects(skipping, { code: 'MUSIC_SESSION_CHANGED' });
  backend.emitLifecycle({ type: 'ready', sessionID: 'new', resumed: false }); gate.resolve(); await rejected; await manager.drain();
  assert.equal(player.current?.encoded, 'a'); assert.deepEqual(player.queue.map(track => track.encoded), ['b']);
  assert.equal(backend.players.get('100')?.track?.encoded, 'a'); await manager.close();
});

test('session loss during automatic advancement restores the pending next track exactly once', async () => {
  const backend = new MockMusicBackend(), manager = new MusicManager({ nodes: [backend] }), player = manager.createPlayer('100');
  player.enqueue([mockTrack('a'), mockTrack('b'), mockTrack('c')]); await player.play();
  const entered = deferred(), gate = deferred(); backend.beforeUpdate = async () => { entered.resolve(); await gate.promise; };
  backend.emit(finished(backend)); await entered.promise;
  backend.emitLifecycle({ type: 'ready', sessionID: 'new', resumed: false }); gate.resolve(); await manager.drain();
  assert.equal(player.current?.encoded, 'b'); assert.deepEqual(player.queue.map(track => track.encoded), ['c']);
  assert.equal(backend.players.get('100')?.track?.encoded, 'b'); await manager.close();
});

test('a second session loss invalidates an active recovery and the next generation restores it', async () => {
  const backend = new MockMusicBackend(), manager = new MusicManager({ nodes: [backend] }), player = manager.createPlayer('100');
  player.enqueue([mockTrack('a'), mockTrack('b')]); await player.play();
  const entered = deferred(), gate = deferred(); backend.beforeUpdate = async () => { entered.resolve(); await gate.promise; };
  backend.emitLifecycle({ type: 'ready', sessionID: 'new1', resumed: false }); await entered.promise;
  backend.emitLifecycle({ type: 'ready', sessionID: 'new2', resumed: false }); gate.resolve(); await manager.drain();
  assert.equal(player.isRecovering, false); assert.equal(player.current?.encoded, 'a'); assert.equal(player.queueSize, 1);
  assert.equal(backend.players.get('100')?.track?.encoded, 'a'); await manager.close();
});

test('shutdown aborts active recovery and waits for the bounded worker pool', async () => {
  const backend = new MockMusicBackend(), manager = new MusicManager({ nodes: [backend], recoveryConcurrency: 1 }), player = manager.createPlayer('100');
  player.enqueue(mockTrack()); await player.play(); const entered = deferred();
  backend.beforeUpdate = async (_guild, _update, signal) => { entered.resolve(); await new Promise<void>(resolve => signal!.addEventListener('abort', () => resolve(), { once: true })); };
  backend.emitLifecycle({ type: 'ready', sessionID: 'new', resumed: false }); await entered.promise;
  await manager.close(); assert.equal(manager.size, 0); assert.equal(backend.lifecycleSubscriptionCount, 0);
});

test('a start event arriving before the REST response is delivered after the playback commits', async () => {
  const backend = new MockMusicBackend(), manager = new MusicManager({ nodes: [backend] }), player = manager.createPlayer('100');
  const started: string[] = []; player.on('trackStart', track => started.push(track.encoded));
  backend.beforeUpdate = async (guildID, update) => {
    if (update.track && 'encoded' in update.track && update.track.encoded) backend.emit({ op: 'event', type: 'TrackStartEvent', guildId: guildID, track: mockTrack(update.track.encoded, { userData: update.track.userData ?? {} }) });
  };
  player.enqueue(mockTrack('a')); await player.play(); await player.drain(); assert.deepEqual(started, ['a']); await manager.close();
});
