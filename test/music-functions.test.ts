import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlags } from '@fluxerjs/core';
import { CommandContext } from '../src/commands/context.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import { Runtime, defaultLimits, registerBuiltins } from '../src/functions.js';
import { MusicManager } from '../src/services/music.js';
import { VoiceStateTracker } from '../src/services/voice-states.js';
import { MockMusicBackend, MockTransport, mockMessage, mockTrack } from '../src/testing.js';

function fixture(options: { dm?: boolean; unavailable?: boolean; queueLimit?: number; output?: number } = {}) {
  const backend = new MockMusicBackend(), transport = new MockTransport(), states = new VoiceStateTracker();
  const joins: string[] = [], leaves: string[] = [];
  const music = new MusicManager({ nodes: [backend], queueLimit: options.queueLimit, voice: {
    async join(_guild, channelId) { joins.push(channelId); return { channelId, token: 'segredo', endpoint: 'segredo', sessionId: 'segredo' }; },
    async leave(guild) { leaves.push(guild); },
  } });
  const message = mockMessage('!music'); if (options.dm) message.guildID = '';
  const context = () => new CommandContext({ message, command: { name: 'music' }, transport, store: new MemoryStore(),
    cooldown: () => 0, voiceStates: states, ...(options.unavailable ? {} : { music }) });
  const runtime = registerBuiltins(new Runtime({ ...defaultLimits, output: options.output ?? defaultLimits.output }));
  states.apply({ guildID: '100', userID: '1', channelID: '300' });
  backend.results.set('busca', { loadType: 'search', data: [mockTrack('a'), mockTrack('b'), mockTrack('c')] });
  const run = async (source: string) => runtime.execute(runtime.compile(source), context());
  return { backend, transport, states, music, joins, leaves, run, async [Symbol.asyncDispose]() { await music.close(); } };
}

function code(expected: string) {
  return (error: unknown) => {
    const value = error as { code?: string; cause?: { code?: string } };
    return value.code === expected || value.cause?.code === expected;
  };
}

const controls = ['$musicPause', '$musicResume', '$musicSkip', '$musicStop', '$musicRemove[1]', '$musicMove[1;2]',
  '$musicShuffle', '$musicClear', '$musicLoop[queue]', '$musicVolume[50]', '$musicSeek[10]', '$musicFilters[{}]'];
const functions = ['$musicSearch[busca]', '$musicPlay[busca]', '$musicNowPlaying', '$musicQueue', ...controls];

test('busca normaliza track/search/playlist, limita resultados e não revela blobs ou dados de plugin', async () => {
  await using f = fixture();
  const source = mockTrack('x', { pluginInfo: { secreto: true }, userData: { secreto: true }, encoded: 'blob-secreto' });
  f.backend.results.set('lista', { loadType: 'playlist', data: { info: { name: 'lista', selectedTrack: 0 }, pluginInfo: {}, tracks: Array.from({ length: 60 }, () => source) } });
  f.backend.results.set('faixa', { loadType: 'track', data: source });
  const result = await f.run('$musicSearch[lista;25]') as Record<string, unknown>[];
  assert.equal(result.length, 25); assert.equal(result[0]?.identifier, 'x');
  assert.equal('encoded' in result[0]!, false); assert.equal('pluginInfo' in result[0]!, false); assert.equal('userData' in result[0]!, false);
  assert.deepEqual(await f.run('$musicSearch[faixa]'), [result[0]]);
  assert.equal((await f.run('$musicSearch[busca;2]') as unknown[]).length, 2);
  assert.deepEqual(await f.run('$musicSearch[ausente]'), []);
  f.backend.results.set('erro', { loadType: 'error', data: { message: 'segredo do node', severity: 'fault', cause: 'segredo' } });
  await assert.rejects(f.run('$musicSearch[erro]'), code('MUSIC_LOAD'));
  assert.equal(f.music.size, 0);
});

