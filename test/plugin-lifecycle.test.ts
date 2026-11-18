import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, Events } from '@fluxerjs/core';
import {
  CommandContext,
  ConfigError,
  MemoryStore,
  Yuzuha,
  createServiceKey,
  defineCommand,
  defineEvent,
  isYuzuhaError,
} from '../src/index.js';
import type { ErrorReportInfo, ServiceKey, YuzuhaPlugin } from '../src/index.js';
import { functions, script } from '../src/functions.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function flush(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

test('createServiceKey, provide, hasService, get e resolve funcionam no bot, comandos e eventos', async () => {
  for (const invalid of ['', '   ', null, undefined, 42, {}]) {
    assert.throws(
      () => createServiceKey(invalid as never),
      error => isYuzuhaError(error, 'SERVICE_KEY'),
    );
  }

  const keyA = createServiceKey<{ prefixLabel: string }>('rotulo');
  const keyB = createServiceKey<{ prefixLabel: string }>('rotulo');
  const optionalUndefinedKey = createServiceKey<string | undefined>('opcional-indefinido');
  const absentKey = createServiceKey<number>('ausente');

  assert.notEqual(keyA.id, keyB.id);
  assert.equal(keyA.description, 'rotulo');
  assert.equal(Object.isFrozen(keyA), true);

  const transport = new MockTransport();
  const bot = new Yuzuha({
    transport,
    store: new MemoryStore(),
    scheduler: false,
    engine: functions({
      functions: [{
        name: 'lerServico',
        category: 'test',
        description: 'Lê serviço via ctx.',
        usage: '$lerServico',
        minArgs: 0,
        maxArgs: 0,
        execute(call) {
          return call.ctx.get(keyA).prefixLabel;
        },
      }],
    }),
  });

  // Validação de chaves falsificadas em todos os pontos de acesso
  for (const badKey of [null, {}, { id: 'nao-simbolo', description: 'x' }, { id: Symbol('x'), description: '  ' }]) {
    assert.throws(() => bot.provide(badKey as never, 1), error => isYuzuhaError(error, 'SERVICE_KEY'));
    assert.throws(() => bot.hasService(badKey as never), error => isYuzuhaError(error, 'SERVICE_KEY'));
    assert.throws(() => bot.get(badKey as never), error => isYuzuhaError(error, 'SERVICE_KEY'));
    assert.throws(() => bot.resolve(badKey as never), error => isYuzuhaError(error, 'SERVICE_KEY'));
  }

  assert.equal(bot.hasService(keyA), false);
  assert.equal(bot.resolve(keyA), undefined);
  assert.throws(() => bot.get(keyA), error => isYuzuhaError(error, 'SERVICE_MISSING'));

  // Encadeamento fluente, isolamento por Symbol e suporte a valor undefined explícito
  assert.equal(
    bot.provide(keyA, { prefixLabel: 'alfa' })
      .provide(keyB, { prefixLabel: 'beta' })
      .provide(optionalUndefinedKey, undefined),
    bot,
  );
  assert.equal(bot.hasService(keyA), true);
  assert.equal(bot.hasService(optionalUndefinedKey), true);
  assert.equal(bot.get(keyA).prefixLabel, 'alfa');
  assert.equal(bot.get(keyB).prefixLabel, 'beta');
  assert.equal(bot.get(optionalUndefinedKey), undefined);
  assert.equal(bot.resolve(optionalUndefinedKey), undefined);
  assert.equal(bot.resolve(absentKey), undefined);

  assert.throws(
    () => bot.provide(keyA, { prefixLabel: 'duplicado' }),
    error => isYuzuhaError(error, 'SERVICE_DUPLICATE'),
  );

  // Acesso via CommandContext nativo, script e EventContext
  const eventSeen: string[] = [];
  bot.command(defineCommand({
    name: 'servico',
    async run(ctx) {
      const label = ctx.get(keyA).prefixLabel;
      const missing = ctx.resolve(absentKey);
      assert.throws(() => ctx.get(absentKey), error => isYuzuhaError(error, 'SERVICE_MISSING'));
      await ctx.reply(`${label}:${String(missing)}`);
    },
  }));
  bot.command(script({
    name: 'servico-script',
    code: '$reply[$lerServico]',
  }));
  bot.contextEvent({
    event: Events.GuildMemberAdd,
    run(ctx) {
      eventSeen.push(`${ctx.get(keyB).prefixLabel}:${String(ctx.resolve(absentKey))}`);
    },
  });

  try {
    assert.equal(await bot.handle(mockMessage('!servico', { id: 's1' })), 'success');
    assert.equal(transport.messages.at(-1)?.payload.content, 'alfa:undefined');

    assert.equal(await bot.handle(mockMessage('!servico-script', { id: 's2' })), 'success');
    assert.equal(transport.messages.at(-1)?.payload.content, 'alfa');

    bot.client.emit(Events.GuildMemberAdd, {
      id: '2',
      guild: { id: '100' },
      user: { username: 'Alvo', bot: false },
    } as never);
    await flush();
    assert.deepEqual(eventSeen, ['beta:undefined']);

    // CommandContext isolado sem container responde com SERVICE_MISSING / undefined
    const standalone = new CommandContext({
      message: mockMessage(''),
      transport,
      store: new MemoryStore(),
      command: { name: 'solo' },
      cooldown: () => 0,
    });
    assert.equal(standalone.resolve(keyA), undefined);
    assert.throws(() => standalone.get(keyA), error => isYuzuhaError(error, 'SERVICE_MISSING'));
  } finally {
    await bot.destroy();
  }

  assert.throws(() => bot.provide(absentKey, 1), error => isYuzuhaError(error, 'BOT_CLOSED'));
});

