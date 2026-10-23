import type { IncomingMessage, ModerationAction, ModerationMember, Payload, Transport } from './contracts.js';
import type { Resources } from './ports/resources.js';
import { PermissionFlags } from '@fluxerjs/core';
import { YuzuhaError } from './errors.js';
import type { VoiceModerationOptions } from './domain/moderation.js';
import { Yuzuha } from './framework/bot.js';
import type { DispatchResult, YuzuhaOptions } from './framework/options.js';
import { reportError } from './framework/reporting.js';
import type { Command } from './commands/definition.js';
import { MemoryStore } from './store.js';
import type { Store } from './ports/store.js';

/**
 * Recursos nativos simulados para testes. Áreas não informadas falham ao ser usadas.
 */
export type MockResourceOverrides = { [K in keyof Resources]?: Partial<Resources[K]> };

export function mockResources(overrides: MockResourceOverrides = {}): Resources {
  const resource = <K extends keyof Resources>(area: K): Resources[K] => new Proxy(overrides[area] ?? {}, {
    get(target, property) {
      if (Reflect.has(target, property)) {
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return () => { throw new YuzuhaError('NATIVE_UNAVAILABLE', `Recurso simulado ausente: ${area}.`); };
    },
  }) as Resources[K];
  return {
    users: resource('users'),
    roles: resource('roles'),
    channels: resource('channels'),
    messages: resource('messages'),
    collectors: resource('collectors'),
    webhooks: resource('webhooks'),
    expressions: resource('expressions'),
    threads: resource('threads'),
    invites: resource('invites'),
  };
}


export class MockTransport implements Transport {
  private messageSequence = 0;
  botID = '999';
  ping = 12;
  readonly messages: { id: string; channelID: string; replyTo?: string; payload: Payload }[] = [];
  readonly actions: ({ guildID: string; action: ModerationAction; targetID: string; reason: string; duration?: number } & VoiceModerationOptions)[] = [];
  readonly members = new Map<string, ModerationMember>();
  readonly reactions: { channelID: string; messageID: string; emoji: string }[] = [];
  failAction = false;
  constructor() {
    this.setMember('100', { id: '1', owner: true, permissions: PermissionFlags.Administrator, rank: 100 });
    this.setMember('100', { id: this.botID, owner: false, permissions: PermissionFlags.Administrator, rank: 90 });
    this.setMember('100', { id: '2', owner: false, permissions: 0n, rank: 1 });
  }
  setMember(guildID: string, member: ModerationMember): void { this.members.set(JSON.stringify([guildID, member.id]), member); }
  async reply(message: IncomingMessage, payload: Payload): Promise<string> {
    const id = await this.send(message.channelID, payload); this.messages.find(item => item.id === id)!.replyTo = message.id; return id;
  }
  async send(channelID: string, payload: Payload): Promise<string> {
    const id = String(++this.messageSequence);
    this.messages.push({ id, channelID, payload: structuredClone(payload) }); return id;
  }
  async edit(channelID: string, messageID: string, payload: Payload): Promise<void> {
    const message = this.messages.find(m => m.id === messageID && m.channelID === channelID);
    if (!message) throw new YuzuhaError('NOT_FOUND', 'Mensagem não encontrada.');
    message.payload = structuredClone(payload);
  }
  async delete(channelID: string, messageID: string): Promise<void> {
    const i = this.messages.findIndex(m => m.id === messageID && m.channelID === channelID);
    if (i < 0) throw new YuzuhaError('NOT_FOUND', 'Mensagem não encontrada.');
    this.messages.splice(i, 1);
  }
  async react(channelID: string, messageID: string, emoji: string): Promise<void> { this.reactions.push({ channelID, messageID, emoji }); }
  async member(guildID: string, userID: string): Promise<ModerationMember> {
    const member = this.members.get(JSON.stringify([guildID, userID]));
    if (!member) throw new YuzuhaError('MEMBER_NOT_FOUND', 'Membro não encontrado.');
    return structuredClone(member);
  }
  async moderate(guildID: string, action: ModerationAction, targetID: string, reason: string, duration?: number, voice?: VoiceModerationOptions): Promise<void> {
    if (this.failAction) throw new YuzuhaError('API_ERROR', 'Falha simulada.');
    this.actions.push({ guildID, action, targetID, reason, duration, ...voice });
  }
}
let sequence = 0;
export function mockMessage(content: string, overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return { id: String(++sequence), content, authorID: '1', authorName: 'Hory', authorBot: false,
    guildID: '100', channelID: '200', mentions: [...content.matchAll(/<@!?(\d+)>/g)].map(m => m[1]!), ...overrides };
}

export class TestClock {
  private time: number;

  constructor(now = Date.now()) {
    if (!Number.isSafeInteger(now) || now < 0) throw new YuzuhaError('TEST_CLOCK', 'O relógio exige um instante inteiro não negativo.');
    this.time = now;
  }

  readonly now = (): number => this.time;

  advance(milliseconds: number): number {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || !Number.isSafeInteger(this.time + milliseconds)) {
      throw new YuzuhaError('TEST_CLOCK', 'O avanço exige milissegundos inteiros não negativos dentro do intervalo seguro.');
    }
    this.time += milliseconds;
    return this.time;
  }
}

export interface TestBotOptions extends Omit<YuzuhaOptions, 'now' | 'transport' | 'resources'> {
  commands?: readonly Command[];
  transport?: MockTransport;
  resources?: MockResourceOverrides;
  message?: Partial<IncomingMessage>;
  now?: number;
}

export interface TestBot {
  readonly bot: Yuzuha;
  readonly transport: MockTransport;
  readonly store: Store;
  readonly clock: TestClock;
  readonly messages: MockTransport['messages'];
  readonly errors: unknown[];
  readonly results: DispatchResult[];
  send(content: string, overrides?: Partial<IncomingMessage>): Promise<DispatchResult>;
  /** Advances the clock and awaits one scheduler pass, including scheduled handlers. */
  tick(milliseconds?: number): Promise<void>;
  destroy(): Promise<void>;
  close(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

/** Creates an offline bot with isolated state, captured output and a manually advanced clock. */
export function createTestBot(options: TestBotOptions = {}): TestBot {
  const { commands = [], transport = new MockTransport(), resources, message, now,
    onError, ...botOptions } = options;
  const clock = new TestClock(now);
  const store = options.store ?? new MemoryStore();
  const errors: unknown[] = [], results: DispatchResult[] = [];
  const defaults = structuredClone(message ?? {});
  const bot = new Yuzuha({ ...botOptions, transport, resources: mockResources(resources), store,
    now: clock.now, http: options.http ?? false,
    onError: async (error, ctx) => { errors.push(error); await onError?.(error, ctx); },
  });
  try { for (const command of commands) bot.command(command); }
  catch (error) {
    void bot.destroy().catch(failure => reportError(bot.options, failure));
    throw error;
  }
  let messageID = 0;
  let closing = false;
  const destroy = (): Promise<void> => {
    closing = true;
    return bot.destroy();
  };
  return {
    bot, transport, store, clock, messages: transport.messages, errors, results,
    async send(content, overrides) {
      const outcome = await bot.handle(mockMessage(content, { ...defaults, id: String(++messageID), ...overrides }));
      results.push(outcome);
      return outcome;
    },
    async tick(milliseconds = 0) {
      if (closing || bot.signal.aborted) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
      clock.advance(milliseconds);
      await bot.scheduler?.tick();
    },
    destroy, close: destroy, [Symbol.asyncDispose]: destroy,
  };
}
export { MockMusicBackend, mockTrack } from './testing/music.js';