test('play conecta uma vez, seleciona índice desde 1 e inicia somente quando ocioso', async () => {
  await using f = fixture();
  const selected = await f.run('$musicPlay[busca;2]') as Record<string, unknown>;
  assert.equal(selected.identifier, 'b'); assert.equal('encoded' in selected, false);
  const player = f.music.get('100')!;
  assert.equal(player.current?.info.identifier, 'b'); assert.deepEqual(f.joins, ['300']);
  await f.run('$musicPlay[busca]');
  assert.deepEqual(f.joins, ['300']); assert.equal(player.queueSize, 1);
  const current = await f.run('$musicNowPlaying') as { current: { identifier: string }; position: number; paused: boolean; volume: number; loop: string };
  assert.equal(current.current.identifier, 'b'); assert.equal(current.paused, false); assert.equal(current.volume, 100); assert.equal(current.loop, 'off');
  assert.ok(current.position >= 0);
  const queue = await f.run('$musicQueue') as { page: number; total: number; tracks: { identifier: string }[] };
  assert.equal(queue.total, 1); assert.equal(queue.page, 1); assert.equal(queue.tracks[0]?.identifier, 'a');
  assert.deepEqual(await f.run('$musicQueue[2]'), { page: 2, total: 1, tracks: [] });
  await f.run('$musicPause'); assert.equal(player.isPaused, true);
  await f.run('$musicResume'); assert.equal(player.isPaused, false);
  await f.run('$musicSeek[1000]'); assert.ok(player.position >= 1000);
  assert.equal(await f.run('$musicVolume[45]'), 45); assert.equal(await f.run('$musicVolume'), 45);
  assert.equal(await f.run('$musicLoop[queue]'), 'queue'); assert.equal(await f.run('$musicLoop'), 'queue');
  const next = await f.run('$musicSkip') as { identifier: string }; assert.equal(next.identifier, 'a');
  assert.equal(await f.run('$musicSkip'), null); assert.equal(player.current, null);
});

test('fila pagina no máximo 25, remove, move, embaralha, limpa e stop preserva fila opcionalmente', async () => {
  await using f = fixture();
  await f.run('$musicPlay[busca]'); const player = f.music.get('100')!;
  player.enqueue(Array.from({ length: 60 }, (_, i) => mockTrack(String(i))));
  const page = await f.run('$musicQueue[2]') as { tracks: { identifier: string }[] };
  assert.equal(page.tracks.length, 25); assert.equal(page.tracks[0]?.identifier, '25');
  await f.run('$musicMove[1;3]'); assert.equal(player.queue[2]?.info.identifier, '0');
  const removed = await f.run('$musicRemove[2;2]') as { identifier: string }[];
  assert.deepEqual(removed.map(t => t.identifier), ['2', '0']); assert.equal(player.queueSize, 58);
  const before = player.queue.map(t => t.info.identifier).sort();
  await f.run('$musicShuffle'); assert.deepEqual(player.queue.map(t => t.info.identifier).sort(), before);
  await f.run('$musicStop[false]'); assert.equal(player.current, null); assert.equal(player.queueSize, 58);
  await f.run('$musicClear'); assert.equal(player.queueSize, 0);
  player.enqueue(mockTrack('extra')); await f.run('$musicStop'); assert.equal(player.queueSize, 0);
});

