import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GuardError,
  MemoryStore,
  TransportError,
  Yuzuha,
  arg,
  commandHelp,
  commandUsage,
  defineCommand,
  isGuardReason,
  isYuzuhaError,
  parseArguments,
  parseFlags,
  validateArgumentDefinitions,
  validateFlagDefinitions,
} from '../src/index.js';
import type { MemberInfo } from '../src/index.js';
import { argumentDefinitions } from '../src/commands/builders.js';
import { commandCatalog } from '../src/cli/command-catalog.js';
import { createTestBot, MockTransport, mockMessage } from '../src/testing.js';

const SAMPLE_MEMBER: MemberInfo = {
  id: '123456789012345678',
  username: 'ana',
  displayName: 'Ana Clara',
  bot: false,
  avatarURL: 'https://cdn.example.com/avatars/ana.png',
  bannerURL: null,
  createdTimestamp: 1_700_000_000_000,
  nickname: 'Aninha',
  joinedTimestamp: 1_710_000_000_000,
  roles: ['555555555555555555'],
  permissions: '8',
  timedOutUntil: null,
};

test('arg.channel e arg.role extraem menções e snowflakes em args e flags e rejeitam entradas inválidas', async () => {
  const defs = argumentDefinitions({
    canal: arg.channel().required(),
    cargo: arg.role().default('<@&987654321098765432>'),
  });
  const flags = argumentDefinitions({
    log: arg.channel().alias('l'),
    moderador: arg.role().alias('m'),
  });

  validateArgumentDefinitions(defs, 'config');
  validateFlagDefinitions(flags, 'config');

  const parsedFlags = parseFlags(flags, ['--log', '<#123456789012345678>', '-m=444444444444444444', '222222222222222222']);
  const parsedArgs = parseArguments(defs, parsedFlags.tokens);
  assert.equal(parsedArgs.get('canal'), '222222222222222222');
  assert.equal(parsedArgs.get('cargo'), '987654321098765432');
  assert.equal(parsedFlags.flags.get('log'), '123456789012345678');
  assert.equal(parsedFlags.flags.get('moderador'), '444444444444444444');

  for (const badChannel of ['<@123456789012345678>', '<@&123456789012345678>', '#geral', 'abc', '-5']) {
    assert.throws(
      () => parseArguments(defs, [badChannel]),
      error => isGuardReason(error, 'INVALID_ARGUMENT'),
    );
  }

  const roleDefs = argumentDefinitions({ cargo: arg.role().required() });
  for (const badRole of ['<#123456789012345678>', '<@123456789012345678>', '@admin', 'xyz', '1.5']) {
    assert.throws(
      () => parseArguments(roleDefs, [badRole]),
      error => isGuardReason(error, 'INVALID_ARGUMENT'),
    );
  }

  assert.throws(
    () => validateArgumentDefinitions(argumentDefinitions({ c: arg.channel().default('#invalido') })),
    error => isYuzuhaError(error, 'COMMAND_ARGS'),
  );
  assert.throws(
    () => validateArgumentDefinitions(argumentDefinitions({ r: arg.role().default('@invalido') })),
    error => isYuzuhaError(error, 'COMMAND_ARGS'),
  );
});

