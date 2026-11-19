import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Client, VoiceChannel } from '@fluxerjs/core';
import { Yuzuha, MemoryStore } from '../src/index.js';
import { EventContext } from '../src/commands/event-context.js';
import { functions } from '../src/functions.js';
import { FluxerVoice } from '../src/infrastructure/fluxer/voice.js';
import { MockTransport } from '../src/testing.js';
import type { VoiceEvent, VoiceEventName } from '../src/domain/events.js';

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const names: VoiceEventName[] = ['voiceReady', 'voiceDisconnect', 'voiceError', 'voiceServerLeave', 'voiceSpeakerStart', 'voiceSpeakerStop'];
class Connection extends EventEmitter {
  playing = false;
  async play(): Promise<void> {}
  stop(): void {}
}

function fixture(configured = true) {
  const client = new Client(), connection = new Connection(), transport = new MockTransport(), errors: unknown[] = [];
  Reflect.set(client.channels, 'fetch', async () => new VoiceChannel(client, { id: '300', guild_id: '100', type: 2, name: 'voz' }));
  const voice = new FluxerVoice(client, { async join() { connection.emit('ready'); return connection; },
    leave() { connection.emit('disconnect'); } });
  const lifecycle = { subscriptions: 0, unsubscriptions: 0 }, subscribe = voice.subscribe.bind(voice);
  voice.subscribe = listener => {
    lifecycle.subscriptions++;
    const dispose = subscribe(listener);
    return () => { lifecycle.unsubscriptions++; dispose(); };
  };
  const bot = new Yuzuha({ client, transport, store: new MemoryStore(), scheduler: false, http: false,
    engine: functions(), ...(configured ? { voice } : {}), onError: error => { errors.push(error); } });
  return { client, connection, transport, voice, bot, errors, lifecycle,
    async [Symbol.asyncDispose]() { await bot.destroy(); await voice.close(); } };
}

test('eventos do driver chegam a scripts com IDs, ator e erros normalizados sem dados brutos', async () => {
  await using f = fixture();
  const snapshots: { fields: unknown[]; args: unknown; actor: string }[] = [];
  const normalized: Readonly<VoiceEvent>[] = [];
  const unsubscribe = f.voice.subscribe(event => normalized.push(event));
  f.bot.plugin({ name: 'capturarVoz', functions: [{ name: 'captureVoice', category: 'test', usage: '$captureVoice',
    description: 'Captura offline.', minArgs: 6, maxArgs: 6, execute: async c => {
      assert.ok(c.ctx instanceof EventContext);
      assert.ok(Object.isFrozen(c.ctx.event));
      snapshots.push({ fields: await c.all(), args: c.ctx.eventArgs, actor: c.ctx.authorID }); return '';
    } }] });
  for (const event of names) f.bot.scriptEvent({ event, code: '$captureVoice[$eventName;$eventGuildID;$eventChannelID;$eventUserID;$eventErrorCode;$eventErrorMessage]' });
  await f.voice.join('300'); await flush();
  const secret = 'token=segredo endpoint=wss://secreto sessionID=sessao';
  f.connection.emit('error', Object.assign(new Error(secret), { code: 'ECONNRESET', token: secret, endpoint: secret, sessionID: secret }));
  f.connection.emit('serverLeave', { token: secret });
  f.connection.emit('speakerStart', { participantId: '2', token: secret, samples: new Int16Array([1]) });
  f.connection.emit('speakerStop', { participantId: '2', endpoint: secret });
  f.connection.emit('disconnect', { sessionId: secret }); await flush();
  assert.deepEqual(snapshots.map(value => value.fields), [
    ['voiceReady', '100', '300', null, null, null],
    ['voiceError', '100', '300', null, 'ECONNRESET', 'Falha na conexão de voz.'],
    ['voiceServerLeave', '100', '300', null, null, null],
    ['voiceSpeakerStart', '100', '300', '2', null, null],
    ['voiceSpeakerStop', '100', '300', '2', null, null],
    ['voiceDisconnect', '100', '300', null, null, null],
  ]);
  assert.deepEqual(snapshots.map(value => value.actor), ['', '', '', '2', '2', '']);
  for (const event of normalized) {
    assert.ok(Object.isFrozen(event));
    assert.deepEqual(Object.keys(event).sort(), ['channelID', 'errorCode', 'errorMessage', 'guildID', 'name', 'userID']);
  }
  assert.equal(JSON.stringify(snapshots).includes('segredo'), false);
  assert.equal(JSON.stringify(normalized).includes('sessao'), false);
  assert.equal(f.voice.get('100'), undefined);
  assert.equal(f.connection.eventNames().length, 0);
  assert.deepEqual(f.errors, []); unsubscribe(); unsubscribe();
});

