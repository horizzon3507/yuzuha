import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, Events } from '@fluxerjs/core';
import type { Channel, Guild, Message } from '@fluxerjs/core';
import {
  CommandContext,
  MemoryStore,
  VoiceStateTracker,
  Yuzuha,
  defineCommand,
  isYuzuhaError,
} from '../src/index.js';
import { MockTransport, createTestBot, mockMessage } from '../src/testing.js';

test('VoiceStateTracker rastreia entrada, troca de canal, saída e flags em wire e camelCase', async t => {
  const client = new Client();
  const bot = new Yuzuha({
    client,
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    variables: false,
  });
  t.after(() => bot.destroy());

  assert.equal(bot.voiceStates.size, 0);
  assert.equal(bot.voiceStates.get('g1', 'u1'), undefined);
  assert.equal(bot.voiceStates.userChannel('g1', 'u1'), null);
  assert.deepEqual(bot.voiceStates.guild('g1'), []);
  assert.deepEqual(bot.voiceStates.channel('g1', 'vc1'), []);

  // Entrada (wire format do gateway)
  client.emit(Events.VoiceStateUpdate, {
    guild_id: 'g1',
    channel_id: 'vc1',
    user_id: 'u1',
    session_id: 'sess-1',
    mute: false,
    deaf: false,
    self_mute: true,
    self_deaf: false,
    self_stream: true,
    self_video: false,
    suppress: false,
    request_to_speak_timestamp: '2026-05-10T12:00:00.000Z',
  } as never);

  assert.equal(bot.voiceStates.size, 1);
  assert.equal(bot.voiceStates.userChannel('g1', 'u1'), 'vc1');
  const first = bot.voiceStates.get('g1', 'u1');
  assert.deepEqual(first, {
    guildID: 'g1',
    channelID: 'vc1',
    userID: 'u1',
    sessionID: 'sess-1',
    mute: false,
    deaf: false,
    selfMute: true,
    selfDeaf: false,
    selfStream: true,
    selfVideo: false,
    suppress: false,
    requestToSpeakTimestamp: Date.parse('2026-05-10T12:00:00.000Z'),
  });

  // Cópia defensiva: mutar o retorno não corrompe o estado interno
  first!.channelID = 'mutated';
  assert.equal(bot.voiceStates.userChannel('g1', 'u1'), 'vc1');

  // Segundo usuário no mesmo servidor e troca de canal + flags do primeiro
  client.emit(Events.VoiceStateUpdate, {
    guild_id: 'g1',
    channel_id: 'vc1',
    user_id: 'u2',
    session_id: 'sess-2',
    mute: true,
    deaf: true,
    self_mute: false,
    self_deaf: true,
    self_stream: false,
    self_video: true,
    suppress: true,
  } as never);
  assert.equal(bot.voiceStates.size, 2);
  assert.equal(bot.voiceStates.channel('g1', 'vc1').length, 2);

  // Troca de canal de u1 (vc1 -> vc2)
  client.emit(Events.VoiceStateUpdate, {
    guild_id: 'g1',
    channel_id: 'vc2',
    user_id: 'u1',
    session_id: 'sess-1',
    mute: true,
    deaf: false,
    self_mute: false,
    self_deaf: false,
    self_stream: false,
    self_video: true,
    suppress: false,
    request_to_speak_timestamp: null,
  } as never);

  assert.equal(bot.voiceStates.size, 2);
  assert.equal(bot.voiceStates.userChannel('g1', 'u1'), 'vc2');
  assert.deepEqual(bot.voiceStates.channel('g1', 'vc1').map(s => s.userID), ['u2']);
  assert.deepEqual(bot.voiceStates.channel('g1', 'vc2').map(s => s.userID), ['u1']);
  assert.equal(bot.voiceStates.get('g1', 'u1')?.mute, true);
  assert.equal(bot.voiceStates.get('g1', 'u1')?.selfVideo, true);
  assert.equal(bot.voiceStates.get('g1', 'u1')?.requestToSpeakTimestamp, null);

  // Saída com channel_id: null (wire) e channelId: null (camelCase)
  client.emit(Events.VoiceStateUpdate, {
    guild_id: 'g1',
    channel_id: null,
    user_id: 'u2',
    session_id: 'sess-2',
    mute: false,
    deaf: false,
    self_mute: false,
    self_deaf: false,
  } as never);
  assert.equal(bot.voiceStates.size, 1);
  assert.equal(bot.voiceStates.get('g1', 'u2'), undefined);
  assert.equal(bot.voiceStates.userChannel('g1', 'u2'), null);

  client.emit(Events.VoiceStateUpdate, {
    guildId: 'g1',
    channelId: null,
    userId: 'u1',
    sessionId: 'sess-1',
  } as never);
  assert.equal(bot.voiceStates.size, 0);
  assert.deepEqual(bot.voiceStates.guild('g1'), []);
});

