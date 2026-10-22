import { arg, defineCommand, MemoryStore, Yuzuha } from 'yuzuha';
import { MockTransport, mockMessage } from 'yuzuha/testing';

const transport = new MockTransport();
const bot = new Yuzuha({ transport, store: new MemoryStore() });

bot.command(defineCommand({
  name: 'ban',
  args: { membro: arg.user().required(), motivo: arg.text().rest() },
  async run(ctx) {
    const caso = await ctx.mod.ban(ctx.args.get('membro'), { reason: ctx.args.get('motivo') ?? '' });
    await ctx.reply(`Membro banido. Caso #${caso.id}.`);
  },
}));

await bot.handle(mockMessage('!ban <@2> spam no chat'));
console.log(transport.messages[0]?.payload.content);
console.log('Ações simuladas:', transport.actions.length);
await bot.destroy();
