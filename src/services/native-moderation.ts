import type { CaseRecord, ModerationAction, ModerationOptions } from '../domain/moderation.js';
import { parseDuration } from '../domain/values.js';

export type ModerationTarget = string | { readonly id: string };

export interface NativeModerationOptions {
  reason: string;
  record?: boolean;
}

export interface NativeBanOptions extends NativeModerationOptions {
  deleteMessageDays?: number;
}

export interface NativeTimeoutOptions extends NativeModerationOptions {
  duration: string | number;
}

export interface NativeMoveOptions extends NativeModerationOptions {
  channelID: string | null;
}

export interface NativeVoiceOptions extends NativeModerationOptions {
  enabled: boolean;
}

type Execute = (action: ModerationAction, target: string, reason: string,
  options: ModerationOptions) => Promise<CaseRecord | undefined>;

export class NativeModeration {
  constructor(private readonly execute: Execute) {}

  ban(target: ModerationTarget, options: NativeBanOptions & { record: false }): Promise<undefined>;
  ban(target: ModerationTarget, options: NativeBanOptions & { record?: true }): Promise<CaseRecord>;
  ban(target: ModerationTarget, options: NativeBanOptions): Promise<CaseRecord | undefined>;
  ban(target: ModerationTarget, options: NativeBanOptions): Promise<CaseRecord | undefined> {
    return this.perform('ban', target, options, { deleteMessageDays: options.deleteMessageDays });
  }

  kick(target: ModerationTarget, options: NativeModerationOptions & { record: false }): Promise<undefined>;
  kick(target: ModerationTarget, options: NativeModerationOptions & { record?: true }): Promise<CaseRecord>;
  kick(target: ModerationTarget, options: NativeModerationOptions): Promise<CaseRecord | undefined>;
  kick(target: ModerationTarget, options: NativeModerationOptions): Promise<CaseRecord | undefined> {
    return this.perform('kick', target, options);
  }

  timeout(target: ModerationTarget, options: NativeTimeoutOptions & { record: false }): Promise<undefined>;
  timeout(target: ModerationTarget, options: NativeTimeoutOptions & { record?: true }): Promise<CaseRecord>;
  timeout(target: ModerationTarget, options: NativeTimeoutOptions): Promise<CaseRecord | undefined>;
  timeout(target: ModerationTarget, options: NativeTimeoutOptions): Promise<CaseRecord | undefined> {
    return this.perform('timeout', target, options, { duration: parseDuration(options.duration) });
  }

  unban(target: ModerationTarget, options: NativeModerationOptions & { record: false }): Promise<undefined>;
  unban(target: ModerationTarget, options: NativeModerationOptions & { record?: true }): Promise<CaseRecord>;
  unban(target: ModerationTarget, options: NativeModerationOptions): Promise<CaseRecord | undefined>;
  unban(target: ModerationTarget, options: NativeModerationOptions): Promise<CaseRecord | undefined> {
    return this.perform('unban', target, options);
  }

  move(target: ModerationTarget, options: NativeMoveOptions & { record: false }): Promise<undefined>;
  move(target: ModerationTarget, options: NativeMoveOptions & { record?: true }): Promise<CaseRecord>;
  move(target: ModerationTarget, options: NativeMoveOptions): Promise<CaseRecord | undefined>;
  move(target: ModerationTarget, options: NativeMoveOptions): Promise<CaseRecord | undefined> {
    return this.perform('move', target, options, { channelID: options.channelID });
  }

  mute(target: ModerationTarget, options: NativeVoiceOptions & { record: false }): Promise<undefined>;
  mute(target: ModerationTarget, options: NativeVoiceOptions & { record?: true }): Promise<CaseRecord>;
  mute(target: ModerationTarget, options: NativeVoiceOptions): Promise<CaseRecord | undefined>;
  mute(target: ModerationTarget, options: NativeVoiceOptions): Promise<CaseRecord | undefined> {
    return this.perform('mute', target, options, { enabled: options.enabled });
  }

  deafen(target: ModerationTarget, options: NativeVoiceOptions & { record: false }): Promise<undefined>;
  deafen(target: ModerationTarget, options: NativeVoiceOptions & { record?: true }): Promise<CaseRecord>;
  deafen(target: ModerationTarget, options: NativeVoiceOptions): Promise<CaseRecord | undefined>;
  deafen(target: ModerationTarget, options: NativeVoiceOptions): Promise<CaseRecord | undefined> {
    return this.perform('deafen', target, options, { enabled: options.enabled });
  }

  private perform(action: ModerationAction, target: ModerationTarget, options: NativeModerationOptions,
    extra: ModerationOptions = {}): Promise<CaseRecord | undefined> {
    return this.execute(action, typeof target === 'string' ? target : target.id,
      options.reason, { ...extra, record: options.record ?? true });
  }
}
