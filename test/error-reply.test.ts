import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ConfigError,
  GuardError,
  MemoryStore,
  PartialModerationError,
  Yuzuha,
  defineCommand,
  embed,
} from '../src/index.js';
import type { ErrorReplyResult } from '../src/index.js';
import { MockTransport, mockMessage } from '../src/testing.js';

test('errorReply inválido rejeita construção com ConfigError OPTIONS', () => {
  assert.throws(
    () => new Yuzuha({ errorReply: 'nope' as never, transport: new MockTransport(), store: new MemoryStore() }),
    error => error instanceof ConfigError && error.code === 'OPTIONS',
  );
});

test('errorReply retorna texto ou Payload com embed personalizado', async () => {
  const transport = new MockTransport();
  const seen: { error: unknown; command?: string }[] = [];
  const bot = new Yuzuha({
    transport,
    store: new MemoryStore(),
    errorReply(error, ctx) {
      seen.push({ error, command: ctx?.command.name });
      if (error instanceof GuardError) return `Recusado em ${ctx?.command.name}: ${error.message}`;
      return { embeds: [embed({ title: 'Erro', description: 'Tente novamente mais tarde.' })] };
    },
  });

  bot.command(defineCommand({
    name: 'negado',
    run() { throw new GuardError('Sem acesso.'); },
  }));
  bot.command(defineCommand({
    name: 'falha',
    async run() { throw new Error('segredo interno'); },
  }));

  assert.equal(await bot.handle(mockMessage('!negado')), 'guarded');
  assert.equal(transport.messages.at(-1)?.payload.content, 'Recusado em negado: Sem acesso.');

  assert.equal(await bot.handle(mockMessage('!falha')), 'error');
  assert.equal(transport.messages.at(-1)?.payload.content, undefined);
  assert.equal(transport.messages.at(-1)?.payload.embeds?.[0]?.title, 'Erro');
  assert.equal(transport.messages.at(-1)?.payload.embeds?.[0]?.description, 'Tente novamente mais tarde.');
  assert.deepEqual(seen.map(entry => entry.command), ['negado', 'falha']);

  await bot.destroy();
});

test('errorReply com null silencia resposta e undefined usa o fallback padrão', async () => {
  const transport = new MockTransport();
  const errors: unknown[] = [];
  let mode: 'null' | 'undefined' = 'null';

  const bot = new Yuzuha({
    transport,
    store: new MemoryStore(),
    onError(error) { errors.push(error); },
    async errorReply(): Promise<ErrorReplyResult> {
      return mode === 'null' ? null : undefined;
    },
  });

  bot.command(defineCommand({
    name: 'guard',
    run() { throw new GuardError('Acesso negado.'); },
  }));
  bot.command(defineCommand({
    name: 'boom',
    run() { throw new Error('boom'); },
  }));

  assert.equal(await bot.handle(mockMessage('!guard')), 'guarded');
  assert.equal(await bot.handle(mockMessage('!boom')), 'error');
  assert.equal(transport.messages.length, 0);
  assert.equal(transport.calls.reply, 0);
  assert.equal(errors.length, 1);

  mode = 'undefined';
  assert.equal(await bot.handle(mockMessage('!guard')), 'guarded');
  assert.equal(transport.messages.at(-1)?.payload.content, 'Acesso negado.');
  assert.equal(await bot.handle(mockMessage('!boom')), 'error');
  assert.equal(transport.messages.at(-1)?.payload.content, 'Não foi possível concluir o comando.');

  await bot.destroy();
});

