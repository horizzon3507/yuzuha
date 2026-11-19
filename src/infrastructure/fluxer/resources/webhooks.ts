import { AttachmentBuilder, Message, MessageAttachmentFlags, Routes, Webhook, type Client } from '@fluxerjs/core';
import {
  normalizeWebhookEditInput,
  normalizeWebhookMessageEditInput,
  normalizeWebhookMessageOptions,
  normalizeWebhookSendInput,
  validateWebhookID,
  validateWebhookMessageID,
  validateWebhookToken,
} from '../../../domain/webhooks.js';
import type { WebhookFileInput } from '../../../domain/webhooks.js';
import { YuzuhaError } from '../../../errors.js';
import type { WebhookInfo, WebhooksResources } from '../../../ports/resources/webhooks.js';
import { allowedMentions, embedBuilder, wireAllowedMentions } from '../payload.js';
import { toMessageInfo } from './messages.js';
import { toUserInfo } from './users.js';

const FILE_FETCH_TIMEOUT_MS = 30_000;
const MAX_TOTAL_BYTES = 10_000_000;

function toWebhookInfo(webhook: Webhook): WebhookInfo {
  return { id: webhook.id, name: webhook.name, channelID: webhook.channelId, guildID: webhook.guildId, token: webhook.token,
    avatar: webhook.avatar, avatarURL: webhook.avatarURL?.() ?? null, createdTimestamp: webhook.createdTimestamp,
    createdAt: webhook.createdAt?.toISOString(), type: webhook.type,
    user: webhook.user ? toUserInfo(webhook.user) : undefined };
}

function reasonHeaders(reason: string | undefined): { headers?: Record<string, string> } {
  if (reason === undefined || reason === '') return {};
  return { headers: { 'X-Audit-Log-Reason': encodeURIComponent(reason) } };
}

async function webhookChannel(client: Client, channelID: string, message: string) {
  const channel = await client.channels.fetch(channelID);
  if (!channel.isGuild() || typeof (channel as { createWebhook?: unknown }).createWebhook !== 'function') {
    throw new YuzuhaError('WEBHOOK_CHANNEL', message);
  }
  return channel;
}

function buildAttachmentBuilders(files: readonly WebhookFileInput[]): AttachmentBuilder[] {
  return files.map(file => {
    const builder = new AttachmentBuilder(
      'data' in file ? Buffer.from(file.data) : file.url,
      { name: file.name, ...(file.description === undefined ? {} : { description: file.description }) },
    );
    if (file.spoiler) builder.setSpoiler();
    return builder;
  });
}

function attachmentWireMeta(builders: readonly AttachmentBuilder[]): Record<string, unknown>[] {
  return builders.map((builder, id) => ({
    ...builder.toJSON(id),
    ...(builder.spoiler ? { flags: MessageAttachmentFlags.IS_SPOILER } : {}),
  }));
}

async function resolveUploadFiles(builders: readonly AttachmentBuilder[]): Promise<{ name: string; data: Uint8Array; filename: string }[]> {
  let totalBytes = 0;
  const resolved: { name: string; data: Uint8Array; filename: string }[] = [];
  for (const builder of builders) {
    if (builder.url !== null) {
      let response: Response;
      try {
        response = await fetch(builder.url, { signal: AbortSignal.timeout(FILE_FETCH_TIMEOUT_MS) });
      } catch (cause) {
        throw new YuzuhaError('ATTACHMENT_URL', `Falha ao baixar anexo: ${builder.url}.`, { cause });
      }
      if (!response.ok) {
        throw new YuzuhaError('ATTACHMENT_URL', `Falha ao baixar anexo (${response.status}): ${builder.url}.`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      totalBytes += bytes.byteLength;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new YuzuhaError('ATTACHMENTS', 'Envie de 1 a 10 anexos, com até 10 MB de bytes no total.');
      }
      resolved.push({ name: builder.filename, data: bytes, filename: builder.filename });
      continue;
    }
    const raw = builder.attachment;
    const bytes = raw instanceof Uint8Array
      ? raw
      : raw instanceof ArrayBuffer
        ? new Uint8Array(raw)
        : raw instanceof Blob
          ? new Uint8Array(await raw.arrayBuffer())
          : new Uint8Array(0);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new YuzuhaError('ATTACHMENTS', 'Envie de 1 a 10 anexos, com até 10 MB de bytes no total.');
    }
    resolved.push({ name: builder.filename, data: bytes, filename: builder.filename });
  }
  return resolved;
}

