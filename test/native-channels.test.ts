import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandContext } from '../src/commands/context.js';
import type { ContextOptions } from '../src/commands/context.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import type { ChannelInfo, ChannelOverwriteInput, ChannelsResources } from '../src/ports/resources/channels.js';
import type { InviteCreateInput, InviteInfo, InvitesResources } from '../src/ports/resources/invites.js';
import { Runtime } from '../src/scripting/runtime.js';
import { defaultLimits } from '../src/scripting/limits.js';
import { channelFunctions } from '../src/scripting/builtins/native-channels.js';
import { inviteFunctions } from '../src/scripting/builtins/native-invites.js';
import { YuzuhaError } from '../src/errors.js';
import { GuardError } from '../src/shared/errors.js';
import { ScriptError } from '../src/errors.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';

function channelFixture(overrides: Partial<ChannelInfo> = {}): ChannelInfo {
  return { id: '10', name: 'geral', type: 0, guildID: '100', parentID: null,
    position: 1, topic: null, slowmode: 0, nsfw: false, ...overrides };
}

function inviteFixture(overrides: Partial<InviteInfo> = {}): InviteInfo {
  return { code: 'abc123', url: 'https://fluxo.gg/abc123', guildID: '100', channelID: '10',
    inviterID: '1', uses: 0, maxUses: null, expiresTimestamp: null, ...overrides };
}

interface ChannelCalls {
  get: string[];
  list: { guildID: string; limit?: number }[];
  create: { guildID: string; input: unknown }[];
  edit: { channelID: string; input: unknown }[];
  deleted: { channelID: string; reason?: string }[];
  slowmode: { channelID: string; seconds: number }[];
  overwrite: { channelID: string; targetID: string; input: ChannelOverwriteInput }[];
  permissionsFor: { guildID: string; channelID: string; userID: string }[];
}

interface InviteCalls {
  get: string[];
  create: { channelID: string; input: InviteCreateInput | undefined }[];
  deleted: string[];
}

function channelFakes(info: ChannelInfo[] = [channelFixture(), channelFixture({ id: '11' }), channelFixture({ id: '200' }), channelFixture({ id: '7', type: 4 })]): { calls: ChannelCalls; resources: Partial<ChannelsResources> } {
  const calls: ChannelCalls = { get: [], list: [], create: [], edit: [], deleted: [], slowmode: [], overwrite: [], permissionsFor: [] };
  const find = (id: string): ChannelInfo => {
    const found = info.find(channel => channel.id === id);
    if (!found) throw new YuzuhaError('CHANNEL', 'Canal não encontrado.');
    return found;
  };
  const resources: Partial<ChannelsResources> = {
    async get(channelID) { calls.get.push(channelID); return find(channelID); },
    async list(guildID, limit) { calls.list.push({ guildID, limit }); return [...info]; },
    async create(guildID, input) { calls.create.push({ guildID, input }); return channelFixture({ id: '99', name: input.name, type: input.type ?? 0 }); },
    async edit(channelID, input) { calls.edit.push({ channelID, input }); return { ...find(channelID), ...input }; },
    async delete(channelID, reason) { calls.deleted.push({ channelID, reason }); },
    async setSlowmode(channelID, seconds) { calls.slowmode.push({ channelID, seconds }); },
    async overwrite(channelID, targetID, input) { calls.overwrite.push({ channelID, targetID, input }); },
    async permissionsFor(guildID, channelID, userID) { calls.permissionsFor.push({ guildID, channelID, userID }); return '123'; },
  };
  return { calls, resources };
}

function inviteFakes(): { calls: InviteCalls; resources: Partial<InvitesResources> } {
  const calls: InviteCalls = { get: [], create: [], deleted: [] };
  const resources: Partial<InvitesResources> = {
    async get(codeOrURL) { calls.get.push(codeOrURL); return inviteFixture({ code: codeOrURL }); },
    async create(channelID, input) { calls.create.push({ channelID, input }); return inviteFixture({ channelID }); },
    async delete(codeOrURL) { calls.deleted.push(codeOrURL); },
  };
  return { calls, resources };
}

function harness(overrides: Partial<ContextOptions> = {}, channels = channelFakes(), invites = inviteFakes()) {
  const transport = new MockTransport();
  const store = new MemoryStore();
  const ctx = new CommandContext({ message: mockMessage('!test'), command: { name: 'test', code: '' },
    transport, store, cooldown: () => 0,
    resources: mockResources({ channels: channels.resources, invites: invites.resources, roles: { list: async () => ['5', '7'].map(id => ({ id, name: id, position: 1, color: 0, permissions: '0', hoist: false, mentionable: false, unicodeEmoji: null, managed: false })) } }), ...overrides });
  const runtime = new Runtime(defaultLimits).registerAll([...channelFunctions, ...inviteFunctions]);
  const run = (source: string): Promise<unknown> => runtime.execute(runtime.compile(source, 'command.yz'), ctx);
  return { ctx, runtime, run, channels, invites };
}

test('channel mostra canal, propriedade e vazio para propriedade ausente', async () => {
  const { run } = harness();
  assert.deepEqual(await run('$channel[10]'), channelFixture());
  assert.equal(await run('$channel[10;name]'), 'geral');
  assert.equal(await run('$channel[10;missing]'), '');
});

test('channels lista canais do servidor atual', async () => {
  const { run, channels } = harness({}, channelFakes([
    channelFixture({ id: '11', name: 'voz', type: 2, position: 2 }),
    channelFixture({ id: '10', name: 'geral', type: 0, position: 1 }),
  ]));
  const result = await run('$channels') as ChannelInfo[];
  assert.equal(result.length, 2);
  assert.deepEqual(channels.calls.list, [{ guildID: '100', limit: undefined }]);
});

