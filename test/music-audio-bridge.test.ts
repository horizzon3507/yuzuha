import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { Client, VoiceChannel } from '@fluxerjs/core';
import { FluxerVoice, FluxerLavalinkBridge, MusicManager } from '../src/music.js';
import type { MusicAudioStream } from '../src/music.js';
import { MockMusicBackend, mockTrack } from '../src/testing.js';

class Connection extends EventEmitter {
  playing = false;
  sources: NodeJS.ReadableStream[] = [];
  fail = false;
  async play(source: string | NodeJS.ReadableStream): Promise<void> {
    if (this.fail) throw new Error('mock publication failure');
    assert.notEqual(typeof source, 'string');
    this.sources.push(source as NodeJS.ReadableStream); (source as PassThrough).resume(); this.playing = true;
  }
  stop(): void { this.playing = false; }
}
class Backend extends MockMusicBackend {
  streams: PassThrough[] = [];
  closes = 0;
  failAudio = false;
  async openAudioStream(_guildID: string, signal?: AbortSignal): Promise<MusicAudioStream> {
    if (this.failAudio) throw new Error('mock audio unavailable');
    const data = new PassThrough(); this.streams.push(data);
    let closed = false;
    const close = async () => { if (closed) return; closed = true; this.closes++; data.destroy(); signal?.removeEventListener('abort', abort); };
    const abort = () => { void close(); }; signal?.addEventListener('abort', abort, { once: true });
    return { data, format: 'webm-opus', close };
  }
}
function fixture(reconnect: false | { attempts?: number; delayMs?: number } = false, maxStreams = 128) {
  const client = new Client(), connection = new Connection(), node = new Backend();
  const left: string[] = []; let joins = 0;
  Reflect.set(client.channels, 'fetch', async (id: string) => new VoiceChannel(client, { id, guild_id: id === 'wrong' ? 'other' : '100', type: 2, name: 'voice' }));
  const voice = new FluxerVoice(client, { async join() { joins++; return connection; }, leave(guildID) { left.push(guildID); } });
  const audio = new FluxerLavalinkBridge({ voice, reconnect, maxStreams });
  const errors: unknown[] = [];
  const manager = new MusicManager({ nodes: [node], audio, onError: error => errors.push(error) });
  return { client, connection, node, voice, audio, manager, errors, left, get joins() { return joins; },
    async close() { await manager.close(); await audio.close(); await voice.close(); await client.destroy(); } };
}
async function until(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await delay(2); }
  assert.ok(predicate(), 'condition did not settle');
}

test('Fluxer bridge publishes once across Lavalink controls and represents the actual audio connection', async () => {
  const f = fixture(); const player = f.manager.createPlayer('100');
  await player.connect('200'); assert.equal(f.audio.size, 1); assert.equal(f.joins, 1);
  player.enqueue([mockTrack('one'), mockTrack('two')]); await player.play();
  await player.pause(); await player.seek(500); await player.setVolume(50); await player.setFilters({ timescale: { speed: 1.2 } });
  assert.equal(player.state?.connected, true); await player.pause(false);
  const raw = f.node.players.get('100')!;
  f.node.emit({ op: 'playerUpdate', guildId: '100', state: { ...raw.state, connected: false } });
  assert.equal(player.state?.connected, true);
  await player.skip(); assert.equal(player.current?.info.title, 'two');
  assert.equal(f.connection.sources.length, 1); assert.equal(f.node.streams.length, 1);
  assert.equal(f.node.updates.some(update => update.update.voice !== undefined), false);
  await f.close(); assert.equal(f.node.closes, 1); assert.deepEqual(f.left, ['100']);
  assert.equal(f.node.lifecycleSubscriptionCount, 0);
  assert.equal(f.connection.listenerCount('error') + f.connection.listenerCount('disconnect'), 0);
});

test('wrong-guild channels fail before joining, opening audio or sending player controls', async () => {
  const f = fixture(); const player = f.manager.createPlayer('100');
  await assert.rejects(player.connect('wrong'), { code: 'VOICE_GUILD' });
  assert.equal(f.joins, 0); assert.equal(f.node.streams.length, 0); assert.equal(f.node.updates.length, 0);
  assert.equal(f.audio.size, 0); await f.close();
});

test('failed plugin handshakes and failed publications release owned voice and audio', async () => {
  for (const fail of ['plugin', 'publication']) {
    const f = fixture(); const player = f.manager.createPlayer('100');
    f.node.failAudio = fail === 'plugin'; f.connection.fail = fail === 'publication';
    await assert.rejects(player.connect('200'), /mock/);
    assert.equal(f.audio.size, 0); assert.equal(f.voice.size, 0); assert.deepEqual(f.left, ['100']);
    assert.equal(f.node.closes, fail === 'publication' ? 1 : 0); await f.close();
  }
});

