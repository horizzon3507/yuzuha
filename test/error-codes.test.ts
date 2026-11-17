import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import type { Client } from '@fluxerjs/core';
import {
  ConfigError,
  FluxerTransport,
  GuardError,
  MemoryStore,
  PartialModerationError,
  SQLiteStore,
  ScriptError,
  StoreError,
  TransportError,
  YUZUHA_ERROR_CODES,
  Yuzuha,
  YuzuhaError,
  defaultDataPath,
  isYuzuhaError,
} from '../src/index.js';
import type { YuzuhaErrorCode } from '../src/index.js';
import { configuredBot, findConfig } from '../src/cli/config.js';
import { assertState, decodeState } from '../src/domain/state-validation.js';
import { MockTransport } from '../src/testing.js';

const SRC_ROOT = fileURLToPath(new URL('../src/', import.meta.url));

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectSourceFiles(path));
    else if (/\.(?:ts|mts|js|mjs)$/.test(entry.name)) files.push(path);
  }
  return files.sort();
}

test('YUZUHA_ERROR_CODES está ordenado alfabeticamente e sem duplicatas', () => {
  const sorted = [...YUZUHA_ERROR_CODES].sort();
  assert.deepEqual([...YUZUHA_ERROR_CODES], sorted);
  assert.equal(new Set(YUZUHA_ERROR_CODES).size, YUZUHA_ERROR_CODES.length);

  const requiredCodes: readonly YuzuhaErrorCode[] = [
    'IMAGE_DEPENDENCY',
    'CANVAS_DEPENDENCY',
    'VOICE_DEPENDENCY',
    'OUTPUT_LIMIT',
    'LAVALINK_AUDIO_AUTH',
    'LAVALINK_AUDIO_PLUGIN',
    'SOURCE_LIMIT',
    'MEMBER_CACHE_OPTIONS',
    'VARIABLE_SWEEP_OPTIONS',
    'CONCURRENCY_OPTIONS',
    'PREFIX_CACHE_OPTIONS',
    'RATE_LIMIT_OPTIONS',
    'RETRY_OPTIONS',
    'LOGGER_OPTIONS',
    'SHUTDOWN_OPTIONS',
    'WEBHOOK_ID',
    'WEBHOOK_TOKEN',
    'WEBHOOK_CONTENT',
    'EMBED_URL',
    'REGEX_INVALID',
  ];
  for (const code of requiredCodes) {
    assert.ok(YUZUHA_ERROR_CODES.includes(code), `Código ausente em YUZUHA_ERROR_CODES: ${code}`);
  }
});

test('TransportError, StoreError e ConfigError herdam de YuzuhaError e preservam cause', () => {
  const cause = new Error('raiz');
  const transport = new TransportError('API_ERROR', 'falha de transporte', { cause });
  const store = new StoreError('STORE_CORRUPT', 'falha de store', { cause });
  const config = new ConfigError('CONFIG_INVALID', 'falha de config', { cause });

  for (const [error, name, code] of [
    [transport, 'TransportError', 'API_ERROR'],
    [store, 'StoreError', 'STORE_CORRUPT'],
    [config, 'ConfigError', 'CONFIG_INVALID'],
  ] as const) {
    assert.ok(error instanceof Error);
    assert.ok(error instanceof YuzuhaError);
    assert.equal(error.name, name);
    assert.equal(error.code, code);
    assert.equal(error.cause, cause);
  }

  assert.equal(transport instanceof StoreError, false);
  assert.equal(store instanceof ConfigError, false);
  assert.equal(config instanceof TransportError, false);

  const custom = new YuzuhaError('CUSTOM_CODE', 'personalizado');
  assert.equal(custom.code, 'CUSTOM_CODE');
  assert.equal(custom.name, 'YuzuhaError');
});

test('isYuzuhaError filtra erros e estreita códigos no TypeScript', () => {
  const err: unknown = new ConfigError('PREFIX', 'prefixo inválido');
  assert.equal(isYuzuhaError(err), true);
  assert.equal(isYuzuhaError(err, 'PREFIX'), true);
  assert.equal(isYuzuhaError(err, 'OPTIONS', 'PREFIX'), true);
  assert.equal(isYuzuhaError(err, 'BOT_CLOSED'), false);

  if (isYuzuhaError(err, 'PREFIX', 'OPTIONS')) {
    const narrowed: 'PREFIX' | 'OPTIONS' = err.code;
    assert.equal(narrowed, 'PREFIX');
  }

  assert.equal(isYuzuhaError(new ScriptError('SYNTAX', 'erro', '$x', 0), 'SYNTAX'), true);
  assert.equal(isYuzuhaError(new GuardError('negado'), 'GUARD'), true);
  assert.equal(isYuzuhaError(new PartialModerationError('ban', '2', new Error('disk')), 'MODERATION_PARTIAL'), true);
  assert.equal(isYuzuhaError(new Error('comum')), false);
  assert.equal(isYuzuhaError({ code: 'PREFIX' }), false);
  assert.equal(isYuzuhaError(null), false);
  assert.equal(isYuzuhaError(undefined), false);
  assert.equal(isYuzuhaError('PREFIX'), false);
});

