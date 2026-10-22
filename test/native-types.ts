import { arg, assert, defineCommand, defineEvent, Yuzuha } from '../src/index.js';
import { Events } from '@fluxerjs/core';
import type { Command } from '../src/commands/definition.js';
import type { HttpResponse, StickerCreateInput, ThreadMemberInfo } from '../src/index.js';

const native: Command = defineCommand({
  name: 'typed',
  args: {
    amount: arg.integer().min(1).default(1),
    member: arg.user().required(),
    reason: arg.text(),
    mode: arg.string().choices(['fast', 'slow']).required(),
    confirmed: arg.boolean().default(false),
    delay: arg.duration().required(),
  },
  async run(ctx) {
    const amount: number = ctx.args.get('amount');
    const member: string = ctx.args.get('member');
    const reason: string | undefined = ctx.args.get('reason');
    const mode: 'fast' | 'slow' = ctx.args.get('mode');
    const confirmed: boolean = ctx.args.get('confirmed');
    const delay: number = ctx.args.get('delay');
    const requiredReason: string = ctx.args.require('reason');
    ctx.assert(amount > 0, 'Valor inválido.');
    const count: number = await ctx.data.user.update('count', current => {
      assert(typeof current === 'number', 'Contador inválido.');
      return current + 1;
    }, 0);
    const record = await ctx.mod.ban(member, { reason: requiredReason });
    const caseID: number = record.id;
    const noRecord: undefined = await ctx.mod.unban(member, { reason: requiredReason, record: false });
    const signal: AbortSignal = ctx.signal;
    const username: string | undefined = ctx.client.user?.username;
    const reactionUsers: string[] = await ctx.resources.messages.reactionUsers('200', '1', '👍', 10, '2');
    const members: ThreadMemberInfo[] = await ctx.resources.threads.members('300', 10);
    const bytes: HttpResponse<Uint8Array> = await ctx.http.requestBytes({ method: 'GET', url: 'https://example.com/image' });
    const sticker: StickerCreateInput = { name: 'novo', image: 'aGVsbG8=', tags: ['ok'] };
    const nickname: string | null = (await ctx.members.setNickname(member, 'novo', 'ajuste')).nickname;
    const total: number = await ctx.data.transaction(tx => {
      const amount = tx.guild.update('saldo', value => Number(value) + 1, 0);
      tx.user.set('ultimo', amount);
      return amount;
    });
    const search = await ctx.resources.messages.search({ content: 'teste', guildID: ctx.guildID, cursor: ['a'] });
    const indexing: boolean = search.indexing;
    // @ts-expect-error Schema keys are checked.
    ctx.args.get('missing');
    // @ts-expect-error Optional arguments remain optional.
    const missing: string = ctx.args.get('reason');
    // @ts-expect-error Numeric arguments do not become strings.
    const wrong: string = ctx.args.get('amount');
    await ctx.reply(`${amount} ${member} ${reason} ${mode} ${confirmed} ${delay} ${requiredReason}`);
    void missing; void wrong;
    void count; void caseID; void noRecord; void signal; void username;
    void reactionUsers; void members; void bytes; void sticker;
    void nickname; void total; void indexing;
  },
});
void native;

// @ts-expect-error Numeric defaults must be numeric.
arg.integer().default('one');
// @ts-expect-error Choices narrow the accepted default.
arg.string().choices(['fast', 'slow']).default('other');

const legacy = defineCommand({ name: 'legacy', args: [{ name: 'value', type: 'string' }], run(ctx) { return ctx.reply('ok'); } });
const command: Command = legacy;
void command;

const bot = new Yuzuha();
bot.command({ name: 'direct-native', args: { amount: arg.integer().required() }, run(ctx) {
  const amount: number = ctx.args.get('amount');
  return ctx.reply(String(amount));
} });
bot.on(Events.MessageCreate, message => {
  const content: string = message.content;
  // @ts-expect-error SDK event parameters are typed.
  message.nonexistentProperty;
  void content;
});
bot.event(defineEvent({ event: Events.GuildMemberAdd, run(member) {
  const id: string = member.id;
  void id;
} }));

const typedFlags = defineCommand({
  name: 'flags',
  args: { member: arg.user().required() },
  flags: {
    reason: arg.text().alias('r').required(),
    count: arg.integer().default(2),
    quiet: arg.boolean(),
    mode: arg.string().choices(['fast', 'slow']),
  },
  run(ctx) {
    const member: string = ctx.args.get('member');
    const reason: string = ctx.flags.get('reason');
    const count: number = ctx.flags.get('count');
    const quiet: boolean | undefined = ctx.flags.get('quiet');
    const mode: 'fast' | 'slow' | undefined = ctx.flags.get('mode');
    // @ts-expect-error Flags retain schema keys.
    ctx.flags.get('missing');
    // @ts-expect-error Aliases do not become flag keys.
    ctx.flags.get('r');
    // @ts-expect-error Optional flags remain optional.
    const wrong: boolean = ctx.flags.get('quiet');
    void member; void reason; void count; void quiet; void mode; void wrong;
  },
});
bot.command({ name: 'direct-flags', flags: { enabled: arg.boolean().default(false) }, run(ctx) {
  const enabled: boolean = ctx.flags.get('enabled');
  return ctx.reply(String(enabled));
} });
bot.command({ name: 'group', subcommands: [typedFlags] });
