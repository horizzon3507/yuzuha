import type { Yuzuha } from './bot.js';
import type {
  CacheSweeperOptions,
  ClientOptions,
  DiscoveryOrigin,
  MemberCacheSweeperOptions,
  MessageCacheSweeperOptions,
  UserCacheSweeperOptions,
  YuzuhaOptions,
} from './options.js';

export type {
  ClientOptions,
  CacheSweeperOptions,
  MessageCacheSweeperOptions,
  MemberCacheSweeperOptions,
  UserCacheSweeperOptions,
  DiscoveryOrigin,
};

export interface YuzuhaConfig extends YuzuhaOptions {
  commands?: string;
  setup?: (bot: Yuzuha) => void | Promise<void>;
}
export const defineConfig = <T extends YuzuhaConfig>(config: T): T => config;
