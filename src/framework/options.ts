import type { Client, ClientOptions } from '@fluxerjs/core';
import type { CommandContext } from '../context.js';
import type { IncomingMessage, Store, Transport } from '../contracts.js';
import type { ScriptEngine, ScriptFunctionDefinition } from '../ports/script-engine.js';
import type { Command } from '../context.js';
import type { Resources } from '../ports/resources.js';
import type { HttpService } from '../services/http.js';
import type { Scheduler } from '../services/scheduler.js';
import type { NativeEvent } from './events.js';
import type { LogRecord } from './logging.js';
import type { ScriptEventDefinition } from './script-events.js';
import type { MusicManager } from '../services/music.js';
import type { NativeVoice } from '../ports/voice.js';
import type { CanvasConfig } from '../domain/canvas.js';

export type DispatchResult = 'ignored' | 'success' | 'guarded' | 'error';
export type Middleware = (ctx: CommandContext, next: () => Promise<void>) => Promise<void>;
export interface YuzuhaPlugin {
  name: string;
  functions?: ScriptFunctionDefinition[];
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
  engine?: ScriptEngine;
  scheduler?: Scheduler | false;
  http?: HttpService | false;
  music?: MusicManager;
  voice?: NativeVoice;
  canvas?: CanvasConfig;
  onError?: (error: unknown, ctx?: CommandContext) => void | Promise<void>;
  onCommand?: (ctx: CommandContext, outcome: DispatchResult) => void | Promise<void>;
  onLog?: (record: LogRecord) => void | Promise<void>;
  retry?: false | { requests?: number; delayMs?: number };
  timers?: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void };
}
