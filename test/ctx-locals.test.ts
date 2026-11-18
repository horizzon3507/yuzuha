import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConfigError,
  GuardError,
  MemoryStore,
  SDK,
  Yuzuha,
  arg,
  defineCommand,
  isYuzuhaError,
} from 'yuzuha';
import { functions } from 'yuzuha/functions';
import { createTestBot, MockTransport } from 'yuzuha/testing';

declare module 'yuzuha' {
  interface YuzuhaLocals {
    requestSeq?: number;
    locale?: 'pt-BR' | 'en-US';
    steps?: string[];
  }
}

test('declaration merging tipa ctx.locals e fábrica assíncrona executa antes de prepare, parsers, checks, hooks e middleware', async () => {
  let seq = 0;
  const hookTraces: string[] = [];

  await using t = createTestBot({
    async context(ctx) {
      await Promise.resolve();
      ctx.locals.requestSeq = ++seq;
      ctx.locals.locale = ctx.guildID === '100' ? 'pt-BR' : 'en-US';
      ctx.locals.steps = ['context'];
    },
    hooks: {
      onCooldown(_remainingMs, ctx) {
        hookTraces.push(`cooldown:${ctx.locals.locale}:${ctx.locals.requestSeq}`);
        return `cooldown-${ctx.locals.locale}`;
      },
      onDenied(error, ctx) {
        hookTraces.push(`denied:${error.reason}:${ctx.locals.locale}:${ctx.locals.steps?.join('>')}`);
        return `negado-${ctx.locals.locale}:${error.message}`;
      },
    },
  });

  t.bot.argumentType<string>('traduzido', {
    parse(raw, ctx) {
      ctx.locals.steps?.push('argParser');
      return `${ctx.locals.locale}:${raw}`;
    },
  });

  t.bot.use(async (ctx, next) => {
    ctx.locals.steps?.push('globalMiddleware');
    await next();
  });

  t.bot.command(defineCommand({
    name: 'pipeline',
    guildOnly: true,
    cooldown: '10s',
    args: { termo: arg.custom<string>('traduzido').required() },
    checks: [
      ctx => {
        ctx.locals.steps?.push('check');
        if (ctx.args.string('termo')?.endsWith(':proibido')) return 'Termo bloqueado.';
        return true;
      },
    ],
    middleware: [
      async (ctx, next) => {
        ctx.locals.steps?.push('localMiddleware');
        await next();
      },
    ],
    async run(ctx) {
      ctx.locals.steps?.push('run');
      const locale: 'pt-BR' | 'en-US' | undefined = ctx.locals.locale;
      const requestSeq: number | undefined = ctx.locals.requestSeq;
      // @ts-expect-error locale é 'pt-BR' | 'en-US' | undefined, não number.
      const wrongType: number = ctx.locals.locale;
      // @ts-expect-error Propriedade não declarada em YuzuhaLocals é rejeitada em tempo de compilação.
      void ctx.locals.inexistente;
      void wrongType;

      await ctx.reply(`#${requestSeq}|${locale}|${ctx.args.get('termo')}|${ctx.locals.steps?.join('>')}`);
    },
  }));

  // 1) Execução completa verifica ordem: context -> argParser -> check -> globalMiddleware -> localMiddleware -> run
  assert.equal(await t.send('!pipeline ola'), 'success');
  assert.equal(
    t.messages.at(-1)?.payload.content,
    '#1|pt-BR|pt-BR:ola|context>argParser>check>globalMiddleware>localMiddleware>run',
  );

  // 2) Cooldown em ctx.prepare() já enxerga ctx.locals preenchido em hooks.onCooldown
  assert.equal(await t.send('!pipeline ola'), 'guarded');
  assert.equal(t.messages.at(-1)?.payload.content, 'cooldown-pt-BR');
  assert.deepEqual(hookTraces, ['cooldown:pt-BR:2']);

  // 3) Avança relógio e aciona recusa em check: hooks.onDenied enxerga ctx.locals preenchido
  await t.tick(10_000);
  assert.equal(await t.send('!pipeline proibido'), 'guarded');
  assert.equal(t.messages.at(-1)?.payload.content, 'negado-pt-BR:Termo bloqueado.');
  assert.equal(hookTraces.at(-1), 'denied:CHECK_FAILED:pt-BR:context>argParser>check');

  // 4) Guard guildOnly em DM dentro de ctx.prepare() também já enxerga ctx.locals (locale = en-US)
  assert.equal(await t.send('!pipeline ola', { guildID: undefined }), 'guarded');
  assert.match(hookTraces.at(-1) ?? '', /^denied:NOT_IN_GUILD:en-US:context$/);
});

