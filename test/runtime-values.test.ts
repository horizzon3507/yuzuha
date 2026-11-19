import test from 'node:test';
import assert from 'node:assert/strict';
import { truthy } from '../src/functions/runtime/values.js';

function originalTruthy(value: string): boolean {
  const match = /^(.*?)\s*(==|!=|>=|<=|>|<)\s*(.*?)$/.exec(value);
  if (match) {
    const left = match[1]!.trim(), right = match[3]!.trim();
    switch (match[2]) {
      case '==': return left === right;
      case '!=': return left !== right;
      case '>': return Number(left) > Number(right);
      case '<': return Number(left) < Number(right);
      case '>=': return Number(left) >= Number(right);
      case '<=': return Number(left) <= Number(right);
    }
  }
  return !['', 'false', '0', 'null', 'undefined'].includes(value.trim().toLowerCase());
}

test('truthy preserves comparison grammar including malformed operators and line terminators', () => {
  const operands = ['', ' ', '0', '1', '-2', '1e2', 'NaN', 'false', 'a', '\n', '\r', '\u2028', '\u2029', 'a\nb'];
  const operators = ['', '=', '!', '==', '!=', '>', '<', '>=', '<=', '===', '!==', '=>', '><'];
  for (const left of operands) for (const operator of operators) for (const right of operands) {
    const value = `${left}${operator}${right}`;
    assert.equal(truthy(value), originalTruthy(value), JSON.stringify(value));
    for (const padding of [31, 32, 33, 64]) {
      const padded = 'x'.repeat(padding) + value;
      assert.equal(truthy(padded), originalTruthy(padded), JSON.stringify(padded));
    }
  }
});

test('truthy handles empty, false-like, ordinary and non-string values', () => {
  for (const value of ['', ' ', '\n\t', 'false', ' FALSE ', '0', 'null', 'undefined']) assert.equal(truthy(value), false);
  for (const value of ['hello', 'x'.repeat(8192), '!', '=', '00', 'false!', '$throw[x]']) assert.equal(truthy(value), true);
  for (const value of [undefined, null, false, 0, NaN]) assert.equal(truthy(value), false);
  for (const value of [true, 1, [], {}]) assert.equal(truthy(value), true);
});
