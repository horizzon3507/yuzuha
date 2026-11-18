import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ConfigError,
  GuildSettings,
  MemoryStore,
  SQLiteStore,
  Yuzuha,
  YuzuhaError,
  defineCommand,
  guildPrefix,
  isYuzuhaError,
} from '../src/index.js';
import type { Store } from '../src/index.js';
import { MockTransport, mockMessage } from '../src/testing.js';

test('GuildSettings e guildPrefix validam opções com ConfigError', () => {
  const store = new MemoryStore();

  for (const invalid of [
    null,
    [],
    'invalid',
    { store: null, defaults: { prefix: '!' } },
    { store: {}, defaults: { prefix: '!' } },
    { store: { read: () => {}, update: () => {}, readVariable: 'bad' }, defaults: { prefix: '!' } },
    { store, defaults: null },
    { store, defaults: [] },
    { store, defaults: { bad: Number.NaN } },
    { store, defaults: new Date() },
    { store, defaults: { prefix: '!' }, namespace: '' },
    { store, defaults: { prefix: '!' }, namespace: 'bad space' },
    { store, defaults: { prefix: '!' }, namespace: 'x'.repeat(65) },
    { store, defaults: { prefix: '!' }, maxCacheEntries: -1 },
    { store, defaults: { prefix: '!' }, maxCacheEntries: 1.5 },
    { store, defaults: { prefix: '!' }, ttlMs: -1 },
    { store, defaults: { prefix: '!' }, ttlMs: 1.5 },
    { store, defaults: { prefix: '!' }, now: 'clock' },
    { store, defaults: { prefix: '!' }, validate: 'fn' },
    { store, defaults: { prefix: '!' }, onChange: 123 },
  ]) {
    assert.throws(
      () => new GuildSettings(invalid as never),
      error => error instanceof ConfigError && isYuzuhaError(error, 'GUILD_SETTINGS_OPTIONS'),
    );
  }

  assert.throws(
    () => guildPrefix(null as never),
    error => error instanceof ConfigError && isYuzuhaError(error, 'GUILD_SETTINGS_OPTIONS'),
  );

  const valid = new GuildSettings({ store, defaults: { prefix: '!' } });
  for (const badFallback of ['', '  ', 'a b', [], ['!', ''], ['! x']]) {
    assert.throws(
      () => guildPrefix(valid, badFallback as never),
      error => error instanceof ConfigError && isYuzuhaError(error, 'PREFIX'),
    );
  }
});