export function createWebhooksResources(client: Client): WebhooksResources {
  return {
    fetch: async webhookID => toWebhookInfo(await Webhook.fetch(client, validateWebhookID(webhookID))),
    create: async (channelID, name, reason) => {
      if (!name.trim()) throw new YuzuhaError('WEBHOOK_NAME', 'Informe o nome do webhook.');
      const channel = await webhookChannel(client, channelID, 'Webhook só pode ser criado em canal de servidor.');
      if (!reason) return toWebhookInfo(await channel.createWebhook({ name }));
      const data = await client.rest.post(Routes.channelWebhooks(channel.id), {
        body: { name },
        auth: true,
        ...reasonHeaders(reason),
      });
      return toWebhookInfo(new Webhook(client, data as never));
    },
    list: async channelID => {
      const channel = await webhookChannel(client, channelID, 'Webhooks só existem em canais de servidor.');
      return (await channel.fetchWebhooks()).map(toWebhookInfo);
    },
    send: async (webhookID, token, rawInput) => {
      const id = validateWebhookID(webhookID);
      const tok = validateWebhookToken(token);
      const input = normalizeWebhookSendInput(rawInput);
      const embeds = input.embeds?.map(embedBuilder);
      const builders = input.files ? buildAttachmentBuilders(input.files) : undefined;

      if (input.threadID === undefined) {
        const message = await Webhook.fromToken(client, id, tok).send({
          ...(input.content === undefined ? {} : { content: input.content }),
          ...(input.username === undefined ? {} : { username: input.username }),
          ...(input.avatarURL === undefined ? {} : { avatarUrl: input.avatarURL }),
          ...(embeds === undefined ? {} : { embeds }),
          ...(builders === undefined ? {} : { files: builders, attachments: builders.map((b, idx) => b.toJSON(idx)) }),
          allowedMentions: allowedMentions(input.allowedMentions),
        }, true);
        return message?.id ?? null;
      }

      const body: Record<string, unknown> = {
        allowed_mentions: wireAllowedMentions(input.allowedMentions),
      };
      if (input.content !== undefined) body['content'] = input.content;
      if (input.username !== undefined) body['username'] = input.username;
      if (input.avatarURL !== undefined) body['avatar_url'] = input.avatarURL;
      if (embeds !== undefined) body['embeds'] = embeds.map(item => item.toJSON());
      const uploadFiles = builders ? await resolveUploadFiles(builders) : undefined;
      if (builders !== undefined) body['attachments'] = attachmentWireMeta(builders);

      const route = `${Routes.webhookExecute(id, tok)}?wait=true&thread_id=${encodeURIComponent(input.threadID)}`;
      const data = await client.rest.post(route, {
        body,
        ...(uploadFiles?.length ? { files: uploadFiles } : {}),
        auth: false,
      });
      return data ? new Message(client, data as never).id : null;
    },
    edit: async (webhookID, token, rawInput, reason) => {
      const id = validateWebhookID(webhookID);
      if (token !== null) validateWebhookToken(token);
      const patch = normalizeWebhookEditInput(rawInput);

      if (!reason && patch.channelID === undefined) {
        const webhook = token ? Webhook.fromToken(client, id, token) : await Webhook.fetch(client, id);
        await webhook.edit({
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.avatar === undefined ? {} : { avatar: patch.avatar }),
        });
        return;
      }

      const body: Record<string, unknown> = {};
      if (patch.name !== undefined) body['name'] = patch.name;
      if (patch.avatar !== undefined) body['avatar'] = patch.avatar;
      if (patch.channelID !== undefined) body['channel_id'] = patch.channelID;

      if (token && patch.channelID === undefined) {
        await client.rest.patch(Routes.webhookExecute(id, token), {
          body,
          auth: false,
          ...reasonHeaders(reason),
        });
        return;
      }

      await client.rest.patch(Routes.webhook(id), {
        body,
        auth: true,
        ...reasonHeaders(reason),
      });
    },
    delete: async (webhookID, token) => {
      const id = validateWebhookID(webhookID);
      const webhook = token ? Webhook.fromToken(client, id, token) : await Webhook.fetch(client, id);
      await webhook.delete();
    },
    fetchMessage: async (webhookID, token, messageID, rawOptions) => {
      const id = validateWebhookID(webhookID);
      const tok = validateWebhookToken(token);
      const msgID = validateWebhookMessageID(messageID);
      const options = normalizeWebhookMessageOptions(rawOptions);
      if (options.threadID === undefined) {
        const message = await Webhook.fromToken(client, id, tok).fetchMessage(msgID);
        return toMessageInfo(message);
      }
      const route = `${Routes.webhookMessage(id, tok, msgID)}?thread_id=${encodeURIComponent(options.threadID)}`;
      const data = await client.rest.get(route, { auth: false });
      return toMessageInfo(new Message(client, data as never));
    },
    editMessage: async (webhookID, token, messageID, rawInput) => {
      const id = validateWebhookID(webhookID);
      const tok = validateWebhookToken(token);
      const msgID = validateWebhookMessageID(messageID);
      const input = normalizeWebhookMessageEditInput(rawInput);
      const embeds = input.embeds?.map(embedBuilder);

      if (input.files === undefined && input.threadID === undefined) {
        const webhook = Webhook.fromToken(client, id, tok);
        const message = await webhook.editMessage(msgID, {
          ...(input.content === undefined ? {} : { content: input.content }),
          ...(embeds === undefined ? {} : { embeds }),
          ...(input.content !== undefined || input.allowedMentions !== undefined
            ? { allowedMentions: allowedMentions(input.allowedMentions) }
            : {}),
        });
        return message.id;
      }

      const body: Record<string, unknown> = {};
      if (input.content !== undefined) body['content'] = input.content;
      if (embeds !== undefined) body['embeds'] = embeds.map(item => item.toJSON());
      if (input.content !== undefined || input.allowedMentions !== undefined) {
        body['allowed_mentions'] = wireAllowedMentions(input.allowedMentions);
      }

      let uploadFiles: { name: string; data: Uint8Array; filename: string }[] | undefined;
      if (input.files !== undefined) {
        if (input.files.length === 0) {
          body['attachments'] = [];
        } else {
          const builders = buildAttachmentBuilders(input.files);
          body['attachments'] = attachmentWireMeta(builders);
          uploadFiles = await resolveUploadFiles(builders);
        }
      }

      const base = Routes.webhookMessage(id, tok, msgID);
      const route = input.threadID === undefined ? base : `${base}?thread_id=${encodeURIComponent(input.threadID)}`;
      const data = await client.rest.patch(route, {
        body,
        ...(uploadFiles?.length ? { files: uploadFiles } : {}),
        auth: false,
      });
      return new Message(client, data as never).id;
    },
    deleteMessage: async (webhookID, token, messageID, rawOptions) => {
      const id = validateWebhookID(webhookID);
      const tok = validateWebhookToken(token);
      const msgID = validateWebhookMessageID(messageID);
      const options = normalizeWebhookMessageOptions(rawOptions);
      if (options.threadID === undefined) {
        const webhook = Webhook.fromToken(client, id, tok);
        await webhook.deleteMessage(msgID);
        return;
      }
      const route = `${Routes.webhookMessage(id, tok, msgID)}?thread_id=${encodeURIComponent(options.threadID)}`;
      await client.rest.delete(route, { auth: false });
    },
  };
}
