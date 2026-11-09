import type { CommandContext } from './context.js';

/** Structural subset of CommandContext a test fixture may satisfy. */
export type CommandContextLike = Pick<CommandContext, 'reply' | 'send' | 'edit' | 'delete' | 'react'
  | 'deleteCommandMessage' | 'purge' | 'expire' | 'authorID' | 'authorName' | 'channelID' | 'guildID' | 'args' | 'members'
  | 'mod' | 'resources' | 'cdn' | 'canvas' | 'tokens' | 'command' | 'executionID' | 'input'
  | 'message' | 'event'>;
