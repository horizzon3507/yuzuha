import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommandContext,
  GuardError,
  MemoryStore,
  Yuzuha,
  YuzuhaError,
  arg,
  commandHelp,
  commandUsage,
  defineCommand,
  isYuzuhaError,
  parseArguments,
  parseArgumentsAsync,
  parseFlags,
  parseFlagsAsync,
} from '../src/index.js';
import type { ArgumentValue, CustomArgumentType } from '../src/index.js';
import { argumentDefinitions } from '../src/commands/builders.js';
import { createTestBot, MockTransport, mockMessage } from '../src/testing.js';

interface ShopItem {
  id: string;
  name: string;
  price: number;
}

const CATALOG: Readonly<Record<string, ShopItem>> = {
  espada: { id: 'espada', name: 'Espada de Ferro', price: 150 },
  pocao: { id: 'pocao', name: 'Poção de Cura', price: 25 },
  escudo: { id: 'escudo', name: 'Escudo Real', price: 300 },
};

test('bot.argumentType suporta parsers síncronos e assíncronos com inferência estática', async () => {
  await using t = createTestBot();

  const itemType: CustomArgumentType<ShopItem> = {
    description: 'Item do catálogo da loja.',
    parse(raw, ctx) {
      assert.equal(ctx.guildID, '100');
      const found = CATALOG[raw.toLowerCase()];
      if (!found) throw new GuardError(`Item desconhecido: ${raw}.`, 'INVALID_ARGUMENT');
      return found;
    },
  };

  t.bot
    .argumentType('item', itemType)
    .argumentType('desconto', {
      async parse(raw, ctx) {
        const bonus = Number(await ctx.data.guild.get('bonus', 0));
        const pct = Number(raw.replace('%', ''));
        if (!Number.isFinite(pct) || pct < 0 || pct > 90) {
          throw new GuardError('Desconto inválido.', 'INVALID_ARGUMENT');
        }
        return pct + bonus;
      },
    });

  await t.store.update(state => {
    state.variables[JSON.stringify(['guild', '100', 'bonus'])] = 5;
  });

  const buy = defineCommand({
    name: 'comprar',
    args: {
      item: arg.custom<ShopItem>('item').required(),
      extra: arg.custom<ShopItem>('item'),
    },
    flags: {
      cupom: arg.custom<number>('desconto').alias('c').default(0),
    },
    async run(ctx) {
      const item: ShopItem = ctx.args.get('item');
      const extra: ShopItem | undefined = ctx.args.get('extra');
      const requiredExtra: ShopItem = extra ? ctx.args.require('extra') : item;
      const cupom: number = ctx.flags.get('cupom');
      const asArgValue: ArgumentValue = item;
      void [requiredExtra, asArgValue];

      // @ts-expect-error ShopItem não é string.
      const wrongItem: string = ctx.args.get('item');
      // @ts-expect-error Argumento opcional inclui undefined.
      const nonOptional: ShopItem = ctx.args.get('extra');
      // @ts-expect-error Chave inexistente é rejeitada.
      ctx.args.get('inexistente');
      void [wrongItem, nonOptional];

      const basePrice = item.price + (extra?.price ?? 0);
      const finalPrice = Math.round(basePrice * (1 - cupom / 100));
      await ctx.reply(`${item.name}${extra ? ` + ${extra.name}` : ''}: ${finalPrice}`);
    },
  });

  t.bot.command(buy);

  assert.equal(await t.send('!comprar espada'), 'success');
  assert.equal(t.messages.at(-1)?.payload.content, 'Espada de Ferro: 150');

  assert.equal(await t.send('!comprar espada pocao -c 15%'), 'success');
  assert.equal(t.messages.at(-1)?.payload.content, 'Espada de Ferro + Poção de Cura: 140');
});

