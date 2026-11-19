import { CDN_URL, STATIC_CDN_URL, ClientClusterEvents, DEFAULT_CACHE_LIMITS, DEFAULT_INSTANCE_ENDPOINTS,
  Events, INSTANCE_DISCOVERY_PATH } from '@fluxerjs/core';
import { MessagePayload } from '@fluxerjs/builders';
import {
  APIErrorCode, AuditLogActionType, ChannelType, ContentWarningLevel, DefaultMessageNotifications, EmbedMediaFlags,
  ForumLayout, ForumSortOrder, ForumTagSetting, GatewayDispatchEvents, GatewayErrorCodes, GatewayIdentifyFlags,
  GatewayOpcodes, GuildExplicitContentFilter, GuildMemberProfileFlags, GuildMFALevel, GuildNSFWLevel, GuildOperations,
  GuildVerificationLevel, InviteType, MessageAttachmentFlags, MessageFlags, MessageReferenceType, MessageType,
  OverwriteType, PublicUserFlags, RelationshipType, SplashCardAlignment, SystemChannelFlags, ThreadAutoArchiveDuration,
  ThreadMemberFlags, WebhookType,
} from '@fluxerjs/types';
import { ALL_PERMISSIONS_BIGINT, BitField, ErrorCodes, FLUXER_EPOCH, MessageFlagsBits, PermissionFlags, UserFlagsBits } from '@fluxerjs/util';
import { GuardError } from '../../errors.js';
import { defineFunctions } from './definition.js';

const constants = {
  APIErrorCode, AuditLogActionType, ChannelType, ContentWarningLevel, DefaultMessageNotifications, EmbedMediaFlags,
  ForumLayout, ForumSortOrder, ForumTagSetting, GatewayDispatchEvents, GatewayErrorCodes, GatewayIdentifyFlags,
  GatewayOpcodes, GuildExplicitContentFilter, GuildMemberProfileFlags, GuildMFALevel, GuildNSFWLevel, GuildOperations,
  GuildVerificationLevel, InviteType, MessageAttachmentFlags, MessageFlags, MessageReferenceType, MessageType,
  OverwriteType, PublicUserFlags, RelationshipType, SplashCardAlignment, SystemChannelFlags, ThreadAutoArchiveDuration,
  ThreadMemberFlags, WebhookType, CDN_URL, STATIC_CDN_URL, ClientClusterEvents, DEFAULT_CACHE_LIMITS,
  DEFAULT_INSTANCE_ENDPOINTS, Events, INSTANCE_DISCOVERY_PATH, ALL_PERMISSIONS_BIGINT, ErrorCodes, FLUXER_EPOCH,
  ContentMaxLength: MessagePayload.ContentMaxLength, DefaultBit: BitField.DefaultBit, MessageFlagsBits,
  PermissionFlags, UserFlagsBits,
};
const constantValues = new Map(Object.entries(constants).map(([name, value]) => [
  name, JSON.parse(JSON.stringify(value, (_, item: unknown) => typeof item === 'bigint' ? String(item) : item)) as unknown,
]));

const families: Readonly<Record<string, Readonly<Record<string, number | bigint>>>> = {
  bits: BitField.Flags, permissions: PermissionFlags, message: MessageFlagsBits, user: UserFlagsBits,
  publicUser: PublicUserFlags, systemChannel: SystemChannelFlags, threadMember: ThreadMemberFlags,
  memberProfile: GuildMemberProfileFlags, attachment: MessageAttachmentFlags, embedMedia: EmbedMediaFlags,
  gatewayIdentify: GatewayIdentifyFlags, guildOperations: GuildOperations,
};
const flagTables = new Map(Object.entries(families).map(([family, table]) => [
  family, new Map(Object.entries(table).filter(([, value]) => typeof value !== 'string')
    .map(([name, value]) => [name, BigInt(value)])),
]));
const MAX_BITS = (1n << 128n) - 1n;

