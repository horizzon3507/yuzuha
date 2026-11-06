import { YuzuhaError } from '../../../errors.js';
import { defineFunctions } from '../definition.js';
import { integer } from './common.js';

const MENTION_TYPES = new Set(['user', 'role', 'channel']);
const MARKDOWN_SPECIALS = new Set(['\\', '*', '_', '~', '`', '>', '|']);

export const textFunctions = defineFunctions(fn => {
  fn('split', 'language', 2, 2, '[texto;separador]', 'Divide texto; separador vazio retorna caracteres.', async c => {
    const value = await c.text(0), separator = await c.text(1);
    if (separator === '') return [...value];
    const parts = value.split(separator);
    if (parts.length > 1000) throw new YuzuhaError('SPLIT', 'Resultado excede 1000 partes.');
    return parts;
  });
  fn('sliceText', 'language', 2, 3, '[texto;início;fim?]', 'Fatia caracteres; fim exclusivo.', async c => {
    const value = [...await c.text(0)];
    const start = integer(await c.text(1));
    const end = c.count > 2 ? integer(await c.text(2)) : value.length;
    if (start < 0 || start > value.length) throw new YuzuhaError('INDEX', 'Início fora do intervalo.');
    if (end < start || end > value.length) throw new YuzuhaError('INDEX', 'Fim fora do intervalo.');
    return value.slice(start, end).join('');
  });
  fn('includes', 'language', 2, 2, '[texto;busca]', 'Verifica se o texto contém a busca.', async c => (await c.text(0)).includes(await c.text(1)));
  fn('startsWith', 'language', 2, 2, '[texto;prefixo]', 'Verifica prefixo do texto.', async c => (await c.text(0)).startsWith(await c.text(1)));
  fn('endsWith', 'language', 2, 2, '[texto;sufixo]', 'Verifica sufixo do texto.', async c => (await c.text(0)).endsWith(await c.text(1)));
  fn('padStart', 'language', 2, 3, '[texto;tamanho;preenchimento?]', 'Preenche à esquerda até o tamanho.', async c => {
    const value = await c.text(0);
    const size = integer(await c.text(1));
    const filling = c.count > 2 ? await c.text(2) : ' ';
    if (size < 0 || size > 100_000) throw new YuzuhaError('PAD', 'Tamanho deve estar entre 0 e 100000.');
    if (!filling) throw new YuzuhaError('PAD', 'Preenchimento não pode ser vazio.');
    return value.padStart(size, filling);
  });
  fn('padEnd', 'language', 2, 3, '[texto;tamanho;preenchimento?]', 'Preenche à direita até o tamanho.', async c => {
    const value = await c.text(0);
    const size = integer(await c.text(1));
    const filling = c.count > 2 ? await c.text(2) : ' ';
    if (size < 0 || size > 100_000) throw new YuzuhaError('PAD', 'Tamanho deve estar entre 0 e 100000.');
    if (!filling) throw new YuzuhaError('PAD', 'Preenchimento não pode ser vazio.');
    return value.padEnd(size, filling);
  });
  fn('repeatText', 'language', 2, 2, '[texto;vezes]', 'Repete texto; no máximo 100000 caracteres.', async c => {
    const value = await c.text(0);
    const times = integer(await c.text(1));
    if (times < 0) throw new YuzuhaError('REPEAT', 'Vezes deve ser ao menos 0.');
    if (value.length * times > 100_000) throw new YuzuhaError('REPEAT', 'Resultado excede 100000 caracteres.');
    return value.repeat(times);
  });
  fn('truncate', 'language', 2, 3, '[texto;limite;sufixo?]', 'Corta texto no limite e adiciona sufixo.', async c => {
    const value = await c.text(0);
    const limit = integer(await c.text(1));
    const suffix = c.count > 2 ? await c.text(2) : '…';
    if (limit < 0) throw new YuzuhaError('TRUNCATE', 'Limite deve ser ao menos 0.');
    const chars = [...value];
    if (chars.length <= limit) return value;
    return chars.slice(0, limit).join('') + suffix;
  });
  fn('escapeMarkdown', 'language', 1, 1, '[texto]', 'Escapa caracteres especiais de Markdown.', async c => {
    const value = await c.text(0);
    return [...value].map(char => MARKDOWN_SPECIALS.has(char) ? `\\${char}` : char).join('');
  });
  fn('mention', 'language', 1, 2, '[id;tipo?]', 'Menciona user, role ou channel; ID deve ser numérico.', async c => {
    const id = (await c.text(0)).trim();
    const kind = c.count > 1 ? (await c.text(1)).trim().toLowerCase() : 'user';
    if (!/^\d+$/.test(id)) throw new YuzuhaError('MENTION', 'ID deve ser numérico.');
    if (!MENTION_TYPES.has(kind)) throw new YuzuhaError('MENTION', 'Tipo deve ser user, role ou channel.');
    if (kind === 'user') return `<@${id}>`;
    if (kind === 'role') return `<@&${id}>`;
    return `<#${id}>`;
  });
});
