import type { CommandContext } from './context.js';
import type { ArgumentDefinition } from './definition.js';
import { defaultTranslator } from '../domain/i18n.js';
import type { MessageTranslator } from '../domain/i18n.js';
import {
  DEFAULT_URL_PROTOCOLS,
  channelID,
  normalizeUrlProtocols,
  parseArgumentUrl,
  parseDuration,
  roleID,
  userID,
} from '../domain/values.js';
import type { ModerationMember } from '../domain/moderation.js';
import type { MemberInfo } from '../ports/resources/users.js';
import { GuardError, YuzuhaError } from '../shared/errors.js';

export type ArgumentValue = unknown;

export interface CustomArgumentType<T = unknown> {
  parse(raw: string, ctx: CommandContext): T | Promise<T>;
  description?: string;
}

export type ArgumentTypeRegistry = ReadonlyMap<string, CustomArgumentType<unknown>>;

export interface ParseArgumentsOptions {
  ctx?: CommandContext;
  argumentTypes?: ArgumentTypeRegistry;
  translator?: MessageTranslator;
}

export interface ParseFlagsOptions extends ParseArgumentsOptions {
  lookup?: ReadonlyMap<string, ArgumentDefinition>;
}

export const BUILTIN_ARGUMENT_TYPES: ReadonlySet<string> = new Set([
  'string',
  'number',
  'integer',
  'user',
  'duration',
  'boolean',
  'channel',
  'role',
  'member',
  'url',
  'enum',
]);

export function assertCustomArgumentTypeName(name: string): string {
  if (typeof name !== 'string' || !name.trim() || /\s/u.test(name)) {
    throw new YuzuhaError('ARGUMENT_TYPE', 'Informe um nome válido para o tipo de argumento.');
  }
  if (BUILTIN_ARGUMENT_TYPES.has(name)) {
    throw new YuzuhaError('ARGUMENT_TYPE', `O tipo de argumento ${name} colide com um tipo nativo.`);
  }
  return name;
}

export function hasAsyncArguments(definitions: readonly ArgumentDefinition[] | undefined): boolean {
  return Boolean(definitions?.some(definition => definition.type === 'custom' || definition.type === 'member'));
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return (typeof value === 'object' || typeof value === 'function')
    && value !== null
    && typeof (value as PromiseLike<T>).then === 'function';
}

function formatChoices(choices: readonly ArgumentValue[]): (string | number | boolean)[] {
  return choices.map(choice =>
    typeof choice === 'number' || typeof choice === 'boolean' ? choice : String(choice),
  );
}

function matchesChoice(type: ArgumentDefinition['type'], choice: ArgumentValue, value: ArgumentValue): boolean {
  if (type === 'enum') return typeof choice === 'string' && typeof value === 'string' && choice === value;
  if (choice instanceof URL && value instanceof URL) return choice.href === value.href;
  if (type === 'custom' || type === 'member' || type === 'url') {
    return Object.is(choice, value)
      || (['string', 'number', 'boolean'].includes(typeof choice)
        && ['string', 'number', 'boolean'].includes(typeof value)
        && String(choice) === String(value));
  }
  return String(choice) === String(value);
}

function validateValue(definition: ArgumentDefinition, value: ArgumentValue, t: MessageTranslator = defaultTranslator): void {
  if (definition.choices) {
    const matched = definition.choices.some(choice => matchesChoice(definition.type, choice, value));
    if (!matched) {
      throw new GuardError(t('argChoices', definition.name, formatChoices(definition.choices)), 'INVALID_ARGUMENT');
    }
  }
  const size = typeof value === 'string' ? value.length : value;
  if (typeof size === 'number') {
    if (definition.min !== undefined && size < definition.min) {
      throw new GuardError(
        typeof value === 'string'
          ? t('argMinLength', definition.name, definition.min)
          : t('argMin', definition.name, definition.min),
        'INVALID_ARGUMENT',
      );
    }
    if (definition.max !== undefined && size > definition.max) {
      throw new GuardError(
        typeof value === 'string'
          ? t('argMaxLength', definition.name, definition.max)
          : t('argMax', definition.name, definition.max),
        'INVALID_ARGUMENT',
      );
    }
  }
  for (const validator of definition.validators ?? []) {
    const accepted: unknown = validator.check(value);
    if (typeof accepted !== 'boolean') {
      void Promise.resolve(accepted).catch(() => undefined);
      throw new YuzuhaError('COMMAND_ARGS', `Validador de ${definition.name} deve retornar um booleano síncrono.`);
    }
    if (!accepted) throw new GuardError(validator.message, 'INVALID_ARGUMENT');
  }
}

