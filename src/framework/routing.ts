import { YuzuhaError } from '../errors.js';

export function validatePrefixes(value: string | string[]): string[] {
  const prefixes = Array.isArray(value) ? [...value] : [value];
  if (!prefixes.length || prefixes.some(p => typeof p !== 'string' || !p || /\s/.test(p))) {
    throw new YuzuhaError('PREFIX', 'Prefixos devem ser textos não vazios sem espaços.');
  }
  return prefixes.sort((a, b) => b.length - a.length);
}

export function route(content: string, prefixes: string[]): { name: string; input: string; prefix: string } | undefined {
  const prefix = prefixes.find(p => content.startsWith(p));
  if (!prefix) return;
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(content.slice(prefix.length).trim());
  if (match) return { name: match[1]!.toLowerCase(), input: match[2] ?? '', prefix };
}
