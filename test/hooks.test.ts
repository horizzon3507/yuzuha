import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConfigError,
  GuardError,
  MemoryStore,
  Yuzuha,
  defineCommand,
  embed,
} from '../src/index.js';
import type { ErrorReplyResult, UnknownCommandContext } from '../src/index.js';
import { MockTransport, createTestBot, mockMessage } from '../src/testing.js';

test('hooks inválido rejeita construção com ConfigError OPTIONS', () => {
  for (const hooks of [null, 'bad', [], { onCooldown: 123 }, { onDenied: {} }, { onUnknownCommand: true }]) {
    assert.throws(
      () => new Yuzuha({ hooks: hooks as never, transport: new MockTransport(), store: new MemoryStore() }),
      error => error instanceof ConfigError && error.code === 'OPTIONS',
    );
  }
});

test('CHECK_FAILED e remainingMs são preenchidos em GuardError para checks e cooldowns', async () => {
  const deniedErrors: GuardError[] = [];
  const cooldownCalls: { remainingMs: number; error: GuardError }[] = [];

  const fixture = createTestBot({
    now: 10_000,
    hooks: {
      onDenied(error) { deniedErrors.push(error); },
      onCooldown(remainingMs, _ctx, error) { cooldownCalls.push({ remainingMs, error }); },
    },
    commands: [
      defineCommand({
        name: 'restrito',
        checks: [() => false],
        run: async ctx => { await ctx.reply('ok'); },
      }),
      defineCommand({
        name: 'texto',
        checks: [() => 'Somente VIP.'],
        run: async ctx => { await ctx.reply('ok'); },
      }),
      defineCommand({
        name: 'decl',
        cooldown: '5s',
        run: async ctx => { await ctx.reply('ok'); },
      }),
      defineCommand({
        name: 'prog',
        run: async ctx => {
          ctx.cooldown('4s', 'Espere {remaining}.');
          await ctx.reply('ok');
        },
      }),
    ],
  });

  try {
    assert.equal(await fixture.send('!restrito'), 'guarded');
    assert.equal(deniedErrors.at(-1)?.reason, 'CHECK_FAILED');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'Você não pode executar este comando.');

    assert.equal(await fixture.send('!texto'), 'guarded');
    assert.equal(deniedErrors.at(-1)?.reason, 'CHECK_FAILED');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'Somente VIP.');

    assert.equal(await fixture.send('!decl'), 'success');
    fixture.clock.advance(1_250);
    assert.equal(await fixture.send('!decl'), 'guarded');
    assert.equal(cooldownCalls.at(-1)?.remainingMs, 3_750);
    assert.equal(cooldownCalls.at(-1)?.error.reason, 'COOLDOWN');
    assert.equal(cooldownCalls.at(-1)?.error.remainingMs, 3_750);

    assert.equal(await fixture.send('!prog'), 'success');
    fixture.clock.advance(500);
    assert.equal(await fixture.send('!prog'), 'guarded');
    assert.equal(cooldownCalls.at(-1)?.remainingMs, 3_500);
    assert.equal(cooldownCalls.at(-1)?.error.reason, 'COOLDOWN');
    assert.equal(cooldownCalls.at(-1)?.error.remainingMs, 3_500);
  } finally {
    await fixture.destroy();
  }
});

