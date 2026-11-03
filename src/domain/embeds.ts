import { YuzuhaError } from '../shared/errors.js';
import type { Embed, EmbedAuthor, EmbedField, EmbedFooter, EmbedMedia } from './messages.js';

/** Limites do Fluxer/SDK. Título, descrição e campos seguem o EmbedBuilder do SDK 3.3.0. */
export const EMBED_LIMITS = {
  title: 256,
  description: 4096,
  authorName: 256,
  footerText: 2048,
  altText: 1024,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  total: 6000,
  embedsPerMessage: 10,
} as const;

const COLOR_NAMES: Record<string, number> = {
  black: 0x000000, white: 0xFFFFFF, gray: 0x95A5A6, red: 0xE74C3C, orange: 0xE67E22,
  yellow: 0xF1C40F, green: 0x2ECC71, cyan: 0x1ABC9C, blue: 0x3498DB, purple: 0x9B59B6, pink: 0xEB459E,
};

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i;

/** Chaves de embed aceitas ao normalizar objetos vindos de script ou JSON. */
const EMBED_KEYS = new Set(['url', 'title', 'description', 'color', 'timestamp', 'author', 'fields', 'footer', 'image', 'thumbnail']);
/** Campos de resposta do Fluxer: são aceitos na leitura e descartados ao enviar. */
const READ_ONLY_KEYS = new Set(['type', 'provider', 'video', 'audio', 'nsfw', 'children', 'html', 'htmlWidth', 'htmlHeight',
  'proxyURL', 'proxyIconURL', 'contentType', 'width', 'height', 'flags', 'duration', 'placeholder', 'contentHash']);

export function httpURL(value: string, code = 'EMBED_URL'): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new YuzuhaError(code, 'Use URL HTTP/HTTPS.'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new YuzuhaError(code, 'Use URL HTTP/HTTPS.');
  return value;
}

export function isoTimestamp(value: string): string {
  if (!ISO_TIMESTAMP.test(value) || Number.isNaN(Date.parse(value))) {
    throw new YuzuhaError('EMBED_TIMESTAMP', 'Use timestamp ISO-8601 com fuso, como 2026-01-20T21:30:00Z.');
  }
  return value;
}

/** Converte `#RRGGBB`, `RRGGBB`, `r,g,b`, tupla `[r,g,b]`, nome simples ou inteiro 0..0xFFFFFF. */
export function parseColor(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xFFFFFF) return value;
  if (Array.isArray(value)) return rgb(value.map(item => (typeof item === 'number' ? item : Number.NaN)));
  if (typeof value === 'string') {
    const raw = value.trim().toLowerCase();
    if (raw in COLOR_NAMES) return COLOR_NAMES[raw]!;
    if (/^#?[0-9a-f]{6}$/.test(raw)) return parseInt(raw.replace('#', ''), 16);
    if (/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(raw)) return rgb(raw.split(',').map(part => Number(part.trim())));
  }
  throw new YuzuhaError('COLOR', 'Use #RRGGBB, r,g,b (0 a 255) ou um nome simples: red, blue, green...');
}

function rgb(parts: number[]): number {
  if (parts.length !== 3 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    throw new YuzuhaError('COLOR', 'Cor RGB precisa de três inteiros de 0 a 255.');
  }
  return (parts[0]! << 16) | (parts[1]! << 8) | parts[2]!;
}

/** Junta partes de embed em ordem: escalares vencem, objetos aninhados são mesclados e campos se acumulam. */
export function mergeEmbedParts(parts: Embed[]): Embed {
  const result: Embed = {};
  let fields: EmbedField[] | undefined;
  for (const part of parts) {
    if (part.url !== undefined) result.url = part.url;
    if (part.title !== undefined) result.title = part.title;
    if (part.description !== undefined) result.description = part.description;
    if (part.color !== undefined) result.color = parseColor(part.color);
    if (part.timestamp !== undefined) result.timestamp = part.timestamp;
    if (part.author) result.author = { ...result.author, ...part.author } as EmbedAuthor;
    if (part.footer) result.footer = { ...result.footer, ...part.footer } as EmbedFooter;
    if (part.image) result.image = { ...result.image, ...part.image } as EmbedMedia;
    if (part.thumbnail) result.thumbnail = { ...result.thumbnail, ...part.thumbnail } as EmbedMedia;
    if (part.fields?.length) fields = [...(fields ?? []), ...part.fields];
  }
  if (fields) result.fields = fields;
  return result;
}

