import { Webhook, type Client } from '@fluxerjs/core';
import { YuzuhaError } from '../../../errors.js';
import type { WebhookInfo, WebhooksResources } from '../../../ports/resources/webhooks.js';

function toWebhookInfo(webhook: Webhook): WebhookInfo {
  return { id: webhook.id, name: webhook.name, channelID: webhook.channelId, guildID: webhook.guildId, token: webhook.token };
}

async function webhookChannel(client: Client, channelID: string, message: string) {
  const channel = await client.channels.fetch(channelID);
  if (!channel.isGuild() || typeof (channel as { createWebhook?: unknown }).createWebhook !== 'function') {
    throw new YuzuhaError('WEBHOOK_CHANNEL', message);
  }
  return channel;
}

export function createWebhooksResources(client: Client): WebhooksResources {
  return {
    fetch: async webhookID => toWebhookInfo(await Webhook.fetch(client, webhookID)),
    create: async (channelID, name) => {
      if (!name.trim()) throw new YuzuhaError('WEBHOOK_NAME', 'Informe o nome do webhook.');
      const channel = await webhookChannel(client, channelID, 'Webhook só pode ser criado em canal de servidor.');
      return toWebhookInfo(await channel.createWebhook({ name }));
    },
    list: async channelID => {
      const channel = await webhookChannel(client, channelID, 'Webhooks só existem em canais de servidor.');
      return (await channel.fetchWebhooks()).map(toWebhookInfo);
    },
    send: async (webhookID, token, input) => {
      const message = await Webhook.fromToken(client, webhookID, token).send(
        { content: input.content, username: input.username, avatarUrl: input.avatarURL }, true);
      return message?.id ?? null;
    },
    edit: async (webhookID, token, name) => {
      if (!name.trim()) throw new YuzuhaError('WEBHOOK_NAME', 'Informe o novo nome do webhook.');
      const webhook = token ? Webhook.fromToken(client, webhookID, token) : await Webhook.fetch(client, webhookID);
      await webhook.edit({ name });
    },
    delete: async (webhookID, token) => {
      const webhook = token ? Webhook.fromToken(client, webhookID, token) : await Webhook.fetch(client, webhookID);
      await webhook.delete();
    },
  };
}
