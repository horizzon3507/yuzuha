# Matriz automática de paridade

Gerada por `scripts/parity-matrix.mjs` a partir dos `.d.ts` de `@fluxerjs/core`, `@fluxerjs/builders` e `@fluxerjs/types` instalados. Atualize com `npm run docs:generate`. Não edite à mão.

## Como ler

- **coberto-script**: o nome é alcançado pelo caminho `builtins → ports → adaptador do SDK`.
- **coberto-nativo**: o código do Yuzuha usa o nome do SDK, mas nenhuma função `$` o alcança.
- **só-SDK**: exceção intencional, com motivo em `scripts/parity-areas.json`.
- **lacuna**: nenhum dos caminhos acima alcança o nome. Vira candidato a função ou a recurso.
- **dados**: tipos e enums, sem comportamento próprio.

A cobertura é por nome: um método `send` de uma classe conta como coberto se qualquer adaptador usar `send`. Use a matriz como lista de revisão, não como prova de cobertura.

## Resumo por export

| Status | Exports de runtime | Membros |
|---|---:|---:|
| coberto-script | 50 | 414 |
| coberto-nativo | 4 | 85 |
| só-SDK | 3 | 0 |
| lacuna | 60 | 223 |

Pacotes: @fluxerjs/core, @fluxerjs/builders, @fluxerjs/types. Tipos e enums são listados, mas não contam como lacuna.

## Exports de runtime

| Pacote | Export | Tipo | Área | Status | Evidência |
|---|---|---|---|---|---|
| @fluxerjs/builders | `AttachmentBuilder` | class | Embeds e payloads | coberto-script | builtins |
| @fluxerjs/builders | `AttachmentMeta` | class | Embeds e payloads | coberto-script | builtins |
| @fluxerjs/builders | `EmbedBuilder` | class | Embeds e payloads | coberto-script | builtins |
| @fluxerjs/builders | `MessagePayload` | class | Embeds e payloads | coberto-script | builtins |
| @fluxerjs/core | `AllowedMentions` | variable | Embeds e payloads | coberto-nativo | código nativo |
| @fluxerjs/core | `AnnouncementChannel` | class | Canais | lacuna |  |
| @fluxerjs/core | `AttachmentBuilder` | class | Embeds e payloads | coberto-script | builtins |
| @fluxerjs/core | `AttachmentMeta` | class | Embeds e payloads | coberto-script | builtins |
| @fluxerjs/core | `Base` | class | Cliente e eventos | coberto-script | builtins |
| @fluxerjs/core | `BETA_CLIENT_CLUSTER_WARNING` | variable | só SDK | só-SDK |  |
| @fluxerjs/core | `CacheController` | class | Cliente e eventos | coberto-nativo | código nativo |
| @fluxerjs/core | `CategoryChannel` | class | Canais | lacuna |  |
| @fluxerjs/core | `CDN_URL` | variable | CDN | lacuna |  |
| @fluxerjs/core | `cdnAvatarURL` | function | CDN | lacuna |  |
| @fluxerjs/core | `cdnBannerURL` | function | CDN | lacuna |  |
| @fluxerjs/core | `cdnDefaultAvatarURL` | function | CDN | lacuna |  |
| @fluxerjs/core | `cdnDisplayAvatarURL` | function | CDN | lacuna |  |
| @fluxerjs/core | `cdnEmojiURL` | function | CDN | lacuna |  |
| @fluxerjs/core | `cdnGuildAssetURL` | function | CDN | lacuna |  |
| @fluxerjs/core | `cdnMemberAvatarURL` | function | CDN | lacuna |  |
| @fluxerjs/core | `cdnMemberBannerURL` | function | CDN | lacuna |  |
| @fluxerjs/core | `cdnStickerURL` | function | CDN | lacuna |  |
| @fluxerjs/core | `Channel` | class | Canais | coberto-script | builtins |
| @fluxerjs/core | `ChannelManager` | class | Canais | coberto-script | builtins |
| @fluxerjs/core | `Client` | class | Cliente e eventos | coberto-script | builtins |
| @fluxerjs/core | `ClientCluster` | class | só SDK | só-SDK | builtins |
| @fluxerjs/core | `ClientClusterEvents` | variable | só SDK | só-SDK |  |
| @fluxerjs/core | `ClientUser` | class | Cliente e eventos | coberto-script | builtins |
| @fluxerjs/core | `createLogger` | function | Erros e logs | lacuna |  |
| @fluxerjs/core | `DEFAULT_CACHE_LIMITS` | variable | Cliente e eventos | lacuna |  |
| @fluxerjs/core | `DEFAULT_INSTANCE_ENDPOINTS` | variable | Instância e discovery | lacuna |  |
| @fluxerjs/core | `DMChannel` | class | Canais | coberto-script | builtins |
| @fluxerjs/core | `EmbedBuilder` | class | Embeds e payloads | coberto-script | builtins |
| @fluxerjs/core | `ErrorCodes` | variable | Erros e logs | lacuna |  |
| @fluxerjs/core | `Events` | variable | Cliente e eventos | coberto-nativo | código nativo |
| @fluxerjs/core | `fetchActiveThreads` | function | Threads | coberto-script | builtins |
| @fluxerjs/core | `FluxerError` | class | Erros e logs | coberto-script | builtins |
| @fluxerjs/core | `ForumChannel` | class | Canais | lacuna |  |
| @fluxerjs/core | `Guild` | class | Servidores e bans | coberto-script | builtins |
| @fluxerjs/core | `GuildBan` | class | Servidores e bans | coberto-script | builtins |
| @fluxerjs/core | `GuildChannel` | class | Canais | coberto-script | builtins |
| @fluxerjs/core | `GuildEmoji` | class | Expressões | coberto-script | builtins |
| @fluxerjs/core | `GuildManager` | class | Servidores e bans | coberto-script | builtins |
| @fluxerjs/core | `GuildMember` | class | Usuários e membros | coberto-script | builtins |
| @fluxerjs/core | `GuildMemberManager` | class | Usuários e membros | coberto-script | builtins |
| @fluxerjs/core | `GuildMemberProfileFlags` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/core | `GuildMemberRoleManager` | class | Usuários e membros | coberto-script | builtins |
| @fluxerjs/core | `GuildOperations` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/core | `GuildRoleManager` | class | Cargos | lacuna |  |
| @fluxerjs/core | `GuildSticker` | class | Expressões | coberto-script | builtins |
| @fluxerjs/core | `INSTANCE_DISCOVERY_PATH` | variable | Instância e discovery | lacuna |  |
| @fluxerjs/core | `instanceDiscoveryUrl` | function | Instância e discovery | lacuna |  |
| @fluxerjs/core | `Invite` | class | Convites | coberto-script | builtins |
| @fluxerjs/core | `inviteUrl` | function | Convites | lacuna |  |
| @fluxerjs/core | `LinkChannel` | class | Canais | coberto-script | builtins |
| @fluxerjs/core | `MediaChannel` | class | Canais | lacuna |  |
| @fluxerjs/core | `Message` | class | Mensagens e reações | coberto-script | builtins |
| @fluxerjs/core | `MessageAttachmentFlags` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/core | `MessageCollector` | class | Coletores | coberto-script | builtins |
| @fluxerjs/core | `MessageFlags` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/core | `MessageFlagsBitField` | class | Constantes e bitfields | lacuna |  |
| @fluxerjs/core | `MessageFlagsBits` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/core | `MessageManager` | class | Mensagens e reações | coberto-script | builtins |
| @fluxerjs/core | `MessagePayload` | class | Embeds e payloads | coberto-script | builtins |
| @fluxerjs/core | `MessageReaction` | class | Mensagens e reações | coberto-script | builtins |
| @fluxerjs/core | `MessageReactionManager` | class | Mensagens e reações | coberto-script | builtins |
| @fluxerjs/core | `MessageSticker` | class | Mensagens e reações | coberto-script | builtins |
| @fluxerjs/core | `normalizeApiOrigin` | function | Instância e discovery | lacuna |  |
| @fluxerjs/core | `normalizeCacheLimit` | function | Cliente e eventos | lacuna |  |
| @fluxerjs/core | `parseInstanceDiscovery` | function | Instância e discovery | lacuna |  |
| @fluxerjs/core | `parsePrefixCommand` | function | Texto e guards | lacuna |  |
| @fluxerjs/core | `parseUserMention` | function | Texto e guards | lacuna |  |
| @fluxerjs/core | `PartialGuildMember` | class | Usuários e membros | coberto-script | builtins |
| @fluxerjs/core | `PartialMessage` | class | Mensagens e reações | coberto-script | builtins |
| @fluxerjs/core | `PermissionFlags` | variable | Constantes e bitfields | coberto-nativo | código nativo |
| @fluxerjs/core | `PermissionOverwrite` | class | Canais | coberto-script | builtins |
| @fluxerjs/core | `PermissionOverwriteManager` | class | Canais | coberto-script | builtins |
| @fluxerjs/core | `PermissionsBitField` | class | Constantes e bitfields | coberto-script | builtins |
| @fluxerjs/core | `PublicUserFlags` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/core | `ReactionCollector` | class | Coletores | coberto-script | builtins |
| @fluxerjs/core | `resolveCacheLimits` | function | Cliente e eventos | lacuna |  |
| @fluxerjs/core | `resolveInstanceEndpoints` | function | Instância e discovery | lacuna |  |
| @fluxerjs/core | `resolveKlipyToImageUrl` | function | Texto e guards | lacuna |  |
| @fluxerjs/core | `resolvePermissionsToBitfield` | function | Constantes e bitfields | lacuna |  |
| @fluxerjs/core | `Role` | class | Cargos | coberto-script | builtins |
| @fluxerjs/core | `Routes` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/core | `serializeError` | function | Erros e logs | lacuna |  |
| @fluxerjs/core | `STATIC_CDN_URL` | variable | CDN | lacuna |  |
| @fluxerjs/core | `SystemChannelFlags` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/core | `TextChannel` | class | Canais | coberto-script | builtins |
| @fluxerjs/core | `ThreadChannel` | class | Threads | coberto-script | builtins |
| @fluxerjs/core | `ThreadManager` | class | Threads | coberto-script | builtins |
| @fluxerjs/core | `ThreadMember` | class | Threads | coberto-script | builtins |
| @fluxerjs/core | `ThreadMemberFlags` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/core | `ThreadMemberManager` | class | Threads | coberto-script | builtins |
| @fluxerjs/core | `User` | class | Usuários e membros | coberto-script | builtins |
| @fluxerjs/core | `UserFlagsBitField` | class | Constantes e bitfields | lacuna |  |
| @fluxerjs/core | `UserFlagsBits` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/core | `UserManager` | class | Usuários e membros | coberto-script | builtins |
| @fluxerjs/core | `VoiceChannel` | class | Canais | coberto-script | builtins |
| @fluxerjs/core | `Webhook` | class | Webhooks | coberto-script | builtins |
| @fluxerjs/types | `EmbedMediaFlags` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/types | `FLUXER_EPOCH` | variable | Constantes e bitfields | coberto-script | builtins |
| @fluxerjs/types | `GatewayDispatchEvents` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/types | `GatewayErrorCodes` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/types | `GatewayIdentifyFlags` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/types | `GuildMemberProfileFlags` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/types | `GuildOperations` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/types | `isGroupDmInvite` | function | Texto e guards | lacuna |  |
| @fluxerjs/types | `isGuildInvite` | function | Texto e guards | lacuna |  |
| @fluxerjs/types | `isUploadedAttachment` | function | Texto e guards | lacuna |  |
| @fluxerjs/types | `MessageAttachmentFlags` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/types | `MessageFlags` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/types | `PublicUserFlags` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/types | `Routes` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/types | `SystemChannelFlags` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/types | `ThreadMemberFlags` | variable | Constantes e bitfields | lacuna |  |

