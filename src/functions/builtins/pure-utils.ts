import { DEFAULT_CACHE_LIMITS, normalizeCacheLimit, resolveCacheLimits } from '@fluxerjs/core';
import { isGroupDmInvite, isGuildInvite, isUploadedAttachment } from '@fluxerjs/types';
import {
  asRecord, formatColor, formatEmoji, formatTimestamp, getUnicodeFromShortcode, isRecord, num, parseEmoji,
  parsePrefixCommand, parseRoleMention, parseUserMention, resolveColor, SnowflakeUtil, str, truncate,
} from '@fluxerjs/util';
import { GuardError } from '../../errors.js';
import { defineFunctions } from './definition.js';

function invalid(label: string): never { throw new GuardError(`Valor inválido para ${label}.`, 'INVALID_ARGUMENT'); }

function number(value: unknown): number {
  if (typeof value === 'string' && /^-?\d{1,16}(?:\.\d{1,12})?$/.test(value)) value = Number(value);
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
    return invalid('número finito seguro');
  return value;
}

export const pureUtilFunctions = defineFunctions(fn => {
  fn('sdkParse', 'sdk', 2, 3, '[operação;valor;prefixo?]',
    'Analisa valores sem rede. Operações: prefix (texto;prefixo), userMention, roleMention, emoji, shortcode, guildInvite, groupDmInvite, uploadedAttachment, isRecord, record, number e string. Tipos incompatíveis retornam null ou false.',
    async c => {
      const op = await c.text(0);
      if (c.count !== (op === 'prefix' ? 3 : 2)) invalid('argumentos de análise');
      const value = await c.arg(1);
      switch (op) {
        case 'prefix': return parsePrefixCommand(value as string, await c.arg(2) as string);
        case 'userMention': return parseUserMention(value as string);
        case 'roleMention': return parseRoleMention(value as string);
        case 'emoji': return parseEmoji(value as string);
        case 'shortcode': {
          const result = typeof value === 'string' ? getUnicodeFromShortcode(value) : undefined;
          return typeof result === 'string' ? result : null;
        }
        case 'guildInvite': return isRecord(value) && isGuildInvite(value as unknown as Parameters<typeof isGuildInvite>[0]);
        case 'groupDmInvite': return isRecord(value) && isGroupDmInvite(value as unknown as Parameters<typeof isGroupDmInvite>[0]);
        case 'uploadedAttachment': return isRecord(value) && isUploadedAttachment(value as unknown as Parameters<typeof isUploadedAttachment>[0]);
        case 'isRecord': return isRecord(value);
        case 'record': return asRecord(value);
        case 'number': return num(value) ?? null;
        case 'string': return str(value) ?? null;
        default: return invalid('operação de análise SDK');
      }
    });
  fn('sdkFormat', 'sdk', 2, 4, '[operação;valor;opção?;sufixo?]',
    'Formata valores: color (inteiro→hex), resolveColor (hex, RGB ou inteiro tipado), timestamp (epoch em ms;estilo?), emoji (objeto de parseEmoji), truncate (texto;limite;sufixo?).', async c => {
    const op = await c.text(0);
    if ((c.count > 2 && !['timestamp', 'truncate'].includes(op)) || (c.count > 3 && op !== 'truncate'))
      invalid('argumentos de formatação');
    const value = await c.arg(1);
    switch (op) {
      case 'color': return formatColor(number(value));
      case 'resolveColor': return resolveColor(value as Parameters<typeof resolveColor>[0]);
      case 'timestamp': {
        const style = c.count === 3 ? await c.text(2) : '';
        if (style && !/^[tTdDfFR]$/.test(style)) invalid('estilo de timestamp');
        return formatTimestamp(number(value), (style || undefined) as Parameters<typeof formatTimestamp>[1]);
      }
      case 'emoji': {
        if (!isRecord(value) || typeof value.name !== 'string' || !value.name
          || (value.id != null && (typeof value.id !== 'string' || !/^\d{1,20}$/.test(value.id)))
          || (value.animated !== undefined && typeof value.animated !== 'boolean')) invalid('objeto de emoji');
        return formatEmoji({ name: value.name, id: value.id ?? null, animated: value.animated });
      }
      case 'truncate': {
        const max = number(await c.arg(2));
        if (typeof value !== 'string' || !Number.isSafeInteger(max) || max < 0) invalid('texto ou limite');
        return truncate(value, max, c.count === 4 ? await c.text(3) : undefined);
      }
      default: return invalid('operação de formatação SDK');
    }
  });
  fn('snowflake', 'sdk', 2, 2, '[operação;valor]',
    'Operações: valid, parse (decimal exato como texto), timestamp (ms), date (ISO), deconstruct (campos e data ISO), fromTimestamp (ms→decimal). Use texto para IDs grandes.', async c => {
    const op = await c.text(0);
    const raw = await c.arg(1);
    if (op === 'fromTimestamp') return SnowflakeUtil.snowflakeFromTimestamp(number(raw));
    if (op === 'valid') return SnowflakeUtil.isValid(raw as string);
    if (typeof raw !== 'string' || !SnowflakeUtil.isValid(raw)) return invalid('snowflake decimal');
    switch (op) {
      case 'parse': return String(SnowflakeUtil.parse(raw));
      case 'timestamp': return SnowflakeUtil.timestampFromSnowflake(raw);
      case 'date': return SnowflakeUtil.dateFromSnowflake(raw).toISOString();
      case 'deconstruct': {
        const parts = SnowflakeUtil.deconstruct(raw);
        return { ...parts, date: parts.date.toISOString() };
      }
      default: return invalid('operação de snowflake');
    }
  });
  fn('sdkCacheLimit', 'sdk', 1, 3, '[normalizeOuResolve;valor?;padrão?]',
    'Calcula limites de cache sem ler ou alterar o cache real: normalize (valor ou vazio;padrão) ou resolve (objeto opcional). null representa limite infinito.', async c => {
    const op = await c.text(0);
    const value = await c.arg(1);
    const finite = (n: number) => Number.isFinite(n) ? n : null;
    if (op === 'normalize' && c.count === 3)
      return finite(normalizeCacheLimit(value === '' || value === null ? undefined : number(value), number(await c.arg(2))));
    if (op !== 'resolve' || c.count > 2 || (c.count === 2 && !isRecord(value))) return invalid('configuração de cache');
    const options = Object.fromEntries(Object.entries(isRecord(value) ? value : {}).map(([key, entry]) => {
      if (!Object.hasOwn(DEFAULT_CACHE_LIMITS, key)) invalid('chave de cache');
      return [key, key === 'messages' && entry === false ? false : number(entry)];
    }));
    const zeroMessages = options.messages === 0;
    // O SDK emite um aviso de configuração para zero; a variante de script apenas calcula valores.
    if (zeroMessages) options.messages = -1;
    const { cache, limits } = resolveCacheLimits(options);
    if (zeroMessages) cache.messages = 0;
    return { cache, limits: { ...limits, ...Object.fromEntries(Object.entries(limits)
      .filter(([, limit]) => limit === Infinity).map(([key]) => [key, null])) } };
  });
});
