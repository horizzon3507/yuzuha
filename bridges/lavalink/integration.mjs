import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { Client, VoiceChannel } from '@fluxerjs/core';
import { FluxerVoice, FluxerLavalinkBridge, LavalinkNode, MusicManager } from '../../dist/music.js';

const root = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(root, '../..');
const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
const pluginJar = join(root, `build/yuzuha-audio-${manifest.version}.jar`);
const serverJar = process.env.YUZUHA_LAVALINK_JAR ? resolve(process.env.YUZUHA_LAVALINK_JAR) : join(root, 'build/Lavalink-4.2.2.jar');
const voicePath = process.env.YUZUHA_VOICE_MODULE ? resolve(process.env.YUZUHA_VOICE_MODULE) : createRequire(import.meta.url).resolve('@fluxerjs/voice');
const { LiveKitRtcConnection } = await import(pathToFileURL(voicePath).href);
const voiceRequire = createRequire(voicePath);
const voiceManifest = JSON.parse(await readFile(join(dirname(dirname(voicePath)), 'package.json'), 'utf8'));
const { AudioSource, dispose } = voiceRequire('@livekit/rtc-node');
const captureDescriptor = Object.getOwnPropertyDescriptor(AudioSource.prototype, 'captureFrame');
const queuedDescriptor = Object.getOwnPropertyDescriptor(AudioSource.prototype, 'queuedDuration');
const captured = [];
Object.defineProperty(AudioSource.prototype, 'queuedDuration', { configurable: true, get() { return 0; } });
Object.defineProperty(AudioSource.prototype, 'captureFrame', { configurable: true, value: async function(frame) {
  assert.equal(frame.sampleRate, 48000); assert.equal(frame.channels, 1);
  captured.push({ at: performance.now(), samples: new Int16Array(frame.data) });
} });

