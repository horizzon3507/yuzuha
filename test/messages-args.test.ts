import test from 'node:test';
import assert from 'node:assert/strict';
import { Events } from '@fluxerjs/core';
import {
  ArgumentBag,
  GuardError,
  arg,
  commandHelp,
  commandUsage,
  createTranslator,
  defineCommand,
  parseArguments,
  parseFlags,
  tokenize,
} from '../src/index.js';
import type { MessageOverrides } from '../src/index.js';
import { createTestBot } from '../src/testing.js';

const ENGLISH_ARGS_MESSAGES: MessageOverrides = {
  quoteUnclosed: () => 'Close the argument quotes.',
  argRequired: name => `Missing argument ${name}.`,
  argType: (name, type) => `Argument ${name} must be ${type}.`,
  argNumber: name => `${name} must be a number.`,
  argInteger: name => `${name} must be an integer.`,
  argBoolean: name => `${name} must be true or false.`,
  argUser: () => 'Mention a user or provide a valid ID.',
  argDuration: name => `${name}: Invalid duration. Use 500ms, 5s, 10m, 2h or 1d.`,
  argChoices: (name, choices) => `${name}: choose ${choices.join(', ')}.`,
  argMin: (name, min) => `${name}: minimum ${min}.`,
  argMax: (name, max) => `${name}: maximum ${max}.`,
  argMinLength: (name, min) => `${name}: minimum ${min} characters.`,
  argMaxLength: (name, max) => `${name}: maximum ${max} characters.`,
  flagUnknown: flag => `Unknown flag: ${flag}.`,
  flagDuplicate: name => `Duplicate flag: --${name}.`,
  flagValueRequired: name => `Provide a value for --${name}.`,
  usageSubcommand: () => '<subcommand>',
  usageLine: usage => `Usage: ${usage}`,
  helpAliases: aliases => `Aliases: ${aliases.join(', ')}`,
  helpRequired: () => 'required',
  helpOptional: () => 'optional',
  helpChoices: choices => `choices: ${choices.join(', ')}`,
  helpDefault: value => `default: ${value}`,
  helpMin: min => `min: ${min}`,
  helpMax: max => `max: ${max}`,
  helpArgumentsHeader: () => 'Arguments:',
  helpFlagsHeader: () => 'Flags:',
  helpSubcommandsHeader: () => 'Subcommands:',
  helpExamplesHeader: () => 'Examples:',
  purgeInvalidCount: () => 'Provide an integer count between 1 and 1000.',
  invalidTtlMs: () => 'ttlMs must be an integer between 1000 and 86400000.',
  eventMessageUnavailable: () => 'This event has no full message; pass an explicit channel.',
};

const SPANISH_ARGS_MESSAGES: MessageOverrides = {
  quoteUnclosed: () => 'Cierra las comillas del argumento.',
  argRequired: name => `Indica el argumento ${name}.`,
  argType: (name, type) => `El argumento ${name} debe ser ${type}.`,
  argNumber: name => `${name} debe ser un número.`,
  argInteger: name => `${name} debe ser un número entero.`,
  argBoolean: name => `${name} debe ser true o false.`,
  argUser: () => 'Menciona a un usuario o indica un ID válido.',
  argDuration: name => `${name}: Duración inválida. Usa 500ms, 5s, 10m, 2h o 1d.`,
  argChoices: (name, choices) => `${name}: elige ${choices.join(', ')}.`,
  argMin: (name, min) => `${name}: mínimo ${min}.`,
  argMax: (name, max) => `${name}: máximo ${max}.`,
  argMinLength: (name, min) => `${name}: mínimo ${min} caracteres.`,
  argMaxLength: (name, max) => `${name}: máximo ${max} caracteres.`,
  flagUnknown: flag => `Bandera desconocida: ${flag}.`,
  flagDuplicate: name => `Bandera repetida: --${name}.`,
  flagValueRequired: name => `Indica el valor de --${name}.`,
  usageSubcommand: () => '<subcomando-es>',
  usageLine: usage => `Modo de uso: ${usage}`,
  helpAliases: aliases => `Alias: ${aliases.join(', ')}`,
  helpRequired: () => 'obligatorio',
  helpOptional: () => 'opcional-es',
  helpChoices: choices => `opciones: ${choices.join(', ')}`,
  helpDefault: value => `predeterminado: ${value}`,
  helpMin: min => `mín: ${min}`,
  helpMax: max => `máx: ${max}`,
  helpArgumentsHeader: () => 'Argumentos (ES):',
  helpFlagsHeader: () => 'Banderas:',
  helpSubcommandsHeader: () => 'Subcomandos (ES):',
  helpExamplesHeader: () => 'Ejemplos:',
  purgeInvalidCount: () => 'Indica una cantidad entera entre 1 y 1000.',
  invalidTtlMs: () => 'ttlMs debe ser un entero entre 1000 y 86400000.',
  eventMessageUnavailable: () => 'Este evento no incluye un mensaje completo.',
};