test('filtros padrão aceitam números e estruturas conhecidas e rejeitam JSON ou campos inválidos', async () => {
  await using f = fixture(); await f.run('$musicPlay[busca]');
  assert.deepEqual(await f.run('$musicFilters'), {});
  const valid = { volume: 0.5, equalizer: [{ band: 0, gain: 0.2 }], timescale: { speed: 1.2, rate: 1, pitch: 1 },
    karaoke: { level: 1, monoLevel: 1, filterBand: 220, filterWidth: 100 }, tremolo: { frequency: 2, depth: 0.5 },
    vibrato: { frequency: 3, depth: 0.5 }, rotation: { rotationHz: 0.2 }, distortion: { sinScale: 1 },
    channelMix: { leftToRight: 0.3 }, lowPass: { smoothing: 10 } };
  assert.deepEqual(await f.run(`$musicFilters[${JSON.stringify(valid)}]`), valid);
  assert.deepEqual(await f.run('$musicFilters'), valid);
  const invalid = ['null', '[]', '1', '{', '{"unknown":1}', '{"__proto__":{}}', '{"timescale":{"speed":0}}',
    '{"timescale":{"speed":"1"}}', '{"timescale":{"extra":1}}', '{"volume":1e999}', '{"volume":null}',
    '{"equalizer":[{"band":0,"gain":2}]}', '{"equalizer":[{"band":0,"gain":0},{"band":0,"gain":0}]}',
    '{"equalizer":[{"band":0,"gain":0,"extra":1}]}', '{"channelMix":{"leftToLeft":2}}', '{"pluginFilters":{}}',
    '{"tremolo":{"depth":-1}}', '{"vibrato":{"frequency":15}}', '{"lowPass":{"smoothing":0}}',
    '{"rotation":[]}', '{"karaoke":{"level":-1}}', ' '.repeat(5001)];
  const updates = f.backend.updates.length;
  for (const json of invalid) await assert.rejects(f.run(`$musicFilters[${json}]`), code('MUSIC_FILTERS'));
  assert.equal(f.backend.updates.length, updates); assert.deepEqual(f.music.get('100')?.activeFilters, valid);
  assert.deepEqual(await f.run('$musicFilters[{}]'), {});
});

test('argumentos inválidos, vazio e player ausente têm erros claros sem criar player na busca vazia', async () => {
  await using f = fixture();
  for (const source of ['$musicNowPlaying', '$musicQueue', ...controls]) await assert.rejects(f.run(source), code('MUSIC_STATE'));
  await assert.rejects(f.run('$musicPlay[ausente]'), code('MUSIC_LOAD')); assert.equal(f.music.size, 0);
  for (const source of ['$musicSearch[]', `$musicSearch[${'x'.repeat(501)}]`, '$musicSearch[busca;0]', '$musicSearch[busca;26]',
    '$musicPlay[busca;0]', '$musicPlay[busca;101]', '$musicPlay[busca;4]']) await assert.rejects(f.run(source));
  await f.run('$musicPlay[busca]');
  for (const source of ['$musicQueue[0]', '$musicQueue[1.5]', '$musicRemove[1]', '$musicMove[1;2]', '$musicVolume[-1]',
    '$musicVolume[201]', '$musicVolume[abc]', '$musicLoop[sim]', '$musicSeek[-1]', '$musicSeek[999999]', '$musicStop[sim]']) await assert.rejects(f.run(source));
  await f.run('$musicStop');
  const current = await f.run('$musicNowPlaying') as { current: unknown }; assert.equal(current.current, null);
  assert.deepEqual(await f.run('$musicQueue'), { page: 1, total: 0, tracks: [] });
});

test('autor e bot validam Connect e Speak no canal; controles exigem mesmo canal ou MoveMembers', async () => {
  await using f = fixture();
  const memberCalls: { user: string; channel?: string }[] = [];
  const member = f.transport.member.bind(f.transport);
  f.transport.member = async (guild: string, user: string, channel?: string) => { memberCalls.push({ user, channel }); return member(guild, user); };
  f.transport.setMember('100', { id: '1', owner: false, permissions: 0n, rank: 1 });
  await assert.rejects(f.run('$try[$musicPlay[busca];oculto]'), { code: 'GUARD', reason: 'PERMISSION_MISSING_AUTHOR' });
  f.transport.setMember('100', { id: '1', owner: false, permissions: PermissionFlags.Connect, rank: 1 });
  f.transport.setMember('100', { id: '999', owner: false, permissions: 0n, rank: 90 });
  await assert.rejects(f.run('$musicPlay[busca]'), { code: 'GUARD', reason: 'PERMISSION_MISSING_BOT' });
  f.transport.setMember('100', { id: '999', owner: false, permissions: PermissionFlags.Connect, rank: 90 });
  await assert.rejects(f.run('$musicPlay[busca]'), { code: 'GUARD', reason: 'PERMISSION_MISSING_BOT' });
  assert.equal(f.backend.loads.length, 0); assert.equal(f.music.size, 0);
  f.transport.setMember('100', { id: '999', owner: false, permissions: PermissionFlags.Connect | PermissionFlags.Speak, rank: 90 });
  await f.run('$musicPlay[busca]'); assert.ok(memberCalls.every(call => call.channel === '300'));
  f.states.apply({ guildID: '100', userID: '1', channelID: '301' });
  for (const source of controls) await assert.rejects(f.run(`$try[${source};oculto]`), { code: 'GUARD', reason: 'PERMISSION_MISSING_AUTHOR' });
  await assert.rejects(f.run('$musicPlay[busca]'), { code: 'GUARD', reason: 'PERMISSION_MISSING_AUTHOR' });
  f.transport.setMember('100', { id: '1', owner: false, permissions: PermissionFlags.MoveMembers | PermissionFlags.Connect, rank: 1 });
  await f.run('$musicVolume[20]'); await f.run('$musicPlay[busca]');
  assert.deepEqual(f.joins, ['300']);
  f.transport.setMember('100', { id: '1', owner: false, permissions: 0n, rank: 1 });
  f.states.apply({ guildID: '100', userID: '1', channelID: '300' });
  await f.run('$musicPause'); assert.equal(f.music.get('100')?.isPaused, true);
});