test('dependsOn valida dependências na instalação e bloqueia unplugin enquanto houver dependente ativo', async () => {
  const DbKey = createServiceKey<{ connected: boolean }>('db');
  const transport = new MockTransport();
  const bot = new Yuzuha({ transport, store: new MemoryStore(), scheduler: false });

  // Falha de dependsOn não aplica comandos, eventos nem executa setup
  let orphanSetupCalled = false;
  let orphanEventCalled = false;
  assert.throws(
    () => bot.plugin({
      name: 'analytics',
      dependsOn: ['db', 'telemetria'],
      commands: [defineCommand({ name: 'relatorio', run() {} })],
      events: [defineEvent({ event: Events.Ready, run() { orphanEventCalled = true; } })],
      setup() { orphanSetupCalled = true; },
    }),
    error => isYuzuhaError(error, 'PLUGIN_DEPENDENCY') && /db.*telemetria/.test(error.message),
  );
  assert.equal(orphanSetupCalled, false);
  assert.equal(bot.listCommands().length, 0);
  bot.client.emit(Events.Ready);
  await flush();
  assert.equal(orphanEventCalled, false);

  // dependsOn malformado e setup/teardown inválidos
  assert.throws(
    () => bot.plugin({ name: 'bad-deps', dependsOn: [''] }),
    error => isYuzuhaError(error, 'PLUGIN_DEPENDENCY'),
  );
  assert.throws(
    () => bot.plugin({ name: 'bad-setup', setup: 'nao-funcao' as never }),
    error => error instanceof ConfigError && isYuzuhaError(error, 'OPTIONS'),
  );
  assert.throws(
    () => bot.plugin({ name: 'bad-teardown', teardown: 123 as never }),
    error => error instanceof ConfigError && isYuzuhaError(error, 'OPTIONS'),
  );

  // Encadeamento síncrono: bot.plugin(a).plugin(b).command(...)
  bot
    .plugin({
      name: 'db',
      setup(instance) {
        instance.provide(DbKey, { connected: true });
      },
    })
    .plugin({
      name: 'analytics',
      dependsOn: ['db'],
      commands: [defineCommand({
        name: 'status-db',
        async run(ctx) {
          await ctx.reply(`conectado:${ctx.get(DbKey).connected}`);
        },
      })],
    })
    .command(defineCommand({ name: 'manual', run() {} }));

  try {
    assert.equal(await bot.handle(mockMessage('!status-db')), 'success');
    assert.equal(transport.messages.at(-1)?.payload.content, 'conectado:true');

    // Remover plugin inexistente lança PLUGIN_NOT_FOUND
    await assert.rejects(
      bot.unplugin('inexistente'),
      error => isYuzuhaError(error, 'PLUGIN_NOT_FOUND'),
    );

    // Remover 'db' enquanto 'analytics' está ativo lança PLUGIN_DEPENDENCY e preserva tudo
    await assert.rejects(
      bot.unplugin('db'),
      error => isYuzuhaError(error, 'PLUGIN_DEPENDENCY') && /analytics/.test(error.message),
    );
    assert.equal(bot.hasService(DbKey), true);
    assert.equal(await bot.handle(mockMessage('!status-db', { id: '2' })), 'success');

    // Remover 'analytics' e depois 'db' funciona limpamente
    await bot.unplugin('analytics');
    assert.equal(await bot.handle(mockMessage('!status-db', { id: '3' })), 'ignored');
    await bot.unplugin('db');
    assert.equal(bot.hasService(DbKey), false);
    assert.deepEqual(bot.listCommands().map(cmd => cmd.name), ['manual']);
  } finally {
    await bot.destroy();
  }
});

