import type { ArgumentDefinition } from './definition.js';
import { parseDuration, userID } from '../domain/values.js';
import { GuardError, YuzuhaError } from '../shared/errors.js';

export type ArgumentValue = string | number | boolean;

function validateValue(definition: ArgumentDefinition, value: ArgumentValue): void {
  if (definition.choices && !definition.choices.some(choice => String(choice) === String(value))) {
    throw new GuardError(`${definition.name}: escolha ${definition.choices.join(', ')}.`);
  }
  const size = typeof value === 'string' ? value.length : value;
  if (typeof size === 'number') {
    if (definition.min !== undefined && size < definition.min) throw new GuardError(`${definition.name}: mínimo ${definition.min}${typeof value === 'string' ? ' caracteres' : ''}.`);
    if (definition.max !== undefined && size > definition.max) throw new GuardError(`${definition.name}: máximo ${definition.max}${typeof value === 'string' ? ' caracteres' : ''}.`);
  }
  for (const validator of definition.validators ?? []) {
    const accepted: unknown = validator.check(value);
    if (typeof accepted !== 'boolean') {
      void Promise.resolve(accepted).catch(() => undefined);
      throw new YuzuhaError('COMMAND_ARGS', `Validador de ${definition.name} deve retornar um booleano síncrono.`);
    }
    if (!accepted) throw new GuardError(validator.message);
  }
}

export function validateArgumentDefinitions(definitions: readonly ArgumentDefinition[], commandName = 'comando'): void {
  const names = new Set<string>();
  for (const [index, definition] of definitions.entries()) {
    if (typeof definition.name !== 'string' || !definition.name || names.has(definition.name)
      || (definition.required !== undefined && typeof definition.required !== 'boolean')
      || (definition.rest !== undefined && typeof definition.rest !== 'boolean')
      || (definition.description !== undefined && typeof definition.description !== 'string')
      || (definition.aliases !== undefined && (!Array.isArray(definition.aliases) || definition.aliases.some(alias => typeof alias !== 'string')))
      || (definition.rest && index !== definitions.length - 1)
      || (definition.type !== undefined && !['string', 'number', 'integer', 'user', 'duration', 'boolean'].includes(definition.type))
      || (definition.choices !== undefined && (!Array.isArray(definition.choices)
        || !definition.choices.length || definition.choices.some(choice => !['string', 'number', 'boolean'].includes(typeof choice))))
      || (definition.min !== undefined && !Number.isFinite(definition.min))
      || (definition.max !== undefined && !Number.isFinite(definition.max))
      || (definition.min !== undefined && definition.max !== undefined && definition.min > definition.max)
      || (definition.type === 'boolean' && (definition.min !== undefined || definition.max !== undefined))
      || (definition.validators !== undefined && (!Array.isArray(definition.validators)
        || definition.validators.some(validator => !validator || typeof validator.check !== 'function' || typeof validator.message !== 'string')))) {
      throw new YuzuhaError('COMMAND_ARGS', `Argumentos inválidos em ${commandName}.`);
    }
    if (definition.defaultValue !== undefined) {
      const value = definition.defaultValue;
      const type = definition.type ?? 'string';
      const invalidType = type === 'boolean' ? typeof value !== 'boolean'
        : ['number', 'integer', 'duration'].includes(type) ? typeof value !== 'number' || !Number.isFinite(value)
          || (type === 'integer' && !Number.isSafeInteger(value))
          || (type === 'duration' && (!Number.isSafeInteger(value) || value <= 0))
        : typeof value !== 'string';
      if (invalidType) throw new YuzuhaError('COMMAND_ARGS', `Valor padrão inválido para ${definition.name} em ${commandName}.`);
      try {
        validateValue(definition, type === 'user' ? userID(String(value)) : value);
      }
      catch (error) {
        if (!(error instanceof GuardError)) throw error;
        throw new YuzuhaError('COMMAND_ARGS', `Valor padrão inválido para ${definition.name}: ${error.message}`);
      }
    }
    names.add(definition.name);
  }
}

