import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommandContext,
  ConfigError,
  DEFAULT_LOCALE,
  DEFAULT_MESSAGES,
  MemoryStore,
  Yuzuha,
  arg,
  createTranslator,
  defaultTranslator,
  defineCommand,
  isYuzuhaError,
} from '../src/index.js';
import type { UnknownCommandContext } from '../src/index.js';
import { MockTransport, createTestBot, mockMessage } from '../src/testing.js';

test('DEFAULT_LOCALE e DEFAULT_MESSAGES preservam exatamente os textos PT-BR padrão', () => {
  assert.equal(DEFAULT_LOCALE, 'pt-BR');
  assert.equal(Object.isFrozen(DEFAULT_MESSAGES), true);

  assert.equal(DEFAULT_MESSAGES.quoteUnclosed(), 'Feche as aspas do argumento.');
  assert.equal(DEFAULT_MESSAGES.argRequired('alvo'), 'Informe o argumento alvo.');
  assert.equal(DEFAULT_MESSAGES.argType('total', 'number'), 'O argumento total deve ser number.');
  assert.equal(DEFAULT_MESSAGES.argNumber('taxa'), 'taxa deve ser um número.');
  assert.equal(DEFAULT_MESSAGES.argInteger('limite'), 'limite deve ser um número inteiro.');
  assert.equal(DEFAULT_MESSAGES.argBoolean('ativo'), 'ativo deve ser true ou false.');
  assert.equal(DEFAULT_MESSAGES.argUser(), 'Mencione um usuário ou informe um ID válido.');
  assert.equal(DEFAULT_MESSAGES.argDuration('tempo'), 'tempo: Duração inválida. Use 500ms, 5s, 10m, 2h ou 1d.');
  assert.equal(DEFAULT_MESSAGES.argChoices('modo', ['a', 'b']), 'modo: escolha a, b.');
  assert.equal(DEFAULT_MESSAGES.argMin('qtd', 2), 'qtd: mínimo 2.');
  assert.equal(DEFAULT_MESSAGES.argMax('qtd', 10), 'qtd: máximo 10.');
  assert.equal(DEFAULT_MESSAGES.argMinLength('bio', 3), 'bio: mínimo 3 caracteres.');
  assert.equal(DEFAULT_MESSAGES.argMaxLength('bio', 80), 'bio: máximo 80 caracteres.');
  assert.equal(DEFAULT_MESSAGES.flagUnknown('--foo'), 'Flag desconhecida: --foo.');
  assert.equal(DEFAULT_MESSAGES.flagDuplicate('foo'), 'Flag repetida: --foo.');
  assert.equal(DEFAULT_MESSAGES.flagValueRequired('foo'), 'Informe o valor de --foo.');
  assert.equal(DEFAULT_MESSAGES.usageSubcommand(), '<subcomando>');
  assert.equal(DEFAULT_MESSAGES.usageLine('!ping'), 'Uso: !ping');
  assert.equal(DEFAULT_MESSAGES.helpAliases(['p', 'pong']), 'Aliases: p, pong');
  assert.equal(DEFAULT_MESSAGES.helpRequired(), 'obrigatório');
  assert.equal(DEFAULT_MESSAGES.helpOptional(), 'opcional');
  assert.equal(DEFAULT_MESSAGES.helpChoices(['sim', 'não']), 'escolhas: sim, não');
  assert.equal(DEFAULT_MESSAGES.helpDefault('10'), 'padrão: 10');
  assert.equal(DEFAULT_MESSAGES.helpMin(1), 'mínimo: 1');
  assert.equal(DEFAULT_MESSAGES.helpMax(5), 'máximo: 5');
  assert.equal(DEFAULT_MESSAGES.helpArgumentsHeader(), 'Argumentos:');
  assert.equal(DEFAULT_MESSAGES.helpFlagsHeader(), 'Flags:');
  assert.equal(DEFAULT_MESSAGES.helpSubcommandsHeader(), 'Subcomandos:');
  assert.equal(DEFAULT_MESSAGES.helpExamplesHeader(), 'Exemplos:');
  assert.equal(DEFAULT_MESSAGES.purgeInvalidCount(), 'Informe uma quantidade inteira entre 1 e 1000.');
  assert.equal(DEFAULT_MESSAGES.invalidTtlMs(), 'ttlMs deve ser um inteiro entre 1000 e 86400000.');
  assert.equal(
    DEFAULT_MESSAGES.eventMessageUnavailable(),
    'Este evento não fornece uma mensagem completa. Use os campos de evento e um canal explícito.',
  );
  assert.equal(DEFAULT_MESSAGES.eventChannelRequired(), 'Defina um canal para a saída deste evento.');
  assert.equal(DEFAULT_MESSAGES.unknownCommand('ping', '!'), 'Comando desconhecido: !ping.');
  assert.equal(DEFAULT_MESSAGES.unknownSubcommand(), 'Subcomando desconhecido.');
  assert.equal(DEFAULT_MESSAGES.notInGuild(), 'Este comando só funciona em servidores.');
  assert.equal(DEFAULT_MESSAGES.noAuthor(), 'Esta operação exige um autor identificado.');
  assert.equal(DEFAULT_MESSAGES.permissionMissingAuthor('BanMembers'), 'Você precisa da permissão BanMembers.');
  assert.equal(DEFAULT_MESSAGES.permissionMissingBot('BanMembers'), 'Preciso da permissão BanMembers.');
  assert.equal(
    DEFAULT_MESSAGES.guildDepartureOwnerOnly(),
    'Somente o dono do servidor pode remover o bot por este comando.',
  );
  assert.equal(
    DEFAULT_MESSAGES.guildDepartureBotIsOwner(),
    'O bot não pode sair de um servidor do qual é dono.',
  );
  assert.equal(DEFAULT_MESSAGES.cooldown('5s', 5000), 'Aguarde 5s antes de usar novamente.');
  assert.equal(DEFAULT_MESSAGES.checkFailed(), 'Você não pode executar este comando.');
  assert.equal(DEFAULT_MESSAGES.moderationSelfTarget(), 'Você não pode moderar a si mesmo.');
  assert.equal(DEFAULT_MESSAGES.moderationBotTarget(), 'Você não pode moderar este bot.');
  assert.equal(
    DEFAULT_MESSAGES.moderationOwnerTarget(),
    'Não é possível moderar esse membro. Confira a hierarquia de cargos.',
  );
  assert.equal(
    DEFAULT_MESSAGES.moderationHierarchy(),
    'Não é possível moderar esse membro. Confira a hierarquia de cargos.',
  );
  assert.equal(DEFAULT_MESSAGES.moderationAdminImmune(), 'Não é possível silenciar um administrador.');
  assert.equal(DEFAULT_MESSAGES.moderationReasonRequired(), 'Informe o motivo.');
  assert.equal(DEFAULT_MESSAGES.moderationReasonTooLong(), 'O motivo deve ter até 512 caracteres.');
  assert.equal(DEFAULT_MESSAGES.moderationTimeoutDuration(), 'Informe uma duração de até 28 dias.');
  assert.equal(
    DEFAULT_MESSAGES.moderationDurationInvalid(),
    'Informe uma duração válida em milissegundos inteiros.',
  );
  assert.equal(DEFAULT_MESSAGES.moderationDeleteDaysInvalid(), 'O histórico a remover deve ser de 0 a 7 dias.');
  assert.equal(
    DEFAULT_MESSAGES.moderationVoiceChannelInvalid(),
    'Informe o ID do canal de voz ou null para desconectar.',
  );
  assert.equal(DEFAULT_MESSAGES.moderationVoiceStateInvalid(), 'Informe true ou false para o estado de voz.');
  assert.equal(
    DEFAULT_MESSAGES.moderationPartial('ban', '2'),
    'A ação ban foi realizada, mas o caso não foi salvo. Não repita a ação.',
  );
  assert.equal(
    DEFAULT_MESSAGES.userErrorAfterCase(42),
    'A ação foi realizada e registrada no caso #42, mas o comando não terminou.',
  );
  assert.equal(DEFAULT_MESSAGES.userErrorGeneric(), 'Não foi possível concluir o comando.');
  assert.equal(defaultTranslator('notInGuild'), 'Este comando só funciona em servidores.');
});

