import { GuardError, YuzuhaError } from '../../errors.js';
import type { FunctionCall } from '../runtime/types.js';
import { defineFunctions } from './definition.js';
import { userID } from '../../domain/values.js';
import { hasPermission } from '../../domain/permissions.js';

const USER = ['id', 'username', 'displayName', 'bot', 'avatarURL', 'bannerURL', 'createdTimestamp',
  'avatar', 'banner', 'avatarColor', 'discriminator', 'flags', 'globalName', 'system'];
const MEMBER = [...USER, 'nickname', 'joinedTimestamp', 'roles', 'permissions', 'timedOutUntil',
  'guildID', 'partial', 'deaf', 'mute', 'profileFlags', 'mentionFlags', 'bannable', 'kickable', 'moderatable'];
const GUILD = ['id', 'name', 'ownerID', 'iconURL', 'bannerURL', 'memberCount', 'createdTimestamp', 'features',
  'available', 'afkChannelId', 'afkTimeout', 'banner', 'bannerHeight', 'bannerWidth', 'icon', 'splash', 'splashURL',
  'splashHeight', 'splashWidth', 'splashCardAlignment', 'embedSplash', 'verificationLevel', 'mfaLevel', 'nsfwLevel',
  'nsfw', 'contentWarningLevel', 'contentWarningText', 'disabledOperations', 'defaultMessageNotifications',
  'explicitContentFilter', 'messageHistoryCutoff', 'systemChannelFlags', 'systemChannelId', 'rulesChannelId',
  'vanityURLCode', 'onlineCount', 'permissions'];
const CHANNEL = ['id', 'name', 'type', 'guildID', 'parentID', 'position', 'topic', 'slowmode', 'nsfw', 'url',
  'recipientIDs', 'ownerID', 'contentWarningLevel', 'contentWarningText', 'createdTimestamp', 'icon',
  'createdAt', 'lastPinTimestamp', 'lastMessageId', 'nsfwOverride', 'bitrate', 'userLimit', 'voiceConnectionLimit', 'rtcRegion',
  'defaultAutoArchiveDuration', 'defaultThreadRateLimitPerUser', 'defaultForumLayout', 'nicks', 'permissionOverwrites'];
const THREAD = ['id', 'name', 'parentID', 'archived', 'locked', 'messageCount', 'ownerID', 'guildID',
  'archiveTimestamp', 'autoArchiveDuration', 'memberCount', 'totalMessageSent', 'appliedTags', 'rateLimitPerUser',
  'invitable', 'flags', 'lastMessageId', 'member'];
const EXTRA = {
  message: ['id', 'channelID', 'authorID', 'authorName', 'content', 'createdTimestamp', 'pinned', 'attachments', 'embeds',
    'guildID', 'author', 'partial', 'flags', 'type', 'tts', 'nonce', 'webhookId', 'editedAt', 'mentionEveryone',
    'mentionRoles', 'mentions', 'nsfwEmojis', 'messageReference', 'messageSnapshots', 'stickers', 'reactions', 'call', 'thread', 'referencedMessage'],
  invite: ['code', 'url', 'guildID', 'channelID', 'inviterID', 'uses', 'maxUses', 'expiresTimestamp', 'type', 'createdAt',
    'expiresAt', 'temporary', 'maxAge', 'memberCount', 'presenceCount', 'isGuild', 'isGroupDM', 'inviter', 'guildSnapshot', 'channelSnapshot'],
  webhook: ['id', 'name', 'channelID', 'guildID', 'avatar', 'avatarURL', 'createdTimestamp', 'createdAt', 'type', 'user'],
  ban: ['userID', 'username', 'reason', 'guildID', 'expiresAt', 'user'],
  reaction: ['messageID', 'channelID', 'guildID', 'count', 'me', 'emoji', 'emojiIdentifier'],
};

function property(raw: string, allowed: string[]): string {
  const key = raw.trim();
  if (!allowed.includes(key)) throw new YuzuhaError('ARGUMENT', `Propriedade inválida. Use: ${allowed.join(', ')}.`);
  return key;
}

function value(info: object, key: string): unknown {
  const result = Object.hasOwn(info, key) ? (info as Record<string, unknown>)[key] : null;
  return result === null || result === undefined ? '' : typeof result === 'object' ? JSON.stringify(result) : result;
}

