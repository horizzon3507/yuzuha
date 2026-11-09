import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlags } from '@fluxerjs/core';
import { GuardError, isGuardReason } from '../src/shared/errors.js';
import { formatDuration, MAX_TIMEOUT_MS } from '../src/domain/values.js';
import { parseDuration } from '../src/domain/values.js';
import { AuthorizationService } from '../src/services/authorization.js';
import { ModerationService } from '../src/services/moderation.js';
import { MockTransport } from '../src/testing.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import { bindAuthorizedResources } from '../src/services/resource-authorization.js';
import { mockResources } from '../src/testing.js';
import type { ChannelInfo } from '../src/ports/resources/channels.js';

function member(id: string, permissions: bigint, opts: { owner?: boolean; rank?: number } = {}) {
  return { id, owner: opts.owner ?? false, permissions, rank: opts.rank ?? 5, topRoleID: '10', roles: [] };
}
function mod(perms: bigint, targetRank = 1, targetOwner = false) {
  const transport = new MockTransport();
  transport.member = async (_g: string, id: string) =>
    id === '9' ? member('9', 0n, { rank: targetRank, owner: targetOwner }) : member(id, perms) as never;
  const service = new ModerationService(transport, new MemoryStore(), { guildID: '100', authorID: '2' });
  return service;
}
const cases: [string, () => Promise<unknown>, string][] = [
  ['PERMISSION_MISSING_AUTHOR', () => mod(0n).execute('ban', '9', 'x', { record: false }), 'PERMISSION_MISSING_AUTHOR'],
  ['PERMISSION_MISSING_BOT', () => mod(0n).execute('ban', '9', 'x', { record: false }), 'PERMISSION_MISSING_AUTHOR'],
  ['HIERARCHY', () => mod(PermissionFlags.Administrator, 99).execute('ban', '9', 'x', { record: false }), 'HIERARCHY'],
  ['SELF_TARGET', () => mod(PermissionFlags.Administrator).execute('ban', '2', 'x', { record: false }), 'SELF_TARGET'],
  ['BOT_TARGET', () => mod(PermissionFlags.Administrator).execute('ban', new MockTransport().botID, 'x', { record: false }), 'BOT_TARGET'],
  ['OWNER_TARGET', () => mod(PermissionFlags.Administrator, 1, true).execute('ban', '9', 'x', { record: false }), 'OWNER_TARGET'],
];
for (const [name, run, expected] of cases) {
  test(`GuardError.reason: ${name}`, async () => {
    await assert.rejects(run(), (error: unknown) =>
      error instanceof GuardError && error.reason === expected);
  });
}
test('isGuardReason filtra por motivo', () => {
  const error = new GuardError('x', 'HIERARCHY');
  assert.equal(isGuardReason(error, 'HIERARCHY', 'COOLDOWN'), true);
  assert.equal(isGuardReason(error, 'COOLDOWN'), false);
  assert.equal(isGuardReason(new Error('x'), 'GENERIC'), false);
});
test('formatDuration formata em pt-BR e rejeita inválidos', () => {
  assert.equal(formatDuration(90_000), '1 minuto e 30 segundos');
  assert.equal(formatDuration(600_000), '10 minutos');
  assert.equal(formatDuration(3_600_000), '1 hora');
  assert.equal(formatDuration(parseDuration('10m')), '10 minutos');
  assert.equal(formatDuration(500), '500 milissegundos');
  assert.equal(formatDuration(2 * 3_600_000), '2 horas');
  assert.equal(formatDuration(86400_000 + 3600_000), '1 dia e 1 hora');
  assert.throws(() => formatDuration(0));
  assert.throws(() => formatDuration(-5));
  assert.throws(() => formatDuration(1.5));
});
test('MAX_TIMEOUT_MS cobre 28 dias', () => {
  assert.equal(MAX_TIMEOUT_MS, 28 * 24 * 60 * 60 * 1000);
  assert.equal(formatDuration(MAX_TIMEOUT_MS), '28 dias');
});
test('membro ausente vira GuardError MEMBER_NOT_FOUND e can* devolve false', async () => {
  const transport = new MockTransport();
  const missing = new GuardError('Membro não encontrado.', 'MEMBER_NOT_FOUND');
  transport.member = async () => { throw missing; };
  const service = new ModerationService(transport, new MemoryStore(), { guildID: '100', authorID: '2' });
  await assert.rejects(service.execute('ban', '9', 'x', { record: false }),
    (error: unknown) => error instanceof GuardError && error.reason === 'MEMBER_NOT_FOUND');
  assert.equal(await service.canModerate('ban', '9'), false);
});
