import { arg, Yuzuha } from 'yuzuha';
import type { Client } from 'yuzuha/sdk';
import { FluxerVoice } from 'yuzuha/music';

/** The audio source is chosen by the operator, rather than taken from a message. */
export function createNativeVoiceBot(client: Client, audioSource: string): Yuzuha {
  const voice = new FluxerVoice(client);
  const bot = new Yuzuha({ client, voice });
  voice.on('voiceError', (error, guildID) => console.error(`Áudio ${guildID}:`, error));
  bot.command({ name: 'join', guildOnly: true, botPermissions: ['Connect', 'Speak'],
    args: { canal: arg.text().required() },
    async run(ctx) {
      const channelID = ctx.args.get('canal');
      const channel = await ctx.client.channels.fetch(channelID);
      ctx.assert(channel?.isVoice() && channel.guildId === ctx.requireGuild(), 'Escolha um canal de voz deste servidor.');
      await ctx.voice.join(channelID);
      await ctx.reply('Conectado ao canal de voz.');
    },
  });
  bot.command({ name: 'playdemo', guildOnly: true, async run(ctx) {
    await ctx.voice.play(ctx.requireGuild(), audioSource); await ctx.reply('Áudio iniciado.');
  } });
  bot.command({ name: 'stop', guildOnly: true, run(ctx) { ctx.voice.stop(ctx.requireGuild()); } });
  bot.command({ name: 'leave', guildOnly: true, async run(ctx) { await ctx.voice.leave(ctx.requireGuild()); } });
  return bot;
}
