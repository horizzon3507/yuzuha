import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, Events } from '@fluxerjs/core';
import {
  ConfigError,
  MemoryStore,
  Yuzuha,
  arg,
  commandHelp,
  commandUsage,
  defineCommand,
  isYuzuhaError,
} from '../src/index.js';
import type { HelpRenderContext, UnknownCommandContext } from '../src/index.js';
import { functions, script } from '../src/functions.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function flush(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

test('helpRenderer, allowBots e mentionPrefix validam tipos com ConfigError OPTIONS', () => {
  for (const invalid of [null, true, 123, 'renderer', {}, []]) {
    assert.throws(
      () => new Yuzuha({ helpRenderer: invalid as never, transport: new MockTransport(), store: new MemoryStore(), scheduler: false }),
      error => error instanceof ConfigError && isYuzuhaError(error, 'OPTIONS'),
    );
  }
  for (const invalid of [null, 0, 1, 'true', {}, []]) {
    assert.throws(
      () => new Yuzuha({ allowBots: invalid as never, transport: new MockTransport(), store: new MemoryStore(), scheduler: false }),
      error => error instanceof ConfigError && isYuzuhaError(error, 'OPTIONS'),
    );
    assert.throws(
      () => new Yuzuha({ mentionPrefix: invalid as never, transport: new MockTransport(), store: new MemoryStore(), scheduler: false }),
      error => error instanceof ConfigError && isYuzuhaError(error, 'OPTIONS'),
    );
  }
});

test('helpRenderer formata catálogo geral, comandos específicos, subcomandos, hidden e ctx.help', async () => {
  const contexts: HelpRenderContext[] = [];
  const transport = new MockTransport();
  const bot = new Yuzuha({
    transport,
    store: new MemoryStore(),
    scheduler: false,
    engine: functions(),
    helpRenderer(context) {
      contexts.push(context);
      if (!context.command) {
        return `Catálogo (${context.prefix || 'sem-prefixo'}): ${context.commands.map(cmd => cmd.name).join(', ')}`;
      }
      const subNames = (context.command.subcommands ?? []).map(sub => sub.name).join('|');
      return `Detalhe [${context.query}] -> ${commandUsage(context.command, context.prefix)} {subs:${subNames}} (padrao=${commandHelp(context.command, context.prefix).split('\n')[0]})`;
    },
  });

  bot.command(defineCommand({
    name: 'ping',
    description: 'Mostra latência.',
    async run(ctx) {
      await ctx.reply(`${ctx.help()} :: ${ctx.help('ping', '!')}`);
    },
  }));
  bot.command({
    name: 'config',
    aliases: ['cfg'],
    description: 'Configurações.',
    subcommands: [
      defineCommand({
        name: 'prefixo',
        aliases: ['p'],
        args: { valor: arg.text().required() },
        run() {},
      }),
      defineCommand({
        name: 'secreto',
        hidden: true,
        run() {},
      }),
    ],
  });
  bot.command({
    name: 'oculto',
    hidden: true,
    subcommands: [{ name: 'filho', hidden: false, run() {} }],
  });
  bot.command(script({
    name: 'ajuda-script',
    code: '$reply[$help]',
  }));

  try {
    // Catálogo geral sem query filtra comandos e subcomandos ocultos
    const general = bot.help(undefined, '!');
    assert.equal(general, 'Catálogo (!): ping, config, ajuda-script');
    assert.equal(contexts.length, 1);
    assert.equal(contexts[0]?.command, undefined);
    assert.equal('query' in contexts[0]!, false);
    assert.equal(contexts[0]?.prefix, '!');
    assert.deepEqual(
      contexts[0]?.commands.find(cmd => cmd.name === 'config')?.subcommands?.map(sub => sub.name),
      ['prefixo'],
    );

    // Consulta específica por grupo e por alias de subcomando preserva query e snapshot isolado
    const groupDetail = bot.help('config', '?');
    assert.match(groupDetail, /^Detalhe \[config\] -> \?config <subcomando> \{subs:prefixo\}/);

    const leafDetail = bot.help('cfg p', '!');
    assert.match(leafDetail, /^Detalhe \[cfg p\] -> !config prefixo <valor> \{subs:\}/);
    assert.equal(contexts.at(-1)?.command?.name, 'config prefixo');
    contexts.at(-1)!.command!.description = 'mutado externamente';
    assert.notEqual(bot.help('cfg p', '!'), 'mutado externamente');

    // Comandos inexistentes, entradas com sobra ou ocultos retornam string vazia sem acionar helpRenderer
    const countBeforeEmpty = contexts.length;
    assert.equal(bot.help('inexistente', '!'), '');
    assert.equal(bot.help('ping sobra', '!'), '');
    assert.equal(bot.help('oculto', '!'), '');
    assert.equal(bot.help('oculto filho', '!'), '');
    assert.equal(bot.help('config secreto', '!'), '');
    assert.equal(bot.help('   ', '!'), '');
    assert.equal(contexts.length, countBeforeEmpty);

    // ctx.help() e $help usam helpRenderer
    assert.equal(await bot.handle(mockMessage('!ping')), 'success');
    assert.match(
      transport.messages.at(-1)!.payload.content!,
      /^Catálogo \(sem-prefixo\): ping, config, ajuda-script :: Detalhe \[ping\] -> !ping/,
    );
    assert.equal(await bot.handle(mockMessage('!ajuda-script')), 'success');
    assert.equal(transport.messages.at(-1)?.payload.content, 'Catálogo (sem-prefixo): ping, config, ajuda-script');

    // Fallback de grupo sem subcomando e subcomando inválido usa helpRenderer
    assert.equal(await bot.handle(mockMessage('!config')), 'guarded');
    assert.match(transport.messages.at(-1)!.payload.content!, /^Detalhe \[config\] -> !config <subcomando> \{subs:prefixo\}/);

    assert.equal(await bot.handle(mockMessage('!config invalido')), 'guarded');
    assert.match(transport.messages.at(-1)!.payload.content!, /^Subcomando desconhecido\.\nDetalhe \[config\] -> !config <subcomando>/);
  } finally {
    await bot.destroy();
  }
});

