import { arg, assert, defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'contador', description: 'Contador persistente com incremento atômico.',
  args: { quantidade: arg.integer().min(1).max(100).default(1) },
  async run(ctx) {
    const guildID = ctx.requireGuild();
    const count = await ctx.store.update(state => {
      const key = JSON.stringify(['counter', guildID]);
      const current = state.variables[key] ?? 0;
      assert(typeof current === 'number', 'O contador salvo é inválido.');
      const next = current + ctx.args.get('quantidade');
      assert(Number.isSafeInteger(next), 'O contador atingiu o limite.');
      state.variables[key] = next;
      return next;
    });
    await ctx.reply(`Contagem: ${count}`);
  },
});
