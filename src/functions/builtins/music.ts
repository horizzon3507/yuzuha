import { YuzuhaError } from '../../errors.js';
import type { MusicFilters, MusicTrack, TrackLoadResult } from '../../domain/music.js';
import { AuthorizationService } from '../../services/authorization.js';
import type { MusicPlayer } from '../../services/music.js';
import type { FunctionCall } from '../runtime/types.js';
import { defineFunctions } from './definition.js';

function trackInfo(track: MusicTrack) {
  const info = track.info;
  return { identifier: info.identifier, title: info.title, author: info.author, length: info.length,
    isStream: info.isStream, isSeekable: info.isSeekable, uri: info.uri, artworkUrl: info.artworkUrl ?? null,
    sourceName: info.sourceName };
}

function tracks(result: TrackLoadResult): MusicTrack[] {
  switch (result.loadType) {
    case 'track': return [result.data];
    case 'search': return result.data;
    case 'playlist': return result.data.tracks;
    case 'empty': return [];
    case 'error': throw new YuzuhaError('MUSIC_LOAD', 'Não foi possível carregar as músicas.');
  }
}

async function query(c: FunctionCall): Promise<string> {
  const value = (await c.text(0)).trim();
  if (!value || value.length > 500) throw new YuzuhaError('MUSIC_OPTIONS', 'Busca deve ter entre 1 e 500 caracteres.');
  return value;
}

function integer(raw: string, min: number, max: number): number {
  const value = Number(raw);
  if (!raw.trim() || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new YuzuhaError('MUSIC_OPTIONS', `Informe um inteiro entre ${min} e ${max}.`);
  }
  return value;
}

function player(c: FunctionCall): MusicPlayer {
  const guild = c.ctx.requireGuild();
  const value = c.ctx.music.get(guild);
  if (!value) throw new YuzuhaError('MUSIC_STATE', 'Não há player de música neste servidor. Use $musicPlay primeiro.');
  return value;
}

async function authorize(c: FunctionCall, value: MusicPlayer): Promise<void> {
  if (!value.voiceChannelID || c.ctx.voiceStates.userChannel(value.guildID, c.ctx.authorID) !== value.voiceChannelID) {
    await c.ctx.requirePermission('MoveMembers');
  }
}

const filterKeys: Record<string, readonly string[]> = {
  karaoke: ['level', 'monoLevel', 'filterBand', 'filterWidth'], timescale: ['speed', 'pitch', 'rate'],
  tremolo: ['frequency', 'depth'], vibrato: ['frequency', 'depth'], rotation: ['rotationHz'],
  distortion: ['sinOffset', 'sinScale', 'cosOffset', 'cosScale', 'tanOffset', 'tanScale', 'offset', 'scale'],
  channelMix: ['leftToLeft', 'leftToRight', 'rightToLeft', 'rightToRight'], lowPass: ['smoothing'],
};

function filters(raw: string): MusicFilters {
  const fail = (): never => { throw new YuzuhaError('MUSIC_FILTERS', 'Filtros inválidos: use apenas filtros padrão, campos conhecidos e números finitos.'); };
  if (raw.length > 5000) fail();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { fail(); }
  const object = (input: unknown): input is Record<string, unknown> => input !== null && typeof input === 'object' && !Array.isArray(input);
  const number = (input: unknown): input is number => typeof input === 'number' && Number.isFinite(input);
  if (!object(value)) return fail();
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'volume') {
      if (!number(entry) || entry < 0 || entry > 5) fail();
    } else if (key === 'equalizer') {
      if (!Array.isArray(entry) || entry.length > 15) return fail();
      const bands = new Set<number>();
      for (const band of entry) {
        if (!object(band) || Object.keys(band).length !== 2 || !number(band.band) || !Number.isInteger(band.band)
          || band.band < 0 || band.band > 14 || bands.has(band.band) || !number(band.gain) || band.gain < -0.25 || band.gain > 1) return fail();
        bands.add(band.band);
      }
    } else {
      if (!Object.hasOwn(filterKeys, key) || !object(entry)) return fail();
      for (const [field, n] of Object.entries(entry)) {
        if (!filterKeys[key]!.includes(field) || !number(n)) return fail();
        if (key === 'timescale' && (n <= 0 || n > 10)) fail();
        if ((field === 'depth' || key === 'channelMix') && (n < 0 || n > 1)) fail();
        if (field === 'frequency' && (n <= 0 || (key === 'vibrato' && n > 14))) fail();
        if (key === 'karaoke' && n < 0) fail();
        if (key === 'lowPass' && n <= 1) fail();
      }
    }
  }
  return value as MusicFilters;
}

