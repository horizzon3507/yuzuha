import type { IncomingMessage, ModerationAction, ModerationMember, Payload, Transport } from './contracts.js';
import type { Resources } from './ports/resources.js';
import { PermissionFlags } from '@fluxerjs/core';
import { YuzuhaError } from './errors.js';
import type { VoiceModerationOptions } from './domain/moderation.js';

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
    const id = await this.send(message.channelID, payload); this.messages.at(-1)!.replyTo = message.id; return id;
  }
  async send(channelID: string, payload: Payload): Promise<string> {
    const id = String(this.messages.length + 1);
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
