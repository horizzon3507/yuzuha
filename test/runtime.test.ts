import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandContext, MemoryStore, PartialModerationError, ScriptError } from '../src/index.js';
import { Runtime, defaultLimits, registerBuiltins } from '../src/functions.js';
import { parse } from '../src/parser.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function harness(limits = {}) {
  const transport = new MockTransport();
  const ctx = new CommandContext({ message: mockMessage('!test'), command: { name: 'test', code: '' },
    transport, store: new MemoryStore(), cooldown: () => 0 });
  const runtime = registerBuiltins(new Runtime({ ...defaultLimits, ...limits }));
  return { ctx, runtime, transport, run: (source: string) => runtime.execute(runtime.compile(source, 'command.yz'), ctx) };
}

test('nested functions preserve typed values and evaluate once', async () => {
  const { run, runtime } = harness();
  let count = 0;
  runtime.register({ name: 'count', category: 'test', minArgs: 0, maxArgs: 0, usage: '$count', description: '', execute: () => ++count });
  runtime.register({ name: 'twice', category: 'test', minArgs: 1, maxArgs: 1, usage: '$twice[value]', description: '', execute: async c => [await c.arg(0), await c.arg(0)] });
  assert.deepEqual(await run('$twice[$count]'), [1, 1]);
  assert.equal(count, 1);
  assert.equal(await run('$let[x;$math[2;*;3]]$get[x]'), '6');
  assert.equal(await run('$math[$get[x];+;4]'), 10);
});

test('escape delimiters and dollar functions', async () => {
  const { run } = harness();
  assert.equal(await run(String.raw`\$username \[x\] \; \\`), '$username [x] ; \\');
  assert.equal(await run(String.raw`$reply[a\;b\[c\]]`), '');
});

test('diagnostics include file, line and column', () => {
  const { runtime } = harness();
  for (const source of ['$reply[broken', '$reply[x]]', '$unknown', '$math[1;+]']) {
    assert.throws(() => runtime.compile(source, 'ban.yz'), ScriptError);
  }
  assert.throws(() => runtime.compile('\n  $unknown', 'ban.yz'), (e: unknown) => {
    assert.ok(e instanceof ScriptError);
    assert.equal(e.line, 2); assert.equal(e.column, 3);
    assert.match(e.format(), /ban.yz:2:3/); return true;
  });
});

test('lazy branches and boolean short circuit never execute discarded effects', async () => {
  const { run, transport } = harness();
  assert.equal(await run('$if[true;sim;$reply[não]]'), 'sim');
  assert.equal(await run('$and[false;$reply[não]]'), false);
  assert.equal(await run('$or[true;$reply[não]]'), true);
  assert.equal(transport.messages.length, 0);
});

test('data from messages is never compiled as code', async () => {
  const { run, ctx, transport } = harness();
  ctx.message.authorName = '$ban[2;injetado]';
  await run('$reply[$username]');
  assert.equal(transport.messages[0]?.payload.content, '$ban[2;injetado]');
  assert.equal(transport.actions.length, 0);
});

test('typed embeds, fields and limits', async () => {
  const { run, transport } = harness();
  await run('$reply[$embed[$title[Olá];$color[#FCE300];$field[Nome;$username;true];$field[ID;$authorID]]]');
  const embed = transport.messages[0]!.payload.embeds![0]!;
  assert.equal(embed.title, 'Olá'); assert.equal(embed.color, 0xFCE300);
  assert.equal(embed.fields!.length, 2);
  await run('$reply[$embed[\n $title[Multiline];\n $field[Nome;Hory]\n]]');
  assert.equal(transport.messages.at(-1)?.payload.embeds?.[0]?.title, 'Multiline');
  await assert.rejects(run(`$reply[$embed[$title[${'x'.repeat(257)}]]]`), ScriptError);
  assert.throws(() => run('$reply[]'), ScriptError);
});

test('try catches operational errors but cannot swallow a guard', async () => {
  const { run } = harness();
  assert.equal(await run('$try[$throw[failure];fallback]'), 'fallback');
  await assert.rejects(run('$try[$onlyIf[false;negado];fallback]'), /negado/);
});

test('budgets apply to nested calls, output and parse depth', async () => {
  const { run, runtime } = harness({ calls: 2, output: 16 });
  await assert.rejects(run('$username$username$username'), (e: unknown) => e instanceof ScriptError && e.code === 'EXECUTION_LIMIT');
  await assert.rejects(run('x'.repeat(17)), (e: unknown) => e instanceof ScriptError && e.code === 'OUTPUT_LIMIT');
  assert.throws(() => runtime.compile('$trim['.repeat(70) + 'x' + ']'.repeat(70)), /Aninhamento/);
});

test('cooperative deadline rejects subsequent work after a slow native function', async () => {
  const { run, runtime, transport } = harness({ timeoutMs: 5 });
  runtime.register({ name: 'slow', minArgs: 0, maxArgs: 0, category: 'test', usage: '$slow', description: '', execute: async () => { await new Promise(resolve => setTimeout(resolve, 15)); return ''; } });
  await assert.rejects(run('$slow$reply[late]'), /Limite de execução/);
  assert.equal(transport.messages.length, 0);
});

