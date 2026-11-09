import test from 'node:test';
import assert from 'node:assert/strict';
import { GuardError } from '../src/shared/errors.js';
import { cleanReason, normalize, matchCandidates, mentionID } from '../src/domain/resolvers.js';
import { MemberService } from '../src/services/members.js';
import { MockTransport, mockResources } from '../src/testing.js';

const members = [
  { id: '1', username: 'Alice', displayName: 'Alice', nickname: null },
  { id: '2', username: 'Alisson', displayName: 'Alisson', nickname: 'Ali' },
  { id: '3', username: 'bob', displayName: 'Bob', nickname: null },
];
function svc(overrides: { users?: Record<string, unknown> } = {}) {
  const users = mockResources({ users: {
    member: async (_g: string, id: string) => {
      const found = members.find(m => m.id === id);
      if (!found) throw new Error('missing');
      return { ...found, joinedTimestamp: 0, roles: [], permissions: '0', timedOutUntil: null, bot: false, avatarURL: null, bannerURL: null, createdTimestamp: 0 };
    },
    user: async (id: string) => ({ id, username: 'Alice', displayName: 'Alice', bot: false, avatarURL: null, bannerURL: null, createdTimestamp: 0 }),
    searchMembers: async () => ({ members: [], total: null, hasMore: false, indexing: false }),
    members: async () => members,
    bans: async () => [{ userID: '9', username: 'banned', reason: 'spam' }],
    ...overrides.users,
  } });
  return new MemberService(new MockTransport(), { guildID: '100', authorID: '2' }, () => users.users);
}
test('resolve por menção, id e inexistente', async () => {
  const service = svc();
  assert.deepEqual(await service.resolve('<@1>'), { status: 'found', id: '1', label: 'Alice', mention: '<@1>', via: 'mention' });
  assert.equal((await service.resolve('99')).status, 'missing');
});
test('exato vence prefixo; ambiguidade com ordem determinística', async () => {
  const service = svc();
  const exact = await service.resolve('ali');
  assert.equal(exact.status, 'found');
  assert.equal((exact as { id: string }).id, '2');
  const ambiguous = await service.resolve('al');
  assert.equal(ambiguous.status, 'ambiguous');
});
test('resolveBan encontra por texto e id', async () => {
  const service = svc();
  assert.deepEqual(await service.resolveBan('banned'), { status: 'found', id: '9', label: 'banned', reason: 'spam', via: 'exact' });
  assert.equal((await service.resolveBan('<@8>')).status, 'missing');
});
test('cleanReason limpa menções e trunca', () => {
  assert.equal(cleanReason('spam <@123>   <#9> flood'), 'spam flood');
  const cleaned = cleanReason('  x '.repeat(400));
  assert.equal(cleaned.length, 512);
  assert.ok(cleaned.startsWith('x x'));
});
