import type { Client, ClientOptions } from '@fluxerjs/core';
import type { CommandContext } from '../context.js';
import type { IncomingMessage, Store, Transport } from '../contracts.js';
import type { FunctionDefinition, Limits } from '../runtime.js';
import type { Command } from '../context.js';
import type { Resources } from '../ports/resources.js';
import type { HttpService } from '../services/http.js';
import type { Scheduler } from '../services/scheduler.js';
import type { NativeEvent } from './events.js';
import type { LogRecord } from './logging.js';
import type { ScriptEventDefinition } from './script-events.js';

export type DispatchResult = 'ignored' | 'success' | 'guarded' | 'error';
export type Middleware = (ctx: CommandContext, next: () => Promise<void>) => Promise<void>;
export interface YuzuhaPlugin {
  name: string;
  functions?: FunctionDefinition[];
  middleware?: Middleware[];
  commands?: Command[];
  events?: NativeEvent[];
  scriptEvents?: ScriptEventDefinition[];
}
export interface YuzuhaOptions {
  prefix?: string | string[] | ((message: IncomingMessage) => string | string[] | Promise<string | string[]>);
  client?: Client;
  clientOptions?: ClientOptions;
  transport?: Transport;
  resources?: Resources;
  store?: Store;
  name?: string;
  /** Clock shared by cooldowns, variable TTLs and the default scheduler. */
  now?: () => number;
  limits?: Partial<Limits>;
  scheduler?: Scheduler | false;
  http?: HttpService | false;
  onError?: (error: unknown, ctx?: CommandContext) => void | Promise<void>;
  onCommand?: (ctx: CommandContext, outcome: DispatchResult) => void | Promise<void>;
  onLog?: (record: LogRecord) => void | Promise<void>;
}