## Métodos e propriedades de classes

| Classe | Membro | Tipo | Status |
|---|---|---|---|
| `AttachmentBuilder` | `attachment` | propriedade | coberto-script |
| `AttachmentBuilder` | `attachment` | propriedade | coberto-script |
| `AttachmentBuilder` | `description` | propriedade | coberto-script |
| `AttachmentBuilder` | `description` | propriedade | coberto-script |
| `AttachmentBuilder` | `filename` | acessor | coberto-script |
| `AttachmentBuilder` | `filename` | acessor | coberto-script |
| `AttachmentBuilder` | `name` | propriedade | coberto-script |
| `AttachmentBuilder` | `name` | propriedade | coberto-script |
| `AttachmentBuilder` | `setDescription` | método | coberto-nativo |
| `AttachmentBuilder` | `setDescription` | método | coberto-nativo |
| `AttachmentBuilder` | `setName` | método | lacuna |
| `AttachmentBuilder` | `setName` | método | lacuna |
| `AttachmentBuilder` | `setSpoiler` | método | lacuna |
| `AttachmentBuilder` | `setSpoiler` | método | lacuna |
| `AttachmentBuilder` | `spoiler` | propriedade | lacuna |
| `AttachmentBuilder` | `spoiler` | propriedade | lacuna |
| `AttachmentBuilder` | `toFileData` | método | lacuna |
| `AttachmentBuilder` | `toFileData` | método | lacuna |
| `AttachmentBuilder` | `toJSON` | método | coberto-script |
| `AttachmentBuilder` | `toJSON` | método | coberto-script |
| `AttachmentBuilder` | `url` | propriedade | coberto-script |
| `AttachmentBuilder` | `url` | propriedade | coberto-script |
| `AttachmentMeta` | `description` | propriedade | coberto-script |
| `AttachmentMeta` | `description` | propriedade | coberto-script |
| `AttachmentMeta` | `filename` | propriedade | coberto-script |
| `AttachmentMeta` | `filename` | propriedade | coberto-script |
| `AttachmentMeta` | `id` | propriedade | coberto-script |
| `AttachmentMeta` | `id` | propriedade | coberto-script |
| `AttachmentMeta` | `setDescription` | método | coberto-nativo |
| `AttachmentMeta` | `setDescription` | método | coberto-nativo |
| `AttachmentMeta` | `setName` | método | lacuna |
| `AttachmentMeta` | `setName` | método | lacuna |
| `AttachmentMeta` | `setSpoiler` | método | lacuna |
| `AttachmentMeta` | `setSpoiler` | método | lacuna |
| `AttachmentMeta` | `spoiler` | propriedade | lacuna |
| `AttachmentMeta` | `spoiler` | propriedade | lacuna |
| `AttachmentMeta` | `toJSON` | método | coberto-script |
| `AttachmentMeta` | `toJSON` | método | coberto-script |
| `Base` | `client` | propriedade | coberto-script |
| `CacheController` | `cascadeChannel` | método | lacuna |
| `CacheController` | `cascadeGuild` | método | lacuna |
| `CacheController` | `cascading` | acessor | lacuna |
| `CacheController` | `limits` | propriedade | coberto-nativo |
| `CacheController` | `stats` | método | coberto-nativo |
| `CacheController` | `sweepChannels` | método | lacuna |
| `CacheController` | `sweepGuilds` | método | lacuna |
| `CacheController` | `sweepMembers` | método | coberto-nativo |
| `CacheController` | `sweepMessages` | método | coberto-nativo |
| `CacheController` | `sweepUsers` | método | lacuna |
| `Channel` | `_patch` | método | lacuna |
| `Channel` | `acknowledgePins` | método | lacuna |
| `Channel` | `awaitMessages` | método | lacuna |
| `Channel` | `bulkDelete` | método | lacuna |
| `Channel` | `bulkDeleteMyMessages` | método | lacuna |
| `Channel` | `canSendMessage` | método | lacuna |
| `Channel` | `clearReadState` | método | lacuna |
| `Channel` | `client` | propriedade | coberto-script |
| `Channel` | `completeAttachmentUploads` | método | lacuna |
| `Channel` | `createdAt` | acessor | coberto-script |
| `Channel` | `createDM` | método | lacuna |
| `Channel` | `createdTimestamp` | acessor | coberto-script |
| `Channel` | `createMessageCollector` | método | lacuna |
| `Channel` | `delete` | método | coberto-script |
| `Channel` | `fetchRtcRegions` | método | lacuna |
| `Channel` | `fetchSlowmode` | método | lacuna |
| `Channel` | `from` | método | coberto-script |
| `Channel` | `fromOrCreate` | método | lacuna |
| `Channel` | `icon` | propriedade | coberto-nativo |
| `Channel` | `id` | propriedade | coberto-script |
| `Channel` | `isAnnouncement` | método | lacuna |
| `Channel` | `isCategory` | método | coberto-script |
| `Channel` | `isDM` | método | lacuna |
| `Channel` | `isForum` | método | coberto-script |
| `Channel` | `isGuild` | método | coberto-script |
| `Channel` | `isLink` | método | lacuna |
| `Channel` | `isMedia` | método | coberto-script |
| `Channel` | `isPersonalNotes` | método | lacuna |
| `Channel` | `isText` | método | lacuna |
| `Channel` | `isTextBased` | método | coberto-script |
| `Channel` | `isThread` | método | coberto-script |
| `Channel` | `isVoice` | método | coberto-nativo |
| `Channel` | `lastPinTimestamp` | propriedade | lacuna |
| `Channel` | `messages` | acessor | coberto-script |
| `Channel` | `name` | propriedade | coberto-script |
| `Channel` | `requestAttachmentUploads` | método | lacuna |
| `Channel` | `sendTyping` | método | lacuna |
| `Channel` | `toString` | método | coberto-script |
| `Channel` | `type` | propriedade | coberto-script |
| `Channel` | `uploadAttachmentsForSend` | método | lacuna |
| `ChannelManager` | `delete` | método | coberto-script |
| `ChannelManager` | `fetch` | método | coberto-script |
| `ChannelManager` | `fetchMessage` | método | coberto-script |
| `ChannelManager` | `resolve` | método | coberto-script |
| `ChannelManager` | `send` | método | coberto-script |
| `Client` | `_addMessageToCache` | método | lacuna |
| `Client` | `_clearMessageCache` | método | lacuna |
| `Client` | `_deferredGatewayDispatches` | propriedade | lacuna |
| `Client` | `_finalizeReady` | método | lacuna |
| `Client` | `_getMessageCache` | método | lacuna |
| `Client` | `_guildStreamSettleTimeout` | propriedade | lacuna |
| `Client` | `_messageCacheStats` | método | coberto-nativo |
| `Client` | `_onGuildReceived` | método | lacuna |
| `Client` | `_pendingGuildIds` | propriedade | lacuna |
| `Client` | `_readyStubGuildIds` | propriedade | lacuna |
| `Client` | `_removeMessageFromCache` | método | lacuna |
| `Client` | `_sendToAllShards` | método | lacuna |
| `Client` | `_ws` | propriedade | lacuna |
| `Client` | `assertReady` | método | lacuna |
| `Client` | `bulkFetchMessages` | método | coberto-nativo |
| `Client` | `cache` | propriedade | coberto-nativo |
| `Client` | `channels` | propriedade | coberto-script |
| `Client` | `destroy` | método | coberto-nativo |
| `Client` | `emit` | método | coberto-nativo |
| `Client` | `events` | propriedade | coberto-nativo |
| `Client` | `fetchApplication` | método | coberto-nativo |
| `Client` | `fetchEmojiMetadata` | método | coberto-nativo |
| `Client` | `fetchGatewayInfo` | método | coberto-nativo |
| `Client` | `fetchInstance` | método | coberto-nativo |
| `Client` | `fetchOAuthApplications` | método | coberto-nativo |
| `Client` | `fetchStickerMetadata` | método | coberto-nativo |
| `Client` | `fromDiscovery` | método | lacuna |
| `Client` | `getOrCreateUser` | método | lacuna |
| `Client` | `guilds` | propriedade | coberto-script |
| `Client` | `instance` | propriedade | coberto-nativo |
| `Client` | `isReady` | método | lacuna |
| `Client` | `logger` | propriedade | lacuna |
| `Client` | `login` | método | coberto-nativo |
| `Client` | `off` | método | coberto-script |
| `Client` | `on` | método | coberto-script |
| `Client` | `once` | método | coberto-script |
| `Client` | `options` | propriedade | coberto-script |
| `Client` | `preloadMessages` | método | coberto-script |
| `Client` | `preloadMessagesAlt` | método | lacuna |
| `Client` | `readyAt` | propriedade | coberto-nativo |
| `Client` | `requestChannelMemberCounts` | método | coberto-script |
| `Client` | `requestForumUnreads` | método | coberto-nativo |
| `Client` | `requestGuildCounts` | método | coberto-script |
| `Client` | `requestGuildMembers` | método | coberto-nativo |
| `Client` | `resolveEmoji` | método | coberto-script |
| `Client` | `rest` | propriedade | lacuna |
| `Client` | `Routes` | acessor | lacuna |
| `Client` | `searchMessages` | método | coberto-script |
| `Client` | `sendToGateway` | método | coberto-nativo |
| `Client` | `subscribeThreads` | método | coberto-nativo |
| `Client` | `sweepMembers` | método | coberto-nativo |
| `Client` | `sweepMessages` | método | coberto-nativo |
| `Client` | `uptime` | acessor | lacuna |
| `Client` | `user` | propriedade | coberto-script |
| `Client` | `users` | propriedade | coberto-script |
| `Client` | `ws` | acessor | coberto-nativo |
| `ClientCluster` | `add` | método | coberto-script |
| `ClientCluster` | `addAll` | método | lacuna |
| `ClientCluster` | `destroy` | método | coberto-nativo |
| `ClientCluster` | `emit` | método | coberto-nativo |
| `ClientCluster` | `get` | método | coberto-script |
| `ClientCluster` | `has` | método | coberto-script |
| `ClientCluster` | `off` | método | coberto-script |
| `ClientCluster` | `on` | método | coberto-script |
| `ClientCluster` | `once` | método | coberto-script |
| `ClientCluster` | `remove` | método | coberto-script |
| `ClientCluster` | `restart` | método | lacuna |
| `ClientCluster` | `runtimeValues` | método | lacuna |
| `ClientCluster` | `size` | acessor | coberto-script |
| `ClientCluster` | `values` | método | coberto-script |
| `ClientUser` | `bulkDeleteMyMessagesInGuild` | método | coberto-nativo |
| `ClientUser` | `client` | propriedade | coberto-script |
| `ClientUser` | `fetch` | método | coberto-script |
| `ClientUser` | `fetchGuilds` | método | coberto-nativo |
| `ClientUser` | `leaveGuild` | método | coberto-nativo |
| `ClientUser` | `setPresence` | método | coberto-script |
| `DMChannel` | `_patch` | método | lacuna |
| `DMChannel` | `addRecipient` | método | lacuna |
| `DMChannel` | `edit` | método | coberto-script |
| `DMChannel` | `lastMessageId` | propriedade | lacuna |
| `DMChannel` | `nicks` | propriedade | lacuna |
| `DMChannel` | `ownerId` | propriedade | coberto-script |
| `DMChannel` | `pinInList` | método | lacuna |
| `DMChannel` | `purgeMessages` | método | lacuna |
| `DMChannel` | `recipients` | propriedade | lacuna |
| `DMChannel` | `removeRecipient` | método | lacuna |
| `DMChannel` | `unpinFromList` | método | lacuna |
| `EmbedBuilder` | `addFields` | método | lacuna |
| `EmbedBuilder` | `addFields` | método | lacuna |
| `EmbedBuilder` | `data` | propriedade | coberto-script |
| `EmbedBuilder` | `data` | propriedade | coberto-script |
| `EmbedBuilder` | `from` | método | coberto-script |
| `EmbedBuilder` | `from` | método | coberto-script |
| `EmbedBuilder` | `setAuthor` | método | coberto-nativo |
| `EmbedBuilder` | `setAuthor` | método | coberto-nativo |
| `EmbedBuilder` | `setColor` | método | coberto-nativo |
| `EmbedBuilder` | `setColor` | método | coberto-nativo |
| `EmbedBuilder` | `setDescription` | método | coberto-nativo |
| `EmbedBuilder` | `setDescription` | método | coberto-nativo |
| `EmbedBuilder` | `setFields` | método | coberto-nativo |
| `EmbedBuilder` | `setFields` | método | coberto-nativo |
| `EmbedBuilder` | `setFooter` | método | coberto-nativo |
| `EmbedBuilder` | `setFooter` | método | coberto-nativo |
| `EmbedBuilder` | `setImage` | método | coberto-nativo |
| `EmbedBuilder` | `setImage` | método | coberto-nativo |
| `EmbedBuilder` | `setThumbnail` | método | coberto-nativo |
| `EmbedBuilder` | `setThumbnail` | método | coberto-nativo |
| `EmbedBuilder` | `setTimestamp` | método | coberto-nativo |
| `EmbedBuilder` | `setTimestamp` | método | coberto-nativo |
| `EmbedBuilder` | `setTitle` | método | coberto-nativo |
| `EmbedBuilder` | `setTitle` | método | coberto-nativo |
| `EmbedBuilder` | `setURL` | método | coberto-nativo |
| `EmbedBuilder` | `setURL` | método | coberto-nativo |
| `EmbedBuilder` | `spliceFields` | método | lacuna |
| `EmbedBuilder` | `spliceFields` | método | lacuna |
| `EmbedBuilder` | `toJSON` | método | coberto-script |
| `EmbedBuilder` | `toJSON` | método | coberto-script |
| `FluxerError` | `code` | propriedade | coberto-script |
| `FluxerError` | `isFluxerError` | método | lacuna |
| `FluxerError` | `toJSON` | método | coberto-script |
| `FluxerError` | `toString` | método | coberto-script |
| `ForumChannel` | `_patch` | método | lacuna |
| `ForumChannel` | `defaultForumLayout` | propriedade | lacuna |
| `ForumChannel` | `setDefaultForumLayout` | método | lacuna |
| `Guild` | `_patch` | método | lacuna |
| `Guild` | `adjustMemberCount` | método | lacuna |
| `Guild` | `afkChannelId` | propriedade | coberto-script |
| `Guild` | `afkTimeout` | propriedade | lacuna |
| `Guild` | `applyForDiscovery` | método | lacuna |
| `Guild` | `available` | propriedade | lacuna |
| `Guild` | `ban` | método | coberto-script |
| `Guild` | `banner` | propriedade | coberto-script |
| `Guild` | `bannerHeight` | propriedade | lacuna |
| `Guild` | `bannerURL` | método | coberto-script |
| `Guild` | `bannerWidth` | propriedade | lacuna |
| `Guild` | `channels` | propriedade | coberto-script |
| `Guild` | `client` | propriedade | coberto-script |
| `Guild` | `cloneEmoji` | método | coberto-nativo |
| `Guild` | `cloneSticker` | método | coberto-nativo |
| `Guild` | `contentWarningLevel` | propriedade | coberto-script |
| `Guild` | `contentWarningText` | propriedade | coberto-script |
| `Guild` | `createChannel` | método | coberto-script |
| `Guild` | `createdAt` | acessor | coberto-script |
| `Guild` | `createdTimestamp` | acessor | coberto-script |
| `Guild` | `createEmoji` | método | coberto-script |
| `Guild` | `createEmojisBulk` | método | coberto-script |
| `Guild` | `createRole` | método | coberto-script |
| `Guild` | `createSticker` | método | coberto-script |
| `Guild` | `createStickersBulk` | método | lacuna |
| `Guild` | `defaultMessageNotifications` | propriedade | lacuna |
| `Guild` | `delete` | método | coberto-script |
| `Guild` | `disabledOperations` | propriedade | lacuna |
| `Guild` | `edit` | método | coberto-script |
| `Guild` | `editDiscoveryApplication` | método | lacuna |
| `Guild` | `editVanityURL` | método | coberto-script |
| `Guild` | `embedSplash` | propriedade | lacuna |
| `Guild` | `emojis` | propriedade | coberto-script |
| `Guild` | `explicitContentFilter` | propriedade | lacuna |
| `Guild` | `features` | propriedade | coberto-script |
| `Guild` | `fetchActiveThreads` | método | coberto-script |
| `Guild` | `fetchAuditLogs` | método | coberto-script |
| `Guild` | `fetchBans` | método | coberto-script |
| `Guild` | `fetchChannels` | método | coberto-script |
| `Guild` | `fetchDiscoveryStatus` | método | lacuna |
| `Guild` | `fetchEmoji` | método | coberto-script |
| `Guild` | `fetchEmojis` | método | coberto-script |
| `Guild` | `fetchInvite` | método | lacuna |
| `Guild` | `fetchInvites` | método | coberto-script |
| `Guild` | `fetchMe` | método | lacuna |
| `Guild` | `fetchMember` | método | coberto-script |
| `Guild` | `fetchRole` | método | coberto-script |
| `Guild` | `fetchRoles` | método | coberto-script |
| `Guild` | `fetchSticker` | método | coberto-script |
| `Guild` | `fetchStickers` | método | coberto-script |
| `Guild` | `fetchVanityURL` | método | coberto-script |
| `Guild` | `fetchWebhooks` | método | coberto-script |
| `Guild` | `icon` | propriedade | coberto-nativo |
| `Guild` | `iconURL` | método | coberto-script |
| `Guild` | `id` | propriedade | coberto-script |
| `Guild` | `kick` | método | coberto-nativo |
| `Guild` | `memberCount` | propriedade | coberto-script |
| `Guild` | `members` | propriedade | coberto-script |
| `Guild` | `messageHistoryCutoff` | propriedade | lacuna |
| `Guild` | `mfaLevel` | propriedade | lacuna |
| `Guild` | `name` | propriedade | coberto-script |
| `Guild` | `nsfw` | propriedade | coberto-script |
| `Guild` | `nsfwLevel` | propriedade | lacuna |
| `Guild` | `onlineCount` | propriedade | coberto-script |
| `Guild` | `ownerId` | propriedade | coberto-script |
| `Guild` | `permissions` | propriedade | coberto-script |
| `Guild` | `resetRoleHoistPositions` | método | lacuna |
| `Guild` | `resolveRoleId` | método | coberto-script |
| `Guild` | `roles` | propriedade | coberto-script |
| `Guild` | `rulesChannelId` | propriedade | lacuna |
| `Guild` | `setChannelPositions` | método | coberto-script |
| `Guild` | `setRoleHoistPositions` | método | lacuna |
| `Guild` | `setRolePositions` | método | coberto-script |
| `Guild` | `splash` | propriedade | lacuna |
| `Guild` | `splashCardAlignment` | propriedade | lacuna |
| `Guild` | `splashHeight` | propriedade | lacuna |
| `Guild` | `splashURL` | método | lacuna |
| `Guild` | `splashWidth` | propriedade | lacuna |
| `Guild` | `stickers` | propriedade | coberto-nativo |
| `Guild` | `systemChannelFlags` | propriedade | lacuna |
| `Guild` | `systemChannelId` | propriedade | coberto-script |
| `Guild` | `toString` | método | coberto-script |
| `Guild` | `transferOwnership` | método | lacuna |
| `Guild` | `unban` | método | coberto-nativo |
| `Guild` | `vanityURLCode` | propriedade | lacuna |
| `Guild` | `verificationLevel` | propriedade | lacuna |
| `Guild` | `withdrawDiscoveryApplication` | método | lacuna |
| `GuildBan` | `client` | propriedade | coberto-script |
| `GuildBan` | `expiresAt` | propriedade | coberto-script |
| `GuildBan` | `guildId` | propriedade | coberto-script |
| `GuildBan` | `reason` | propriedade | coberto-script |
| `GuildBan` | `unban` | método | coberto-nativo |
| `GuildBan` | `user` | propriedade | coberto-script |
| `GuildChannel` | `_patch` | método | lacuna |
| `GuildChannel` | `applyEditPatch` | método | lacuna |
| `GuildChannel` | `canSend` | método | lacuna |
| `GuildChannel` | `canSendMessage` | método | lacuna |
| `GuildChannel` | `createInvite` | método | coberto-script |
| `GuildChannel` | `createWebhook` | método | coberto-script |
| `GuildChannel` | `edit` | método | coberto-script |
| `GuildChannel` | `fetchInvites` | método | coberto-script |
| `GuildChannel` | `fetchWebhooks` | método | coberto-script |
| `GuildChannel` | `guildId` | propriedade | coberto-script |
| `GuildChannel` | `name` | propriedade | coberto-script |
| `GuildChannel` | `parentId` | propriedade | coberto-script |
| `GuildChannel` | `permissionOverwrites` | propriedade | coberto-script |
| `GuildChannel` | `position` | propriedade | coberto-script |
| `GuildEmoji` | `_patch` | método | lacuna |
| `GuildEmoji` | `animated` | propriedade | coberto-script |
| `GuildEmoji` | `client` | propriedade | coberto-script |
| `GuildEmoji` | `createdAt` | acessor | coberto-script |
| `GuildEmoji` | `createdTimestamp` | acessor | coberto-script |
| `GuildEmoji` | `delete` | método | coberto-script |
| `GuildEmoji` | `edit` | método | coberto-script |
| `GuildEmoji` | `guildId` | propriedade | coberto-script |
| `GuildEmoji` | `id` | propriedade | coberto-script |
| `GuildEmoji` | `identifier` | acessor | coberto-script |
| `GuildEmoji` | `name` | propriedade | coberto-script |
| `GuildEmoji` | `toString` | método | coberto-script |
| `GuildEmoji` | `url` | acessor | coberto-script |
| `GuildManager` | `delete` | método | coberto-script |
| `GuildManager` | `fetch` | método | coberto-script |
| `GuildManager` | `resolve` | método | coberto-script |
| `GuildMember` | `_clone` | método | lacuna |
| `GuildMember` | `_patch` | método | lacuna |
| `GuildMember` | `accentColor` | propriedade | coberto-script |
| `GuildMember` | `avatar` | propriedade | lacuna |
| `GuildMember` | `avatarURL` | método | coberto-script |
| `GuildMember` | `ban` | método | coberto-script |
| `GuildMember` | `bannable` | acessor | lacuna |
| `GuildMember` | `banner` | propriedade | coberto-script |
| `GuildMember` | `bannerURL` | método | coberto-script |
| `GuildMember` | `bio` | propriedade | coberto-script |
| `GuildMember` | `client` | propriedade | coberto-script |
| `GuildMember` | `communicationDisabledUntil` | propriedade | coberto-script |
| `GuildMember` | `deaf` | propriedade | coberto-nativo |
| `GuildMember` | `displayAvatarURL` | método | coberto-script |
| `GuildMember` | `displayName` | acessor | coberto-script |
| `GuildMember` | `edit` | método | coberto-script |
| `GuildMember` | `guild` | propriedade | coberto-script |
| `GuildMember` | `id` | propriedade | coberto-script |
| `GuildMember` | `joinedAt` | propriedade | coberto-script |
| `GuildMember` | `kick` | método | coberto-nativo |
| `GuildMember` | `kickable` | acessor | lacuna |
| `GuildMember` | `mentionFlags` | propriedade | lacuna |
| `GuildMember` | `moderatable` | acessor | lacuna |
| `GuildMember` | `move` | método | coberto-script |
| `GuildMember` | `mute` | propriedade | coberto-nativo |
| `GuildMember` | `nick` | propriedade | coberto-script |
| `GuildMember` | `partial` | propriedade | coberto-nativo |
| `GuildMember` | `permissions` | acessor | coberto-script |
| `GuildMember` | `permissionsIn` | método | coberto-script |
| `GuildMember` | `profileFlags` | propriedade | lacuna |
| `GuildMember` | `pronouns` | propriedade | coberto-script |
| `GuildMember` | `roles` | propriedade | coberto-script |
| `GuildMember` | `timeout` | método | coberto-script |
| `GuildMember` | `toString` | método | coberto-script |
| `GuildMember` | `user` | propriedade | coberto-script |
| `GuildMemberManager` | `fetch` | método | coberto-script |
| `GuildMemberManager` | `fetchMe` | método | lacuna |
| `GuildMemberManager` | `me` | acessor | lacuna |
| `GuildMemberManager` | `resolve` | método | coberto-script |
| `GuildMemberManager` | `search` | método | coberto-script |
| `GuildMemberRoleManager` | `_patch` | método | lacuna |
| `GuildMemberRoleManager` | `add` | método | coberto-script |
| `GuildMemberRoleManager` | `cache` | acessor | coberto-nativo |
| `GuildMemberRoleManager` | `has` | método | coberto-script |
| `GuildMemberRoleManager` | `remove` | método | coberto-script |
| `GuildMemberRoleManager` | `roleIds` | acessor | coberto-script |
| `GuildMemberRoleManager` | `set` | método | coberto-nativo |
| `GuildRoleManager` | `everyone` | acessor | lacuna |
| `GuildSticker` | `_patch` | método | lacuna |
| `GuildSticker` | `animated` | propriedade | coberto-script |
| `GuildSticker` | `client` | propriedade | coberto-script |
| `GuildSticker` | `createdAt` | acessor | coberto-script |
| `GuildSticker` | `createdTimestamp` | acessor | coberto-script |
| `GuildSticker` | `delete` | método | coberto-script |
| `GuildSticker` | `description` | propriedade | coberto-script |
| `GuildSticker` | `edit` | método | coberto-script |
| `GuildSticker` | `guildId` | propriedade | coberto-script |
| `GuildSticker` | `id` | propriedade | coberto-script |
| `GuildSticker` | `name` | propriedade | coberto-script |
| `GuildSticker` | `nsfw` | propriedade | coberto-script |
| `GuildSticker` | `tags` | propriedade | coberto-script |
| `GuildSticker` | `url` | acessor | coberto-script |
| `Invite` | `channelSnapshot` | propriedade | coberto-script |
| `Invite` | `client` | propriedade | coberto-script |
| `Invite` | `code` | propriedade | coberto-script |
| `Invite` | `createdAt` | propriedade | coberto-script |
| `Invite` | `delete` | método | coberto-script |
| `Invite` | `expiresAt` | propriedade | coberto-script |
| `Invite` | `fetch` | método | coberto-script |
| `Invite` | `guildSnapshot` | propriedade | coberto-script |
| `Invite` | `inviter` | propriedade | coberto-script |
| `Invite` | `isGroupDM` | método | lacuna |
| `Invite` | `isGuild` | método | coberto-script |
| `Invite` | `maxAge` | propriedade | coberto-script |
| `Invite` | `maxUses` | propriedade | coberto-script |
| `Invite` | `memberCount` | propriedade | coberto-script |
| `Invite` | `presenceCount` | propriedade | lacuna |
| `Invite` | `resolveChannel` | método | lacuna |
| `Invite` | `resolveGuild` | método | lacuna |
| `Invite` | `temporary` | propriedade | coberto-script |
| `Invite` | `type` | propriedade | coberto-script |
| `Invite` | `url` | acessor | coberto-script |
| `Invite` | `uses` | propriedade | coberto-script |
| `LinkChannel` | `applyEditPatch` | método | lacuna |
| `LinkChannel` | `url` | propriedade | coberto-script |
| `Message` | `_createMessageBody` | método | lacuna |
| `Message` | `_patch` | método | lacuna |
| `Message` | `_send` | método | lacuna |
| `Message` | `attachments` | propriedade | coberto-script |
| `Message` | `author` | propriedade | coberto-script |
| `Message` | `awaitReactions` | método | lacuna |
| `Message` | `call` | propriedade | lacuna |
| `Message` | `channel` | acessor | coberto-script |
| `Message` | `channelId` | propriedade | coberto-script |
| `Message` | `client` | propriedade | coberto-script |
| `Message` | `content` | propriedade | coberto-script |
| `Message` | `createdAt` | propriedade | coberto-script |
| `Message` | `createReactionCollector` | método | lacuna |
| `Message` | `delete` | método | coberto-script |
| `Message` | `deleteAttachment` | método | lacuna |
| `Message` | `edit` | método | coberto-script |
| `Message` | `editedAt` | propriedade | lacuna |
| `Message` | `embeds` | propriedade | coberto-script |
| `Message` | `fetch` | método | coberto-script |
| `Message` | `fetchReactionUsers` | método | coberto-script |
| `Message` | `fetchReactionUsersPage` | método | coberto-script |
| `Message` | `flags` | propriedade | coberto-script |
| `Message` | `guild` | acessor | coberto-script |
| `Message` | `guildId` | propriedade | coberto-script |
| `Message` | `id` | propriedade | coberto-script |
| `Message` | `member` | acessor | coberto-script |
| `Message` | `mentionEveryone` | propriedade | coberto-script |
| `Message` | `mentionRoles` | propriedade | lacuna |
| `Message` | `mentions` | propriedade | coberto-script |
| `Message` | `messageReference` | propriedade | lacuna |
| `Message` | `messageSnapshots` | propriedade | lacuna |
| `Message` | `nonce` | propriedade | coberto-nativo |
| `Message` | `nsfwEmojis` | propriedade | lacuna |
| `Message` | `partial` | propriedade | coberto-nativo |
| `Message` | `pin` | método | coberto-script |
| `Message` | `pinned` | propriedade | coberto-script |
| `Message` | `react` | método | coberto-script |
| `Message` | `reactions` | propriedade | coberto-nativo |
| `Message` | `referencedMessage` | propriedade | lacuna |
| `Message` | `removeAllReactions` | método | coberto-script |
| `Message` | `removeReaction` | método | coberto-script |
| `Message` | `removeReactionEmoji` | método | coberto-script |
| `Message` | `reply` | método | coberto-script |
| `Message` | `resolve` | método | coberto-script |
| `Message` | `resolveChannel` | método | lacuna |
| `Message` | `resolveGuild` | método | lacuna |
| `Message` | `send` | método | coberto-script |
| `Message` | `sendTo` | método | lacuna |
| `Message` | `startThread` | método | coberto-script |
| `Message` | `stickers` | propriedade | coberto-nativo |
| `Message` | `thread` | propriedade | coberto-script |
| `Message` | `tts` | propriedade | coberto-script |
| `Message` | `type` | propriedade | coberto-script |
| `Message` | `unpin` | método | coberto-script |
| `Message` | `webhookId` | propriedade | lacuna |
| `MessageCollector` | `awaitMessages` | método | lacuna |
| `MessageCollector` | `channelId` | propriedade | coberto-script |
| `MessageCollector` | `client` | propriedade | coberto-script |
| `MessageCollector` | `collected` | propriedade | coberto-script |
| `MessageCollector` | `emit` | método | coberto-nativo |
| `MessageCollector` | `on` | método | coberto-script |
| `MessageCollector` | `options` | propriedade | coberto-script |
| `MessageCollector` | `stop` | método | coberto-script |
| `MessageFlagsBitField` | `Flags` | propriedade | lacuna |
| `MessageManager` | `fetch` | método | coberto-script |
| `MessageManager` | `get` | método | coberto-script |
| `MessageManager` | `resolve` | método | coberto-script |
| `MessagePayload` | `addEmbed` | método | lacuna |
| `MessagePayload` | `addEmbed` | método | lacuna |
| `MessagePayload` | `ContentMaxLength` | propriedade | lacuna |
| `MessagePayload` | `ContentMaxLength` | propriedade | lacuna |
| `MessagePayload` | `create` | método | coberto-script |
| `MessagePayload` | `create` | método | coberto-script |
| `MessagePayload` | `data` | propriedade | coberto-script |
| `MessagePayload` | `data` | propriedade | coberto-script |
| `MessagePayload` | `setAllowedMentions` | método | lacuna |
| `MessagePayload` | `setAllowedMentions` | método | lacuna |
| `MessagePayload` | `setAttachments` | método | lacuna |
| `MessagePayload` | `setAttachments` | método | lacuna |
| `MessagePayload` | `setContent` | método | lacuna |
| `MessagePayload` | `setContent` | método | lacuna |
| `MessagePayload` | `setEmbeds` | método | lacuna |
| `MessagePayload` | `setEmbeds` | método | lacuna |
| `MessagePayload` | `setFlags` | método | lacuna |
| `MessagePayload` | `setFlags` | método | lacuna |
| `MessagePayload` | `setReply` | método | lacuna |
| `MessagePayload` | `setReply` | método | lacuna |
| `MessagePayload` | `setTTS` | método | lacuna |
| `MessagePayload` | `setTTS` | método | lacuna |
| `MessagePayload` | `toJSON` | método | coberto-script |
| `MessagePayload` | `toJSON` | método | coberto-script |
| `MessageReaction` | `_data` | propriedade | lacuna |
| `MessageReaction` | `channel` | acessor | coberto-script |
| `MessageReaction` | `channelId` | propriedade | coberto-script |
| `MessageReaction` | `client` | propriedade | coberto-script |
| `MessageReaction` | `count` | propriedade | coberto-script |
| `MessageReaction` | `emoji` | propriedade | coberto-script |
| `MessageReaction` | `emojiIdentifier` | acessor | coberto-script |
| `MessageReaction` | `fetchMessage` | método | coberto-script |
| `MessageReaction` | `fromMessage` | método | lacuna |
| `MessageReaction` | `guild` | acessor | coberto-script |
| `MessageReaction` | `guildId` | propriedade | coberto-script |
| `MessageReaction` | `me` | propriedade | lacuna |
| `MessageReaction` | `message` | acessor | coberto-script |
| `MessageReaction` | `messageId` | propriedade | coberto-script |
| `MessageReactionManager` | `_patch` | método | lacuna |
| `MessageReactionManager` | `[Symbol.iterator]` | método | lacuna |
| `MessageReactionManager` | `cache` | acessor | coberto-nativo |
| `MessageReactionManager` | `size` | acessor | coberto-script |
| `MessageSticker` | `animated` | propriedade | coberto-script |
| `MessageSticker` | `client` | propriedade | coberto-script |
| `MessageSticker` | `createdAt` | acessor | coberto-script |
| `MessageSticker` | `createdTimestamp` | acessor | coberto-script |
| `MessageSticker` | `description` | propriedade | coberto-script |
| `MessageSticker` | `id` | propriedade | coberto-script |
| `MessageSticker` | `name` | propriedade | coberto-script |
| `MessageSticker` | `tags` | propriedade | coberto-script |
| `MessageSticker` | `url` | acessor | coberto-script |
| `PartialGuildMember` | `client` | propriedade | coberto-script |
| `PartialGuildMember` | `fetch` | método | coberto-script |
| `PartialGuildMember` | `guild` | propriedade | coberto-script |
| `PartialGuildMember` | `guildId` | propriedade | coberto-script |
| `PartialGuildMember` | `id` | propriedade | coberto-script |
| `PartialGuildMember` | `partial` | propriedade | coberto-nativo |
| `PartialGuildMember` | `user` | propriedade | coberto-script |
| `PartialMessage` | `author` | propriedade | coberto-script |
| `PartialMessage` | `authorId` | propriedade | coberto-nativo |
| `PartialMessage` | `channel` | acessor | coberto-script |
| `PartialMessage` | `channelId` | propriedade | coberto-script |
| `PartialMessage` | `client` | propriedade | coberto-script |
| `PartialMessage` | `content` | propriedade | coberto-script |
| `PartialMessage` | `createdAt` | propriedade | coberto-script |
| `PartialMessage` | `fetch` | método | coberto-script |
| `PartialMessage` | `guildId` | propriedade | coberto-script |
| `PartialMessage` | `id` | propriedade | coberto-script |
| `PartialMessage` | `partial` | propriedade | coberto-nativo |
| `PartialMessage` | `resolveChannel` | método | lacuna |
| `PermissionOverwrite` | `_allow` | propriedade | lacuna |
| `PermissionOverwrite` | `_deny` | propriedade | lacuna |
| `PermissionOverwrite` | `allow` | acessor | coberto-script |
| `PermissionOverwrite` | `deny` | acessor | coberto-script |
| `PermissionOverwrite` | `id` | propriedade | coberto-script |
| `PermissionOverwrite` | `toJSON` | método | coberto-script |
| `PermissionOverwrite` | `type` | propriedade | coberto-script |
| `PermissionOverwriteManager` | `_patch` | método | lacuna |
| `PermissionOverwriteManager` | `[Symbol.iterator]` | método | lacuna |
| `PermissionOverwriteManager` | `cache` | acessor | coberto-nativo |
| `PermissionOverwriteManager` | `delete` | método | coberto-script |
| `PermissionOverwriteManager` | `edit` | método | coberto-script |
| `PermissionOverwriteManager` | `size` | acessor | coberto-script |
| `PermissionOverwriteManager` | `toJSON` | método | coberto-script |
| `PermissionsBitField` | `any` | método | coberto-nativo |
| `PermissionsBitField` | `Flags` | propriedade | lacuna |
| `PermissionsBitField` | `has` | método | coberto-script |
| `PermissionsBitField` | `missing` | método | lacuna |
| `ReactionCollector` | `awaitReactions` | método | lacuna |
| `ReactionCollector` | `channelId` | propriedade | coberto-script |
| `ReactionCollector` | `client` | propriedade | coberto-script |
| `ReactionCollector` | `collected` | propriedade | coberto-script |
| `ReactionCollector` | `emit` | método | coberto-nativo |
| `ReactionCollector` | `messageId` | propriedade | coberto-script |
| `ReactionCollector` | `on` | método | coberto-script |
| `ReactionCollector` | `options` | propriedade | coberto-script |
| `ReactionCollector` | `stop` | método | coberto-script |
| `Role` | `_clone` | método | lacuna |
| `Role` | `_patch` | método | lacuna |
| `Role` | `_permissions` | propriedade | lacuna |
| `Role` | `client` | propriedade | coberto-script |
| `Role` | `color` | propriedade | coberto-script |
| `Role` | `createdAt` | acessor | coberto-script |
| `Role` | `createdTimestamp` | acessor | coberto-script |
| `Role` | `delete` | método | coberto-script |
| `Role` | `edit` | método | coberto-script |
| `Role` | `guildId` | propriedade | coberto-script |
| `Role` | `has` | método | coberto-script |
| `Role` | `hoist` | propriedade | coberto-script |
| `Role` | `hoistPosition` | propriedade | lacuna |
| `Role` | `id` | propriedade | coberto-script |
| `Role` | `mentionable` | propriedade | coberto-script |
| `Role` | `name` | propriedade | coberto-script |
| `Role` | `permissions` | acessor | coberto-script |
| `Role` | `position` | propriedade | coberto-script |
| `Role` | `toString` | método | coberto-script |
| `Role` | `unicodeEmoji` | propriedade | coberto-script |
| `TextChannel` | `applyEditPatch` | método | lacuna |
| `TextChannel` | `contentWarningLevel` | propriedade | coberto-script |
| `TextChannel` | `contentWarningText` | propriedade | coberto-script |
| `TextChannel` | `defaultAutoArchiveDuration` | propriedade | lacuna |
| `TextChannel` | `defaultThreadRateLimitPerUser` | propriedade | lacuna |
| `TextChannel` | `editThreadDefaults` | método | lacuna |
| `TextChannel` | `lastMessageId` | propriedade | lacuna |
| `TextChannel` | `nsfw` | propriedade | coberto-script |
| `TextChannel` | `nsfwOverride` | propriedade | lacuna |
| `TextChannel` | `rateLimitPerUser` | propriedade | coberto-script |
| `TextChannel` | `setSlowmode` | método | coberto-script |
| `TextChannel` | `threads` | acessor | coberto-script |
| `TextChannel` | `topic` | propriedade | coberto-script |
| `ThreadChannel` | `_patch` | método | lacuna |
| `ThreadChannel` | `appliedTags` | propriedade | coberto-script |
| `ThreadChannel` | `archived` | propriedade | coberto-script |
| `ThreadChannel` | `archiveTimestamp` | propriedade | coberto-script |
| `ThreadChannel` | `autoArchiveDuration` | propriedade | coberto-script |
| `ThreadChannel` | `edit` | método | coberto-script |
| `ThreadChannel` | `editSelf` | método | lacuna |
| `ThreadChannel` | `flags` | propriedade | coberto-script |
| `ThreadChannel` | `invitable` | propriedade | lacuna |
| `ThreadChannel` | `join` | método | coberto-script |
| `ThreadChannel` | `lastMessageId` | propriedade | lacuna |
| `ThreadChannel` | `leave` | método | coberto-nativo |
| `ThreadChannel` | `locked` | propriedade | coberto-script |
| `ThreadChannel` | `member` | propriedade | coberto-script |
| `ThreadChannel` | `memberCount` | propriedade | coberto-script |
| `ThreadChannel` | `members` | propriedade | coberto-script |
| `ThreadChannel` | `messageCount` | propriedade | coberto-script |
| `ThreadChannel` | `ownerId` | propriedade | coberto-script |
| `ThreadChannel` | `parentId` | propriedade | coberto-script |
| `ThreadChannel` | `rateLimitPerUser` | propriedade | coberto-script |
| `ThreadChannel` | `setArchived` | método | coberto-script |
| `ThreadChannel` | `setLocked` | método | lacuna |
| `ThreadChannel` | `totalMessageSent` | propriedade | lacuna |
| `ThreadManager` | `create` | método | coberto-script |
| `ThreadManager` | `createPost` | método | coberto-script |
| `ThreadManager` | `editDefaults` | método | lacuna |
| `ThreadManager` | `fetchArchived` | método | coberto-nativo |
| `ThreadManager` | `fetchJoinedPrivateArchived` | método | coberto-nativo |
| `ThreadManager` | `search` | método | coberto-script |
| `ThreadMember` | `flags` | propriedade | coberto-script |
| `ThreadMember` | `id` | propriedade | coberto-script |
| `ThreadMember` | `joinedAt` | propriedade | coberto-script |
| `ThreadMember` | `muted` | propriedade | coberto-script |
| `ThreadMember` | `muteEndTime` | propriedade | coberto-script |
| `ThreadMember` | `muteWindow` | propriedade | coberto-script |
| `ThreadMember` | `userId` | propriedade | coberto-script |
| `ThreadMemberManager` | `add` | método | coberto-script |
| `ThreadMemberManager` | `fetch` | método | coberto-script |
| `ThreadMemberManager` | `fetchOne` | método | coberto-script |
| `ThreadMemberManager` | `remove` | método | coberto-script |
| `User` | `_patch` | método | lacuna |
| `User` | `avatar` | propriedade | lacuna |
| `User` | `avatarColor` | propriedade | lacuna |
| `User` | `avatarURL` | método | coberto-script |
| `User` | `banner` | propriedade | coberto-script |
| `User` | `bannerURL` | método | coberto-script |
| `User` | `bot` | propriedade | coberto-script |
| `User` | `client` | propriedade | coberto-script |
| `User` | `createdAt` | acessor | coberto-script |
| `User` | `createDM` | método | lacuna |
| `User` | `createdTimestamp` | acessor | coberto-script |
| `User` | `discriminator` | propriedade | lacuna |
| `User` | `displayAvatarURL` | método | coberto-script |
| `User` | `flags` | propriedade | coberto-script |
| `User` | `globalName` | propriedade | coberto-script |
| `User` | `id` | propriedade | coberto-script |
| `User` | `send` | método | coberto-script |
| `User` | `system` | propriedade | lacuna |
| `User` | `toString` | método | coberto-script |
| `User` | `username` | propriedade | coberto-script |
| `UserFlagsBitField` | `Flags` | propriedade | lacuna |
| `UserManager` | `fetch` | método | coberto-script |
| `UserManager` | `fetchWithProfile` | método | coberto-script |
| `UserManager` | `resolve` | método | coberto-script |
| `UserManager` | `sweep` | método | lacuna |
| `VoiceChannel` | `applyEditPatch` | método | lacuna |
| `VoiceChannel` | `bitrate` | propriedade | lacuna |
| `VoiceChannel` | `contentWarningLevel` | propriedade | coberto-script |
| `VoiceChannel` | `contentWarningText` | propriedade | coberto-script |
| `VoiceChannel` | `guildId` | propriedade | coberto-script |
| `VoiceChannel` | `lastMessageId` | propriedade | lacuna |
| `VoiceChannel` | `nsfw` | propriedade | coberto-script |
| `VoiceChannel` | `nsfwOverride` | propriedade | lacuna |
| `VoiceChannel` | `rateLimitPerUser` | propriedade | coberto-script |
| `VoiceChannel` | `rtcRegion` | propriedade | lacuna |
| `VoiceChannel` | `setSlowmode` | método | coberto-script |
| `VoiceChannel` | `topic` | propriedade | coberto-script |
| `VoiceChannel` | `userLimit` | propriedade | lacuna |
| `VoiceChannel` | `voiceConnectionLimit` | propriedade | lacuna |
| `Webhook` | `avatar` | propriedade | lacuna |
| `Webhook` | `avatarURL` | método | coberto-script |
| `Webhook` | `channelId` | propriedade | coberto-script |
| `Webhook` | `client` | propriedade | coberto-script |
| `Webhook` | `createdAt` | acessor | coberto-script |
| `Webhook` | `createdTimestamp` | acessor | coberto-script |
| `Webhook` | `delete` | método | coberto-script |
| `Webhook` | `deleteMessage` | método | lacuna |
| `Webhook` | `edit` | método | coberto-script |
| `Webhook` | `editMessage` | método | lacuna |
| `Webhook` | `fetch` | método | coberto-script |
| `Webhook` | `fetchMessage` | método | coberto-script |
| `Webhook` | `fromToken` | método | coberto-script |
| `Webhook` | `guildId` | propriedade | coberto-script |
| `Webhook` | `id` | propriedade | coberto-script |
| `Webhook` | `name` | propriedade | coberto-script |
| `Webhook` | `send` | método | coberto-script |
| `Webhook` | `token` | propriedade | coberto-script |
| `Webhook` | `type` | propriedade | coberto-script |
| `Webhook` | `user` | propriedade | coberto-script |

