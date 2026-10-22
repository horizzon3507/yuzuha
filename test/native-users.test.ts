import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandContext, MemoryStore } from '../src/index.js';
import { Runtime, defaultLimits, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';
import type { UserInfo, MemberInfo } from '../src/index.js';

const user = (id: string, name = `user${id}`): UserInfo => ({
  id, username: name, displayName: `Display ${name}`, bot: false,
  avatarURL: `https://cdn/${id}.png`, bannerURL: `https://cdn/${id}-banner.png`, createdTimestamp: 1_600_000_000_000,
});

const member = (id: string): MemberInfo => ({
  ...user(id), nickname: `nick${id}`, joinedTimestamp: 1_650_000_000_000, roles: ['10'], permissions: '8', timedOutUntil: null,
});

function harness(options: { guildID?: string } = {}) {
  const transport = new MockTransport();
  const store = new MemoryStore();
  const calls: unknown[] = [];
  const users = {
    async user(id: string) { calls.push(['user', id]); if (id === '404') { const error = Object.assign(new Error('ausente'), { code: 'NOT_FOUND' }); throw error; } return user(id); },
    async member(guildID: string, userID: string) { calls.push(['member', guildID, userID]); return member(userID); },
    async members(guildID: string, limit?: number) { calls.push(['members', guildID, limit]); return [member('1'), member('2')]; },
    async memberCount(guildID: string) { calls.push(['memberCount', guildID]); return 42; },
    async guild(guildID: string) { calls.push(['guild', guildID]); return { id: guildID, name: 'Servidor', ownerID: '1', iconURL: 'https://cdn/icon.png', bannerURL: null, memberCount: 42, createdTimestamp: 1_500_000_000_000 }; },
    async bans(guildID: string, limit?: number) { calls.push(['bans', guildID, limit]); return [{ userID: '2', username: 'banido', reason: null }]; },
    async auditLogs(guildID: string, limit?: number) { calls.push(['auditLogs', guildID, limit]); return [{ id: '9', actionType: 20, userID: '1', targetID: '2', reason: 'motivo', createdTimestamp: 1 }]; },
    async setPresence(status: string, activity?: unknown) { calls.push(['presence', status, activity]); },
  };
  const message = mockMessage('!test', 'guildID' in options ? { guildID: options.guildID } : {});
  const ctx = new CommandContext({ message, command: { name: 'test', code: '' }, transport, store,
    cooldown: () => 0, resources: mockResources({ users: users as never }) });
  const runtime = registerBuiltins(new Runtime(defaultLimits));
  return { ctx, transport, calls, run: (source: string) => runtime.execute(runtime.compile(source, 'users.yz'), ctx) };
}

test('$user, $member e propriedades usam o recurso nativo', async () => {
  const { run, calls } = harness();
  assert.deepEqual(await run('$user[7;username]'), 'user7');
  assert.equal(await run('$displayName[7]'), 'Display user7');
  assert.equal(await run('$member[7;nickname]'), 'nick7');
  assert.equal(await run('$member[7;permissions]'), '8');
  assert.equal(await run('$user[7;createdTimestamp]'), 1_600_000_000_000);
  assert.equal(await run('$user[404;username]'), '');
  assert.equal((await run('$user[7]') as UserInfo).id, '7');
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'member'));
});

test('$members, $memberCount, $avatar e banners', async () => {
  const { run, calls } = harness();
  assert.equal((await run('$members[5]') as MemberInfo[]).length, 2);
  assert.equal(await run('$memberCount'), 42);
  assert.equal(await run('$avatar[7]'), 'https://cdn/7.png');
  assert.equal(await run('$avatar[7;128]'), 'https://cdn/7.png?size=128');
  assert.equal(await run('$userBanner[7;64]'), 'https://cdn/7-banner.png?size=64');
  assert.equal(await run('$userCreated[7]'), 1_600_000_000_000);
  await assert.rejects(run('$avatar[7;15]'), /16/);
  await assert.rejects(run('$members[1001]'), /1000/);
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'members' && call[2] === 5));
});

test('$guild, $guildIcon, $bans e $auditLogs', async () => {
  const { run } = harness();
  assert.equal(await run('$guild[name]'), 'Servidor');
  assert.equal(await run('$guildIcon[256]'), 'https://cdn/icon.png?size=256');
  assert.equal(await run('$guildBanner'), '');
  assert.deepEqual(await run('$bans[10]'), [{ userID: '2', username: 'banido', reason: null }]);
  assert.equal((await run('$auditLogs[5]') as { actionType: number }[])[0]!.actionType, 20);
});

test('$setPresence valida status, atividade e tipo', async () => {
  const { run, calls } = harness();
  assert.equal(await run('$setStatus[idle]'), '');
  assert.equal(await run('$setActivity[Estudando;listening]'), '');
  assert.equal(await run('$setPresence[dnd;Jogando;playing]'), '');
  assert.deepEqual(calls.at(-1), ['presence', 'dnd', { type: 'playing', name: 'Jogando' }]);
  await assert.rejects(run('$setStatus[offline]'), /online/);
  await assert.rejects(run('$setActivity[x;voando]'), /playing/);
});

test('funções de servidor exigem contexto de guilda', async () => {
  const { run } = harness({ guildID: undefined });
  await assert.rejects(run('$guild[name]'), /servidores/);
  await assert.rejects(run('$members'), /servidores/);
  assert.equal(await run('$user[7;username]'), 'user7');
});
