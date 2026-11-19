import type { ClientEventName } from '@fluxerjs/core';
import type { EventPayload, EventValue } from '../domain/events.js';

const MAX_ITEMS = 100;
const MAX_TEXT = 4000;

type Source = Record<string, unknown>;

function record(value: unknown): Source | null {
  return value && typeof value === 'object' ? value as Source : null;
}

function scalar(value: unknown): EventValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.length > MAX_TEXT ? value.slice(0, MAX_TEXT) : value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return null;
}

function read(source: unknown, ...keys: string[]): EventValue {
  const object = record(source);
  if (!object) return null;
  for (const key of keys) {
    const value = scalar(object[key]);
    if (value !== null) return value;
  }
  return null;
}

function ids(value: unknown): EventValue[] {
  return Array.isArray(value) ? value.slice(0, MAX_ITEMS).map(scalar).filter(item => typeof item === 'string') : [];
}

function list(value: unknown, map: (item: unknown) => EventValue): { items: EventValue[]; count: number } {
  const items = Array.isArray(value) ? value : value instanceof Map ? [...value.values()] : [];
  return { items: items.slice(0, MAX_ITEMS).map(map), count: items.length };
}

function user(value: unknown): EventValue {
  const object = record(value);
  if (!object) return null;
  return { id: read(object, 'id'), username: read(object, 'username'), globalName: read(object, 'globalName', 'global_name'),
    bot: Boolean(object['bot']), avatar: read(object, 'avatar') };
}

function member(value: unknown): EventValue {
  const object = record(value);
  if (!object) return null;
  return { id: read(object, 'id') ?? read(object['user'], 'id'), user: user(object['user']), nick: read(object, 'nick'),
    joinedAt: read(object, 'joinedAt', 'joined_at'), communicationDisabledUntil: read(object, 'communicationDisabledUntil', 'communication_disabled_until'),
    mute: read(object, 'mute'), deaf: read(object, 'deaf'), partial: Boolean(object['partial']) };
}

function guild(value: unknown): EventValue {
  const object = record(value);
  if (!object) return null;
  return { id: read(object, 'id'), name: read(object, 'name'), ownerID: read(object, 'ownerId'), available: read(object, 'available'),
    icon: read(object, 'icon'), memberCount: read(object, 'memberCount') };
}

function channel(value: unknown): EventValue {
  const object = record(value);
  if (!object) return null;
  return { id: read(object, 'id'), name: read(object, 'name'), type: read(object, 'type'), guildID: read(object, 'guildId', 'guild_id'),
    parentID: read(object, 'parentId', 'parent_id'), ownerID: read(object, 'ownerId', 'owner_id'), position: read(object, 'position'),
    archived: read(object, 'archived'), locked: read(object, 'locked'), memberCount: read(object, 'memberCount') };
}

function role(value: unknown): EventValue {
  const object = record(value);
  if (!object) return null;
  return { id: read(object, 'id'), guildID: read(object, 'guildId'), name: read(object, 'name'), color: read(object, 'color'),
    position: read(object, 'position'), hoist: read(object, 'hoist'), mentionable: read(object, 'mentionable'),
    permissions: read(object, 'permissions') ?? read(record(object['permissions']), 'bitfield') };
}

function message(value: unknown): EventValue {
  const object = record(value);
  if (!object) return null;
  return { id: read(object, 'id'), channelID: read(object, 'channelId'), guildID: read(object, 'guildId'),
    authorID: read(object['author'], 'id') ?? read(object, 'authorId'), content: read(object, 'content'),
    partial: Boolean(object['partial']) };
}

function emoji(value: unknown): EventValue {
  const object = record(value);
  if (!object) return null;
  return { id: read(object, 'id'), name: read(object, 'name'), animated: Boolean(object['animated']) };
}

function threadMember(value: unknown): EventValue {
  const object = record(value);
  if (!object) return null;
  return { threadID: read(object, 'id', 'threadId'), userID: read(object, 'userId', 'user_id'), flags: read(object, 'flags'),
    joinedAt: read(object, 'joinedAt', 'joinTimestamp', 'join_timestamp') };
}

function presence(value: unknown): EventValue {
  const object = record(value);
  if (!object) return null;
  const status = record(object['customStatus']);
  return { userID: read(object, 'userId'), guildID: read(object, 'guildId'), status: read(object, 'status'),
    activities: list(object['activities'], item => ({ name: read(item, 'name'), type: read(item, 'type'), url: read(item, 'url') })).items,
    customStatus: status ? { text: read(status, 'text'), emojiID: read(status, 'emojiId'), emojiName: read(status, 'emojiName') } : null };
}

/** Estado de voz sem session_id, connection_id nem chaves de stream. */
function voiceState(value: unknown): EventValue {
  const object = record(value);
  if (!object) return null;
  return { guildID: read(object, 'guild_id'), channelID: read(object, 'channel_id'), userID: read(object, 'user_id'),
    mute: read(object, 'mute'), deaf: read(object, 'deaf'), selfMute: read(object, 'self_mute'), selfDeaf: read(object, 'self_deaf'),
    suppress: read(object, 'suppress'), selfVideo: read(object, 'self_video'), selfStream: read(object, 'self_stream'),
    nick: read(object['member'], 'nick') };
}