test('erro lançado por errorReply é reportado e cai no userError padrão', async () => {
  const transport = new MockTransport();
  const reported: unknown[] = [];
  const handlerFailure = new Error('falha no formatador');
  const commandFailure = new Error('falha no comando');

  const bot = new Yuzuha({
    transport,
    store: new MemoryStore(),
    onError(error) { reported.push(error); },
    async errorReply() { throw handlerFailure; },
  });

  bot.command(defineCommand({
    name: 'guard',
    run() { throw new GuardError('Motivo da guarda.'); },
  }));
  bot.command(defineCommand({
    name: 'partial',
    run() { throw new PartialModerationError('ban', '2', new Error('disk')); },
  }));
  bot.command(defineCommand({
    name: 'crash',
    run() { throw commandFailure; },
  }));

  assert.equal(await bot.handle(mockMessage('!guard')), 'guarded');
  assert.equal(transport.messages.at(-1)?.payload.content, 'Motivo da guarda.');
  assert.deepEqual(reported, [handlerFailure]);

  reported.length = 0;
  assert.equal(await bot.handle(mockMessage('!partial')), 'error');
  assert.match(transport.messages.at(-1)!.payload.content!, /não foi salvo/);
  assert.equal(reported.length, 2);
  assert.equal(reported[0], handlerFailure);
  assert.ok(reported[1] instanceof PartialModerationError);

  reported.length = 0;
  assert.equal(await bot.handle(mockMessage('!crash')), 'error');
  assert.equal(transport.messages.at(-1)?.payload.content, 'Não foi possível concluir o comando.');
  assert.deepEqual(reported, [handlerFailure, commandFailure]);

  await bot.destroy();
});

test('errorReply recebe ctx undefined em falhas anteriores ao contexto como aspas abertas', async () => {
  const transport = new MockTransport();
  const observedCtx: unknown[] = [];
  let replyValue: ErrorReplyResult = { content: 'Feche as aspas do comando.' };

  const bot = new Yuzuha({
    transport,
    store: new MemoryStore(),
    errorReply(_error, ctx) {
      observedCtx.push(ctx);
      return replyValue;
    },
  });

  bot.command(defineCommand({
    name: 'eco',
    run: async ctx => { await ctx.reply(ctx.input); },
  }));

  assert.equal(await bot.handle(mockMessage('!eco "texto sem fechar')), 'guarded');
  assert.deepEqual(observedCtx, [undefined]);
  assert.equal(transport.messages.at(-1)?.payload.content, 'Feche as aspas do comando.');

  replyValue = null;
  const countBeforeNull = transport.messages.length;
  assert.equal(await bot.handle(mockMessage('!eco "outro sem fechar')), 'guarded');
  assert.equal(transport.messages.length, countBeforeNull);

  replyValue = undefined;
  assert.equal(await bot.handle(mockMessage('!eco "terceiro sem fechar')), 'guarded');
  assert.match(transport.messages.at(-1)!.payload.content!, /aspas.*Uso: !eco/s);

  await bot.destroy();
});

test('errorReply preserva degradação de deleteCommandMessage e respeita cancelamento no encerramento', async () => {
  const transport = new MockTransport();
  const seed = await transport.send('200', { content: 'origem' });
  let replyCalls = 0;
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });

  const bot = new Yuzuha({
    transport,
    store: new MemoryStore(),
    errorReply() {
      replyCalls++;
      return 'customizado';
    },
  });

  bot.command(defineCommand({
    name: 'apagar',
    async run(ctx) {
      await ctx.deleteCommandMessage();
      throw new GuardError('não pode');
    },
  }));
  bot.command(defineCommand({
    name: 'lento',
    async run() {
      entered();
      await gate;
      throw new Error('tarde');
    },
  }));

  assert.equal(await bot.handle(mockMessage('!apagar', { id: seed })), 'guarded');
  assert.equal(transport.messages.at(-1)?.payload.content, 'customizado');
  assert.equal(transport.messages.at(-1)?.replyTo, undefined);
  assert.equal(replyCalls, 1);

  const pending = bot.handle(mockMessage('!lento'));
  await started;
  const closing = bot.destroy();
  release();
  assert.equal(await pending, 'error');
  await closing;
  assert.equal(replyCalls, 1);
});