function isValidChoicesForType(type: ArgumentDefinition['type'], choices: readonly ArgumentValue[]): boolean {
  if (type === 'custom') return true;
  if (type === 'enum') return choices.every(choice => typeof choice === 'string' && choice.length > 0);
  if (type === 'url') return choices.every(choice => choice instanceof URL);
  if (type === 'member') return choices.every(choice => Boolean(choice) && typeof choice === 'object' && !Array.isArray(choice));
  return choices.every(choice => ['string', 'number', 'boolean'].includes(typeof choice));
}

export function validateArgumentDefinitions(definitions: readonly ArgumentDefinition[], commandName = 'comando'): void {
  const names = new Set<string>();
  if (definitions.filter(definition => definition.anywhere).length > 1) {
    throw new YuzuhaError('COMMAND_ARGS', `No máximo um argumento anywhere em ${commandName}.`);
  }
  for (const [index, definition] of definitions.entries()) {
    const isCustom = definition.type === 'custom';
    const validType = definition.type === undefined
      || BUILTIN_ARGUMENT_TYPES.has(definition.type)
      || (isCustom
        && typeof definition.customType === 'string'
        && Boolean(definition.customType.trim())
        && !/\s/u.test(definition.customType)
        && !BUILTIN_ARGUMENT_TYPES.has(definition.customType));
    if (typeof definition.name !== 'string' || !definition.name || names.has(definition.name)
      || (definition.required !== undefined && typeof definition.required !== 'boolean')
      || (definition.rest !== undefined && typeof definition.rest !== 'boolean')
      || (definition.anywhere !== undefined && (typeof definition.anywhere !== 'boolean' || definition.type !== 'user' || definition.rest === true))
      || (definition.description !== undefined && typeof definition.description !== 'string')
      || (definition.aliases !== undefined && (!Array.isArray(definition.aliases) || definition.aliases.some(alias => typeof alias !== 'string')))
      || (definition.rest && index !== definitions.length - 1)
      || (!isCustom && definition.customType !== undefined)
      || (definition.protocols !== undefined && definition.type !== 'url')
      || !validType
      || (definition.type === 'enum' && (!Array.isArray(definition.choices) || !definition.choices.length))
      || (definition.choices !== undefined && (!Array.isArray(definition.choices)
        || !definition.choices.length
        || !isValidChoicesForType(definition.type, definition.choices)))
      || (definition.min !== undefined && !Number.isFinite(definition.min))
      || (definition.max !== undefined && !Number.isFinite(definition.max))
      || (definition.min !== undefined && definition.max !== undefined && definition.min > definition.max)
      || (definition.type === 'boolean' && (definition.min !== undefined || definition.max !== undefined))
      || (definition.validators !== undefined && (!Array.isArray(definition.validators)
        || definition.validators.some(validator => !validator || typeof validator.check !== 'function' || typeof validator.message !== 'string')))) {
      throw new YuzuhaError('COMMAND_ARGS', `Argumentos inválidos em ${commandName}.`);
    }
    const urlProtocols = definition.protocols !== undefined
      ? normalizeUrlProtocols(definition.protocols, 'COMMAND_ARGS')
      : DEFAULT_URL_PROTOCOLS;
    if (definition.defaultValue !== undefined) {
      const value = definition.defaultValue;
      const type = definition.type ?? 'string';
      const invalidType = isCustom ? false
        : type === 'boolean' ? typeof value !== 'boolean'
        : ['number', 'integer', 'duration'].includes(type) ? typeof value !== 'number' || !Number.isFinite(value)
          || (type === 'integer' && !Number.isSafeInteger(value))
          || (type === 'duration' && (!Number.isSafeInteger(value) || value <= 0))
        : type === 'url' ? !(value instanceof URL || typeof value === 'string')
        : type === 'member' ? !value || typeof value !== 'object' || Array.isArray(value) || typeof (value as { id?: unknown }).id !== 'string'
        : typeof value !== 'string';
      if (invalidType) throw new YuzuhaError('COMMAND_ARGS', `Valor padrão inválido para ${definition.name} em ${commandName}.`);
      try {
        const normalizedDefault = type === 'user' ? userID(String(value))
          : type === 'channel' ? channelID(String(value))
          : type === 'role' ? roleID(String(value))
          : type === 'url' ? parseArgumentUrl(value instanceof URL ? value.href : String(value), urlProtocols, definition.name)
          : value;
        validateValue(definition, normalizedDefault);
      }
      catch (error) {
        if (!(error instanceof GuardError)) throw error;
        throw new YuzuhaError('COMMAND_ARGS', `Valor padrão inválido para ${definition.name}: ${error.message}`);
      }
    }
    names.add(definition.name);
  }
}

