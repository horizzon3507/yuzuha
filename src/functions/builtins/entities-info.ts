import { GuardError, YuzuhaError } from '../../errors.js';
import type { FunctionCall } from '../runtime/types.js';
import { defineFunctions } from './definition.js';

const USER = ['id', 'username', 'displayName', 'bot', 'avatarURL', 'bannerURL', 'createdTimestamp',
  'avatar', 'banner', 'avatarColor', 'discriminator', 'flags', 'globalName', 'system'];
const MEMBER = [...USER, 'nickname', 'joinedTimestamp', 'roles', 'permissions', 'timedOutUntil',
  'guildID', 'partial', 'deaf', 'mute', 'profileFlags', 'mentionFlags'];
const GUILD = ['id', 'name', 'ownerID', 'iconURL', 'bannerURL', 'memberCount', 'createdTimestamp', 'features',
  'available', 'afkChannelId', 'afkTimeout', 'banner', 'bannerHeight', 'bannerWidth', 'icon', 'splash', 'splashURL',
  'splashHeight', 'splashWidth', 'splashCardAlignment', 'embedSplash', 'verificationLevel', 'mfaLevel', 'nsfwLevel',
  'nsfw', 'contentWarningLevel', 'contentWarningText', 'disabledOperations', 'defaultMessageNotifications',
  'explicitContentFilter', 'messageHistoryCutoff', 'systemChannelFlags', 'systemChannelId', 'rulesChannelId',
  'vanityURLCode', 'onlineCount'];
const CHANNEL = ['id', 'name', 'type', 'guildID', 'parentID', 'position', 'topic', 'slowmode', 'nsfw', 'url',
  'recipientIDs', 'ownerID', 'contentWarningLevel', 'contentWarningText', 'createdTimestamp', 'icon',
  'lastPinTimestamp', 'lastMessageId', 'nsfwOverride', 'bitrate', 'userLimit', 'voiceConnectionLimit', 'rtcRegion',
  'defaultAutoArchiveDuration', 'defaultThreadRateLimitPerUser', 'defaultForumLayout', 'nicks', 'permissionOverwrites'];
const THREAD = ['id', 'name', 'parentID', 'archived', 'locked', 'messageCount', 'ownerID', 'guildID',
  'archiveTimestamp', 'autoArchiveDuration', 'memberCount', 'totalMessageSent', 'appliedTags', 'rateLimitPerUser',
  'invitable', 'flags', 'lastMessageId', 'member'];

function property(raw: string, allowed: string[]): string {
  const key = raw.trim();
  if (!allowed.includes(key)) throw new YuzuhaError('ARGUMENT', `Propriedade inválida. Use: ${allowed.join(', ')}.`);
  return key;
}

function value(info: object, key: string): unknown {
  const result = Object.hasOwn(info, key) ? (info as Record<string, unknown>)[key] : null;
  return result === null || result === undefined ? '' : typeof result === 'object' ? JSON.stringify(result) : result;
}

export function entityProperty(info: object, raw: string, entity: 'user' | 'member' | 'guild' | 'channel'): unknown {
  return value(info, property(raw, { user: USER, member: MEMBER, guild: GUILD, channel: CHANNEL }[entity]));
}

async function channel(c: FunctionCall, id: string) {
  const info = await c.ctx.resources.channels.get(id);
  if (c.ctx.guildID ? info.guildID !== c.ctx.guildID : info.guildID !== null || id !== c.ctx.message.channelID) {
    throw new GuardError('O canal deve pertencer ao contexto atual.');
  }
  return info;
}

export const entityInfoFunctions = defineFunctions(fn => {
  fn('threadInfo', 'threads', 2, 2, '[propriedade;thread]', 'Lê campo público da thread no servidor atual; associações e tags são JSON.', async c => {
    const key = property(await c.text(0), THREAD), guildID = c.ctx.requireGuild(), id = (await c.text(1)).trim();
    const info = await channel(c, id);
    if (![10, 11, 12].includes(info.type)) throw new YuzuhaError('THREAD_NOT_FOUND', 'O canal informado não é uma thread.');
    const thread = await c.ctx.resources.threads.get(id);
    if (thread.guildID !== guildID) throw new GuardError('A thread deve pertencer ao servidor atual.');
    return value(thread, key);
  });
});
