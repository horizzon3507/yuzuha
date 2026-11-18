import test from 'node:test';
import assert from 'node:assert/strict';
import { Guild, GuildMember, User } from '@fluxerjs/core';
import {
  ConfigError,
  GuardError,
  MemoryStore,
  Yuzuha,
  YuzuhaError,
  defineCommand,
  isGuardReason,
  isYuzuhaError,
} from '../src/index.js';
import type { ErrorReportInfo, GuardReason, IncomingMessage, MessageGate, RateLimiter } from '../src/index.js';
import { MockTransport, createTestBot, mockMessage } from '../src/testing.js';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('owners, bot.isOwner e ctx.isOwner suportam IDs curtos e snowflakes e isolam mutações externas', async () => {
  const mutableOwners = ['1', 'user-dev', '123456789012345678'];
  const eventChecks: boolean[] = [];

  const fixture = createTestBot({
    owners: mutableOwners,
    commands: [
      defineCommand({
        name: 'quem',
        async run(ctx) {
          await ctx.reply(`${ctx.authorID}:${ctx.isOwner()}`);
        },
      }),
    ],
  });

  // Mutar o array original não afeta o conjunto interno do bot.
  mutableOwners.push('intruso');
  mutableOwners.length = 0;

  fixture.bot.contextEvent({
    event: 'guildMemberAdd',
    run(ctx) {
      eventChecks.push(ctx.isOwner());
    },
  });

  try {
    assert.equal(fixture.bot.isOwner('1'), true);
    assert.equal(fixture.bot.isOwner('user-dev'), true);
    assert.equal(fixture.bot.isOwner('123456789012345678'), true);
    assert.equal(fixture.bot.isOwner('2'), false);
    assert.equal(fixture.bot.isOwner('intruso'), false);
    assert.equal(fixture.bot.isOwner(''), false);

    assert.equal(await fixture.send('!quem', { authorID: '1' }), 'success');
    assert.equal(fixture.messages.at(-1)?.payload.content, '1:true');

    assert.equal(await fixture.send('!quem', { authorID: 'user-dev' }), 'success');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'user-dev:true');

    assert.equal(await fixture.send('!quem', { authorID: '2' }), 'success');
    assert.equal(fixture.messages.at(-1)?.payload.content, '2:false');

    const guild = new Guild(fixture.bot.client, { id: '100', name: 'Teste', ownerId: '1' });
    const makeMember = (id: string) => new GuildMember(fixture.bot.client, {
      user: { id, username: 'U', discriminator: '0000', global_name: null, avatar: null, avatar_color: null, flags: 0, bot: false },
      roles: [],
      joined_at: '2026-10-21T00:00:00.000Z',
      mute: false,
      deaf: false,
    }, guild);
    fixture.bot.client.emit('guildMemberAdd', makeMember('user-dev'));
    fixture.bot.client.emit('guildMemberAdd', makeMember('2'));
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(eventChecks, [true, false]);
    assert.ok(new User(fixture.bot.client, {
      id: '1', username: 'U', discriminator: '0000', global_name: null, avatar: null, avatar_color: null, flags: 0, bot: false,
    }));
  } finally {
    await fixture.destroy();
  }
});

test('ownerOnly protege comandos e subcomandos, aciona onDenied com OWNER_ONLY e barra antes de permissões/cooldown', async () => {
  const denied: { reason: GuardReason; command: string; message: string }[] = [];

  const fixture = createTestBot({
    owners: ['owner-1'],
    hooks: {
      onDenied(error, ctx) {
        denied.push({ reason: error.reason, command: ctx.command.name, message: error.message });
        return `negado:${error.reason}:${ctx.command.name}`;
      },
    },
    commands: [
      defineCommand({
        name: 'eval',
        ownerOnly: true,
        permissions: ['Administrator'],
        cooldown: { duration: '60s', scope: 'global', uses: 1 },
        async run(ctx) { await ctx.reply('executado'); },
      }),
      defineCommand({
        name: 'sistema',
        ownerOnly: true,
        subcommands: [
          defineCommand({
            name: 'reiniciar',
            ownerOnly: false, // filho não relaxa ownerOnly do pai
            async run(ctx) { await ctx.reply('reiniciando'); },
          }),
        ],
      }),
    ],
  });

  fixture.transport.setMember('100', { id: 'owner-1', owner: false, permissions: 1n << 3n, rank: 50 });

  try {
    fixture.transport.resetCalls();
    // Usuário comum (mesmo sendo dono do servidor '1' no MockTransport) não é dono do bot.
    assert.equal(await fixture.send('!eval', { authorID: '1' }), 'guarded');
    assert.equal(fixture.transport.calls.member, 0);
    assert.deepEqual(denied.at(-1), {
      reason: 'OWNER_ONLY',
      command: 'eval',
      message: 'Apenas os donos do bot podem usar este comando.',
    });
    assert.equal(fixture.messages.at(-1)?.payload.content, 'negado:OWNER_ONLY:eval');

    // A tentativa negada não consumiu o cooldown global de uso único.
    assert.equal(await fixture.send('!eval', { authorID: 'owner-1' }), 'success');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'executado');

    // Herança em grupo pai não pode ser relaxada por subcomando.
    assert.equal(await fixture.send('!sistema reiniciar', { authorID: '2' }), 'guarded');
    assert.equal(denied.at(-1)?.reason, 'OWNER_ONLY');
    assert.equal(denied.at(-1)?.command, 'sistema reiniciar');

    assert.equal(await fixture.send('!sistema reiniciar', { authorID: 'owner-1' }), 'success');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'reiniciando');

    const sample = new GuardError('restrito', 'OWNER_ONLY');
    assert.equal(isGuardReason(sample, 'OWNER_ONLY'), true);
    assert.equal(isGuardReason(sample, 'DEV_ONLY'), false);
  } finally {
    await fixture.destroy();
  }
});