function resolveRegisteredCustomType(
  definition: ArgumentDefinition,
  options?: ParseArgumentsOptions,
): CustomArgumentType<unknown> {
  const typeName = definition.customType ?? '';
  const registered = options?.argumentTypes?.get(typeName);
  if (!registered) {
    throw new YuzuhaError('ARGUMENT_TYPE', `Tipo de argumento não registrado: ${typeName}.`);
  }
  return registered;
}

function ensureCustomTypesRegistered(
  definitions: readonly ArgumentDefinition[],
  options?: ParseArgumentsOptions,
): void {
  for (const definition of definitions) {
    if (definition.type === 'custom') resolveRegisteredCustomType(definition, options);
  }
}

function isAbsentMemberError(error: unknown): boolean {
  const candidate = error as { code?: number | string; status?: number; reason?: string } | null | undefined;
  if (candidate instanceof GuardError && candidate.reason === 'MEMBER_NOT_FOUND') return true;
  if (candidate?.status === 404 || candidate?.code === 10007 || candidate?.code === 10013
    || candidate?.code === 'NOT_FOUND' || candidate?.code === 'MEMBER_NOT_FOUND') {
    return true;
  }
  return false;
}

function adaptTransportMember(member: ModerationMember, ctx: CommandContext): MemberInfo {
  const fallbackName = member.id === ctx.authorID && ctx.authorName ? ctx.authorName : member.id;
  return {
    id: member.id,
    username: fallbackName,
    displayName: fallbackName,
    bot: member.id === ctx.transport.botID,
    avatarURL: null,
    bannerURL: null,
    createdTimestamp: 0,
    nickname: null,
    joinedTimestamp: 0,
    roles: member.topRoleID ? [member.topRoleID] : [],
    permissions: member.permissions.toString(),
    timedOutUntil: null,
  };
}

async function resolveMemberArgument(
  input: string,
  ctx: CommandContext,
  t: MessageTranslator = ctx.t,
): Promise<MemberInfo> {
  const guildID = ctx.requireGuild();
  const targetID = userID(input, t);
  if (ctx.hasInjectedResources) {
    try {
      const resolved = await ctx.resources.users.member(guildID, targetID);
      if (!resolved) throw new GuardError(t('argMemberNotFound'), 'INVALID_ARGUMENT');
      return resolved;
    } catch (error) {
      if (error instanceof GuardError && error.reason === 'INVALID_ARGUMENT') throw error;
      if (isAbsentMemberError(error)) {
        throw new GuardError(t('argMemberNotFound'), 'INVALID_ARGUMENT');
      }
      if (!(error instanceof YuzuhaError && error.code === 'NATIVE_UNAVAILABLE')) {
        throw error;
      }
    }
  }
  try {
    const member = await ctx.transport.member(guildID, targetID);
    return adaptTransportMember(member, ctx);
  } catch (error) {
    if (isAbsentMemberError(error)) {
      throw new GuardError(t('argMemberNotFound'), 'INVALID_ARGUMENT');
    }
    throw error;
  }
}

