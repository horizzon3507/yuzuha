function scan(source, offset) {
    const stack = [];
    for (let index = 0; index < offset; index++) {
        const char = source[index];
        if (char === '\\') {
            index++;
            continue;
        }
        if (stack.at(-1)?.kind !== 'literal' && char === '$') {
            const match = /^\$([A-Za-z_][A-Za-z_0-9]*)\[/.exec(source.slice(index));
            if (match && index + match[0].length <= offset) {
                stack.push({ kind: 'call', name: match[1], start: index, parameter: 0 });
                index += match[0].length - 1;
                continue;
            }
        }
        if (char === '[')
            stack.push({ kind: 'literal' });
        else if (char === ']')
            stack.pop();
        else if (char === ';') {
            const current = stack.at(-1);
            if (current?.kind === 'call')
                current.parameter++;
        }
    }
    return stack;
}
function resolve(name, definitions) {
    return definitions.find(fn => [fn.name, ...fn.aliases ?? []].some(value => value.toLowerCase() === name.toLowerCase()));
}
function escaped(source, offset) {
    let slashes = 0;
    for (let index = offset - 1; index >= 0 && source[index] === '\\'; index--)
        slashes++;
    return slashes % 2 === 1;
}
function parameters(fn) {
    const start = fn.usage.indexOf('[');
    return start < 0 ? [] : fn.usage.slice(start + 1, fn.usage.lastIndexOf(']')).split(';');
}
export function complete(source, offset, definitions) {
    const match = /\$([A-Za-z_][A-Za-z_0-9]*)?$/.exec(source.slice(0, offset));
    if (!match || escaped(source, match.index) || scan(source, match.index).at(-1)?.kind === 'literal')
        return [];
    const prefix = (match[1] ?? '').toLowerCase();
    return definitions.flatMap(fn => [fn.name, ...fn.aliases ?? []].filter(name => name.toLowerCase().startsWith(prefix)).map(name => {
        const args = parameters(fn).slice(0, fn.minArgs).map((value, index) => {
            const label = value.replace(/[?$}\\]/g, '').replace(/\.\.\.$/, 'valor');
            return '${' + (index + 1) + ':' + label + '}';
        });
        return { name, usage: fn.usage, description: fn.description, category: fn.category,
            snippet: '\\$' + name + (args.length ? '[' + args.join(';') + ']' : ''), start: match.index, end: offset };
    }));
}
export function signatureAt(source, offset, definitions) {
    const call = scan(source, offset).findLast((item) => item.kind === 'call');
    if (!call)
        return undefined;
    const fn = resolve(call.name, definitions);
    if (!fn)
        return undefined;
    const args = parameters(fn);
    return { usage: fn.usage, description: fn.description, parameters: args,
        activeParameter: Math.min(call.parameter, Math.max(0, args.length - 1)), start: call.start };
}
export function hoverAt(source, offset, definitions) {
    for (const match of source.matchAll(/\$([A-Za-z_][A-Za-z_0-9]*)/g)) {
        if (match.index <= offset && offset <= match.index + match[0].length && !escaped(source, match.index)
            && scan(source, match.index).at(-1)?.kind !== 'literal') {
            const fn = resolve(match[1], definitions);
            return fn ? { usage: fn.usage, description: fn.description, category: fn.category,
                start: match.index, end: match.index + match[0].length } : undefined;
        }
    }
    return undefined;
}
function position(source, offset) {
    const before = source.slice(0, offset);
    const line = before.split('\n').length;
    return { offset, line, column: offset - before.lastIndexOf('\n') };
}
function diagnostic(source, code, message, start, end) {
    return { code, message, severity: 'error', start, end,
        range: { start: position(source, start), end: position(source, end) } };
}
/** Tolerant syntax and metadata analysis; no function callbacks are invoked. */
export function diagnose(source, definitions) {
    const results = [];
    const index = new Map(definitions.flatMap(fn => [fn.name, ...fn.aliases ?? []].map(name => [name.toLowerCase(), fn])));
    const report = (code, message, start, end = start + 1) => {
        if (results.length < 100)
            results.push(diagnostic(source, code, message, start, Math.min(source.length, end)));
    };
    if (source.length > 100_000) {
        report('SOURCE_LIMIT', 'Script excede 100000 caracteres.', 0);
        return results;
    }
    let cursor = 0;
    function literal() {
        const start = cursor++;
        let level = 1;
        while (cursor < source.length && level) {
            const char = source[cursor++];
            if (char === '\\')
                cursor++;
            else if (char === '[')
                level++;
            else if (char === ']')
                level--;
        }
        cursor = Math.min(cursor, source.length);
        if (level)
            report('SYNTAX', 'Colchete literal sem fechamento.', start);
    }
    function sequence(argument, depth) {
        if (depth > 64) {
            report('SYNTAX', 'Aninhamento excede 64 níveis.', cursor);
            cursor = source.length;
            return;
        }
        while (cursor < source.length) {
            const char = source[cursor];
            if (argument && (char === ';' || char === ']'))
                return;
            if (char === '\\' && /[\\$;\[\]]/.test(source[cursor + 1] ?? '')) {
                cursor += 2;
                continue;
            }
            if (char === '$' && /[A-Za-z_]/.test(source[cursor + 1] ?? '')) {
                const start = cursor++;
                const name = /^[A-Za-z_][A-Za-z_0-9]*/.exec(source.slice(cursor))[0];
                cursor += name.length;
                const nameEnd = cursor;
                const fn = index.get(name.toLowerCase());
                if (!fn)
                    report('UNKNOWN_FUNCTION', `Função desconhecida: $${name}.`, start, nameEnd);
                let count = 0, complete = true;
                if (source[cursor] === '[') {
                    cursor++;
                    if (source[cursor] === ']')
                        cursor++;
                    else {
                        while (true) {
                            count++;
                            sequence(true, depth + 1);
                            if (source[cursor] === ']') {
                                cursor++;
                                break;
                            }
                            if (source[cursor] !== ';') {
                                report('SYNTAX', `Falta ] para $${name}.`, start, nameEnd);
                                complete = false;
                                break;
                            }
                            cursor++;
                        }
                    }
                }
                if (complete && fn && (count < fn.minArgs || count > fn.maxArgs)) {
                    report('ARITY', `Uso: ${fn.usage} (${count} argumento${count === 1 ? '' : 's'} recebido${count === 1 ? '' : 's'}).`, start, nameEnd);
                }
            }
            else if (char === '[') {
                if (!argument)
                    report('SYNTAX', 'Colchete literal fora de argumento.', cursor);
                literal();
            }
            else if (char === ']') {
                report('SYNTAX', 'Colchete de fechamento inesperado.', cursor++);
            }
            else
                cursor++;
        }
    }
    sequence(false, 0);
    return results.sort((a, b) => a.start - b.start || a.end - b.end);
}
function regexEnd(source, start) {
    let bracket = false;
    for (let index = start + 1; index < source.length; index++) {
        const char = source[index];
        if (char === '\\')
            index++;
        else if (char === '\n' || char === '\r')
            return start + 1;
        else if (char === '[')
            bracket = true;
        else if (char === ']')
            bracket = false;
        else if (char === '/' && !bracket) {
            index++;
            while (/[a-z]/i.test(source[index] ?? '') && index < source.length)
                index++;
            return index;
        }
    }
    return source.length;
}
function startsRegex(source, offset) {
    const before = source.slice(0, offset).trimEnd();
    return !before || /[=(:,;!&|?{}\[]$/.test(before) || /\b(?:return|throw|case|yield)\s*$/.test(before);
}
function commentEnd(source, offset) {
    if (source[offset + 1] === '/') {
        const end = source.indexOf('\n', offset + 2);
        return end < 0 ? source.length : end;
    }
    const end = source.indexOf('*/', offset + 2);
    return end < 0 ? source.length : end + 2;
}
function interpolationEnd(source, start) {
    let depth = 1;
    for (let index = start; index < source.length;) {
        const char = source[index];
        if (char === '/' && (source[index + 1] === '/' || source[index + 1] === '*'))
            index = commentEnd(source, index);
        else if (char === '/' && startsRegex(source, index))
            index = regexEnd(source, index);
        else if (char === '"' || char === "'" || char === '`')
            index = stringRegion(source, index).next;
        else if (char === '{') {
            depth++;
            index++;
        }
        else if (char === '}') {
            index++;
            if (--depth === 0)
                return index;
        }
        else
            index++;
    }
    return source.length;
}
function stringRegion(source, quoteAt) {
    const quote = source[quoteAt];
    const raw = quote === '`' && /\bString\.raw\s*$/.test(source.slice(0, quoteAt));
    const start = quoteAt + 1, offsets = [], holes = [];
    let text = '', cursor = start, closed = false;
    function append(value, at) {
        text += value;
        for (let index = 0; index < value.length; index++)
            offsets.push(at);
    }
    while (cursor < source.length) {
        const char = source[cursor];
        if (char === quote) {
            closed = true;
            break;
        }
        if (quote !== '`' && (char === '\n' || char === '\r'))
            break;
        if (quote === '`' && char === '$' && source[cursor + 1] === '{') {
            const end = interpolationEnd(source, cursor + 2);
            holes.push({ start: cursor, end });
            for (let index = cursor; index < end; index++)
                append(' ', index);
            cursor = end;
            continue;
        }
        if (char !== '\\') {
            append(char, cursor++);
            continue;
        }
        const at = cursor++, next = source[cursor];
        if (raw) {
            append('\\', at);
            if (next !== undefined)
                append(next, cursor++);
            continue;
        }
        if (next === undefined) {
            append('\\', at);
            break;
        }
        const escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };
        if (next === '\n' || next === '\r') {
            cursor++;
            if (next === '\r' && source[cursor] === '\n')
                cursor++;
            continue;
        }
        const escape = /^(?:x([\da-f]{2})|u([\da-f]{4})|u\{([\da-f]{1,6})\})/i.exec(source.slice(cursor));
        if (escape) {
            const code = Number.parseInt(escape[1] ?? escape[2] ?? escape[3], 16);
            if (code <= 0x10ffff) {
                append(String.fromCodePoint(code), at);
                cursor += escape[0].length;
                continue;
            }
        }
        append(escapes[next] ?? next, at);
        cursor++;
    }
    offsets.push(cursor);
    return { region: { source: text, start, end: cursor, offsets, holes, closed, dynamic: holes.length > 0, offset: 0 },
        next: cursor + (closed ? 1 : 0) };
}
/** Extracts JS/TS string contents without importing or running the document. */
export function scriptRegions(source, language) {
    if (language === 'yuzuha')
        return [{ source, offset: 0, start: 0, end: source.length, closed: true, dynamic: false,
                offsets: Array.from({ length: source.length + 1 }, (_, index) => index), holes: [] }];
    if (!['javascript', 'typescript', 'javascriptreact', 'typescriptreact'].includes(language))
        return [];
    const regions = [];
    for (let cursor = 0; cursor < source.length;) {
        const char = source[cursor];
        if (char === '/' && (source[cursor + 1] === '/' || source[cursor + 1] === '*'))
            cursor = commentEnd(source, cursor);
        else if (char === '/' && startsRegex(source, cursor))
            cursor = regexEnd(source, cursor);
        else if (char === '"' || char === "'" || char === '`') {
            const result = stringRegion(source, cursor);
            regions.push(result.region);
            cursor = result.next;
        }
        else
            cursor++;
    }
    return regions;
}
export function scriptRegion(source, offset, language) {
    const region = scriptRegions(source, language).find(value => offset >= value.start && offset <= value.end
        && !value.holes.some(hole => offset >= hole.start && offset < hole.end));
    if (!region)
        return undefined;
    let decoded = 0;
    while (decoded < region.source.length && region.offsets[decoded + 1] <= offset)
        decoded++;
    return { ...region, offset: decoded };
}
export function documentOffset(region, offset) {
    return region.offsets[Math.max(0, Math.min(region.source.length, offset))];
}
export function documentDiagnostics(source, language, definitions) {
    return scriptRegions(source, language).filter(region => !region.dynamic && (language === 'yuzuha' || /\$[A-Za-z_]/.test(region.source)))
        .flatMap(region => diagnose(region.source, definitions).map(value => diagnostic(source, value.code, value.message, documentOffset(region, value.start), documentOffset(region, value.end))));
}
/** A catalog is JSON data with the shape { version: 1, functions: [...] }. */
export function parseFunctionCatalog(source) {
    if (source.length > 2_000_000)
        throw new Error('Catálogo excede 2000000 caracteres.');
    const parsed = JSON.parse(source);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
        || Object.keys(parsed).some(key => key !== 'version' && key !== 'functions')
        || !('version' in parsed) || parsed.version !== 1 || !('functions' in parsed) || !Array.isArray(parsed.functions)) {
        throw new Error('Catálogo precisa de version: 1 e functions: [].');
    }
    if (parsed.functions.length > 5000)
        throw new Error('Catálogo excede 5000 funções.');
    const definitions = parsed.functions.map((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('Metadados de função inválidos.');
        const fields = ['name', 'aliases', 'usage', 'description', 'category', 'minArgs', 'maxArgs'];
        if (Object.keys(value).some(key => !fields.includes(key)))
            throw new Error('Campo de função desconhecido no catálogo.');
        const fn = value;
        if (typeof fn.name !== 'string' || !/^[A-Za-z_][A-Za-z_0-9]{0,63}$/.test(fn.name)
            || !Number.isSafeInteger(fn.minArgs) || !Number.isSafeInteger(fn.maxArgs)
            || fn.minArgs < 0 || fn.maxArgs < fn.minArgs
            || fn.maxArgs > 1000)
            throw new Error('Nome ou aridade inválidos no catálogo.');
        for (const [field, limit] of [['usage', 1000], ['description', 4000], ['category', 100]]) {
            if (typeof fn[field] !== 'string' || fn[field].length > limit || !fn[field].trim()) {
                throw new Error(`Campo ${field} inválido no catálogo.`);
            }
        }
        if (fn.aliases !== undefined && (!Array.isArray(fn.aliases) || fn.aliases.length > 100
            || !fn.aliases.every(alias => typeof alias === 'string' && /^[A-Za-z_][A-Za-z_0-9]{0,63}$/.test(alias)))) {
            throw new Error('Aliases inválidos no catálogo.');
        }
        return { name: fn.name, minArgs: fn.minArgs, maxArgs: fn.maxArgs,
            usage: fn.usage, description: fn.description, category: fn.category,
            ...(fn.aliases === undefined ? {} : { aliases: [...fn.aliases] }) };
    });
    return mergeFunctionCatalogs(definitions);
}
export function mergeFunctionCatalogs(...catalogs) {
    const names = new Set();
    return catalogs.flatMap(catalog => catalog.map(fn => {
        for (const name of [fn.name, ...fn.aliases ?? []]) {
            const normalized = name.toLowerCase();
            if (names.has(normalized))
                throw new Error(`Função ou alias duplicado: $${name}.`);
            names.add(normalized);
        }
        return { ...fn, ...(fn.aliases ? { aliases: [...fn.aliases] } : {}) };
    }));
}
//# sourceMappingURL=language.js.map