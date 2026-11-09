import test from 'node:test';
import assert from 'node:assert/strict';
import { GuardError } from '../src/shared/errors.js';
import { createTestBot } from '../src/testing.js';

function bot(authorization?: 'on' | 'off') {
  const calls: string[] = [];
  const fixture = createTestBot({ prefix: '!',
    authorization,
    resources: { messages: { bulkDelete: async () => { calls.push('bulkDelete'); return ['1']; } } },
    commands: [{ name: 'purge', run: async ctx => { await ctx.resources.messages.bulkDelete('200', ['1']); } }] });
  return { fixture, calls };
}
async function dispatch(fixture: ReturnType<typeof createTestBot>, content = '!purge') {
  await fixture.send(content);
}

test('authorization: off alcança o recurso bruto sem fakes de permissão', async () => {
  const { fixture, calls } = bot('off');
  await dispatch(fixture);
  assert.deepEqual(calls, ['bulkDelete']);
});

test('authorization padrão exige as verificações de permissão', async () => {
  const { fixture, calls } = bot();
  await dispatch(fixture);
  assert.deepEqual(calls, []);
  assert.equal(fixture.errors.length, 1);
});

test('ctx.mod continua validando mesmo com authorization off', async () => {
  const fixture = createTestBot({ prefix: '!', authorization: 'off',
    commands: [{ name: 'ban', run: async ctx => { await ctx.mod.ban(ctx.authorID, { reason: 'x' }); } }] });
  const outcome = await fixture.send('!ban');
  assert.equal(outcome, 'guarded');
});
