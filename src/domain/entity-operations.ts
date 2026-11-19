import { YuzuhaError } from '../shared/errors.js';

export function entityOptions(input: unknown, allowed: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !allowed.includes(key))) {
    throw new YuzuhaError('ARGUMENT', `Opções devem ser um objeto com: ${allowed.join(', ')}.`);
  }
  return input as Record<string, unknown>;
}

export function discoveryInput(input: unknown) {
  const value = entityOptions(input, ['description', 'primaryCategoryId', 'keywords', 'primaryLanguage']);
  if (!Object.keys(value).length) throw new YuzuhaError('ARGUMENT', 'Informe ao menos um campo da candidatura.');
  const { description, primaryCategoryId, keywords, primaryLanguage } = value;
  if (description !== undefined && (typeof description !== 'string' || description.length > 1000)) {
    throw new YuzuhaError('ARGUMENT', 'Descrição deve ter até 1000 caracteres.');
  }
  if (primaryCategoryId !== undefined && ((typeof primaryCategoryId !== 'string' && typeof primaryCategoryId !== 'number')
    || !/^\d+$/.test(String(primaryCategoryId)) || !Number.isSafeInteger(Number(primaryCategoryId)))) {
    throw new YuzuhaError('ARGUMENT', 'Categoria deve ser um inteiro não negativo.');
  }
  if (keywords !== undefined && (!Array.isArray(keywords) || keywords.length > 10
    || keywords.some(word => typeof word !== 'string' || !word.trim() || word.length > 32))) {
    throw new YuzuhaError('ARGUMENT', 'Informe até 10 palavras-chave de 1 a 32 caracteres.');
  }
  if (primaryLanguage !== undefined && (typeof primaryLanguage !== 'string' || !/^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(primaryLanguage)
    || primaryLanguage.length > 35)) throw new YuzuhaError('ARGUMENT', 'Idioma deve ser uma tag válida, como pt-BR.');
  return { ...(description === undefined ? {} : { description: description as string }),
    ...(primaryCategoryId === undefined ? {} : { primaryCategoryId: primaryCategoryId as string | number }),
    ...(keywords === undefined ? {} : { keywords: [...keywords as string[]] }),
    ...(primaryLanguage === undefined ? {} : { primaryLanguage: primaryLanguage as string }) };
}

export function positionBatch(input: unknown, hoist = false): { id: string; position: number }[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) throw new YuzuhaError('ARGUMENT', 'Informe de 1 a 100 posições.');
  const seen = new Set<string>();
  return input.map(item => {
    const value = entityOptions(item, ['id', 'position']);
    const id = typeof value.id === 'number' && Number.isSafeInteger(value.id) ? String(value.id) : value.id;
    if (typeof id !== 'string' || !/^\d{1,20}$/.test(id) || seen.has(id)) {
      throw new YuzuhaError('ARGUMENT', 'IDs devem ser numéricos e únicos.');
    }
    const position = hoist && value.position === null ? 0 : value.position;
    if (typeof position !== 'number' || !Number.isSafeInteger(position) || position < 0) {
      throw new YuzuhaError('ARGUMENT', 'Posições devem ser inteiros não negativos.');
    }
    seen.add(id);
    return { id, position };
  });
}

export function threadDefaultsInput(input: unknown) {
  const value = entityOptions(input, ['autoArchiveDuration', 'slowmode', 'reason']);
  if (value.autoArchiveDuration === undefined && value.slowmode === undefined) throw new YuzuhaError('ARGUMENT', 'Informe duração ou modo lento.');
  if (value.autoArchiveDuration !== undefined && value.autoArchiveDuration !== null
    && ![60, 1440, 4320, 10080].includes(value.autoArchiveDuration as number)) throw new YuzuhaError('ARGUMENT', 'Duração inválida de arquivamento.');
  if (value.slowmode !== undefined && value.slowmode !== null
    && (typeof value.slowmode !== 'number' || !Number.isSafeInteger(value.slowmode) || value.slowmode < 0 || value.slowmode > 21600)) {
    throw new YuzuhaError('ARGUMENT', 'Modo lento deve ser inteiro de 0 a 21600 segundos.');
  }
  if (value.reason !== undefined && (typeof value.reason !== 'string' || value.reason.length > 512)) throw new YuzuhaError('ARGUMENT', 'Motivo deve ser texto de até 512 caracteres.');
  return value as { autoArchiveDuration?: number | null; slowmode?: number | null; reason?: string };
}

export function threadSelfInput(input: unknown) {
  const value = entityOptions(input, ['flags', 'muted', 'muteConfig']);
  if (!Object.keys(value).length) throw new YuzuhaError('ARGUMENT', 'Informe ao menos uma configuração própria.');
  if (value.flags !== undefined && (typeof value.flags !== 'number' || !Number.isSafeInteger(value.flags) || value.flags < 0 || value.flags > 0xffffffff)) {
    throw new YuzuhaError('ARGUMENT', 'Flags devem ser um inteiro de 32 bits não negativo.');
  }
  if (value.muted !== undefined && typeof value.muted !== 'boolean') throw new YuzuhaError('ARGUMENT', 'muted deve ser booleano.');
  if (value.muteConfig !== undefined && value.muteConfig !== null) {
    const config = entityOptions(value.muteConfig, ['endTime', 'selectedTimeWindow']);
    if (typeof config.selectedTimeWindow !== 'number' || !Number.isSafeInteger(config.selectedTimeWindow) || config.selectedTimeWindow < 0) {
      throw new YuzuhaError('ARGUMENT', 'selectedTimeWindow deve ser inteiro não negativo.');
    }
    if (config.endTime !== undefined && config.endTime !== null && !(typeof config.endTime === 'string' && Number.isFinite(Date.parse(config.endTime)))
      && !(typeof config.endTime === 'number' && Number.isFinite(config.endTime) && config.endTime >= 0)) throw new YuzuhaError('ARGUMENT', 'endTime deve ser data, timestamp ou null.');
  }
  return value as { flags?: number; muted?: boolean; muteConfig?: { endTime?: string | number | null; selectedTimeWindow: number } | null };
}

export function memberEditInput(input: unknown) {
  const value = entityOptions(input, ['nickname', 'roles', 'reason']);
  if (value.nickname === undefined && value.roles === undefined) throw new YuzuhaError('ARGUMENT', 'Informe apelido ou cargos.');
  if (value.nickname !== undefined && value.nickname !== null && (typeof value.nickname !== 'string' || value.nickname.length > 32)) {
    throw new YuzuhaError('ARGUMENT', 'Apelido deve ser texto de até 32 caracteres ou null.');
  }
  if (value.roles !== undefined && (!Array.isArray(value.roles) || value.roles.length > 100
    || value.roles.some(id => typeof id !== 'string' || !/^\d{1,20}$/.test(id)) || new Set(value.roles).size !== value.roles.length)) {
    throw new YuzuhaError('ARGUMENT', 'Cargos devem ser array de até 100 IDs numéricos únicos como textos.');
  }
  if (typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 512) throw new YuzuhaError('ARGUMENT', 'Informe motivo de 1 a 512 caracteres.');
  return { ...(value.nickname === undefined ? {} : { nickname: value.nickname === '' ? null : value.nickname as string | null }),
    ...(value.roles === undefined ? {} : { roles: [...value.roles as string[]] }), reason: value.reason };
}
