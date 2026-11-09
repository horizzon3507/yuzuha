import test from 'node:test';
import assert from 'node:assert/strict';
import { arg, argumentDefinitions } from '../src/commands/builders.js';
import { parseArguments } from '../src/commands/arguments.js';
import { CommandContext } from '../src/commands/context.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import { MemberService } from '../src/services/members.js';
import { GuardError } from '../src/shared/errors.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';

const purgeArgs = argumentDefinitions({
  count: arg.integer().required(), target: arg.user().anywhere(), reason: arg.string().rest() });

test('anywhere remove a menção e o rest recebe o motivo (purge 2 @user motivo)', () => {
  const result = parseArguments(purgeArgs, ['2', '<@123456789012345678>', 'motivo']);
  assert.equal(result.get('count'), 2);
  assert.equal(result.get('target'), '123456789012345678');
  assert.equal(result.get('reason'), 'motivo');
});

test('anywhere extrai snowflake cru e preserva o rest completo', () => {
  const result = parseArguments(purgeArgs, ['2', '123456789012345678', 'motivo', 'longo']);
  assert.equal(result.get('target'), '123456789012345678');
  assert.equal(result.get('reason'), 'motivo longo');
});

const alice = { id: '2', username: 'Alice', displayName: 'Alice', bot: false,
  avatarURL: null, bannerURL: null, createdTimestamp: 0 };

function service(scope: { guildID: string; authorID: string }, users?: Record<string, unknown>) {
  const fetched: string[] = [];
  const resources = mockResources({ users: {
    user: async (id: string) => {
      fetched.push(id);
      if (id === '404') throw Object.assign(new Error('missing'), { status: 404 });
      return { ...alice, id };
    },
    ...users } });
  return { members: new MemberService(new MockTransport(), scope, () => resources.users), fetched };
}

test('resolveUser mantém menção e id explícitos', async () => {
  const { members, fetched } = service({ guildID: '100', authorID: '2' });
  assert.deepEqual(await members.resolveUser('<@987654321098765432>'),
    { status: 'found', id: '987654321098765432', label: 'Alice', mention: '<@987654321098765432>', via: 'mention' });
  const byID = await members.resolveUser('123456789012345678');
  assert.equal(byID.status === 'found' && byID.via, 'id');
  assert.deepEqual(fetched, ['987654321098765432', '123456789012345678']);
  assert.deepEqual(await members.resolveUser('nome'), { status: 'missing', query: 'nome' });
  assert.deepEqual(await members.resolveUser('404'), { status: 'missing', query: '404' });
});

test('resolveUser com default author resolve o autor sem consulta', async () => {
  const { members, fetched } = service({ guildID: '100', authorID: '2' });
  assert.deepEqual(await members.resolveUser('', { default: 'author' }),
    { status: 'found', id: '2', label: 'Alice', mention: '<@2>', via: 'id' });
  assert.deepEqual(await members.resolveUser('   ', { default: 'author' }), { status: 'found', id: '2', label: 'Alice', mention: '<@2>', via: 'id' });
  assert.deepEqual(await members.resolveUser(undefined, { default: 'author' }), { status: 'found', id: '2', label: 'Alice', mention: '<@2>', via: 'id' });
  assert.deepEqual(fetched, ['2', '2', '2']);
});

test('resolveUser com default author funciona em DM sem exigir servidor', async () => {
  const { members, fetched } = service({ guildID: '', authorID: '7' });
  assert.equal((await members.resolveUser(undefined, { default: 'author' })).status, 'found');
  assert.deepEqual(fetched, ['7']);
  assert.equal((await members.resolveUser('123456789012345678')).status, 'found');
});

test('resolveUser exige autor identificado para o default e ignora o default com consulta', async () => {
  const anonymous = service({ guildID: '100', authorID: '' });
  await assert.rejects(anonymous.members.resolveUser('', { default: 'author' }),
    (error: unknown) => error instanceof GuardError && error.reason === 'NO_AUTHOR');
  assert.equal((await anonymous.members.resolveUser('123456789012345678', { default: 'author' })).status, 'found');

  const { members, fetched } = service({ guildID: '100', authorID: '2' });
  await members.resolveUser('123456789012345678', { default: 'author' });
  assert.deepEqual(fetched, ['123456789012345678']);
  assert.equal((await members.resolveUser('', { default: '404' })).status, 'missing');
  assert.equal((await members.resolveUser()).status, 'missing');
  assert.equal((await members.resolveUser('', {})).status, 'missing');
});

test('ctx.members.resolveUser resolve o autor da mensagem em DM', async () => {
  const ctx = new CommandContext({ message: mockMessage('!x', { guildID: undefined, authorID: '7' }),
    command: { name: 'x' }, store: new MemoryStore(), transport: new MockTransport(), cooldown: () => 0,
    resources: mockResources({ users: { user: async (id: string) => ({ ...alice, id }) } }) });
  assert.deepEqual(await ctx.members.resolveUser('', { default: 'author' }),
    { status: 'found', id: '7', label: 'Alice', mention: '<@7>', via: 'id' });
});