test('arg.custom combina .default(), .optional(), .validate(), .choices() e flags customizadas', async () => {
  await using t = createTestBot();

  t.bot.argumentType<ShopItem>('item', {
    async parse(raw) {
      await Promise.resolve();
      const found = CATALOG[raw.toLowerCase()];
      if (!found) throw new GuardError(`Item inexistente: ${raw}.`, 'INVALID_ARGUMENT');
      return found;
    },
  });

  const defaultPotion = CATALOG.pocao!;
  const featured = [CATALOG.espada!, CATALOG.escudo!] as const;

  t.bot.command({
    name: 'equipar',
    args: {
      principal: arg.custom<ShopItem>('item')
        .validate(item => item.price >= 100, 'O item principal deve custar ao menos 100.')
        .default(CATALOG.espada!),
      secundario: arg.custom<ShopItem>('item').default(defaultPotion).optional(),
    },
    flags: {
      destaque: arg.custom<ShopItem>('item').choices(featured),
    },
    async run(ctx) {
      const principal: ShopItem = ctx.args.get('principal');
      const secundario: ShopItem | undefined = ctx.args.get('secundario');
      const destaque: (typeof featured)[number] | undefined = ctx.flags.get('destaque');
      await ctx.reply(`${principal.id}|${secundario?.id ?? 'nenhum'}|${destaque?.id ?? 'nenhum'}`);
    },
  });

  // Sem argumentos: principal usa .default() (sem chamar parse) e secundario foi resetado por .optional().
  assert.equal(await t.send('!equipar'), 'success');
  assert.equal(t.messages.at(-1)?.payload.content, 'espada|nenhum|nenhum');

  // .validate() recusa item convertido cujo preço < 100.
  assert.equal(await t.send('!equipar pocao'), 'guarded');
  assert.match(t.messages.at(-1)?.payload.content ?? '', /^O item principal deve custar ao menos 100\.\nUso: !equipar/);

  // .choices() aceita instância da lista e recusa outra instância válida do parser.
  assert.equal(await t.send('!equipar escudo pocao --destaque espada'), 'success');
  assert.equal(t.messages.at(-1)?.payload.content, 'escudo|pocao|espada');

  assert.equal(await t.send('!equipar escudo --destaque=pocao'), 'guarded');
  assert.match(t.messages.at(-1)?.payload.content ?? '', /destaque: escolha/);
});

test('GuardError em parse() anexa Uso: ...; outros erros propagam intactos para onError', async () => {
  const unexpected = new Error('falha de banco externo');
  await using t = createTestBot();

  t.bot.argumentType('fragil', {
    async parse(raw) {
      if (raw === 'guard') throw new GuardError('Formato inválido para fragil.', 'INVALID_ARGUMENT');
      if (raw === 'crash') throw unexpected;
      return { ok: raw };
    },
  });

  t.bot.command({
    name: 'testar',
    args: { dado: arg.custom<{ ok: string }>('fragil').required() },
    run: ctx => ctx.reply(ctx.args.get('dado').ok),
  });

  assert.equal(await t.send('!testar guard'), 'guarded');
  assert.equal(t.errors.length, 0);
  assert.equal(t.messages.at(-1)?.payload.content, 'Formato inválido para fragil.\nUso: !testar <dado>');

  assert.equal(await t.send('!testar crash'), 'error');
  assert.equal(t.errors.length, 1);
  assert.equal(t.errors[0], unexpected);
  assert.equal((t.errors[0] as Error).message, 'falha de banco externo');
  assert.equal(t.messages.at(-1)?.payload.content, 'Não foi possível concluir o comando.');
});

test('comando usando tipo customizado não registrado falha com YuzuhaError(ARGUMENT_TYPE)', async () => {
  await using t = createTestBot({
    commands: [
      defineCommand({
        name: 'ausente',
        args: { valor: arg.custom<string>('nao-registrado') },
        run: ctx => ctx.reply(ctx.args.get('valor') ?? 'vazio'),
      }),
    ],
  });

  // Mesmo quando opcional e omitido, o tipo customizado não registrado é detectado.
  assert.equal(await t.send('!ausente'), 'error');
  assert.equal(t.errors.length, 1);
  assert.ok(isYuzuhaError(t.errors[0], 'ARGUMENT_TYPE'));

  assert.equal(await t.send('!ausente algo'), 'error');
  assert.equal(t.errors.length, 2);
  assert.ok(isYuzuhaError(t.errors[1], 'ARGUMENT_TYPE'));
});

