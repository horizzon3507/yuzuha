import { ScriptError } from '../errors.js';
import type { Node, Program } from './ast.js';

function nameStart(code: number): boolean {
  return code >= 65 && code <= 90 || code >= 97 && code <= 122 || code === 95;
}

export function parse(source: string, file = '<script>'): Program {
  if (source.length > 100_000) throw new ScriptError('SOURCE_LIMIT', 'Script excede 100000 caracteres.', source, 0, file);
  let pos = 0;
  const delimiters = /[\\$\[\];]/g;
  const fail = (message: string, offset = pos): never => {
    throw new ScriptError('SYNTAX', message, source, offset, file);
  };
  function sequence(argument: boolean, depth: number): Node[] {
    if (depth > 64) fail('Aninhamento excede 64 níveis.');
    const nodes: Node[] = [];
    let value = '', start = pos, chunk = pos;
    function flush() {
      value += source.slice(chunk, pos);
      if (value) nodes.push({ kind: 'text', value, offset: start });
      value = '';
      chunk = start = pos;
    }
    while (pos < source.length) {
      const char = source[pos]!;
      if (argument && (char === ';' || char === ']')) break;
      if (!argument && char === ']') fail('Colchete de fechamento inesperado.');
      if (char === '\\' && '\\$;[]'.includes(source[pos + 1] ?? '\0')) {
        value += source.slice(chunk, pos) + source[pos + 1]; pos += 2; chunk = pos; continue;
      }
      if (char === '$' && nameStart(source.charCodeAt(pos + 1))) {
        flush();
        const offset = pos++;
        const nameOffset = pos++;
        while (nameStart(source.charCodeAt(pos)) || source.charCodeAt(pos) >= 48 && source.charCodeAt(pos) <= 57) pos++;
        const name = source.slice(nameOffset, pos);
        const args: Node[][] = [];
        if (source[pos] === '[') {
          pos++;
          if (source[pos] === ']') pos++;
          else {
            while (true) {
              args.push(sequence(true, depth + 1));
              if (source[pos] === ']') { pos++; break; }
              if (source[pos] !== ';') fail(`Falta ] para $${name}.`, offset);
              pos++;
            }
          }
        }
        nodes.push({ kind: 'call', name, args, offset });
        chunk = start = pos;
      } else if (char === '[') {
        if (!argument) fail('Colchete literal fora de argumento.');
        let level = 0, end = pos;
        for (; end < source.length; end++) {
          const current = source[end]!;
          if (current === '\\') { end++; continue; }
          if (current === '[') level++;
          else if (current === ']') { level--; if (level === 0) break; }
        }
        if (level !== 0) fail('Colchete literal sem fechamento.');
        pos = end + 1;
      } else {
        pos++;
        if (pos - chunk >= 16) {
          delimiters.lastIndex = pos;
          pos = delimiters.exec(source)?.index ?? source.length;
        }
      }
    }
    flush();
    return nodes;
  }
  return { source, file, nodes: sequence(false, 0) };
}
