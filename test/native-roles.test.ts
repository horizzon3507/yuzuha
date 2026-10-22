import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandContext } from '../src/commands/context.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import type { RoleInfo, RolesResources } from '../src/ports/resources/roles.js';
import type { FunctionCall, FunctionDefinition } from '../src/scripting/types.js';
import { roleFunctions } from '../src/scripting/builtins/native-roles.js';
import { YuzuhaError } from '../src/shared/errors.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';

const admin: RoleInfo = { id: '10', name: 'Admin', color: 255, position: 2, permissions: '8', hoist: true, mentionable: false, unicodeEmoji: null, managed: false };
const member: RoleInfo = { id: '11', name: 'Membro', color: 0, position: 1, permissions: '0', hoist: false, mentionable: true, unicodeEmoji: null, managed: false };

interface FakeCalls {
  resolve: [string, string][];
  list: string[];
  has: [string, string, string][];
  add: [string, string, string][];
  remove: [string, string, string][];
  create: [string, { name: string; color?: number; permissions?: string[] }][];
  edit: [string, string, { name?: string; color?: number; permissions?: string[] }][];
  removeRole: [string, string][];
}

function fakeRoles(calls: FakeCalls, membership = new Set(['11'])): Partial<RolesResources> {
  const byId = new Map([[admin.id, admin], [member.id, member]]);
  const find = (query: string): RoleInfo => {
    const text = query.trim();
    const mention = /^<@&(\d+)>$/.exec(text)?.[1];
    const direct = mention ?? (/^\d+$/.test(text) ? text : undefined);
    if (direct && byId.has(direct)) return byId.get(direct)!;
    const named = [...byId.values()].find(role => role.name.toLowerCase() === text.toLowerCase());
    if (named) return named;
    throw new YuzuhaError('ROLE_NOT_FOUND', 'Cargo não encontrado.');
  };
  return {
    async resolve(guildID, role) { calls.resolve.push([guildID, role]); return find(role); },
    async list(guildID) { calls.list.push(guildID); return [admin, member]; },
    async has(guildID, userID, role) { calls.has.push([guildID, userID, role]); return membership.has(find(role).id); },
    async add(guildID, userID, role) { calls.add.push([guildID, userID, role]); membership.add(find(role).id); },
    async remove(guildID, userID, role) { calls.remove.push([guildID, userID, role]); membership.delete(find(role).id); },
    async create(guildID, input) {
      calls.create.push([guildID, input]);
      return { id: '12', name: input.name, color: input.color ?? 0, position: 0,
        permissions: '0', hoist: false, mentionable: false, unicodeEmoji: null, managed: false };
    },
    async edit(guildID, role, input) {
      calls.edit.push([guildID, role, input]);
      const current = find(role);
      return { ...current, name: input.name ?? current.name, color: input.color ?? current.color };
    },
    async delete(guildID, role) { calls.removeRole.push([guildID, role]); find(role); },
  };
}

function newCalls(): FakeCalls {
  return { resolve: [], list: [], has: [], add: [], remove: [], create: [], edit: [], removeRole: [] };
}

function harness(guildID: string | null = '100') {
  const calls = newCalls();
  const transport = new MockTransport();
  const ctx = new CommandContext({
    message: mockMessage('!roles', guildID === null ? { guildID: undefined } : { guildID }),
    command: { name: 'roles', run() {} },
    transport, store: new MemoryStore(), cooldown: () => 0,
    resources: mockResources({ roles: fakeRoles(calls) }),
  });
  return { ctx, calls };
}

function byName(name: string): FunctionDefinition {
  const fn = roleFunctions.find(definition => definition.name === name);
  assert.ok(fn, `função ${name} registrada`);
  return fn;
}

function call(ctx: CommandContext, args: string[]): FunctionCall {
  const values = new Map<number, unknown>();
  return {
    ctx,
    count: args.length,
    arg: async index => values.get(index) ?? args[index] ?? '',
    fresh: async index => values.get(index) ?? args[index] ?? '',
    text: async index => String(values.get(index) ?? args[index] ?? ''),
    all: async () => [...args],
    wait: async operation => operation,
    checkOutput() {},
  };
}

async function run(name: string, ctx: CommandContext, args: string[]): Promise<unknown> {
  return byName(name).execute(call(ctx, args));
}

function rejectsCode(promise: Promise<unknown>, code: string): Promise<void> {
  return assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof YuzuhaError, 'esperado YuzuhaError');
    assert.equal(error.code, code);
    return true;
  });
}

test('metadados das funções de cargos usam categoria roles e descrições em português', () => {
  const expected = ['role', 'roles', 'hasRole', 'addRole', 'removeRole', 'createRole', 'editRole', 'deleteRole', 'moveRole'];
  assert.deepEqual(roleFunctions.map(fn => fn.name).sort(), expected.sort());
  for (const fn of roleFunctions) {
    assert.equal(fn.category, 'roles');
    assert.ok(fn.description.length > 0, fn.name);
    assert.ok(fn.usage.startsWith(`$${fn.name}`), fn.name);
  }
});

