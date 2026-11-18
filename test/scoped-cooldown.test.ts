import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GuardError,
  MemoryRateLimiter,
  MemoryStore,
  Yuzuha,
  YuzuhaError,
  defineCommand,
  isGuardReason,
  isYuzuhaError,
} from '../src/index.js';
import type { CooldownOptions, CooldownScope, RateLimiter } from '../src/index.js';
import { MockTransport, TestClock, createTestBot, mockMessage } from '../src/testing.js';

test('MemoryRateLimiter suporta maxUses >= 1 com janela fixa, sweep, evict e throw', async () => {
  let now = 1_000;
  let evictions = 0;
  const limiter = new MemoryRateLimiter({
    now: () => now,
    maxCooldowns: 2,
    onCooldownCapacity: 'evict',
    onEvict: () => { evictions++; },
  });

  for (const invalid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => limiter.cooldown('bad', 1_000, invalid),
      error => isYuzuhaError(error, 'ARGUMENT'),
    );
  }

  // Janela [1000, 11000) com 3 usos permitidos.
  assert.equal(limiter.cooldown('burst', 10_000, 3), 0);
  now = 2_500;
  assert.equal(limiter.cooldown('burst', 10_000, 3), 0);
  now = 4_000;
  assert.equal(limiter.cooldown('burst', 10_000, 3), 0);
  now = 4_500;
  assert.equal(limiter.cooldown('burst', 10_000, 3), 6_500);
  // Rollback de relógio mantém janela ativa.
  now = 3_000;
  assert.equal(limiter.cooldown('burst', 10_000, 3), 8_000);
  now = 10_999;
  assert.equal(limiter.cooldown('burst', 10_000, 3), 1);
  // Expiração exata em start + durationMs abre nova janela.
  now = 11_000;
  assert.equal(limiter.cooldown('burst', 10_000, 3), 0);

  // Capacidade com evict remove a janela multi-use que expira mais cedo (burst expira em 21000).
  assert.equal(limiter.cooldown('longer', 30_000, 2), 0); // expira em 41000
  assert.equal(evictions, 0);
  assert.equal(limiter.cooldown('overflow', 25_000, 2), 0); // despeja 'burst'
  assert.equal(evictions, 1);

  // 'longer' preservou seu uso anterior (1 de 2 consumido); 2º uso passa, 3º bloqueia.
  now = 12_000;
  assert.equal(limiter.cooldown('longer', 30_000, 2), 0);
  assert.equal(limiter.cooldown('longer', 30_000, 2), 29_000);

  await limiter.close();
  assert.equal(limiter.cooldown('longer', 30_000, 2), 0);

  // Modo throw coleta janelas multi-use expiradas no sweep forçado e lança quando realmente cheio.
  let throwTime = 0;
  const strictLimiter = new MemoryRateLimiter({
    now: () => throwTime,
    maxCooldowns: 2,
    onCooldownCapacity: 'throw',
  });
  assert.equal(strictLimiter.cooldown('k1', 100, 2), 0);
  assert.equal(strictLimiter.cooldown('k2', 5_000, 2), 0);
  assert.throws(
    () => strictLimiter.cooldown('k3', 500, 2),
    error => isYuzuhaError(error, 'COOLDOWN_CAPACITY'),
  );
  throwTime = 100;
  assert.equal(strictLimiter.cooldown('k3', 500, 2), 0);
});