/** Limita o total de embeds por mensagem. */
export function assertEmbedCount(count: number): void {
  if (count > EMBED_LIMITS.embedsPerMessage) {
    throw new YuzuhaError('EMBED_LIMIT', `Mensagem aceita no máximo ${EMBED_LIMITS.embedsPerMessage} embeds.`);
  }
}

/** Valida um embed já montado. Lança YuzuhaError com código estável para cada regra. */
export function validateEmbed(embed: Embed): void {
  const measure = (value: string | undefined, max: number, label: string): number => {
    if (value !== undefined && value.length > max) throw new YuzuhaError('EMBED_LIMIT', `${label} deve ter no máximo ${max} caracteres.`);
    return value?.length ?? 0;
  };
  let total = measure(embed.title, EMBED_LIMITS.title, 'Título')
    + measure(embed.description, EMBED_LIMITS.description, 'Descrição')
    + measure(embed.author?.name, EMBED_LIMITS.authorName, 'Nome do autor')
    + measure(embed.footer?.text, EMBED_LIMITS.footerText, 'Texto do rodapé');

  if (embed.author) {
    if (!embed.author.name) throw new YuzuhaError('EMBED_AUTHOR', 'Autor precisa de nome.');
    if (embed.author.url !== undefined) httpURL(embed.author.url);
    if (embed.author.iconURL !== undefined) httpURL(embed.author.iconURL);
  }
  if (embed.footer) {
    if (embed.footer.text === undefined) throw new YuzuhaError('EMBED_FOOTER', 'Rodapé precisa de texto; use $footer antes de $footerIcon.');
    if (embed.footer.iconURL !== undefined) httpURL(embed.footer.iconURL);
  }
  for (const [label, media] of [['imagem', embed.image], ['miniatura', embed.thumbnail]] as const) {
    if (!media) continue;
    if (typeof media.url !== 'string') throw new YuzuhaError('EMBED_MEDIA', `Defina a URL da ${label} antes da descrição.`);
    httpURL(media.url);
    measure(media.description, EMBED_LIMITS.altText, `Descrição alternativa da ${label}`);
  }
  if (embed.url !== undefined) httpURL(embed.url);
  if (embed.timestamp !== undefined) isoTimestamp(embed.timestamp);
  if (embed.color !== undefined) parseColor(embed.color);
  if (embed.fields) {
    if (embed.fields.length > EMBED_LIMITS.fields) throw new YuzuhaError('EMBED_LIMIT', `Embed aceita no máximo ${EMBED_LIMITS.fields} campos.`);
    for (const field of embed.fields) {
      if (!field.name || field.name.length > EMBED_LIMITS.fieldName) throw new YuzuhaError('EMBED_FIELD', 'Campo precisa de nome de 1 a 256 caracteres.');
      if (field.value.length > EMBED_LIMITS.fieldValue) throw new YuzuhaError('EMBED_FIELD', 'Valor de campo deve ter no máximo 1024 caracteres.');
      if (!field.value && field.inline !== true) throw new YuzuhaError('EMBED_FIELD', 'Valor vazio só é permitido em campo inline.');
      total += field.name.length + field.value.length;
    }
  }
  if (total > EMBED_LIMITS.total) throw new YuzuhaError('EMBED_LIMIT', `Embed excede ${EMBED_LIMITS.total} caracteres.`);
  const hasContent = total > 0 || embed.url !== undefined || embed.author !== undefined
    || embed.image !== undefined || embed.thumbnail !== undefined;
  if (!hasContent) throw new YuzuhaError('EMBED_EMPTY', 'Embed precisa de conteúdo: texto, campos, imagem, miniatura, autor ou URL.');
}

