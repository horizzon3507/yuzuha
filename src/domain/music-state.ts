import type { MusicPlayerState } from './music.js';

function integer(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
}
export function isMusicPlayerState(value: unknown): value is MusicPlayerState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  return integer(state.time, 0) && integer(state.position, 0) && integer(state.ping, -1) && typeof state.connected === 'boolean';
}
