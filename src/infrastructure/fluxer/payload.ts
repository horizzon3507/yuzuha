import { AllowedMentions, AttachmentBuilder, EmbedBuilder } from '@fluxerjs/core';
import type { MessageSendOptions } from '@fluxerjs/core';
import type { Payload } from '../../contracts.js';

export function safePayload(payload: Payload): MessageSendOptions {
  const embeds = payload.embeds?.map(embed => {
    const builder = new EmbedBuilder();
    if (embed.title !== undefined) builder.setTitle(embed.title);
    if (embed.description !== undefined) builder.setDescription(embed.description);
    if (embed.color !== undefined) builder.setColor(embed.color);
    if (embed.fields) builder.setFields(...embed.fields);
    if (embed.footer) builder.setFooter(embed.footer);
    if (embed.image) builder.setImage(embed.image.url);
    if (embed.thumbnail) builder.setThumbnail(embed.thumbnail.url);
    return builder;
  });
  const files = payload.files?.map(file =>
    new AttachmentBuilder(file.url, { name: file.name, description: file.description }));
  return { content: payload.content, embeds, files, allowedMentions: { ...AllowedMentions.none, repliedUser: false } };
}
