import { ConfigError } from '../shared/errors.js';

export const DEFAULT_LOCALE = 'pt-BR';

export interface MessageCatalog {
  quoteUnclosed(): string;
  argRequired(name: string): string;
  argType(name: string, type: 'string' | 'number' | 'boolean'): string;
  argNumber(name: string): string;
  argInteger(name: string): string;
  argBoolean(name: string): string;
  argUser(): string;
  argDuration(name: string): string;
  argChoices(name: string, choices: readonly (string | number | boolean)[]): string;
  argMin(name: string, min: number): string;
  argMax(name: string, max: number): string;
  argMinLength(name: string, min: number): string;
  argMaxLength(name: string, max: number): string;
  flagUnknown(flag: string): string;
  flagDuplicate(name: string): string;
  flagValueRequired(name: string): string;
  usageSubcommand(): string;
  usageLine(usage: string): string;
  helpAliases(aliases: readonly string[]): string;
  helpRequired(): string;
  helpOptional(): string;
  helpChoices(choices: readonly (string | number | boolean)[]): string;
  helpDefault(value: string): string;
  helpMin(min: number): string;
  helpMax(max: number): string;
  helpArgumentsHeader(): string;
  helpFlagsHeader(): string;
  helpSubcommandsHeader(): string;
  helpExamplesHeader(): string;
  purgeInvalidCount(): string;
  invalidTtlMs(): string;
  eventMessageUnavailable(): string;
  eventChannelRequired(): string;
  unknownCommand(name: string, prefix?: string): string;
  unknownSubcommand(): string;
  notInGuild(): string;
  noAuthor(): string;
  permissionMissingAuthor(permission: string): string;
  permissionMissingBot(permission: string): string;
  guildDepartureOwnerOnly(): string;
  guildDepartureBotIsOwner(): string;
  cooldown(remaining: string, remainingMs?: number): string;
  checkFailed(): string;
  moderationSelfTarget(): string;
  moderationBotTarget(): string;
  moderationOwnerTarget(): string;
  moderationHierarchy(): string;
  moderationAdminImmune(): string;
  moderationReasonRequired(): string;
  moderationReasonTooLong(): string;
  moderationTimeoutDuration(): string;
  moderationDurationInvalid(): string;
  moderationDeleteDaysInvalid(): string;
  moderationVoiceChannelInvalid(): string;
  moderationVoiceStateInvalid(): string;
  moderationPartial(action: string, targetID?: string): string;
  userErrorAfterCase(caseID: number): string;
  userErrorGeneric(): string;
}

export type MessageKey = keyof MessageCatalog;

export type MessageOverrides = {
  readonly [K in MessageKey]?: MessageCatalog[K] | string;
};

export interface LocaleMessagesConfig {
  readonly defaultLocale?: string;
  readonly locales?: Readonly<Record<string, Partial<MessageCatalog> | MessageOverrides>>;
}

export type MessagesConfig = Partial<MessageCatalog> | MessageOverrides | LocaleMessagesConfig;

export type MessageTranslator = <K extends MessageKey>(
  key: K,
  ...args: Parameters<MessageCatalog[K]>
) => string;

