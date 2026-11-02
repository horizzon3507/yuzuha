import type { Embed, EmbedField } from '../../domain/messages.js';
import { YuzuhaError } from '../../errors.js';
import { httpURL, isoTimestamp, mergeEmbedParts, normalizeEmbed, normalizeFields, parseColor, validateEmbed } from '../../domain/embeds.js';
import { truthy } from '../values.js';
import { defineFunctions } from './definition.js';

export { validateEmbed } from '../../domain/embeds.js';

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new YuzuhaError('EMBED', `${label} deve ser um embed (objeto).`);
  return value as Record<string, unknown>;
}

/** Argumento opcional: vazio conta como ausente. */
function optional(value: string): string | undefined {
  return value.trim() === '' ? undefined : value;
}

function fieldFrom(value: unknown): EmbedField {
  const [field] = normalizeFields([Array.isArray(value)
    ? { name: value[0], value: value[1], ...(value.length > 2 ? { inline: value[2] } : {}) }
    : value]);
  return field!;
}

export const embedFunctions = defineFunctions(fn => {
  fn('embed', 'embeds', 1, 32, '[parte;parte;...]', 'Combina partes tipadas de embed. Separe-as por ponto e vírgula.', async c => {
    const parts: Embed[] = [];
    for (const part of await c.all()) {
      if (!part || typeof part !== 'object' || Array.isArray(part)) throw new YuzuhaError('EMBED', 'Use funções de embed separadas por ;.');
      parts.push(part as Embed);
    }
    const result = mergeEmbedParts(parts);
    validateEmbed(result);
    return result;
  });
  for (const name of ['title', 'description', 'footer'] as const) {
    fn(name, 'embeds', 1, 1, '[texto]', 'Parte de embed.', async c => {
      const value = await c.text(0);
      return name === 'footer' ? { footer: { text: value } } : { [name]: value };
    });
  }
  fn('url', 'embeds', 1, 1, '[url]', 'URL clicável do título do embed (HTTP/HTTPS).', async c => ({ url: httpURL(await c.text(0)) }));
  fn('embedTimestamp', 'embeds', 1, 1, '[iso|agora]', 'Data do embed em ISO-8601 com fuso, ou "agora" para o instante atual.', async c => {
    const value = (await c.text(0)).trim();
    return { timestamp: value.toLowerCase() === 'agora' ? new Date().toISOString() : isoTimestamp(value) };
  });
  fn('footerIcon', 'embeds', 1, 1, '[iconURL]', 'Ícone do rodapé do embed (HTTP/HTTPS). Use depois de $footer.', async c => ({ footer: { iconURL: httpURL(await c.text(0)) } }));
  fn('author', 'embeds', 1, 3, '[nome;url?;iconURL?]', 'Autor do embed, com link e ícone opcionais (HTTP/HTTPS).', async c => {
    const author: { name: string; url?: string; iconURL?: string } = { name: await c.text(0) };
    const url = c.count > 1 ? optional(await c.text(1)) : undefined;
    const iconURL = c.count > 2 ? optional(await c.text(2)) : undefined;
    if (url !== undefined) author.url = httpURL(url);
    if (iconURL !== undefined) author.iconURL = httpURL(iconURL);
    return { author };
  });
  for (const name of ['image', 'thumbnail'] as const) {
    fn(name, 'embeds', 1, 1, '[url]', 'Imagem ou miniatura do embed (HTTP/HTTPS).', async c => ({ [name]: { url: httpURL(await c.text(0)) } }));
    fn(`${name}Alt`, 'embeds', 1, 1, '[descrição]', `Texto alternativo da ${name === 'image' ? 'imagem' : 'miniatura'} do embed.`, async c => ({ [name]: { description: await c.text(0) } }));
  }
  fn('color', 'embeds', 1, 1, '[#RRGGBB|r,g,b|nome]', 'Cor do embed: #RRGGBB, tupla r,g,b (0 a 255) ou nome simples (red, blue, green...).', async c => ({ color: parseColor(await c.arg(0)) }));
  fn('field', 'embeds', 2, 3, '[nome;valor;inline?]', 'Campo de embed. O valor pode ser vazio quando o campo é inline.', async c => ({
    fields: [{ name: await c.text(0), value: await c.text(1), inline: c.count > 2 ? truthy(await c.arg(2)) : false }],
  }));
  fn('fields', 'embeds', 1, 1, '[array]', 'Campos de embed a partir de um array de objetos {name, value, inline} ou de arrays [nome, valor, inline?].', async c => {
    const value = await c.arg(0);
    if (!Array.isArray(value)) throw new YuzuhaError('EMBED_FIELD', 'fields recebe um array de campos.');
    return { fields: value.map(fieldFrom) };
  });
  fn('addField', 'embeds', 3, 4, '[embed;nome;valor;inline?]', 'Retorna cópia do embed com um campo adicionado ao final.', async c => {
    const base = normalizeEmbed(record(await c.arg(0), 'addField'));
    const field = { name: await c.text(1), value: await c.text(2), inline: c.count > 3 ? truthy(await c.arg(3)) : false };
    return normalizeEmbed({ ...base, fields: [...(base.fields ?? []), field] });
  });
  fn('removeField', 'embeds', 2, 2, '[embed;índice]', 'Retorna cópia do embed sem o campo de índice indicado, começando em 0.', async c => {
    const base = normalizeEmbed(record(await c.arg(0), 'removeField'));
    const index = fieldIndex(await c.text(1), base.fields?.length ?? 0);
    const fields = (base.fields ?? []).filter((_, position) => position !== index);
    const { fields: _removed, ...rest } = base;
    return normalizeEmbed(fields.length ? { ...rest, fields } : rest);
  });
  fn('editField', 'embeds', 4, 5, '[embed;índice;nome;valor;inline?]', 'Retorna cópia do embed com o campo de índice substituído. Sem inline, mantém o valor anterior.', async c => {
    const base = normalizeEmbed(record(await c.arg(0), 'editField'));
    const index = fieldIndex(await c.text(1), base.fields?.length ?? 0);
    const current = base.fields![index]!;
    const replaced = { name: await c.text(2), value: await c.text(3), inline: c.count > 4 ? truthy(await c.arg(4)) : current.inline };
    const fields = (base.fields ?? []).map((field, position) => (position === index ? replaced : field));
    return normalizeEmbed({ ...base, fields });
  });
  fn('embedFromObject', 'embeds', 1, 1, '[objeto|json]', 'Monta um embed a partir de objeto ou texto JSON, com as mesmas regras de $embed. Campos de resposta do Fluxer são descartados.', async c => {
    const value = await c.arg(0);
    if (typeof value !== 'string') return normalizeEmbed(value);
    try { return normalizeEmbed(JSON.parse(value)); }
    catch (error) {
      if (error instanceof YuzuhaError) throw error;
      throw new YuzuhaError('EMBED', 'JSON de embed inválido.');
    }
  });
});

function fieldIndex(raw: string, length: number): number {
  const index = Number(raw.trim());
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new YuzuhaError('EMBED_FIELD', `Índice de campo inválido. Use um inteiro de 0 a ${Math.max(length - 1, 0)}.`);
  }
  return index;
}