test('setup assíncrono retorna Promise<this> e faz rollback atômico em falha síncrona ou assíncrona', async () => {
  const CacheKey: ServiceKey<Map<string, string>> = createServiceKey('cache');
  const AsyncKey: ServiceKey<string> = createServiceKey('async-svc');
  const transport = new MockTransport();
  const bot = new Yuzuha({
    transport,
    store: new MemoryStore(),
    scheduler: false,
    engine: functions(),
  });

  const mwHits: string[] = [];
  let syncLeakEvents = 0;
  let asyncLeakEvents = 0;

  // 1. Falha síncrona em setup faz rollback de comandos, funções, middlewares, eventos e serviços
  assert.throws(
    () => bot.plugin({
      name: 'falha-sync',
      functions: [{
        name: 'fnSyncTemp',
        aliases: ['aliasSyncTemp'],
        category: 'test',
        description: '',
        usage: '$fnSyncTemp',
        minArgs: 0,
        maxArgs: 0,
        execute: () => 'vazou',
      }],
      middleware: [async (_ctx, next) => { mwHits.push('sync-declarativo'); await next(); }],
      commands: [script({ name: 'cmd-sync', code: '$reply[$fnSyncTemp]' })],
      events: [defineEvent({ event: Events.Ready, run() { syncLeakEvents++; } })],
      setup(instance) {
        instance.provide(CacheKey, new Map([['k', 'v']]));
        instance.use(async (_ctx, next) => { mwHits.push('sync-imperativo'); await next(); });
        instance.command(defineCommand({ name: 'cmd-sync-imp', run() {} }));
        instance.on(Events.Ready, () => { syncLeakEvents++; });
        throw new Error('boom síncrono');
      },
    }),
    /boom síncrono/,
  );

  assert.equal(bot.hasService(CacheKey), false);
  assert.equal(bot.listCommands().length, 0);
  assert.throws(() => bot.engine!.compile('$fnSyncTemp'), { code: 'UNKNOWN_FUNCTION' });
  assert.throws(() => bot.engine!.compile('$aliasSyncTemp'), { code: 'UNKNOWN_FUNCTION' });

  // 2. Falha assíncrona em setup faz rollback completo mesmo após await
  await assert.rejects(
    bot.plugin({
      name: 'falha-async',
      functions: [{
        name: 'fnAsyncTemp',
        category: 'test',
        description: '',
        usage: '$fnAsyncTemp',
        minArgs: 0,
        maxArgs: 0,
        execute: () => 'vazou-async',
      }],
      middleware: [async (_ctx, next) => { mwHits.push('async-declarativo'); await next(); }],
      commands: [defineCommand({ name: 'cmd-async-decl', aliases: ['cad'], run() {} })],
      events: [defineEvent({ event: Events.Ready, run() { asyncLeakEvents++; } })],
      async setup(instance) {
        instance.provide(CacheKey, new Map());
        await flush();
        instance.provide(AsyncKey, 'parcial');
        instance.use(async (_ctx, next) => { mwHits.push('async-imperativo'); await next(); });
        instance.command(defineCommand({ name: 'cmd-async-imp', run() {} }));
        instance.on(Events.Ready, () => { asyncLeakEvents++; });
        throw new Error('boom assíncrono');
      },
    }),
    /boom assíncrono/,
  );

  assert.equal(bot.hasService(CacheKey), false);
  assert.equal(bot.hasService(AsyncKey), false);
  assert.equal(bot.listCommands().length, 0);
  assert.throws(() => bot.engine!.compile('$fnAsyncTemp'), { code: 'UNKNOWN_FUNCTION' });
  bot.client.emit(Events.Ready);
  await flush();
  assert.equal(syncLeakEvents, 0);
  assert.equal(asyncLeakEvents, 0);

  // 3. O mesmo plugin pode ser instalado com sucesso após o rollback
  const returned = await bot.plugin({
    name: 'falha-async',
    async setup(instance) {
      await flush();
      instance.provide(AsyncKey, 'pronto');
      instance.command(defineCommand({
        name: 'ok',
        async run(ctx) { await ctx.reply(ctx.get(AsyncKey)); },
      }));
    },
  });
  assert.equal(returned, bot);

  try {
    assert.equal(await bot.handle(mockMessage('!ok')), 'success');
    assert.equal(transport.messages.at(-1)?.payload.content, 'pronto');
    assert.deepEqual(mwHits, []);
  } finally {
    await bot.destroy();
  }
});

