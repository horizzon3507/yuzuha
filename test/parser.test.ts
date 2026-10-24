import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/scripting/parser.js';
import { ScriptError } from '../src/errors.js';

test('text runs preserve delimiters, escapes, nested literals and source offsets', () => {
  const prefix = 'Olá; '.repeat(100);
  const source = prefix + String.raw`$f[abc\;def;[x;[y]];$g[é]] tail\$literal`;
  const program = parse(source);
  assert.deepEqual(program.nodes, [
    { kind: 'text', value: prefix, offset: 0 },
    { kind: 'call', name: 'f', offset: prefix.length, args: [
      [{ kind: 'text', value: 'abc;def', offset: prefix.length + 3 }],
      [{ kind: 'text', value: '[x;[y]]', offset: prefix.length + 12 }],
      [{ kind: 'call', name: 'g', offset: prefix.length + 20, args: [
        [{ kind: 'text', value: 'é', offset: prefix.length + 23 }],
      ] }],
    ] },
    { kind: 'text', value: ' tail$literal', offset: prefix.length + 26 },
  ]);
});

test('text scanning keeps bare dollars, unknown escapes and top-level semicolons literal', () => {
  const source = String.raw`a$1;b\qc;$;d` + '\\';
  assert.deepEqual(parse(source).nodes, [{ kind: 'text', value: source, offset: 0 }]);
});

test('closing brackets after long text retain their diagnostic position', () => {
  const source = 'long text '.repeat(200) + ']';
  assert.throws(() => parse(source, 'long.yz'), (error: unknown) => {
    assert.ok(error instanceof ScriptError);
    assert.equal(error.code, 'SYNTAX');
    assert.equal(error.offset, source.length - 1);
    return true;
  });
});
