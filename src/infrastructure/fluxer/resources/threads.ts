import type { Client, FetchedThreads, ThreadAutoArchiveDuration, ThreadChannel, ThreadManager } from '@fluxerjs/core';
import type { ForumPostInput, ThreadCreateInput, ThreadInfo, ThreadsResources } from '../../../ports/resources/threads.js';
import { YuzuhaError } from '../../../errors.js';
import { userID as parseUserID } from '../../../domain/values.js';

type FetchedChannel = Awaited<ReturnType<Client['channels']['fetch']>>;

function toInfo(thread: ThreadChannel): ThreadInfo {
  return {
    id: thread.id,
    name: thread.name ?? '',
    parentID: thread.parentId,
    archived: thread.archived,
    locked: thread.locked,
    messageCount: thread.messageCount,
    ownerID: thread.ownerId,
  };
}

function asThread(channel: FetchedChannel): ThreadChannel {
  if (!channel.isThread()) throw new YuzuhaError('THREAD_NOT_FOUND', 'O canal informado não é uma thread.');
  return channel;
}

function parentThreads(channel: FetchedChannel): ThreadManager {
  const threads = (channel as unknown as { threads?: ThreadManager }).threads;
  if (!threads || typeof threads.create !== 'function') {
    throw new YuzuhaError('THREAD_PARENT', 'O canal não suporta a criação de threads.');
  }
  return threads;
}

function archiveDuration(value: number | undefined): ThreadAutoArchiveDuration | undefined {
  if (value === undefined) return undefined;
  return value as ThreadAutoArchiveDuration;
}

function listPage(page: FetchedThreads, joined = false) {
  return { threads: page.threads.map(toInfo), members: page.members.map(member => ({ threadID: member.id,
    userID: member.userId, joinedTimestamp: member.joinedAt.getTime(), flags: member.flags })),
    hasMore: page.hasMore, nextBefore: page.hasMore
      ? (joined ? page.threads.at(-1)?.id : page.threads.at(-1)?.archiveTimestamp) ?? null : null };
}

export function createThreadsResources(client: Client): ThreadsResources {
  return {
    async active(guildID) {
      return { ...listPage(await (await client.guilds.resolve(guildID)).fetchActiveThreads()), nextBefore: null };
    },
    async archived(channelID, input = {}) {
      const type = input.type ?? 'public', limit = input.limit ?? 50;
      if (!['public', 'private', 'joined'].includes(type) || !Number.isSafeInteger(limit) || limit < 2 || limit > 100) {
        throw new YuzuhaError('THREAD_PAGE', 'Tipo deve ser public, private ou joined; limite entre 2 e 100.');
      }
      if (input.before !== undefined && (type === 'joined' ? !/^\d+$/.test(input.before)
        : !/^\d{4}-\d{2}-\d{2}T/.test(input.before) || !Number.isFinite(Date.parse(input.before)))) {
        throw new YuzuhaError('THREAD_CURSOR', 'Cursor deve ser um ID para joined ou timestamp ISO para public/private.');
      }
      const threads = parentThreads(await client.channels.fetch(channelID));
      const page = type === 'joined' ? await threads.fetchJoinedPrivateArchived({ limit, before: input.before })
        : await threads.fetchArchived({ type, limit, before: input.before });
      return listPage(page, type === 'joined');
    },
    async create(channelID: string, input: ThreadCreateInput): Promise<ThreadInfo> {
      if (input.messageID) {
        const message = await client.channels.fetchMessage(channelID, input.messageID);
        const thread = await message.startThread({
          name: input.name,
          autoArchiveDuration: archiveDuration(input.autoArchiveDuration),
          reason: input.reason,
        });
        return toInfo(thread);
      }
      const channel = await client.channels.fetch(channelID);
      const thread = await parentThreads(channel).create({
        name: input.name,
        autoArchiveDuration: archiveDuration(input.autoArchiveDuration),
        reason: input.reason,
      });
      return toInfo(thread);
    },
    async archive(threadID: string, locked?: boolean, reason?: string): Promise<void> {
      const thread = asThread(await client.channels.fetch(threadID));
      await thread.edit({ archived: true, ...(locked === true ? { locked: true } : {}), reason });
    },
    async unarchive(threadID: string, reason?: string): Promise<void> {
      const thread = asThread(await client.channels.fetch(threadID));
      await thread.setArchived(false, reason);
    },
    async forumPost(channelID: string, input: ForumPostInput): Promise<ThreadInfo> {
      const channel = await client.channels.fetch(channelID);
      if (!channel.isForum() && !channel.isMedia()) {
        throw new YuzuhaError('THREAD_FORUM', 'Posts de fórum exigem um canal de fórum ou mídia.');
      }
      const thread = await channel.threads.createPost({
        name: input.name,
        message: input.content,
        appliedTags: input.tags,
        autoArchiveDuration: archiveDuration(input.autoArchiveDuration),
        reason: input.reason,
      });
      return toInfo(thread);
    },
    async addMember(threadID, userID): Promise<void> {
      await asThread(await client.channels.fetch(threadID)).members.add(userID);
    },
    async removeMember(threadID, userID): Promise<void> {
      await asThread(await client.channels.fetch(threadID)).members.remove(userID);
    },
    async members(threadID, limit = 100, after) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new YuzuhaError('THREAD_LIMIT', 'Limite deve ser um inteiro entre 1 e 100.');
      }
      const thread = asThread(await client.channels.fetch(threadID));
      return (await thread.members.fetch({ limit, after })).map(member => ({
        threadID: member.id, userID: member.userId,
        joinedTimestamp: member.joinedAt.getTime(), flags: member.flags,
      }));
    },
    async member(threadID, userID) {
      const id = parseUserID(userID);
      const thread = asThread(await client.channels.fetch(threadID));
      const member = await thread.members.fetchOne(id);
      return { threadID: member.id, userID: member.userId,
        joinedTimestamp: member.joinedAt.getTime(), flags: member.flags,
        muted: member.muted, muteEndTime: member.muteEndTime, muteWindow: member.muteWindow };
    },
    async edit(threadID, input) {
      const thread = asThread(await client.channels.fetch(threadID));
      const { slowmode, tags, autoArchiveDuration, ...fields } = input;
      return toInfo(await thread.edit({ ...fields, appliedTags: tags,
        rateLimitPerUser: slowmode, autoArchiveDuration: archiveDuration(autoArchiveDuration) }));
    },
    async join(threadID) { await asThread(await client.channels.fetch(threadID)).join(); },
    async leave(threadID) { await asThread(await client.channels.fetch(threadID)).leave(); },
    async search(channelID, input) {
      const limit = input.limit ?? 25, offset = input.offset ?? 0;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25 || !Number.isSafeInteger(offset) || offset < 0 || offset > 9975) {
        throw new YuzuhaError('THREAD_SEARCH', 'Busca aceita limite de 1 a 25 e offset de 0 a 9975.');
      }
      if (input.name !== undefined && input.name.length > 100) throw new YuzuhaError('THREAD_SEARCH', 'Nome de busca deve ter até 100 caracteres.');
      const channel = await client.channels.fetch(channelID);
      const result = await parentThreads(channel).search({ name: input.name, archived: input.archived,
        tag: input.tags, limit, offset });
      if ('indexing' in result) return { threads: [], hasMore: false, total: null, indexing: true, retryAfter: result.retryAfter };
      return { threads: result.threads.map(toInfo), hasMore: result.hasMore,
        total: result.totalResults, indexing: false, retryAfter: null };
    },
  };
}