test('$role resolve por nome, ID e menção, com propriedade opcional', async () => {
  const { ctx, calls } = harness();
  assert.deepEqual(await run('role', ctx, ['Membro']), member);
  assert.deepEqual(await run('role', ctx, ['10']), admin);
  assert.deepEqual(await run('role', ctx, ['<@&10>']), admin);
  assert.equal(await run('role', ctx, ['Admin', 'position']), 2);
  assert.equal(await run('role', ctx, ['Admin', 'permissions']), '8');
  assert.deepEqual(calls.resolve, [['100', 'Membro'], ['100', '10'], ['100', '<@&10>'], ['100', 'Admin'], ['100', 'Admin']]);
  await rejectsCode(run('role', ctx, ['Ausente']), 'ROLE_NOT_FOUND');
  await rejectsCode(run('role', ctx, ['Admin', 'dono']), 'ROLE_PROPERTY');
});

test('$roles lista cargos ordenados por posição', async () => {
  const { ctx, calls } = harness();
  const result = await run('roles', ctx, []) as RoleInfo[];
  assert.deepEqual(result.map(role => role.name), ['Admin', 'Membro']);
  assert.deepEqual(calls.list, ['100']);
});

test('$hasRole, $addRole e $removeRole registram chamadas e retornam vazio nas ações', async () => {
  const { ctx, calls } = harness();
  assert.equal(await run('hasRole', ctx, ['2', 'Membro']), true);
  assert.equal(await run('hasRole', ctx, ['2', 'Admin']), false);
  assert.equal(await run('addRole', ctx, ['2', 'Admin']), '');
  assert.equal(await run('hasRole', ctx, ['2', 'Admin']), true);
  assert.equal(await run('removeRole', ctx, ['2', 'Membro']), '');
  assert.equal(await run('hasRole', ctx, ['2', 'Membro']), false);
  assert.deepEqual(calls.add, [['100', '2', '10']]);
  assert.deepEqual(calls.remove, [['100', '2', '11']]);
});

test('$createRole aceita cor hex e permissões separadas por vírgula', async () => {
  const { ctx, calls } = harness();
  const created = await run('createRole', ctx, ['Mod', '#ff0000', 'BanMembers, KickMembers']) as RoleInfo;
  assert.equal(created.name, 'Mod');
  assert.equal(created.color, 0xff0000);
  assert.deepEqual(calls.create, [['100', { name: 'Mod', color: 0xff0000, permissions: ['BanMembers', 'KickMembers'] }]]);
  const numeric = await run('createRole', ctx, ['Base', '255', '']) as RoleInfo;
  assert.equal(numeric.color, 255);
  assert.deepEqual(calls.create[1], ['100', { name: 'Base', color: 255, permissions: undefined }]);
});

test('$editRole preserva campos vazios e $deleteRole retorna vazio', async () => {
  const { ctx, calls } = harness();
  const edited = await run('editRole', ctx, ['Membro', '', '', '']) as RoleInfo;
  assert.equal(edited.name, 'Membro');
  assert.deepEqual(calls.edit, [['100', '11', { name: undefined, color: undefined, permissions: undefined }]]);
  const renamed = await run('editRole', ctx, ['11', 'Membros']) as RoleInfo;
  assert.equal(renamed.name, 'Membros');
  assert.equal(await run('deleteRole', ctx, ['11']), '');
  assert.deepEqual(calls.removeRole, [['100', '11']]);
});

test('validação de nome e cor usa erros em português', async () => {
  const { ctx } = harness();
  await rejectsCode(run('createRole', ctx, ['']), 'ROLE_NAME');
  await rejectsCode(run('createRole', ctx, ['x'.repeat(101)]), 'ROLE_NAME');
  await rejectsCode(run('createRole', ctx, ['Mod', 'vermelho']), 'ROLE_COLOR');
  await rejectsCode(run('createRole', ctx, ['Mod', '16777216']), 'ROLE_COLOR');
  await rejectsCode(run('editRole', ctx, ['Membro', 'x'.repeat(101)]), 'ROLE_NAME');
});

test('funções de cargos exigem servidor', async () => {
  const { ctx } = harness(null);
  for (const [name, args] of [['role', ['Membro']], ['roles', []], ['hasRole', ['2', 'Membro']],
    ['addRole', ['2', 'Membro']], ['removeRole', ['2', 'Membro']],
    ['createRole', ['Mod']], ['editRole', ['Membro']], ['deleteRole', ['Membro']]] as const) {
    await assert.rejects(run(name, ctx, [...args]), (error: unknown) => error instanceof YuzuhaError && error.code === 'GUARD');
  }
});