test('allowBots aceita mensagens de outros bots mas bloqueia sempre o próprio botID no handle e no gateway', async () => {
  const client = new Client();
  Reflect.set(client, 'login', async () => client);
  Reflect.set(client, 'destroy', async () => {});

  const transport = new MockTransport();
  transport.setMember('100', { id: '50', owner: false, permissions: 0n, rank: 5 });

  const bot = new Yuzuha({
    client,
    transport,
    store: new MemoryStore(),
    scheduler: false,
    allowBots: true,
  });
  const authors: string[] = [];
  bot.command(defineCommand({
    name: 'eco',
    args: { texto: arg.text().default('ok') },
    async run(ctx) {
      authors.push(`${ctx.authorID}:${ctx.message.authorBot}`);
      await ctx.reply(`eco:${ctx.args.get('texto')}`);
    },
  }));

  await bot.login('offline-token');
  try {
    // Outro bot via handle() é aceito quando allowBots: true
    assert.equal(
      await bot.handle(mockMessage('!eco parceiro', { id: 'b1', authorID: '50', authorBot: true })),
      'success',
    );
    assert.equal(transport.messages.at(-1)?.payload.content, 'eco:parceiro');

    // Auto-mensagem do próprio botID é SEMPRE ignorada (mesmo com authorBot: false ou true)
    assert.equal(
      await bot.handle(mockMessage('!eco loop-1', { id: 's1', authorID: transport.botID, authorBot: true })),
      'ignored',
    );
    assert.equal(
      await bot.handle(mockMessage('!eco loop-2', { id: 's2', authorID: transport.botID, authorBot: false })),
      'ignored',
    );

    // Gateway listener (Events.MessageCreate): aceita outro bot e ignora o próprio botID
    const gatewayMsg = (id: string, content: string, author: { id: string; username: string; bot: boolean }) => ({
      id,
      content,
      channelId: '200',
      guildId: '100',
      author,
      mentions: [],
    });

    client.emit(Events.MessageCreate, gatewayMsg('g-self-bot', '!eco auto', { id: transport.botID, username: 'self', bot: true }) as never);
    client.emit(Events.MessageCreate, gatewayMsg('g-self-human', '!eco auto2', { id: transport.botID, username: 'self', bot: false }) as never);
    client.emit(Events.MessageCreate, gatewayMsg('g-other-bot', '!eco gateway', { id: '50', username: 'helper-bot', bot: true }) as never);
    await flush();

    assert.deepEqual(authors, ['50:true', '50:true']);
    assert.equal(transport.messages.length, 2);
    assert.equal(transport.messages.at(-1)?.payload.content, 'eco:gateway');
  } finally {
    await bot.destroy();
  }
});

