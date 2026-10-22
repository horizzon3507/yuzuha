import type { Embed, Payload } from '../../domain/messages.js';
import { YuzuhaError } from '../../errors.js';
import { text } from '../values.js';
import { validateEmbed } from './embeds.js';

export function payload(value: unknown): Payload {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    validateEmbed(value as Embed);
    return { embeds: [value as Embed] };
  }
  const content = text(value);
  if (!content || content.length > 2000) throw new YuzuhaError('MESSAGE_LENGTH', 'Mensagem deve ter de 1 a 2000 caracteres.');
  return { content };
}