test('precedência de onCooldown e onDenied com override, null, fallback e erro', async () => {
  let cooldownMode: 'string' | 'payload' | 'null' | 'undefined' | 'throw' = 'string';
  let deniedMode: 'string' | 'null' | 'undefined' | 'throw' = 'string';
  let errorReplyCalls = 0;
  const hookFailure = new Error('falha no hook');

  const fixture = createTestBot({
    now: 1_000,
    errorReply(error) {
      errorReplyCalls++;
      return error instanceof GuardError ? `errorReply:${error.reason}` : 'erro';
    },
    hooks: {
      onCooldown(remainingMs, ctx): ErrorReplyResult {
        if (cooldownMode === 'string') return `Espere ${remainingMs}ms em ${ctx.command.name}`;
        if (cooldownMode === 'payload') return { embeds: [embed({ title: 'Cooldown', description: `${remainingMs}ms` })] };
        if (cooldownMode === 'null') return null;
        if (cooldownMode === 'undefined') return undefined;
        throw hookFailure;
      },
      onDenied(error, ctx): ErrorReplyResult {
        if (deniedMode === 'string') return `Negado(${error.reason}) em ${ctx.command.name}`;
        if (deniedMode === 'null') return null;
        if (deniedMode === 'undefined') return undefined;
        throw hookFailure;
      },
    },
    commands: [
      defineCommand({
        name: 'cool',
        cooldown: '2s',
        run: async ctx => { await ctx.reply('ok'); },
      }),
      defineCommand({
        name: 'check',
        checks: [() => 'Falhou check.'],
        run: async ctx => { await ctx.reply('ok'); },
      }),
      defineCommand({
        name: 'eco',
        run: async ctx => { await ctx.reply(ctx.input); },
      }),
    ],
  });

  try {
    assert.equal(await fixture.send('!cool'), 'success');
    fixture.clock.advance(500);

    cooldownMode = 'string';
    assert.equal(await fixture.send('!cool'), 'guarded');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'Espere 1500ms em cool');
    assert.equal(errorReplyCalls, 0);

    cooldownMode = 'payload';
    assert.equal(await fixture.send('!cool'), 'guarded');
    assert.equal(fixture.messages.at(-1)?.payload.embeds?.[0]?.title, 'Cooldown');
    assert.equal(errorReplyCalls, 0);

    cooldownMode = 'null';
    const beforeSilent = fixture.messages.length;
    assert.equal(await fixture.send('!cool'), 'guarded');
    assert.equal(fixture.messages.length, beforeSilent);
    assert.equal(errorReplyCalls, 0);

    cooldownMode = 'undefined';
    assert.equal(await fixture.send('!cool'), 'guarded');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'errorReply:COOLDOWN');
    assert.equal(errorReplyCalls, 1);

    cooldownMode = 'throw';
    assert.equal(await fixture.send('!cool'), 'guarded');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'Aguarde 2s antes de usar novamente.');
    assert.equal(errorReplyCalls, 1);
    assert.deepEqual(fixture.errors, [hookFailure]);

    fixture.errors.length = 0;
    errorReplyCalls = 0;

    deniedMode = 'string';
    assert.equal(await fixture.send('!check'), 'guarded');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'Negado(CHECK_FAILED) em check');
    assert.equal(errorReplyCalls, 0);

    deniedMode = 'null';
    const beforeDeniedSilent = fixture.messages.length;
    assert.equal(await fixture.send('!check'), 'guarded');
    assert.equal(fixture.messages.length, beforeDeniedSilent);
    assert.equal(errorReplyCalls, 0);

    deniedMode = 'undefined';
    assert.equal(await fixture.send('!check'), 'guarded');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'errorReply:CHECK_FAILED');
    assert.equal(errorReplyCalls, 1);

    deniedMode = 'throw';
    assert.equal(await fixture.send('!check'), 'guarded');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'Falhou check.');
    assert.equal(errorReplyCalls, 1);
    assert.deepEqual(fixture.errors, [hookFailure]);

    // Erro antes da criação de ctx (ex.: aspas abertas) não aciona onDenied e segue para errorReply.
    assert.equal(await fixture.send('!eco "sem fechar'), 'guarded');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'errorReply:INVALID_ARGUMENT');
    assert.equal(errorReplyCalls, 2);
  } finally {
    await fixture.destroy();
  }
});

test('COOLDOWN sem onCooldown configurado cai em errorReply sem acionar onDenied', async () => {
  let deniedCalls = 0;
  let errorReplyCalls = 0;

  const fixture = createTestBot({
    now: 1_000,
    errorReply(error) {
      errorReplyCalls++;
      return error instanceof GuardError ? `fallback:${error.reason}` : 'erro';
    },
    hooks: {
      onDenied() {
        deniedCalls++;
        return 'não deve rodar';
      },
    },
    commands: [defineCommand({ name: 'cool', cooldown: '3s', run: async ctx => { await ctx.reply('ok'); } })],
  });

  try {
    assert.equal(await fixture.send('!cool'), 'success');
    assert.equal(await fixture.send('!cool'), 'guarded');
    assert.equal(deniedCalls, 0);
    assert.equal(errorReplyCalls, 1);
    assert.equal(fixture.messages.at(-1)?.payload.content, 'fallback:COOLDOWN');
  } finally {
    await fixture.destroy();
  }
});

