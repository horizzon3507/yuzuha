import { Events } from '@fluxerjs/core';
import type { Client, ClientEventName, ClientEvents } from '@fluxerjs/core';
import { YuzuhaError } from '../errors.js';

export type NativeListener<K extends ClientEventName> = (...args: ClientEvents[K]) => unknown | Promise<unknown>;
export interface EventDefinition<K extends ClientEventName> {
  event: K;
  once?: boolean;
  run: NativeListener<K>;
}
export interface NativeEvent {
  readonly event: ClientEventName;
  readonly once: boolean;
  readonly invoke: (args: unknown[]) => unknown | Promise<unknown>;
}

const knownEvents = new Set<string>(Object.values(Events));

export function defineEvent<K extends ClientEventName>(definition: EventDefinition<K>): NativeEvent {
  if (!knownEvents.has(definition.event) || typeof definition.run !== 'function'
    || (definition.once !== undefined && typeof definition.once !== 'boolean')) {
    throw new YuzuhaError('EVENT', 'Evento, callback ou opção once inválidos.');
  }
  const run = definition.run;
  return Object.freeze({ event: definition.event, once: definition.once ?? false,
    invoke: (args: unknown[]) => run(...args as ClientEvents[K]),
  });
}

interface Binding { event: ClientEventName; identity: unknown; wrapper: (...args: unknown[]) => void }

export class NativeEvents {
  private readonly bindings = new Set<Binding>();
  private closed = false;

  constructor(private readonly client: Client, private readonly schedule: (work: () => unknown | Promise<unknown>) => void) {}

  validate(event: NativeEvent): void {
    if (!knownEvents.has(event.event) || typeof event.invoke !== 'function' || typeof event.once !== 'boolean') {
      throw new YuzuhaError('EVENT', 'Use defineEvent para registrar eventos de um plugin.');
    }
  }

  add(event: NativeEvent, identity: unknown = event): void {
    if (this.closed) throw new YuzuhaError('BOT_CLOSED', 'O bot está encerrado.');
    this.validate(event);
    const binding: Binding = { event: event.event, identity, wrapper: (...args) => {
      if (event.once) this.remove(binding);
      this.schedule(() => event.invoke(args));
    } };
    this.bindings.add(binding);
    this.client.on(event.event, binding.wrapper);
  }

  off(event: ClientEventName, identity: unknown): void {
    for (const binding of this.bindings) if (binding.event === event && binding.identity === identity) this.remove(binding);
  }

  private remove(binding: Binding): void {
    this.client.off(binding.event, binding.wrapper);
    this.bindings.delete(binding);
  }

  close(): void { this.closed = true; for (const binding of this.bindings) this.remove(binding); }
}
