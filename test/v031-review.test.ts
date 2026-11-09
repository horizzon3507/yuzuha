import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlags } from '@fluxerjs/core';
import { GuardError, isGuardReason } from '../src/shared/errors.js';
import { ModerationService } from '../src/services/moderation.js';
import { MockTransport, mockMessage, mockResources, createTestBot } from '../src/testing.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import { CommandContext } from '../src/commands/context.js';
import { parseArguments, parseFlags, validateFlagDefinitions, validateArgumentDefinitions } from '../src/commands/arguments.js';
import { argumentDefinitions, arg } from '../src/commands/builders.js';
import { YuzuhaError } from '../src/shared/errors.js';
import type { ArgumentDefinition } from '../src/commands/definition.js';
import { createCdn } from '../src/domain/cdn.js';
import { createUsersResources } from '../src/infrastructure/fluxer/resources/users.js';
import type { Client } from '@fluxerjs/core';

test('A1: membro ausente no MockTransport faz canModerate devolver false', async () => {
  const service = new ModerationService(new MockTransport(), new MemoryStore(), { guildID: '100', authorID: '2' });
  assert.equal(await service.canModerate('ban', '999'), false);
});

test('A2/A3: cooldown explícito e flag desconhecida carregam reasons tipadas', async () => {
  const ctx = new CommandContext({ message: mockMessage('!x'), command: { name: 'x' },
    store: new MemoryStore(), transport: new MockTransport(), cooldown: () => 5000, resources: mockResources() });
  assert.throws(() => ctx.cooldown('1s'), (e: unknown) => isGuardReason(e, 'COOLDOWN'));
  assert.throws(() => parseFlags([{ name: 'a', type: 'string' }], ['--b=1']),
    (e: unknown) => isGuardReason(e, 'INVALID_ARGUMENT'));
});

test('B1: ttlMs inválido rejeita antes de chamar o transport', async () => {
  let calls = 0;
  const transport = new MockTransport();
  transport.send = async () => { calls++; return '1'; };
  const ctx = new CommandContext({ message: mockMessage('!x'), command: { name: 'x' },
    store: new MemoryStore(), transport, cooldown: () => 0, resources: mockResources() });
  await assert.rejects(async () => ctx.send('x', undefined, { ttlMs: 10 }), GuardError);
  assert.equal(calls, 0);
});

test('B2: comando real agenda exclusão TTL via fixture.timers', async () => {
  let deleted: string[] = [];
  const fixture = createTestBot({ prefix: '!',
    commands: [{ name: 'e', run: async ctx => { await ctx.send('x', undefined, { ttlMs: 5_000 }); } }] });
  fixture.transport.delete = async (_c, id) => { deleted.push(id); };
  await fixture.send('!e');
  fixture.timers.advance(6_000);
  await new Promise(r => setTimeout(r, 10));
  assert.equal(deleted.length, 1);
});

test('C2: erro não-ausência de member() propaga no resolve', async () => {
  const { MemberService } = await import('../src/services/members.js');
  const users = mockResources({ users: { member: async () => { throw new Error('upstream down'); } } });
  const service = new MemberService(new MockTransport(), { guildID: '100', authorID: '2' }, () => users.users);
  await assert.rejects(service.resolve('<@123456789012345678>'), /upstream down/);
});

test('C1: resolve pagina searchMembers até hasMore=false', async () => {
  const { MemberService } = await import('../src/services/members.js');
  const pages: number[] = [];
  const users = mockResources({ users: {
    searchMembers: async (_g: string, _q: string, _l: number, offset = 0) => {
      pages.push(offset);
      return offset === 0 ? { members: [], total: null, hasMore: true, indexing: false }
        : { members: [{ userID: '7', username: 'alvo', displayName: 'alvo', nickname: null }], total: null, hasMore: false, indexing: false };
    },
    members: async () => [],
  } });
  const service = new MemberService(new MockTransport(), { guildID: '100', authorID: '2' }, () => users.users);
  const result = await service.resolve('alvo');
  assert.equal(result.status, 'found');
  assert.deepEqual(pages, [0, 25]);
});

test('D1: wrapper de autorização repassa options.merge ao recurso', async () => {
  const { bindAuthorizedResources } = await import('../src/services/resource-authorization.js');
  const channel = { id: '200', name: 'geral', guildID: '100', type: 0, parentID: null, position: 0, topic: null, slowmode: 0, nsfw: false };
  const transport = new MockTransport();
  transport.member = async () => ({ id: '2', owner: false, permissions: PermissionFlags.Administrator, rank: 5, topRoleID: '10' });
  let merged: unknown;
  const raw = mockResources({ channels: { get: async () => channel,
    overwrite: async (_c: string, _t: string, _i: unknown, options?: { merge?: boolean }) => { merged = options?.merge; } },
    roles: { list: async () => [{ id: '10', name: 'r', color: 0, position: 1, permissions: '0', hoist: false, mentionable: false, unicodeEmoji: null, managed: false }] } });
  const resources = bindAuthorizedResources(raw, transport, { guildID: '100', authorID: '2' });
  await resources.channels.overwrite('200', '10', { type: 'role', deny: ['SendMessages'] }, { merge: true });
  assert.equal(merged, true);
});