## Eventos do cliente

Comparação entre `ClientEvents` do SDK e `scriptEventNames` do function mode.

| Evento | Function mode | Status |
|---|---|---|
| `channelCreate` | não | lacuna |
| `channelDelete` | não | lacuna |
| `channelMemberCountsUpdate` | não | lacuna |
| `channelPinsUpdate` | não | lacuna |
| `channelRecipientAdd` | não | lacuna |
| `channelRecipientRemove` | não | lacuna |
| `channelUpdate` | não | lacuna |
| `debug` | não | lacuna |
| `entranceSoundPlay` | não | lacuna |
| `error` | não | lacuna |
| `forumUnreads` | não | lacuna |
| `guildAuditLogEntryCreate` | não | lacuna |
| `guildAvailable` | não | lacuna |
| `guildBanAdd` | não | lacuna |
| `guildBanRemove` | não | lacuna |
| `guildCountsUpdate` | não | lacuna |
| `guildCreate` | não | lacuna |
| `guildDelete` | não | lacuna |
| `guildEmojisUpdate` | não | lacuna |
| `guildMemberAdd` | sim | coberto-script |
| `guildMemberRemove` | sim | coberto-script |
| `guildMemberUpdate` | não | lacuna |
| `guildMembersChunk` | não | lacuna |
| `guildRoleCreate` | não | lacuna |
| `guildRoleDelete` | não | lacuna |
| `guildRoleUpdate` | não | lacuna |
| `guildStickersUpdate` | não | lacuna |
| `guildUnavailable` | não | lacuna |
| `guildUpdate` | não | lacuna |
| `inviteCreate` | não | lacuna |
| `inviteDelete` | não | lacuna |
| `messageCreate` | não | lacuna |
| `messageDelete` | sim | coberto-script |
| `messageDeleteBulk` | não | lacuna |
| `messageReactionAdd` | sim | coberto-script |
| `messageReactionAddMany` | não | lacuna |
| `messageReactionRemove` | sim | coberto-script |
| `messageReactionRemoveAll` | não | lacuna |
| `messageReactionRemoveEmoji` | não | lacuna |
| `messageUpdate` | sim | coberto-script |
| `presenceUpdate` | não | lacuna |
| `presenceUpdateBulk` | não | lacuna |
| `ready` | não | lacuna |
| `resumed` | não | lacuna |
| `shardDisconnect` | não | lacuna |
| `shardError` | não | lacuna |
| `shardReady` | não | lacuna |
| `shardReconnecting` | não | lacuna |
| `shardResumed` | não | lacuna |
| `shardingRequired` | não | lacuna |
| `threadCreate` | não | lacuna |
| `threadDelete` | não | lacuna |
| `threadListSync` | não | lacuna |
| `threadMemberListUpdate` | não | lacuna |
| `threadMemberUpdate` | não | lacuna |
| `threadMembersUpdate` | não | lacuna |
| `threadUpdate` | não | lacuna |
| `typingStart` | não | lacuna |
| `userConnectionsUpdate` | não | lacuna |
| `userUpdate` | não | lacuna |
| `voiceServerUpdate` | não | lacuna |
| `voiceStateAck` | não | lacuna |
| `voiceStateUpdate` | não | lacuna |
| `voiceStatesSync` | não | lacuna |
| `webauthnCredentialsUpdate` | não | lacuna |
| `webhooksUpdate` | não | lacuna |

Eventos do function mode que o SDK não declara: nenhum.

## Exceções intencionais (só SDK)

- **Sharding e cluster** (`BETA_CLIENT_CLUSTER_WARNING`, `ClientCluster`, `ClientClusterEvents`): Fora deste lote. O Yuzuha expõe shardCount e shardIds em clientOptions; o wrapper yuzuha/sharding fica como seguimento.
