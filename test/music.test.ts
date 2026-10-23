import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, Yuzuha } from '../src/index.js';
import { MusicManager, TrackQueue } from '../src/music.js';
import { MockMusicBackend, MockTransport, mockMessage, mockTrack } from '../src/testing.js';
import type { MusicEvent } from '../src/music.js';

const end = (backend: MockMusicBackend, guildID: string, reason: 'finished' | 'loadFailed' | 'stopped' | 'replaced' | 'cleanup' = 'finished'): MusicEvent => ({
  op: 'event', type: 'TrackEndEvent', guildId: guildID, track: structuredClone(backend.players.get(guildID)!.track!), reason,
});

test('bounded FIFO preserves order across compaction and refuses a whole overflowing batch', () => {
  const queue = new TrackQueue<number>(5000);
  queue.add(Array.from({ length: 5000 }, (_, i) => i));
  assert.throws(() => queue.enqueue(1, 2), { code: 'MUSIC_QUEUE_LIMIT' });
  for (let i = 0; i < 4000; i++) assert.equal(queue.dequeue(), i);
  queue.enqueue(5000, 5001);
  assert.equal(queue.peek(), 4000); assert.equal(queue.size, 1002);
  assert.deepEqual(queue.toArray(), Array.from({ length: 1002 }, (_, i) => 4000 + i));
  queue.clear(); assert.equal(queue.dequeue(), undefined);
  assert.equal(queue.enqueue(1), 1); assert.equal(queue.dequeue(), 1);
});

test('manager isolates guilds, balances nodes, limits players and releases slots', async () => {
  const one = new MockMusicBackend(), two = new MockMusicBackend();
  const manager = new MusicManager({ nodes: [one, two], maxPlayers: 2 });
  const first = manager.createPlayer('100'), second = manager.createPlayer('101');
  assert.equal(first.node, one); assert.equal(second.node, two);
  assert.equal(manager.createPlayer('100'), first);
  assert.throws(() => manager.createPlayer('102'), { code: 'MUSIC_CAPACITY' });
  first.enqueue(mockTrack('a')); second.enqueue(mockTrack('b'));
  await Promise.all([first.play(), second.play()]);
  assert.equal(one.players.get('100')?.track?.encoded, 'a');
  assert.equal(two.players.get('101')?.track?.encoded, 'b');
  assert.equal(await manager.destroyPlayer('100'), true);
  assert.equal(manager.createPlayer('102').node, one);
  await manager.close(); assert.equal(one.subscriptionCount + two.subscriptionCount, 0);
  assert.throws(() => manager.createPlayer('100'), { code: 'MUSIC_CLOSED' });
});

test('manager cleans staged subscriptions and excludes unavailable nodes', async () => {
  const good = new MockMusicBackend(), broken = new MockMusicBackend();
  broken.subscribe = () => { throw new Error('subscribe failure'); };
  assert.throws(() => new MusicManager({ nodes: [good, broken] }), /subscribe failure/); assert.equal(good.subscriptionCount, 0);
  const offline = new MockMusicBackend(); Object.assign(offline, { available: false });
  const manager = new MusicManager({ nodes: [offline, good] }); assert.equal(manager.createPlayer('100').node, good);
  assert.throws(() => manager.createPlayer('101', { node: offline }), { code: 'MUSIC_NODE_UNAVAILABLE' });
  await manager.close(); await assert.rejects(manager.search('a'), { code: 'MUSIC_CLOSED' });
});