test('E2: users.bannerURL honra o mediaBase configurado', async () => {
  const cdn = createCdn('https://cdn.example.com');
  const client = { users: { fetchWithProfile: async () => ({ user: {}, member: null,
    globalProfile: { userProfile: { banner: 'a_x' } }, serverProfile: null }) } } as unknown as Client;
  const url = await createUsersResources(client, cdn).bannerURL('1');
  assert.match(url!, /cdn\.example\.com/);
});

test('E3: asset() insere size antes do fragmento', () => {
  const cdn = createCdn();
  assert.equal(cdn.asset('https://cdn.x/a.png#frag', { size: 64 }), 'https://cdn.x/a.png?size=64#frag');
});

test('F1: anywhere prefere menção e cai no ÚLTIMO bare snowflake', () => {
  const mention = argumentDefinitions({ count: arg.integer(), target: arg.user().required().anywhere() });
  const result = parseArguments(mention, ['2', '123456789012345678']);
  assert.equal(result.get('target'), '123456789012345678');
  const withMention = parseArguments(mention, ['2', '<@123456789012345678>']);
  assert.equal(withMention.get('target'), '123456789012345678');
  const users = argumentDefinitions({ who: arg.user(), target: arg.user().required().anywhere() });
  const lastBare = parseArguments(users, ['123456789012345678', '987654321098765431']);
  assert.equal(lastBare.get('who'), '123456789012345678');
  assert.equal(lastBare.get('target'), '987654321098765431');
});

test('F2/F3: anywhere em flag e não-booleano são rejeitados', () => {
  assert.throws(() => validateFlagDefinitions([{ name: 'u', type: 'user', anywhere: true }] as ArgumentDefinition[], 'x'),
    (e: unknown) => e instanceof YuzuhaError && e.code === 'ARGUMENT_SCHEMA');
  assert.throws(() => validateArgumentDefinitions([{ name: 'u', type: 'user', anywhere: 1 as never }] as ArgumentDefinition[]),
    (e: unknown) => e instanceof YuzuhaError && e.code === 'COMMAND_ARGS');
});

test('B3: bulkDeleteOwn não é retentada (não idempotente)', async () => {
  const { createMessagesResources } = await import('../src/infrastructure/fluxer/resources/messages.js');
  let calls = 0;
  const channel = { isTextBased: () => true, bulkDeleteMyMessages: async () => { calls++; throw Object.assign(new Error('net'), { code: 'ECONNRESET' }); } };
  const client = { channels: { fetch: async () => channel } } as unknown as Client;
  const messages = createMessagesResources(client, { retry: { requests: 3, delayMs: 1 } });
  await assert.rejects(messages.bulkDeleteOwn('1'), /net/);
  assert.equal(calls, 1);
});

test('C3: resolveBan do adaptador lê a lista completa de bans', async () => {
  const bans = Array.from({ length: 1100 }, (_, i) => ({ user: { id: `${1000 + i}`, username: `u${i}` }, reason: 'x' }));
  const client = { guilds: { fetch: async () => ({ fetchBans: async () => bans }) } } as unknown as Client;
  const result = await createUsersResources(client).resolveBan('100', 'u1099');
  assert.equal(result.status, 'found');
});

test('D2: reason do lock vira X-Audit-Log-Reason na request', async () => {
  const { createChannelsResources } = await import('../src/infrastructure/fluxer/resources/channels.js');
  let seenReason: string | undefined;
  const channel = { id: '200', guildId: '100', isGuild: () => true, isText: () => true, isVoice: () => false,
    permissionOverwrites: { cache: new Map(), edit: async () => {} } };
  const client = {
    channels: { fetch: async () => channel },
    guilds: { resolve: async () => ({ roles: { get: () => ({ id: '100' }) }, fetchRole: async () => ({ id: '100' }) }) },
    rest: { put: async (_route: string, options: { headers?: Record<string, string> }) => { seenReason = options.headers?.['X-Audit-Log-Reason']; } },
  } as unknown as Client;
  await createChannelsResources(client).lock('200', { reason: 'mute canal' });
  assert.equal(seenReason, 'mute canal');
});