test('devGuilds e devOnly restringem comandos e subcomandos aos servidores de desenvolvimento (incluindo DM e lista vazia)', async () => {
  const deniedReasons: GuardReason[] = [];

  const fixture = createTestBot({
    devGuilds: ['guild-dev', '101'],
    hooks: {
      onDenied(error) {
        deniedReasons.push(error.reason);
      },
    },
    commands: [
      defineCommand({
        name: 'debug',
        devOnly: true,
        async run(ctx) { await ctx.reply(`dev:${ctx.guildID}`); },
      }),
      defineCommand({
        name: 'interno',
        devOnly: true,
        subcommands: [
          defineCommand({
            name: 'seed',
            devOnly: false, // não relaxa devOnly do grupo pai
            async run(ctx) { await ctx.reply('seeded'); },
          }),
        ],
      }),
    ],
  });

  const withoutDevGuilds = createTestBot({
    commands: [
      defineCommand({
        name: 'debug',
        devOnly: true,
        async run(ctx) { await ctx.reply('nunca'); },
      }),
    ],
  });

  try {
    // Servidor fora de devGuilds é recusado com DEV_ONLY.
    assert.equal(await fixture.send('!debug', { guildID: '100' }), 'guarded');
    assert.equal(deniedReasons.at(-1), 'DEV_ONLY');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'Este comando está restrito aos servidores de desenvolvimento.');

    // Em DM também é recusado com DEV_ONLY.
    assert.equal(await fixture.send('!debug', { guildID: undefined, channelID: 'dm-1' }), 'guarded');
    assert.equal(deniedReasons.at(-1), 'DEV_ONLY');

    // Nos servidores configurados em devGuilds, funciona normalmente.
    assert.equal(await fixture.send('!debug', { guildID: 'guild-dev' }), 'success');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'dev:guild-dev');
    assert.equal(await fixture.send('!debug', { guildID: '101' }), 'success');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'dev:101');

    // Herança em subcomandos.
    assert.equal(await fixture.send('!interno seed', { guildID: '100' }), 'guarded');
    assert.equal(deniedReasons.at(-1), 'DEV_ONLY');
    assert.equal(await fixture.send('!interno seed', { guildID: 'guild-dev' }), 'success');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'seeded');

    // Quando devGuilds está omitido/vazio, devOnly bloqueia em qualquer servidor.
    assert.equal(await withoutDevGuilds.send('!debug', { guildID: '100' }), 'guarded');
    assert.equal(withoutDevGuilds.messages.at(-1)?.payload.content, 'Este comando está restrito aos servidores de desenvolvimento.');
  } finally {
    await fixture.destroy();
    await withoutDevGuilds.destroy();
  }
});