test('validação de nomes, duplicidade, colisão com builtins e chamadas diretas sync/async', async () => {
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false });
  try {
    const builtins = [
      'string', 'number', 'integer', 'user', 'duration', 'boolean',
      'channel', 'role', 'member', 'url', 'enum',
    ];
    for (const builtin of builtins) {
      assert.throws(
        () => bot.argumentType(builtin, { parse: raw => raw }),
        error => isYuzuhaError(error, 'ARGUMENT_TYPE'),
      );
      assert.throws(
        () => arg.custom(builtin),
        error => isYuzuhaError(error, 'ARGUMENT_TYPE'),
      );
    }

    for (const invalidName of ['', '   ', 'meu tipo', ' leading']) {
      assert.throws(
        () => bot.argumentType(invalidName, { parse: raw => raw }),
        error => isYuzuhaError(error, 'ARGUMENT_TYPE'),
      );
      assert.throws(
        () => arg.custom(invalidName),
        error => isYuzuhaError(error, 'ARGUMENT_TYPE'),
      );
    }

    assert.throws(
      // @ts-expect-error Definição sem função parse.
      () => bot.argumentType('tag', {}),
      error => isYuzuhaError(error, 'ARGUMENT_TYPE'),
    );

    bot.argumentType('tag', { parse: raw => `#${raw}`, description: 'Tag normalizada.' });
    assert.throws(
      () => bot.argumentType('tag', { parse: raw => raw }),
      error => isYuzuhaError(error, 'ARGUMENT_TYPE'),
    );

    const defs = argumentDefinitions({ tag: arg.custom<string>('tag').describe('Etiqueta principal.').required() });
    const flagDefs = argumentDefinitions({ filtro: arg.custom<string>('tag') });
    const command = { name: 'tags', args: defs, flags: flagDefs };
    assert.equal(commandUsage(command, '!'), '!tags <tag> [--filtro <tag>]');
    assert.match(commandHelp(command, '!'), /tag: tag; obrigatório\. Etiqueta principal\./);
    assert.match(commandHelp(command, '!'), /--filtro: tag; opcional/);

    const ctx = new CommandContext({
      message: mockMessage('!tags geral'),
      transport: bot.transport,
      store: bot.store,
      command,
      cooldown: () => 0,
    });
    const syncRegistry = new Map<string, CustomArgumentType<unknown>>([
      ['tag', { parse: raw => `#${raw}` }],
      ['asyncTag', { async parse(raw) { return `@${raw}`; } }],
    ]);

    assert.equal(parseArguments(defs, ['geral'], { ctx, argumentTypes: syncRegistry }).get('tag'), '#geral');
    assert.equal(parseFlags(flagDefs, ['--filtro', 'vip'], { ctx, argumentTypes: syncRegistry }).flags.get('filtro'), '#vip');

    const asyncDefs = argumentDefinitions({ tag: arg.custom<string>('asyncTag').required() });
    assert.throws(
      () => parseArguments(asyncDefs, ['geral'], { ctx, argumentTypes: syncRegistry }),
      error => isYuzuhaError(error, 'ARGUMENT_TYPE'),
    );
    assert.equal((await parseArgumentsAsync(asyncDefs, ['geral'], { ctx, argumentTypes: syncRegistry })).get('tag'), '@geral');
    assert.equal((await parseFlagsAsync(argumentDefinitions({ f: arg.custom<string>('asyncTag') }), ['--f=ok'], {
      ctx,
      argumentTypes: syncRegistry,
    })).flags.get('f'), '@ok');
  } finally {
    await bot.destroy();
  }

  assert.throws(
    () => bot.argumentType('apos-fechar', { parse: raw => raw }),
    error => isYuzuhaError(error, 'BOT_CLOSED'),
  );
});