export const musicFunctions = defineFunctions(fn => {
  fn('musicSearch', 'music', 1, 2, '[busca;limite?]', 'Busca até 25 faixas; busca de até 500 caracteres, sem blobs encoded.', async c => {
    c.ctx.requireGuild();
    const music = c.ctx.music, identifier = await query(c);
    const limit = c.count > 1 ? integer(await c.text(1), 1, 25) : 10;
    const result = tracks(await c.wait(music.search(identifier, c.ctx.signal))).slice(0, limit).map(trackInfo);
    c.checkOutput(result); return result;
  });
  fn('musicPlay', 'music', 1, 2, '[busca;índice?]', 'Enfileira uma faixa da busca/playlist (índice desde 1), conecta à voz do autor e inicia se ocioso.', async c => {
    const guildID = c.ctx.requireGuild(), music = c.ctx.music;
    const identifier = await query(c), index = c.count > 1 ? integer(await c.text(1), 1, 100) : 1;
    const channel = c.ctx.voiceStates.userChannel(guildID, c.ctx.authorID);
    if (!channel) throw new YuzuhaError('MUSIC_CHANNEL', 'Entre em um canal de voz antes de pedir uma música.');
    const auth = new AuthorizationService(c.ctx.transport, { guildID, authorID: c.ctx.authorID });
    await auth.requireBothPermissions('Connect', channel);
    await auth.requirePermission('Speak', true, undefined, channel);
    const existing = music.get(guildID);
    if (existing?.voiceChannelID) await authorize(c, existing);
    const result = tracks(await c.wait(music.search(identifier, c.ctx.signal)));
    if (!result.length) throw new YuzuhaError('MUSIC_LOAD', 'Nenhuma música encontrada.');
    const selected = result[index - 1];
    if (!selected) throw new YuzuhaError('MUSIC_SEARCH_INDEX', 'Resultado de busca fora do intervalo.');
    const info = trackInfo(selected); c.checkOutput(info);
    const value = music.createPlayer(guildID);
    if (!value.voiceChannelID) await c.wait(value.connect(channel));
    await authorize(c, value);
    value.enqueue(selected);
    if (!value.current) await c.wait(value.play());
    return info;
  });
  fn('musicNowPlaying', 'music', 0, 0, '', 'Retorna faixa atual, posição em ms, pausa, volume e loop, sem encoded.', c => {
    const value = player(c), current = value.current;
    return { current: current ? trackInfo(current) : null, position: value.position, paused: value.isPaused, volume: value.volume, loop: value.loop };
  });
  fn('musicQueue', 'music', 0, 1, '[página?]', 'Lista até 25 faixas da fila; páginas começam em 1.', async c => {
    const value = player(c), page = c.count ? integer(await c.text(0), 1, 4000) : 1;
    const start = (page - 1) * 25;
    return { page, total: value.queueSize, tracks: start >= value.queueSize ? [] : value.queuePage(start, Math.min(25, value.queueSize - start)).map(trackInfo) };
  });
  for (const name of ['musicPause', 'musicResume', 'musicSkip', 'musicShuffle', 'musicClear'] as const) {
    fn(name, 'music', 0, 0, '', 'Controla o player; exige mesmo canal de voz ou MoveMembers.', async c => {
      const value = player(c); await authorize(c, value);
      if (name === 'musicPause' || name === 'musicResume') await c.wait(value.pause(name === 'musicPause'));
      else if (name === 'musicSkip') { const next = await c.wait(value.skip()); return next ? trackInfo(next) : null; }
      else if (name === 'musicShuffle') value.shuffle();
      else value.clearQueue();
      return '';
    });
  }
  fn('musicStop', 'music', 0, 1, '[limparFila?]', 'Para reprodução; limpa fila por padrão. Exige mesmo canal ou MoveMembers.', async c => {
    const value = player(c); await authorize(c, value);
    const raw = c.count ? (await c.text(0)).trim() : 'true';
    if (raw !== 'true' && raw !== 'false') throw new YuzuhaError('MUSIC_OPTIONS', 'limparFila aceita true ou false.');
    await c.wait(value.stop(raw === 'true')); return '';
  });
  fn('musicRemove', 'music', 1, 2, '[índice;quantidade?]', 'Remove até 25 faixas da fila (índice desde 1); exige mesmo canal ou MoveMembers.', async c => {
    const value = player(c); await authorize(c, value);
    const index = integer(await c.text(0), 1, value.queueSize), count = c.count > 1 ? integer(await c.text(1), 1, 25) : 1;
    const preview = value.queuePage(index - 1, count).map(trackInfo); c.checkOutput(preview);
    value.remove(index - 1, count); return preview;
  });
  fn('musicMove', 'music', 2, 2, '[de;para]', 'Move faixa na fila; índices desde 1. Exige mesmo canal ou MoveMembers.', async c => {
    const value = player(c); await authorize(c, value);
    value.move(integer(await c.text(0), 1, value.queueSize) - 1, integer(await c.text(1), 1, value.queueSize) - 1); return '';
  });
  fn('musicLoop', 'music', 0, 1, '[off|track|queue?]', 'Consulta ou define loop; exige mesmo canal ou MoveMembers.', async c => {
    const value = player(c); await authorize(c, value);
    if (c.count) {
      const mode = (await c.text(0)).trim();
      if (mode !== 'off' && mode !== 'track' && mode !== 'queue') throw new YuzuhaError('MUSIC_LOOP', 'Loop deve ser off, track ou queue.');
      value.setLoop(mode);
    }
    return value.loop;
  });
  fn('musicVolume', 'music', 0, 1, '[volume?]', 'Consulta ou define volume inteiro de 0 a 200; exige mesmo canal ou MoveMembers.', async c => {
    const value = player(c); await authorize(c, value);
    if (c.count) await c.wait(value.setVolume(integer(await c.text(0), 0, 200)));
    return value.volume;
  });
  fn('musicSeek', 'music', 1, 1, '[ms]', 'Busca posição em milissegundos; exige faixa com seek e mesmo canal ou MoveMembers.', async c => {
    const value = player(c); await authorize(c, value);
    await c.wait(value.seek(integer(await c.text(0), 0, Number.MAX_SAFE_INTEGER))); return '';
  });
  fn('musicFilters', 'music', 0, 1, '[json?]', 'Consulta ou substitui filtros padrão via JSON estrito (até 5000 caracteres); exige mesmo canal ou MoveMembers.', async c => {
    const value = player(c); await authorize(c, value);
    if (c.count) await c.wait(value.setFilters(filters(await c.text(0))));
    return value.activeFilters;
  });
}).map(definition => ({
  ...definition,
  async execute(c: FunctionCall) {
    try { return await definition.execute(c); }
    catch (error) {
      if (error instanceof YuzuhaError && ['MUSIC_QUEUE_LIMIT', 'MUSIC_CONTROL_LIMIT', 'MUSIC_CAPACITY'].includes(error.code)) {
        throw new YuzuhaError('EXECUTION_LIMIT', error.message, { cause: error });
      }
      throw error;
    }
  },
}));