test('arg.member resolve via resources.users.member, exige servidor em DM e converte 404 em GuardError', async () => {
  const denied: GuardError[] = [];
  await using t = createTestBot({
    hooks: {
      onDenied(error) {
        denied.push(error);
        return undefined;
      },
    },
    resources: {
      users: {
        async member(guildID, id) {
          assert.equal(guildID, '100');
          if (id === SAMPLE_MEMBER.id) return SAMPLE_MEMBER;
          if (id === '500500500500500500') throw new TransportError('API_ERROR', 'Falha 500');
          const notFound = Object.assign(new Error('Unknown Member'), { status: 404 });
          throw notFound;
        },
      },
    },
  });

  t.bot.command(defineCommand({
    name: 'perfil',
    args: { alvo: arg.member().required() },
    flags: { coautor: arg.member().alias('c') },
    async run(ctx) {
      const alvo: MemberInfo = ctx.args.get('alvo');
      const coautor: MemberInfo | undefined = ctx.flags.get('coautor');
      // @ts-expect-error MemberInfo não é string.
      const wrong: string = ctx.args.get('alvo');
      void wrong;
      await ctx.reply(`${alvo.nickname ?? alvo.displayName}:${alvo.roles.join(',')}:${coautor?.username ?? '-'}`);
    },
  }));

  assert.equal(await t.send('!perfil <@!123456789012345678>'), 'success');
  assert.equal(t.messages.at(-1)?.payload.content, 'Aninha:555555555555555555:-');

  assert.equal(await t.send('!perfil 123456789012345678 -c <@123456789012345678>'), 'success');
  assert.equal(t.messages.at(-1)?.payload.content, 'Aninha:555555555555555555:ana');

  // Em DM, exige servidor com NOT_IN_GUILD.
  denied.length = 0;
  assert.equal(await t.send('!perfil <@123456789012345678>', { guildID: undefined }), 'guarded');
  assert.ok(isGuardReason(denied[0], 'NOT_IN_GUILD'));

  // Ausência / 404 converte em GuardError('Membro não encontrado neste servidor.', 'INVALID_ARGUMENT').
  denied.length = 0;
  assert.equal(await t.send('!perfil <@999999999999999999>'), 'guarded');
  assert.ok(isGuardReason(denied[0], 'INVALID_ARGUMENT'));
  assert.match(denied[0]!.message, /^Membro não encontrado neste servidor\.\nUso: !perfil <alvo>/);

  // Erro inesperado propaga intacto para onError.
  assert.equal(await t.send('!perfil 500500500500500500'), 'error');
  assert.equal(t.errors.length, 1);
  assert.ok(isYuzuhaError(t.errors[0], 'API_ERROR'));
});

test('arg.member adapta transport.member quando resources não está injetado', async () => {
  const transport = new MockTransport();
  transport.setMember('100', {
    id: '777777777777777777',
    owner: false,
    permissions: 16n,
    rank: 3,
    topRoleID: '888888888888888888',
  });
  const bot = new Yuzuha({ transport, store: new MemoryStore(), scheduler: false });
  bot.command({
    name: 'inspecionar',
    args: { membro: arg.member().required() },
    async run(ctx) {
      const m = ctx.args.get('membro');
      await ctx.reply(`${m.id}|${m.permissions}|${m.roles.join(',')}`);
    },
  });

  try {
    assert.equal(await bot.handle(mockMessage('!inspecionar <@777777777777777777>')), 'success');
    assert.equal(transport.messages.at(-1)?.payload.content, '777777777777777777|16|888888888888888888');

    assert.equal(await bot.handle(mockMessage('!inspecionar <@333333333333333333>', { id: 'missing-1' })), 'guarded');
    assert.match(transport.messages.at(-1)?.payload.content ?? '', /^Membro não encontrado neste servidor\.\nUso: !inspecionar <membro>/);
  } finally {
    await bot.destroy();
  }
});

