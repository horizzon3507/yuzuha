import { YuzuhaError } from '../shared/errors.js';

const MAX_DIGITS = 1000;
interface Decimal { coefficient: bigint; scale: number }

function parse(value: string): Decimal {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new YuzuhaError('DECIMAL', 'Informe um decimal sem expoente, usando ponto.');
  const digits = match[2]! + (match[3] ?? '');
  if (digits.length > MAX_DIGITS) throw new YuzuhaError('EXECUTION_LIMIT', `Decimal excede ${MAX_DIGITS} dígitos.`);
  return { coefficient: BigInt((match[1] === '-' ? '-' : '') + digits), scale: match[3]?.length ?? 0 };
}

function places(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_DIGITS) throw new YuzuhaError('DECIMAL', `Casas deve ser um inteiro de 0 a ${MAX_DIGITS}.`);
  return value;
}

function pow(exponent: number): bigint { return 10n ** BigInt(exponent); }
function abs(value: bigint): bigint { return value < 0n ? -value : value; }

function quotient(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new YuzuhaError('DECIMAL', 'Divisão por zero.');
  const result = numerator / denominator;
  if (abs(numerator % denominator) * 2n < abs(denominator)) return result;
  return result + ((numerator < 0n) !== (denominator < 0n) ? -1n : 1n);
}

function rounded(value: Decimal, scale: number): Decimal {
  places(scale);
  return value.scale <= scale ? value : { coefficient: quotient(value.coefficient, pow(value.scale - scale)), scale };
}

function format(value: Decimal): string {
  let { coefficient, scale } = value;
  if (coefficient === 0n) return '0';
  while (scale > 0 && coefficient % 10n === 0n) { coefficient /= 10n; scale--; }
  const negative = coefficient < 0n;
  const digits = abs(coefficient).toString().padStart(scale + 1, '0');
  if (digits.length > MAX_DIGITS) throw new YuzuhaError('EXECUTION_LIMIT', `Resultado decimal excede ${MAX_DIGITS} dígitos.`);
  const result = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  return negative ? `-${result}` : result;
}

export function decimalCompare(left: string, right: string): number {
  const a = parse(left), b = parse(right), scale = Math.max(a.scale, b.scale);
  const x = a.coefficient * pow(scale - a.scale), y = b.coefficient * pow(scale - b.scale);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function decimalRound(input: string, scale: number): string { return format(rounded(parse(input), scale)); }

export function decimal(left: string, operator: string, right: string, scale?: number): string {
  const a = parse(left), b = parse(right);
  if (scale !== undefined) places(scale);
  const common = Math.max(a.scale, b.scale);
  const x = a.coefficient * pow(common - a.scale), y = b.coefficient * pow(common - b.scale);
  let result: Decimal;
  switch (operator) {
    case '+': result = { coefficient: x + y, scale: common }; break;
    case '-': result = { coefficient: x - y, scale: common }; break;
    case '*': result = { coefficient: a.coefficient * b.coefficient, scale: a.scale + b.scale }; break;
    case '%':
      if (!y) throw new YuzuhaError('DECIMAL', 'Divisão por zero.');
      result = { coefficient: x % y, scale: common }; break;
    case '/': {
      const outputScale = scale ?? 18;
      const exponent = b.scale + outputScale - a.scale;
      result = { coefficient: quotient(a.coefficient * pow(Math.max(0, exponent)), b.coefficient * pow(Math.max(0, -exponent))), scale: outputScale };
      break;
    }
    default: throw new YuzuhaError('DECIMAL', 'Operador deve ser +, -, *, / ou %.');
  }
  return format(scale === undefined ? result : rounded(result, scale));
}