test('escopos declarativos e imperativos isolam chaves conforme scope (omitido, user, channel, guild, global)', async () => {
  const scopes: (CooldownScope | undefined)[] = [undefined, 'user', 'channel', 'guild', 'global'];
  for (const scope of scopes) {
    assert.ok(scope === undefined || ['user', 'channel', 'guild', 'global'].includes(scope));
  }

  const fixture = createTestBot({
    now: 5_000,
    commands: [
      defineCommand({
        name: 'legado',
        cooldown: { duration: '10s' },
        async run(ctx) { await ctx.reply('ok'); },
      }),
      defineCommand({
        name: 'por-usuario',
        cooldown: { duration: '10s', scope: 'user' },
        async run(ctx) { await ctx.reply('ok'); },
      }),
      defineCommand({
        name: 'por-canal',
        cooldown: { duration: '10s', scope: 'channel' },
        async run(ctx) { await ctx.reply('ok'); },
      }),
      defineCommand({
        name: 'por-servidor',
        cooldown: { duration: '10s', scope: 'guild' },
        async run(ctx) { await ctx.reply('ok'); },
      }),
      defineCommand({
        name: 'global',
        cooldown: { duration: '10s', scope: 'global' },
        async run(ctx) { await ctx.reply('ok'); },
      }),
      defineCommand({
        name: 'imp-canal',
        async run(ctx) {
          ctx.cooldown({ duration: '8s', scope: 'channel' }, 'Canal em espera: {remaining}');
          await ctx.reply('ok');
        },
      }),
    ],
  });

  try {
    // 1. Escopo omitido preserva chave legada [guildID, channelID, authorID, commandName].
    assert.equal(await fixture.send('!legado', { guildID: '100', channelID: '200', authorID: '1' }), 'success');
    assert.equal(await fixture.send('!legado', { guildID: '100', channelID: '200', authorID: '1' }), 'guarded');
    assert.equal(await fixture.send('!legado', { guildID: '100', channelID: '201', authorID: '1' }), 'success');
    assert.equal(await fixture.send('!legado', { guildID: '100', channelID: '200', authorID: '2' }), 'success');

    // 2. Escopo 'user' acompanha o autor entre canais e servidores, mas libera outros usuários.
    assert.equal(await fixture.send('!por-usuario', { guildID: '100', channelID: '200', authorID: '1' }), 'success');
    assert.equal(await fixture.send('!por-usuario', { guildID: '100', channelID: '201', authorID: '1' }), 'guarded');
    assert.equal(await fixture.send('!por-usuario', { guildID: '999', channelID: '999', authorID: '1' }), 'guarded');
    assert.equal(await fixture.send('!por-usuario', { guildID: '100', channelID: '200', authorID: '2' }), 'success');

    // 3. Escopo 'channel' bloqueia outros autores no mesmo canal e libera outros canais.
    assert.equal(await fixture.send('!por-canal', { guildID: '100', channelID: '200', authorID: '1' }), 'success');
    assert.equal(await fixture.send('!por-canal', { guildID: '100', channelID: '200', authorID: '2' }), 'guarded');
    assert.equal(await fixture.send('!por-canal', { guildID: '100', channelID: '201', authorID: '1' }), 'success');

    // 4. Escopo 'guild' bloqueia todo o servidor (inclusive outros canais) e usa channelID em DM.
    assert.equal(await fixture.send('!por-servidor', { guildID: '100', channelID: '200', authorID: '1' }), 'success');
    assert.equal(await fixture.send('!por-servidor', { guildID: '100', channelID: '201', authorID: '2' }), 'guarded');
    assert.equal(await fixture.send('!por-servidor', { guildID: '101', channelID: '300', authorID: '1' }), 'success');
    assert.equal(await fixture.send('!por-servidor', { guildID: undefined, channelID: 'dm-1', authorID: '1' }), 'success');
    assert.equal(await fixture.send('!por-servidor', { guildID: undefined, channelID: 'dm-1', authorID: '1' }), 'guarded');
    assert.equal(await fixture.send('!por-servidor', { guildID: undefined, channelID: 'dm-2', authorID: '2' }), 'success');

    // 5. Escopo 'global' bloqueia todas as origens até expirar.
    assert.equal(await fixture.send('!global', { guildID: '100', channelID: '200', authorID: '1' }), 'success');
    assert.equal(await fixture.send('!global', { guildID: '200', channelID: '999', authorID: '2' }), 'guarded');
    assert.equal(await fixture.send('!global', { guildID: undefined, channelID: 'dm-9', authorID: '9' }), 'guarded');

    // 6. ctx.cooldown imperativo também respeita escopo e mensagem customizada.
    assert.equal(await fixture.send('!imp-canal', { channelID: '200', authorID: '1' }), 'success');
    fixture.clock.advance(2_000);
    assert.equal(await fixture.send('!imp-canal', { channelID: '200', authorID: '2' }), 'guarded');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'Canal em espera: 6s');

    fixture.clock.advance(8_000);
    assert.equal(await fixture.send('!global', { guildID: '200', channelID: '999', authorID: '2' }), 'success');
  } finally {
    await fixture.destroy();
  }
});