function parseBuiltinValue(
  definition: ArgumentDefinition,
  input: string,
  t: MessageTranslator = defaultTranslator,
): ArgumentValue {
  let value: ArgumentValue = input;
  if (definition.type === 'number' || definition.type === 'integer') {
    value = Number(input);
    if (!input.trim() || !Number.isFinite(value) || (definition.type === 'integer' && !Number.isSafeInteger(value))) {
      throw new GuardError(
        definition.type === 'integer' ? t('argInteger', definition.name) : t('argNumber', definition.name),
        'INVALID_ARGUMENT',
      );
    }
  } else if (definition.type === 'boolean') {
    const normalized = input.toLowerCase();
    if (!['true', 'false', 'yes', 'no', 'sim', 'não', 'nao', '1', '0'].includes(normalized)) {
      throw new GuardError(t('argBoolean', definition.name), 'INVALID_ARGUMENT');
    }
    value = ['true', 'yes', 'sim', '1'].includes(normalized);
  } else if (definition.type === 'user') value = userID(input, t);
  else if (definition.type === 'channel') value = channelID(input, t);
  else if (definition.type === 'role') value = roleID(input, t);
  else if (definition.type === 'url') {
    const protocols = definition.protocols
      ? normalizeUrlProtocols(definition.protocols, 'COMMAND_ARGS')
      : DEFAULT_URL_PROTOCOLS;
    value = parseArgumentUrl(input, protocols, definition.name, t);
  } else if (definition.type === 'duration') {
    try { value = parseDuration(input); }
    catch (error) {
      if (!(error instanceof YuzuhaError) || error.code !== 'DURATION') throw error;
      throw new GuardError(t('argDuration', definition.name), 'INVALID_ARGUMENT');
    }
  }
  return value;
}

function resolveMissingValue(
  definition: ArgumentDefinition,
  required = definition.required,
  t: MessageTranslator = defaultTranslator,
): ArgumentValue | undefined {
  if (definition.defaultValue !== undefined) {
    const raw = definition.defaultValue;
    const type = definition.type ?? 'string';
    const value = type === 'user' ? userID(String(raw), t)
      : type === 'channel' ? channelID(String(raw), t)
      : type === 'role' ? roleID(String(raw), t)
      : type === 'url' ? (raw instanceof URL
        ? parseArgumentUrl(raw.href, definition.protocols ? normalizeUrlProtocols(definition.protocols, 'COMMAND_ARGS') : DEFAULT_URL_PROTOCOLS, definition.name, t)
        : parseArgumentUrl(String(raw), definition.protocols ? normalizeUrlProtocols(definition.protocols, 'COMMAND_ARGS') : DEFAULT_URL_PROTOCOLS, definition.name, t))
      : raw;
    validateValue(definition, value, t);
    return value;
  }
  if (required) throw new GuardError(t('argRequired', definition.name), 'INVALID_ARGUMENT');
  return undefined;
}

function normalizeParseOptions(
  optionsOrTranslator?: ParseArgumentsOptions | MessageTranslator,
): ParseArgumentsOptions & { t: MessageTranslator } {
  if (typeof optionsOrTranslator === 'function') {
    return { t: optionsOrTranslator };
  }
  const options = optionsOrTranslator ?? {};
  return {
    ...options,
    t: options.translator ?? options.ctx?.t ?? defaultTranslator,
  };
}