function update(oldValue: unknown, newValue: unknown, map: (value: unknown) => EventValue): EventPayload {
  return { old: map(oldValue), new: map(newValue) };
}

function errorInfo(value: unknown): EventPayload {
  const object = record(value);
  return { name: read(object, 'name'), message: read(object, 'message'), code: read(object, 'code') };
}

function counted(key: string, value: unknown, map: (item: unknown) => EventValue): EventPayload {
  const { items, count } = list(value, map);
  return { [key]: items, [`${key}Count`]: count };
}

/** Payload normalizado, limitado e sem credenciais exposto a scripts como `$eventData`. */
export function eventPayload(name: ClientEventName, raw: readonly unknown[]): EventPayload {
  const [a, b, c] = raw;
  switch (name) {
    case 'messageCreate': return { message: message(a) };
    case 'messageUpdate': return update(a, b, message);
    case 'messageDelete': return { message: message(a) };
    case 'messageDeleteBulk': return { channelID: read(a, 'channelId'), guildID: read(a, 'guildId'), ids: ids(record(a)?.['ids']),
      count: Array.isArray(record(a)?.['ids']) ? (record(a)!['ids'] as unknown[]).length : 0,
      ...counted('messages', record(a)?.['messages'], message) };
    case 'messageReactionAdd':
    case 'messageReactionRemove': return { messageID: read(a, 'messageId'), channelID: read(a, 'channelId'), userID: read(a, 'userId'),
      guildID: read(record(a)?.['reaction'], 'guildId') ?? read(a, 'guildId'), emoji: emoji(record(a)?.['emoji']),
      user: user(record(a)?.['user']), member: member(record(a)?.['member']), message: message(record(a)?.['message']) };
    case 'messageReactionAddMany': return { messageID: read(a, 'messageId'), channelID: read(a, 'channelId'), guildID: read(a, 'guildId'),
      message: message(record(a)?.['message']),
      ...counted('reactions', record(a)?.['reactions'], item => ({ userID: read(item, 'userId'), emoji: emoji(record(item)?.['emoji']) })) };
    case 'messageReactionRemoveAll': return { messageID: read(a, 'messageId'), channelID: read(a, 'channelId'), guildID: read(a, 'guildId'),
      message: message(record(a)?.['message']) };
    case 'messageReactionRemoveEmoji': return { messageID: read(a, 'messageId'), channelID: read(a, 'channelId'), guildID: read(a, 'guildId'),
      emoji: emoji(record(a)?.['emoji']), message: message(record(a)?.['message']) };
    case 'guildCreate':
    case 'guildAvailable':
    case 'guildUnavailable':
    case 'guildDelete': return { guild: guild(a) };
    case 'guildUpdate': return update(a, b, guild);
    case 'channelCreate':
    case 'channelDelete':
    case 'threadCreate':
    case 'threadDelete': return { channel: channel(a) };
    case 'channelUpdate':
    case 'threadUpdate': return update(a, b, channel);
    case 'threadListSync': return { guildID: read(a, 'guildId'), channelIDs: ids(record(a)?.['channelIds']),
      ...counted('threads', record(a)?.['threads'], channel) };
    case 'threadMemberUpdate': return { member: threadMember(a) };
    case 'threadMembersUpdate': return { threadID: read(a, 'id'), guildID: read(a, 'guildId'), memberCount: read(a, 'memberCount'),
      removedMemberIDs: ids(record(a)?.['removedMemberIds']), ...counted('addedMembers', record(a)?.['addedMembers'], threadMember) };
    case 'threadMemberListUpdate': return { threadID: read(a, 'threadId'), guildID: read(a, 'guildId'),
      ...counted('members', record(a)?.['members'], item => ({ ...threadMember(item) as object, status: read(record(item)?.['presence'], 'status') })) };
    case 'forumUnreads': return { guildID: read(a, 'guildId'), channelID: read(a, 'channelId'),
      ...counted('threads', record(a)?.['threads'], item => ({ threadID: read(item, 'threadId'), count: read(item, 'count'), missing: Boolean(record(item)?.['missing']) })) };
    case 'guildMemberAdd':
    case 'guildMemberRemove': return { member: member(a) };
    case 'guildMemberUpdate': return update(a, b, member);
    case 'guildMembersChunk': return { guildID: read(a, 'guildId'), chunkIndex: read(a, 'chunkIndex'), chunkCount: read(a, 'chunkCount'),
      notFound: ids(record(a)?.['notFound']), nonce: read(a, 'nonce'), ...counted('members', record(a)?.['members'], member) };
    case 'guildCountsUpdate': return counted('counts', record(a)?.['counts'], item => ({ guildID: read(item, 'guildId'),
      memberCount: read(item, 'memberCount'), onlineCount: read(item, 'onlineCount') }));
    case 'channelMemberCountsUpdate': return counted('counts', record(a)?.['counts'], item => ({ guildID: read(item, 'guildId'),
      channelID: read(item, 'channelId'), memberCount: read(item, 'memberCount'), onlineCount: read(item, 'onlineCount') }));
    case 'guildAuditLogEntryCreate': {
      const options = record(record(a)?.['options']);
      return { id: read(a, 'id'), guildID: read(a, 'guildId'), actionType: read(a, 'actionType'), userID: read(a, 'userId'),
        targetID: read(a, 'targetId'), reason: read(a, 'reason'),
        options: options ? Object.fromEntries(Object.entries(options).slice(0, MAX_ITEMS).map(([key, value]) => [key, scalar(value)])) : null,
        ...counted('changes', record(a)?.['changes'], item => ({ key: read(item, 'key'), oldValue: read(item, 'oldValue'), newValue: read(item, 'newValue') })) };
    }
    case 'guildBanAdd':
    case 'guildBanRemove': return { guildID: read(a, 'guildId'), user: user(record(a)?.['user']), reason: read(a, 'reason'),
      expiresAt: read(a, 'expiresAt') };
    case 'guildEmojisUpdate': return { guildID: read(a, 'guildId'), ...counted('emojis', record(a)?.['emojis'], emoji) };
    case 'guildStickersUpdate': return { guildID: read(a, 'guildId'), ...counted('stickers', record(a)?.['stickers'],
      item => ({ id: read(item, 'id'), name: read(item, 'name'), description: read(item, 'description'), animated: Boolean(record(item)?.['animated']) })) };
    case 'guildRoleCreate': return { role: role(a) };
    case 'guildRoleUpdate': return update(a, b, role);
    case 'guildRoleDelete': return { role: role(a), guildID: scalar(b), roleID: scalar(c) ?? read(a, 'id') };
    case 'voiceStateUpdate': return { state: voiceState(a) };
    case 'voiceStateAck': return { guildID: read(a, 'guild_id'), channelID: read(a, 'channel_id'), status: read(a, 'status'),
      errorCode: read(a, 'error_code'), errorMessage: read(a, 'error_message'), state: voiceState(record(a)?.['canonical_state']) };
    case 'voiceServerUpdate': return { guildID: read(a, 'guild_id'), channelID: read(a, 'channel_id'),
      hasEndpoint: typeof record(a)?.['endpoint'] === 'string', redacted: true };
    case 'entranceSoundPlay': return { guildID: read(a, 'guild_id'), channelID: read(a, 'channel_id'), userID: read(a, 'user_id'),
      soundID: read(a, 'sound_id'), url: read(a, 'url'), durationMs: read(a, 'duration_ms'), contentType: read(a, 'content_type') };
    case 'voiceStatesSync': return { guildID: read(a, 'guildId'), ...counted('states', record(a)?.['voiceStates'], voiceState) };
    case 'channelPinsUpdate': return { channelID: read(a, 'channelId'), guildID: read(a, 'guildId'), lastPinTimestamp: read(a, 'lastPinTimestamp') };
    case 'channelRecipientAdd':
    case 'channelRecipientRemove': return { channelID: read(a, 'channelId'), user: user(record(a)?.['user']) };
    case 'inviteCreate': return { code: read(a, 'code'), type: read(a, 'type'), guildID: read(record(a)?.['guildSnapshot'], 'id'),
      channelID: read(record(a)?.['channelSnapshot'], 'id'), inviter: user(record(a)?.['inviter']), uses: read(a, 'uses'),
      maxUses: read(a, 'maxUses'), maxAge: read(a, 'maxAge'), temporary: read(a, 'temporary'), expiresAt: read(a, 'expiresAt') };
    case 'inviteDelete': return { code: read(a, 'code'), guildID: read(a, 'guildId'), channelID: read(a, 'channelId') };
    case 'typingStart': return { channelID: read(a, 'channelId'), guildID: read(a, 'guildId'), userID: read(a, 'userId'), timestamp: read(a, 'timestamp') };
    case 'userUpdate': return { user: user(a) };
    case 'userConnectionsUpdate': return counted('connections', record(a)?.['connections'],
      item => ({ type: read(item, 'type'), name: read(item, 'name'), verified: Boolean(record(item)?.['verified']) }));
    case 'presenceUpdate': return { presence: presence(a) };
    case 'presenceUpdateBulk': return { guildID: read(a, 'guildId'), ...counted('presences', record(a)?.['presences'], presence) };
    case 'webhooksUpdate': return { channelID: read(a, 'channelId'), guildID: read(a, 'guildId') };
    case 'error': return { error: errorInfo(a) };
    case 'shardError': return { shardID: scalar(a), error: errorInfo(b) };
    case 'shardReady':
    case 'shardResumed':
    case 'shardReconnecting': return { shardID: scalar(a) };
    case 'shardDisconnect': return { shardID: scalar(a), code: scalar(b) };
    case 'shardingRequired': return { shardID: read(a, 'shardId'), numShards: read(a, 'numShards') };
    default: return {};
  }
}

export function freezePayload<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freezePayload(item);
    Object.freeze(value);
  }
  return value;
}
