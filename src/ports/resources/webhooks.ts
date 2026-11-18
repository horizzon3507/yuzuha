import type { AllowedMentionsPolicy, Embed } from '../../domain/messages.js';
import type { WebhookEditInput } from '../../domain/webhooks.js';
import type { AttachmentSpec, BinaryAttachmentSpec } from './common.js';

export type { WebhookEditInput } from '../../domain/webhooks.js';

export interface WebhookInfo {
  id: string;
  name: string;
  channelID: string;
  guildID: string;
  token: string | null;
}

export interface WebhookSendInput {
  content?: string;
  username?: string;
  avatarURL?: string;
  embeds?: Embed[];
  files?: (AttachmentSpec | BinaryAttachmentSpec)[];
  allowedMentions?: AllowedMentionsPolicy;
  threadID?: string;
}

export interface WebhookMessageEditInput {
  content?: string | null;
  embeds?: Embed[];
  files?: (AttachmentSpec | BinaryAttachmentSpec)[];
  allowedMentions?: AllowedMentionsPolicy;
  threadID?: string;
}

export interface WebhooksResources {
  fetch(webhookID: string): Promise<WebhookInfo>;
  create(channelID: string, name: string, reason?: string): Promise<WebhookInfo>;
  list(channelID: string): Promise<WebhookInfo[]>;
  send(webhookID: string, token: string, input: WebhookSendInput): Promise<string | null>;
  edit(webhookID: string, token: string | null, input: string | WebhookEditInput, reason?: string): Promise<void>;
  delete(webhookID: string, token: string | null): Promise<void>;
  editMessage(webhookID: string, token: string, messageID: string, input: WebhookMessageEditInput): Promise<string>;
  deleteMessage(webhookID: string, token: string, messageID: string): Promise<void>;
}
