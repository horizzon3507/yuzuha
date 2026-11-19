import { instanceDiscoveryUrl, normalizeApiOrigin, parseInstanceDiscovery, resolveInstanceEndpoints } from '@fluxerjs/core';
import { GuardError } from '../../errors.js';
import type { FunctionCall } from '../runtime/types.js';
import { defineFunctions } from './definition.js';

function invalid(field: string): never {
  throw new GuardError(`Valor inválido para ${field}.`, 'INVALID_ARGUMENT');
}

function id(value: unknown): string {
  if (typeof value === 'string' && /^\d{1,20}$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return invalid('ID (use texto para snowflakes grandes)');
}

function hash(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value === 'string' && /^[\w-]{1,128}$/.test(value)) return value;
  return invalid('hash');
}

function httpBase(raw: string): string {
  raw = raw.trim();
  if (raw.length > 2048 || !/^https?:\/\//i.test(raw) || raw.includes('\\')) return invalid('URL base HTTP(S)');
  const url = URL.parse(raw);
  if (!url || !['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    return invalid('URL base HTTP(S) sem credenciais, consulta ou fragmento');
  return raw;
}

async function assetOptions(c: FunctionCall, offset: number, kind: 'animated' | 'extension' | 'size') {
  const sizeText = await c.text(offset);
  const size = sizeText === '' ? undefined : Number(sizeText);
  if (size !== undefined && (!Number.isSafeInteger(size) || size < 1 || size > 16384)) invalid('tamanho (1–16384)');
  const extra = await c.text(offset + 1);
  if (kind === 'animated') {
    if (extra && extra !== 'true' && extra !== 'false') invalid('animado (true/false)');
    return { size, animated: extra === 'true' };
  }
  if (extra && (kind === 'size' || !/^(png|gif|jpg|jpeg|webp)$/.test(extra))) invalid('formato de imagem');
  return { size, extension: extra || undefined };
}

export const pureCdnFunctions = defineFunctions(fn => {
  fn('cdnURL', 'sdk', 1, 6, '[tipo;id?;idDoMembroOuHashOuTamanho?;hashOuTamanhoOuFormato?;tamanhoOuFormato?;formato?]',
    'Usa a instância atual, sem rede. Tipos: media/static (só a base); defaultAvatar (ID/índice); avatar/displayAvatar/banner (ID;hash?;tamanho?;formato?); memberAvatar/memberBanner (servidor;usuário;hash?;tamanho?;formato?); guildIcon/guildBanner/guildSplash (servidor;hash?;tamanho?); emoji/sticker (ID;tamanho?;animado?). Hash ausente retorna null ou o avatar padrão para displayAvatar.',
    async c => {
      const type = await c.text(0);
      const cdn = c.ctx.cdn;
      switch (type) {
        case 'media': case 'static':
          if (c.count !== 1) invalid('argumentos da base CDN');
          return cdn.endpoints[type === 'media' ? 'media' : 'static_cdn'];
        case 'defaultAvatar':
          if (c.count !== 2) invalid('argumentos do avatar padrão');
          return cdn.defaultAvatar(id(await c.arg(1)));
        case 'emoji': case 'sticker':
          if (c.count > 4) invalid('argumentos de emoji/sticker');
          return cdn[type](id(await c.arg(1)), await assetOptions(c, 2, 'animated'));
        case 'memberAvatar': case 'memberBanner':
          return cdn[type](id(await c.arg(1)), id(await c.arg(2)), hash(await c.arg(3)), await assetOptions(c, 4, 'extension'));
        case 'avatar': case 'displayAvatar': case 'banner': case 'guildIcon': case 'guildBanner': case 'guildSplash': {
          const guild = type.startsWith('guild');
          if (c.count > (guild ? 4 : 5)) invalid('argumentos do recurso CDN');
          return cdn[type](id(await c.arg(1)), hash(await c.arg(2)), await assetOptions(c, 3, guild ? 'size' : 'extension'));
        }
        default: return invalid('tipo de recurso CDN');
      }
    });
  fn('inviteURL', 'sdk', 1, 2, '[código;base?]', 'Monta URL de convite sem consultar a rede. Usa a base da instância se omitida.', async c => {
    const code = await c.text(0);
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(code)) invalid('código de convite');
    return c.ctx.cdn.invite(code, c.count === 2 ? httpBase(await c.text(1)) : undefined);
  });
  fn('instanceValue', 'sdk', 1, 2, '[operação;valor?]',
    'Calcula valores sem discovery de rede: normalize/discoveryURL (URL base), parse (documento), resolve (documento ou endpoints parciais; omitido usa padrões). Não altera o client.',
    async c => {
      const op = await c.text(0);
      if (op === 'normalize' || op === 'discoveryURL') {
        const url = httpBase(await c.text(1));
        return op === 'normalize' ? normalizeApiOrigin(url) : instanceDiscoveryUrl(url);
      }
      const value = c.count === 2 ? await c.arg(1) : undefined;
      if (op === 'parse') return parseInstanceDiscovery(value);
      if (op === 'resolve') {
        if (value !== undefined && (value === null || typeof value !== 'object' || Array.isArray(value))) invalid('endpoints da instância');
        return resolveInstanceEndpoints(value as Parameters<typeof resolveInstanceEndpoints>[0]);
      }
      return invalid('operação de instância');
    });
});