const DEFAULT_CATALOG: MessageCatalog = {
  quoteUnclosed: () => 'Feche as aspas do argumento.',
  argRequired: name => `Informe o argumento ${name}.`,
  argType: (name, type) => `O argumento ${name} deve ser ${type}.`,
  argNumber: name => `${name} deve ser um número.`,
  argInteger: name => `${name} deve ser um número inteiro.`,
  argBoolean: name => `${name} deve ser true ou false.`,
  argUser: () => 'Mencione um usuário ou informe um ID válido.',
  argDuration: name => `${name}: Duração inválida. Use 500ms, 5s, 10m, 2h ou 1d.`,
  argChoices: (name, choices) => `${name}: escolha ${choices.join(', ')}.`,
  argMin: (name, min) => `${name}: mínimo ${min}.`,
  argMax: (name, max) => `${name}: máximo ${max}.`,
  argMinLength: (name, min) => `${name}: mínimo ${min} caracteres.`,
  argMaxLength: (name, max) => `${name}: máximo ${max} caracteres.`,
  flagUnknown: flag => `Flag desconhecida: ${flag}.`,
  flagDuplicate: name => `Flag repetida: --${name}.`,
  flagValueRequired: name => `Informe o valor de --${name}.`,
  usageSubcommand: () => '<subcomando>',
  usageLine: usage => `Uso: ${usage}`,
  helpAliases: aliases => `Aliases: ${aliases.join(', ')}`,
  helpRequired: () => 'obrigatório',
  helpOptional: () => 'opcional',
  helpChoices: choices => `escolhas: ${choices.join(', ')}`,
  helpDefault: value => `padrão: ${value}`,
  helpMin: min => `mínimo: ${min}`,
  helpMax: max => `máximo: ${max}`,
  helpArgumentsHeader: () => 'Argumentos:',
  helpFlagsHeader: () => 'Flags:',
  helpSubcommandsHeader: () => 'Subcomandos:',
  helpExamplesHeader: () => 'Exemplos:',
  purgeInvalidCount: () => 'Informe uma quantidade inteira entre 1 e 1000.',
  invalidTtlMs: () => 'ttlMs deve ser um inteiro entre 1000 e 86400000.',
  eventMessageUnavailable: () => 'Este evento não fornece uma mensagem completa. Use os campos de evento e um canal explícito.',
  eventChannelRequired: () => 'Defina um canal para a saída deste evento.',
  unknownCommand: (name, prefix = '') => `Comando desconhecido: ${prefix}${name}.`,
  unknownSubcommand: () => 'Subcomando desconhecido.',
  notInGuild: () => 'Este comando só funciona em servidores.',
  noAuthor: () => 'Esta operação exige um autor identificado.',
  permissionMissingAuthor: permission => `Você precisa da permissão ${permission}.`,
  permissionMissingBot: permission => `Preciso da permissão ${permission}.`,
  guildDepartureOwnerOnly: () => 'Somente o dono do servidor pode remover o bot por este comando.',
  guildDepartureBotIsOwner: () => 'O bot não pode sair de um servidor do qual é dono.',
  cooldown: remaining => `Aguarde ${remaining} antes de usar novamente.`,
  checkFailed: () => 'Você não pode executar este comando.',
  moderationSelfTarget: () => 'Você não pode moderar a si mesmo.',
  moderationBotTarget: () => 'Você não pode moderar este bot.',
  moderationOwnerTarget: () => 'Não é possível moderar esse membro. Confira a hierarquia de cargos.',
  moderationHierarchy: () => 'Não é possível moderar esse membro. Confira a hierarquia de cargos.',
  moderationAdminImmune: () => 'Não é possível silenciar um administrador.',
  moderationReasonRequired: () => 'Informe o motivo.',
  moderationReasonTooLong: () => 'O motivo deve ter até 512 caracteres.',
  moderationTimeoutDuration: () => 'Informe uma duração de até 28 dias.',
  moderationDurationInvalid: () => 'Informe uma duração válida em milissegundos inteiros.',
  moderationDeleteDaysInvalid: () => 'O histórico a remover deve ser de 0 a 7 dias.',
  moderationVoiceChannelInvalid: () => 'Informe o ID do canal de voz ou null para desconectar.',
  moderationVoiceStateInvalid: () => 'Informe true ou false para o estado de voz.',
  moderationPartial: action => `A ação ${action} foi realizada, mas o caso não foi salvo. Não repita a ação.`,
  userErrorAfterCase: caseID => `A ação foi realizada e registrada no caso #${caseID}, mas o comando não terminou.`,
  userErrorGeneric: () => 'Não foi possível concluir o comando.',
};

export const DEFAULT_MESSAGES: Readonly<MessageCatalog> = Object.freeze(DEFAULT_CATALOG);

