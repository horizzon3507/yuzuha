import { YuzuhaError } from '../../errors.js';
import { channelID, userID } from '../../domain/values.js';
import { AuthorizationService } from '../../services/authorization.js';
import type { VoiceStateInfo } from '../../services/voice-states.js';
import type { FunctionCall } from '../runtime/types.js';
import { defineFunctions } from './definition.js';

function publicState(state: VoiceStateInfo) {
  const { sessionID: _, ...value } = state;
  return value;
}

function list(c: FunctionCall, states: VoiceStateInfo[]) {
  const result = states.slice(0, 100).map(publicState);
  c.checkOutput(result);
  return result;
}

async function control(c: FunctionCall): Promise<string> {
  const guildID = c.ctx.requireGuild();
  const channel = c.ctx.voice.channelID(guildID);
  if (!channel || c.ctx.voiceStates.userChannel(guildID, c.ctx.authorID) !== channel) {
    await c.ctx.requirePermission('MoveMembers');
  }
  return guildID;
}

function flag(raw: string): boolean | undefined {
  if (!raw.trim()) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new YuzuhaError('VOICE_CHANNEL', 'Estado de voz aceita true ou false.');
}

export const voiceFunctions = defineFunctions(fn => {
  for (const name of ['voiceState', 'voiceChannelOf'] as const) {
    fn(name, 'voice', 0, 1, '[usuário?]', 'Consulta voz do usuário no servidor; não expõe sessão autenticada.', async c => {
      const guild = c.ctx.requireGuild();
      const id = userID(c.count ? (await c.text(0)).trim() || c.ctx.authorID : c.ctx.authorID);
      const state = c.ctx.voiceStates.get(guild, id);
      return name === 'voiceChannelOf' ? state?.channelID ?? '' : state ? publicState(state) : null;
    });
  }
  fn('voiceStates', 'voice', 0, 0, '', 'Lista até 100 estados de voz do servidor, sem sessões.', c =>
    list(c, c.ctx.voiceStates.guild(c.ctx.requireGuild())));
  fn('voiceMembers', 'voice', 0, 1, '[canal?]', 'Lista até 100 participantes; padrão: canal de voz do autor.', async c => {
    const guild = c.ctx.requireGuild();
    const raw = c.count ? (await c.text(0)).trim() : '';
    const channel = raw ? channelID(raw) : c.ctx.voiceStates.userChannel(guild, c.ctx.authorID);
    return channel ? list(c, c.ctx.voiceStates.channel(guild, channel)) : [];
  });
  fn('botVoiceChannel', 'voice', 0, 0, '', 'Retorna o canal da conexão do bot ou texto vazio.', c => c.ctx.voice.channelID(c.ctx.requireGuild()) ?? '');
  fn('voiceJoin', 'voice', 0, 1, '[canal?]', 'Conecta ao canal do autor ou informado; exige Connect do autor e Connect/Speak do bot.', async c => {
    const guildID = c.ctx.requireGuild();
    const voice = c.ctx.voice;
    const raw = c.count ? (await c.text(0)).trim() : '';
    const channel = raw ? channelID(raw) : c.ctx.voiceStates.userChannel(guildID, c.ctx.authorID);
    if (!channel) throw new YuzuhaError('VOICE_CHANNEL', 'Entre em um canal de voz ou informe um canal.');
    const authorization = new AuthorizationService(c.ctx.transport, { guildID, authorID: c.ctx.authorID });
    await authorization.requireBothPermissions('Connect', channel);
    await authorization.requirePermission('Speak', true, undefined, channel);
    await c.wait(voice.join(channel, { guildID }));
    return channel;
  });
  fn('voiceStatus', 'voice', 0, 0, '', 'Retorna conexão, canal, servidor, reprodução e volume; não expõe endpoint/token.', c => {
    const guildID = c.ctx.requireGuild();
    const voice = c.ctx.voice, connection = voice.get(guildID);
    return { connected: connection ? connection.isConnected?.() ?? true : false,
      channelID: voice.channelID(guildID) ?? '', guildID, playing: connection?.playing ?? false,
      playingVideo: connection?.playingVideo ?? false, volume: connection?.getVolume?.() ?? null };
  });
  fn('voiceLeave', 'voice', 0, 1, '[canal?]', 'Sai da voz; exige mesmo canal do bot ou MoveMembers, inclusive sem conexão.', async c => {
    const guild = await control(c);
    const raw = c.count ? (await c.text(0)).trim() : '';
    if (raw && channelID(raw) !== c.ctx.voice.channelID(guild)) throw new YuzuhaError('VOICE_CHANNEL', 'O bot não está neste canal.');
    return c.wait(c.ctx.voice.leave(guild));
  });
  fn('voiceStop', 'voice', 0, 0, '', 'Para áudio e vídeo; exige mesmo canal do bot ou MoveMembers.', async c => {
    c.ctx.voice.stop(await control(c)); return '';
  });
  fn('voiceVolume', 'voice', 0, 1, '[volume?]', 'Lê ou define volume inteiro de 0 a 200; exige mesmo canal do bot ou MoveMembers.', async c => {
    const guild = await control(c), voice = c.ctx.voice;
    if (!c.count || !(await c.text(0)).trim()) {
      const connection = voice.get(guild);
      if (!connection) return null;
      if (!connection.getVolume) throw new YuzuhaError('VOICE_UNSUPPORTED', 'A conexão não fornece leitura de volume.');
      return connection.getVolume();
    }
    const value = Number(await c.text(0));
    if (!Number.isSafeInteger(value) || value < 0 || value > 200) throw new YuzuhaError('VOICE_VOLUME', 'Volume deve ser inteiro entre 0 e 200.');
    voice.setVolume(guild, value); return value;
  });
  fn('botVoiceState', 'voice', 0, 2, '[selfMute?;selfDeaf?]', 'Atualiza mute/deaf do bot; exige mesmo canal do bot ou MoveMembers.', async c => {
    const guild = await control(c);
    const self_mute = c.count ? flag((await c.text(0)).trim()) : undefined;
    const self_deaf = c.count > 1 ? flag((await c.text(1)).trim()) : undefined;
    await c.wait(c.ctx.voice.updateVoiceState(guild, { ...(self_mute === undefined ? {} : { self_mute }), ...(self_deaf === undefined ? {} : { self_deaf }) }));
    return '';
  });
});