test('gate síncrono e assíncrono barra antes de prefixo dinâmico, duplicate() e onUnknownCommand, e drena em destroy()', async () => {
  let maintenance = true;
  const blacklisted = new Set(['banido']);
  let prefixCalls = 0;
  let duplicateCalls = 0;
  let unknownCalls = 0;
  let commandRuns = 0;

  const customLimiter: RateLimiter = {
    cooldown: () => 0,
    duplicate() {
      duplicateCalls++;
      return false;
    },
  };

  // 1. Gate síncrono.
  const syncGate: MessageGate = message => !maintenance && !blacklisted.has(message.authorID);
  const syncBot = new Yuzuha({
    prefix: async () => {
      prefixCalls++;
      return '!';
    },
    prefixCache: { ttlMs: 60_000 },
    gate: syncGate,
    rateLimiter: customLimiter,
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    hooks: {
      onUnknownCommand() {
        unknownCalls++;
        return 'desconhecido';
      },
    },
  });
  syncBot.command(defineCommand({ name: 'ping', run() { commandRuns++; } }));

  try {
    // Em manutenção, nem prefix dinâmico nem duplicate() nem onUnknownCommand rodam.
    const msg = mockMessage('!ping', { id: 'g-1', authorID: '1' });
    assert.equal(await syncBot.handle(msg), 'ignored');
    assert.equal(await syncBot.handle(mockMessage('!inexistente', { id: 'g-2', authorID: '1' })), 'ignored');
    assert.equal(prefixCalls, 0);
    assert.equal(duplicateCalls, 0);
    assert.equal(unknownCalls, 0);
    assert.equal(commandRuns, 0);

    // Desativada a manutenção, a mesma mensagem 'g-1' ainda não foi marcada como duplicada e executa!
    maintenance = false;
    assert.equal(await syncBot.handle(msg), 'success');
    assert.equal(prefixCalls, 1);
    assert.equal(duplicateCalls, 1);
    assert.equal(commandRuns, 1);

    // Mesmo com prefixCache quente, usuário em blacklist é barrado antes de duplicate() e hooks.
    assert.equal(await syncBot.handle(mockMessage('!ping', { id: 'g-3', authorID: 'banido' })), 'ignored');
    assert.equal(await syncBot.handle(mockMessage('!inexistente', { id: 'g-4', authorID: 'banido' })), 'ignored');
    assert.equal(prefixCalls, 1);
    assert.equal(duplicateCalls, 1);
    assert.equal(unknownCalls, 0);
    assert.equal(commandRuns, 1);
  } finally {
    await syncBot.destroy();
  }

  // 2. Gate assíncrono + drenagem no destroy().
  let asyncPrefixCalls = 0;
  let asyncDuplicateCalls = 0;
  let asyncRuns = 0;
  let gateCalls = 0;
  const slowGate = deferred<boolean>();

  const asyncBot = new Yuzuha({
    prefix: '!',
    gate: async message => {
      gateCalls++;
      if (message.id === 'slow') return slowGate.promise;
      await Promise.resolve();
      return message.authorID !== 'bloqueado';
    },
    rateLimiter: {
      cooldown: () => 0,
      duplicate: () => {
        asyncDuplicateCalls++;
        return false;
      },
    },
    prefixCache: false,
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
  });
  asyncBot.command(defineCommand({
    name: 'eco',
    run() {
      asyncPrefixCalls++;
      asyncRuns++;
    },
  }));

  try {
    // Mensagens de bots são ignoradas antes mesmo de chamar gate.
    assert.equal(await asyncBot.handle(mockMessage('!eco', { id: 'bot-msg', authorBot: true })), 'ignored');
    assert.equal(gateCalls, 0);

    // Gate assíncrono retornando false não chama duplicate() mesmo com prefixo estático '!'.
    assert.equal(await asyncBot.handle(mockMessage('!eco', { id: 'a-1', authorID: 'bloqueado' })), 'ignored');
    assert.equal(asyncDuplicateCalls, 0);
    assert.equal(asyncRuns, 0);

    assert.equal(await asyncBot.handle(mockMessage('!eco', { id: 'a-2', authorID: '1' })), 'success');
    assert.equal(asyncDuplicateCalls, 1);
    assert.equal(asyncPrefixCalls, 1);
    assert.equal(asyncRuns, 1);

    // Destroy aguarda gate assíncrono pendente e aborta despacho como 'ignored'.
    const pending = asyncBot.handle(mockMessage('!eco', { id: 'slow', authorID: '1' }));
    let closed = false;
    const closing = asyncBot.destroy().then(() => { closed = true; });
    await Promise.resolve();
    assert.equal(closed, false);
    slowGate.resolve(true);
    assert.equal(await pending, 'ignored');
    await closing;
    assert.equal(closed, true);
    assert.equal(asyncRuns, 1);
  } finally {
    await asyncBot.destroy();
  }
});