test('DM, serviço indisponível, autor fora de voz e node indisponível são erros explícitos', async () => {
  await using dm = fixture({ dm: true }), missing = fixture({ unavailable: true }), f = fixture();
  for (const source of functions) {
    await assert.rejects(dm.run(source), { code: 'GUARD', reason: 'NOT_IN_GUILD' });
    await assert.rejects(missing.run(source), code('NATIVE_UNAVAILABLE'));
  }
  f.states.clear(); await assert.rejects(f.run('$musicPlay[busca]'), code('MUSIC_CHANNEL'));
  f.states.apply({ guildID: '100', userID: '1', channelID: '300' }); f.backend.available = false;
  await assert.rejects(f.run('$musicSearch[busca]'), code('MUSIC_NODE_UNAVAILABLE'));
  await assert.rejects(f.run('$musicPlay[busca]'), code('MUSIC_NODE_UNAVAILABLE'));
  assert.equal(f.music.size, 0); assert.deepEqual(f.joins, []);
});

test('falhas de conexão e reprodução preservam fila e deixam estado parcial observável', async () => {
  await using f = fixture();
  f.backend.failNextUpdate = new Error('conexão falhou');
  await assert.rejects(f.run('$musicPlay[busca]'));
  const player = f.music.get('100')!;
  assert.equal(player.voiceChannelID, undefined); assert.equal(player.queueSize, 0); assert.deepEqual(f.leaves, ['100']);
  f.backend.beforeUpdate = (_guild, update) => { if (update.track) throw new Error('reprodução falhou'); };
  await assert.rejects(f.run('$musicPlay[busca]'));
  assert.equal(player.voiceChannelID, '300'); assert.equal(player.queueSize, 1); assert.equal(player.current, null);
  f.backend.beforeUpdate = undefined;
  await player.play(); assert.equal(f.music.get('100')?.current?.info.identifier, 'a'); assert.equal(player.queueSize, 0);
  f.backend.failNextUpdate = new Error('volume falhou');
  await assert.rejects(f.run('$musicVolume[50]')); assert.equal(player.volume, 100);
  f.backend.failNextUpdate = new Error('stop falhou'); player.enqueue(mockTrack('b'));
  await assert.rejects(f.run('$musicStop')); assert.equal(player.queueSize, 1); assert.equal(f.music.get('100')?.current?.info.identifier, 'a');
});

test('limites de fila e de saída não são engolidos por try', async () => {
  await using f = fixture({ queueLimit: 1 }), small = fixture({ output: 20 });
  await f.run('$musicPlay[busca]'); await f.run('$musicPlay[busca]');
  await assert.rejects(f.run('$try[$musicPlay[busca];oculto]'), code('EXECUTION_LIMIT'));
  assert.equal(f.music.get('100')?.queueSize, 1);
  await assert.rejects(small.run('$try[$musicSearch[busca];oculto]'), code('OUTPUT_LIMIT'));
  await assert.rejects(small.run('$try[$musicPlay[busca];oculto]'), code('OUTPUT_LIMIT'));
  assert.equal(small.music.size, 0);
});
