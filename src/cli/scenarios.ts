import { readFile, stat } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { Yuzuha } from '../bot.js';
import type { DispatchResult } from '../framework/options.js';
import type { Command } from '../commands/definition.js';
import type { Payload } from '../domain/messages.js';
import { MemoryStore } from '../infrastructure/storage/memory.js';
import { permission } from '../domain/permissions.js';
import { YuzuhaError } from '../errors.js';
import { MockTransport, mockMessage, mockResources } from '../testing.js';

interface ScenarioCommand { name: string; code: string; aliases?: string[]; permissions?: string[]; botPermissions?: string[]; guildOnly?: boolean }
interface ScenarioMember { guildID: string; id: string; owner?: boolean; permissions: string[]; rank: number; topRoleID?: string }
interface ScenarioExpectation { outcome: DispatchResult; responses?: string[]; errorCodes?: string[]; actions?: { action: string; targetID: string }[] }
interface ScenarioMessage { content: string; authorID?: string; channelID?: string; guildID?: string | null; mentions?: string[]; expect: ScenarioExpectation }
export interface Scenario { name: string; prefix?: string; commands: ScenarioCommand[]; members?: ScenarioMember[]; messages: ScenarioMessage[] }
export interface ScenarioSuite { version: 1; scenarios: Scenario[] }
export interface ScenarioResult {
  name: string;
  passed: boolean;
  messages: { index: number; passed: boolean; outcome: DispatchResult; responses: string[]; errorCodes: string[];
    actions: { action: string; targetID: string }[]; mismatches: string[] }[];
}
export interface ScenarioReport { valid: boolean; offline: true; scenarios: ScenarioResult[] }

class ScenarioTransport extends MockTransport {
  readonly sent: string[] = [];
  override async send(channelID: string, payload: Payload): Promise<string> {
    const id = await super.send(channelID, payload);
    this.sent.push(payload.content ?? '');
    return id;
  }
}

function object(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) {
    throw new YuzuhaError('SCENARIO_INVALID', 'Objeto de cenário inválido ou com campos desconhecidos.');
  }
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 128): value is string { return typeof value === 'string' && value.length > 0 && value.length <= max; }
function strings(value: unknown, max = 100): value is string[] {
  return Array.isArray(value) && value.length <= max && value.every(item => typeof item === 'string' && item.length <= 100_000);
}
function permissionNames(value: unknown): void {
  if (value === undefined) return;
  if (!strings(value) || value.some(name => !text(name))) throw new YuzuhaError('SCENARIO_INVALID', 'Permissões devem ser nomes reconhecidos.');
  for (const name of value) permission(name);
}
function invalid(): never { throw new YuzuhaError('SCENARIO_INVALID', 'Campos ou limites do cenário inválidos.'); }

export function parseScenarios(content: string): ScenarioSuite {
  if (Buffer.byteLength(content) > 5_000_000) throw new YuzuhaError('SCENARIO_LIMIT', 'Cenários excedem 5000000 bytes.');
  let value: unknown;
  try { value = JSON.parse(content); } catch (cause) { throw new YuzuhaError('SCENARIO_INVALID', 'Cenários devem ser JSON válido.', { cause }); }
  const suite = object(value, ['version', 'scenarios']);
  if (suite['version'] !== 1 || !Array.isArray(suite['scenarios']) || suite['scenarios'].length < 1 || suite['scenarios'].length > 100) invalid();
  let messages = 0;
  const names = new Set<string>();
  for (const raw of suite['scenarios']) {
    const scenario = object(raw, ['name', 'prefix', 'commands', 'members', 'messages']);
    if (!text(scenario['name']) || names.has(scenario['name'])
      || (scenario['prefix'] !== undefined && !text(scenario['prefix'], 32))
      || !Array.isArray(scenario['commands']) || scenario['commands'].length < 1 || scenario['commands'].length > 50
      || !Array.isArray(scenario['messages']) || scenario['messages'].length < 1 || scenario['messages'].length > 100) invalid();
    names.add(scenario['name']);
    messages += scenario['messages'].length;
    if (messages > 1000) invalid();
    for (const rawCommand of scenario['commands']) {
      const command = object(rawCommand, ['name', 'code', 'aliases', 'permissions', 'botPermissions', 'guildOnly']);
      if (!text(command['name']) || typeof command['code'] !== 'string' || command['code'].length > 100_000
        || (command['aliases'] !== undefined && (!strings(command['aliases'], 32) || command['aliases'].some(alias => !text(alias))))
        || (command['guildOnly'] !== undefined && typeof command['guildOnly'] !== 'boolean')) invalid();
      permissionNames(command['permissions']); permissionNames(command['botPermissions']);
    }
    if (scenario['members'] !== undefined) {
      if (!Array.isArray(scenario['members']) || scenario['members'].length > 100) invalid();
      for (const rawMember of scenario['members']) {
        const member = object(rawMember, ['guildID', 'id', 'owner', 'permissions', 'rank', 'topRoleID']);
        if (!text(member['guildID']) || !text(member['id']) || !Array.isArray(member['permissions'])
          || !Number.isSafeInteger(member['rank']) || Number(member['rank']) < 0
          || (member['owner'] !== undefined && typeof member['owner'] !== 'boolean')
          || (member['topRoleID'] !== undefined && !text(member['topRoleID']))) invalid();
        permissionNames(member['permissions']);
      }
    }
    for (const rawMessage of scenario['messages']) {
      const message = object(rawMessage, ['content', 'authorID', 'channelID', 'guildID', 'mentions', 'expect']);
      if (typeof message['content'] !== 'string' || message['content'].length > 100_000
        || (message['authorID'] !== undefined && !text(message['authorID']))
        || (message['channelID'] !== undefined && !text(message['channelID']))
        || (message['guildID'] !== undefined && message['guildID'] !== null && !text(message['guildID']))
        || (message['mentions'] !== undefined && (!strings(message['mentions']) || message['mentions'].some(id => !text(id))))) invalid();
      const expect = object(message['expect'], ['outcome', 'responses', 'errorCodes', 'actions']);
      if (!['ignored', 'success', 'guarded', 'error'].includes(String(expect['outcome']))
        || (expect['responses'] !== undefined && !strings(expect['responses']))
        || (expect['errorCodes'] !== undefined && !strings(expect['errorCodes']))) invalid();
      if (expect['actions'] !== undefined) {
        if (!Array.isArray(expect['actions']) || expect['actions'].length > 100) invalid();
        for (const rawAction of expect['actions']) {
          const action = object(rawAction, ['action', 'targetID']);
          if (!['ban', 'kick', 'timeout', 'unban', 'move', 'mute', 'deafen'].includes(String(action['action'])) || !text(action['targetID'])) invalid();
        }
      }
    }
  }
  return value as ScenarioSuite;
}

