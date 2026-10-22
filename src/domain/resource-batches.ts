import { YuzuhaError } from '../shared/errors.js';

export function preloadChannels(input: unknown): string[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100
    || input.some(id => typeof id !== 'string' || !/^\d{1,20}$/.test(id))) {
    throw new YuzuhaError('PRELOAD_CHANNELS', 'Informe de 1 a 100 IDs de canais válidos.');
  }
  return [...new Set(input as string[])];
}

export function emojiBatch(input: unknown): { name: string; image: string }[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 50) {
    throw new YuzuhaError('EMOJI_BATCH', 'Informe de 1 a 50 emojis.');
  }
  let bytes = 0;
  const names = new Set<string>();
  return input.map((item: unknown) => {
    if (!item || typeof item !== 'object' || !Object.hasOwn(item, 'name') || !Object.hasOwn(item, 'image')) {
      throw new YuzuhaError('EMOJI_BATCH', 'Cada emoji deve informar name e image em base64.');
    }
    const { name, image } = item as { name: unknown; image: unknown };
    if (typeof name !== 'string' || !/^\S{2,32}$/.test(name) || names.has(name)) {
      throw new YuzuhaError('EMOJI_NAME', 'Nomes devem ser únicos, com 2 a 32 caracteres sem espaços.');
    }
    names.add(name);
    if (typeof image !== 'string' || !image || image.length > 13_333_336
      || image.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) {
      throw new YuzuhaError('EMOJI_IMAGE', 'Imagem deve ser base64 válido, sem prefixo data:.');
    }
    bytes += image.length / 4 * 3 - (image.endsWith('==') ? 2 : image.endsWith('=') ? 1 : 0);
    if (bytes > 10_000_000) throw new YuzuhaError('EMOJI_BATCH', 'Imagens devem somar até 10 MB.');
    return { name, image };
  });
}
