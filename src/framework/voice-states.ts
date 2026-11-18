import { Events } from '@fluxerjs/core';
import type { Client, ClientEventListener } from '@fluxerjs/core';
import type { RawVoiceStatePayload, VoiceStateTracker } from '../services/voice-states.js';

interface ReadySnapshotGuild {
  id?: string;
  voice_states?: RawVoiceStatePayload[];
  voiceStates?: RawVoiceStatePayload[];
}

export function attachVoiceStates(client: Client, tracker: VoiceStateTracker): () => void {
  const onVoiceStateUpdate = (...args: unknown[]): void => {
    // O SDK emite `[data]` wire-shaped; se um mock emitir `(oldState, newState)`, usa o último objeto.
    const candidate = (args.length >= 2 && args[1] && typeof args[1] === 'object' ? args[1] : args[0]) as RawVoiceStatePayload | undefined;
    if (candidate) tracker.apply(candidate);
  };

  const onVoiceStatesSync: ClientEventListener<typeof Events.VoiceStatesSync> = payload => {
    if (!payload || typeof payload.guildId !== 'string') return;
    tracker.syncGuild(payload.guildId, Array.isArray(payload.voiceStates) ? payload.voiceStates : []);
  };

  const onGuildDelete: ClientEventListener<typeof Events.GuildDelete> = guild => {
    if (guild && typeof guild.id === 'string') tracker.clear(guild.id);
  };

  const onChannelDelete: ClientEventListener<typeof Events.ChannelDelete> = channel => {
    if (!channel || typeof channel.id !== 'string') return;
    const guildID = 'guildId' in channel && typeof channel.guildId === 'string' ? channel.guildId : undefined;
    tracker.clearChannel(channel.id, guildID);
  };

  const onReady = (payload?: unknown): void => {
    if (!payload || typeof payload !== 'object') return;
    const guilds = (payload as { guilds?: unknown }).guilds;
    if (!Array.isArray(guilds)) return;
    for (const entry of guilds as ReadySnapshotGuild[]) {
      if (!entry || typeof entry.id !== 'string') continue;
      const states = entry.voice_states ?? entry.voiceStates;
      if (Array.isArray(states)) tracker.syncGuild(entry.id, states);
    }
  };

  client.on(Events.VoiceStateUpdate, onVoiceStateUpdate as ClientEventListener<typeof Events.VoiceStateUpdate>);
  client.on(Events.VoiceStatesSync, onVoiceStatesSync);
  client.on(Events.GuildDelete, onGuildDelete);
  client.on(Events.ChannelDelete, onChannelDelete);
  client.on(Events.Ready, onReady as ClientEventListener<typeof Events.Ready>);

  let detached = false;
  return () => {
    if (detached) return;
    detached = true;
    client.off(Events.VoiceStateUpdate, onVoiceStateUpdate as ClientEventListener<typeof Events.VoiceStateUpdate>);
    client.off(Events.VoiceStatesSync, onVoiceStatesSync);
    client.off(Events.GuildDelete, onGuildDelete);
    client.off(Events.ChannelDelete, onChannelDelete);
    client.off(Events.Ready, onReady as ClientEventListener<typeof Events.Ready>);
  };
}
