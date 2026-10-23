import { arg, Yuzuha } from 'yuzuha';
import type { Client } from 'yuzuha/sdk';
import { FluxerLavalinkBridge, FluxerVoice, LavalinkNode, MusicManager } from 'yuzuha/music';
import type { LavalinkOptions } from 'yuzuha/music';

/** Requires the yuzuha-audio plugin on Lavalink and @fluxerjs/voice on the bot. */
export async function createLavalinkBot(client: Client, options: LavalinkOptions): Promise<{ bot: Yuzuha; node: LavalinkNode }> {
  const node = new LavalinkNode(options);
  node.on('nodeError', error => console.error('Lavalink:', error));
  try { await node.connect(); }
  catch (error) { await node.close(); throw error; }
  const voice = new FluxerVoice(client);
  const audio = new FluxerLavalinkBridge({ voice });
  const music = new MusicManager({ nodes: [node], audio, onError: error => console.error('Música:', error) });
  const bot = new Yuzuha({ client, music, voice });
  bot.command({ name: 'join', guildOnly: true, botPermissions: ['Connect', 'Speak'],
    args: { canal: arg.text().required() }, async run(ctx) {
      const channelID = ctx.args.get('canal'), channel = await ctx.client.channels.fetch(channelID);
      ctx.assert(channel?.isVoice() && channel.guildId === ctx.requireGuild(), 'Escolha um canal de voz deste servidor.');
      await ctx.music.createPlayer(ctx.requireGuild()).connect(channelID);
    },
  });
  bot.command({ name: 'play', guildOnly: true, args: { busca: arg.text().rest().required() }, async run(ctx) {
    const player = ctx.music.get(ctx.requireGuild());
    ctx.assert(player?.voiceChannelID, 'Use !join antes de adicionar músicas.');
    const result = await ctx.music.search(`scsearch:${ctx.args.get('busca')}`, ctx.signal);
    const before = player!.queueSize;
    const size = player!.enqueueResult(result);
    ctx.assert(size > before, 'Nenhuma faixa foi encontrada.');
    await player!.play(); await ctx.reply(`${size - before} faixa(s) adicionada(s).`);
  } });
  bot.command({ name: 'skip', guildOnly: true, async run(ctx) { await ctx.music.get(ctx.requireGuild())?.skip(); } });
  bot.command({ name: 'pause', guildOnly: true, async run(ctx) { await ctx.music.get(ctx.requireGuild())?.pause(); } });
  bot.command({ name: 'resume', guildOnly: true, async run(ctx) { await ctx.music.get(ctx.requireGuild())?.pause(false); } });
  bot.command({ name: 'queue', guildOnly: true, args: { pagina: arg.integer().min(1).default(1) }, async run(ctx) {
    const player = ctx.music.get(ctx.requireGuild());
    ctx.assert(player, 'Não há player neste servidor.');
    const start = (ctx.args.get('pagina') - 1) * 10;
    ctx.assert(start < player!.queueSize, 'Esta página está vazia.');
    const page = player!.queuePage(start, Math.min(10, player!.queueSize - start));
    await ctx.reply(page.map((track, index) => `${start + index + 1}. ${track.info.title}`).join('\n'));
  } });
  bot.command({ name: 'shuffle', guildOnly: true, async run(ctx) { ctx.music.get(ctx.requireGuild())?.shuffle(); } });
  bot.command({ name: 'stop', guildOnly: true, async run(ctx) { await ctx.music.get(ctx.requireGuild())?.stop(); } });
  bot.command({ name: 'leave', guildOnly: true, async run(ctx) { await ctx.music.destroyPlayer(ctx.requireGuild()); } });
  bot.command({ name: 'volume', guildOnly: true, args: { volume: arg.integer().min(0).max(200).required() }, async run(ctx) {
    const player = ctx.music.get(ctx.requireGuild()); ctx.assert(player, 'Não há player neste servidor.');
    await player!.setVolume(ctx.args.get('volume'));
  } });
  bot.command({ name: 'seek', guildOnly: true, args: { segundos: arg.integer().min(0).required() }, async run(ctx) {
    const player = ctx.music.get(ctx.requireGuild()); ctx.assert(player, 'Não há player neste servidor.');
    await player!.seek(ctx.args.get('segundos') * 1000);
  } });
  return { bot, node };
}