const PARAMETER_NAMES: Readonly<Record<MessageKey, readonly string[]>> = {
  quoteUnclosed: [],
  argRequired: ['name'],
  argType: ['name', 'type'],
  argNumber: ['name'],
  argInteger: ['name'],
  argBoolean: ['name'],
  argUser: [],
  argDuration: ['name'],
  argChoices: ['name', 'choices'],
  argMin: ['name', 'min'],
  argMax: ['name', 'max'],
  argMinLength: ['name', 'min'],
  argMaxLength: ['name', 'max'],
  flagUnknown: ['flag'],
  flagDuplicate: ['name'],
  flagValueRequired: ['name'],
  usageSubcommand: [],
  usageLine: ['usage'],
  helpAliases: ['aliases'],
  helpRequired: [],
  helpOptional: [],
  helpChoices: ['choices'],
  helpDefault: ['value'],
  helpMin: ['min'],
  helpMax: ['max'],
  helpArgumentsHeader: [],
  helpFlagsHeader: [],
  helpSubcommandsHeader: [],
  helpExamplesHeader: [],
  purgeInvalidCount: [],
  invalidTtlMs: [],
  eventMessageUnavailable: [],
  eventChannelRequired: [],
  unknownCommand: ['name', 'prefix'],
  unknownSubcommand: [],
  notInGuild: [],
  noAuthor: [],
  permissionMissingAuthor: ['permission'],
  permissionMissingBot: ['permission'],
  guildDepartureOwnerOnly: [],
  guildDepartureBotIsOwner: [],
  cooldown: ['remaining', 'remainingMs'],
  checkFailed: [],
  moderationSelfTarget: [],
  moderationBotTarget: [],
  moderationOwnerTarget: [],
  moderationHierarchy: [],
  moderationAdminImmune: [],
  moderationReasonRequired: [],
  moderationReasonTooLong: [],
  moderationTimeoutDuration: [],
  moderationDurationInvalid: [],
  moderationDeleteDaysInvalid: [],
  moderationVoiceChannelInvalid: [],
  moderationVoiceStateInvalid: [],
  moderationPartial: ['action', 'targetID'],
  userErrorAfterCase: ['caseID'],
  userErrorGeneric: [],
};

const KNOWN_MESSAGE_KEYS = new Set<string>(Object.keys(DEFAULT_MESSAGES));
const LOCALE_PATTERN = /^[A-Za-z]{1,8}(?:[-_][A-Za-z0-9]{1,8})*$/;
const MAX_LOCALE_LENGTH = 64;
const MAX_TRANSLATOR_CACHE = 256;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeLocaleKey(locale: string): string {
  return locale.replaceAll('_', '-').toLowerCase();
}

function localeCandidates(normalized: string): string[] {
  const parts = normalized.split('-');
  const candidates: string[] = [];
  for (let length = parts.length; length >= 1; length--) {
    candidates.push(parts.slice(0, length).join('-'));
  }
  return candidates;
}

export function validateLocale(locale: unknown, label = 'locale'): string {
  if (typeof locale !== 'string') {
    throw new ConfigError('MESSAGES_OPTIONS', `${label} deve ser um identificador de idioma em texto.`);
  }
  const trimmed = locale.trim();
  if (!trimmed || trimmed.length > MAX_LOCALE_LENGTH || !LOCALE_PATTERN.test(trimmed)) {
    throw new ConfigError('MESSAGES_OPTIONS', `${label} inválido: informe um identificador como pt-BR ou en-US.`);
  }
  return trimmed;
}

type CompiledCatalog = Partial<{ [K in MessageKey]: (...args: unknown[]) => string }>;

function formatTemplateValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function compileTemplate(key: MessageKey, template: string): (...args: unknown[]) => string {
  const params = PARAMETER_NAMES[key];
  if (params.length === 0 || !template.includes('{')) return () => template;
  const indexByName = new Map<string, number>();
  for (let index = 0; index < params.length; index++) indexByName.set(params[index]!, index);
  return (...args: unknown[]) => template.replace(/\{([A-Za-z0-9_]+)\}/g, (full, token: string) => {
    const position = indexByName.get(token);
    return position === undefined ? full : formatTemplateValue(args[position]);
  });
}

