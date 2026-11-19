export type ParityStatus = 'function' | 'equivalent' | 'excluded' | 'pending';
export interface SDKItem {
  id: string;
  package: string;
  name: string;
  kind: string;
  scope: string;
  member?: string;
  event?: string;
  protected?: boolean;
}
export interface Mapping {
  id: string;
  area: string;
  status: ParityStatus;
  note: string;
  functions?: string[];
  reason?: string;
  file?: string;
}
export interface Summary {
  counts: Record<ParityStatus, number>;
  pending: Record<string, number>;
  covered: number;
  safe: number;
  coverage: number;
}
export interface Validation {
  mapped: Map<string, Mapping>;
  errors: string[];
  unclassified: string[];
  stale: string[];
}
export interface ParityMatrix extends Validation {
  items: (SDKItem & Mapping)[];
  rows: (SDKItem & Mapping)[];
  sdkEvents: string[];
  modeEvents: string[];
  voiceEvents: Record<string, string>;
  summary: Summary;
}
export const ROOT: string;
export const SDK_PACKAGES: { name: string; entry: string }[];
export const AREAS: string[];
export function inventorySDK(): SDKItem[];
export function loadMappings(directory?: string): Promise<Mapping[]>;
export function functionModeEvents(): Promise<string[]>;
export function voiceFunctionModeEvents(): Promise<Record<string, string>>;
export function validateMappings(items: SDKItem[], entries: Mapping[], functions: Set<string>, events?: string[], voiceEvents?: Record<string, string>): Validation;
export function summarize(items: Pick<Mapping, 'area' | 'status'>[]): Summary;
export function assertComplete(matrix: Pick<ParityMatrix, 'errors' | 'unclassified' | 'summary'>, release?: boolean): void;
export function buildParityMatrix(): Promise<ParityMatrix>;
export function renderMatrix(matrix: ParityMatrix): string;