test('origens de transporte lançam TransportError preservando os códigos', async () => {
  const mock = new MockTransport();
  await assert.rejects(
    mock.edit('200', '999', { content: 'oi' }),
    error => error instanceof TransportError && isYuzuhaError(error, 'NOT_FOUND'),
  );
  await assert.rejects(
    mock.delete('200', '999'),
    error => error instanceof TransportError && isYuzuhaError(error, 'NOT_FOUND'),
  );
  mock.failAction = true;
  await assert.rejects(
    mock.moderate('100', 'ban', '2', 'motivo'),
    error => error instanceof TransportError && isYuzuhaError(error, 'API_ERROR'),
  );

  const fakeClient = {
    guilds: {
      fetch: async () => ({
        ownerId: '1',
        roles: { get: () => undefined },
        fetchRoles: async () => {},
        members: {
          fetch: async () => ({
            roles: { cache: { values: () => [] } },
            permissions: { bitfield: 0n },
            permissionsIn: () => ({ bitfield: 0n }),
          }),
        },
      }),
      resolve: async () => ({
        members: { fetch: async () => ({ edit: async () => {} }) },
      }),
    },
    channels: {
      fetch: async () => ({ isGuild: () => false, isVoice: () => false, guildId: '999' }),
    },
  } as unknown as Client;

  const transport = new FluxerTransport(fakeClient);
  await assert.rejects(
    transport.member('100', '2'),
    error => error instanceof TransportError && isYuzuhaError(error, 'ROLES_UNAVAILABLE'),
  );

  const clientWithRole = {
    ...fakeClient,
    guilds: {
      ...fakeClient.guilds,
      fetch: async () => ({
        ownerId: '1',
        roles: { get: () => ({ id: '100', position: 0 }) },
        fetchRoles: async () => {},
        members: {
          fetch: async () => ({
            roles: { cache: { values: () => [] } },
            permissions: { bitfield: 0n },
            permissionsIn: () => ({ bitfield: 0n }),
          }),
        },
      }),
    },
  } as unknown as Client;
  await assert.rejects(
    new FluxerTransport(clientWithRole).member('100', '2', '200'),
    error => error instanceof TransportError && isYuzuhaError(error, 'CHANNEL_GUILD'),
  );
  await assert.rejects(
    transport.moderate('100', 'move', '2', 'motivo', undefined, { channelID: '300' }),
    error => error instanceof TransportError && isYuzuhaError(error, 'VOICE_CHANNEL'),
  );
  await assert.rejects(
    transport.moderate('100', 'invalid' as never, '2', 'motivo'),
    error => error instanceof TransportError && isYuzuhaError(error, 'MODERATION_ACTION'),
  );
});

test('origens de persistência lançam StoreError preservando os códigos', async () => {
  assert.throws(
    () => defaultDataPath('nome inválido'),
    error => error instanceof StoreError && isYuzuhaError(error, 'STORE_NAME'),
  );
  assert.throws(
    () => assertState({ invalid: true }),
    error => error instanceof StoreError && isYuzuhaError(error, 'STORE_INVALID'),
  );
  assert.throws(
    () => decodeState('{malformed'),
    error => error instanceof StoreError && isYuzuhaError(error, 'STORE_CORRUPT') && error.cause instanceof Error,
  );

  const memory = new MemoryStore();
  await assert.rejects(
    memory.update((async () => {}) as never),
    error => error instanceof StoreError && isYuzuhaError(error, 'STORE_ASYNC'),
  );

  const sqlite = new SQLiteStore(':memory:');
  await sqlite.close();
  await assert.rejects(
    sqlite.read(state => state.schema),
    error => error instanceof StoreError && isYuzuhaError(error, 'STORE_CLOSED'),
  );
});