/**
 * Helper nativo: valida um embed tipado e devolve uma cópia pronta para `ctx.reply`, `ctx.send` ou `ctx.edit`.
 * Para o builder completo do SDK, use `EmbedBuilder` de `yuzuha/sdk`.
 */
export function embed(input: Embed): Embed {
  return normalizeEmbed(input);
}

/**
 * Constrói um embed a partir de dados externos (objeto de script ou JSON).
 * Chaves desconhecidas são erro; campos de resposta do Fluxer são descartados.
 */
export function normalizeEmbed(input: unknown): Embed {
  const result = normalizeRecord(input, 'embed', EMBED_KEYS);
  const embed: Embed = {};
  for (const [key, value] of Object.entries(result)) {
    switch (key) {
      case 'color': embed.color = parseColor(value); break;
      case 'timestamp': embed.timestamp = isoTimestamp(expectString(value, key)); break;
      case 'author': embed.author = normalizeAuthor(value); break;
      case 'footer': embed.footer = normalizeFooter(value); break;
      case 'image': embed.image = normalizeMedia(value, 'image'); break;
      case 'thumbnail': embed.thumbnail = normalizeMedia(value, 'thumbnail'); break;
      case 'fields': embed.fields = normalizeFields(value); break;
      default: embed[key as 'url' | 'title' | 'description'] = expectString(value, key);
    }
  }
  validateEmbed(embed);
  return embed;
}

function normalizeAuthor(value: unknown): EmbedAuthor {
  const record = normalizeRecord(value, 'author', new Set(['name', 'url', 'iconURL']));
  return { name: expectString(record['name'], 'author.name'),
    ...(record['url'] === undefined ? {} : { url: expectString(record['url'], 'author.url') }),
    ...(record['iconURL'] === undefined ? {} : { iconURL: expectString(record['iconURL'], 'author.iconURL') }) };
}

function normalizeFooter(value: unknown): EmbedFooter {
  const record = normalizeRecord(value, 'footer', new Set(['text', 'iconURL']));
  return { text: expectString(record['text'], 'footer.text'),
    ...(record['iconURL'] === undefined ? {} : { iconURL: expectString(record['iconURL'], 'footer.iconURL') }) };
}

function normalizeMedia(value: unknown, label: string): EmbedMedia {
  const record = normalizeRecord(value, label, new Set(['url', 'description']));
  return { url: expectString(record['url'], `${label}.url`),
    ...(record['description'] === undefined ? {} : { description: expectString(record['description'], `${label}.description`) }) };
}

export function normalizeFields(value: unknown): EmbedField[] {
  if (!Array.isArray(value)) throw new YuzuhaError('EMBED_FIELD', 'fields deve ser um array de campos.');
  return value.map(item => {
    const record = normalizeRecord(item, 'field', new Set(['name', 'value', 'inline']));
    const field: EmbedField = { name: expectString(record['name'], 'field.name'), value: expectString(record['value'], 'field.value') };
    if (record['inline'] !== undefined) field.inline = booleanOf(record['inline']);
    return field;
  });
}

function normalizeRecord(value: unknown, label: string, allowed: Set<string>): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new YuzuhaError('EMBED', `${label} deve ser um objeto.`);
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null || READ_ONLY_KEYS.has(key)) continue;
    if (!allowed.has(key)) throw new YuzuhaError('EMBED', `Campo de ${label} desconhecido: ${key}.`);
    result[key] = item;
  }
  return result;
}

/** Scripts entregam números e booleanos quando o texto é numérico; isso vira texto sem perda. */
function expectString(value: unknown, label: string): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  throw new YuzuhaError('EMBED', `${label} deve ser texto.`);
}

function booleanOf(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 'false') return value === 'true';
  throw new YuzuhaError('EMBED_FIELD', 'inline deve ser true ou false.');
}
