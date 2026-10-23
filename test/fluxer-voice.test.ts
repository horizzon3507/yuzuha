import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Client, VoiceChannel } from '@fluxerjs/core';
import { FluxerVoice } from '../src/music.js';

class Connection extends EventEmitter {
  playing = false;
  volume = 100;
  readonly sources: (string | NodeJS.ReadableStream)[] = [];
  failPlay = false;
  async play(source: string | NodeJS.ReadableStream): Promise<void> {
    if (this.failPlay) { this.emit('error', new Error('mock playback failure')); return; }
    this.sources.push(source); this.playing = true;
  }
  stop(): void { this.playing = false; }
  setVolume(value: number): void { this.volume = value; }
}

test('native voice uses an injected official-style driver, joins once and forwards playback errors', async () => {
  const client = new Client(), connection = new Connection(), left: string[] = [], errors: unknown[] = [];
  const channel = new VoiceChannel(client, { id: '200', guild_id: '100', type: 2, name: 'voice' });
  Reflect.set(client.channels, 'fetch', async () => channel);
  let joins = 0;
  const voice = new FluxerVoice(client, { async join(input) { assert.equal(input, channel); joins++; return connection; }, leave(guildID) { left.push(guildID); } });
  voice.on('voiceError', (error, guildID) => { assert.equal(guildID, '100'); errors.push(error); });
  const joined = await Promise.all([voice.join('200'), voice.join('200')]); assert.equal(joined[0], joined[1]); assert.equal(joins, 1);
  await voice.play('100', 'https://example.com/track.webm'); assert.equal(connection.playing, true);
  voice.setVolume('100', 50); assert.equal(connection.volume, 50);
  assert.throws(() => voice.setVolume('100', 201), { code: 'VOICE_VOLUME' });
  connection.failPlay = true; await assert.rejects(voice.play('100', 'ignored'), /mock playback failure/); assert.equal(errors.length, 1);
  assert.equal(connection.listenerCount('error'), 1);
  voice.stop('100'); assert.equal(connection.playing, false);
  await voice.close(); assert.deepEqual(left, ['100']); assert.equal(connection.listenerCount('error'), 0);
  await assert.rejects(voice.join('200'), { code: 'VOICE_CLOSED' }); await client.destroy();
});

test('voice validates channel kind and refuses simultaneous channels in the same guild', async () => {
  const client = new Client(), connection = new Connection();
  Reflect.set(client.channels, 'fetch', async (id: string) => id === 'bad' ? { isVoice: () => false }
    : new VoiceChannel(client, { id, guild_id: '100', type: 2, name: 'voice' }));
  const voice = new FluxerVoice(client, { async join() { return connection; }, leave() {} });
  await assert.rejects(voice.join('bad'), { code: 'VOICE_CHANNEL' });
  await assert.rejects(voice.play('100', 'source'), { code: 'VOICE_NOT_CONNECTED' });
  await voice.join('200'); await assert.rejects(voice.join('201'), { code: 'VOICE_CHANNEL' });
  assert.equal(await voice.leave('100'), true); assert.equal(await voice.leave('100'), false);
  await voice.join('201'); assert.equal(voice.size, 1); await voice.close(); await client.destroy();
});

test('voice shutdown waits for a pending join and leaves the late connection', async () => {
  const client = new Client(), connection = new Connection();
  Reflect.set(client.channels, 'fetch', async () => new VoiceChannel(client, { id: '200', guild_id: '100', type: 2, name: 'voice' }));
  let release!: () => void, entered!: () => void, leaves = 0;
  const gate = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  const voice = new FluxerVoice(client, { async join() { entered(); await gate; return connection; }, leave() { leaves++; } });
  const joining = voice.join('200'); await started;
  const rejected = assert.rejects(joining, { code: 'VOICE_CLOSED' });
  const closing = voice.close(); assert.equal(voice.close(), closing); release();
  await Promise.all([rejected, closing]); assert.equal(leaves, 1); assert.equal(voice.size, 0); await client.destroy();
});

test('voice drops disconnected connections and prefers leaving only its own channel', async () => {
  const client = new Client(), connection = new Connection(), left: string[] = [];
  Reflect.set(client.channels, 'fetch', async () => new VoiceChannel(client, { id: '200', guild_id: '100', type: 2, name: 'voice' }));
  let joins = 0;
  const voice = new FluxerVoice(client, { async join() { joins++; return connection; },
    leave() { throw new Error('must not leave other channels'); }, leaveChannel(channelID) { left.push(channelID); } });
  await voice.join('200'); connection.emit('disconnect'); assert.equal(voice.get('100'), undefined);
  assert.equal(connection.listenerCount('error') + connection.listenerCount('disconnect'), 0);
  await voice.join('200'); assert.equal(joins, 2); await voice.close(); assert.deepEqual(left, ['200']); await client.destroy();
});