test('códigos desconhecidos e mensagens com credenciais nunca são repassados', async () => {
  await using f = fixture();
  f.bot.scriptEvent({ event: 'voiceError', channelID: '200', code: '$eventErrorCode: $eventErrorMessage' });
  await f.voice.join('300');
  f.connection.emit('error', Object.assign(new Error('https://segredo/token'), { code: 'token-secreto' })); await flush();
  assert.equal(f.transport.messages.at(-1)?.payload.content, 'VOICE_STATE: Falha na conexão de voz.');
  assert.equal(f.transport.messages.at(-1)?.channelID, '200'); assert.deepEqual(f.errors, []);
});

test('speaker limita rajadas a 20 eventos por segundo/conexão e recusa identidades inválidas', async () => {
  await using f = fixture();
  f.bot.scriptEvent({ event: 'voiceSpeakerStart', channelID: '200', code: '$eventUserID' });
  f.bot.scriptEvent({ event: 'voiceSpeakerStop', channelID: '200', code: '$eventUserID' });
  await f.voice.join('300');
  f.connection.emit('speakerStart', { participantId: 'token=secreto' });
  f.connection.emit('speakerStart', { participantId: '1'.repeat(129) });
  f.connection.emit('speakerStart', null);
  for (let i = 0; i < 80; i++) f.connection.emit(i % 2 ? 'speakerStart' : 'speakerStop', { participantId: '2' });
  await flush();
  assert.equal(f.transport.messages.length, 20);
  assert.ok(f.transport.messages.every(message => message.payload.content === '2'));
  assert.deepEqual(f.errors, []);
});

test('once, descarte de plugin e close removem assinaturas sem listeners no Client', async () => {
  await using f = fixture();
  f.bot.scriptEvent({ event: 'voiceReady', once: true, channelID: '200', code: 'pronto' });
  f.bot.plugin({ name: 'vozDescartavel', scriptEvents: [{ event: 'voiceServerLeave', channelID: '200', code: 'saiu' }] });
  assert.equal(f.voice.listenerCount('voiceEvent'), 1);
  assert.equal(f.lifecycle.subscriptions, 1);
  assert.equal(f.client.listenerCount('voiceReady'), 0);
  await f.voice.join('300'); f.connection.emit('ready'); await flush();
  assert.equal(f.transport.messages.length, 1);
  await f.bot.unplugin('vozDescartavel');
  f.connection.emit('serverLeave'); await flush(); assert.equal(f.transport.messages.length, 1);
  await f.bot.destroy();
  assert.equal(f.lifecycle.unsubscriptions, 1);
  assert.equal(f.voice.listenerCount('voiceEvent'), 0); assert.equal(f.connection.eventNames().length, 0);
  f.connection.emit('ready'); await flush(); assert.equal(f.transport.messages.length, 1);
  const dispose = f.voice.subscribe(() => assert.fail('assinatura após close'));
  assert.equal(f.voice.listenerCount('voiceEvent'), 0); dispose();
});

test('sem voz configurada eventos de voz ficam inativos e eventos Client continuam funcionando', async () => {
  await using f = fixture(false);
  for (const event of names) f.bot.scriptEvent({ event, channelID: '200', code: 'não executar' });
  f.bot.scriptEvent({ event: 'guildMemberAdd', channelID: '200', code: '$eventGuildID' });
  assert.equal(f.voice.listenerCount('voiceEvent'), 0);
  assert.equal(f.lifecycle.subscriptions, 0);
  for (const name of names) assert.equal(f.client.listenerCount(name), 0);
  await f.voice.join('300'); f.connection.emit('speakerStart', { participantId: '2' }); await flush();
  assert.equal(f.transport.messages.length, 0);
  f.client.emit('guildMemberAdd', { guild: { id: '100' }, id: '2', user: { bot: false } } as never); await flush();
  assert.equal(f.transport.messages.at(-1)?.payload.content, '100'); assert.deepEqual(f.errors, []);
});

test('falha de join publica erro normalizado sem emitir ready; close direto remove assinatura', async () => {
  const client = new Client(), events: Readonly<VoiceEvent>[] = [];
  Reflect.set(client.channels, 'fetch', async () => new VoiceChannel(client, { id: '300', guild_id: '100', type: 2, name: 'voz' }));
  const error = new Error('endpoint=wss://secreto token=segredo sessionID=sessao');
  const voice = new FluxerVoice(client, { async join() { throw error; }, leave() {} });
  try {
    const unsubscribe = voice.subscribe(event => events.push(event));
    await assert.rejects(voice.join('300'), error);
    assert.deepEqual(events, [{ name: 'voiceError', guildID: '100', channelID: '300', userID: null,
      errorCode: 'VOICE_STATE', errorMessage: 'Falha na conexão de voz.' }]);
    await voice.close();
    assert.equal(voice.listenerCount('voiceEvent'), 0); unsubscribe();
    assert.equal(voice.size, 0);
  } finally { await voice.close(); await client.destroy(); }
});