test('fábrica síncrona, isolamento por execução concorrente e eventos contextEvent/scriptEvent', async () => {
  let counter = 0;
  const eventSnapshots: string[] = [];

  await using t = createTestBot({
    engine: functions(),
    context(ctx) {
      ctx.locals.requestSeq = ++counter;
      ctx.locals.steps = [`exec:${ctx.locals.requestSeq}`];
    },
  });

  t.bot.engine!.registerAll([
    {
      name: 'localSeq',
      category: 'custom',
      description: 'Lê requestSeq de ctx.locals.',
      usage: '$localSeq',
      minArgs: 0,
      maxArgs: 0,
      execute: call => String(call.ctx.locals.requestSeq ?? 0),
    },
  ]);

  let releaseFirst!: () => void;
  const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });

  t.bot.command(defineCommand({
    name: 'isolar',
    args: { modo: arg.enum(['lento', 'rapido']).required() },
    async run(ctx) {
      if (ctx.args.get('modo') === 'lento') await firstGate;
      ctx.locals.steps?.push(ctx.args.get('modo'));
      await ctx.reply(`${ctx.locals.requestSeq}:${ctx.locals.steps?.join(',')}`);
    },
  }));

  t.bot.contextEvent({
    event: 'guildMemberAdd',
    channelID: '200',
    async run(ctx, member) {
      const seqValue: number | undefined = ctx.locals.requestSeq;
      eventSnapshots.push(`ctxEvent:${member.id}:${seqValue}`);
    },
  });

  t.bot.scriptEvent({
    event: 'guildMemberRemove',
    channelID: '200',
    code: 'saida:$eventUserID:$localSeq',
  });

  const slowPromise = t.send('!isolar lento', { id: 'm-slow' });
  await Promise.resolve();
  const fastResult = await t.send('!isolar rapido', { id: 'm-fast', authorID: '2' });
  assert.equal(fastResult, 'success');
  assert.equal(t.messages.at(-1)?.payload.content, '2:exec:2,rapido');

  releaseFirst();
  assert.equal(await slowPromise, 'success');
  assert.equal(t.messages.at(-1)?.payload.content, '1:exec:1,lento');

  const guild = new SDK.Guild(t.bot.client, { id: '100', name: 'Servidor', ownerId: '1' } as never);
  const memberPayload = {
    user: { id: '2', username: 'Ana', discriminator: '0000', global_name: null, avatar: null, avatar_color: null, flags: 0, bot: false },
    roles: [],
    joined_at: '2026-11-17T00:00:00.000Z',
    mute: false,
    deaf: false,
  };
  t.bot.client.emit('guildMemberAdd', new SDK.GuildMember(t.bot.client, memberPayload as never, guild));
  t.bot.client.emit('guildMemberRemove', new SDK.GuildMember(t.bot.client, memberPayload as never, guild));
  await new Promise<void>(resolve => setImmediate(resolve));

  assert.deepEqual(eventSnapshots, ['ctxEvent:2:3']);
  assert.equal(t.messages.at(-1)?.payload.content, 'saida:2:4');
});

test('erros lançados em options.context passam por errorReply e onError, e opção inválida lança ConfigError(OPTIONS)', async () => {
  for (const bad of ['invalido', 123, {}, []]) {
    assert.throws(
      () => new Yuzuha({
        transport: new MockTransport(),
        store: new MemoryStore(),
        scheduler: false,
        context: bad as never,
      }),
      error => error instanceof ConfigError && isYuzuhaError(error, 'OPTIONS') && error.message === 'context deve ser uma função.',
    );
  }

  const boom = new Error('falha ao carregar sessão');
  const observedSources: string[] = [];

  await using t = createTestBot({
    async context(ctx) {
      ctx.locals.locale = 'pt-BR';
      if (ctx.input === 'negar') throw new GuardError('Sessão bloqueada.', 'CHECK_FAILED');
      if (ctx.input === 'falhar') throw boom;
    },
    errorReply(error, ctx) {
      if (error === boom) return `erro-tratado:${ctx?.locals.locale}`;
      return undefined;
    },
    onError(_error, _ctx, info) {
      observedSources.push(info.source);
    },
  });

  t.bot.command({
    name: 'acao',
    args: { tipo: arg.text() },
    run: ctx => ctx.reply('ok'),
  });

  assert.equal(await t.send('!acao negar'), 'guarded');
  assert.equal(t.errors.length, 0);
  assert.equal(t.messages.at(-1)?.payload.content, 'Sessão bloqueada.');

  assert.equal(await t.send('!acao falhar'), 'error');
  assert.equal(t.errors.length, 1);
  assert.equal(t.errors[0], boom);
  assert.deepEqual(observedSources, ['command']);
  assert.equal(t.messages.at(-1)?.payload.content, 'erro-tratado:pt-BR');
});
