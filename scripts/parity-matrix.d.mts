export interface ParityRow {
  name: string;
  package: string;
  kind: string;
  area: string | null;
  status: string;
  evidence: string;
  members: { name: string; kind: string; status: string }[];
}

export interface ParityMatrix {
  rows: ParityRow[];
  unclassified: string[];
  stale: string[];
  sdkEvents: string[];
  modeEvents: string[];
  areas: { areas: Record<string, string[]>; sdkOnly: Record<string, { exports: string[]; note: string }> };
  sdkOnly: Map<string, string>;
}

export const ROOT: string;
export function buildParityMatrix(): Promise<ParityMatrix>;
export function renderMatrix(matrix: ParityMatrix): string;
