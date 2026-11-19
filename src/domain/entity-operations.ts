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
