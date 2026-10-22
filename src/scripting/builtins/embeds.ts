import type { Embed } from '../../domain/messages.js';
import { YuzuhaError } from '../../errors.js';
import { truthy } from '../values.js';
import { defineFunctions } from './definition.js';

export const embedFunctions = defineFunctions(fn => {
  fn('embed', 'embeds', 1, 32, '[parte;parte;...]', 'Combina partes tipadas de embed. Separe-as por ponto e vírgula.', async c => {
    const result: Embed = {};
    for (const part of await c.all()) {
      if (!part || typeof part !== 'object') throw new YuzuhaError('EMBED', 'Use funções de embed separadas por ;.');
      const item = part as Embed;
      const fields = [...(result.fields ?? []), ...(item.fields ?? [])];
      Object.assign(result, item);
      if (fields.length) result.fields = fields;
    }
    validateEmbed(result);
    return result;
  });
  for (const name of ['title', 'description', 'footer', 'image', 'thumbnail'] as const) {
    fn(name, 'embeds', 1, 1, '[texto]', 'Parte de embed.', async c => {
      const value = await c.text(0);
      if (name === 'footer') return { footer: { text: value } };
      if (name === 'image' || name === 'thumbnail') {
        const url = new URL(value); if (!['https:', 'http:'].includes(url.protocol)) throw new YuzuhaError('EMBED_URL', 'Use URL HTTP/HTTPS.');
        return { [name]: { url: value } };
      }
      return { [name]: value };
    });
  }
  fn('color', 'embeds', 1, 1, '[#RRGGBB]', 'Cor RGB hexadecimal.', async c => {
    const value = await c.text(0);
    if (!/^#?[0-9a-f]{6}$/i.test(value)) throw new YuzuhaError('COLOR', 'Use #RRGGBB.');
    return { color: parseInt(value.replace('#', ''), 16) };
  });
  fn('field', 'embeds', 2, 3, '[nome;valor;inline?]', 'Campo de embed.', async c => ({ fields: [{ name: await c.text(0), value: await c.text(1), inline: c.count > 2 ? truthy(await c.arg(2)) : false }] }));

});

export function validateEmbed(embed: Embed): void {
  let length = (embed.title?.length ?? 0) + (embed.description?.length ?? 0) + (embed.footer?.text.length ?? 0);
  if ((embed.title?.length ?? 0) > 256 || (embed.description?.length ?? 0) > 4096 || (embed.footer?.text.length ?? 0) > 2048 || (embed.fields?.length ?? 0) > 25) throw new YuzuhaError('EMBED_LIMIT', 'Limite de embed excedido.');
  for (const field of embed.fields ?? []) {
    if (!field.name || !field.value || field.name.length > 256 || field.value.length > 1024) throw new YuzuhaError('EMBED_FIELD', 'Campo de embed inválido.');
    length += field.name.length + field.value.length;
  }
  if (length > 6000) throw new YuzuhaError('EMBED_LIMIT', 'Embed excede 6000 caracteres.');
  if (!length && !embed.image && !embed.thumbnail) throw new YuzuhaError('EMBED_EMPTY', 'Embed precisa de conteúdo.');
}
