import { parentPort, workerData } from 'node:worker_threads';

const { operation, text, pattern, flags, replacement } = workerData;
const MAX_OUTPUT = 100_000;

function fail(code, message) { throw Object.assign(new Error(message), { code }); }

function execute() {
  let regex;
  try { regex = new RegExp(pattern, flags); }
  catch { fail('REGEX_INVALID', 'Padrão de regex inválido.'); }
  if (operation === 'test') return regex.test(text);
  const matches = [];
  const chunks = [];
  let output = 0, cursor = 0, count = 0;
  function append(value) {
    output += value.length;
    if (output > MAX_OUTPUT) fail('OUTPUT_LIMIT', 'Resultado de regex excede 100000 caracteres.');
    chunks.push(value);
  }
  function substitute(match) {
    const tokens = /\$(\$|&|`|'|<[^>]+>|\d{1,2})/g;
    let last = 0, token;
    while ((token = tokens.exec(replacement))) {
      append(replacement.slice(last, token.index));
      const part = token[1];
      if (part === '$') append('$');
      else if (part === '&') append(match[0]);
      else if (part === '`') append(text.slice(0, match.index));
      else if (part === "'") append(text.slice(match.index + match[0].length));
      else if (part.startsWith('<')) append(match.groups ? (match.groups[part.slice(1, -1)] ?? '') : token[0]);
      else {
        const index = Number(part);
        if (index > 0 && index < match.length) append(match[index] ?? '');
        else if (part.length === 2 && Number(part[0]) > 0 && Number(part[0]) < match.length) append((match[Number(part[0])] ?? '') + part[1]);
        else append(token[0]);
      }
      last = token.index + token[0].length;
    }
    append(replacement.slice(last));
  }
  let match;
  while ((match = regex.exec(text))) {
    if (++count > 1000) fail('EXECUTION_LIMIT', 'Regex excede 1000 correspondências.');
    if (operation === 'replace') {
      append(text.slice(cursor, match.index));
      substitute(match);
      cursor = match.index + match[0].length;
    } else {
      const value = { value: match[0], index: match.index,
        captures: match.slice(1).map(value => value ?? null),
        groups: match.groups ? Object.fromEntries(Object.entries(match.groups).map(([key, value]) => [key, value ?? null])) : null };
      output += JSON.stringify(value).length + 1;
      if (output + 2 > MAX_OUTPUT) fail('OUTPUT_LIMIT', 'Resultado de regex excede 100000 caracteres.');
      matches.push(value);
    }
    if (!regex.global) break;
    if (match[0] === '') {
      const point = text.codePointAt(regex.lastIndex);
      regex.lastIndex += regex.unicode && point !== undefined && point > 0xffff ? 2 : 1;
    }
  }
  if (operation !== 'replace') return matches;
  append(text.slice(cursor));
  return chunks.join('');
}

try { parentPort.postMessage({ value: execute() }); }
catch (error) { parentPort.postMessage({ error: { code: error.code ?? 'REGEX_INVALID', message: error.message } }); }
