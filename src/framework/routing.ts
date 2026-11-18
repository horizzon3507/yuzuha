import { ConfigError } from '../errors.js';

const WHITESPACE = /\s/;

function isWhitespace(text: string, index: number): boolean {
  const code = text.charCodeAt(index);
  if (code <= 0x20) return code === 0x20 || (code >= 0x09 && code <= 0x0d);
  return code >= 0xa0 && WHITESPACE.test(text[index]!);
}

export function trimEndIndex(text: string, min: number, end = text.length): number {
  while (end > min && isWhitespace(text, end - 1)) end--;
  return end;
}

export function firstWord(text: string, start = 0, end = text.length): { word: string; tailStart: number } | undefined {
  let wordStart = start;
  while (wordStart < end && isWhitespace(text, wordStart)) wordStart++;
  if (wordStart >= end) return undefined;
  let wordEnd = wordStart + 1;
  while (wordEnd < end && !isWhitespace(text, wordEnd)) wordEnd++;
  let tailStart = wordEnd;
  while (tailStart < end && isWhitespace(text, tailStart)) tailStart++;
  return { word: text.slice(wordStart, wordEnd).toLowerCase(), tailStart };
}

export function validatePrefixes(value: string | string[]): string[] {
  const prefixes = Array.isArray(value) ? [...value] : [value];
  if (!prefixes.length || prefixes.some(p => typeof p !== 'string' || !p || /\s/.test(p))) {
    throw new ConfigError('PREFIX', 'Prefixos devem ser textos não vazios sem espaços.');
  }
  return prefixes.sort((a, b) => b.length - a.length);
}

export function route(content: string, prefixes: string[]): { name: string; input: string; prefix: string } | undefined {
  const prefix = prefixes.find(p => content.startsWith(p));
  if (!prefix) return;
  const end = content.length;
  const head = firstWord(content, prefix.length, end);
  if (!head) return;
  const tailEnd = head.tailStart < end ? trimEndIndex(content, head.tailStart, end) : head.tailStart;
  return { name: head.word, input: head.tailStart < tailEnd ? content.slice(head.tailStart, tailEnd) : '', prefix };
}