test('GuildSettings opera em MemoryStore e SQLiteStore usando readVariable, namespaces isolados e cópias seguras', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yuzuha-guild-settings-'));
  const sqlitePath = join(dir, 'settings.sqlite');

  try {
    for (const createStore of [
      (): Store => new MemoryStore(),
      (): Store => new SQLiteStore(':memory:'),
      (): Store => new SQLiteStore(sqlitePath),
    ]) {
      const store = createStore();
      let readVarCalls = 0;
      let fullReadCalls = 0;
      const originalReadVar = store.readVariable!.bind(store);
      const originalRead = store.read.bind(store);
      const trackedStore: Store = {
        read: reader => {
          fullReadCalls++;
          return originalRead(reader);
        },
        update: store.update.bind(store),
        readVariable: (key, now) => {
          readVarCalls++;
          return originalReadVar(key, now);
        },
      };

      try {
        const inputDefaults = { prefix: '!', tags: ['geral'], slowmode: 0 };
        const settings = new GuildSettings({
          store: trackedStore,
          defaults: inputDefaults,
        });
        const modSettings = new GuildSettings({
          store: trackedStore,
          defaults: { logChannel: null as string | null },
          namespace: 'moderation',
        });

        inputDefaults.tags.push('mutado');
        const initial = await settings.get('100');
        assert.deepEqual(initial, { prefix: '!', tags: ['geral'], slowmode: 0 });
        assert.equal(readVarCalls, 1);
        assert.equal(fullReadCalls, 0);

        // Mutar retorno não contamina o cache nem o store.
        initial.tags.push('corrompido');
        assert.deepEqual(await settings.get('100'), { prefix: '!', tags: ['geral'], slowmode: 0 });
        assert.equal(readVarCalls, 1);

        await settings.set('100', { prefix: '?', tags: ['avisos'], slowmode: 5 });
        await modSettings.set('100', { logChannel: '900' });
        assert.deepEqual(await settings.get('100'), { prefix: '?', tags: ['avisos'], slowmode: 5 });
        assert.deepEqual(await modSettings.get('100'), { logChannel: '900' });

        // Evolução de schema: nova chave em defaults é mesclada com valores persistidos.
        const evolved = new GuildSettings({
          store: trackedStore,
          defaults: { prefix: '!', tags: ['geral'], slowmode: 0, locale: 'pt-BR' },
        });
        assert.deepEqual(await evolved.get('100'), {
          prefix: '?',
          tags: ['avisos'],
          slowmode: 5,
          locale: 'pt-BR',
        });
      } finally {
        await store.close?.();
      }
    }

    // Reabertura de arquivo SQLite preserva os dados gravados.
    const reopened = new SQLiteStore(sqlitePath);
    try {
      const settings = new GuildSettings({
        store: reopened,
        defaults: { prefix: '!', tags: ['geral'], slowmode: 0 },
      });
      assert.deepEqual(await settings.get('100'), { prefix: '?', tags: ['avisos'], slowmode: 5 });
    } finally {
      await reopened.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('cache LRU desaloja entradas antigas, respeita expiração TTL, maxCacheEntries=0 e invalidate()', async () => {
  let now = 1_000;
  let reads = 0;
  const base = new MemoryStore();
  const store: Store = {
    read: base.read.bind(base),
    update: base.update.bind(base),
    readVariable: (key, clock) => {
      reads++;
      return base.readVariable!(key, clock);
    },
  };

  const settings = new GuildSettings({
    store,
    defaults: { prefix: '!' },
    maxCacheEntries: 2,
    ttlMs: 500,
    now: () => now,
  });

  await settings.set('g1', { prefix: '1' });
  await settings.set('g2', { prefix: '2' });
  assert.equal(settings.cacheSize, 2);

  // Toca g1 para torná-la mais recente; inserir g3 deve desalojar g2.
  assert.equal((await settings.get('g1')).prefix, '1');
  assert.equal(reads, 0);

  await settings.set('g3', { prefix: '3' });
  assert.equal(settings.cacheSize, 2);

  // g1 continua em cache; g2 precisa ir ao store.
  assert.equal((await settings.get('g1')).prefix, '1');
  assert.equal(reads, 0);
  assert.equal((await settings.get('g2')).prefix, '2');
  assert.equal(reads, 1);

  // Avançar além do TTL força releitura do store.
  now += 500;
  assert.equal((await settings.get('g2')).prefix, '2');
  assert.equal(reads, 2);

  // invalidate(guildID) limpa apenas o servidor alvo; invalidate() limpa tudo.
  assert.equal((await settings.get('g2')).prefix, '2');
  assert.equal(reads, 2);
  settings.invalidate('g2');
  assert.equal((await settings.get('g2')).prefix, '2');
  assert.equal(reads, 3);

  await settings.get('g1');
  const readsBeforeClear = reads;
  settings.invalidate();
  assert.equal(settings.cacheSize, 0);
  await settings.get('g1');
  await settings.get('g2');
  assert.equal(reads, readsBeforeClear + 2);

  // maxCacheEntries: 0 desativa completamente o cache.
  const uncached = new GuildSettings({
    store,
    defaults: { prefix: '!' },
    maxCacheEntries: 0,
  });
  const baseReads = reads;
  await uncached.get('g1');
  await uncached.get('g1');
  assert.equal(reads, baseReads + 2);
  assert.equal(uncached.cacheSize, 0);
});

test('patch concorrente é atômico em MemoryStore e SQLiteStore sem perda de campos', async () => {
  for (const store of [new MemoryStore(), new SQLiteStore(':memory:')] as Store[]) {
    try {
      const settings = new GuildSettings({
        store,
        defaults: { a: 0, b: 0, c: 0, d: 0 },
      });

      await Promise.all([
        settings.patch('100', { a: 1 }),
        settings.patch('100', { b: 2 }),
        settings.patch('100', { c: 3 }),
        settings.patch('100', { d: 4 }),
      ]);

      assert.deepEqual(await settings.get('100'), { a: 1, b: 2, c: 3, d: 4 });
      settings.invalidate();
      assert.deepEqual(await settings.get('100'), { a: 1, b: 2, c: 3, d: 4 });
    } finally {
      await store.close?.();
    }
  }
});

test('validate rejeita candidatos inválidos sem persistir nem poluir cache e reset restaura defaults', async () => {
  const store = new MemoryStore();
  const changes: Array<{ guildID: string; prefix: string }> = [];

  const settings = new GuildSettings<{ prefix: string; maxWarnings: number }>({
    store,
    defaults: { prefix: '!', maxWarnings: 3 },
    validate(candidate) {
      if (!candidate.prefix || /\s/.test(candidate.prefix)) return 'Prefixo inválido.';
      if (candidate.maxWarnings < 1) return false;
      if (candidate.maxWarnings > 10) throw new Error('Limite máximo de avisos é 10.');
    },
    onChange(guildID, next) {
      assert.equal(Object.isFrozen(next), true);
      changes.push({ guildID, prefix: next.prefix });
    },
  });

  await settings.set('100', { prefix: '?', maxWarnings: 5 });
  assert.equal(changes.length, 1);

  await assert.rejects(
    settings.patch('100', { prefix: 'a b' }),
    error => isYuzuhaError(error, 'GUILD_SETTINGS_INVALID') && /Prefixo inválido/.test(error.message),
  );
  await assert.rejects(
    settings.patch('100', { maxWarnings: 0 }),
    error => isYuzuhaError(error, 'GUILD_SETTINGS_INVALID'),
  );
  await assert.rejects(
    settings.set('100', { prefix: '!', maxWarnings: 99 }),
    error => isYuzuhaError(error, 'GUILD_SETTINGS_INVALID') && /10/.test(error.message),
  );
  await assert.rejects(
    settings.patch('100', { maxWarnings: Number.NaN }),
    error => isYuzuhaError(error, 'GUILD_SETTINGS_INVALID'),
  );

  // Estado anterior permanece intacto tanto no cache quanto no store.
  assert.deepEqual(await settings.get('100'), { prefix: '?', maxWarnings: 5 });
  settings.invalidate('100');
  assert.deepEqual(await settings.get('100'), { prefix: '?', maxWarnings: 5 });
  assert.equal(changes.length, 1);

  const resetValue = await settings.reset('100');
  assert.deepEqual(resetValue, { prefix: '!', maxWarnings: 3 });
  assert.deepEqual(await settings.get('100'), { prefix: '!', maxWarnings: 3 });
  assert.deepEqual(changes, [
    { guildID: '100', prefix: '?' },
    { guildID: '100', prefix: '!' },
  ]);
});

test('guildPrefix retorna fallback sincronamente em DMs e invalida prefixCache automaticamente em servidores', async t => {
  const store = new MemoryStore();
  const transport = new MockTransport();

  let botRef: Yuzuha | undefined;
  const settings = new GuildSettings<{ prefix?: string | string[] }>({
    store,
    defaults: {},
    onChange: guildID => { botRef?.invalidatePrefix(guildID); },
  });

  const resolver = guildPrefix(settings, '!');
  // Em DM (!guildID) deve retornar o fallback imediatamente (sem Promise).
  const dmResolved = resolver(mockMessage('!ping', { guildID: '' }));
  assert.equal(dmResolved, '!');

  const bot = new Yuzuha({
    transport,
    store,
    scheduler: false,
    prefix: resolver,
    prefixCache: { ttlMs: 600_000, max: 100 },
  });
  botRef = bot;
  t.after(() => bot.destroy());

  bot.command(defineCommand({
    name: 'ping',
    async run(ctx) { await ctx.reply(`pong:${ctx.guildID || 'dm'}`); },
  }));

  // Servidor 100 usa fallback '!' inicialmente e popula prefixCache do bot.
  assert.equal(await bot.handle(mockMessage('!ping', { id: 'm1', guildID: '100' })), 'success');
  assert.equal(transport.messages.at(-1)?.payload.content, 'pong:100');

  // DM usa fallback '!'.
  assert.equal(await bot.handle(mockMessage('!ping', { id: 'm2', guildID: '' })), 'success');
  assert.equal(transport.messages.at(-1)?.payload.content, 'pong:dm');

  // Alterar prefixo do servidor 100 dispara onChange -> bot.invalidatePrefix('100').
  await settings.patch('100', { prefix: ['?', '>>'] });
  assert.equal(await bot.handle(mockMessage('!ping', { id: 'm3', guildID: '100' })), 'ignored');
  assert.equal(await bot.handle(mockMessage('?ping', { id: 'm4', guildID: '100' })), 'success');
  assert.equal(await bot.handle(mockMessage('>>ping', { id: 'm5', guildID: '100' })), 'success');

  // Outro servidor e DM continuam com fallback '!'.
  assert.equal(await bot.handle(mockMessage('!ping', { id: 'm6', guildID: '200' })), 'success');
  assert.equal(await bot.handle(mockMessage('!ping', { id: 'm7', guildID: '' })), 'success');

  // Resetar servidor 100 restaura '!' imediatamente sem aguardar TTL do prefixCache.
  await settings.reset('100');
  assert.equal(await bot.handle(mockMessage('?ping', { id: 'm8', guildID: '100' })), 'ignored');
  assert.equal(await bot.handle(mockMessage('!ping', { id: 'm9', guildID: '100' })), 'success');
});