test('VoiceStateTracker sincroniza voiceStatesSync e limpa estados em channelDelete, guildDelete e destroy', async () => {
  const client = new Client();
  const bot = new Yuzuha({
    client,
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    variables: false,
  });

  client.emit(Events.VoiceStatesSync, {
    guildId: 'g1',
    voiceStates: [
      { channel_id: 'vc1', user_id: 'u1', session_id: 's1', mute: false, deaf: false, self_mute: false, self_deaf: false },
      { channel_id: 'vc2', user_id: 'u2', session_id: 's2', mute: false, deaf: false, self_mute: true, self_deaf: false },
      { channel_id: null, user_id: 'u3', session_id: 's3', mute: false, deaf: false, self_mute: false, self_deaf: false },
    ],
  });
  client.emit(Events.VoiceStatesSync, {
    guildId: 'g2',
    voiceStates: [
      { channel_id: 'vc9', user_id: 'u9', session_id: 's9', mute: false, deaf: false, self_mute: false, self_deaf: false },
    ],
  });

  assert.equal(bot.voiceStates.size, 3);
  assert.equal(bot.voiceStates.guild('g1').length, 2);
  assert.equal(bot.voiceStates.guild('g2').length, 1);

  // channelDelete remove apenas quem estava no canal vc1
  client.emit(Events.ChannelDelete, { id: 'vc1', guildId: 'g1' } as unknown as Channel);
  assert.equal(bot.voiceStates.size, 2);
  assert.equal(bot.voiceStates.userChannel('g1', 'u1'), null);
  assert.equal(bot.voiceStates.userChannel('g1', 'u2'), 'vc2');

  // guildDelete remove todos os estados do servidor g1 sem afetar g2
  client.emit(Events.GuildDelete, { id: 'g1' } as unknown as Guild);
  assert.equal(bot.voiceStates.size, 1);
  assert.deepEqual(bot.voiceStates.guild('g1'), []);
  assert.equal(bot.voiceStates.userChannel('g2', 'u9'), 'vc9');

  // clear(guildID) manual
  client.emit(Events.VoiceStateUpdate, {
    guild_id: 'g3',
    channel_id: 'vc3',
    user_id: 'u3',
    session_id: 's3',
    mute: false,
    deaf: false,
    self_mute: false,
    self_deaf: false,
  } as never);
  assert.equal(bot.voiceStates.size, 2);
  bot.voiceStates.clear('g3');
  assert.equal(bot.voiceStates.size, 1);

  // destroy remove listeners e zera estados
  await bot.destroy();
  assert.equal(bot.voiceStates.size, 0);
  assert.equal(client.listenerCount(Events.VoiceStateUpdate), 0);
  assert.equal(client.listenerCount(Events.VoiceStatesSync), 0);
  assert.equal(client.listenerCount(Events.GuildDelete), 0);
  assert.equal(client.listenerCount(Events.ChannelDelete), 0);
  assert.equal(client.listenerCount(Events.Ready), 0);

  // Emissões após destroy não voltam a popular o rastreador
  client.emit(Events.VoiceStateUpdate, {
    guild_id: 'g2',
    channel_id: 'vc9',
    user_id: 'u9',
    session_id: 's9',
    mute: false,
    deaf: false,
    self_mute: false,
    self_deaf: false,
  } as never);
  assert.equal(bot.voiceStates.size, 0);
});

test('CommandContext e EventContext expõem ctx.voiceStates quando fornecido pelo bot', async t => {
  await using fixture = createTestBot({
    commands: [defineCommand({
      name: 'canalvoz',
      async run(ctx) {
        const ch = ctx.voiceStates.userChannel(ctx.requireGuild(), ctx.authorID);
        await ctx.reply(ch ?? 'fora-de-voz');
      },
    })],
  });

  await fixture.send('!canalvoz');
  assert.equal(fixture.messages.at(-1)?.payload.content, 'fora-de-voz');

  fixture.bot.client.emit(Events.VoiceStateUpdate, {
    guild_id: '100',
    channel_id: '777',
    user_id: '1',
    session_id: 'sess-cmd',
    mute: false,
    deaf: false,
    self_mute: false,
    self_deaf: false,
  } as never);

  await fixture.send('!canalvoz');
  assert.equal(fixture.messages.at(-1)?.payload.content, '777');

  // EventContext também recebe voiceStates
  let eventChannel: string | null = null;
  fixture.bot.contextEvent({
    event: 'messageDelete',
    channelID: '200',
    run(ctx) {
      eventChannel = ctx.voiceStates.userChannel('100', '1');
    },
  });
  fixture.bot.client.emit(Events.MessageDelete, {
    id: 'm1',
    channelId: '200',
    guildId: '100',
    author: { id: '1', username: 'Hory', bot: false },
    content: 'x',
  } as unknown as Message);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(eventChannel, '777');

  // CommandContext avulso sem voiceStates lança NATIVE_UNAVAILABLE
  const standalone = new CommandContext({
    message: mockMessage('!x'),
    transport: new MockTransport(),
    store: new MemoryStore(),
    command: { name: 'x' },
    cooldown: () => 0,
  });
  assert.throws(() => standalone.voiceStates, err => isYuzuhaError(err, 'NATIVE_UNAVAILABLE'));

  // Instância independente de VoiceStateTracker
  const customTracker = new VoiceStateTracker();
  customTracker.apply({ guildID: '100', channelID: '888', userID: '1' });
  const withTracker = new CommandContext({
    message: mockMessage('!x'),
    transport: new MockTransport(),
    store: new MemoryStore(),
    command: { name: 'x' },
    cooldown: () => 0,
    voiceStates: customTracker,
  });
  t.after(() => customTracker.clear());
  assert.equal(withTracker.voiceStates.userChannel('100', '1'), '888');
});
