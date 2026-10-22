import { arg, defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'ban-ts', description: 'Banimento escrito em TypeScript.',
  guildOnly: true,
  args: {
    membro: arg.user().required(),
    motivo: arg.text().rest().required(),
  },
  async run(ctx) {
    const record = await ctx.mod.ban(ctx.args.get('membro'), { reason: ctx.args.get('motivo') });
    await ctx.reply(`Membro banido. Caso #${record.id}.`);
  },
});
