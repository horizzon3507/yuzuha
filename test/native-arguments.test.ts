import test from 'node:test';
import assert from 'node:assert/strict';
import { arg, argumentDefinitions } from '../src/commands/builders.js';
import { defineCommand } from '../src/commands/definition.js';
import { parseArguments, validateArgumentDefinitions, tokenize } from '../src/commands/arguments.js';
import { ArgumentBag } from '../src/commands/typed-arguments.js';
import { MemoryStore, Yuzuha, GuardError, YuzuhaError } from '../src/index.js';
import { MockTransport, mockMessage } from '../src/testing.js';

function parse(schema: Parameters<typeof argumentDefinitions>[0], input: string) {
  const definitions = argumentDefinitions(schema);
  validateArgumentDefinitions(definitions);
  return parseArguments(definitions, tokenize(input));
}

test('native argument schemas normalize to existing positional definitions', () => {
  const args = parse({
    member: arg.user().required(),
    duration: arg.duration().min(1000).required(),
    reason: arg.text().rest().required(),
  }, '<@123> 2m a detailed reason');
  assert.deepEqual([...args], [['member', '123'], ['duration', 120_000], ['reason', 'a detailed reason']]);
});

test('argument builders are immutable and can be reused without leaking constraints', () => {
  const base = arg.integer();
  const limited = base.min(2).max(4).required();
  assert.deepEqual([...parse({ number: base }, '')], []);
  assert.equal(parse({ number: base }, '1').get('number'), 1);
  assert.throws(() => parse({ number: limited }, '1'), /mínimo 2/);
  assert.throws(() => parse({ number: limited }, '5'), /máximo 4/);
  assert.throws(() => parse({ number: limited }, ''), /Informe o argumento number/);
  const choices = ['red', 'blue'];
  const choice = arg.string().choices(choices);
  choices.push('green');
  assert.throws(() => parse({ color: choice }, 'green'), /escolha red, blue/);
  assert.ok(Object.isFrozen(base));
  assert.ok(Object.isFrozen(choice.definition.choices));
});

test('defaults, optional resets, string lengths and literal choices are validated', () => {
  assert.equal(parse({ count: arg.integer().default(3) }, '').get('count'), 3);
  assert.equal(parse({ member: arg.user().default('<@123>') }, '').get('member'), '123');
  assert.throws(() => parse({ member: arg.user().default('invalid') }, ''), error => error instanceof YuzuhaError && error.code === 'COMMAND_ARGS');
  assert.equal(parse({ count: arg.integer().default(3).optional() }, '').has('count'), false);
  assert.equal(parse({ mode: arg.string().choices(['fast', 'slow']).default('fast') }, '').get('mode'), 'fast');
  assert.throws(() => parse({ word: arg.string().min(3).max(5) }, 'hi'), /mínimo 3 caracteres/);
  assert.throws(() => parse({ word: arg.string().min(3).max(5) }, 'longword'), /máximo 5 caracteres/);
  assert.throws(() => parse({ count: arg.integer().min(2).default(1) }, ''), error => error instanceof YuzuhaError && error.code === 'COMMAND_ARGS');
  assert.throws(() => parse({ count: arg.number().min(2).max(1) }, ''), /Argumentos inválidos/);
});

test('boolean parsing accepts explicit values and never uses JavaScript truthiness', () => {
  for (const value of ['true', 'TRUE', 'yes', 'sim', '1']) assert.equal(parse({ value: arg.boolean() }, value).get('value'), true);
  for (const value of ['false', 'no', 'não', 'nao', '0']) assert.equal(parse({ value: arg.boolean() }, value).get('value'), false);
  assert.equal(parse({ value: arg.boolean().default(false) }, '').get('value'), false);
  assert.throws(() => parse({ value: arg.boolean() }, 'maybe'), /deve ser true ou false/);
});

test('custom argument validators run after conversion and before command actions', async () => {
  const transport = new MockTransport();
  const bot = new Yuzuha({ transport, store: new MemoryStore() });
  let ran = false;
  bot.command(defineCommand({ name: 'even', args: { count: arg.integer().validate(value => value % 2 === 0, 'Use um número par.').required() },
    async run(ctx) { ran = true; await ctx.reply(String(ctx.args.get('count') * 2)); },
  }));
  try {
    assert.equal(await bot.handle(mockMessage('!even 3')), 'guarded');
    assert.equal(ran, false);
    assert.equal(transport.messages.at(-1)?.payload.content, 'Use um número par.\nUso: !even <count>');
    assert.equal(await bot.handle(mockMessage('!even 4', { id: 'another-message' })), 'success');
    assert.equal(ran, true);
    assert.equal(transport.messages.at(-1)?.payload.content, '8');
  } finally { await bot.destroy(); }
});

test('ArgumentBag preserves Map APIs and offers checked access for JavaScript', () => {
  const args = new ArgumentBag([['count', 2], ['flag', false], ['name', 'Yuzuha']]);
  assert.equal(args.number('count'), 2);
  assert.equal(args.boolean('flag'), false);
  assert.equal(args.string('name'), 'Yuzuha');
  assert.equal(args.require('flag'), false);
  assert.equal(args.string('optional'), undefined);
  assert.throws(() => args.require('missing'), GuardError);
  assert.throws(() => args.number('name'), GuardError);
  assert.equal(args.size, 3);
});

test('JavaScript argument validators cannot silently pass with a Promise or truthy value', async () => {
  // @ts-expect-error JavaScript can supply an async predicate despite the typed contract.
  const asyncValue = arg.number().validate(async () => { throw new Error('async'); }, 'Invalid');
  assert.throws(() => parse({ value: asyncValue }, '2'), /booleano síncrono/);
  // @ts-expect-error JavaScript validators must still return booleans.
  const truthyValue = arg.number().validate(() => 'yes', 'Invalid');
  assert.throws(() => parse({ value: truthyValue }, '2'), /booleano síncrono/);
  await new Promise(resolve => setImmediate(resolve));
});

test('legacy definitions and defineCommand identity remain compatible', () => {
  const command = { name: 'legacy', args: [{ name: 'value', type: 'integer' as const, choices: ['1', '2'] }] };
  assert.equal(defineCommand(command), command);
  assert.equal(parseArguments(command.args, ['2']).get('value'), 2);
  assert.throws(() => validateArgumentDefinitions(argumentDefinitions({ text: arg.text().rest(), after: arg.string() })), /Argumentos inválidos/);
});