function parseValue(
  definition: ArgumentDefinition,
  input: string | undefined,
  required = definition.required,
  options?: ParseArgumentsOptions & { t?: MessageTranslator },
): ArgumentValue | undefined {
  const t = options?.t ?? options?.translator ?? options?.ctx?.t ?? defaultTranslator;
  if (input === undefined || input.length === 0) return resolveMissingValue(definition, required, t);
  let value: ArgumentValue;
  if (definition.type === 'custom') {
    const custom = resolveRegisteredCustomType(definition, options);
    if (!options?.ctx) {
      throw new YuzuhaError('ARGUMENT_TYPE', `O tipo de argumento ${definition.customType} requer contexto de comando.`);
    }
    const parsed = custom.parse(input, options.ctx);
    if (isPromiseLike(parsed)) {
      void Promise.resolve(parsed).catch(() => undefined);
      throw new YuzuhaError('ARGUMENT_TYPE', `O tipo de argumento ${definition.customType} é assíncrono; use parseArgumentsAsync ou parseFlagsAsync.`);
    }
    value = parsed;
  } else if (definition.type === 'member') {
    throw new YuzuhaError('ARGUMENT_TYPE', `O argumento ${definition.name} (member) é assíncrono; use parseArgumentsAsync ou parseFlagsAsync.`);
  } else {
    value = parseBuiltinValue(definition, input, t);
  }
  validateValue(definition, value, t);
  return value;
}

async function parseValueAsync(
  definition: ArgumentDefinition,
  input: string | undefined,
  required = definition.required,
  options?: ParseArgumentsOptions & { t?: MessageTranslator },
): Promise<ArgumentValue | undefined> {
  const t = options?.t ?? options?.translator ?? options?.ctx?.t ?? defaultTranslator;
  if (input === undefined || input.length === 0) return resolveMissingValue(definition, required, t);
  let value: ArgumentValue;
  if (definition.type === 'custom') {
    const custom = resolveRegisteredCustomType(definition, options);
    if (!options?.ctx) {
      throw new YuzuhaError('ARGUMENT_TYPE', `O tipo de argumento ${definition.customType} requer contexto de comando.`);
    }
    value = await custom.parse(input, options.ctx);
  } else if (definition.type === 'member') {
    if (!options?.ctx) {
      throw new YuzuhaError('ARGUMENT_TYPE', `O argumento ${definition.name} (member) requer contexto de comando.`);
    }
    value = await resolveMemberArgument(input, options.ctx, t);
  } else {
    value = parseBuiltinValue(definition, input, t);
  }
  validateValue(definition, value, t);
  return value;
}

function preparePositionalTokens(
  definitions: readonly ArgumentDefinition[],
  tokens: readonly string[],
): { positional: string[]; matched: Map<string, string> } {
  const positional = [...tokens];
  const matched = new Map<string, string>();
  for (const definition of definitions) {
    if (!definition.anywhere) continue;
    let index = positional.findIndex(token => /^<@!?\d+>$/.test(token));
    if (index < 0) {
      for (let candidate = positional.length - 1; candidate >= 0; candidate--) {
        if (/^\d{17,20}$/.test(positional[candidate]!)) { index = candidate; break; }
      }
    }
    if (index >= 0) matched.set(definition.name, positional.splice(index, 1)[0]!);
  }
  return { positional, matched };
}

export function parseArguments(
  definitions: readonly ArgumentDefinition[],
  tokens: readonly string[],
  optionsOrTranslator?: ParseArgumentsOptions | MessageTranslator,
): Map<string, ArgumentValue> {
  const options = normalizeParseOptions(optionsOrTranslator);
  ensureCustomTypesRegistered(definitions, options);
  const args = new Map<string, ArgumentValue>();
  const { positional, matched } = preparePositionalTokens(definitions, tokens);
  let position = 0;
  for (let index = 0; index < definitions.length; index++) {
    const definition = definitions[index]!;
    const input = definition.rest ? positional.slice(position).join(' ')
      : definition.anywhere ? matched.get(definition.name)
      : positional[position++];
    const value = parseValue(definition, input, definition.required, options);
    if (value !== undefined) args.set(definition.name, value);
  }
  return args;
}