test('comparisons, strings, arithmetic and scoped variables', async () => {
  const { run } = harness();
  assert.equal(await run('$if[2>=1;$uppercase[ok];não]'), 'OK');
  assert.equal(await run('$if[!=;sim;não]'), 'não');
  assert.equal(await run('$ne[1;2]'), true);
  assert.equal(await run('$join[ / ;a;b;c]'), 'a / b / c');
  assert.equal(await run('$replace[aba;a;\\$&]'), '$&b$&');
  assert.equal(await run('$setGuildVar[x;$math[2;+;3]]$getGuildVar[x]'), '5');
  assert.equal(await run('$getUserVar[x;ausente]'), 'ausente');
  await run('$deleteGuildVar[x]');
  assert.equal(await run('$getGuildVar[x;padrão]'), 'padrão');
  await assert.rejects(run('$math[1;/;0]'));
});

test('registration is atomic for conflicting aliases', () => {
  const { runtime } = harness();
  assert.throws(() => runtime.register({ name: 'new', aliases: ['reply'], category: '', description: '', usage: '', minArgs: 0, maxArgs: 0, execute: () => '' }));
  assert.throws(() => runtime.compile('$new'), /desconhecida/);
});

test('runtime snapshots execution limits and rejects invalid budgets', async () => {
  const limits = { ...defaultLimits, calls: 1 };
  const { ctx } = harness();
  const runtime = registerBuiltins(new Runtime(limits));
  limits.calls = 100;
  assert.ok(Object.isFrozen(runtime.limits));
  assert.ok(Object.isFrozen(defaultLimits));
  await assert.rejects(runtime.execute(runtime.compile('$username$username'), ctx),
    (error: unknown) => error instanceof ScriptError && error.code === 'EXECUTION_LIMIT');
  for (const calls of [0, -1, 1.5, Infinity, NaN]) {
    assert.throws(() => new Runtime({ ...defaultLimits, calls }), /Limite inválido/);
  }
});

test('registered metadata and callbacks cannot change through their original definitions', async () => {
  const { runtime, run } = harness();
  const definition = {
    name: 'native', aliases: ['nativeAlias'], category: 'test', description: 'original',
    usage: '$native', minArgs: 0, maxArgs: 0, execute: () => 'original',
  };
  runtime.register(definition);
  definition.aliases[0] = 'changedAlias';
  definition.maxArgs = 1;
  definition.execute = () => 'changed';
  assert.equal(await run('$nativeAlias'), 'original');
  assert.throws(() => runtime.compile('$native[x]'), /Uso/);
  assert.throws(() => runtime.compile('$changedAlias'), /desconhecida/);
  const registered = runtime.functions().find(item => item.name === 'native')!;
  assert.ok(Object.isFrozen(registered));
  assert.ok(Object.isFrozen(registered.aliases));
  assert.throws(() => registered.aliases!.push('injected'), TypeError);
  assert.throws(() => Object.assign(registered, { execute: () => 'injected' }), TypeError);
});

test('builtin registration rolls back the entire set when a later category conflicts', () => {
  const runtime = new Runtime();
  runtime.register({ name: 'modBan', category: 'test', description: '', usage: '$modBan', minArgs: 0, maxArgs: 0, execute: () => '' });
  assert.throws(() => registerBuiltins(runtime), /duplicada/);
  assert.equal(runtime.functions().length, 1);
  assert.throws(() => runtime.compile('$authorID'), /desconhecida/);
  assert.doesNotThrow(() => runtime.compile('$modBan'));
});

test('execution checks arity even when a caller supplies an unvalidated AST', async () => {
  const { runtime, ctx, transport } = harness();
  await assert.rejects(runtime.execute(parse('$reply[first;second]', 'external.yz'), ctx), (error: unknown) => {
    assert.ok(error instanceof ScriptError);
    assert.equal(error.code, 'ARITY');
    assert.match(error.format(), /external.yz:1:1/);
    return true;
  });
  assert.equal(transport.messages.length, 0);
});

test('objects whose toJSON returns undefined stringify as empty text', async () => {
  const { runtime, run } = harness();
  const value = { toJSON: () => undefined };
  runtime.register({ name: 'empty', category: 'test', description: '', usage: '$empty', minArgs: 0, maxArgs: 0, execute: () => value });
  assert.equal(await run('$empty'), value);
  assert.equal(await run('before$empty after'), 'before after');
});

test('try preserves stop, execution limits and partial moderation failures', async () => {
  const { runtime, run, transport } = harness({ calls: 2 });
  assert.equal(await run('$try[$stop;$reply[unexpected]]$reply[unexpected]'), '');
  assert.equal(transport.messages.length, 0);
  await assert.rejects(run('$try[$username$username;fallback]'),
    (error: unknown) => error instanceof ScriptError && error.code === 'EXECUTION_LIMIT');
  runtime.register({
    name: 'partial', category: 'test', description: '', usage: '$partial', minArgs: 0, maxArgs: 0,
    execute: () => { throw new PartialModerationError('ban', '2', new Error('store failure')); },
  });
  await assert.rejects(run('$try[$partial;fallback]'), PartialModerationError);
});