function compileCatalogOverrides(input: unknown, label: string): CompiledCatalog {
  if (!isPlainObject(input)) {
    throw new ConfigError('MESSAGES_OPTIONS', `${label} deve ser um objeto de mensagens.`);
  }
  const compiled: CompiledCatalog = Object.create(null);
  for (const [key, entry] of Object.entries(input)) {
    if (!KNOWN_MESSAGE_KEYS.has(key)) {
      throw new ConfigError('MESSAGES_OPTIONS', `Chave de mensagem desconhecida em ${label}: ${key}.`);
    }
    if (entry === undefined) continue;
    const messageKey = key as MessageKey;
    if (typeof entry === 'string') {
      compiled[messageKey] = compileTemplate(messageKey, entry);
      continue;
    }
    if (typeof entry === 'function') {
      const fn = entry as (...args: unknown[]) => unknown;
      compiled[messageKey] = (...args: unknown[]) => {
        const result = fn(...args);
        if (typeof result !== 'string') {
          throw new ConfigError('MESSAGES_OPTIONS', `Formatador de mensagem ${key} em ${label} deve retornar texto.`);
        }
        return result;
      };
      continue;
    }
    throw new ConfigError('MESSAGES_OPTIONS', `Mensagem ${key} em ${label} deve ser texto ou função.`);
  }
  return compiled;
}

export const defaultTranslator: MessageTranslator = <K extends MessageKey>(
  key: K,
  ...args: Parameters<MessageCatalog[K]>
): string => {
  if (!KNOWN_MESSAGE_KEYS.has(key)) {
    throw new ConfigError('MESSAGES_OPTIONS', `Chave de mensagem desconhecida: ${String(key)}.`);
  }
  const formatter = DEFAULT_MESSAGES[key] as (...params: Parameters<MessageCatalog[K]>) => string;
  return formatter(...args);
};

function createLayeredTranslator(layers: readonly CompiledCatalog[]): MessageTranslator {
  if (layers.length === 0) return defaultTranslator;
  return <K extends MessageKey>(key: K, ...args: Parameters<MessageCatalog[K]>): string => {
    if (!KNOWN_MESSAGE_KEYS.has(key)) {
      throw new ConfigError('MESSAGES_OPTIONS', `Chave de mensagem desconhecida: ${String(key)}.`);
    }
    for (const layer of layers) {
      const custom = layer[key];
      if (custom !== undefined) return custom(...args);
    }
    const fallback = DEFAULT_MESSAGES[key] as (...params: Parameters<MessageCatalog[K]>) => string;
    return fallback(...args);
  };
}

export function createTranslator(overrides?: Partial<MessageCatalog> | MessageOverrides): MessageTranslator {
  if (overrides === undefined) return defaultTranslator;
  const compiled = compileCatalogOverrides(overrides, 'messages');
  return Object.keys(compiled).length === 0 ? defaultTranslator : createLayeredTranslator([compiled]);
}

export interface ResolvedMessages {
  readonly defaultLocale: string;
  readonly defaultTranslator: MessageTranslator;
  resolve(locale?: string): { readonly locale: string; readonly translator: MessageTranslator };
  translatorFor(locale?: string): MessageTranslator;
}

function hasLocaleConfigShape(input: Record<string, unknown>): boolean {
  return 'locales' in input || 'defaultLocale' in input;
}