test('uses: 3 e bypass síncrono/assíncrono funcionam sem consumir usos e preservam retorno síncrono quando possível', async () => {
  const cooldownRemaining: number[] = [];
  let syncVoidChecks = 0;
  let syncThrowObserved = false;

  const fixture = createTestBot({
    now: 20_000,
    hooks: {
      onCooldown(remainingMs) {
        cooldownRemaining.push(remainingMs);
      },
    },
    commands: [
      defineCommand({
        name: 'burst',
        cooldown: {
          duration: '10s',
          scope: 'guild',
          uses: 3,
          bypass: ctx => ctx.authorID === 'vip-sync',
        },
        async run(ctx) { await ctx.reply(`burst:${ctx.authorID}`); },
      }),
      defineCommand({
        name: 'burst-async',
        cooldown: {
          duration: '10s',
          scope: 'global',
          uses: 2,
          bypass: async ctx => {
            await Promise.resolve();
            return ctx.authorID === 'vip-async';
          },
        },
        async run(ctx) { await ctx.reply(`async:${ctx.authorID}`); },
      }),
      defineCommand({
        name: 'imp-sync',
        run(ctx) {
          try {
            const ret = ctx.cooldown({
              duration: '6s',
              scope: 'channel',
              uses: 2,
              bypass: inner => inner.authorID === 'vip-sync',
            });
            assert.equal(ret, undefined);
            syncVoidChecks++;
          } catch (error) {
            syncThrowObserved = isGuardReason(error, 'COOLDOWN');
            throw error;
          }
        },
      }),
      defineCommand({
        name: 'imp-async',
        async run(ctx) {
          const maybePromise = ctx.cooldown({
            duration: '6s',
            scope: 'channel',
            uses: 1,
            bypass: async inner => {
              await Promise.resolve();
              return inner.authorID === 'vip-async';
            },
          }, 'Bloqueado por {remaining}');
          assert.ok(maybePromise instanceof Promise);
          await maybePromise;
          await ctx.reply('imp-async-ok');
        },
      }),
    ],
  });

  try {
    // Chamadas com bypass síncrono NÃO consomem usos da janela uses: 3.
    for (let i = 0; i < 4; i++) {
      assert.equal(await fixture.send('!burst', { authorID: 'vip-sync' }), 'success');
    }
    // Os 3 usos da janela continuam intactos para usuários comuns.
    assert.equal(await fixture.send('!burst', { authorID: '1' }), 'success');
    fixture.clock.advance(1_000);
    assert.equal(await fixture.send('!burst', { authorID: '2' }), 'success');
    fixture.clock.advance(1_000);
    assert.equal(await fixture.send('!burst', { authorID: '3' }), 'success');
    fixture.clock.advance(1_500);
    // 4ª chamada sem bypass dentro de [20000, 30000) é bloqueada com until - time = 6500ms.
    assert.equal(await fixture.send('!burst', { authorID: '4' }), 'guarded');
    assert.equal(cooldownRemaining.at(-1), 6_500);
    // Usuário com bypass continua passando mesmo com a janela esgotada.
    assert.equal(await fixture.send('!burst', { authorID: 'vip-sync' }), 'success');

    // Bypass assíncrono em cooldown declarativo também não consome janela.
    assert.equal(await fixture.send('!burst-async', { authorID: 'vip-async' }), 'success');
    assert.equal(await fixture.send('!burst-async', { authorID: 'vip-async' }), 'success');
    assert.equal(await fixture.send('!burst-async', { authorID: '1' }), 'success');
    assert.equal(await fixture.send('!burst-async', { authorID: '2' }), 'success');
    assert.equal(await fixture.send('!burst-async', { authorID: '3' }), 'guarded');
    assert.equal(await fixture.send('!burst-async', { authorID: 'vip-async' }), 'success');

    // ctx.cooldown imperativo com bypass síncrono preserva retorno void síncrono e lançamento síncrono.
    assert.equal(await fixture.send('!imp-sync', { authorID: 'vip-sync' }), 'success');
    assert.equal(await fixture.send('!imp-sync', { authorID: '1' }), 'success');
    assert.equal(await fixture.send('!imp-sync', { authorID: '2' }), 'success');
    assert.equal(syncVoidChecks, 3);
    assert.equal(await fixture.send('!imp-sync', { authorID: '3' }), 'guarded');
    assert.equal(syncThrowObserved, true);

    // ctx.cooldown imperativo com bypass assíncrono retorna Promise e respeita bypass.
    assert.equal(await fixture.send('!imp-async', { authorID: 'vip-async' }), 'success');
    assert.equal(await fixture.send('!imp-async', { authorID: '1' }), 'success');
    assert.equal(await fixture.send('!imp-async', { authorID: '2' }), 'guarded');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'Bloqueado por 6s');
    assert.equal(await fixture.send('!imp-async', { authorID: 'vip-async' }), 'success');
  } finally {
    await fixture.destroy();
  }
});

