import type { CanvasBuilder } from 'yuzuha/canvas';

export interface RankingEntry { name: string; score: number }

export function buildRanking(entries?: readonly RankingEntry[]): CanvasBuilder;
