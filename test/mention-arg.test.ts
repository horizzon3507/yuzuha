import test from 'node:test';
import assert from 'node:assert/strict';
import { arg, ArgumentBuilder } from '../src/commands/builders.js';
import { parseArguments, validateArgumentDefinitions } from '../src/commands/arguments.js';
import { argumentDefinitions } from '../src/commands/builders.js';
import { commandUsage } from '../src/commands/help.js';
import { GuardError, YuzuhaError } from '../src/shared/errors.js';
import type { ArgumentDefinition } from '../src/commands/definition.js';

const defs = argumentDefinitions({ count: arg.integer(), target: arg.user().required().anywhere() });
const parse = (tokens: string[]) => parseArguments(defs, tokens);

test('menção em qualquer posição é ligada ao argumento anywhere', () => {
  assert.deepEqual([...parse(['2', '<@123456789012345678>']).entries()],
    [['count', 2], ['target', '123456789012345678']]);
  assert.deepEqual([...parse(['<@123456789012345678>', '2']).entries()],
    [['count', 2], ['target', '123456789012345678']]);
  assert.deepEqual([...parse(['<@!123456789012345678>', '5']).entries()],
    [['count', 5], ['target', '123456789012345678']]);
  assert.deepEqual([...parse(['123456789012345678', '2']).entries()],
    [['count', 2], ['target', '123456789012345678']]);
});

test('número pequeno não vira snowflake; obrigatório ausente falha como outros', () => {
  assert.throws(() => parse(['2']), (e: unknown) => e instanceof GuardError && /target/.test((e as Error).message));
});

test('opcional ausente retorna sem valor', () => {
  const optional = argumentDefinitions({ count: arg.integer(), target: arg.user().anywhere() });
  const result = parseArguments(optional, ['2']);
  assert.equal(result.get('count'), 2);
  assert.equal(result.get('target'), undefined);
});

test('duas menções: a primeira ganha, a segunda sobra para o rest', () => {
  const schema = argumentDefinitions({ target: arg.user().required().anywhere(), note: arg.string().rest() });
  const result = parseArguments(schema, ['<@123456789012345678>', '<@987654321098765432>', 'motivo']);
  assert.equal(result.get('target'), '123456789012345678');
  assert.equal(result.get('note'), '<@987654321098765432> motivo');
});

test('rest vê os tokens restantes após a remoção', () => {
  const schema = argumentDefinitions({ count: arg.integer(), target: arg.user().required().anywhere(), note: arg.string().rest() });
  const result = parseArguments(schema, ['2', 'por', 'que', '<@123456789012345678>']);
  assert.equal(result.get('note'), 'por que');
});

test('erros de schema: anywhere em não-usuário e dois anywhere', () => {
  assert.throws(() => arg.integer().anywhere(), (e: unknown) => e instanceof YuzuhaError && e.code === 'ARGUMENT_SCHEMA');
  assert.throws(() => validateArgumentDefinitions([
    { name: 'a', type: 'user', required: true, anywhere: true },
    { name: 'b', type: 'user', anywhere: true }] as ArgumentDefinition[], 'x'),
    (e: unknown) => e instanceof YuzuhaError && e.code === 'COMMAND_ARGS');
  assert.throws(() => validateArgumentDefinitions([{ name: 'a', type: 'string', anywhere: true }] as ArgumentDefinition[]),
    (e: unknown) => e instanceof YuzuhaError && e.code === 'COMMAND_ARGS');
});

test('ajuda renderiza o anywhere como argumento comum', () => {
  const command = { name: 'purge', args: defs } as never;
  assert.equal(commandUsage(command, '!'), '!purge [count] <target>');
});