test('CommandContext instanciado diretamente usa pt-BR e DEFAULT_MESSAGES sincronamente', () => {
  const ctx = new CommandContext({
    message: mockMessage('!ping'),
    transport: new MockTransport(),
    store: new MemoryStore(),
    command: { name: 'ping' },
    cooldown: () => 0,
  });

  assert.equal(ctx.locale, 'pt-BR');
  assert.equal(ctx.t('notInGuild'), 'Este comando só funciona em servidores.');
  assert.equal(ctx.t('argRequired', 'usuario'), 'Informe o argumento usuario.');
});

test('catálogo parcial direto suporta funções tipadas, templates seguros e fallback para DEFAULT_MESSAGES', async () => {
  const custom = createTranslator({
    notInGuild: () => 'Guild only.',
    argRequired: 'Missing {name}!',
    argChoices: '{name} must be one of: {choices}.',
  });
  assert.equal(custom('notInGuild'), 'Guild only.');
  assert.equal(custom('argRequired', '{injected}'), 'Missing {injected}!');
  assert.equal(custom('argChoices', 'mode', ['fast', 'safe']), 'mode must be one of: fast, safe.');
  assert.equal(custom('noAuthor'), 'Esta operação exige um autor identificado.');

  const fixture = createTestBot({
    locale: 'en-US',
    messages: {
      notInGuild: () => 'Servers only!',
      cooldown: (remaining, ms) => `Wait ${remaining} (${ms}ms).`,
    },
    commands: [
      defineCommand({
        name: 'info',
        async run(ctx) {
          await ctx.reply(`${ctx.locale}|${ctx.t('notInGuild')}|${ctx.t('cooldown', '3s', 2500)}|${ctx.t('checkFailed')}`);
        },
      }),
    ],
  });

  try {
    assert.equal(await fixture.send('!info'), 'success');
    assert.equal(
      fixture.messages.at(-1)?.payload.content,
      'en-US|Servers only!|Wait 3s (2500ms).|Você não pode executar este comando.',
    );
  } finally {
    await fixture.destroy();
  }
});