test('arg.url valida protocolos, rejeita credenciais/javascript:/data: e isola instâncias URL', async () => {
  await using t = createTestBot();

  const defaultUrl = new URL('https://fluxer.app/docs');
  t.bot.command(defineCommand({
    name: 'webhook-alvo',
    args: {
      destino: arg.url().default(defaultUrl),
    },
    flags: {
      ws: arg.url({ protocols: ['WSS', 'ws:'] }),
    },
    async run(ctx) {
      const destino: URL = ctx.args.get('destino');
      const ws: URL | undefined = ctx.flags.get('ws');
      // @ts-expect-error URL não é string.
      const wrong: string = ctx.args.get('destino');
      void wrong;
      destino.searchParams.set('mutated', '1');
      await ctx.reply(`${destino.origin}${destino.pathname}|${ws?.protocol ?? 'nenhum'}`);
    },
  }));

  // Padrão retorna cópia isolada de URL sem vazar mutação entre execuções.
  assert.equal(await t.send('!webhook-alvo'), 'success');
  assert.equal(t.messages.at(-1)?.payload.content, 'https://fluxer.app/docs|nenhum');
  assert.equal(defaultUrl.searchParams.has('mutated'), false);

  assert.equal(await t.send('!webhook-alvo http://example.com/hook --ws wss://gateway.example.com/v1'), 'success');
  assert.equal(t.messages.at(-1)?.payload.content, 'http://example.com/hook|wss:');

  for (const invalidInput of [
    '!webhook-alvo javascript:alert(1)',
    '!webhook-alvo data:text/plain;base64,SGVsbG8=',
    '!webhook-alvo https://user:secret@example.com/hook',
    '!webhook-alvo https://user@example.com/hook',
    '!webhook-alvo ftp://example.com/file',
    '!webhook-alvo nao-e-url',
    '!webhook-alvo https://example.com --ws https://example.com',
  ]) {
    assert.equal(await t.send(invalidInput), 'guarded', `Deveria recusar: ${invalidInput}`);
  }

  for (const badOptions of [
    { protocols: [] },
    { protocols: ['javascript:'] },
    { protocols: ['data'] },
    { protocols: [''] },
  ]) {
    assert.throws(
      () => arg.url(badOptions),
      error => isYuzuhaError(error, 'ARGUMENT_SCHEMA'),
    );
  }
});

test('arg.enum infere união literal, valida case-sensitive e compõe com commandUsage/commandHelp/catalog', async () => {
  assert.throws(
    () => arg.enum([] as unknown as [string, ...string[]]),
    error => isYuzuhaError(error, 'ARGUMENT_SCHEMA'),
  );
  assert.throws(
    () => arg.enum(['ok', ''] as [string, ...string[]]),
    error => isYuzuhaError(error, 'ARGUMENT_SCHEMA'),
  );

  await using t = createTestBot();

  const ordenar = defineCommand({
    name: 'ordenar',
    description: 'Ordena registros.',
    args: {
      ordem: arg.enum(['asc', 'desc']).required(),
    },
    flags: {
      formato: arg.enum(['json', 'csv', 'tabela']).alias('f').default('tabela'),
      canal: arg.channel(),
      site: arg.url({ protocols: ['https'] }),
    },
    async run(ctx) {
      const ordem: 'asc' | 'desc' = ctx.args.get('ordem');
      const formato: 'json' | 'csv' | 'tabela' = ctx.flags.get('formato');
      // @ts-expect-error União literal estreitada.
      const wrongOrdem: 'outro' = ctx.args.get('ordem');
      void wrongOrdem;
      await ctx.reply(`${ordem}:${formato}`);
    },
  });

  t.bot.command(ordenar);

  assert.equal(await t.send('!ordenar asc'), 'success');
  assert.equal(t.messages.at(-1)?.payload.content, 'asc:tabela');

  assert.equal(await t.send('!ordenar desc -f json'), 'success');
  assert.equal(t.messages.at(-1)?.payload.content, 'desc:json');

  // Case-sensitive: ASC é recusado com INVALID_ARGUMENT.
  assert.equal(await t.send('!ordenar ASC'), 'guarded');
  assert.match(t.messages.at(-1)?.payload.content ?? '', /ordem: escolha asc, desc\./);

  assert.equal(await t.send('!ordenar asc -f XML'), 'guarded');
  assert.match(t.messages.at(-1)?.payload.content ?? '', /formato: escolha json, csv, tabela\./);

  const usage = commandUsage(ordenar, '!');
  assert.equal(usage, '!ordenar <ordem> [--formato <enum>] [--canal <channel>] [--site <url>]');
  const help = commandHelp(ordenar, '!');
  assert.match(help, /ordem: enum; obrigatório; escolhas: asc, desc/);
  assert.match(help, /--formato \(-f\): enum; opcional; escolhas: json, csv, tabela; padrão: tabela/);
  assert.match(help, /--site: url; opcional; protocolos: https/);

  const catalog = commandCatalog(t.bot.listCommands(), '!');
  assert.equal(catalog[0]?.args[0]?.type, 'enum');
  assert.deepEqual(catalog[0]?.args[0]?.choices, ['asc', 'desc']);
  assert.deepEqual(catalog[0]?.flags[2]?.protocols, ['https:']);
});
