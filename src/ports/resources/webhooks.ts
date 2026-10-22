export interface WebhookInfo {
  id: string;
  name: string;
  channelID: string;
  guildID: string;
  token: string | null;
}

export interface WebhookSendInput {
  content: string;
  username?: string;
  avatarURL?: string;
}

export interface WebhooksResources {
  fetch(webhookID: string): Promise<WebhookInfo>;
  create(channelID: string, name: string, reason?: string): Promise<WebhookInfo>;
  list(channelID: string): Promise<WebhookInfo[]>;
  send(webhookID: string, token: string, input: WebhookSendInput): Promise<string | null>;
  edit(webhookID: string, token: string | null, name: string): Promise<void>;
  delete(webhookID: string, token: string | null): Promise<void>;
}
