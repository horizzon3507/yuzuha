import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CommandContext } from '../src/commands/context.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import { Runtime, defaultLimits, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage } from '../src/testing.js';
import { VoiceStateTracker } from '../src/services/voice-states.js';
import type { NativeVoice } from '../src/ports/voice.js';

function fixture(options: { unavailable?: boolean; dm?: boolean } = {}) {
  const transport = new MockTransport(), states = new VoiceStateTracker();
  const connection = Object.assign(new EventEmitter(), { playing: false, playingVideo: false,
    volume: 100, async play() {}, stop() { this.playing = false; this.playingVideo = false; },
    setVolume(n: number) { this.volume = n; }, getVolume() { return this.volume; }, isConnected() { return true; } });
  let channel: string | undefined;
  const updates: unknown[] = [];
  const voice: NativeVoice = { subscribe: () => () => {}, channelID: () => channel, get: () => channel ? connection : undefined,
    async join(id, opts) { assert.equal(opts?.guildID, '100'); channel = id; return connection; },
    async play() {}, stop() { if (!channel) throw new Error('sem conexão'); connection.stop(); },
    setVolume(_guild, value) { connection.setVolume(value); },
    async updateVoiceState(_guild, partial) { updates.push(partial); },
    async leave() { const was = !!channel; channel = undefined; return was; }, async close() {} };
  const message = mockMessage('!voice');
  if (options.dm) message.guildID = '';
  const ctx = new CommandContext({ message, command: { name: 'voice' }, transport,
    store: new MemoryStore(), cooldown: () => 0,
    ...(options.unavailable ? {} : { voice, voiceStates: states }) });
  const runtime = registerBuiltins(new Runtime(defaultLimits));
  return { transport, states, connection, updates, run: (code: string) => runtime.execute(runtime.compile(code), ctx) };
}

test('leituras de voz normalizam, ocultam sessão e aceitam estado vazio', async () => {
  const f = fixture();
  assert.equal(await f.run('$voiceState'), null);
  assert.equal(await f.run('$voiceChannelOf'), '');
  assert.deepEqual(await f.run('$voiceMembers'), []);
  assert.deepEqual(await f.run('$voiceStates'), []);
  f.states.apply({ guildID: '100', userID: '1', channelID: '300', sessionID: 'segredo', selfMute: true });
  const state = await f.run('$voiceState') as Record<string, unknown>;
  assert.equal(state.selfMute, true); assert.equal(state.userID, '1');
  assert.equal('sessionID' in state, false);
  assert.equal(await f.run('$voiceChannelOf[1]'), '300');
  assert.deepEqual(await f.run('$voiceMembers[300]'), [state]);
  assert.deepEqual(await f.run('$voiceStates'), [state]);
  await assert.rejects(f.run('$voiceState[inválido]'));
  await assert.rejects(f.run('$voiceMembers[inválido]'));
  for (let i = 2; i <= 1010; i++) f.states.apply({ guildID: '100', channelID: '300', userID: String(i) });
  assert.equal((await f.run('$voiceStates') as unknown[]).length, 100);
});

test('conexão, status, volume, estado e saída usam contrato seguro', async () => {
  const f = fixture();
  assert.equal(await f.run('$botVoiceChannel'), '');
  assert.equal((await f.run('$voiceStatus') as { connected: boolean }).connected, false);
  assert.equal(await f.run('$voiceVolume'), null);
  assert.equal(await f.run('$voiceLeave'), false);
  await assert.rejects(f.run('$voiceJoin'));
  f.states.apply({ guildID: '100', userID: '1', channelID: '300' });
  assert.equal(await f.run('$voiceJoin'), '300');
  assert.equal(await f.run('$botVoiceChannel'), '300');
  assert.equal(await f.run('$voiceVolume[25]'), 25);
  assert.equal(await f.run('$voiceVolume'), 25);
  assert.deepEqual(await f.run('$voiceStatus'), { connected: true, channelID: '300', guildID: '100', playing: false, playingVideo: false, volume: 25 });
  await f.run('$botVoiceState[true;false]');
  assert.deepEqual(f.updates, [{ self_mute: true, self_deaf: false }]);
  f.connection.playing = true; f.connection.playingVideo = true;
  await f.run('$voiceStop'); assert.equal(f.connection.playing || f.connection.playingVideo, false);
  for (const code of ['$voiceVolume[-1]', '$voiceVolume[201]', '$voiceVolume[1.5]', '$voiceVolume[nan]', '$botVoiceState[sim]', '$voiceLeave[301]', '$voiceJoin[abc]']) await assert.rejects(f.run(code));
  assert.equal(await f.run('$voiceLeave[300]'), true);
});

test('autor e bot precisam de permissões de canal; controles não são engolidos por try', async () => {
  const f = fixture();
  f.transport.setMember('100', { id: '1', owner: false, permissions: 0n, rank: 1 });
  await assert.rejects(f.run('$try[$voiceJoin[300];oculto]'), { code: 'GUARD', reason: 'PERMISSION_MISSING_AUTHOR' });
  f.transport.setMember('100', { id: '1', owner: true, permissions: 0n, rank: 100 });
  f.transport.setMember('100', { id: '999', owner: false, permissions: 0n, rank: 90 });
  await assert.rejects(f.run('$voiceJoin[300]'), { code: 'GUARD', reason: 'PERMISSION_MISSING_BOT' });
  f.transport.setMember('100', { id: '999', owner: true, permissions: 0n, rank: 90 });
  await f.run('$voiceJoin[300]');
  f.transport.setMember('100', { id: '1', owner: false, permissions: 0n, rank: 1 });
  for (const code of ['$voiceLeave', '$voiceStop', '$voiceVolume', '$botVoiceState[true]']) await assert.rejects(f.run(code), { code: 'GUARD', reason: 'PERMISSION_MISSING_AUTHOR' });
  f.states.apply({ guildID: '100', userID: '1', channelID: '300' });
  assert.equal(await f.run('$voiceVolume[20]'), 20);
});

test('todas as funções rejeitam DM e serviço indisponível', async () => {
  const codes = ['$voiceState', '$voiceChannelOf', '$voiceMembers', '$voiceStates', '$botVoiceChannel', '$voiceJoin[300]', '$voiceLeave', '$voiceStatus', '$voiceStop', '$voiceVolume', '$botVoiceState'];
  for (const code of codes) {
    await assert.rejects(fixture({ dm: true }).run(code), { code: 'GUARD', reason: 'NOT_IN_GUILD' });
    await assert.rejects(fixture({ unavailable: true }).run(code), (error: unknown) => {
      const value = error as { code?: string; cause?: { code?: string } };
      return value.code === 'NATIVE_UNAVAILABLE' || value.cause?.code === 'NATIVE_UNAVAILABLE';
    });
  }
});
