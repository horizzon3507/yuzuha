import type { Client } from '@fluxerjs/core';

export type ShardSchedulerMode = 'leader' | 'all' | 'disabled';

export interface ShardBroadcastOptions {
  context?: unknown;
}

export interface ShardRespawnOptions {
  delay?: number;
}

export interface ShardInfo {
  readonly id: number;
  readonly ids: readonly number[];
  readonly count: number;
  readonly isLeader: boolean;
}

export interface BotShard extends ShardInfo {
  shardIdForGuild(guildID: string): number;
  broadcastEval<T>(
    fn: (client: Client, context?: unknown) => T | Promise<T>,
    options?: ShardBroadcastOptions,
  ): Promise<T[]>;
  fetchClientValues(prop: string): Promise<unknown[]>;
  respawn(options?: ShardRespawnOptions): Promise<void>;
}