test('mentionPrefix aceita <@id> e <@!id> com ou sem espaço em prefixos estáticos, dinâmicos e onUnknownCommand', async () => {
  const client = new Client();
  Reflect.set(client, 'login', async () => client);
  Reflect.set(client, 'destroy', async () => {});

  const transport = new MockTransport();
  const unknownCalls: UnknownCommandContext[] = [];

  const bot = new Yuzuha({
    client,
    transport,
    store: new MemoryStore(),
    scheduler: false,
    prefix: '!',
    mentionPrefix: true,
    hooks: {
      onUnknownCommand(info) {
        unknownCalls.push(info);
        return `desconhecido:${info.prefix}:${info.name}:${info.input}`;
      },
    },
  });

  bot.command(defineCommand({
    name: 'ping',
    args: { valor: arg.text().default('vazio') },
    async run(ctx) {
      await ctx.reply(`${ctx.args.get('valor')}`);
    },
  }));

  await bot.login('offline-token');
  try {
    // <@id> com espaço e <@!id> sem espaço (mesmo quando '<' também é prefixo configurado)
    assert.equal(await bot.handle(mockMessage('<@999> ping 123', { id: 'm1' })), 'success');
    assert.equal(transport.messages.at(-1)?.payload.content, '123');

    assert.equal(await bot.handle(mockMessage('<@!999>ping', { id: 'm2' })), 'success');
    assert.equal(transport.messages.at(-1)?.payload.content, 'vazio');

    // Menção isolada sem comando ou menção a outro ID não aciona comandos nem onUnknownCommand
    assert.equal(await bot.handle(mockMessage('<@999>', { id: 'm3' })), 'ignored');
    assert.equal(await bot.handle(mockMessage('<@!999>   ', { id: 'm4' })), 'ignored');
    assert.equal(await bot.handle(mockMessage('<@9999> ping', { id: 'm5' })), 'ignored');
    assert.equal(await bot.handle(mockMessage('<@2> ping', { id: 'm6' })), 'ignored');
    assert.equal(unknownCalls.length, 0);

    // onUnknownCommand com menção preserva o prefixo de menção casado
    assert.equal(await bot.handle(mockMessage('<@!999> ausente arg1 arg2', { id: 'm7' })), 'ignored');
    assert.equal(unknownCalls.length, 1);
    assert.equal(unknownCalls[0]?.prefix, '<@!999>');
    assert.equal(unknownCalls[0]?.name, 'ausente');
    assert.equal(unknownCalls[0]?.input, 'arg1 arg2');
    assert.equal(transport.messages.at(-1)?.payload.content, 'desconhecido:<@!999>:ausente:arg1 arg2');

    // Pré-filtro do gateway (this.listener) aceita <@id> e <@!id>
    const gatewayMsg = (id: string, content: string) => ({
      id,
      content,
      channelId: '200',
      guildId: '100',
      author: { id: '1', username: 'Hory', bot: false },
      mentions: ['999'],
    });
    client.emit(Events.MessageCreate, gatewayMsg('gm1', '<@999> ping via-gateway') as never);
    client.emit(Events.MessageCreate, gatewayMsg('gm2', '<@!999>ping') as never);
    await flush();
    assert.equal(transport.messages.at(-2)?.payload.content, 'via-gateway');
    assert.equal(transport.messages.at(-1)?.payload.content, 'vazio');

    // Quando '<' também é prefixo explícito, a menção ao bot tem precedência por comprimento
    const angleTransport = new MockTransport();
    const angleBot = new Yuzuha({
      transport: angleTransport,
      store: new MemoryStore(),
      scheduler: false,
      prefix: ['!', '<'],
      mentionPrefix: true,
    });
    angleBot.command(defineCommand({
      name: 'ping',
      async run(ctx) { await ctx.reply(`ok:${ctx.input}`); },
    }));
    try {
      assert.equal(await angleBot.handle(mockMessage('<@999> ping curto', { id: 'ang1' })), 'success');
      assert.equal(angleTransport.messages.at(-1)?.payload.content, 'ok:curto');
    } finally {
      await angleBot.destroy();
    }

    // Quando botID está vazio, menções são ignoradas sem quebrar o prefixo configurado
    transport.botID = '';
    assert.equal(await bot.handle(mockMessage('<@> ping', { id: 'm8' })), 'ignored');
    assert.equal(await bot.handle(mockMessage('!ping ok', { id: 'm9' })), 'success');
    assert.equal(transport.messages.at(-1)?.payload.content, 'ok');
  } finally {
    await bot.destroy();
  }

  // Prefixo dinâmico (frio e quente com prefixCache) + mentionPrefix: false por padrão
  const dynTransport = new MockTransport();
  const dynamicBot = new Yuzuha({
    transport: dynTransport,
    store: new MemoryStore(),
    scheduler: false,
    mentionPrefix: true,
    prefixCache: { ttlMs: 60_000 },
    prefix: async () => '$',
  });
  dynamicBot.command(defineCommand({
    name: 'soma',
    args: { n: arg.integer().required() },
    async run(ctx) { await ctx.reply(String(ctx.args.get('n') + 1)); },
  }));

  try {
    // Cache frio com menção
    assert.equal(await dynamicBot.handle(mockMessage('<@999> soma 4', { id: 'd1' })), 'success');
    assert.equal(dynTransport.messages.at(-1)?.payload.content, '5');
    // Cache quente com <@!id> sem espaço e com prefixo dinâmico configurado
    assert.equal(await dynamicBot.handle(mockMessage('<@!999>soma 9', { id: 'd2' })), 'success');
    assert.equal(dynTransport.messages.at(-1)?.payload.content, '10');
    assert.equal(await dynamicBot.handle(mockMessage('$soma 1', { id: 'd3' })), 'success');
    assert.equal(dynTransport.messages.at(-1)?.payload.content, '2');
  } finally {
    await dynamicBot.destroy();
  }

  // mentionPrefix desligado por padrão ignora menções
  const defaultBot = new Yuzuha({
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
  });
  defaultBot.command(defineCommand({ name: 'ping', run() {} }));
  try {
    assert.equal(await defaultBot.handle(mockMessage('<@999> ping', { id: 'off1' })), 'ignored');
    assert.equal(await defaultBot.handle(mockMessage('<@!999>ping', { id: 'off2' })), 'ignored');
  } finally {
    await defaultBot.destroy();
  }
});