export function entityProperty(info: object, raw: string, entity: 'user' | 'member' | 'guild' | 'channel' | keyof typeof EXTRA): unknown {
  return value(info, property(raw, { user: USER, member: MEMBER, guild: GUILD, channel: CHANNEL, ...EXTRA }[entity]));
}

export async function contextChannel(c: FunctionCall, id: string) {
  const info = await c.ctx.resources.channels.get(id);
  if (c.ctx.guildID ? info.guildID !== c.ctx.guildID : info.guildID !== null || id !== c.ctx.message.channelID) {
    throw new GuardError('O canal deve pertencer ao contexto atual.');
  }
  return info;
}

export const entityInfoFunctions = defineFunctions(fn => {
  fn('threadInfo', 'threads', 2, 2, '[propriedade;thread]', 'Lê campo público da thread no servidor atual; associações e tags são JSON.', async c => {
    const key = property(await c.text(0), THREAD), guildID = c.ctx.requireGuild(), id = (await c.text(1)).trim();
    const info = await contextChannel(c, id);
    if (![10, 11, 12].includes(info.type)) throw new YuzuhaError('THREAD_NOT_FOUND', 'O canal informado não é uma thread.');
    const thread = await c.ctx.resources.threads.get(id);
    if (thread.guildID !== guildID) throw new GuardError('A thread deve pertencer ao servidor atual.');
    return value(thread, key);
  });
  fn('inviteInfo', 'invites', 2, 2, '[propriedade;código]', 'Lê campo público de convite do servidor atual; objetos são JSON e null é vazio.', async c => {
    const key = property(await c.text(0), EXTRA.invite), guildID = c.ctx.requireGuild();
    const invite = await c.ctx.resources.invites.get(await c.text(1));
    if (invite.guildID !== guildID) throw new GuardError('O convite deve pertencer ao servidor atual.');
    return value(invite, key);
  });
  fn('webhookInfo', 'webhooks', 2, 2, '[propriedade;id]', 'Lê webhook do servidor atual com ManageWebhooks de autor e bot; nunca expõe token.', async c => {
    const key = property(await c.text(0), EXTRA.webhook);
    return value(await c.ctx.resources.webhooks.fetch(await c.text(1)), key);
  });
  fn('banInfo', 'users', 2, 2, '[propriedade;usuário]', 'Busca banimento no servidor atual com BanMembers de autor e bot; vazio quando ausente.', async c => {
    const key = property(await c.text(0), EXTRA.ban), guildID = c.ctx.requireGuild(), id = userID(await c.text(1));
    await c.ctx.requirePermission('BanMembers'); await c.ctx.requirePermission('BanMembers', true);
    const ban = await c.ctx.resources.users.getBan(guildID, id);
    return ban ? value(ban, key) : '';
  });
  fn('reactionInfo', 'messages', 3, 4, '[propriedade;emoji;mensagem;canal?]', 'Lê agregado de reação de uma mensagem; vazio se ausente, objetos são JSON.', async c => {
    const key = property(await c.text(0), EXTRA.reaction), emoji = await c.text(1);
    const id = c.count > 3 ? await c.text(3) : c.ctx.message.channelID;
    await contextChannel(c, id);
    const message = await c.ctx.resources.messages.fetch(id, await c.text(2));
    const reaction = message.reactions?.find(item => item.emojiIdentifier === emoji || item.emoji.id === emoji);
    return reaction ? value(reaction, key) : '';
  });
  fn('canSend', 'channels', 0, 2, '[canal?;usuário?]', 'Verifica ViewChannel e SendMessages efetivos do bot ou autor em canal do servidor atual.', async c => {
    const guildID = c.ctx.requireGuild(), id = c.count ? await c.text(0) : c.ctx.message.channelID;
    await contextChannel(c, id);
    const actor = c.count > 1 ? userID(await c.text(1)) : c.ctx.transport.botID;
    if (actor !== c.ctx.transport.botID && actor !== c.ctx.authorID) throw new GuardError('Consulte somente o bot ou autor atual.');
    const member = await c.ctx.transport.member(guildID, actor, id);
    return hasPermission(member.permissions, 'ViewChannel', member.owner) && hasPermission(member.permissions, 'SendMessages', member.owner);
  });
  fn('roleHasPermission', 'roles', 2, 2, '[cargo;permissão]', 'Verifica uma permissão do cargo no servidor atual, respeitando Administrator.', async c => {
    const role = await c.ctx.resources.roles.resolve(c.ctx.requireGuild(), await c.text(0));
    return hasPermission(BigInt(role.permissions), await c.text(1));
  });
});