test('múltiplos locales com locale(ctx) síncrono e assíncrono resolvem antes de prepare() e aplicam fallback em cascata', async () => {
  const executionOrder: string[] = [];
  const store = new MemoryStore();

  const fixture = createTestBot({
    store,
    messages: {
      defaultLocale: 'en',
      locales: {
        en: {
          notInGuild: () => 'Server only.',
          checkFailed: () => 'Access denied.',
          unknownCommand: (name, prefix = '') => `Unknown command: ${prefix}${name}`,
        },
        es: {
          notInGuild: () => 'Solo en servidores.',
        },
      },
    },
    async locale(ctx) {
      executionOrder.push('locale');
      if ('data' in ctx && ctx.guildID) {
        const saved = await ctx.data.guild.get('lang');
        if (typeof saved === 'string' && saved) return saved;
      }
      if (ctx.message.guildID === '200') return 'es-MX';
      if (ctx.message.guildID === '300') return 'fr-FR';
      return 'en-US';
    },
    hooks: {
      onUnknownCommand(info: UnknownCommandContext) {
        return `${info.locale}|${info.t('unknownCommand', info.name, info.prefix)}`;
      },
    },
    commands: [
      defineCommand({
        name: 'setlang',
        args: { lang: arg.string().required() },
        async run(ctx) {
          await ctx.data.guild.set('lang', ctx.args.get('lang'));
          await ctx.reply('saved');
        },
      }),
      defineCommand({
        name: 'probe',
        checks: [
          ctx => {
            executionOrder.push(`check:${ctx.locale}`);
            return true;
          },
        ],
        async run(ctx) {
          executionOrder.push(`run:${ctx.locale}`);
          await ctx.reply(`${ctx.locale}|${ctx.t('notInGuild')}|${ctx.t('checkFailed')}|${ctx.t('noAuthor')}`);
        },
      }),
    ],
  });

  fixture.transport.setMember('200', { id: '1', owner: true, permissions: 0n, rank: 100 });
  fixture.transport.setMember('200', { id: '999', owner: false, permissions: 0n, rank: 90 });
  fixture.transport.setMember('300', { id: '1', owner: true, permissions: 0n, rank: 100 });
  fixture.transport.setMember('300', { id: '999', owner: false, permissions: 0n, rank: 90 });

  try {
    // Guild 100 -> en-US -> cai em locales.en -> DEFAULT_MESSAGES
    assert.equal(await fixture.send('!probe'), 'success');
    assert.equal(
      fixture.messages.at(-1)?.payload.content,
      'en-US|Server only.|Access denied.|Esta operação exige um autor identificado.',
    );
    assert.deepEqual(executionOrder, ['locale', 'check:en-US', 'run:en-US']);

    // Guild 200 -> es-MX -> subtag locales.es -> fallback defaultLocale (en) -> DEFAULT_MESSAGES (pt-BR)
    executionOrder.length = 0;
    assert.equal(await fixture.send('!probe', { guildID: '200' }), 'success');
    assert.equal(
      fixture.messages.at(-1)?.payload.content,
      'es-MX|Solo en servidores.|Access denied.|Esta operação exige um autor identificado.',
    );
    assert.deepEqual(executionOrder, ['locale', 'check:es-MX', 'run:es-MX']);

    // Guild 300 -> fr-FR (ausente em locales) -> fallback defaultLocale (en) -> DEFAULT_MESSAGES (pt-BR)
    assert.equal(await fixture.send('!probe', { guildID: '300' }), 'success');
    assert.equal(
      fixture.messages.at(-1)?.payload.content,
      'fr-FR|Server only.|Access denied.|Esta operação exige um autor identificado.',
    );

    // Leitura assíncrona de ctx.data.guild antes de prepare()
    assert.equal(await fixture.send('!setlang es'), 'success');
    assert.equal(await fixture.send('!probe'), 'success');
    assert.equal(
      fixture.messages.at(-1)?.payload.content,
      'es|Solo en servidores.|Access denied.|Esta operação exige um autor identificado.',
    );

    // UnknownCommandContext também recebe locale resolvido e tradutor t(...)
    assert.equal(await fixture.send('!missing', { guildID: '200' }), 'ignored');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'es-MX|Unknown command: !missing');
  } finally {
    await fixture.destroy();
  }
});

