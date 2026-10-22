import test from 'node:test';
import assert from 'node:assert/strict';
import { nextCron, parseCron, assertTimezone } from '../src/domain/cron.js';
import { decodeState, emptyState } from '../src/domain/state-validation.js';

const next = (expression: string, timezone: string, after: string): string => new Date(nextCron(expression, timezone, Date.parse(after))).toISOString();

test('cron aceita cinco campos numéricos, listas, faixas, passos e domingo 0/7', () => {
  const parsed = parseCron('5,20-30/5 */6 * 1,6-8 0,7');
  assert.deepEqual(parsed.minutes, [5, 20, 25, 30]);
  assert.deepEqual(parsed.hours, [0, 6, 12, 18]);
  assert.deepEqual(parsed.months, [1, 6, 7, 8]);
  assert.deepEqual(parsed.weekdays, [0]);
  assert.deepEqual(parseCron('10/20 * * * *').minutes, [10, 30, 50]);
  assert.equal(next('0 18 * * *', 'America/Bahia', '2026-10-21T20:59:59Z'), '2026-10-21T21:00:00.000Z');
  assert.equal(next('0 18 * * *', 'America/Bahia', '2026-10-21T21:00:00Z'), '2026-10-22T21:00:00.000Z');
});

test('cron combina dia do mês e da semana restritos com OR, e wildcard com AND', () => {
  assert.equal(next('0 0 1 * 1', 'UTC', '2026-09-02T00:00:00Z'), '2026-09-07T00:00:00.000Z');
  assert.equal(next('0 0 1 * 1', 'UTC', '2026-09-29T00:00:00Z'), '2026-10-01T00:00:00.000Z');
  assert.equal(next('0 0 * * 1', 'UTC', '2026-09-02T00:00:00Z'), '2026-09-07T00:00:00.000Z');
  assert.equal(next('0 0 29 2 *', 'UTC', '2026-01-01T00:00:00Z'), '2028-02-29T00:00:00.000Z');
});

test('cron pula lacunas de DST e executa as duas ocorrências no recuo do relógio', () => {
  assert.equal(next('30 2 * * *', 'America/New_York', '2026-03-07T07:30:00Z'), '2026-03-09T06:30:00.000Z');
  const first = next('30 1 * * *', 'America/New_York', '2026-11-01T04:00:00Z');
  assert.equal(first, '2026-11-01T05:30:00.000Z');
  const second = next('30 1 * * *', 'America/New_York', first);
  assert.equal(second, '2026-11-01T06:30:00.000Z');
  assert.equal(next('30 1 * * *', 'America/New_York', second), '2026-11-02T06:30:00.000Z');
  assert.equal(next('15 2 * * *', 'Australia/Lord_Howe', '2026-10-02T15:45:00Z'), '2026-10-04T15:15:00.000Z');
});

test('cron rejeita expressões, fusos e instantes inválidos e limita busca de ocorrências', () => {
  for (const expression of ['', '@daily', '* * * * * *', '60 * * * *', '* 24 * * *', '0 0 0 * *', '0 0 * 13 *', '0 0 * * 8',
    '*/0 * * * *', '*/100 * * * *', '10-2 * * * *', '1,,2 * * * *', '0 0 L * *', '0 0 31 2 *', '0 0 31 4 *', '1'.repeat(257)]) {
    assert.throws(() => parseCron(expression), { name: 'YuzuhaError' });
  }
  for (const timezone of ['', 'not/a/timezone', '+02:00']) assert.throws(() => assertTimezone(timezone), { code: 'CRON_TIMEZONE' });
  assert.throws(() => nextCron('* * * * *', 'UTC', Infinity), { code: 'CRON' });
  // A Sunday leap day after 2032 is outside the documented eight-year search window.
  assert.throws(() => nextCron('0 0 29 2 */7', 'UTC', Date.parse('2032-03-01T00:00:00Z')), { code: 'CRON_UNREACHABLE' });
});

test('decode frio rejeita cron inválido sem aceitar estado parcialmente validado', () => {
  const task = { id: '1', guildID: '100', channelID: '200', authorID: '1', command: 'ping', input: '', due: 0, attempts: 0,
    cron: '0 18 * * *', timezone: 'America/Bahia', missedRun: 'skip' };
  for (const patch of [{ cron: '0 0 31 2 *' }, { timezone: '+03:00' }, { interval: 100 }, { missedRun: 'all' }, { retryJitter: 2 }, { timezone: null }]) {
    const state = { ...emptyState(), schedules: [{ ...task, ...patch }] };
    assert.throws(() => decodeState(JSON.stringify(state)), { code: 'STORE_CORRUPT' });
  }
  assert.equal(decodeState(JSON.stringify({ ...emptyState(), schedules: [task] })).schedules[0]?.timezone, 'America/Bahia');
});

test('reuso e rotação de fusos mantêm validação e resultados independentes', () => {
  for (const timezone of Intl.supportedValuesOf('timeZone').slice(0, 70)) assertTimezone(timezone);
  assertTimezone('America/Bahia'); assertTimezone('America/Bahia');
  assert.throws(() => assertTimezone('not/a/timezone'), { code: 'CRON_TIMEZONE' });
  assert.equal(next('0 18 * * *', 'America/Bahia', '2026-10-21T20:59:59Z'), '2026-10-21T21:00:00.000Z');
  const parsed = parseCron('0 * * * *');
  (parsed.minutes as number[])[0] = 59;
  assert.deepEqual(parseCron('0 * * * *').minutes, [0]);
});