export async function parseArgumentsAsync(
  definitions: readonly ArgumentDefinition[],
  tokens: readonly string[],
  optionsOrTranslator?: ParseArgumentsOptions | MessageTranslator,
): Promise<Map<string, ArgumentValue>> {
  const options = normalizeParseOptions(optionsOrTranslator);
  ensureCustomTypesRegistered(definitions, options);
  const args = new Map<string, ArgumentValue>();
  const { positional, matched } = preparePositionalTokens(definitions, tokens);
  let position = 0;
  for (let index = 0; index < definitions.length; index++) {
    const definition = definitions[index]!;
    const input = definition.rest ? positional.slice(position).join(' ')
      : definition.anywhere ? matched.get(definition.name)
      : positional[position++];
    const value = await parseValueAsync(definition, input, definition.required, options);
    if (value !== undefined) args.set(definition.name, value);
  }
  return args;
}

export function tokenize(input: string, t: MessageTranslator = defaultTranslator): string[] {
  if (!/[\\"']/.test(input)) return input.match(/\S+/g) ?? [];
  const result: string[] = [];
  let token = '', quote = '', last = '', started = false;
  for (let index = 0; index < input.length; index++) {
    const character = input[index]!;
    if (character === '\\' && index + 1 < input.length) { last = input[++index]!; token += last; started = true; }
    else if (quote && character === quote) quote = '';
    else if (!quote && (!started || last === '=') && (character === '"' || character === "'")) { quote = character; started = true; }
    else if (!quote && /\s/.test(character)) {
      if (started) result.push(token);
      token = ''; last = ''; started = false;
    } else { token += character; last = character; started = true; }
  }
  if (quote) throw new GuardError(t('quoteUnclosed'), 'INVALID_ARGUMENT');
  if (started) result.push(token);
  return result;
}

export function validateFlagDefinitions(definitions: readonly ArgumentDefinition[], commandName: string): void {
  if (definitions.some(definition => definition.anywhere)) {
    throw new YuzuhaError('ARGUMENT_SCHEMA', `.anywhere() só vale para argumentos posicionais de user em ${commandName}.`);
  }
  validateArgumentDefinitions(definitions, commandName);
  const names = new Set<string>();
  for (const definition of definitions) {
    if (definition.rest) throw new YuzuhaError('COMMAND_FLAGS', `Flag ${definition.name} não aceita rest().`);
    for (const name of [definition.name, ...definition.aliases ?? []]) {
      if (!/^[\p{L}][\p{L}\p{N}_-]*$/u.test(name) || names.has(name)) {
        throw new YuzuhaError('COMMAND_FLAGS', `Nome ou alias de flag inválido ou duplicado em ${commandName}: ${name}.`);
      }
      names.add(name);
    }
  }
}

export function compileFlagLookup(definitions: readonly ArgumentDefinition[] | undefined): ReadonlyMap<string, ArgumentDefinition> | undefined {
  if (definitions === undefined) return undefined;
  const lookup = new Map<string, ArgumentDefinition>();
  for (const definition of definitions) {
    for (const name of [definition.name, ...definition.aliases ?? []]) lookup.set(name, definition);
  }
  return lookup;
}

function normalizeFlagOptions(
  lookupOrOptions?: ReadonlyMap<string, ArgumentDefinition> | ParseFlagsOptions,
  translator?: MessageTranslator,
): ParseFlagsOptions & { t: MessageTranslator } {
  if (!lookupOrOptions) return { t: translator ?? defaultTranslator };
  if (lookupOrOptions instanceof Map || typeof (lookupOrOptions as ReadonlyMap<string, ArgumentDefinition>).get === 'function') {
    return { lookup: lookupOrOptions as ReadonlyMap<string, ArgumentDefinition>, t: translator ?? defaultTranslator };
  }
  const options = lookupOrOptions as ParseFlagsOptions;
  return {
    ...options,
    t: translator ?? options.translator ?? options.ctx?.t ?? defaultTranslator,
  };
}

function extractFlagTokens(
  definitions: readonly ArgumentDefinition[],
  tokens: readonly string[],
  lookup: ReadonlyMap<string, ArgumentDefinition> | undefined,
  t: MessageTranslator = defaultTranslator,
): { positional: string[]; entries: { definition: ArgumentDefinition; input: string }[]; seen: Set<string> } {
  const resolvedLookup = lookup ?? compileFlagLookup(definitions)!;
  const positional: string[] = [];
  const entries: { definition: ArgumentDefinition; input: string }[] = [];
  const seen = new Set<string>();
  let terminated = false;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (terminated) { positional.push(token); continue; }
    if (token === '--') { terminated = true; continue; }
    if (!(token.startsWith('--') || /^-[^\d.]/u.test(token)) || token === '-') { positional.push(token); continue; }
    const match = /^--?([^=]+)(?:=([\s\S]*))?$/.exec(token);
    const definition = match && resolvedLookup.get(match[1]!);
    if (!match || !definition) throw new GuardError(t('flagUnknown', token.split('=')[0]!), 'INVALID_ARGUMENT');
    if (seen.has(definition.name)) throw new GuardError(t('flagDuplicate', definition.name), 'INVALID_ARGUMENT');
    let input = match[2];
    if (input === undefined) {
      if (definition.type === 'boolean') input = 'true';
      else {
        input = tokens[index + 1];
        if (input === undefined || input.startsWith('--') || /^-[^\d.]/u.test(input)) {
          throw new GuardError(t('flagValueRequired', definition.name), 'INVALID_ARGUMENT');
        }
        index++;
      }
    }
    seen.add(definition.name);
    entries.push({ definition, input });
  }
  return { positional, entries, seen };
}

export function parseFlags(
  definitions: readonly ArgumentDefinition[] | undefined,
  tokens: readonly string[],
  lookupOrOptions?: ReadonlyMap<string, ArgumentDefinition> | ParseFlagsOptions,
  translator?: MessageTranslator,
): {
  tokens: string[]; flags: Map<string, ArgumentValue>;
} {
  if (definitions === undefined) return { tokens: [...tokens], flags: new Map() };
  const options = normalizeFlagOptions(lookupOrOptions, translator);
  ensureCustomTypesRegistered(definitions, options);
  const { positional, entries, seen } = extractFlagTokens(definitions, tokens, options.lookup, options.t);
  const values = new Map<string, ArgumentValue>();
  for (const entry of entries) {
    const value = parseValue(entry.definition, entry.input, true, options);
    if (value !== undefined) values.set(entry.definition.name, value);
  }
  for (const definition of definitions) {
    if (seen.has(definition.name)) continue;
    const value = parseValue(definition, undefined, definition.required, options);
    if (value !== undefined) values.set(definition.name, value);
  }
  return { tokens: positional, flags: values };
}

export async function parseFlagsAsync(
  definitions: readonly ArgumentDefinition[] | undefined,
  tokens: readonly string[],
  lookupOrOptions?: ReadonlyMap<string, ArgumentDefinition> | ParseFlagsOptions,
  translator?: MessageTranslator,
): Promise<{
  tokens: string[]; flags: Map<string, ArgumentValue>;
}> {
  if (definitions === undefined) return { tokens: [...tokens], flags: new Map() };
  const options = normalizeFlagOptions(lookupOrOptions, translator);
  ensureCustomTypesRegistered(definitions, options);
  const { positional, entries, seen } = extractFlagTokens(definitions, tokens, options.lookup, options.t);
  const values = new Map<string, ArgumentValue>();
  for (const entry of entries) {
    const value = await parseValueAsync(entry.definition, entry.input, true, options);
    if (value !== undefined) values.set(entry.definition.name, value);
  }
  for (const definition of definitions) {
    if (seen.has(definition.name)) continue;
    const value = await parseValueAsync(definition, undefined, definition.required, options);
    if (value !== undefined) values.set(definition.name, value);
  }
  return { tokens: positional, flags: values };
}
