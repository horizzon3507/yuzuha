export interface ThreadInfo {
  id: string;
  name: string;
  parentID: string | null;
  archived: boolean;
  locked: boolean;
  messageCount: number;
  ownerID: string | null;
}

export interface ThreadCreateInput {
  name: string;
  messageID?: string;
  autoArchiveDuration?: number;
  reason?: string;
}

export interface ThreadMemberInfo {
  threadID: string | null;
  userID: string | null;
  joinedTimestamp: number;
  flags: number;
}

export interface ForumPostInput {
  name: string;
  content: string;
  tags?: string[];
  autoArchiveDuration?: number;
  reason?: string;
}

export interface ThreadsResources {
  create(channelID: string, input: ThreadCreateInput): Promise<ThreadInfo>;
  archive(threadID: string, locked?: boolean, reason?: string): Promise<void>;
  unarchive(threadID: string, reason?: string): Promise<void>;
  forumPost(channelID: string, input: ForumPostInput): Promise<ThreadInfo>;
  addMember(threadID: string, userID: string): Promise<void>;
  removeMember(threadID: string, userID: string): Promise<void>;
  members(threadID: string, limit?: number, after?: string): Promise<ThreadMemberInfo[]>;
  edit(threadID: string, input: ThreadEditInput): Promise<ThreadInfo>;
  join(threadID: string): Promise<void>;
  leave(threadID: string): Promise<void>;
  search(channelID: string, input: ThreadSearchInput): Promise<ThreadSearchPage>;
  active(guildID: string): Promise<ThreadListPage>;
  archived(channelID: string, input?: ArchivedThreadsInput): Promise<ThreadListPage>;
}

export interface ThreadEditInput {
  name?: string;
  archived?: boolean;
  locked?: boolean;
  autoArchiveDuration?: number;
  slowmode?: number;
  tags?: string[];
  reason?: string;
}
export interface ThreadSearchInput {
  name?: string;
  archived?: boolean;
  tags?: string[];
  limit?: number;
  offset?: number;
}
export interface ThreadSearchPage {
  threads: ThreadInfo[]; hasMore: boolean; total: number | null;
  indexing: boolean; retryAfter: number | null;
}

export interface ArchivedThreadsInput {
  type?: 'public' | 'private' | 'joined';
  before?: string;
  limit?: number;
}

export interface ThreadListPage {
  threads: ThreadInfo[];
  members: ThreadMemberInfo[];
  hasMore: boolean;
  nextBefore: string | null;
}