test('chamadas diretas a tokenize, parseArguments, parseFlags, ArgumentBag e help preservam PT-BR byte a byte por padrão e aceitam MessageTranslator', () => {
  const en = createTranslator(ENGLISH_ARGS_MESSAGES);

  assert.throws(() => tokenize('"sem fechar'), { message: 'Feche as aspas do argumento.' });
  assert.throws(() => tokenize('"unclosed', en), { message: 'Close the argument quotes.' });

  const defs = [
    { name: 'alvo', type: 'user' as const, required: true },
    { name: 'qtd', type: 'integer' as const, min: 2, max: 5, defaultValue: 3 },
  ];
  assert.throws(() => parseArguments(defs, []), { message: 'Informe o argumento alvo.' });
  assert.throws(() => parseArguments(defs, [], en), { message: 'Missing argument alvo.' });
  assert.throws(() => parseArguments(defs, ['invalido']), { message: 'Mencione um usuário ou informe um ID válido.' });
  assert.throws(() => parseArguments(defs, ['invalido'], en), { message: 'Mention a user or provide a valid ID.' });
  assert.throws(() => parseArguments(defs, ['123', '1']), { message: 'qtd: mínimo 2.' });
  assert.throws(() => parseArguments(defs, ['123', '1'], en), { message: 'qtd: minimum 2.' });

  const flags = [{ name: 'modo', type: 'string' as const, choices: ['a', 'b'] }];
  assert.throws(() => parseFlags(flags, ['--outro']), { message: 'Flag desconhecida: --outro.' });
  assert.throws(() => parseFlags(flags, ['--outro'], undefined, en), { message: 'Unknown flag: --outro.' });
  assert.throws(() => parseFlags(flags, ['--modo']), { message: 'Informe o valor de --modo.' });
  assert.throws(() => parseFlags(flags, ['--modo'], undefined, en), { message: 'Provide a value for --modo.' });
  assert.throws(() => parseFlags(flags, ['--modo=a', '--modo=b']), { message: 'Flag repetida: --modo.' });
  assert.throws(() => parseFlags(flags, ['--modo=a', '--modo=b'], undefined, en), { message: 'Duplicate flag: --modo.' });

  const defaultBag = new ArgumentBag([['count', 2]]);
  assert.throws(() => defaultBag.require('ausente'), { message: 'Informe o argumento ausente.' });
  assert.throws(() => defaultBag.string('count'), { message: 'O argumento count deve ser string.' });

  const englishBag = new ArgumentBag([['count', 2]], en);
  assert.throws(() => englishBag.require('missing'), { message: 'Missing argument missing.' });
  assert.throws(() => englishBag.string('count'), { message: 'Argument count must be string.' });

  const groupCommand = defineCommand({
    name: 'cfg',
    aliases: ['c'],
    description: 'Manage settings.',
    subcommands: [defineCommand({ name: 'set', description: 'Set value.', run() {} })],
  });
  assert.equal(commandUsage(groupCommand, '!'), '!cfg <subcomando>');
  assert.equal(commandUsage(groupCommand, '!', en), '!cfg <subcommand>');

  const leafCommand = defineCommand({
    name: 'warn',
    aliases: ['w'],
    description: 'Warn member.',
    args: {
      user: arg.user().required(),
      note: arg.text().min(3).max(20).default('spam'),
    },
    flags: {
      level: arg.string().alias('l').choices(['low', 'high']).default('low'),
    },
    examples: ['!warn @user --level high'],
    run() {},
  });

  assert.equal(
    commandHelp(leafCommand, '!'),
    [
      'Uso: !warn <user> [note] [--level <string>]',
      'Warn member.',
      'Aliases: w',
      'Argumentos:',
      'user: user; obrigatório',
      'note: string; opcional; padrão: spam; mínimo: 3; máximo: 20',
      'Flags:',
      '--level (-l): string; opcional; escolhas: low, high; padrão: low',
      'Exemplos:',
      '!warn @user --level high',
    ].join('\n'),
  );

  assert.equal(
    commandHelp(leafCommand, '!', en),
    [
      'Usage: !warn <user> [note] [--level <string>]',
      'Warn member.',
      'Aliases: w',
      'Arguments:',
      'user: user; required',
      'note: string; optional; default: spam; min: 3; max: 20',
      'Flags:',
      '--level (-l): string; optional; choices: low, high; default: low',
      'Examples:',
      '!warn @user --level high',
    ].join('\n'),
  );
});

