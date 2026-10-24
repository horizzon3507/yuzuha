import test from 'node:test';
import assert from 'node:assert/strict';
import { decimal, decimalCompare, decimalRound } from '../src/index.js';

test('decimal arithmetic preserves fractional values and integers above Number precision', () => {
  assert.equal(decimal('0.1', '+', '0.2'), '0.3');
  assert.equal(decimal('9007199254740993', '+', '1'), '9007199254740994');
  assert.equal(decimal('1.25', '*', '0.08'), '0.1');
  assert.equal(decimal('-3.1', '-', '0.9'), '-4');
  assert.equal(decimal('5.5', '%', '2'), '1.5');
  assert.equal(decimal('-5.5', '%', '2'), '-1.5');
  assert.equal(decimalCompare('9007199254740993', '9007199254740992'), 1);
  assert.equal(decimalCompare('-0.0100', '-0.01'), 0);
  assert.equal(decimalCompare('-2', '-1.99'), -1);
});

test('decimal division and rounding use explicit precision and symmetric half-away rounding', () => {
  assert.equal(decimal('1', '/', '3'), '0.333333333333333333');
  assert.equal(decimal('2', '/', '3', 2), '0.67');
  assert.equal(decimal('-1', '/', '8', 2), '-0.13');
  assert.equal(decimal('1', '/', '-8', 2), '-0.13');
  assert.equal(decimal('5', '/', '2', 0), '3');
  assert.equal(decimalRound('-2.345', 2), '-2.35');
  assert.equal(decimalRound('1.000', 2), '1');
  assert.equal(decimalRound('-0.004', 2), '0');
});

test('decimal rejects invalid input, unsafe precision and resource exhaustion', () => {
  for (const value of ['Infinity', 'NaN', '1e9', '1,5', '.', '']) assert.throws(() => decimal(value, '+', '0'));
  assert.throws(() => decimal('1', '/', '0'), /zero/);
  assert.throws(() => decimal('1', '%', '0'), /zero/);
  assert.throws(() => decimal('1', '^', '2'), /Operador/);
  for (const places of [-1, 0.5, 1001, Infinity]) assert.throws(() => decimalRound('1', places), /Casas/);
  assert.throws(() => decimal('1'.repeat(1001), '+', '0'), /1000/);
  assert.throws(() => decimal('9'.repeat(1000), '+', '1'), /1000/);
});
