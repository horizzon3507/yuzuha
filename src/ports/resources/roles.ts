export interface RoleInfo {
  id: string;
  name: string;
  color: number;
  position: number;
  permissions: string;
  hoist: boolean;
  mentionable: boolean;
  unicodeEmoji: string | null;
  managed: boolean;
}

export interface RoleCreateInput {
  name: string;
  color?: number;
  permissions?: string[];
  hoist?: boolean;
  mentionable?: boolean;
  reason?: string;
}

export interface RoleEditInput {
  name?: string;
  color?: number;
  permissions?: string[];
  hoist?: boolean;
  mentionable?: boolean;
  reason?: string;
}

export interface RolesResources {
  resolve(guildID: string, role: string): Promise<RoleInfo>;
  list(guildID: string): Promise<RoleInfo[]>;
  has(guildID: string, userID: string, role: string): Promise<boolean>;
  add(guildID: string, userID: string, role: string): Promise<void>;
  remove(guildID: string, userID: string, role: string): Promise<void>;
  create(guildID: string, input: RoleCreateInput): Promise<RoleInfo>;
  edit(guildID: string, role: string, input: RoleEditInput): Promise<RoleInfo>;
  delete(guildID: string, role: string, reason?: string): Promise<void>;
  move(guildID: string, role: string, position: number): Promise<void>;
}