test('onUnknownCommand funciona com prefixo estático, dinâmico, deduplicação e falhas', async () => {
  const staticObserved: UnknownCommandContext[] = [];
  const staticOnCommand: string[] = [];
  const staticErrors: unknown[] = [];
  let staticReply: string | { content: string } | null | undefined = 'Comando desconhecido!';

  const staticTransport = new MockTransport();
  const staticBot = new Yuzuha({
    prefix: ['!', 'y!'],
    transport: staticTransport,
    store: new MemoryStore(),
    onCommand(ctx) { staticOnCommand.push(ctx.command.name); },
    onError(error) { staticErrors.push(error); },
    hooks: {
      async onUnknownCommand(info) {
        staticObserved.push(info);
        if (info.name === 'explode') throw new Error('falha desconhecida');
        return staticReply;
      },
    },
  });

  staticBot.command(defineCommand({
    name: 'config',
    subcommands: [defineCommand({ name: 'ver', run: async ctx => { await ctx.reply('ok'); } })],
  }));

  try {
    const first = mockMessage('y!NaoExiste arg1 arg2', { id: 'msg-1' });
    assert.equal(await staticBot.handle(first), 'ignored');
    assert.equal(staticObserved.length, 1);
    assert.equal(staticObserved[0]?.name, 'naoexiste');
    assert.equal(staticObserved[0]?.input, 'arg1 arg2');
    assert.equal(staticObserved[0]?.prefix, 'y!');
    assert.equal(staticObserved[0]?.message, first);
    assert.equal(staticTransport.messages.at(-1)?.payload.content, 'Comando desconhecido!');
    assert.equal(staticTransport.messages.at(-1)?.replyTo, 'msg-1');
    assert.deepEqual(staticOnCommand, []);

    // Mensagem duplicada é suprimida sem reexecutar o hook.
    assert.equal(await staticBot.handle(first), 'ignored');
    assert.equal(staticObserved.length, 1);

    // Mensagens sem comando ou de bots ou sem prefixo não acionam o hook.
    assert.equal(await staticBot.handle(mockMessage('sem prefixo')), 'ignored');
    assert.equal(await staticBot.handle(mockMessage('!   ')), 'ignored');
    assert.equal(await staticBot.handle(mockMessage('!naoexiste', { authorBot: true })), 'ignored');
    assert.equal(staticObserved.length, 1);

    // Comando raiz conhecido com subcomando desconhecido segue o fluxo normal de comando.
    assert.equal(await staticBot.handle(mockMessage('!config invalido')), 'guarded');
    assert.equal(staticObserved.length, 1);
    assert.deepEqual(staticOnCommand, ['config']);

    // null/undefined silenciam a resposta.
    staticReply = null;
    const countBefore = staticTransport.messages.length;
    assert.equal(await staticBot.handle(mockMessage('!outro')), 'ignored');
    assert.equal(staticTransport.messages.length, countBefore);

    staticReply = undefined;
    assert.equal(await staticBot.handle(mockMessage('!maisum')), 'ignored');
    assert.equal(staticTransport.messages.length, countBefore);

    // Payload com embed funciona.
    staticReply = { content: 'embed-info' };
    assert.equal(await staticBot.handle(mockMessage('!comembed')), 'ignored');
    assert.equal(staticTransport.messages.at(-1)?.payload.content, 'embed-info');

    // Erro lançado dentro do hook é reportado em onError e handle retorna ignored.
    assert.equal(await staticBot.handle(mockMessage('!explode')), 'ignored');
    assert.equal(staticErrors.length, 1);
  } finally {
    await staticBot.destroy();
  }

  // Prefixo dinâmico assíncrono + rastreamento em active/ALS + cancelamento em destroy.
  const dynamicTransport = new MockTransport();
  const dynamicObserved: UnknownCommandContext[] = [];
  let releasePrefix!: () => void;
  let releaseHook!: () => void;
  let hookEntered!: () => void;
  const prefixGate = new Promise<void>(resolve => { releasePrefix = resolve; });
  const hookGate = new Promise<void>(resolve => { releaseHook = resolve; });
  const entered = new Promise<void>(resolve => { hookEntered = resolve; });

  const dynamicBot = new Yuzuha({
    prefix: async message => {
      if (message.content.startsWith('?')) {
        await prefixGate;
      }
      return ['!', '?'];
    },
    transport: dynamicTransport,
    store: new MemoryStore(),
    hooks: {
      async onUnknownCommand(info) {
        dynamicObserved.push(info);
        if (info.name === 'lento') {
          hookEntered();
          await hookGate;
          return 'tarde demais';
        }
        if (info.name === 'fechar') {
          await dynamicBot.destroy();
          return 'não envia após destroy';
        }
        return `Desconhecido: ${info.prefix}${info.name}`;
      },
    },
  });

  try {
    assert.equal(await dynamicBot.handle(mockMessage('!faltante oi')), 'ignored');
    assert.equal(dynamicObserved.length, 1);
    assert.equal(dynamicObserved[0]?.name, 'faltante');
    assert.equal(dynamicObserved[0]?.input, 'oi');
    assert.equal(dynamicObserved[0]?.prefix, '!');
    assert.equal(dynamicTransport.messages.at(-1)?.payload.content, 'Desconhecido: !faltante');

    // Aborta enquanto aguarda prefixo dinâmico.
    const latePrefix = dynamicBot.handle(mockMessage('?tarde'));
    // Inicia um hook lento em andamento antes de destruir para validar drenagem e supressão de resposta.
    const slowHook = dynamicBot.handle(mockMessage('!lento'));
    await entered;
    const closing = dynamicBot.destroy();
    releasePrefix();
    releaseHook();
    assert.equal(await latePrefix, 'ignored');
    assert.equal(await slowHook, 'ignored');
    await closing;
    assert.equal(dynamicObserved.map(item => item.name).includes('tarde'), false);
    assert.equal(dynamicTransport.messages.some(item => item.payload.content === 'tarde demais'), false);
  } finally {
    await dynamicBot.destroy();
  }

  // destroy() dentro de onUnknownCommand não causa deadlock.
  const selfClosingTransport = new MockTransport();
  const selfClosingBot = new Yuzuha({
    prefix: '!',
    transport: selfClosingTransport,
    store: new MemoryStore(),
    hooks: {
      async onUnknownCommand() {
        await selfClosingBot.destroy();
        return 'descartado';
      },
    },
  });
  assert.equal(await selfClosingBot.handle(mockMessage('!fechar')), 'ignored');
  await selfClosingBot.destroy();
  assert.equal(selfClosingTransport.messages.length, 0);
});