test('player snapshots queue entries, controls and state without exposing internal references', async () => {
  const backend = new MockMusicBackend(), manager = new MusicManager({ nodes: [backend], queueLimit: 2 });
  const player = manager.createPlayer('100'), original = mockTrack('a');
  player.enqueue(original); original.info.title = 'mutated';
  const sparse = new Array(1); assert.throws(() => player.enqueue(sparse), { code: 'MUSIC_TRACK' }); assert.equal(player.queueSize, 1);
  player.queue[0]!.info.title = 'also mutated';
  assert.equal(player.queue[0]?.info.title, 'a');
  await player.play(); assert.equal(player.current?.info.title, 'a');
  player.current!.info.title = 'changed'; assert.equal(player.current?.info.title, 'a');
  await player.pause(); await player.setVolume(75); await player.seek(1000);
  assert.equal(player.isPaused, true); assert.equal(player.volume, 75); assert.equal(player.state?.position, 1000);
  const filters = { timescale: { speed: 1.25 } };
  const update = player.setFilters(filters); filters.timescale.speed = 2; await update;
  assert.equal(backend.players.get('100')?.filters.timescale?.speed, 1.25);
  await assert.rejects(player.seek(-1), { code: 'MUSIC_SEEK' });
  await assert.rejects(player.setVolume(1001), { code: 'MUSIC_VOLUME' });
  await manager.close();
});

test('concurrent play, skip and pause are serialized; failed PATCH preserves queue and current', async () => {
  const backend = new MockMusicBackend(), manager = new MusicManager({ nodes: [backend] });
  const player = manager.createPlayer('100'); player.enqueue([mockTrack('a'), mockTrack('b'), mockTrack('c')]);
  await Promise.all([player.play(), player.play(), player.pause()]);
  assert.equal(backend.updates.filter(item => item.update.track).length, 1);
  backend.failNextUpdate = new Error('offline');
  await assert.rejects(player.skip(), /offline/);
  assert.equal(player.current?.encoded, 'a'); assert.equal(player.queue[0]?.encoded, 'b');
  await player.skip(); assert.equal(player.current?.encoded, 'b'); assert.equal(player.queueSize, 1);
  backend.failNextUpdate = new Error('offline'); await assert.rejects(player.stop());
  assert.equal(player.current?.encoded, 'b'); assert.equal(player.queueSize, 1);
  await player.stop(); assert.equal(player.current, null); assert.equal(player.queueSize, 0);
  await manager.close();
});

test('track end advances once, ignores foreign nodes and old events, and stops at queue end', async () => {
  const backend = new MockMusicBackend(), other = new MockMusicBackend();
  const manager = new MusicManager({ nodes: [backend, other] }), player = manager.createPlayer('100');
  let ended = 0; player.on('queueEnd', () => { ended++; });
  player.enqueue([mockTrack('a'), mockTrack('b')]); await player.play();
  const old = end(backend, '100'); other.emit(old); await player.drain(); assert.equal(player.current?.encoded, 'a');
  backend.emit(old); backend.emit(old); await player.drain();
  assert.equal(player.current?.encoded, 'b'); assert.equal(player.queueSize, 0);
  backend.emit(old); await player.drain(); assert.equal(player.current?.encoded, 'b');
  backend.emit(end(backend, '100')); await player.drain(); assert.equal(player.current, null); assert.equal(ended, 1);
  await manager.close();
});

test('loop modes, load failures and replaced/stopped events follow Lavalink end reasons', async () => {
  const backend = new MockMusicBackend(), manager = new MusicManager({ nodes: [backend] }), player = manager.createPlayer('100');
  player.enqueue([mockTrack('a'), mockTrack('b')]); await player.play(); player.setLoop('track');
  backend.emit(end(backend, '100')); await player.drain(); assert.equal(player.current?.encoded, 'a'); assert.equal(player.queueSize, 1);
  backend.emit(end(backend, '100', 'loadFailed')); await player.drain(); assert.equal(player.current?.encoded, 'b');
  player.setLoop('queue'); player.enqueue(mockTrack('c'));
  backend.emit(end(backend, '100')); await player.drain();
  assert.equal(player.current?.encoded, 'c'); assert.equal(player.queue[0]?.encoded, 'b');
  backend.emit(end(backend, '100', 'replaced')); await player.drain(); assert.equal(player.current?.encoded, 'c');
  backend.emit(end(backend, '100', 'stopped')); await player.drain(); assert.equal(player.current, null);
  await manager.close();
});