test('a broken audio stream freezes connection state, retries, and preserves the playing track and queue', async () => {
  const f = fixture({ attempts: 3, delayMs: 1 }); const player = f.manager.createPlayer('100');
  await player.connect('200'); player.enqueue([mockTrack('one'), mockTrack('two')]); await player.play();
  const controls = f.node.updates.length;
  f.node.streams[0]!.destroy(new Error('mock lost HTTP stream'));
  await until(() => f.node.streams.length === 2 && player.state?.connected === true);
  assert.equal(f.joins, 1); assert.equal(f.node.updates.length, controls);
  assert.equal(player.current?.info.title, 'one'); assert.equal(player.queueSize, 1);
  assert.equal(f.node.closes, 1); assert.equal(f.errors.length, 1); await f.close(); assert.equal(f.node.closes, 2);
});

test('audio interruption without retries still closes the HTTP source and marks the player disconnected', async () => {
  const f = fixture(); const player = f.manager.createPlayer('100');
  await player.connect('200'); f.connection.emit('error', new Error('mock voice failure'));
  await until(() => f.node.closes === 1);
  assert.equal(player.state?.connected, false); assert.equal(f.connection.playing, false); await f.close();
});

test('fresh Lavalink sessions reopen audio and recover playback without consuming queued tracks', async () => {
  const f = fixture(); const player = f.manager.createPlayer('100');
  await player.connect('200'); player.enqueue([mockTrack('one'), mockTrack('two')]); await player.play();
  await player.pause(); await player.setVolume(42);
  f.node.emitLifecycle({ type: 'ready', sessionID: 'fresh', resumed: false }); await f.manager.drain();
  assert.equal(f.node.streams.length, 2); assert.equal(f.node.closes, 1);
  assert.equal(player.state?.connected, true); assert.equal(player.current?.info.title, 'one');
  assert.equal(player.queueSize, 1); assert.equal(player.volume, 42); assert.equal(player.isPaused, true);
  await f.close();
});

test('resumed sessions reopen failed audio without replaying tracks', async () => {
  const f = fixture(); const player = f.manager.createPlayer('100');
  await player.connect('200'); player.enqueue(mockTrack('one')); await player.play();
  f.node.streams[0]!.end(); await until(() => player.state?.connected === false);
  const controls = f.node.updates.length;
  f.node.emitLifecycle({ type: 'ready', sessionID: 'resumed', resumed: true });
  await until(() => f.node.streams.length === 2 && player.state?.connected === true);
  assert.equal(f.node.updates.length, controls); assert.equal(player.current?.info.title, 'one'); await f.close();
});

test('bridge refuses taking over another native voice publication and rejects ambiguous music configuration', async () => {
  const f = fixture(); await f.voice.join('200');
  await assert.rejects(f.manager.createPlayer('100').connect('200'), { code: 'MUSIC_AUDIO_BUSY' });
  assert.equal(f.node.streams.length, 0); assert.equal(f.voice.size, 1);
  assert.throws(() => new MusicManager({ nodes: [f.node], audio: f.audio, voice: { async join() { throw new Error(); }, async leave() {} } }), { code: 'MUSIC_OPTIONS' });
  await f.close();
});

test('shutdown drains a pending native join and releases a connection which arrives after cancellation', async t => {
  const f = fixture(); const player = f.manager.createPlayer('100');
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  const join = f.voice.join.bind(f.voice);
  t.mock.method(f.voice, 'join', async (...args: Parameters<FluxerVoice['join']>) => { entered(); await gate; return join(...args); });
  const connecting = player.connect('200'); const rejected = assert.rejects(connecting, { code: 'EXECUTION_ABORTED' });
  await started; const closing = f.manager.close(); release(); await Promise.all([rejected, closing]);
  assert.equal(f.audio.size, 0); assert.equal(f.voice.size, 0); assert.equal(f.node.streams.length, 0);
  assert.deepEqual(f.left, ['100']); await f.close();
});

test('audio recovery is bounded, reports exhaustion, and can be retried explicitly', async () => {
  const f = fixture({ attempts: 2, delayMs: 1 }); const player = f.manager.createPlayer('100');
  await player.connect('200'); player.enqueue(mockTrack('one')); await player.play();
  f.node.failAudio = true; f.node.streams[0]!.end();
  await until(() => f.errors.length === 3);
  await delay(10); assert.equal(f.errors.length, 3); assert.equal(player.state?.connected, false);
  f.node.failAudio = false; await player.connect('200');
  assert.equal(player.state?.connected, true); assert.equal(player.current?.encoded, 'one');
  assert.equal(f.node.streams.length, 2); await f.close();
});

