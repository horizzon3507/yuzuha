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

export function parseArguments(definitions: readonly ArgumentDefinition[], tokens: readonly string[]): Map<string, ArgumentValue> {
  const args = new Map<string, ArgumentValue>();
  for (const [index, definition] of definitions.entries()) {
    const input = definition.rest ? tokens.slice(index).join(' ') : tokens[index];
    if (input === undefined || input.length === 0) {
      if (definition.defaultValue !== undefined) {
        const value = definition.type === 'user' ? userID(String(definition.defaultValue)) : definition.defaultValue;
        validateValue(definition, value);
        args.set(definition.name, value);
      } else if (definition.required) throw new GuardError(`Informe o argumento ${definition.name}.`);
      continue;
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
    args.set(definition.name, value);
  }
  return args;
}

export function tokenize(input: string): string[] {
  const result: string[] = [];
  let token = '', quote = '', started = false;
  for (let index = 0; index < input.length; index++) {
    const character = input[index]!;
    if (character === '\\' && index + 1 < input.length) { token += input[++index]; started = true; }
    else if (quote && character === quote) quote = '';
    else if (!quote && !started && (character === '"' || character === "'")) { quote = character; started = true; }
    else if (!quote && /\s/.test(character)) {
      if (started) result.push(token);
      token = ''; started = false;
    } else { token += character; started = true; }
  }
  if (quote) throw new GuardError('Feche as aspas do argumento.');
  if (started) result.push(token);
  return result;
}
