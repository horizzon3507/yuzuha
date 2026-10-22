import { YuzuhaError } from '../shared/errors.js';

export type MissedRunPolicy = 'skip' | 'run-once';
export interface CronExpression {
  minutes: readonly number[];
  hours: readonly number[];
  days: readonly number[];
  months: readonly number[];
  weekdays: readonly number[];
  anyDay: boolean;
  anyWeekday: boolean;
}

function field(source: string, min: number, max: number): number[] {
  const values = new Set<number>();
  for (const part of source.split(',')) {
    const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!match) throw new YuzuhaError('CRON', 'Campo cron inválido; use números, *, listas, faixas e passos.');
    const base = match[1]!;
    const step = match[2] === undefined ? 1 : Number(match[2]);
    if (!Number.isSafeInteger(step) || step < 1 || step > max - min + 1) throw new YuzuhaError('CRON', 'Passo cron fora dos limites do campo.');
    const bounds = base === '*' ? [min, max] : base.split('-').map(Number);
    const start = bounds[0]!;
    const end = bounds[1] ?? (match[2] === undefined ? start : max);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < min || end > max || start > end) {
      throw new YuzuhaError('CRON', `Campo cron deve estar entre ${min} e ${max}, com faixas crescentes.`);
    }
    for (let value = start; value <= end; value += step) values.add(value);
  }
  return [...values].sort((a, b) => a - b);
}

export function parseCron(expression: string): CronExpression {
  if (typeof expression !== 'string' || expression.length > 256) throw new YuzuhaError('CRON', 'Expressão cron inválida.');
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) throw new YuzuhaError('CRON', 'Cron precisa de cinco campos: minuto hora dia mês dia-da-semana.');
  const parsed: CronExpression = { minutes: field(parts[0]!, 0, 59), hours: field(parts[1]!, 0, 23), days: field(parts[2]!, 1, 31),
    months: field(parts[3]!, 1, 12), weekdays: [...new Set(field(parts[4]!, 0, 7).map(day => day % 7))],
    anyDay: parts[2]!.startsWith('*'), anyWeekday: parts[4]!.startsWith('*') };
  const monthLengths = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if ((parsed.anyDay || parsed.anyWeekday) && !parsed.months.some(month => parsed.days.some(day => day <= monthLengths[month - 1]!))) {
    throw new YuzuhaError('CRON_UNREACHABLE', 'Cron não corresponde a nenhuma data do calendário.');
  }
  return parsed;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timezone: string): Intl.DateTimeFormat {
  if (typeof timezone !== 'string' || !timezone || timezone.length > 100 || /^[+-]/.test(timezone)) {
    throw new YuzuhaError('CRON_TIMEZONE', 'Informe um fuso IANA, como America/Bahia ou UTC.');
  }
  const cached = formatters.get(timezone);
  if (cached) {
    formatters.delete(timezone); formatters.set(timezone, cached);
    return cached;
  }
  try {
    const value = new Intl.DateTimeFormat('en-US', { calendar: 'gregory', numberingSystem: 'latn', timeZone: timezone,
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
    formatters.set(timezone, value);
    if (formatters.size > 64) formatters.delete(formatters.keys().next().value!);
    return value;
  } catch (cause) { throw new YuzuhaError('CRON_TIMEZONE', 'Fuso IANA desconhecido.', { cause }); }
}

export function assertTimezone(timezone: string): void { formatter(timezone); }

function civil(format: Intl.DateTimeFormat, timestamp: number): number[] {
  const parts = format.formatToParts(timestamp);
  return ['year', 'month', 'day', 'hour', 'minute', 'second'].map(name => Number(parts.find(part => part.type === name)!.value));
}
function utc(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getTime();
}
function matchesDay(expression: CronExpression, date: Date): boolean {
  if (!expression.months.includes(date.getUTCMonth() + 1)) return false;
  const day = expression.days.includes(date.getUTCDate());
  const weekday = expression.weekdays.includes(date.getUTCDay());
  return expression.anyDay || expression.anyWeekday ? day && weekday : day || weekday;
}

/** Returns the first instant strictly after `after`; nonexistent local minutes are skipped, folds occur twice. */
export function nextCron(expression: string, timezone: string, after: number): number {
  const parsed = parseCron(expression);
  const format = formatter(timezone);
  if (!Number.isFinite(after) || !Number.isFinite(new Date(after).getTime())) throw new YuzuhaError('CRON', 'Instante de referência inválido.');
  const [year, month, day] = civil(format, after);
  const firstDay = utc(year!, month!, day!);
  for (let index = 0; index <= 8 * 366 + 2; index++) {
    const midnight = firstDay + index * 86400_000;
    const date = new Date(midnight);
    if (!Number.isFinite(midnight) || !Number.isFinite(date.getTime())) break;
    if (!matchesDay(parsed, date)) continue;
    const offsets = new Set<number>();
    // Sampling both sides of the local day includes both offsets at DST transitions.
    for (const delta of [-48, -24, 0, 24, 48]) {
      const sample = midnight + delta * 3600_000;
      if (!Number.isFinite(new Date(sample).getTime())) continue;
      const [y, m, d, h, min, sec] = civil(format, sample);
      offsets.add(utc(y!, m!, d!, h!, min!, sec!) - sample);
    }
    const candidates = new Set<number>();
    for (const hour of parsed.hours) for (const minute of parsed.minutes) {
      const local = midnight + hour * 3600_000 + minute * 60_000;
      for (const offset of offsets) {
        const candidate = local - offset;
        if (candidate > after && Number.isFinite(new Date(candidate).getTime())) candidates.add(candidate);
      }
    }
    for (const candidate of [...candidates].sort((a, b) => a - b)) {
      const [y, m, d, h, minute, second] = civil(format, candidate);
      if (y === date.getUTCFullYear() && m === date.getUTCMonth() + 1 && d === date.getUTCDate()
        && parsed.hours.includes(h!) && parsed.minutes.includes(minute!) && second === 0) return candidate;
    }
  }
  throw new YuzuhaError('CRON_UNREACHABLE', 'Cron não tem ocorrência nos próximos oito anos.');
}