export function resolveMessagesConfig(
  messages: MessagesConfig | undefined,
  staticLocale?: string,
): ResolvedMessages {
  const validatedStatic = staticLocale !== undefined ? validateLocale(staticLocale, 'locale') : undefined;
  if (messages === undefined) {
    const resolvedDefault = validatedStatic ?? DEFAULT_LOCALE;
    return {
      defaultLocale: resolvedDefault,
      defaultTranslator,
      resolve(locale) {
        const active = locale !== undefined ? validateLocale(locale, 'locale') : resolvedDefault;
        return { locale: active, translator: defaultTranslator };
      },
      translatorFor(locale) {
        if (locale !== undefined) validateLocale(locale, 'locale');
        return defaultTranslator;
      },
    };
  }

  if (!isPlainObject(messages)) {
    throw new ConfigError('MESSAGES_OPTIONS', 'messages deve ser um objeto.');
  }

  if (!hasLocaleConfigShape(messages)) {
    const compiled = compileCatalogOverrides(messages, 'messages');
    const resolvedDefault = validatedStatic ?? DEFAULT_LOCALE;
    const translator = Object.keys(compiled).length === 0 ? defaultTranslator : createLayeredTranslator([compiled]);
    return {
      defaultLocale: resolvedDefault,
      defaultTranslator: translator,
      resolve(locale) {
        const active = locale !== undefined ? validateLocale(locale, 'locale') : resolvedDefault;
        return { locale: active, translator };
      },
      translatorFor(locale) {
        if (locale !== undefined) validateLocale(locale, 'locale');
        return translator;
      },
    };
  }

  const localeConfig = messages as Record<string, unknown>;
  for (const key of Object.keys(localeConfig)) {
    if (key !== 'locales' && key !== 'defaultLocale') {
      throw new ConfigError('MESSAGES_OPTIONS', `Propriedade desconhecida em messages: ${key}.`);
    }
  }

  const configuredDefault = localeConfig['defaultLocale'] !== undefined
    ? validateLocale(localeConfig['defaultLocale'], 'messages.defaultLocale')
    : undefined;
  const fallbackLocale = configuredDefault ?? DEFAULT_LOCALE;
  const initialLocale = validatedStatic ?? fallbackLocale;

  const compiledLocales = new Map<string, CompiledCatalog>();
  const rawLocales = localeConfig['locales'];
  if (rawLocales !== undefined) {
    if (!isPlainObject(rawLocales)) {
      throw new ConfigError('MESSAGES_OPTIONS', 'messages.locales deve ser um objeto de locales.');
    }
    for (const [rawTag, catalog] of Object.entries(rawLocales)) {
      const tag = validateLocale(rawTag, `messages.locales[${JSON.stringify(rawTag)}]`);
      const normalized = normalizeLocaleKey(tag);
      if (compiledLocales.has(normalized)) {
        throw new ConfigError('MESSAGES_OPTIONS', `Locale duplicado em messages.locales: ${tag}.`);
      }
      compiledLocales.set(normalized, compileCatalogOverrides(catalog, `messages.locales.${tag}`));
    }
  }

  const defaultCandidates = localeCandidates(normalizeLocaleKey(fallbackLocale));
  const cache = new Map<string, MessageTranslator>();

  const buildTranslator = (activeLocale: string): MessageTranslator => {
    const normalized = normalizeLocaleKey(activeLocale);
    const cached = cache.get(normalized);
    if (cached) return cached;
    const layers: CompiledCatalog[] = [];
    const seen = new Set<string>();
    for (const candidate of [...localeCandidates(normalized), ...defaultCandidates]) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      const catalog = compiledLocales.get(candidate);
      if (catalog && Object.keys(catalog).length > 0) layers.push(catalog);
    }
    const translator = createLayeredTranslator(layers);
    if (cache.size < MAX_TRANSLATOR_CACHE) cache.set(normalized, translator);
    return translator;
  };

  const initialTranslator = buildTranslator(initialLocale);

  return {
    defaultLocale: initialLocale,
    defaultTranslator: initialTranslator,
    resolve(locale) {
      if (locale === undefined) return { locale: initialLocale, translator: initialTranslator };
      const active = validateLocale(locale, 'locale');
      return { locale: active, translator: buildTranslator(active) };
    },
    translatorFor(locale) {
      if (locale === undefined) return initialTranslator;
      return buildTranslator(validateLocale(locale, 'locale'));
    },
  };
}
