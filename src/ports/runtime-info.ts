export interface ReadyInfo {
  ready: boolean;
  readyAt: number | null;
  uptimeMs: number | null;
}

export interface GatewayRuntimeInfo {
  url: string | null;
  count: number;
  ping: number | null;
  shards: { id: number; status: string; ping: number | null }[];
}

export interface ClusterRuntimeInfo {
  size: number;
  runtimes: { id: string; status: string }[];
}

export interface RuntimeInfo {
  readiness(): ReadyInfo;
  gateway(): Promise<GatewayRuntimeInfo | null>;
  cluster(id?: string): ClusterRuntimeInfo | null;
}