test('unplugin executa teardown e remove comandos, middlewares, eventos, funções e serviços do plugin', async () => {
  const SvcKey = createServiceKey<{ closed: boolean }>('recurso-plugin');
  const transport = new MockTransport();
  const bot = new Yuzuha({
    transport,
    store: new MemoryStore(),
    scheduler: false,
    engine: functions(),
  });

  const trace: string[] = [];
  const sharedMiddleware = async (_ctx: unknown, next: () => Promise<void>) => {
    trace.push('mw');
    await next();
  };
  // Middleware global fora de qualquer plugin deve permanecer ativo após unplugin
  bot.use(async (_ctx, next) => {
    trace.push('global');
    await next();
  });
  bot.command(defineCommand({
    name: 'base',
    async run(ctx) { await ctx.reply('base-ok'); },
  }));

  let pluginReadyCount = 0;
  let teardownSawService = false;

  const removablePlugin: YuzuhaPlugin = {
    name: 'removivel',
    functions: [{
      name: 'plugValor',
      aliases: ['pv'],
      category: 'test',
      description: '',
      usage: '$plugValor',
      minArgs: 0,
      maxArgs: 0,
      execute: () => '42',
    }],
    middleware: [sharedMiddleware],
    commands: [
      defineCommand({
        name: 'plug-nativo',
        aliases: ['pn'],
        async run(ctx) { await ctx.reply(`fechado:${ctx.get(SvcKey).closed}`); },
      }),
      script({ name: 'plug-script', code: '$reply[$pv]' }),
    ],
    events: [defineEvent({ event: Events.Ready, run() { pluginReadyCount++; } })],
    async setup(instance) {
      await flush();
      instance.provide(SvcKey, { closed: false });
      instance.on(Events.Ready, () => { pluginReadyCount += 10; });
    },
    async teardown(instance) {
      await flush();
      const svc = instance.get(SvcKey);
      teardownSawService = svc.closed === false;
      svc.closed = true;
    },
  };

  await bot.plugin(removablePlugin);

  try {
    assert.equal(await bot.handle(mockMessage('!pn', { id: 'u1' })), 'success');
    assert.equal(transport.messages.at(-1)?.payload.content, 'fechado:false');
    assert.deepEqual(trace, ['global', 'mw']);
    trace.length = 0;

    assert.equal(await bot.handle(mockMessage('!plug-script', { id: 'u2' })), 'success');
    assert.equal(transport.messages.at(-1)?.payload.content, '42');
    trace.length = 0;

    bot.client.emit(Events.Ready);
    await flush();
    assert.equal(pluginReadyCount, 11);

    await bot.unplugin('removivel');
    assert.equal(teardownSawService, true);
    assert.equal(bot.hasService(SvcKey), false);
    assert.throws(() => bot.engine!.compile('$plugValor'), { code: 'UNKNOWN_FUNCTION' });
    assert.throws(() => bot.engine!.compile('$pv'), { code: 'UNKNOWN_FUNCTION' });

    // Comandos e aliases do plugin foram removidos
    assert.equal(await bot.handle(mockMessage('!plug-nativo', { id: 'u3' })), 'ignored');
    assert.equal(await bot.handle(mockMessage('!pn', { id: 'u4' })), 'ignored');
    assert.equal(await bot.handle(mockMessage('!plug-script', { id: 'u5' })), 'ignored');

    // Eventos do plugin não disparam mais
    bot.client.emit(Events.Ready);
    await flush();
    assert.equal(pluginReadyCount, 11);

    // Comando e middleware globais continuam funcionando
    assert.equal(await bot.handle(mockMessage('!base', { id: 'u6' })), 'success');
    assert.deepEqual(trace, ['global']);

    // Reinstalação limpa do mesmo plugin funciona
    await bot.plugin(removablePlugin);
    assert.equal(bot.hasService(SvcKey), true);
    assert.equal(await bot.handle(mockMessage('!plug-nativo', { id: 'u7' })), 'success');
    assert.equal(transport.messages.at(-1)?.payload.content, 'fechado:false');
  } finally {
    await bot.destroy();
  }
});

