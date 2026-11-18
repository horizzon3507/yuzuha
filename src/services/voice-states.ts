/** Estado normalizado de um membro conectado a um canal de voz. */
export interface VoiceStateInfo {
  guildID: string;
  channelID: string;
  userID: string;
  sessionID: string;
  deaf: boolean;
  mute: boolean;
  selfDeaf: boolean;
  selfMute: boolean;
  selfStream: boolean;
  selfVideo: boolean;
  suppress: boolean;
  requestToSpeakTimestamp: number | null;
}

/** Formato bruto aceito pelo rastreador (wire snake_case do gateway ou camelCase de mocks). */
export interface RawVoiceStatePayload {
  guild_id?: string | null;
  guildId?: string | null;
  guildID?: string | null;
  channel_id?: string | null;
  channelId?: string | null;
  channelID?: string | null;
  user_id?: string;
  userId?: string;
  userID?: string;
  session_id?: string | null;
  sessionId?: string | null;
  sessionID?: string | null;
  deaf?: boolean;
  mute?: boolean;
  self_deaf?: boolean;
  selfDeaf?: boolean;
  self_mute?: boolean;
  selfMute?: boolean;
  self_stream?: boolean;
  selfStream?: boolean;
  self_video?: boolean;
  selfVideo?: boolean;
  suppress?: boolean;
  request_to_speak_timestamp?: string | number | Date | null;
  requestToSpeakTimestamp?: string | number | Date | null;
  member?: unknown;
}

function parseSpeakTimestamp(value: string | number | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const ms = Date.parse(trimmed);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function cloneState(state: VoiceStateInfo): VoiceStateInfo {
  return { ...state };
}

function pickChannelID(raw: RawVoiceStatePayload): string | null | undefined {
  if (raw.channel_id !== undefined) return raw.channel_id;
  if (raw.channelId !== undefined) return raw.channelId;
  if (raw.channelID !== undefined) return raw.channelID;
  return undefined;
}

/** Rastreador em memória de estados de voz por servidor e usuário. */
export class VoiceStateTracker {
  private readonly guilds = new Map<string, Map<string, VoiceStateInfo>>();
  private total = 0;

  /** Quantidade total de estados de voz ativos rastreados em todos os servidores. */
  get size(): number {
    return this.total;
  }

  /** Retorna uma cópia do estado de voz de um usuário no servidor, ou `undefined`. */
  get(guildID: string, userID: string): VoiceStateInfo | undefined {
    const state = this.guilds.get(guildID)?.get(userID);
    return state ? cloneState(state) : undefined;
  }

  /** Lista todos os estados de voz ativos do servidor informado. */
  guild(guildID: string): VoiceStateInfo[] {
    const members = this.guilds.get(guildID);
    if (!members) return [];
    const list: VoiceStateInfo[] = [];
    for (const state of members.values()) list.push(cloneState(state));
    return list;
  }

  /** Lista os estados de voz ativos conectados a um canal específico do servidor. */
  channel(guildID: string, channelID: string): VoiceStateInfo[] {
    const members = this.guilds.get(guildID);
    if (!members) return [];
    const list: VoiceStateInfo[] = [];
    for (const state of members.values()) {
      if (state.channelID === channelID) list.push(cloneState(state));
    }
    return list;
  }

  /** Retorna o `channelID` atual do usuário no servidor, ou `null` quando fora de voz. */
  userChannel(guildID: string, userID: string): string | null {
    return this.guilds.get(guildID)?.get(userID)?.channelID ?? null;
  }

  /** Limpa os estados de um servidor específico ou de todo o rastreador. */
  clear(guildID?: string): void {
    if (guildID !== undefined) {
      const members = this.guilds.get(guildID);
      if (!members) return;
      this.total -= members.size;
      this.guilds.delete(guildID);
      return;
    }
    this.guilds.clear();
    this.total = 0;
  }

  /** Remove todos os estados associados a um canal excluído. */
  clearChannel(channelID: string, guildID?: string): void {
    if (!channelID) return;
    if (guildID !== undefined) {
      this.evictChannelFromGuild(guildID, channelID);
      return;
    }
    for (const targetGuildID of [...this.guilds.keys()]) {
      this.evictChannelFromGuild(targetGuildID, channelID);
    }
  }

  /** Substitui todos os estados de um servidor a partir de um snapshot inicial (`voiceStatesSync`). */
  syncGuild(guildID: string, states: readonly RawVoiceStatePayload[]): void {
    if (!guildID) return;
    this.clear(guildID);
    for (const raw of states) this.apply(raw, guildID);
  }

  /** Aplica uma atualização individual de estado de voz (`voiceStateUpdate`). */
  apply(raw: RawVoiceStatePayload, fallbackGuildID?: string): void {
    if (!raw || typeof raw !== 'object') return;
    const memberObj = raw.member && typeof raw.member === 'object' ? raw.member as { guild_id?: string | null; guildId?: string | null } : undefined;
    const guildID = raw.guild_id ?? raw.guildId ?? raw.guildID
      ?? memberObj?.guild_id ?? memberObj?.guildId ?? fallbackGuildID ?? '';
    const userID = raw.user_id ?? raw.userId ?? raw.userID ?? '';
    if (!guildID || !userID) return;

    const channelID = pickChannelID(raw);
    if (channelID === null || channelID === undefined || channelID === '') {
      const members = this.guilds.get(guildID);
      if (members?.delete(userID)) {
        this.total--;
        if (members.size === 0) this.guilds.delete(guildID);
      }
      return;
    }

    let members = this.guilds.get(guildID);
    if (!members) {
      members = new Map();
      this.guilds.set(guildID, members);
    }
    if (!members.has(userID)) this.total++;

    const state: VoiceStateInfo = {
      guildID,
      channelID,
      userID,
      sessionID: raw.session_id ?? raw.sessionId ?? raw.sessionID ?? '',
      deaf: Boolean(raw.deaf),
      mute: Boolean(raw.mute),
      selfDeaf: Boolean(raw.self_deaf ?? raw.selfDeaf),
      selfMute: Boolean(raw.self_mute ?? raw.selfMute),
      selfStream: Boolean(raw.self_stream ?? raw.selfStream),
      selfVideo: Boolean(raw.self_video ?? raw.selfVideo),
      suppress: Boolean(raw.suppress),
      requestToSpeakTimestamp: parseSpeakTimestamp(
        raw.request_to_speak_timestamp !== undefined ? raw.request_to_speak_timestamp : raw.requestToSpeakTimestamp,
      ),
    };
    members.set(userID, state);
  }

  private evictChannelFromGuild(guildID: string, channelID: string): void {
    const members = this.guilds.get(guildID);
    if (!members) return;
    for (const [userID, state] of members) {
      if (state.channelID === channelID) {
        members.delete(userID);
        this.total--;
      }
    }
    if (members.size === 0) this.guilds.delete(guildID);
  }
}