test('erros lançados em gate reportam { source: "hook", event: "gate" } e tarefas agendadas ignoram gate preservando guards', async () => {
  const reports: { error: unknown; info: ErrorReportInfo }[] = [];
  const scheduledDenied: GuardReason[] = [];
  let mode: 'sync-throw' | 'async-reject' | 'block-all' = 'sync-throw';

  const fixture = createTestBot({
    now: 1_000,
    owners: ['owner-1'],
    gate(message: IncomingMessage) {
      if (mode === 'sync-throw') throw new Error(`sync-fail:${message.id}`);
      if (mode === 'async-reject') return Promise.reject(new Error(`async-fail:${message.id}`));
      return false;
    },
    hooks: {
      onDenied(error) {
        scheduledDenied.push(error.reason);
      },
    },
    onError(error, _ctx, info) {
      reports.push({ error, info });
    },
    commands: [
      defineCommand({
        name: 'rotina',
        async run(ctx) { await ctx.send(`executou:${ctx.authorID}`); },
      }),
      defineCommand({
        name: 'restrito',
        ownerOnly: true,
        async run(ctx) { await ctx.send('dono-ok'); },
      }),
    ],
  });

  try {
    assert.equal(await fixture.send('!rotina', { id: 'err-1' }), 'ignored');
    assert.equal(reports.length, 1);
    assert.equal((reports[0]!.error as Error).message, 'sync-fail:err-1');
    assert.equal(reports[0]!.info.source, 'hook');
    assert.equal(reports[0]!.info.event, 'gate');
    assert.equal(typeof reports[0]!.info.executionID, 'string');

    mode = 'async-reject';
    assert.equal(await fixture.send('!rotina', { id: 'err-2' }), 'ignored');
    assert.equal(reports.length, 2);
    assert.equal((reports[1]!.error as Error).message, 'async-fail:err-2');
    assert.equal(reports[1]!.info.source, 'hook');
    assert.equal(reports[1]!.info.event, 'gate');

    // Com gate bloqueando todas as mensagens externas, tarefas internas do Scheduler continuam rodando,
    // mas continuam sujeitas aos guards declarativos do comando (como ownerOnly).
    mode = 'block-all';
    assert.equal(await fixture.send('!rotina'), 'ignored');

    await fixture.bot.scheduler!.add({
      guildID: '100',
      channelID: '200',
      authorID: '2',
      command: 'rotina',
      input: '',
      due: 2_000,
    });
    const restrictedTask = await fixture.bot.scheduler!.add({
      guildID: '100',
      channelID: '200',
      authorID: '2',
      command: 'restrito',
      input: '',
      due: 2_000,
    });

    await fixture.tick(1_000);
    assert.equal(fixture.messages.some(m => m.payload.content === 'executou:2'), true);
    const failed = await fixture.bot.scheduler!.failed({ guildID: '100', authorID: '2' });
    assert.equal(failed.length, 1);
    assert.equal(failed[0]?.task.id, restrictedTask);
    assert.equal(failed[0]?.task.command, 'restrito');
    assert.equal(failed[0]?.errorCode, 'SCHEDULE_EXECUTION');
    assert.equal(failed[0]?.retryable, false);
    assert.deepEqual(scheduledDenied, ['OWNER_ONLY']);
  } finally {
    await fixture.destroy();
  }
});

test('construtor e registro validam owners, devGuilds, gate, ownerOnly e devOnly', async () => {
  const invalidArrays: unknown[] = [
    null,
    '1',
    123,
    {},
    [123],
    [null],
    [''],
    ['   '],
    [' 1'],
    ['1 '],
    ['ok', '  '],
  ];

  for (const invalid of invalidArrays) {
    assert.throws(
      () => new Yuzuha({ owners: invalid as never, transport: new MockTransport(), store: new MemoryStore(), scheduler: false }),
      error => error instanceof ConfigError && isYuzuhaError(error, 'OPTIONS'),
    );
    assert.throws(
      () => new Yuzuha({ devGuilds: invalid as never, transport: new MockTransport(), store: new MemoryStore(), scheduler: false }),
      error => error instanceof ConfigError && isYuzuhaError(error, 'OPTIONS'),
    );
  }

  for (const invalidGate of [null, true, false, 'gate', 42, {}, []]) {
    assert.throws(
      () => new Yuzuha({ gate: invalidGate as never, transport: new MockTransport(), store: new MemoryStore(), scheduler: false }),
      error => error instanceof ConfigError && isYuzuhaError(error, 'OPTIONS'),
    );
  }

  const bot = new Yuzuha({ owners: [], devGuilds: [], transport: new MockTransport(), store: new MemoryStore(), scheduler: false });
  try {
    for (const badBool of ['true', 1, 0, null, {}, []]) {
      assert.throws(
        () => bot.command({ name: 'bad-owner', ownerOnly: badBool as never, run() {} }),
        error => error instanceof YuzuhaError && isYuzuhaError(error, 'COMMAND_METADATA'),
      );
      assert.throws(
        () => bot.command({ name: 'bad-dev', devOnly: badBool as never, run() {} }),
        error => error instanceof YuzuhaError && isYuzuhaError(error, 'COMMAND_METADATA'),
      );
    }
  } finally {
    await bot.destroy();
  }
});
