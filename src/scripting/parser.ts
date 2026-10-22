import { ScriptError } from '../errors.js';
import type { Node, Program } from './ast.js';

export function parse(source: string, file = '<script>'): Program {
  if (source.length > 100_000) throw new ScriptError('SOURCE_LIMIT', 'Script excede 100000 caracteres.', source, 0, file);
  let pos = 0;
  const fail = (message: string, offset = pos): never => {
    throw new ScriptError('SYNTAX', message, source, offset, file);
  };
  function sequence(argument: boolean, depth: number): Node[] {
    if (depth > 64) fail('Aninhamento excede 64 níveis.');
    const nodes: Node[] = [];
    let value = '', start = pos;
    function flush() {
      if (value) nodes.push({ kind: 'text', value, offset: start });
      value = '';
      start = pos;
    }
    while (pos < source.length) {
      const char = source[pos]!;
      if (argument && (char === ';' || char === ']')) break;
      if (!argument && char === ']') fail('Colchete de fechamento inesperado.');
      if (char === '\\' && /[\\$;\[\]]/.test(source[pos + 1] ?? '')) {
        value += source[pos + 1]; pos += 2; continue;
      }
      if (char === '$' && /[A-Za-z_]/.test(source[pos + 1] ?? '')) {
        flush();
        const offset = pos++;
        const match = /^[A-Za-z_][A-Za-z_0-9]*/.exec(source.slice(pos))!;
        const name = match[0]; pos += name.length;
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
        start = pos;
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
        value += source.slice(pos, end + 1); pos = end + 1;
      } else { value += char; pos++; }
    }
    flush();
    return nodes;
  }
  return { source, file, nodes: sequence(false, 0) };
}