test('clear during an in-flight play does not remove a newly enqueued track', async () => {
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  const backend = new MockMusicBackend(), manager = new MusicManager({ nodes: [backend] }), player = manager.createPlayer('100');
  backend.beforeUpdate = async () => { entered(); await gate; };
  player.enqueue(mockTrack('a')); const playing = player.play(); await started;
  player.clearQueue(); player.enqueue(mockTrack('b')); release(); await playing;
  assert.equal(player.current?.encoded, 'a'); assert.equal(player.queue[0]?.encoded, 'b');
  await manager.close();
});

test('voice is explicit, passes cancellation, and disconnects when the player is destroyed', async () => {
  const backend = new MockMusicBackend(), missing = new MusicManager({ nodes: [backend] });
  await assert.rejects(missing.createPlayer('100').connect('200'), { code: 'MUSIC_VOICE_ADAPTER' }); await missing.close();
  let signal: AbortSignal | undefined; const left: string[] = [];
  const manager = new MusicManager({ nodes: [backend], voice: {
    async join(guildID, channelID, input) { assert.equal(guildID, '100'); assert.equal(channelID, '200'); signal = input;
      return { token: 'mock', endpoint: 'test', sessionId: 'voice-session', channelId: channelID }; },
    async leave(guildID) { left.push(guildID); },
  } });
  const player = manager.createPlayer('100'); await player.connect('200');
  assert.equal(player.voiceChannelID, '200'); assert.equal(backend.players.get('100')?.voice.sessionId, 'voice-session');
  const closing = manager.close(); await closing; assert.equal(signal?.aborted, true); assert.deepEqual(left, ['100']);
  await assert.rejects(player.play(), { code: 'MUSIC_CLOSED' });
});

test('voice joins are cleaned up if the subsequent player update fails', async () => {
  const backend = new MockMusicBackend(); let leaves = 0;
  const manager = new MusicManager({ nodes: [backend], voice: {
    async join() { return { token: 'mock', endpoint: 'mock', sessionId: 'mock' }; }, async leave() { leaves++; },
  } });
  const player = manager.createPlayer('100'); backend.failNextUpdate = new Error('PATCH failed');
  await assert.rejects(player.connect('200'), /PATCH failed/); assert.equal(player.voiceChannelID, undefined); assert.equal(leaves, 1);
  await manager.close(); assert.equal(leaves, 1);
});

test('destroy aborts pending controls, waits for them, and reports partial teardown failures', async () => {
  const backend = new MockMusicBackend(), manager = new MusicManager({ nodes: [backend] }), player = manager.createPlayer('100');
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  backend.beforeUpdate = async (_guild, _update, signal) => { entered(); await new Promise<void>(resolve => signal!.addEventListener('abort', () => resolve(), { once: true })); };
  player.enqueue(mockTrack('a')); const playing = player.play(); await started;
  const failure = assert.rejects(playing, { code: 'EXECUTION_ABORTED' });
  const close = manager.close(); await Promise.all([failure, close]); assert.equal(manager.size, 0);
  const broken = new MockMusicBackend(), failed = new MusicManager({ nodes: [broken] }); failed.createPlayer('200'); broken.failDestroy = new Error('down');
  await assert.rejects(failed.close(), AggregateError); assert.equal(failed.size, 0); assert.equal(broken.subscriptionCount, 0);
});

test('bot injects native music into context and closes players before destroying its client', async () => {
  const backend = new MockMusicBackend(), music = new MusicManager({ nodes: [backend] });
  const bot = new Yuzuha({ music, store: new MemoryStore(), transport: new MockTransport(), scheduler: false });
  bot.command({ name: 'play', async run(ctx) { const player = ctx.music.createPlayer(ctx.requireGuild()); player.enqueue(mockTrack('a')); await player.play(); } });
  assert.equal(await bot.handle(mockMessage('!play')), 'success'); assert.equal(music.get('100')?.current?.encoded, 'a');
  await bot.destroy(); assert.deepEqual(backend.destroyed, ['100']); assert.equal(backend.subscriptionCount, 0);
});