test('erros de argumentos, flags e aspas no bot respeitam PT-BR byte a byte, inglês e espanhol (inclusive locale assíncrono)', async () => {
  const buildCommands = () => [
    defineCommand({
      name: 'check',
      args: {
        target: arg.user().required(),
        amount: arg.number().min(1.5).max(9.5).required(),
        count: arg.integer().min(2).max(10).required(),
        active: arg.boolean().required(),
        wait: arg.duration().required(),
        mode: arg.string().choices(['fast', 'safe']).required(),
        note: arg.text().min(3).max(8).rest().required(),
      },
      flags: {
        tag: arg.string().alias('t').default('std'),
      },
      async run(ctx) {
        await ctx.reply(`${ctx.args.get('target')}:${ctx.flags.get('tag')}`);
      },
    }),
    defineCommand({
      name: 'bag',
      args: { raw: arg.integer().optional() },
      run(ctx) {
        if (ctx.tokens[0] === 'missing') {
          (ctx.args as ArgumentBag).require('inexistente');
        }
        (ctx.args as ArgumentBag).string('raw');
      },
    }),
  ];

  const ptBot = createTestBot({ commands: buildCommands() });
  const multiBot = createTestBot({
    messages: {
      defaultLocale: 'en',
      locales: {
        en: ENGLISH_ARGS_MESSAGES,
        es: SPANISH_ARGS_MESSAGES,
      },
    },
    async locale(ctx) {
      await Promise.resolve();
      if (ctx.message.guildID === '200') return 'es';
      if (ctx.message.guildID === '300') return 'pt-BR';
      return 'en';
    },
    commands: buildCommands(),
  });

  try {
    const expectedUsage = '!check <target> <amount> <count> <active> <wait> <mode> <note...> [--tag <string>]';

    // 1. Aspas abertas no construtor de CommandContext (após locale assíncrono!)
    await ptBot.send('!check "aberto');
    assert.equal(ptBot.messages.at(-1)?.payload.content, `Feche as aspas do argumento.\nUso: ${expectedUsage}`);

    await multiBot.send('!check "unclosed');
    assert.equal(multiBot.messages.at(-1)?.payload.content, `Close the argument quotes.\nUsage: ${expectedUsage}`);

    await multiBot.send('!check "abierto', { guildID: '200' });
    assert.equal(multiBot.messages.at(-1)?.payload.content, `Cierra las comillas del argumento.\nModo de uso: ${expectedUsage}`);

    // 2. Argumentos tipados (required, user, number, integer, boolean, duration, choices, min/max, minLength/maxLength)
    const matrix: [string, string, string, string][] = [
      [
        '!check',
        `Informe o argumento target.\nUso: ${expectedUsage}`,
        `Missing argument target.\nUsage: ${expectedUsage}`,
        `Indica el argumento target.\nModo de uso: ${expectedUsage}`,
      ],
      [
        '!check nao-usuario',
        `Mencione um usuário ou informe um ID válido.\nUso: ${expectedUsage}`,
        `Mention a user or provide a valid ID.\nUsage: ${expectedUsage}`,
        `Menciona a un usuario o indica un ID válido.\nModo de uso: ${expectedUsage}`,
      ],
      [
        '!check <@2> abc 3 true 5s fast oktext',
        `amount deve ser um número.\nUso: ${expectedUsage}`,
        `amount must be a number.\nUsage: ${expectedUsage}`,
        `amount debe ser un número.\nModo de uso: ${expectedUsage}`,
      ],
      [
        '!check <@2> 1.0 3 true 5s fast oktext',
        `amount: mínimo 1.5.\nUso: ${expectedUsage}`,
        `amount: minimum 1.5.\nUsage: ${expectedUsage}`,
        `amount: mínimo 1.5.\nModo de uso: ${expectedUsage}`,
      ],
      [
        '!check <@2> 12.0 3 true 5s fast oktext',
        `amount: máximo 9.5.\nUso: ${expectedUsage}`,
        `amount: maximum 9.5.\nUsage: ${expectedUsage}`,
        `amount: máximo 9.5.\nModo de uso: ${expectedUsage}`,
      ],
      [
        '!check <@2> 2.5 3.2 true 5s fast oktext',
        `count deve ser um número inteiro.\nUso: ${expectedUsage}`,
        `count must be an integer.\nUsage: ${expectedUsage}`,
        `count debe ser un número entero.\nModo de uso: ${expectedUsage}`,
      ],
      [
        '!check <@2> 2.5 4 talvez 5s fast oktext',
        `active deve ser true ou false.\nUso: ${expectedUsage}`,
        `active must be true or false.\nUsage: ${expectedUsage}`,
        `active debe ser true o false.\nModo de uso: ${expectedUsage}`,
      ],
      [
        '!check <@2> 2.5 4 true 99x fast oktext',
        `wait: Duração inválida. Use 500ms, 5s, 10m, 2h ou 1d.\nUso: ${expectedUsage}`,
        `wait: Invalid duration. Use 500ms, 5s, 10m, 2h or 1d.\nUsage: ${expectedUsage}`,
        `wait: Duración inválida. Usa 500ms, 5s, 10m, 2h o 1d.\nModo de uso: ${expectedUsage}`,
      ],
      [
        '!check <@2> 2.5 4 true 5s turbo oktext',
        `mode: escolha fast, safe.\nUso: ${expectedUsage}`,
        `mode: choose fast, safe.\nUsage: ${expectedUsage}`,
        `mode: elige fast, safe.\nModo de uso: ${expectedUsage}`,
      ],
      [
        '!check <@2> 2.5 4 true 5s fast oi',
        `note: mínimo 3 caracteres.\nUso: ${expectedUsage}`,
        `note: minimum 3 characters.\nUsage: ${expectedUsage}`,
        `note: mínimo 3 caracteres.\nModo de uso: ${expectedUsage}`,
      ],
      [
        '!check <@2> 2.5 4 true 5s fast textoLongoDemais',
        `note: máximo 8 caracteres.\nUso: ${expectedUsage}`,
        `note: maximum 8 characters.\nUsage: ${expectedUsage}`,
        `note: máximo 8 caracteres.\nModo de uso: ${expectedUsage}`,
      ],
      // Flags
      [
        '!check --unknown',
        `Flag desconhecida: --unknown.\nUso: ${expectedUsage}`,
        `Unknown flag: --unknown.\nUsage: ${expectedUsage}`,
        `Bandera desconocida: --unknown.\nModo de uso: ${expectedUsage}`,
      ],
      [
        '!check --tag a --tag b',
        `Flag repetida: --tag.\nUso: ${expectedUsage}`,
        `Duplicate flag: --tag.\nUsage: ${expectedUsage}`,
        `Bandera repetida: --tag.\nModo de uso: ${expectedUsage}`,
      ],
      [
        '!check --tag',
        `Informe o valor de --tag.\nUso: ${expectedUsage}`,
        `Provide a value for --tag.\nUsage: ${expectedUsage}`,
        `Indica el valor de --tag.\nModo de uso: ${expectedUsage}`,
      ],
    ];

    for (const [input, ptExpected, enExpected, esExpected] of matrix) {
      assert.equal(await ptBot.send(input), 'guarded');
      assert.equal(ptBot.messages.at(-1)?.payload.content, ptExpected);

      assert.equal(await multiBot.send(input), 'guarded');
      assert.equal(multiBot.messages.at(-1)?.payload.content, enExpected);

      assert.equal(await multiBot.send(input, { guildID: '200' }), 'guarded');
      assert.equal(multiBot.messages.at(-1)?.payload.content, esExpected);
    }

    // 3. ArgumentBag no contexto (require / argType)
    await ptBot.send('!bag 7');
    assert.equal(ptBot.messages.at(-1)?.payload.content, 'O argumento raw deve ser string.');

    await multiBot.send('!bag 7');
    assert.equal(multiBot.messages.at(-1)?.payload.content, 'Argument raw must be string.');

    await multiBot.send('!bag 7', { guildID: '200' });
    assert.equal(multiBot.messages.at(-1)?.payload.content, 'El argumento raw debe ser string.');
  } finally {
    await ptBot.destroy();
    await multiBot.destroy();
  }
});