function parseValue(definition: ArgumentDefinition, input: string | undefined, required = definition.required): ArgumentValue | undefined {
  if (input === undefined || input.length === 0) {
    if (definition.defaultValue !== undefined) {
      const value = definition.type === 'user' ? userID(String(definition.defaultValue)) : definition.defaultValue;
      validateValue(definition, value);
      return value;
    } else if (required) throw new GuardError(`Informe o argumento ${definition.name}.`);
    return undefined;
  }
  let value: ArgumentValue = input;
  if (definition.type === 'number' || definition.type === 'integer') {
    value = Number(input);
    if (!input.trim() || !Number.isFinite(value) || (definition.type === 'integer' && !Number.isSafeInteger(value))) {
      throw new GuardError(`${definition.name} deve ser um número${definition.type === 'integer' ? ' inteiro' : ''}.`);
    }
  } else if (definition.type === 'boolean') {
    const normalized = input.toLowerCase();
    if (!['true', 'false', 'yes', 'no', 'sim', 'não', 'nao', '1', '0'].includes(normalized)) {
      throw new GuardError(`${definition.name} deve ser true ou false.`);
    }
    value = ['true', 'yes', 'sim', '1'].includes(normalized);
  } else if (definition.type === 'user') value = userID(input);
  else if (definition.type === 'duration') {
    try { value = parseDuration(input); }
    catch (error) {
      if (!(error instanceof YuzuhaError) || error.code !== 'DURATION') throw error;
      throw new GuardError(`${definition.name}: ${error.message}`);
    }
  }
  validateValue(definition, value);
  return value;
}

export function parseArguments(definitions: readonly ArgumentDefinition[], tokens: readonly string[]): Map<string, ArgumentValue> {
  const args = new Map<string, ArgumentValue>();
  for (let index = 0; index < definitions.length; index++) {
    const definition = definitions[index]!;
    const input = definition.rest ? tokens.slice(index).join(' ') : tokens[index];
    const value = parseValue(definition, input);
    if (value !== undefined) args.set(definition.name, value);
  }
  return args;
}

export function tokenize(input: string): string[] {
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
  if (quote) throw new GuardError('Feche as aspas do argumento.');
  if (started) result.push(token);
  return result;
}

export function validateFlagDefinitions(definitions: readonly ArgumentDefinition[], commandName: string): void {
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

export function parseFlags(definitions: readonly ArgumentDefinition[] | undefined, tokens: readonly string[]): {
  tokens: string[]; flags: Map<string, ArgumentValue>;
} {
  if (definitions === undefined) return { tokens: [...tokens], flags: new Map() };
  const lookup = new Map<string, ArgumentDefinition>();
  for (const definition of definitions) for (const name of [definition.name, ...definition.aliases ?? []]) lookup.set(name, definition);
  const values = new Map<string, ArgumentValue>(), positional: string[] = [];
  let terminated = false;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (terminated) { positional.push(token); continue; }
    if (token === '--') { terminated = true; continue; }
    if (!(token.startsWith('--') || /^-[^\d.]/u.test(token)) || token === '-') { positional.push(token); continue; }
    const match = /^--?([^=]+)(?:=([\s\S]*))?$/.exec(token)!;
    const definition = lookup.get(match[1]!);
    if (!definition) throw new GuardError(`Flag desconhecida: ${token.split('=')[0]}.`);
    if (values.has(definition.name)) throw new GuardError(`Flag repetida: --${definition.name}.`);
    let input = match[2];
    if (input === undefined) {
      if (definition.type === 'boolean') input = 'true';
      else {
        input = tokens[index + 1];
        if (input === undefined || input.startsWith('--') || /^-[^\d.]/u.test(input)) throw new GuardError(`Informe o valor de --${definition.name}.`);
        index++;
      }
    }
    const value = parseValue(definition, input, true);
    if (value !== undefined) values.set(definition.name, value);
  }
  for (const definition of definitions) {
    if (values.has(definition.name)) continue;
    const value = parseValue(definition, undefined);
    if (value !== undefined) values.set(definition.name, value);
  }
  return { tokens: positional, flags: values };
}
