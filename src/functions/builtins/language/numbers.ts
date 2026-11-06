import { YuzuhaError } from '../../../errors.js';
import { defineFunctions } from '../definition.js';
import { finiteNumber, integer } from './common.js';

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function parseMoment(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === '') return Date.now();
  const timestamp = Number(trimmed);
  if (!Number.isFinite(timestamp)) throw new YuzuhaError('DATE', 'Timestamp deve ser um número em milissegundos.');
  return timestamp;
}

function dateParts(value: Date, locale: string): { date: string; time: string; datetime: string } {
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(value);
  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }).format(value);
  const datetime = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' }).format(value);
  return { date, time, datetime };
}

export const numberDateFunctions = defineFunctions(fn => {
  fn('round', 'language', 1, 2, '[valor;casas?]', 'Arredonda com casas decimais.', async c => {
    const value = finiteNumber(await c.text(0));
    const places = c.count > 1 ? integer(await c.text(1), 'Casas') : 0;
    if (places < 0 || places > 100) throw new YuzuhaError('NUMBER', 'Casas deve estar entre 0 e 100.');
    return roundTo(value, places);
  });
  fn('floor', 'language', 1, 1, '[valor]', 'Arredonda para baixo.', async c => Math.floor(finiteNumber(await c.text(0))));
  fn('ceil', 'language', 1, 1, '[valor]', 'Arredonda para cima.', async c => Math.ceil(finiteNumber(await c.text(0))));
  fn('abs', 'language', 1, 1, '[valor]', 'Valor absoluto.', async c => Math.abs(finiteNumber(await c.text(0))));
  fn('clamp', 'language', 3, 3, '[valor;mínimo;máximo]', 'Limita valor ao intervalo.', async c => {
    const value = finiteNumber(await c.text(0));
    const min = finiteNumber(await c.text(1), 'Mínimo');
    const max = finiteNumber(await c.text(2), 'Máximo');
    if (min > max) throw new YuzuhaError('NUMBER', 'Mínimo não pode ser maior que o máximo.');
    return Math.min(max, Math.max(min, value));
  });
  fn('fixed', 'language', 1, 2, '[valor;casas?]', 'Texto com casas decimais fixas.', async c => {
    const value = finiteNumber(await c.text(0));
    const places = c.count > 1 ? integer(await c.text(1), 'Casas') : 0;
    if (places < 0 || places > 100) throw new YuzuhaError('NUMBER', 'Casas deve estar entre 0 e 100.');
    return value.toFixed(places);
  });
  fn('formatNumber', 'language', 1, 2, '[valor;local?]', 'Formata número para o local informado.', async c => {
    const value = finiteNumber(await c.text(0));
    const locale = c.count > 1 ? (await c.text(1)).trim() || 'pt-BR' : 'pt-BR';
    try {
      return new Intl.NumberFormat(locale).format(value);
    } catch (cause) {
      throw new YuzuhaError('NUMBER', 'Local inválido.', { cause });
    }
  });
  fn('formatBytes', 'language', 1, 3, '[bytes;casas?;base?]', 'Formata bytes não negativos; casas 0–6, base 1024 (KiB) ou 1000 (kB).', async c => {
    const bytes = finiteNumber(await c.text(0), 'Bytes');
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new YuzuhaError('NUMBER', 'Bytes deve ser um inteiro não negativo seguro.');
    const places = decimalPlaces(c.count > 1 ? await c.text(1) : '2');
    const base = c.count > 2 ? integer(await c.text(2), 'Base') : 1024;
    if (base !== 1000 && base !== 1024) throw new YuzuhaError('NUMBER', 'Base de bytes deve ser 1000 ou 1024.');
    const units = base === 1024 ? ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] : ['B', 'kB', 'MB', 'GB', 'TB', 'PB'];
    let scaled = bytes, unit = 0;
    while (scaled >= base && unit < units.length - 1) { scaled /= base; unit++; }
    return `${Number(scaled.toFixed(places))} ${units[unit]}`;
  });
  fn('percent', 'language', 2, 3, '[parte;total;casas?]', 'Formata parte/total × 100 com %; total positivo, casas 0–6 (padrão 2).', async c => {
    const part = finiteNumber(await c.text(0), 'Parte'), total = finiteNumber(await c.text(1), 'Total');
    if (total <= 0) throw new YuzuhaError('NUMBER', 'Total deve ser positivo.');
    const value = part / total * 100;
    if (!Number.isFinite(value)) throw new YuzuhaError('NUMBER', 'Percentual fora do intervalo finito.');
    return `${value.toFixed(decimalPlaces(c.count > 2 ? await c.text(2) : '2'))}%`;
  });
  fn('toBase', 'language', 2, 2, '[inteiroDecimal;base]', 'Converte inteiro seguro ou texto decimal exato para base 2–36; até 1024 dígitos de entrada.', async c => {
    const value = await c.arg(0), base = radix(await c.text(1));
    if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new YuzuhaError('BASE', 'Número deve ser um inteiro seguro; use texto para inteiros grandes.');
    if (typeof value !== 'number' && typeof value !== 'string') throw new YuzuhaError('BASE', 'Valor deve ser inteiro ou texto decimal.');
    const digits = String(value);
    if (!/^-?\d{1,1024}$/.test(digits)) throw new YuzuhaError('BASE', 'Informe um inteiro decimal com até 1024 dígitos, sem prefixos ou espaços.');
    return BigInt(digits).toString(base);
  });
  fn('fromBase', 'language', 2, 2, '[texto;base]', 'Converte texto de base 2–36 para texto decimal exato; até 1024 dígitos, sem prefixos.', async c => {
    const value = await c.arg(0), base = radix(await c.text(1));
    if (typeof value !== 'string' || !/^-?[0-9a-zA-Z]{1,1024}$/.test(value)) throw new YuzuhaError('BASE', 'Informe texto com até 1024 dígitos, sem prefixos ou espaços.');
    const negative = value.startsWith('-'), digits = negative ? value.slice(1) : value;
    let result = 0n;
    for (const digit of digits.toLowerCase()) {
      const index = '0123456789abcdefghijklmnopqrstuvwxyz'.indexOf(digit);
      if (index >= base) throw new YuzuhaError('BASE', `Dígito inválido para base ${base}.`);
      result = result * BigInt(base) + BigInt(index);
    }
    return (negative ? -result : result).toString(10);
  });
  fn('date', 'language', 0, 3, '[timestamp?;formato?;local?]', 'Formata data; timestamp em ms, formato date/time/datetime/iso/relative.', async c => {
    const timestamp = c.count > 0 ? parseMoment(await c.text(0)) : Date.now();
    const format = c.count > 1 ? (await c.text(1)).trim().toLowerCase() || 'iso' : 'iso';
    const locale = c.count > 2 ? (await c.text(2)).trim() || 'pt-BR' : 'pt-BR';
    const value = new Date(timestamp);
    if (Number.isNaN(value.getTime())) throw new YuzuhaError('DATE', 'Data inválida.');
    if (format === 'iso') return value.toISOString();
    if (format === 'date' || format === 'time' || format === 'datetime') {
      try {
        return dateParts(value, locale)[format];
      } catch (cause) {
        throw new YuzuhaError('DATE', 'Local inválido.', { cause });
      }
    }
    if (format === 'relative') {
      try {
        const { amount, unit } = relativeAmount(timestamp);
        return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(amount, unit);
      } catch (cause) {
        throw new YuzuhaError('DATE', 'Local inválido.', { cause });
      }
    }
    throw new YuzuhaError('DATE', 'Formato deve ser iso, date, time, datetime ou relative.');
  });
  fn('relativeTime', 'language', 1, 2, '[timestamp;local?]', 'Descreve distância até agora, ex. "há 2 dias".', async c => {
    const timestamp = parseMoment(await c.text(0));
    const locale = c.count > 1 ? (await c.text(1)).trim() || 'pt-BR' : 'pt-BR';
    try {
      const { amount, unit } = relativeAmount(timestamp);
      return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(amount, unit);
    } catch (cause) {
      throw new YuzuhaError('DATE', 'Local inválido.', { cause });
    }
  });
  fn('parseDate', 'language', 1, 1, '[texto]', 'Converte texto de data em milissegundos; erro se inválido.', async c => {
    const raw = (await c.text(0)).trim();
    const timestamp = Date.parse(raw);
    if (!raw || Number.isNaN(timestamp)) throw new YuzuhaError('DATE', 'Data inválida.');
    return timestamp;
  });
});

function relativeAmount(timestamp: number): { amount: number; unit: Intl.RelativeTimeFormatUnit } {
  const diff = timestamp - Date.now();
  const abs = Math.abs(diff);
  const table: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
    { unit: 'year', ms: 365 * 24 * 3_600_000 },
    { unit: 'month', ms: 30 * 24 * 3_600_000 },
    { unit: 'day', ms: 24 * 3_600_000 },
    { unit: 'hour', ms: 3_600_000 },
    { unit: 'minute', ms: 60_000 },
    { unit: 'second', ms: 1000 },
  ];
  for (const entry of table) {
    if (abs >= entry.ms || entry.unit === 'second') return { amount: Math.round(diff / entry.ms), unit: entry.unit };
  }
  return { amount: 0, unit: 'second' };
}

function decimalPlaces(raw: string): number {
  const places = integer(raw, 'Casas');
  if (places < 0 || places > 6) throw new YuzuhaError('NUMBER', 'Casas deve estar entre 0 e 6.');
  return places;
}

function radix(raw: string): number {
  const base = integer(raw, 'Base');
  if (base < 2 || base > 36) throw new YuzuhaError('BASE', 'Base deve estar entre 2 e 36.');
  return base;
}