test('bot.help e ctx.help usam o catálogo configurado e o locale do contexto', async () => {
  const fixture = createTestBot({
    messages: {
      defaultLocale: 'en',
      locales: {
        en: ENGLISH_ARGS_MESSAGES,
        es: SPANISH_ARGS_MESSAGES,
      },
    },
    locale: ctx => (ctx.message.guildID === '200' ? 'es' : 'en'),
    commands: [
      defineCommand({
        name: 'admin',
        description: 'Admin group',
        subcommands: [
          defineCommand({
            name: 'set',
            aliases: ['s'],
            description: 'Set option',
            args: { key: arg.string().required() },
            flags: { force: arg.boolean().default(false) },
            examples: ['!admin set theme --force'],
            async run(ctx) {
              await ctx.reply(`${ctx.help()}\n---\n${ctx.help('admin set', '!')}`);
            },
          }),
        ],
      }),
    ],
  });

  try {
    // bot.help usa defaultLocale (en) ou o locale explícito informado
    assert.equal(fixture.bot.help(), 'admin <subcommand>: Admin group');
    assert.equal(fixture.bot.help(undefined, '!', 'es'), '!admin <subcomando-es>: Admin group');
    assert.match(fixture.bot.help('admin', '!'), /Subcommands:\n!admin set: Set option/);
    assert.match(fixture.bot.help('admin', '!', 'es'), /Subcomandos \(ES\):\n!admin set: Set option/);

    // ctx.help() usa o locale resolvido do contexto (en na guild 100, es na guild 200)
    await fixture.send('!admin set color');
    const enReply = fixture.messages.at(-1)?.payload.content ?? '';
    assert.match(enReply, /^admin <subcommand>: Admin group\n---\nUsage: !admin set <key> \[--force\]/m);
    assert.match(enReply, /Arguments:\nkey: string; required/);
    assert.match(enReply, /Flags:\n--force: boolean; optional; default: false/);
    assert.match(enReply, /Examples:\n!admin set theme --force/);

    await fixture.send('!admin set color', { guildID: '200' });
    const esReply = fixture.messages.at(-1)?.payload.content ?? '';
    assert.match(esReply, /^admin <subcomando-es>: Admin group\n---\nModo de uso: !admin set <key> \[--force\]/m);
    assert.match(esReply, /Argumentos \(ES\):\nkey: string; obligatorio/);
    assert.match(esReply, /Banderas:\n--force: boolean; opcional-es; predeterminado: false/);
    assert.match(esReply, /Ejemplos:\n!admin set theme --force/);
  } finally {
    await fixture.destroy();
  }
});