const run = await mkdtemp(join(tmpdir(), 'yuzuha-audio-integration-'));
const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const url = `http://127.0.0.1:${port}`;
const password = 'offline-test-not-a-bot-token';
let server, logs = '', manager, bridge, voice, node;
const client = new Client();
const failures = [];
async function until(predicate, description, timeout = 10_000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) { if (await predicate()) return; await delay(20); }
  throw new Error(`Timed out: ${description}\n${JSON.stringify(failures)}\n${logs.slice(-8000)}`);
}
async function startServer() {
  server = spawn('java', ['-Xms64m', '-Xmx256m', '-jar', serverJar], { cwd: run, stdio: ['ignore', 'pipe', 'pipe'] });
  const append = data => { logs = (logs + data.toString()).slice(-100_000); };
  server.stdout.on('data', append); server.stderr.on('data', append);
  await until(async () => {
    if (server.exitCode !== null) throw new Error(`Lavalink exited ${server.exitCode}\n${logs}`);
    try { return (await fetch(`${url}/v4/yuzuha/info`, { headers: { Authorization: password }, signal: AbortSignal.timeout(300) })).ok; }
    catch { return false; }
  }, 'local Lavalink startup', 20_000);
}
async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const exited = once(server, 'exit'); server.kill('SIGTERM');
  const timer = setTimeout(() => server.kill('SIGKILL'), 4000); timer.unref();
  try { await exited; } finally { clearTimeout(timer); }
}
function rms(start, end) {
  let sum = 0, count = 0;
  for (const frame of captured) if (frame.at >= start && frame.at < end) {
    for (const sample of frame.samples) { sum += sample * sample; count++; }
  }
  assert.ok(count > 4800, 'at least 100 ms of decoded PCM');
  return Math.sqrt(sum / count);
}
try {
  await mkdir(join(run, 'plugins'));
  await copyFile(pluginJar, join(run, `plugins/yuzuha-audio-${manifest.version}.jar`));
  await writeFile(join(run, 'application.yml'), `server:\n  address: 127.0.0.1\n  port: ${port}\nlavalink:\n  server:\n    password: ${password}\n    sources:\n      youtube: false\n      bandcamp: false\n      soundcloud: false\n      twitch: false\n      vimeo: false\n      nico: false\n      http: false\n      local: true\n    frameBufferDurationMs: 400\n    playerUpdateInterval: 1\nlogging:\n  level:\n    root: WARN\nplugins:\n  yuzuha-audio:\n    max-streams: 2\n`);
  const wav = Buffer.alloc(44 + 48000 * 8 * 4);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(192000, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  for (let i = 0; i < 48000 * 8; i++) {
    wav.writeInt16LE(Math.round(12000 * Math.sin(i * Math.PI * 880 / 48000)), 44 + i * 4);
    wav.writeInt16LE(Math.round(12000 * Math.sin(i * Math.PI * 1320 / 48000)), 46 + i * 4);
  }
  const tone = join(run, 'tone.wav'); await writeFile(tone, wav);
  await startServer();
  assert.equal((await fetch(`${url}/v4/yuzuha/info`)).status, 401);
  assert.equal((await fetch(`${url}/v4/yuzuha/info`, { headers: { Authorization: 'incorrect' } })).status, 403);
  node = new LavalinkNode({ url, password, userID: '123456789', reconnect: { attempts: 60, delayMs: 250, maxDelayMs: 1000 } });
  node.on('nodeError', error => failures.push(String(error)));
  await node.connect();
  const info = await node.getInfo(); assert.equal(info.version.semver, '4.2.2');
  assert.ok(info.plugins.some(plugin => plugin.name === 'yuzuha-audio' && plugin.version === manifest.version));
  const channel = new VoiceChannel(client, { id: '200', guild_id: '100', type: 2, name: 'offline' });
  Reflect.set(client.channels, 'fetch', async () => channel);
  let publications = 0, leaves = 0;
  const connections = [];
  voice = new FluxerVoice(client, { async join() {
    const connection = new LiveKitRtcConnection(client, channel, '123456789');
    Reflect.set(connection, 'room', { isConnected: true, localParticipant: { async publishTrack() { publications++; } } });
    connections.push(connection); return connection;
  }, leave() { leaves++; } });
  bridge = new FluxerLavalinkBridge({ voice, reconnect: { attempts: 60, delayMs: 250, maxDelayMs: 1000 } });
  manager = new MusicManager({ nodes: [node], audio: bridge, onError: error => failures.push(String(error)) });
  const player = manager.createPlayer('100'); await player.connect('200');
  const output = () => fetch(`${url}/v4/yuzuha/info`, { headers: { Authorization: password } }).then(response => response.json());
  assert.equal((await output()).activeStreams, 1);
  const load = await manager.search(tone); assert.equal(load.loadType, 'track');
  player.enqueue([load.data, load.data]); await player.play();
  const start = performance.now(); await delay(600); const audible = rms(start + 200, performance.now());
  assert.ok(audible > 1000, `real SDK decoded audible samples: ${audible}`);
  await player.pause(); const pauseAt = performance.now(); const pausePosition = (await node.getPlayer('100')).state.position;
  await delay(600); const silent = rms(pauseAt + 200, performance.now());
  assert.ok(silent < 20, `paused output is silence: ${silent}`);
  assert.equal((await node.getPlayer('100')).state.position, pausePosition);
  await player.pause(false); await player.setVolume(0); const muteAt = performance.now(); await delay(800);
  const muted = rms(muteAt + 500, performance.now()); assert.ok(muted < 20, `server volume reaches SDK: ${muted}`);
  await player.setVolume(100); await player.setFilters({ timescale: { speed: 1.1 } });
  assert.equal((await node.getPlayer('100')).filters.timescale.speed, 1.1);
  await player.seek(7800);
  await until(() => player.queueSize === 0, 'real TrackEndEvent advances the next track');
  assert.equal(player.current.encoded, load.data.encoded); assert.equal(publications, 1);
  await player.pause(); await player.setVolume(42);
  const oldSession = node.sessionID; let recovered = 0; player.on('recovered', () => { recovered++; });
  await stopServer(); await startServer();
  await until(() => node.sessionID !== oldSession && recovered > 0 && player.state.connected, 'fresh session restores audio and player', 15_000);
  assert.equal(player.volume, 42); assert.equal(player.isPaused, true); assert.equal(player.queueSize, 0);
  assert.equal(player.current.encoded, load.data.encoded); assert.equal(node.diagnostics.activeAudioStreams, 1);
  await player.pause(false); const recoveryAt = performance.now(); await delay(700);
  const recoveredRms = rms(recoveryAt + 300, performance.now()); assert.ok(recoveredRms > 100, 'recovered real audio reaches the SDK');
  const duplicate = await fetch(`${url}/v4/yuzuha/sessions/${node.sessionID}/players/100/audio`, { headers: { Authorization: password } });
  assert.equal(duplicate.status, 409); await duplicate.body.cancel();
  const extra = await node.openAudioStream('101');
  await assert.rejects(node.openAudioStream('102'), { code: 'LAVALINK_AUDIO_LIMIT' });
  await extra.close();
  await manager.close(); await bridge.close(); await voice.close();
  await until(async () => (await output()).activeStreams === 0, 'server releases every output');
  assert.equal(node.diagnostics.activeAudioStreams, 0); assert.equal(bridge.size, 0); assert.equal(voice.size, 0); assert.equal(leaves, 1);
  assert.ok(connections.every(connection => connection.listenerCount('error') === 0 && connection.listenerCount('disconnect') === 0));
  const sourceHashes = {};
  for (const path of ['dist/infrastructure/lavalink/node.js', 'dist/infrastructure/lavalink/audio-stream.js',
    'dist/infrastructure/fluxer/lavalink-bridge.js', 'dist/infrastructure/fluxer/voice.js', 'dist/services/music.js', 'dist/services/music-player.js',
    'bridges/lavalink/src/AudioController.java', 'bridges/lavalink/src/WebmOpus.java']) {
    sourceHashes[path] = createHash('sha256').update(await readFile(join(packageRoot, path))).digest('hex');
  }
  const report = { date: new Date().toISOString(), version: manifest.version, node: process.versions.node,
    lavalink: info.version.semver, voice: voiceManifest.version,
    serverSha256: createHash('sha256').update(await readFile(serverJar)).digest('hex'),
    pluginSha256: createHash('sha256').update(await readFile(pluginJar)).digest('hex'), sourceHashes,
    boundary: 'real Lavalink + plugin + Yuzuha + official SDK decoder; mocked LiveKit publication',
    decodedFrames: captured.length, audibleRms: audible, pausedRms: silent, mutedRms: muted, recoveredRms,
    publications, recovered, checks: ['authentication', 'real Opus decoding', 'pause', 'volume', 'filters', 'seek', 'automatic queue advance', 'server restart recovery', 'duplicate and capacity limits', 'resource cleanup'] };
  if (process.env.YUZUHA_AUDIO_REPORT) await writeFile(resolve(process.env.YUZUHA_AUDIO_REPORT), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await manager?.close().catch(() => {}); await bridge?.close().catch(() => {}); await voice?.close().catch(() => {});
  await node?.close(); await client.destroy(); await stopServer();
  Object.defineProperty(AudioSource.prototype, 'captureFrame', captureDescriptor);
  Object.defineProperty(AudioSource.prototype, 'queuedDuration', queuedDescriptor);
  dispose();
  await rm(run, { recursive: true, force: true });
}