export async function runScenarios(input: string): Promise<ScenarioReport> {
  const info = await stat(input);
  if (!info.isFile() || info.size > 5_000_000) throw new YuzuhaError('SCENARIO_LIMIT', 'Cenários devem ser arquivo de até 5000000 bytes.');
  return executeScenarios(parseScenarios(await readFile(input, 'utf8')));
}

/** JSON command bodies are interpreted only by the bounded Yuzuha runtime. */
export async function executeScenarios(suite: ScenarioSuite): Promise<ScenarioReport> {
  const validated = parseScenarios(JSON.stringify(suite)), results: ScenarioResult[] = [];
  for (const scenario of validated.scenarios) {
    const transport = new ScenarioTransport(), store = new MemoryStore(), errors: string[] = [];
    for (const member of scenario.members ?? []) {
      transport.setMember(member.guildID, { id: member.id, owner: member.owner ?? false, rank: member.rank,
        permissions: member.permissions.reduce((bits, name) => bits | permission(name), 0n),
        ...(member.topRoleID === undefined ? {} : { topRoleID: member.topRoleID }) });
    }
    const bot = new Yuzuha({ prefix: scenario.prefix ?? '!', store, transport, resources: mockResources(),
      scheduler: false, http: false, limits: { timeoutMs: 1000, calls: 10_000, output: 100_000 },
      onError: error => { errors.push(error instanceof YuzuhaError ? error.code : 'ERROR'); } });
    const result: ScenarioResult = { name: scenario.name, passed: true, messages: [] };
    try {
      for (const command of scenario.commands) bot.command(command as Command);
      for (const [index, input] of scenario.messages.entries()) {
        const previousMessages = transport.sent.length, previousActions = transport.actions.length, previousErrors = errors.length;
        const outcome = await bot.handle(mockMessage(input.content, {
          ...(input.authorID === undefined ? {} : { authorID: input.authorID }),
          ...(input.channelID === undefined ? {} : { channelID: input.channelID }),
          ...(input.guildID === undefined ? {} : { guildID: input.guildID ?? undefined }),
          ...(input.mentions === undefined ? {} : { mentions: input.mentions }),
        }));
        const responses = transport.sent.slice(previousMessages);
        const errorCodes = errors.slice(previousErrors), actions = transport.actions.slice(previousActions).map(({ action, targetID }) => ({ action, targetID }));
        const mismatches: string[] = [];
        if (outcome !== input.expect.outcome) mismatches.push('outcome');
        for (const [name, actual] of [['responses', responses], ['errorCodes', errorCodes], ['actions', actions]] as const) {
          if (input.expect[name] !== undefined && !isDeepStrictEqual(input.expect[name], actual)) mismatches.push(name);
        }
        result.messages.push({ index, passed: !mismatches.length, outcome, responses, errorCodes, actions, mismatches });
        if (mismatches.length) result.passed = false;
      }
    } finally { await bot.destroy(); }
    results.push(result);
  }
  return { valid: results.every(result => result.passed), offline: true, scenarios: results };
}
