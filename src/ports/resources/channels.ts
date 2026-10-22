export interface ChannelInfo {
  id: string;
  name: string;
  type: number;
  guildID: string | null;
  parentID: string | null;
  position: number;
  topic: string | null;
  slowmode: number;
  nsfw: boolean;
  url?: string | null;
  contentWarningLevel?: number | null;
  contentWarningText?: string | null;
}

export interface ChannelCreateInput {
  url?: string;
  contentWarningLevel?: number | null;
  contentWarningText?: string | null;
  name: string;
  type?: number;
  parentID?: string;
  topic?: string;
  slowmode?: number;
  nsfw?: boolean;
  reason?: string;
}

export interface ChannelEditInput {
  url?: string | null;
  contentWarningLevel?: number | null;
  contentWarningText?: string | null;
  name?: string;
  parentID?: string | null;
  topic?: string;
  slowmode?: number;
  nsfw?: boolean;
  reason?: string;
}

export interface ChannelOverwriteInput {
  allow?: string[];
  deny?: string[];
  type?: 'role' | 'member';
  reason?: string;
}

export interface ChannelsResources {
  get(channelID: string): Promise<ChannelInfo>;
  list(guildID: string, limit?: number): Promise<ChannelInfo[]>;
  create(guildID: string, input: ChannelCreateInput): Promise<ChannelInfo>;
  edit(channelID: string, input: ChannelEditInput): Promise<ChannelInfo>;
  delete(channelID: string, reason?: string): Promise<void>;
  setSlowmode(channelID: string, seconds: number, reason?: string): Promise<void>;
  overwrite(channelID: string, targetID: string, input: ChannelOverwriteInput): Promise<void>;
  permissionsFor(guildID: string, channelID: string, userID: string): Promise<string>;
  move(channelID: string, position: number): Promise<void>;
  setCategory(channelID: string, parentID: string | null, reason?: string): Promise<ChannelInfo>;
}