test('origens de configuração lançam ConfigError preservando os códigos', async () => {
  assert.throws(
    () => new Yuzuha({ prefix: '', transport: new MockTransport(), store: new MemoryStore() }),
    error => error instanceof ConfigError && isYuzuhaError(error, 'PREFIX'),
  );
  assert.throws(
    () => new Yuzuha({ emoji: { '': 'x' }, transport: new MockTransport(), store: new MemoryStore() }),
    error => error instanceof ConfigError && isYuzuhaError(error, 'EMOJI_OPTIONS'),
  );
  assert.throws(
    () => new Yuzuha({ engine: {} as never, transport: new MockTransport(), store: new MemoryStore() }),
    error => error instanceof ConfigError && isYuzuhaError(error, 'ENGINE_INVALID'),
  );
  assert.throws(
    () => new Yuzuha({ variables: { sweepBatch: 0 }, transport: new MockTransport(), store: new MemoryStore() }),
    error => error instanceof ConfigError && isYuzuhaError(error, 'VARIABLE_SWEEP_OPTIONS'),
  );
  assert.throws(
    () => new Yuzuha({ memberCache: { ttlMs: 0 }, transport: new MockTransport(), store: new MemoryStore() }),
    error => error instanceof ConfigError && isYuzuhaError(error, 'MEMBER_CACHE_OPTIONS'),
  );
  assert.throws(
    () => new Yuzuha({ cdn: { mediaBase: 'http://inseguro.example' }, transport: new MockTransport(), store: new MemoryStore() }),
    error => error instanceof ConfigError && isYuzuhaError(error, 'OPTIONS'),
  );

  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore() });
  try {
    await assert.rejects(
      bot.login(''),
      error => error instanceof ConfigError && isYuzuhaError(error, 'TOKEN_MISSING'),
    );
  } finally {
    await bot.destroy();
  }

  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-config-err-'));
  const previousCwd = process.cwd();
  try {
    process.chdir(directory);
    await assert.rejects(
      findConfig(),
      error => error instanceof ConfigError && isYuzuhaError(error, 'CONFIG_MISSING'),
    );
    const badConfig = join(directory, 'yuzuha.config.mjs');
    await writeFile(badConfig, 'export default "not-an-object";');
    await assert.rejects(
      configuredBot(badConfig, false, false),
      error => error instanceof ConfigError && isYuzuhaError(error, 'CONFIG_INVALID'),
    );
  } finally {
    process.chdir(previousCwd);
    await rm(directory, { recursive: true, force: true });
  }
});

test('todo código literal passado a classes de erro em src/ pertence a YUZUHA_ERROR_CODES', async () => {
  const errorClasses = new Set([
    'YuzuhaError',
    'ScriptError',
    'TransportError',
    'StoreError',
    'ConfigError',
    'GuardError',
    'PartialModerationError',
    'ScheduleExecutionError',
  ]);
  const knownCodes = new Set<string>(YUZUHA_ERROR_CODES);
  const discovered = new Map<string, string[]>();

  const record = (code: string, location: string) => {
    const list = discovered.get(code) ?? [];
    list.push(location);
    discovered.set(code, list);
  };

  for (const path of await collectSourceFiles(SRC_ROOT)) {
    const text = await readFile(path, 'utf8');
    const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const lineOf = (node: ts.Node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

    const visit = (node: ts.Node) => {
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && errorClasses.has(node.expression.text) && node.arguments?.length) {
        const className = node.expression.text;
        if (className === 'GuardError') record('GUARD', `${path}:${lineOf(node)}`);
        else if (className === 'PartialModerationError') record('MODERATION_PARTIAL', `${path}:${lineOf(node)}`);
        else if (className === 'ScheduleExecutionError') record('SCHEDULE_EXECUTION', `${path}:${lineOf(node)}`);
        else {
          const arg0 = node.arguments[0]!;
          if (ts.isStringLiteralLike(arg0)) record(arg0.text, `${path}:${lineOf(node)}`);
        }
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.SuperKeyword && node.arguments.length) {
        let parent: ts.Node | undefined = node.parent;
        while (parent && !ts.isClassDeclaration(parent)) parent = parent.parent;
        const extendsYuzuha = parent?.heritageClauses?.some(clause =>
          clause.types.some(type => errorClasses.has(type.expression.getText(sourceFile))));
        if (extendsYuzuha && ts.isStringLiteralLike(node.arguments[0]!)) {
          record(node.arguments[0]!.text, `${path}:${lineOf(node)}`);
        }
      }
      if (path.endsWith('.mjs')) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'fail'
          && node.arguments.length >= 1 && ts.isStringLiteralLike(node.arguments[0]!)) {
          record(node.arguments[0]!.text, `${path}:${lineOf(node)}`);
        }
        if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'code'
          && ts.isStringLiteralLike(node.initializer)) {
          record(node.initializer.text, `${path}:${lineOf(node)}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  assert.ok(discovered.size >= 300, `Esperado ao menos 300 códigos encontrados, obtido ${discovered.size}`);
  const missing: string[] = [];
  for (const [code, locations] of [...discovered.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!knownCodes.has(code)) missing.push(`${code} (${locations[0]})`);
  }
  assert.deepEqual(missing, [], `Códigos fora de YUZUHA_ERROR_CODES: ${missing.join(', ')}`);
});
