import type { ClientEventName } from '@fluxerjs/core';

/** Eventos do SDK acessíveis por `bot.scriptEvent`; `debug` e WebAuthn ficam só no modo nativo. */
export type ScriptEventName = Exclude<ClientEventName, 'debug' | 'webauthnCredentialsUpdate'>;

export type EventValue = string | number | boolean | null | readonly EventValue[] | { readonly [key: string]: EventValue };
export type EventPayload = { readonly [key: string]: EventValue };

export interface EventData<K extends ClientEventName = ClientEventName> {
  name: K;
  guildID: string | null;
  channelID: string | null;
  userID: string | null;
  userName: string | null;
  userBot: boolean;
  messageID: string | null;
  content: string | null;
  oldContent: string | null;
  emoji: string | null;
  /** Payload normalizado e redigido lido por `$eventData`. */
  data?: EventPayload;
}

export type ScriptEventData = EventData;
