import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, PartialMessage } from '@fluxerjs/core';
import { EventContext } from '../src/commands/event-context.js';
import { adaptScriptEvent } from '../src/framework/script-events.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import { Runtime, registerBuiltins } from '../src/functions.js';
import { GuardError, YuzuhaError } from '../src/shared/errors.js';
import { MockTransport, mockResources } from '../src/testing.js';

function fixture(store = new MemoryStore(), guildID = '100', actorID?: string) {
  const transport = new MockTransport(), lookups: string[] = [];
  const member = transport.member.bind(transport);
  transport.member = async (guild, id) => {
    lookups.push(id);
    if (!id) throw new YuzuhaError('MEMBER_NOT_FOUND', 'Consulta indevida sem autor.');
    return member(guild, id);
  };
  const ctx = new EventContext({ transport, store, cooldown: () => 0, resources: mockResources(), actorID,
    event: { name: 'messageDelete', guildID, channelID: '200', messageID: '400', userID: null,
      userName: null, userBot: false, content: null, oldContent: null, emoji: null } });
  return { ctx, store, transport, lookups };
}

test('evento sem autor recusa autorização, moderação e apelido antes de consultar membros', async () => {
  const f = fixture();
  for (const action of [() => f.ctx.requirePermission('ManageGuild'),
    () => f.ctx.mod.ban('2', { reason: 'teste' }), () => f.ctx.members.setNickname('2', 'nome', 'teste')]) {
    await assert.rejects(action(), GuardError);
  }
  assert.deepEqual(f.lookups, []);
  assert.deepEqual(f.transport.actions, []);
  await f.ctx.requirePermission('ManageGuild', true);
  assert.deepEqual(f.lookups, [f.transport.botID]);
});

test('evento sem autor mantém guild/global e userFor explícito, sem namespace de usuário vazio', async () => {
  const f = fixture(), other = fixture(f.store, '101');
  for (const action of [() => f.ctx.data.user.get('value'), () => f.ctx.data.user.set('value', 1),
    () => f.ctx.data.user.delete('value'), () => f.ctx.data.user.update('value', () => 1),
    () => f.ctx.data.user.expire('value', 1000), () => f.ctx.data.user.ttl('value')]) {
    await assert.rejects(async () => action(), GuardError);
  }
  await f.ctx.data.transaction(data => {
    data.guild.set('value', 1);
    data.global.set('shared', 2);
    data.userFor('2').set('explicit', 3);
  });
  await other.ctx.data.guild.set('value', 4);
  assert.equal(await f.ctx.data.guild.get('value'), 1);
  assert.equal(await other.ctx.data.guild.get('value'), 4);
  assert.equal(await other.ctx.data.global.get('shared'), 2);
  assert.equal(await f.ctx.data.userFor('2').get('explicit'), 3);
  const before = await f.store.read(state => state);
  for (const ctx of [f.ctx, other.ctx]) {
    await assert.rejects(ctx.data.transaction(data => {
      data.global.set('shared', 99);
      data.user.set('implicit', 1);
    }), GuardError);
    assert.deepEqual(await f.store.read(state => state), before);
  }
  assert.equal(Object.keys(before.variables).some(key => JSON.parse(key)[0] === 'user' && JSON.parse(key)[1] === ''), false);
  const identified = fixture(f.store, '100', '1');
  await identified.ctx.data.user.set('implicit', 5);
  assert.equal(await identified.ctx.data.userFor('1').get('implicit'), 5);
  await identified.ctx.requirePermission('ManageGuild');
  assert.deepEqual(identified.lookups, ['1']);
});

test('guards de identidade escapam de $try em payload parcial real do SDK', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const partial = new PartialMessage(client, { id: '400', channelId: '200', guildId: '100' });
  const { event } = adaptScriptEvent('messageDelete', [partial]);
  assert.equal(event.userID, null);
  const f = fixture(), ctx = new EventContext({ event, store: f.store, transport: f.transport,
    resources: mockResources(), cooldown: () => 0 });
  const runtime = registerBuiltins(new Runtime());
  const run = (code: string) => runtime.execute(runtime.compile(code), ctx);
  for (const operation of ['$onlyPerms[ManageGuild]', '$modBan[2;teste]', '$nickname[2;nome;teste]',
    '$getUserVar[value]', '$setUserVar[value;1]', '$deleteUserVar[value]', '$incrementUserVar[value;1]',
    '$ttlUserVar[value]', '$expireUserVar[value;1000]',
    '$dataTransaction[$array[$object[op;set;scope;user;name;value;value;1]]]']) {
    await assert.rejects(run(`$try[${operation};engolido]`), GuardError);
  }
  await run('$setGuildVar[value;1]$setVar[shared;2]');
  assert.deepEqual(await run('$dataTransaction[$array[$jsonDecode[{"op":"set","scope":"user","userID":"2","name":"explicit","value":3}]]]'), [null]);
  assert.equal(await ctx.data.userFor('2').get('explicit'), 3);
  assert.deepEqual(f.lookups, []);
  assert.deepEqual(f.transport.actions, []);
});