test('automatic queue advancement uses Lavalink end events and keeps one audio publication', async () => {
  const f = fixture(); const player = f.manager.createPlayer('100');
  await player.connect('200'); player.enqueue([mockTrack('one'), mockTrack('two')]); await player.play();
  f.node.emit({ op: 'event', type: 'TrackEndEvent', guildId: '100', reason: 'finished', track: f.node.players.get('100')!.track! });
  await player.drain(); assert.equal(player.current?.encoded, 'two'); assert.equal(player.queueSize, 0);
  assert.equal(f.node.streams.length, 1); assert.equal(f.connection.sources.length, 1); await f.close();
});

test('failed remote bootstrap disconnects audio before allowing another connection attempt', async () => {
  const f = fixture(); const player = f.manager.createPlayer('100');
  f.node.failNextUpdate = new Error('mock rejected bootstrap');
  await assert.rejects(player.connect('200'), /mock rejected bootstrap/);
  assert.equal(f.node.closes, 1); assert.equal(f.audio.size, 0); assert.equal(player.voiceChannelID, undefined);
  await player.connect('200'); assert.equal(player.state?.connected, true); await f.close();
});

test('bridge capacity rejects another guild without disturbing the active publication and releases its slot', async () => {
  const f = fixture(false, 1); const first = f.manager.createPlayer('100');
  await first.connect('200');
  await assert.rejects(f.manager.createPlayer('101').connect('201'), { code: 'MUSIC_AUDIO_LIMIT' });
  assert.equal(f.audio.size, 1); assert.equal(f.voice.size, 1); assert.equal(f.node.streams.length, 1);
  await first.destroy(); await f.manager.createPlayer('100').connect('200');
  assert.equal(f.node.streams.length, 2); assert.equal(f.node.closes, 1); await f.close();
});

test('closing reentrantly from an audio abort shares the same promise and leaves voice once', async t => {
  const f = fixture(); const open = f.node.openAudioStream.bind(f.node);
  let reentered: Promise<void> | undefined;
  t.mock.method(f.node, 'openAudioStream', async (guildID: string, signal?: AbortSignal) => {
    signal?.addEventListener('abort', () => { reentered = f.audio.close(); }, { once: true });
    return open(guildID, signal);
  });
  await f.manager.createPlayer('100').connect('200');
  const closing = f.audio.close(); assert.equal(f.audio.close(), closing); await closing;
  assert.equal(reentered, closing); assert.deepEqual(f.left, ['100']); assert.equal(f.node.closes, 1); await f.close();
});

test('many guilds share one bridge lifecycle subscription per node and release it after the last player', async t => {
  const client = new Client(), node = new Backend();
  Reflect.set(client.channels, 'fetch', async (id: string) => new VoiceChannel(client, { id, guild_id: String(Number(id) - 1000), type: 2, name: 'voice' }));
  const voice = new FluxerVoice(client, { async join() { return new Connection(); }, leave() {} });
  const audio = new FluxerLavalinkBridge({ voice, maxStreams: 16 });
  const manager = new MusicManager({ nodes: [node], audio });
  t.after(async () => { await manager.close(); await audio.close(); await voice.close(); await client.destroy(); });
  const players = Array.from({ length: 16 }, (_, index) => manager.createPlayer(String(index + 100)));
  await Promise.all(players.map((player, index) => player.connect(String(index + 1100))));
  assert.equal(node.lifecycleSubscriptionCount, 2); assert.equal(voice.size, 16); assert.equal(audio.size, 16);
  await Promise.all(players.slice(1).map(player => player.destroy())); assert.equal(node.lifecycleSubscriptionCount, 2);
  await players[0]!.destroy(); assert.equal(node.lifecycleSubscriptionCount, 1); assert.equal(audio.size, 0);
  assert.equal(node.closes, 16); await manager.close(); assert.equal(node.lifecycleSubscriptionCount, 0);
});

test('shutdown cancels a pending voice publication and stops it if setup finishes after leaving', async t => {
  const f = fixture(); let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  t.mock.method(f.connection, 'play', async () => { entered(); await gate; f.connection.playing = true; });
  const connecting = f.manager.createPlayer('100').connect('200');
  const rejected = assert.rejects(connecting, { code: 'EXECUTION_ABORTED' }); await started;
  try {
    await Promise.race([f.manager.close(), delay(500).then(() => assert.fail('shutdown waited for a cancelled publication'))]);
    assert.equal(f.audio.size, 0); assert.equal(f.voice.size, 0); assert.equal(f.node.closes, 1);
  } finally { release(); }
  await rejected; await delay(0);
  assert.equal(f.connection.playing, false); assert.equal(f.connection.listenerCount('error'), 0); await f.close();
});