test('purge, ttlMs e message indisponível em evento usam o catálogo de mensagens do locale ativo', async () => {
  const observedEventErrors: string[] = [];

  const fixture = createTestBot({
    messages: {
      defaultLocale: 'en',
      locales: {
        en: ENGLISH_ARGS_MESSAGES,
        es: SPANISH_ARGS_MESSAGES,
      },
    },
    locale: ctx => (ctx.message.guildID === '200' ? 'es' : 'en'),
    commands: [
      defineCommand({
        name: 'clean',
        async run(ctx) {
          await ctx.purge(0);
        },
      }),
      defineCommand({
        name: 'temp',
        async run(ctx) {
          await ctx.reply('hi', { ttlMs: 500 });
        },
      }),
      defineCommand({
        name: 'exp',
        run(ctx) {
          ctx.expire('1', 99_999_999);
        },
      }),
    ],
  });

  fixture.bot.contextEvent({
    event: 'guildMemberAdd',
    run(ctx) {
      try {
        void ctx.message;
      } catch (error) {
        if (error instanceof GuardError) observedEventErrors.push(error.message);
      }
    },
  });

  try {
    await fixture.send('!clean');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'Provide an integer count between 1 and 1000.');
    await fixture.send('!clean', { guildID: '200' });
    assert.equal(fixture.messages.at(-1)?.payload.content, 'Indica una cantidad entera entre 1 y 1000.');

    await fixture.send('!temp');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'ttlMs must be an integer between 1000 and 86400000.');
    await fixture.send('!temp', { guildID: '200' });
    assert.equal(fixture.messages.at(-1)?.payload.content, 'ttlMs debe ser un entero entre 1000 y 86400000.');

    await fixture.send('!exp');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'ttlMs must be an integer between 1000 and 86400000.');

    fixture.bot.client.emit(Events.GuildMemberAdd, {
      id: '2',
      guild: { id: '100' },
      user: { id: '2', username: 'Ana', bot: false },
    } as never);
    fixture.bot.client.emit(Events.GuildMemberAdd, {
      id: '3',
      guild: { id: '200' },
      user: { id: '3', username: 'Bia', bot: false },
    } as never);
    await new Promise(resolve => setImmediate(resolve));

    assert.deepEqual(observedEventErrors, [
      'This event has no full message; pass an explicit channel.',
      'Este evento no incluye un mensaje completo.',
    ]);
  } finally {
    await fixture.destroy();
  }
});
