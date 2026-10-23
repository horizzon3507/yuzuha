import { defineCommand } from 'yuzuha';
import { MusicManager } from 'yuzuha/music';
import { createTestBot, MockMusicBackend, mockTrack } from 'yuzuha/testing';

const backend = new MockMusicBackend();
const music = new MusicManager({ nodes: [backend] });
const fixture = createTestBot({ music, scheduler: false, commands: [defineCommand({
  name: 'play', guildOnly: true,
  async run(ctx) {
    const player = ctx.music.createPlayer(ctx.requireGuild());
    player.enqueue([mockTrack('Primeira faixa'), mockTrack('Segunda faixa')]);
    const current = await player.play();
    await ctx.reply(`Tocando: ${current?.info.title}. Na fila: ${player.queueSize}.`);
  },
})] });
try {
  await fixture.send('!play');
  console.log(fixture.messages.at(-1)?.payload.content);
  const player = music.get('100')!;
  await player.skip();
  console.log(`Depois do skip: ${player.current?.info.title}.`);
  backend.emitLifecycle({ type: 'ready', sessionID: 'outra-sessao', resumed: false });
  await music.drain();
  console.log(`Depois da recuperação: ${player.current?.info.title}.`);
} finally { await fixture.destroy(); }