test('herança em lineage de subcomandos compartilha escopo, uses e bypass do grupo pai', async () => {
  const fixture = createTestBot({
    now: 1_000,
    commands: [
      defineCommand({
        name: 'painel',
        cooldown: {
          duration: '30s',
          scope: 'guild',
          uses: 2,
          bypass: ctx => ctx.authorID === 'admin-bypass',
        },
        subcommands: [
          defineCommand({
            name: 'sincronizar',
            cooldown: { duration: '5s', scope: 'user' },
            async run(ctx) { await ctx.reply('sync'); },
          }),
          defineCommand({
            name: 'status',
            async run(ctx) { await ctx.reply('status'); },
          }),
        ],
      }),
    ],
  });

  try {
    // Bypass no grupo pai não consome usos compartilhados entre irmãos.
    assert.equal(await fixture.send('!painel sincronizar', { authorID: 'admin-bypass' }), 'success');
    assert.equal(await fixture.send('!painel status', { authorID: 'admin-bypass' }), 'success');

    // Uso 1 de 2 no grupo pai (guild '100') + cooldown por usuário em 'painel sincronizar'.
    assert.equal(await fixture.send('!painel sincronizar', { authorID: '1', channelID: '200' }), 'success');
    // Uso 2 de 2 no grupo pai consumido por irmão em outro canal do mesmo servidor.
    assert.equal(await fixture.send('!painel status', { authorID: '2', channelID: '201' }), 'success');
    // 3º uso no servidor '100' bloqueado pelo cooldown do grupo pai.
    assert.equal(await fixture.send('!painel status', { authorID: '3', channelID: '202' }), 'guarded');
    // Outro servidor possui sua própria janela.
    assert.equal(await fixture.send('!painel sincronizar', { guildID: '200', authorID: '2', channelID: '300' }), 'success');
    // Mesmo com 1 vaga livre no servidor '200', o mesmo autor sofre o cooldown 'user' da folha em qualquer servidor.
    assert.equal(await fixture.send('!painel sincronizar', { guildID: '200', authorID: '2', channelID: '301' }), 'guarded');
  } finally {
    await fixture.destroy();
  }
});