test('destroy executa teardown dos plugins em ordem reversa LIFO e reporta falhas sem bloquear encerramento', async () => {
  const RootKey = createServiceKey<{ events: string[] }>('raiz');
  const reported: { error: unknown; info: ErrorReportInfo }[] = [];
  const order: string[] = [];
  let musicClosed = false;
  let clientDestroyed = false;

  const client = new Client();
  Reflect.set(client, 'destroy', async () => {
    order.push('client.destroy');
    clientDestroyed = true;
  });

  const bot = new Yuzuha({
    client,
    transport: new MockTransport(),
    store: new MemoryStore(),
    scheduler: false,
    music: {
      close: async () => {
        order.push('music.close');
        musicClosed = true;
      },
    } as never,
    onError(error, _ctx, info) {
      reported.push({ error, info });
    },
  });

  bot.plugin({
    name: 'primeiro',
    setup(instance) {
      instance.provide(RootKey, { events: order });
    },
    async teardown(instance) {
      await flush();
      assert.equal(instance.hasService(RootKey), true);
      order.push('teardown:primeiro');
    },
  });

  await bot.plugin({
    name: 'segundo',
    dependsOn: ['primeiro'],
    async setup() {
      await flush();
    },
    async teardown(instance) {
      // Serviço de 'primeiro' ainda está disponível durante o teardown de 'segundo'
      instance.get(RootKey).events.push('teardown:segundo');
      throw new Error('falha no segundo');
    },
  });

  bot.plugin({
    name: 'terceiro',
    dependsOn: ['segundo'],
    teardown(instance) {
      instance.get(RootKey).events.push('teardown:terceiro');
    },
  });

  await bot.destroy();

  assert.deepEqual(order, [
    'teardown:terceiro',
    'teardown:segundo',
    'teardown:primeiro',
    'music.close',
    'client.destroy',
  ]);
  assert.equal(musicClosed, true);
  assert.equal(clientDestroyed, true);
  assert.equal(bot.hasService(RootKey), false);
  assert.equal(reported.length, 1);
  assert.match(String(reported[0]?.error), /falha no segundo/);
  assert.equal(reported[0]?.info.source, 'hook');
  assert.equal(reported[0]?.info.event, 'plugin.teardown:segundo');
});
