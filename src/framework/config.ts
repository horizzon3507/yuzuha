import type { Yuzuha } from './bot.js';
import type { YuzuhaOptions } from './options.js';

export interface YuzuhaConfig extends YuzuhaOptions {
  commands?: string;
  setup?: (bot: Yuzuha) => void | Promise<void>;
}
export const defineConfig = <T extends YuzuhaConfig>(config: T): T => config;