test('createChannel mapeia tipos nomeados e numéricos', async () => {
  const { run, channels } = harness();
  const cases: [string, number][] = [
    ['texto', 0], ['voz', 2], ['categoria', 4], ['anuncio', 5], ['forum', 15], ['midia', 16], ['2', 2],
  ];
  for (const [label, type] of cases) {
    const created = await run(`$createChannel[novo;${label}]`) as ChannelInfo;
    assert.equal(created.type, type);
  }
  assert.deepEqual(channels.calls.create.map(call => call.input),
    cases.map(([, type]) => ({ name: 'novo', type })));
  const withParent = await run('$createChannel[novo;texto;7]') as ChannelInfo;
  assert.equal(withParent.id, '99');
  assert.deepEqual(channels.calls.create.at(-1), { guildID: '100', input: { name: 'novo', type: 0, parentID: '7' } });
  const fallback = await run('$createChannel[novo]') as ChannelInfo;
  assert.equal(fallback.type, 0);
  await assert.rejects(run('$createChannel[novo;dm]'), (error: unknown) =>
    error instanceof ScriptError && /Tipo de canal inválido/.test(error.message));
  await assert.rejects(run('$createChannel[ ]'), (error: unknown) =>
    error instanceof ScriptError && /nome do canal/.test(error.message));
});

test('editChannel preserva campos vazios e valida slowmode', async () => {
  const { run, channels } = harness();
  const edited = await run('$editChannel[10;;novo-topico;]') as ChannelInfo;
  assert.equal(edited.topic, 'novo-topico');
  assert.deepEqual(channels.calls.edit, [{ channelID: '10', input: { topic: 'novo-topico' } }]);
  await run('$editChannel[10;renomeado;;30]');
  assert.deepEqual(channels.calls.edit.at(-1), { channelID: '10', input: { name: 'renomeado', slowmode: 30 } });
  await assert.rejects(run('$editChannel[10;;;30000]'), (error: unknown) =>
    error instanceof ScriptError && /Slowmode/.test(error.message));
});

test('deleteChannel apaga e slowmode usa o canal atual por padrão', async () => {
  const { run, channels } = harness();
  assert.equal(await run('$deleteChannel[10]'), '');
  assert.deepEqual(channels.calls.deleted, [{ channelID: '10', reason: undefined }]);
  assert.equal(await run('$slowmode[10]'), '');
  assert.equal(await run('$slowmode[0;11]'), '');
  assert.deepEqual(channels.calls.slowmode, [
    { channelID: '200', seconds: 10 },
    { channelID: '11', seconds: 0 },
  ]);
  await assert.rejects(run('$slowmode[21601]'), (error: unknown) =>
    error instanceof ScriptError && /Slowmode/.test(error.message));
  await assert.rejects(run('$slowmode[-1]'), (error: unknown) =>
    error instanceof ScriptError && /Slowmode/.test(error.message));
});

test('channelPerms resolve alvo e registra allow/deny', async () => {
  const { run, channels } = harness();
  assert.equal(await run('$channelPerms[10;<@&5>;SendMessages,ManageMessages;]'), '');
  assert.equal(await run('$channelPerms[10;<@2>;;SendMessages]'), '');
  assert.equal(await run('$channelPerms[10;7;ViewChannel;]'), '');
  assert.deepEqual(channels.calls.overwrite, [
    { channelID: '10', targetID: '5', input: { type: 'role', allow: ['SendMessages', 'ManageMessages'] } },
    { channelID: '10', targetID: '2', input: { type: 'member', deny: ['SendMessages'] } },
    { channelID: '10', targetID: '7', input: { type: 'role', allow: ['ViewChannel'] } },
  ]);
  const dm = harness({ message: mockMessage('!test', { guildID: undefined }) });
  await assert.rejects(dm.run('$channelPerms[10;7]'), GuardError);
});

test('channelPermsOf mostra o bitfield efetivo', async () => {
  const { run, channels } = harness();
  assert.equal(await run('$channelPermsOf[10;<@2>]'), '123');
  assert.deepEqual(channels.calls.permissionsFor, [{ guildID: '100', channelID: '10', userID: '2' }]);
});

test('invite extrai código de URL e createInvite converte duração', async () => {
  const { run, invites } = harness();
  const byCode = await run('$invite[abc123]') as InviteInfo;
  assert.equal(byCode.code, 'abc123');
  await run('$invite[https://fluxo.gg/abc123?foo=bar]');
  await run('$invite[fluxo.gg/xyz/]');
  assert.deepEqual(invites.calls.get, ['abc123', 'abc123', 'xyz']);
  const created = await run('$createInvite[10;5;1h]') as InviteInfo;
  assert.equal(created.channelID, '10');
  assert.deepEqual(invites.calls.create, [{ channelID: '10', input: { maxUses: 5, maxAge: 3600 } }]);
  await run('$createInvite[10]');
  assert.deepEqual(invites.calls.create.at(-1), { channelID: '10', input: { maxAge: 0 } });
  await run('$createInvite[10;;0]');
  assert.deepEqual(invites.calls.create.at(-1), { channelID: '10', input: { maxAge: 0 } });
  await assert.rejects(run('$createInvite[10;-1;1h]'), (error: unknown) =>
    error instanceof ScriptError && /usos/.test(error.message));
  await assert.rejects(run('$createInvite[10;1;leve]'), (error: unknown) =>
    error instanceof ScriptError && /Duração inválida/.test(error.message));
  assert.equal(await run('$deleteInvite[https://fluxo.gg/xyz]'), '');
  assert.deepEqual(invites.calls.deleted, ['xyz']);
  await assert.rejects(run('$invite[ ]'), (error: unknown) =>
    error instanceof ScriptError && /código/.test(error.message));
});