test('RateLimiter customizado recebe maxUses e continua compatível com implementações de 2 argumentos', async () => {
  const clock = new TestClock(0);
  const backing = new MemoryRateLimiter({ now: clock.now });
  const observed: { key: string; durationMs: number; maxUses: number | undefined; arity: number }[] = [];

  const threeArgLimiter: RateLimiter = {
    async cooldown(key: string, durationMs: number, maxUses?: number): Promise<number> {
      observed.push({ key, durationMs, maxUses, arity: arguments.length });
      return backing.cooldown(key, durationMs, maxUses);
    },
    duplicate: (ch, msg) => backing.duplicate(ch, msg),
  };

  // Implementação legada com apenas 2 parâmetros permanece 100% compatível em tipos e execução.
  const legacyTwoArgLimiter: RateLimiter = {
    cooldown(key: string, durationMs: number): number {
      return backing.cooldown(key, durationMs);
    },
    duplicate(channelID: string, messageID: string): boolean {
      return backing.duplicate(channelID, messageID);
    },
  };

  const bot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    rateLimiter: threeArgLimiter,
  });
  bot.command(defineCommand({
    name: 'multi',
    cooldown: { duration: '5s', scope: 'global', uses: 2 },
    run() {},
  }));
  bot.command(defineCommand({
    name: 'single',
    cooldown: '3s',
    run() {},
  }));

  const legacyBot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    rateLimiter: legacyTwoArgLimiter,
  });
  legacyBot.command(defineCommand({ name: 'ping', cooldown: '2s', run() {} }));

  try {
    assert.equal(await bot.handle(mockMessage('!multi', { id: 'c-1' })), 'success');
    assert.equal(await bot.handle(mockMessage('!multi', { id: 'c-2' })), 'success');
    assert.equal(await bot.handle(mockMessage('!multi', { id: 'c-3' })), 'guarded');
    assert.equal(await bot.handle(mockMessage('!single', { id: 'c-4' })), 'success');

    assert.deepEqual(observed[0], {
      key: JSON.stringify(['global', 'multi']),
      durationMs: 5_000,
      maxUses: 2,
      arity: 3,
    });
    assert.deepEqual(observed[3], {
      key: JSON.stringify(['100', '200', '1', 'single']),
      durationMs: 3_000,
      maxUses: undefined,
      arity: 2,
    });

    assert.equal(await legacyBot.handle(mockMessage('!ping', { id: 'leg-1' })), 'success');
    assert.equal(await legacyBot.handle(mockMessage('!ping', { id: 'leg-2' })), 'guarded');
  } finally {
    await bot.destroy();
    await legacyBot.destroy();
  }
});

test('validação de CooldownOptions rejeita metadados inválidos no registro e em ctx.cooldown e isola snapshots', async () => {
  const bot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
  });

  const invalidOptions: unknown[] = [
    null,
    true,
    [],
    new Date(),
    {},
    { duration: '' },
    { duration: 'invalido' },
    { duration: 0 },
    { duration: -100 },
    { duration: 1.5 },
    { duration: true },
    { duration: '5s', scope: 'servidor' },
    { duration: '5s', uses: 0 },
    { duration: '5s', uses: -2 },
    { duration: '5s', uses: 2.5 },
    { duration: '5s', uses: Number.POSITIVE_INFINITY },
    { duration: '5s', uses: '2' },
    { duration: '5s', bypass: 'sim' },
    { duration: '5s', bypass: {} },
  ];

  try {
    for (const invalid of invalidOptions) {
      assert.throws(
        () => bot.command({ name: 'invalido', cooldown: invalid as CooldownOptions, run() {} }),
        error => error instanceof YuzuhaError && isYuzuhaError(error, 'COMMAND_METADATA'),
      );
    }

    let capturedErrors = 0;
    bot.command(defineCommand({
      name: 'dinamico',
      run(ctx) {
        for (const invalid of invalidOptions) {
          assert.throws(
            () => ctx.cooldown(invalid as CooldownOptions),
            error => error instanceof YuzuhaError && isYuzuhaError(error, 'COMMAND_METADATA'),
          );
          capturedErrors++;
        }
      },
    }));
    assert.equal(await bot.handle(mockMessage('!dinamico', { id: 'val-1' })), 'success');
    assert.equal(capturedErrors, invalidOptions.length);

    // Snapshot imutável de CooldownOptions no registro e em listCommands().
    const mutable: CooldownOptions = { duration: '10s', scope: 'global', uses: 1 };
    bot.command({ name: 'isolado', cooldown: mutable, run() {} });
    mutable.uses = 99;
    mutable.scope = 'user';
    const listed = bot.listCommands().find(cmd => cmd.name === 'isolado')!;
    assert.deepEqual(listed.cooldown, { duration: '10s', scope: 'global', uses: 1 });
    (listed.cooldown as CooldownOptions).uses = 50;

    assert.equal(await bot.handle(mockMessage('!isolado', { id: 'iso-1', authorID: '1' })), 'success');
    assert.equal(await bot.handle(mockMessage('!isolado', { id: 'iso-2', authorID: '2', guildID: '999' })), 'guarded');
    assert.ok(!(new GuardError('x', 'COOLDOWN') instanceof TypeError));
  } finally {
    await bot.destroy();
  }
});
