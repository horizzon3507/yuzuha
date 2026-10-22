/** Anexo resolvido por URL, sem transferir bytes pelo runtime de scripts. */
export interface AttachmentSpec {
  url: string;
  name: string;
  description?: string;
}

export interface BinaryAttachmentSpec {
  data: Uint8Array;
  name: string;
  description?: string;
}

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible';

export type ActivityType = 'playing' | 'listening' | 'watching' | 'competing' | 'custom';

export interface ActivityInfo {
  type: ActivityType;
  name: string;
  url?: string;
}

import { YuzuhaError } from '../../shared/errors.js';

export function limitOf(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new YuzuhaError('LIMIT', `Limite deve ser um inteiro entre 1 e ${max}.`);
  }
  return value;
}