function invalid(message: string): never { throw new GuardError(message, 'INVALID_ARGUMENT'); }

function resolve(value: unknown, flags: ReadonlyMap<string, bigint>): bigint {
  let remaining = 128;
  function read(item: unknown, depth: number): bigint {
    if (--remaining < 0 || depth > 4) invalid('Lista de flags excede 128 valores ou profundidade 4.');
    if (Array.isArray(item)) return item.reduce<bigint>((mask, entry) => mask | read(entry, depth + 1), 0n);
    if (typeof item === 'string') {
      const flag = flags.get(item);
      if (flag !== undefined) return flag;
      if (/^(0|[1-9]\d{0,38})$/.test(item)) item = BigInt(item);
    }
    if (typeof item === 'number' && Number.isSafeInteger(item)) item = BigInt(item);
    if (typeof item !== 'bigint' || item < 0n || item > MAX_BITS)
      return invalid('Flag desconhecida ou máscara fora de 128 bits; use texto decimal para inteiros grandes.');
    return item;
  }
  return read(value, 0);
}

export const pureFlagFunctions = defineFunctions(fn => {
  fn('sdkConstant', 'sdk', 1, 2, '[nome;chave?]',
    'Lê uma constante ou chave própria da lista permitida do SDK (ex.: ChannelType, ErrorCodes, DEFAULT_INSTANCE_ENDPOINTS). BigInt vira texto decimal; chave ausente retorna null.',
    async c => {
      const name = await c.text(0);
      if (!constantValues.has(name)) invalid('Constante SDK desconhecida.');
      const value = constantValues.get(name);
      if (c.count === 1) return structuredClone(value);
      const key = await c.text(1);
      return value !== null && typeof value === 'object' && Object.hasOwn(value, key)
        ? (value as Record<string, unknown>)[key] : null;
    });
  fn('flags', 'sdk', 2, 4, '[família;operação;máscara?;outra?]',
    'Famílias: bits, permissions, message, user, publicUser, systemChannel, threadMember, memberProfile, attachment, embedMedia, gatewayIdentify, guildOperations. Operações: table, resolve, add, remove, equals, has, any, missing, names, serialize. Máscaras até 128 bits: nome, decimal ou lista (128 valores, 4 níveis); máscaras retornam texto decimal. Em permissions, Administrator implica todas nas consultas.',
    async c => {
      const family = await c.text(0);
      const flags = flagTables.get(family);
      if (!flags) return invalid('Família de flags desconhecida.');
      const op = await c.text(1);
      if (op === 'table' && c.count === 2) return Object.fromEntries([...flags].map(([key, bit]) => [key, String(bit)]));
      if (['resolve', 'names', 'serialize'].includes(op) && c.count === 3) {
        const mask = resolve(await c.arg(2), flags);
        if (op === 'resolve') return String(mask);
        if (op === 'names') return [...flags].filter(([, bit]) => (mask & bit) === bit).map(([key]) => key);
        return Object.fromEntries([...flags].map(([key, bit]) => [key, (mask & bit) === bit]));
      }
      if (c.count === 4 && ['add', 'remove', 'equals', 'has', 'any', 'missing'].includes(op)) {
        const mask = resolve(await c.arg(2), flags);
        const other = resolve(await c.arg(3), flags);
        const admin = family === 'permissions' && (mask & PermissionFlags.Administrator) !== 0n;
        switch (op) {
          case 'add': return String(mask | other);
          case 'remove': return String(mask & ~other);
          case 'equals': return mask === other;
          case 'has': return admin || (mask & other) === other;
          case 'any': return admin || (mask & other) !== 0n;
          case 'missing': {
            if (admin) return [];
            const missing = other & ~mask;
            return [...flags].filter(([, bit]) => (missing & bit) === bit).map(([key]) => key);
          }
        }
      }
      return invalid('Operação ou argumentos de flags inválidos.');
    });
});