test('locale(ctx) síncrono funciona sem promessas pendentes', async () => {
  const fixture = createTestBot({
    messages: {
      locales: {
        en: { userErrorGeneric: () => 'Command failed.' },
      },
    },
    locale: ctx => (ctx.message.authorID === '1' ? 'en' : 'pt-BR'),
    commands: [
      defineCommand({
        name: 'who',
        async run(ctx) {
          await ctx.reply(`${ctx.locale}:${ctx.t('userErrorGeneric')}`);
        },
      }),
    ],
  });

  try {
    await fixture.send('!who', { authorID: '1' });
    assert.equal(fixture.messages.at(-1)?.payload.content, 'en:Command failed.');

    await fixture.send('!who', { authorID: '2' });
    assert.equal(fixture.messages.at(-1)?.payload.content, 'pt-BR:Não foi possível concluir o comando.');
  } finally {
    await fixture.destroy();
  }
});

test('opções inválidas de messages e locale lançam ConfigError MESSAGES_OPTIONS', async () => {
  const base = () => ({ transport: new MockTransport(), store: new MemoryStore() });

  const invalidConfigs: (() => unknown)[] = [
    () => new Yuzuha({ ...base(), messages: null as never }),
    () => new Yuzuha({ ...base(), messages: [] as never }),
    () => new Yuzuha({ ...base(), messages: 'pt-BR' as never }),
    () => new Yuzuha({ ...base(), messages: new Map() as never }),
    () => new Yuzuha({ ...base(), messages: { chaveInexistente: 'x' } as never }),
    () => new Yuzuha({ ...base(), messages: { notInGuild: 123 as never } }),
    () => new Yuzuha({ ...base(), messages: { locales: {}, notInGuild: 'misturado' } as never }),
    () => new Yuzuha({ ...base(), messages: { locales: null as never } }),
    () => new Yuzuha({ ...base(), messages: { locales: [] as never } }),
    () => new Yuzuha({ ...base(), messages: { defaultLocale: '' } }),
    () => new Yuzuha({ ...base(), messages: { defaultLocale: 'locale inválido!' } }),
    () => new Yuzuha({ ...base(), messages: { locales: { '': { notInGuild: 'x' } } } }),
    () => new Yuzuha({ ...base(), messages: { locales: { 'en-US': {}, 'en-us': {} } } }),
    () => new Yuzuha({ ...base(), messages: { locales: { en: { invalida: 'x' } as never } } }),
    () => new Yuzuha({ ...base(), locale: '' }),
    () => new Yuzuha({ ...base(), locale: '   ' }),
    () => new Yuzuha({ ...base(), locale: 'en US' }),
    () => new Yuzuha({ ...base(), locale: 42 as never }),
    () => createTranslator({ notInGuild: (() => 123) as never })('notInGuild'),
    () => (defaultTranslator as (key: string) => string)('inexistente'),
  ];

  for (const run of invalidConfigs) {
    assert.throws(
      run,
      error => error instanceof ConfigError && isYuzuhaError(error, 'MESSAGES_OPTIONS'),
    );
  }

  // Retorno inválido de locale(ctx) em tempo de execução reporta ConfigError MESSAGES_OPTIONS
  const fixture = createTestBot({
    locale: () => '' as string,
    commands: [defineCommand({ name: 'ping', async run(ctx) { await ctx.reply('pong'); } })],
  });

  try {
    assert.equal(await fixture.send('!ping'), 'error');
    assert.equal(fixture.errors.length, 1);
    assert.ok(fixture.errors[0] instanceof ConfigError);
    assert.equal(isYuzuhaError(fixture.errors[0], 'MESSAGES_OPTIONS'), true);
  } finally {
    await fixture.destroy();
  }
});
