import { AllowedMentions, AttachmentBuilder, EmbedBuilder } from '@fluxerjs/core';
import type { MessageSendOptions } from '@fluxerjs/core';
import type { AllowedMentionsPolicy, Embed, Payload, ReplyTarget } from '../../contracts.js';
import { assertEmbedCount } from '../../domain/embeds.js';

function embedBuilder(embed: Embed): EmbedBuilder {
  const builder = new EmbedBuilder();
  if (embed.url !== undefined) builder.setURL(embed.url);
  if (embed.title !== undefined) builder.setTitle(embed.title);
  if (embed.description !== undefined) builder.setDescription(embed.description);
  if (embed.color !== undefined) builder.setColor(embed.color);
  if (embed.timestamp !== undefined) builder.setTimestamp(new Date(embed.timestamp));
  if (embed.author) {
    builder.setAuthor({ name: embed.author.name,
      ...(embed.author.url === undefined ? {} : { url: embed.author.url }),
      ...(embed.author.iconURL === undefined ? {} : { iconURL: embed.author.iconURL }) });
  }
  if (embed.fields) builder.setFields(...embed.fields);
  if (embed.footer) {
    builder.setFooter({ text: embed.footer.text,
      ...(embed.footer.iconURL === undefined ? {} : { iconURL: embed.footer.iconURL }) });
  }
  if (embed.image) builder.setImage(mediaOptions(embed.image));
  if (embed.thumbnail) builder.setThumbnail(mediaOptions(embed.thumbnail));
  return builder;
}

function mediaOptions(media: { url: string; description?: string }): string | { url: string; description: string } {
  return media.description === undefined ? media.url : { url: media.url, description: media.description };
}

/** Padrão seguro: nenhuma menção e sem ping ao autor respondido. Relaxar exige política explícita já autorizada. */
function allowedMentions(policy: AllowedMentionsPolicy | undefined): MessageSendOptions['allowedMentions'] {
  if (!policy) return { ...AllowedMentions.none, repliedUser: false };
  return {
    parse: policy.parse ?? [],
    ...(policy.users === undefined ? {} : { users: policy.users }),
    ...(policy.roles === undefined ? {} : { roles: policy.roles }),
    repliedUser: policy.repliedUser ?? false,
  };
}

export function replyTarget(reply: ReplyTarget): { channelId: string; messageId: string; guildId?: string } {
  return { channelId: reply.channelID, messageId: reply.messageID, ...(reply.guildID === undefined ? {} : { guildId: reply.guildID }) };
}

export function safePayload(payload: Payload): MessageSendOptions {
  assertEmbedCount(payload.embeds?.length ?? 0);
  const embeds = payload.embeds?.map(embedBuilder);
  const files = payload.files?.map(file =>
    new AttachmentBuilder(file.url, { name: file.name, description: file.description }));
  return {
    content: payload.content,
    embeds,
    files,
    allowedMentions: allowedMentions(payload.allowedMentions),
    ...(payload.tts === undefined ? {} : { tts: payload.tts }),
    ...(payload.stickerIds === undefined ? {} : { stickerIds: payload.stickerIds }),
    ...(payload.flags === undefined ? {} : { flags: payload.flags }),
  };
}