test('onDenied cobre NOT_IN_GUILD e PERMISSION_MISSING_AUTHOR e falha de reply em onUnknownCommand chega a onError', async () => {
  const deniedReasons: string[] = [];
  const botErrors: unknown[] = [];
  const replyFailure = new Error('falha no reply');
  const transport = new MockTransport();
  const originalReply = transport.reply.bind(transport);

  const bot = new Yuzuha({
    prefix: '!',
    transport,
    store: new MemoryStore(),
    onError(error) { botErrors.push(error); },
    hooks: {
      onDenied(error) {
        deniedReasons.push(error.reason);
        return `Negado:${error.reason}`;
      },
      onUnknownCommand() {
        return 'tentativa';
      },
    },
  });

  bot.command(defineCommand({
    name: 'srv',
    guildOnly: true,
    run: async ctx => { await ctx.reply('ok'); },
  }));
  bot.command(defineCommand({
    name: 'adm',
    guildOnly: true,
    permissions: ['Administrator'],
    run: async ctx => { await ctx.reply('ok'); },
  }));

  try {
    assert.equal(await bot.handle(mockMessage('!srv', { guildID: undefined })), 'guarded');
    assert.equal(await bot.handle(mockMessage('!adm', { authorID: '2' })), 'guarded');
    assert.deepEqual(deniedReasons, ['NOT_IN_GUILD', 'PERMISSION_MISSING_AUTHOR']);
    assert.equal(transport.messages.at(-1)?.payload.content, 'Negado:PERMISSION_MISSING_AUTHOR');

    transport.reply = async () => { throw replyFailure; };
    assert.equal(await bot.handle(mockMessage('!desconhecido')), 'ignored');
    assert.deepEqual(botErrors, [replyFailure]);
    transport.reply = originalReply;
  } finally {
    await bot.destroy();
  }
});
