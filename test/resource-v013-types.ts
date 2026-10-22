import type { CaseRecord, CommandContext, NativeMoveOptions, NativeVoiceOptions, ThreadListPage, UserProfileInfo } from '../src/index.js';

export async function voiceAndResourceTypes(ctx: CommandContext): Promise<void> {
  const moveOptions = { channelID: null, reason: 'desconectar' } satisfies NativeMoveOptions;
  const voiceOptions = { enabled: false, reason: 'restaurar' } satisfies NativeVoiceOptions;
  const move: CaseRecord = await ctx.mod.move('2', moveOptions);
  const mute: CaseRecord = await ctx.mod.mute({ id: '2' }, voiceOptions);
  const deafen: undefined = await ctx.mod.deafen('2', { ...voiceOptions, record: false });
  const profile: UserProfileInfo = await ctx.resources.users.profile('2', ctx.guildID);
  const threads: ThreadListPage = await ctx.resources.threads.archived('200', { type: 'joined', before: '300' });
  const counts = await ctx.resources.users.guildCounts(ctx.guildID, { signal: ctx.signal, timeout: 1000 });
  void [move, mute, deafen, profile, threads, counts];
  // @ts-expect-error Moving requires a destination or null.
  ctx.mod.move('2', { reason: 'motivo' });
  // @ts-expect-error Voice state is boolean.
  ctx.mod.mute('2', { reason: 'motivo', enabled: 'false' });
}
