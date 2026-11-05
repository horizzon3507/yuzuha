# Matriz automática de paridade

Gerada por `scripts/parity-matrix.mjs` a partir dos `.d.ts` de `@fluxerjs/core`, `@fluxerjs/builders` e `@fluxerjs/types` instalados. Atualize com `npm run docs:generate`. Não edite à mão.

## Como ler

- **coberto-nativo**: o código do Yuzuha usa o nome do SDK, mas nenhuma função `$` o alcança.
- **coberto-recurso**: o nome é alcançado pelo caminho `builtins → ports → adaptador do SDK`.
- **só-SDK**: exceção intencional, com motivo em `scripts/parity-areas.json`.
- **lacuna**: nenhum dos caminhos acima alcança o nome. Vira candidato a função ou a recurso.
- **dados**: tipos e enums, sem comportamento próprio.

A cobertura é por nome: um método `send` de uma classe conta como coberto se qualquer adaptador usar `send`. O function mode é uma camada fina sobre os mesmos recursos — `coberto-recurso` não indica lacuna nativa. Use a matriz como lista de revisão, não como prova de cobertura.

## Resumo por export

| Status | Exports de runtime | Membros |
|---|---:|---:|
| coberto-recurso | 50 | 416 |
| coberto-nativo | 4 | 113 |
| só-SDK | 56 | 103 |
| lacuna | 7 | 90 |

Pacotes: @fluxerjs/core, @fluxerjs/builders, @fluxerjs/types. Tipos e enums são listados, mas não contam como lacuna.

## Exports de runtime

| Pacote | Export | Tipo | Área | Status | Evidência |
|---|---|---|---|---|---|
| @fluxerjs/builders | `AttachmentBuilder` | class | Embeds e payloads | coberto-recurso | builtins |
| @fluxerjs/builders | `AttachmentMeta` | class | Embeds e payloads | coberto-recurso | builtins |
| @fluxerjs/builders | `EmbedBuilder` | class | Embeds e payloads | coberto-recurso | builtins |
| @fluxerjs/builders | `MessagePayload` | class | Embeds e payloads | coberto-recurso | builtins |
| @fluxerjs/core | `AllowedMentions` | variable | Embeds e payloads | coberto-nativo | código nativo |
| @fluxerjs/core | `AnnouncementChannel` | class | Canais | só-SDK |  |
| @fluxerjs/core | `AttachmentBuilder` | class | Embeds e payloads | coberto-recurso | builtins |
| @fluxerjs/core | `AttachmentMeta` | class | Embeds e payloads | coberto-recurso | builtins |
| @fluxerjs/core | `Base` | class | Cliente e eventos | coberto-recurso | builtins |
| @fluxerjs/core | `BETA_CLIENT_CLUSTER_WARNING` | variable | só SDK | só-SDK |  |
| @fluxerjs/core | `CacheController` | class | Cliente e eventos | coberto-nativo | código nativo |
| @fluxerjs/core | `CategoryChannel` | class | Canais | só-SDK |  |
| @fluxerjs/core | `CDN_URL` | variable | CDN | só-SDK |  |
| @fluxerjs/core | `cdnAvatarURL` | function | CDN | só-SDK |  |
| @fluxerjs/core | `cdnBannerURL` | function | CDN | só-SDK |  |
| @fluxerjs/core | `cdnDefaultAvatarURL` | function | CDN | só-SDK |  |
| @fluxerjs/core | `cdnDisplayAvatarURL` | function | CDN | só-SDK |  |
| @fluxerjs/core | `cdnEmojiURL` | function | CDN | só-SDK |  |
| @fluxerjs/core | `cdnGuildAssetURL` | function | CDN | só-SDK |  |
| @fluxerjs/core | `cdnMemberAvatarURL` | function | CDN | só-SDK |  |
| @fluxerjs/core | `cdnMemberBannerURL` | function | CDN | só-SDK |  |
| @fluxerjs/core | `cdnStickerURL` | function | CDN | só-SDK |  |
| @fluxerjs/core | `Channel` | class | Canais | coberto-recurso | builtins |
| @fluxerjs/core | `ChannelManager` | class | Canais | coberto-recurso | builtins |
| @fluxerjs/core | `Client` | class | Cliente e eventos | coberto-recurso | builtins |
| @fluxerjs/core | `ClientCluster` | class | só SDK | só-SDK | builtins |
| @fluxerjs/core | `ClientClusterEvents` | variable | só SDK | só-SDK |  |
| @fluxerjs/core | `ClientUser` | class | Cliente e eventos | coberto-recurso | builtins |
| @fluxerjs/core | `createLogger` | function | Erros e logs | só-SDK |  |
| @fluxerjs/core | `DEFAULT_CACHE_LIMITS` | variable | Cliente e eventos | só-SDK |  |
| @fluxerjs/core | `DEFAULT_INSTANCE_ENDPOINTS` | variable | Instância e discovery | só-SDK |  |
| @fluxerjs/core | `DMChannel` | class | Canais | coberto-recurso | builtins |
| @fluxerjs/core | `EmbedBuilder` | class | Embeds e payloads | coberto-recurso | builtins |
| @fluxerjs/core | `ErrorCodes` | variable | Erros e logs | só-SDK |  |
| @fluxerjs/core | `Events` | variable | Cliente e eventos | coberto-nativo | código nativo |
| @fluxerjs/core | `fetchActiveThreads` | function | Threads | coberto-recurso | builtins |
| @fluxerjs/core | `FluxerError` | class | Erros e logs | coberto-recurso | builtins |
| @fluxerjs/core | `ForumChannel` | class | Canais | só-SDK | código nativo |
| @fluxerjs/core | `Guild` | class | Servidores e bans | coberto-recurso | builtins |
| @fluxerjs/core | `GuildBan` | class | Servidores e bans | coberto-recurso | builtins |
| @fluxerjs/core | `GuildChannel` | class | Canais | coberto-recurso | builtins |
| @fluxerjs/core | `GuildEmoji` | class | Expressões | coberto-recurso | builtins |
| @fluxerjs/core | `GuildManager` | class | Servidores e bans | coberto-recurso | builtins |
| @fluxerjs/core | `GuildMember` | class | Usuários e membros | coberto-recurso | builtins |
| @fluxerjs/core | `GuildMemberManager` | class | Usuários e membros | coberto-recurso | builtins |
| @fluxerjs/core | `GuildMemberProfileFlags` | variable | Constantes e bitfields | só-SDK |  |
| @fluxerjs/core | `GuildMemberRoleManager` | class | Usuários e membros | coberto-recurso | builtins |
| @fluxerjs/core | `GuildOperations` | variable | Constantes e bitfields | só-SDK |  |
| @fluxerjs/core | `GuildRoleManager` | class | Cargos | só-SDK |  |
| @fluxerjs/core | `GuildSticker` | class | Expressões | coberto-recurso | builtins |
| @fluxerjs/core | `INSTANCE_DISCOVERY_PATH` | variable | Instância e discovery | só-SDK |  |
| @fluxerjs/core | `instanceDiscoveryUrl` | function | Instância e discovery | só-SDK |  |
| @fluxerjs/core | `Invite` | class | Convites | coberto-recurso | builtins |
| @fluxerjs/core | `inviteUrl` | function | Convites | só-SDK |  |
| @fluxerjs/core | `LinkChannel` | class | Canais | coberto-recurso | builtins |
| @fluxerjs/core | `MediaChannel` | class | Canais | só-SDK |  |
| @fluxerjs/core | `Message` | class | Mensagens e reações | coberto-recurso | builtins |
| @fluxerjs/core | `MessageAttachmentFlags` | variable | Constantes e bitfields | só-SDK |  |
| @fluxerjs/core | `MessageCollector` | class | Coletores | coberto-recurso | builtins |
| @fluxerjs/core | `MessageFlags` | variable | Constantes e bitfields | só-SDK |  |
| @fluxerjs/core | `MessageFlagsBitField` | class | Constantes e bitfields | só-SDK |  |
| @fluxerjs/core | `MessageFlagsBits` | variable | Constantes e bitfields | só-SDK |  |
| @fluxerjs/core | `MessageManager` | class | Mensagens e reações | coberto-recurso | builtins |
| @fluxerjs/core | `MessagePayload` | class | Embeds e payloads | coberto-recurso | builtins |
| @fluxerjs/core | `MessageReaction` | class | Mensagens e reações | coberto-recurso | builtins |
| @fluxerjs/core | `MessageReactionManager` | class | Mensagens e reações | coberto-recurso | builtins |
| @fluxerjs/core | `MessageSticker` | class | Mensagens e reações | coberto-recurso | builtins |
| @fluxerjs/core | `normalizeApiOrigin` | function | Instância e discovery | só-SDK |  |
| @fluxerjs/core | `normalizeCacheLimit` | function | Cliente e eventos | só-SDK |  |
| @fluxerjs/core | `parseInstanceDiscovery` | function | Instância e discovery | só-SDK |  |
| @fluxerjs/core | `parsePrefixCommand` | function | Texto e guards | só-SDK |  |
| @fluxerjs/core | `parseUserMention` | function | Texto e guards | só-SDK |  |
| @fluxerjs/core | `PartialGuildMember` | class | Usuários e membros | coberto-recurso | builtins |
| @fluxerjs/core | `PartialMessage` | class | Mensagens e reações | coberto-recurso | builtins |
| @fluxerjs/core | `PermissionFlags` | variable | Constantes e bitfields | coberto-nativo | código nativo |
| @fluxerjs/core | `PermissionOverwrite` | class | Canais | coberto-recurso | builtins |
| @fluxerjs/core | `PermissionOverwriteManager` | class | Canais | coberto-recurso | builtins |
| @fluxerjs/core | `PermissionsBitField` | class | Constantes e bitfields | coberto-recurso | builtins |
| @fluxerjs/core | `PublicUserFlags` | variable | Constantes e bitfields | só-SDK |  |
| @fluxerjs/core | `ReactionCollector` | class | Coletores | coberto-recurso | builtins |
| @fluxerjs/core | `resolveCacheLimits` | function | Cliente e eventos | só-SDK |  |
| @fluxerjs/core | `resolveInstanceEndpoints` | function | Instância e discovery | só-SDK |  |
| @fluxerjs/core | `resolveKlipyToImageUrl` | function | Texto e guards | só-SDK |  |
| @fluxerjs/core | `resolvePermissionsToBitfield` | function | Constantes e bitfields | só-SDK |  |
| @fluxerjs/core | `Role` | class | Cargos | coberto-recurso | builtins |
| @fluxerjs/core | `Routes` | variable | Constantes e bitfields | só-SDK |  |
| @fluxerjs/core | `serializeError` | function | Erros e logs | só-SDK |  |
| @fluxerjs/core | `STATIC_CDN_URL` | variable | CDN | só-SDK |  |
| @fluxerjs/core | `SystemChannelFlags` | variable | Constantes e bitfields | só-SDK |  |
| @fluxerjs/core | `TextChannel` | class | Canais | coberto-recurso | builtins |
| @fluxerjs/core | `ThreadChannel` | class | Threads | coberto-recurso | builtins |
| @fluxerjs/core | `ThreadManager` | class | Threads | coberto-recurso | builtins |
| @fluxerjs/core | `ThreadMember` | class | Threads | coberto-recurso | builtins |
| @fluxerjs/core | `ThreadMemberFlags` | variable | Constantes e bitfields | só-SDK |  |
| @fluxerjs/core | `ThreadMemberManager` | class | Threads | coberto-recurso | builtins |
| @fluxerjs/core | `User` | class | Usuários e membros | coberto-recurso | builtins |
| @fluxerjs/core | `UserFlagsBitField` | class | Constantes e bitfields | só-SDK |  |
| @fluxerjs/core | `UserFlagsBits` | variable | Constantes e bitfields | só-SDK |  |
| @fluxerjs/core | `UserManager` | class | Usuários e membros | coberto-recurso | builtins |
| @fluxerjs/core | `VoiceChannel` | class | Canais | coberto-recurso | builtins |
| @fluxerjs/core | `Webhook` | class | Webhooks | coberto-recurso | builtins |
| @fluxerjs/types | `EmbedMediaFlags` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/types | `FLUXER_EPOCH` | variable | Constantes e bitfields | coberto-recurso | builtins |
| @fluxerjs/types | `GatewayDispatchEvents` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/types | `GatewayErrorCodes` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/types | `GatewayIdentifyFlags` | variable | Constantes e bitfields | lacuna |  |
| @fluxerjs/types | `GuildMemberProfileFlags` | variable | Constantes e bitfields | só-SDK |  |
| @fluxerjs/types | `GuildOperations` | variable | Constantes e bitfields | só-SDK |  |
| @fluxerjs/types | `isGroupDmInvite` | function | Texto e guards | lacuna |  |
| @fluxerjs/types | `isGuildInvite` | function | Texto e guards | lacuna |  |
| @fluxerjs/types | `isUploadedAttachment` | function | Texto e guards | lacuna |  |
| @fluxerjs/types | `MessageAttachmentFlags` | variable | Constantes e bitfields | só-SDK |  |
| @fluxerjs/types | `MessageFlags` | variable | Constantes e bitfields | só-SDK |  |
| @fluxerjs/types | `PublicUserFlags` | variable | Constantes e bitfields | só-SDK |  |
| @fluxerjs/types | `Routes` | variable | Constantes e bitfields | só-SDK |  |
| @fluxerjs/types | `SystemChannelFlags` | variable | Constantes e bitfields | só-SDK |  |
| @fluxerjs/types | `ThreadMemberFlags` | variable | Constantes e bitfields | só-SDK |  |

## Métodos e propriedades de classes

| Classe | Membro | Tipo | Status |
|---|---|---|---|
| `AttachmentBuilder` | `attachment` | propriedade | coberto-recurso |
| `AttachmentBuilder` | `attachment` | propriedade | coberto-recurso |
| `AttachmentBuilder` | `description` | propriedade | coberto-recurso |
| `AttachmentBuilder` | `description` | propriedade | coberto-recurso |
| `AttachmentBuilder` | `filename` | acessor | coberto-recurso |
| `AttachmentBuilder` | `filename` | acessor | coberto-recurso |
| `AttachmentBuilder` | `name` | propriedade | coberto-recurso |
| `AttachmentBuilder` | `name` | propriedade | coberto-recurso |
| `AttachmentBuilder` | `setDescription` | método | coberto-nativo |
| `AttachmentBuilder` | `setDescription` | método | coberto-nativo |
| `AttachmentBuilder` | `setName` | método | lacuna |
| `AttachmentBuilder` | `setName` | método | lacuna |
| `AttachmentBuilder` | `setSpoiler` | método | lacuna |
| `AttachmentBuilder` | `setSpoiler` | método | lacuna |
| `AttachmentBuilder` | `spoiler` | propriedade | só-SDK |
| `AttachmentBuilder` | `spoiler` | propriedade | só-SDK |
| `AttachmentBuilder` | `toFileData` | método | lacuna |
| `AttachmentBuilder` | `toFileData` | método | lacuna |
| `AttachmentBuilder` | `toJSON` | método | coberto-recurso |
| `AttachmentBuilder` | `toJSON` | método | coberto-recurso |
| `AttachmentBuilder` | `url` | propriedade | coberto-recurso |
| `AttachmentBuilder` | `url` | propriedade | coberto-recurso |
| `AttachmentMeta` | `description` | propriedade | coberto-recurso |
| `AttachmentMeta` | `description` | propriedade | coberto-recurso |
| `AttachmentMeta` | `filename` | propriedade | coberto-recurso |
| `AttachmentMeta` | `filename` | propriedade | coberto-recurso |
| `AttachmentMeta` | `id` | propriedade | coberto-recurso |
| `AttachmentMeta` | `id` | propriedade | coberto-recurso |
| `AttachmentMeta` | `setDescription` | método | coberto-nativo |
| `AttachmentMeta` | `setDescription` | método | coberto-nativo |
| `AttachmentMeta` | `setName` | método | lacuna |
| `AttachmentMeta` | `setName` | método | lacuna |
| `AttachmentMeta` | `setSpoiler` | método | lacuna |
| `AttachmentMeta` | `setSpoiler` | método | lacuna |
| `AttachmentMeta` | `spoiler` | propriedade | só-SDK |
| `AttachmentMeta` | `spoiler` | propriedade | só-SDK |
| `AttachmentMeta` | `toJSON` | método | coberto-recurso |
| `AttachmentMeta` | `toJSON` | método | coberto-recurso |
| `Base` | `client` | propriedade | coberto-recurso |
| `CacheController` | `cascadeChannel` | método | lacuna |
| `CacheController` | `cascadeGuild` | método | lacuna |
| `CacheController` | `cascading` | acessor | lacuna |
| `CacheController` | `limits` | propriedade | coberto-nativo |
| `CacheController` | `stats` | método | coberto-nativo |
| `CacheController` | `sweepChannels` | método | coberto-nativo |
| `CacheController` | `sweepGuilds` | método | coberto-nativo |
| `CacheController` | `sweepMembers` | método | coberto-nativo |
| `CacheController` | `sweepMessages` | método | coberto-nativo |
| `CacheController` | `sweepUsers` | método | coberto-nativo |
| `Channel` | `_patch` | método | só-SDK |
| `Channel` | `acknowledgePins` | método | coberto-nativo |
| `Channel` | `awaitMessages` | método | lacuna |
| `Channel` | `bulkDelete` | método | coberto-nativo |
| `Channel` | `bulkDeleteMyMessages` | método | coberto-nativo |
| `Channel` | `canSendMessage` | método | lacuna |
| `Channel` | `clearReadState` | método | coberto-nativo |
| `Channel` | `client` | propriedade | coberto-recurso |
| `Channel` | `completeAttachmentUploads` | método | lacuna |
| `Channel` | `createdAt` | acessor | coberto-recurso |
| `Channel` | `createDM` | método | coberto-nativo |
| `Channel` | `createdTimestamp` | acessor | coberto-recurso |
| `Channel` | `createMessageCollector` | método | lacuna |
| `Channel` | `delete` | método | coberto-recurso |
| `Channel` | `fetchRtcRegions` | método | coberto-nativo |
| `Channel` | `fetchSlowmode` | método | coberto-nativo |
| `Channel` | `from` | método | coberto-recurso |
| `Channel` | `fromOrCreate` | método | só-SDK |
| `Channel` | `icon` | propriedade | coberto-nativo |
| `Channel` | `id` | propriedade | coberto-recurso |
| `Channel` | `isAnnouncement` | método | lacuna |
| `Channel` | `isCategory` | método | coberto-recurso |
| `Channel` | `isDM` | método | coberto-recurso |
| `Channel` | `isForum` | método | coberto-recurso |
| `Channel` | `isGuild` | método | coberto-recurso |
| `Channel` | `isLink` | método | lacuna |
| `Channel` | `isMedia` | método | coberto-recurso |
| `Channel` | `isPersonalNotes` | método | lacuna |
| `Channel` | `isText` | método | lacuna |
| `Channel` | `isTextBased` | método | coberto-recurso |
| `Channel` | `isThread` | método | coberto-recurso |
| `Channel` | `isVoice` | método | coberto-nativo |
| `Channel` | `lastPinTimestamp` | propriedade | só-SDK |
| `Channel` | `messages` | acessor | coberto-recurso |
| `Channel` | `name` | propriedade | coberto-recurso |
| `Channel` | `requestAttachmentUploads` | método | lacuna |
| `Channel` | `sendTyping` | método | coberto-nativo |
| `Channel` | `toString` | método | coberto-recurso |
| `Channel` | `type` | propriedade | coberto-recurso |
| `Channel` | `uploadAttachmentsForSend` | método | lacuna |
| `ChannelManager` | `delete` | método | coberto-recurso |
| `ChannelManager` | `fetch` | método | coberto-recurso |
| `ChannelManager` | `fetchMessage` | método | coberto-recurso |
| `ChannelManager` | `resolve` | método | coberto-recurso |
| `ChannelManager` | `send` | método | coberto-recurso |
| `Client` | `_addMessageToCache` | método | só-SDK |
| `Client` | `_clearMessageCache` | método | só-SDK |
| `Client` | `_deferredGatewayDispatches` | propriedade | só-SDK |
| `Client` | `_finalizeReady` | método | só-SDK |
| `Client` | `_getMessageCache` | método | só-SDK |
| `Client` | `_guildStreamSettleTimeout` | propriedade | só-SDK |
| `Client` | `_messageCacheStats` | método | coberto-nativo |
| `Client` | `_onGuildReceived` | método | só-SDK |
| `Client` | `_pendingGuildIds` | propriedade | só-SDK |
| `Client` | `_readyStubGuildIds` | propriedade | só-SDK |
| `Client` | `_removeMessageFromCache` | método | só-SDK |
| `Client` | `_sendToAllShards` | método | só-SDK |
| `Client` | `_ws` | propriedade | só-SDK |
| `Client` | `assertReady` | método | lacuna |
| `Client` | `bulkFetchMessages` | método | coberto-nativo |
| `Client` | `cache` | propriedade | coberto-nativo |
| `Client` | `channels` | propriedade | coberto-recurso |
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
| `Client` | `guilds` | propriedade | coberto-recurso |
| `Client` | `instance` | propriedade | coberto-nativo |
| `Client` | `isReady` | método | lacuna |
| `Client` | `logger` | propriedade | só-SDK |
| `Client` | `login` | método | coberto-nativo |
| `Client` | `off` | método | coberto-recurso |
| `Client` | `on` | método | coberto-recurso |
| `Client` | `once` | método | coberto-recurso |
| `Client` | `options` | propriedade | coberto-recurso |
| `Client` | `preloadMessages` | método | coberto-recurso |
| `Client` | `preloadMessagesAlt` | método | lacuna |
| `Client` | `readyAt` | propriedade | coberto-nativo |
| `Client` | `requestChannelMemberCounts` | método | coberto-recurso |
| `Client` | `requestForumUnreads` | método | coberto-nativo |
| `Client` | `requestGuildCounts` | método | coberto-recurso |
| `Client` | `requestGuildMembers` | método | coberto-nativo |
| `Client` | `resolveEmoji` | método | coberto-recurso |
| `Client` | `rest` | propriedade | só-SDK |
| `Client` | `Routes` | acessor | lacuna |
| `Client` | `searchMessages` | método | coberto-recurso |
| `Client` | `sendToGateway` | método | coberto-nativo |
| `Client` | `subscribeThreads` | método | coberto-nativo |
| `Client` | `sweepMembers` | método | coberto-nativo |
| `Client` | `sweepMessages` | método | coberto-nativo |
| `Client` | `uptime` | acessor | lacuna |
| `Client` | `user` | propriedade | coberto-recurso |
| `Client` | `users` | propriedade | coberto-recurso |
| `Client` | `ws` | acessor | coberto-nativo |
| `ClientCluster` | `add` | método | coberto-recurso |
| `ClientCluster` | `addAll` | método | lacuna |
| `ClientCluster` | `destroy` | método | coberto-nativo |
| `ClientCluster` | `emit` | método | coberto-nativo |
| `ClientCluster` | `get` | método | coberto-recurso |
| `ClientCluster` | `has` | método | coberto-recurso |
| `ClientCluster` | `off` | método | coberto-recurso |
| `ClientCluster` | `on` | método | coberto-recurso |
| `ClientCluster` | `once` | método | coberto-recurso |
| `ClientCluster` | `remove` | método | coberto-recurso |
| `ClientCluster` | `restart` | método | lacuna |
| `ClientCluster` | `runtimeValues` | método | lacuna |
| `ClientCluster` | `size` | acessor | coberto-recurso |
| `ClientCluster` | `values` | método | coberto-recurso |
| `ClientUser` | `bulkDeleteMyMessagesInGuild` | método | coberto-nativo |
| `ClientUser` | `client` | propriedade | coberto-recurso |
| `ClientUser` | `fetch` | método | coberto-recurso |
| `ClientUser` | `fetchGuilds` | método | coberto-nativo |
| `ClientUser` | `leaveGuild` | método | coberto-nativo |
| `ClientUser` | `setPresence` | método | coberto-recurso |
| `DMChannel` | `_patch` | método | só-SDK |
| `DMChannel` | `addRecipient` | método | coberto-nativo |
| `DMChannel` | `edit` | método | coberto-recurso |
| `DMChannel` | `lastMessageId` | propriedade | só-SDK |
| `DMChannel` | `nicks` | propriedade | só-SDK |
| `DMChannel` | `ownerId` | propriedade | coberto-recurso |
| `DMChannel` | `pinInList` | método | lacuna |
| `DMChannel` | `purgeMessages` | método | coberto-nativo |
| `DMChannel` | `recipients` | propriedade | coberto-recurso |
| `DMChannel` | `removeRecipient` | método | coberto-nativo |
| `DMChannel` | `unpinFromList` | método | lacuna |
| `EmbedBuilder` | `addFields` | método | lacuna |
| `EmbedBuilder` | `addFields` | método | lacuna |
| `EmbedBuilder` | `data` | propriedade | coberto-recurso |
| `EmbedBuilder` | `data` | propriedade | coberto-recurso |
| `EmbedBuilder` | `from` | método | coberto-recurso |
| `EmbedBuilder` | `from` | método | coberto-recurso |
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
| `EmbedBuilder` | `toJSON` | método | coberto-recurso |
| `EmbedBuilder` | `toJSON` | método | coberto-recurso |
| `FluxerError` | `code` | propriedade | coberto-recurso |
| `FluxerError` | `isFluxerError` | método | só-SDK |
| `FluxerError` | `toJSON` | método | coberto-recurso |
| `FluxerError` | `toString` | método | coberto-recurso |
| `ForumChannel` | `_patch` | método | só-SDK |
| `ForumChannel` | `defaultForumLayout` | propriedade | só-SDK |
| `ForumChannel` | `setDefaultForumLayout` | método | coberto-nativo |
| `Guild` | `_patch` | método | só-SDK |
| `Guild` | `adjustMemberCount` | método | lacuna |
| `Guild` | `afkChannelId` | propriedade | coberto-recurso |
| `Guild` | `afkTimeout` | propriedade | só-SDK |
| `Guild` | `applyForDiscovery` | método | coberto-nativo |
| `Guild` | `available` | propriedade | só-SDK |
| `Guild` | `ban` | método | coberto-recurso |
| `Guild` | `banner` | propriedade | coberto-recurso |
| `Guild` | `bannerHeight` | propriedade | só-SDK |
| `Guild` | `bannerURL` | método | coberto-recurso |
| `Guild` | `bannerWidth` | propriedade | só-SDK |
| `Guild` | `channels` | propriedade | coberto-recurso |
| `Guild` | `client` | propriedade | coberto-recurso |
| `Guild` | `cloneEmoji` | método | coberto-nativo |
| `Guild` | `cloneSticker` | método | coberto-nativo |
| `Guild` | `contentWarningLevel` | propriedade | coberto-recurso |
| `Guild` | `contentWarningText` | propriedade | coberto-recurso |
| `Guild` | `createChannel` | método | coberto-recurso |
| `Guild` | `createdAt` | acessor | coberto-recurso |
| `Guild` | `createdTimestamp` | acessor | coberto-recurso |
| `Guild` | `createEmoji` | método | coberto-recurso |
| `Guild` | `createEmojisBulk` | método | coberto-recurso |
| `Guild` | `createRole` | método | coberto-recurso |
| `Guild` | `createSticker` | método | coberto-recurso |
| `Guild` | `createStickersBulk` | método | coberto-nativo |
| `Guild` | `defaultMessageNotifications` | propriedade | só-SDK |
| `Guild` | `delete` | método | coberto-recurso |
| `Guild` | `disabledOperations` | propriedade | só-SDK |
| `Guild` | `edit` | método | coberto-recurso |
| `Guild` | `editDiscoveryApplication` | método | coberto-nativo |
| `Guild` | `editVanityURL` | método | coberto-recurso |
| `Guild` | `embedSplash` | propriedade | só-SDK |
| `Guild` | `emojis` | propriedade | coberto-recurso |
| `Guild` | `explicitContentFilter` | propriedade | só-SDK |
| `Guild` | `features` | propriedade | coberto-recurso |
| `Guild` | `fetchActiveThreads` | método | coberto-recurso |
| `Guild` | `fetchAuditLogs` | método | coberto-recurso |
| `Guild` | `fetchBans` | método | coberto-recurso |
| `Guild` | `fetchChannels` | método | coberto-nativo |
| `Guild` | `fetchDiscoveryStatus` | método | coberto-nativo |
| `Guild` | `fetchEmoji` | método | coberto-recurso |
| `Guild` | `fetchEmojis` | método | coberto-recurso |
| `Guild` | `fetchInvite` | método | lacuna |
| `Guild` | `fetchInvites` | método | coberto-recurso |
| `Guild` | `fetchMe` | método | lacuna |
| `Guild` | `fetchMember` | método | coberto-recurso |
| `Guild` | `fetchRole` | método | coberto-recurso |
| `Guild` | `fetchRoles` | método | coberto-recurso |
| `Guild` | `fetchSticker` | método | coberto-recurso |
| `Guild` | `fetchStickers` | método | coberto-recurso |
| `Guild` | `fetchVanityURL` | método | coberto-recurso |
| `Guild` | `fetchWebhooks` | método | coberto-recurso |
| `Guild` | `icon` | propriedade | coberto-nativo |
| `Guild` | `iconURL` | método | coberto-recurso |
| `Guild` | `id` | propriedade | coberto-recurso |
| `Guild` | `kick` | método | coberto-nativo |
| `Guild` | `memberCount` | propriedade | coberto-recurso |
| `Guild` | `members` | propriedade | coberto-recurso |
| `Guild` | `messageHistoryCutoff` | propriedade | só-SDK |
| `Guild` | `mfaLevel` | propriedade | só-SDK |
| `Guild` | `name` | propriedade | coberto-recurso |
| `Guild` | `nsfw` | propriedade | coberto-recurso |
| `Guild` | `nsfwLevel` | propriedade | só-SDK |
| `Guild` | `onlineCount` | propriedade | coberto-recurso |
| `Guild` | `ownerId` | propriedade | coberto-recurso |
| `Guild` | `permissions` | propriedade | coberto-recurso |
| `Guild` | `resetRoleHoistPositions` | método | lacuna |
| `Guild` | `resolveRoleId` | método | coberto-recurso |
| `Guild` | `roles` | propriedade | coberto-recurso |
| `Guild` | `rulesChannelId` | propriedade | só-SDK |
| `Guild` | `setChannelPositions` | método | coberto-recurso |
| `Guild` | `setRoleHoistPositions` | método | lacuna |
| `Guild` | `setRolePositions` | método | coberto-recurso |
| `Guild` | `splash` | propriedade | só-SDK |
| `Guild` | `splashCardAlignment` | propriedade | só-SDK |
| `Guild` | `splashHeight` | propriedade | só-SDK |
| `Guild` | `splashURL` | método | lacuna |
| `Guild` | `splashWidth` | propriedade | só-SDK |
| `Guild` | `stickers` | propriedade | coberto-nativo |
| `Guild` | `systemChannelFlags` | propriedade | só-SDK |
| `Guild` | `systemChannelId` | propriedade | coberto-recurso |
| `Guild` | `toString` | método | coberto-recurso |
| `Guild` | `transferOwnership` | método | lacuna |
| `Guild` | `unban` | método | coberto-nativo |
| `Guild` | `vanityURLCode` | propriedade | só-SDK |
| `Guild` | `verificationLevel` | propriedade | só-SDK |
| `Guild` | `withdrawDiscoveryApplication` | método | lacuna |
| `GuildBan` | `client` | propriedade | coberto-recurso |
| `GuildBan` | `expiresAt` | propriedade | coberto-recurso |
| `GuildBan` | `guildId` | propriedade | coberto-recurso |
| `GuildBan` | `reason` | propriedade | coberto-recurso |
| `GuildBan` | `unban` | método | coberto-nativo |
| `GuildBan` | `user` | propriedade | coberto-recurso |
| `GuildChannel` | `_patch` | método | só-SDK |
| `GuildChannel` | `applyEditPatch` | método | lacuna |
| `GuildChannel` | `canSend` | método | lacuna |
| `GuildChannel` | `canSendMessage` | método | lacuna |
| `GuildChannel` | `createInvite` | método | coberto-recurso |
| `GuildChannel` | `createWebhook` | método | coberto-recurso |
| `GuildChannel` | `edit` | método | coberto-recurso |
| `GuildChannel` | `fetchInvites` | método | coberto-recurso |
| `GuildChannel` | `fetchWebhooks` | método | coberto-recurso |
| `GuildChannel` | `guildId` | propriedade | coberto-recurso |
| `GuildChannel` | `name` | propriedade | coberto-recurso |
| `GuildChannel` | `parentId` | propriedade | coberto-recurso |
| `GuildChannel` | `permissionOverwrites` | propriedade | coberto-recurso |
| `GuildChannel` | `position` | propriedade | coberto-recurso |
| `GuildEmoji` | `_patch` | método | só-SDK |
| `GuildEmoji` | `animated` | propriedade | coberto-recurso |
| `GuildEmoji` | `client` | propriedade | coberto-recurso |
| `GuildEmoji` | `createdAt` | acessor | coberto-recurso |
| `GuildEmoji` | `createdTimestamp` | acessor | coberto-recurso |
| `GuildEmoji` | `delete` | método | coberto-recurso |
| `GuildEmoji` | `edit` | método | coberto-recurso |
| `GuildEmoji` | `guildId` | propriedade | coberto-recurso |
| `GuildEmoji` | `id` | propriedade | coberto-recurso |
| `GuildEmoji` | `identifier` | acessor | coberto-recurso |
| `GuildEmoji` | `name` | propriedade | coberto-recurso |
| `GuildEmoji` | `toString` | método | coberto-recurso |
| `GuildEmoji` | `url` | acessor | coberto-recurso |
| `GuildManager` | `delete` | método | coberto-recurso |
| `GuildManager` | `fetch` | método | coberto-recurso |
| `GuildManager` | `resolve` | método | coberto-recurso |
| `GuildMember` | `_clone` | método | só-SDK |
| `GuildMember` | `_patch` | método | só-SDK |
| `GuildMember` | `accentColor` | propriedade | coberto-recurso |
| `GuildMember` | `avatar` | propriedade | só-SDK |
| `GuildMember` | `avatarURL` | método | coberto-recurso |
| `GuildMember` | `ban` | método | coberto-recurso |
| `GuildMember` | `bannable` | acessor | lacuna |
| `GuildMember` | `banner` | propriedade | coberto-recurso |
| `GuildMember` | `bannerURL` | método | coberto-recurso |
| `GuildMember` | `bio` | propriedade | coberto-recurso |
| `GuildMember` | `client` | propriedade | coberto-recurso |
| `GuildMember` | `communicationDisabledUntil` | propriedade | coberto-recurso |
| `GuildMember` | `deaf` | propriedade | coberto-nativo |
| `GuildMember` | `displayAvatarURL` | método | coberto-recurso |
| `GuildMember` | `displayName` | acessor | coberto-recurso |
| `GuildMember` | `edit` | método | coberto-recurso |
| `GuildMember` | `guild` | propriedade | coberto-recurso |
| `GuildMember` | `id` | propriedade | coberto-recurso |
| `GuildMember` | `joinedAt` | propriedade | coberto-recurso |
| `GuildMember` | `kick` | método | coberto-nativo |
| `GuildMember` | `kickable` | acessor | lacuna |
| `GuildMember` | `mentionFlags` | propriedade | só-SDK |
| `GuildMember` | `moderatable` | acessor | lacuna |
| `GuildMember` | `move` | método | coberto-recurso |
| `GuildMember` | `mute` | propriedade | coberto-nativo |
| `GuildMember` | `nick` | propriedade | coberto-recurso |
| `GuildMember` | `partial` | propriedade | coberto-nativo |
| `GuildMember` | `permissions` | acessor | coberto-recurso |
| `GuildMember` | `permissionsIn` | método | coberto-recurso |
| `GuildMember` | `profileFlags` | propriedade | só-SDK |
| `GuildMember` | `pronouns` | propriedade | coberto-recurso |
| `GuildMember` | `roles` | propriedade | coberto-recurso |
| `GuildMember` | `timeout` | método | coberto-recurso |
| `GuildMember` | `toString` | método | coberto-recurso |
| `GuildMember` | `user` | propriedade | coberto-recurso |
| `GuildMemberManager` | `fetch` | método | coberto-recurso |
| `GuildMemberManager` | `fetchMe` | método | lacuna |
| `GuildMemberManager` | `me` | acessor | lacuna |
| `GuildMemberManager` | `resolve` | método | coberto-recurso |
| `GuildMemberManager` | `search` | método | coberto-recurso |
| `GuildMemberRoleManager` | `_patch` | método | só-SDK |
| `GuildMemberRoleManager` | `add` | método | coberto-recurso |
| `GuildMemberRoleManager` | `cache` | acessor | coberto-nativo |
| `GuildMemberRoleManager` | `has` | método | coberto-recurso |
| `GuildMemberRoleManager` | `remove` | método | coberto-recurso |
| `GuildMemberRoleManager` | `roleIds` | acessor | coberto-recurso |
| `GuildMemberRoleManager` | `set` | método | coberto-nativo |
| `GuildRoleManager` | `everyone` | acessor | lacuna |
| `GuildSticker` | `_patch` | método | só-SDK |
| `GuildSticker` | `animated` | propriedade | coberto-recurso |
| `GuildSticker` | `client` | propriedade | coberto-recurso |
| `GuildSticker` | `createdAt` | acessor | coberto-recurso |
| `GuildSticker` | `createdTimestamp` | acessor | coberto-recurso |
| `GuildSticker` | `delete` | método | coberto-recurso |
| `GuildSticker` | `description` | propriedade | coberto-recurso |
| `GuildSticker` | `edit` | método | coberto-recurso |
| `GuildSticker` | `guildId` | propriedade | coberto-recurso |
| `GuildSticker` | `id` | propriedade | coberto-recurso |
| `GuildSticker` | `name` | propriedade | coberto-recurso |
| `GuildSticker` | `nsfw` | propriedade | coberto-recurso |
| `GuildSticker` | `tags` | propriedade | coberto-recurso |
| `GuildSticker` | `url` | acessor | coberto-recurso |
| `Invite` | `channelSnapshot` | propriedade | coberto-recurso |
| `Invite` | `client` | propriedade | coberto-recurso |
| `Invite` | `code` | propriedade | coberto-recurso |
| `Invite` | `createdAt` | propriedade | coberto-recurso |
| `Invite` | `delete` | método | coberto-recurso |
| `Invite` | `expiresAt` | propriedade | coberto-recurso |
| `Invite` | `fetch` | método | coberto-recurso |
| `Invite` | `guildSnapshot` | propriedade | coberto-recurso |
| `Invite` | `inviter` | propriedade | coberto-recurso |
| `Invite` | `isGroupDM` | método | lacuna |
| `Invite` | `isGuild` | método | coberto-recurso |
| `Invite` | `maxAge` | propriedade | coberto-recurso |
| `Invite` | `maxUses` | propriedade | coberto-recurso |
| `Invite` | `memberCount` | propriedade | coberto-recurso |
| `Invite` | `presenceCount` | propriedade | só-SDK |
| `Invite` | `resolveChannel` | método | lacuna |
| `Invite` | `resolveGuild` | método | lacuna |
| `Invite` | `temporary` | propriedade | coberto-recurso |
| `Invite` | `type` | propriedade | coberto-recurso |
| `Invite` | `url` | acessor | coberto-recurso |
| `Invite` | `uses` | propriedade | coberto-recurso |
| `LinkChannel` | `applyEditPatch` | método | lacuna |
| `LinkChannel` | `url` | propriedade | coberto-recurso |
| `Message` | `_createMessageBody` | método | só-SDK |
| `Message` | `_patch` | método | só-SDK |
| `Message` | `_send` | método | só-SDK |
| `Message` | `attachments` | propriedade | coberto-recurso |
| `Message` | `author` | propriedade | coberto-recurso |
| `Message` | `awaitReactions` | método | lacuna |
| `Message` | `call` | propriedade | coberto-nativo |
| `Message` | `channel` | acessor | coberto-recurso |
| `Message` | `channelId` | propriedade | coberto-recurso |
| `Message` | `client` | propriedade | coberto-recurso |
| `Message` | `content` | propriedade | coberto-recurso |
| `Message` | `createdAt` | propriedade | coberto-recurso |
| `Message` | `createReactionCollector` | método | lacuna |
| `Message` | `delete` | método | coberto-recurso |
| `Message` | `deleteAttachment` | método | lacuna |
| `Message` | `edit` | método | coberto-recurso |
| `Message` | `editedAt` | propriedade | só-SDK |
| `Message` | `embeds` | propriedade | coberto-recurso |
| `Message` | `fetch` | método | coberto-recurso |
| `Message` | `fetchReactionUsers` | método | coberto-recurso |
| `Message` | `fetchReactionUsersPage` | método | coberto-recurso |
| `Message` | `flags` | propriedade | coberto-recurso |
| `Message` | `guild` | acessor | coberto-recurso |
| `Message` | `guildId` | propriedade | coberto-recurso |
| `Message` | `id` | propriedade | coberto-recurso |
| `Message` | `member` | acessor | coberto-recurso |
| `Message` | `mentionEveryone` | propriedade | coberto-recurso |
| `Message` | `mentionRoles` | propriedade | só-SDK |
| `Message` | `mentions` | propriedade | coberto-recurso |
| `Message` | `messageReference` | propriedade | só-SDK |
| `Message` | `messageSnapshots` | propriedade | só-SDK |
| `Message` | `nonce` | propriedade | coberto-nativo |
| `Message` | `nsfwEmojis` | propriedade | só-SDK |
| `Message` | `partial` | propriedade | coberto-nativo |
| `Message` | `pin` | método | coberto-recurso |
| `Message` | `pinned` | propriedade | coberto-recurso |
| `Message` | `react` | método | coberto-recurso |
| `Message` | `reactions` | propriedade | coberto-nativo |
| `Message` | `referencedMessage` | propriedade | só-SDK |
| `Message` | `removeAllReactions` | método | coberto-recurso |
| `Message` | `removeReaction` | método | coberto-recurso |
| `Message` | `removeReactionEmoji` | método | coberto-recurso |
| `Message` | `reply` | método | coberto-recurso |
| `Message` | `resolve` | método | coberto-recurso |
| `Message` | `resolveChannel` | método | lacuna |
| `Message` | `resolveGuild` | método | lacuna |
| `Message` | `send` | método | coberto-recurso |
| `Message` | `sendTo` | método | lacuna |
| `Message` | `startThread` | método | coberto-recurso |
| `Message` | `stickers` | propriedade | coberto-nativo |
| `Message` | `thread` | propriedade | coberto-recurso |
| `Message` | `tts` | propriedade | coberto-recurso |
| `Message` | `type` | propriedade | coberto-recurso |
| `Message` | `unpin` | método | coberto-recurso |
| `Message` | `webhookId` | propriedade | só-SDK |
| `MessageCollector` | `awaitMessages` | método | lacuna |
| `MessageCollector` | `channelId` | propriedade | coberto-recurso |
| `MessageCollector` | `client` | propriedade | coberto-recurso |
| `MessageCollector` | `collected` | propriedade | coberto-recurso |
| `MessageCollector` | `emit` | método | coberto-nativo |
| `MessageCollector` | `on` | método | coberto-recurso |
| `MessageCollector` | `options` | propriedade | coberto-recurso |
| `MessageCollector` | `stop` | método | coberto-recurso |
| `MessageFlagsBitField` | `Flags` | propriedade | só-SDK |
| `MessageManager` | `fetch` | método | coberto-recurso |
| `MessageManager` | `get` | método | coberto-recurso |
| `MessageManager` | `resolve` | método | coberto-recurso |
| `MessagePayload` | `addEmbed` | método | lacuna |
| `MessagePayload` | `addEmbed` | método | lacuna |
| `MessagePayload` | `ContentMaxLength` | propriedade | só-SDK |
| `MessagePayload` | `ContentMaxLength` | propriedade | só-SDK |
| `MessagePayload` | `create` | método | coberto-recurso |
| `MessagePayload` | `create` | método | coberto-recurso |
| `MessagePayload` | `data` | propriedade | coberto-recurso |
| `MessagePayload` | `data` | propriedade | coberto-recurso |
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
| `MessagePayload` | `toJSON` | método | coberto-recurso |
| `MessagePayload` | `toJSON` | método | coberto-recurso |
| `MessageReaction` | `_data` | propriedade | só-SDK |
| `MessageReaction` | `channel` | acessor | coberto-recurso |
| `MessageReaction` | `channelId` | propriedade | coberto-recurso |
| `MessageReaction` | `client` | propriedade | coberto-recurso |
| `MessageReaction` | `count` | propriedade | coberto-recurso |
| `MessageReaction` | `emoji` | propriedade | coberto-recurso |
| `MessageReaction` | `emojiIdentifier` | acessor | coberto-recurso |
| `MessageReaction` | `fetchMessage` | método | coberto-recurso |
| `MessageReaction` | `fromMessage` | método | lacuna |
| `MessageReaction` | `guild` | acessor | coberto-recurso |
| `MessageReaction` | `guildId` | propriedade | coberto-recurso |
| `MessageReaction` | `me` | propriedade | só-SDK |
| `MessageReaction` | `message` | acessor | coberto-recurso |
| `MessageReaction` | `messageId` | propriedade | coberto-recurso |
| `MessageReactionManager` | `_patch` | método | só-SDK |
| `MessageReactionManager` | `[Symbol.iterator]` | método | só-SDK |
| `MessageReactionManager` | `cache` | acessor | coberto-nativo |
| `MessageReactionManager` | `size` | acessor | coberto-recurso |
| `MessageSticker` | `animated` | propriedade | coberto-recurso |
| `MessageSticker` | `client` | propriedade | coberto-recurso |
| `MessageSticker` | `createdAt` | acessor | coberto-recurso |
| `MessageSticker` | `createdTimestamp` | acessor | coberto-recurso |
| `MessageSticker` | `description` | propriedade | coberto-recurso |
| `MessageSticker` | `id` | propriedade | coberto-recurso |
| `MessageSticker` | `name` | propriedade | coberto-recurso |
| `MessageSticker` | `tags` | propriedade | coberto-recurso |
| `MessageSticker` | `url` | acessor | coberto-recurso |
| `PartialGuildMember` | `client` | propriedade | coberto-recurso |
| `PartialGuildMember` | `fetch` | método | coberto-recurso |
| `PartialGuildMember` | `guild` | propriedade | coberto-recurso |
| `PartialGuildMember` | `guildId` | propriedade | coberto-recurso |
| `PartialGuildMember` | `id` | propriedade | coberto-recurso |
| `PartialGuildMember` | `partial` | propriedade | coberto-nativo |
| `PartialGuildMember` | `user` | propriedade | coberto-recurso |
| `PartialMessage` | `author` | propriedade | coberto-recurso |
| `PartialMessage` | `authorId` | propriedade | coberto-nativo |
| `PartialMessage` | `channel` | acessor | coberto-recurso |
| `PartialMessage` | `channelId` | propriedade | coberto-recurso |
| `PartialMessage` | `client` | propriedade | coberto-recurso |
| `PartialMessage` | `content` | propriedade | coberto-recurso |
| `PartialMessage` | `createdAt` | propriedade | coberto-recurso |
| `PartialMessage` | `fetch` | método | coberto-recurso |
| `PartialMessage` | `guildId` | propriedade | coberto-recurso |
| `PartialMessage` | `id` | propriedade | coberto-recurso |
| `PartialMessage` | `partial` | propriedade | coberto-nativo |
| `PartialMessage` | `resolveChannel` | método | lacuna |
| `PermissionOverwrite` | `_allow` | propriedade | só-SDK |
| `PermissionOverwrite` | `_deny` | propriedade | só-SDK |
| `PermissionOverwrite` | `allow` | acessor | coberto-recurso |
| `PermissionOverwrite` | `deny` | acessor | coberto-recurso |
| `PermissionOverwrite` | `id` | propriedade | coberto-recurso |
| `PermissionOverwrite` | `toJSON` | método | coberto-recurso |
| `PermissionOverwrite` | `type` | propriedade | coberto-recurso |
| `PermissionOverwriteManager` | `_patch` | método | só-SDK |
| `PermissionOverwriteManager` | `[Symbol.iterator]` | método | só-SDK |
| `PermissionOverwriteManager` | `cache` | acessor | coberto-nativo |
| `PermissionOverwriteManager` | `delete` | método | coberto-recurso |
| `PermissionOverwriteManager` | `edit` | método | coberto-recurso |
| `PermissionOverwriteManager` | `size` | acessor | coberto-recurso |
| `PermissionOverwriteManager` | `toJSON` | método | coberto-recurso |
| `PermissionsBitField` | `any` | método | coberto-nativo |
| `PermissionsBitField` | `Flags` | propriedade | só-SDK |
| `PermissionsBitField` | `has` | método | coberto-recurso |
| `PermissionsBitField` | `missing` | método | lacuna |
| `ReactionCollector` | `awaitReactions` | método | lacuna |
| `ReactionCollector` | `channelId` | propriedade | coberto-recurso |
| `ReactionCollector` | `client` | propriedade | coberto-recurso |
| `ReactionCollector` | `collected` | propriedade | coberto-recurso |
| `ReactionCollector` | `emit` | método | coberto-nativo |
| `ReactionCollector` | `messageId` | propriedade | coberto-recurso |
| `ReactionCollector` | `on` | método | coberto-recurso |
| `ReactionCollector` | `options` | propriedade | coberto-recurso |
| `ReactionCollector` | `stop` | método | coberto-recurso |
| `Role` | `_clone` | método | só-SDK |
| `Role` | `_patch` | método | só-SDK |
| `Role` | `_permissions` | propriedade | só-SDK |
| `Role` | `client` | propriedade | coberto-recurso |
| `Role` | `color` | propriedade | coberto-recurso |
| `Role` | `createdAt` | acessor | coberto-recurso |
| `Role` | `createdTimestamp` | acessor | coberto-recurso |
| `Role` | `delete` | método | coberto-recurso |
| `Role` | `edit` | método | coberto-recurso |
| `Role` | `guildId` | propriedade | coberto-recurso |
| `Role` | `has` | método | coberto-recurso |
| `Role` | `hoist` | propriedade | coberto-recurso |
| `Role` | `hoistPosition` | propriedade | coberto-recurso |
| `Role` | `id` | propriedade | coberto-recurso |
| `Role` | `mentionable` | propriedade | coberto-recurso |
| `Role` | `name` | propriedade | coberto-recurso |
| `Role` | `permissions` | acessor | coberto-recurso |
| `Role` | `position` | propriedade | coberto-recurso |
| `Role` | `toString` | método | coberto-recurso |
| `Role` | `unicodeEmoji` | propriedade | coberto-recurso |
| `TextChannel` | `applyEditPatch` | método | lacuna |
| `TextChannel` | `contentWarningLevel` | propriedade | coberto-recurso |
| `TextChannel` | `contentWarningText` | propriedade | coberto-recurso |
| `TextChannel` | `defaultAutoArchiveDuration` | propriedade | só-SDK |
| `TextChannel` | `defaultThreadRateLimitPerUser` | propriedade | só-SDK |
| `TextChannel` | `editThreadDefaults` | método | coberto-nativo |
| `TextChannel` | `lastMessageId` | propriedade | só-SDK |
| `TextChannel` | `nsfw` | propriedade | coberto-recurso |
| `TextChannel` | `nsfwOverride` | propriedade | só-SDK |
| `TextChannel` | `rateLimitPerUser` | propriedade | coberto-recurso |
| `TextChannel` | `setSlowmode` | método | coberto-recurso |
| `TextChannel` | `threads` | acessor | coberto-recurso |
| `TextChannel` | `topic` | propriedade | coberto-recurso |
| `ThreadChannel` | `_patch` | método | só-SDK |
| `ThreadChannel` | `appliedTags` | propriedade | coberto-recurso |
| `ThreadChannel` | `archived` | propriedade | coberto-recurso |
| `ThreadChannel` | `archiveTimestamp` | propriedade | coberto-recurso |
| `ThreadChannel` | `autoArchiveDuration` | propriedade | coberto-recurso |
| `ThreadChannel` | `edit` | método | coberto-recurso |
| `ThreadChannel` | `editSelf` | método | coberto-nativo |
| `ThreadChannel` | `flags` | propriedade | coberto-recurso |
| `ThreadChannel` | `invitable` | propriedade | só-SDK |
| `ThreadChannel` | `join` | método | coberto-recurso |
| `ThreadChannel` | `lastMessageId` | propriedade | só-SDK |
| `ThreadChannel` | `leave` | método | coberto-nativo |
| `ThreadChannel` | `locked` | propriedade | coberto-recurso |
| `ThreadChannel` | `member` | propriedade | coberto-recurso |
| `ThreadChannel` | `memberCount` | propriedade | coberto-recurso |
| `ThreadChannel` | `members` | propriedade | coberto-recurso |
| `ThreadChannel` | `messageCount` | propriedade | coberto-recurso |
| `ThreadChannel` | `ownerId` | propriedade | coberto-recurso |
| `ThreadChannel` | `parentId` | propriedade | coberto-recurso |
| `ThreadChannel` | `rateLimitPerUser` | propriedade | coberto-recurso |
| `ThreadChannel` | `setArchived` | método | coberto-recurso |
| `ThreadChannel` | `setLocked` | método | coberto-nativo |
| `ThreadChannel` | `totalMessageSent` | propriedade | só-SDK |
| `ThreadManager` | `create` | método | coberto-recurso |
| `ThreadManager` | `createPost` | método | coberto-recurso |
| `ThreadManager` | `editDefaults` | método | coberto-nativo |
| `ThreadManager` | `fetchArchived` | método | coberto-nativo |
| `ThreadManager` | `fetchJoinedPrivateArchived` | método | coberto-nativo |
| `ThreadManager` | `search` | método | coberto-recurso |
| `ThreadMember` | `flags` | propriedade | coberto-recurso |
| `ThreadMember` | `id` | propriedade | coberto-recurso |
| `ThreadMember` | `joinedAt` | propriedade | coberto-recurso |
| `ThreadMember` | `muted` | propriedade | coberto-recurso |
| `ThreadMember` | `muteEndTime` | propriedade | coberto-recurso |
| `ThreadMember` | `muteWindow` | propriedade | coberto-recurso |
| `ThreadMember` | `userId` | propriedade | coberto-recurso |
| `ThreadMemberManager` | `add` | método | coberto-recurso |
| `ThreadMemberManager` | `fetch` | método | coberto-recurso |
| `ThreadMemberManager` | `fetchOne` | método | coberto-recurso |
| `ThreadMemberManager` | `remove` | método | coberto-recurso |
| `User` | `_patch` | método | só-SDK |
| `User` | `avatar` | propriedade | só-SDK |
| `User` | `avatarColor` | propriedade | só-SDK |
| `User` | `avatarURL` | método | coberto-recurso |
| `User` | `banner` | propriedade | coberto-recurso |
| `User` | `bannerURL` | método | coberto-recurso |
| `User` | `bot` | propriedade | coberto-recurso |
| `User` | `client` | propriedade | coberto-recurso |
| `User` | `createdAt` | acessor | coberto-recurso |
| `User` | `createDM` | método | coberto-nativo |
| `User` | `createdTimestamp` | acessor | coberto-recurso |
| `User` | `discriminator` | propriedade | só-SDK |
| `User` | `displayAvatarURL` | método | coberto-recurso |
| `User` | `flags` | propriedade | coberto-recurso |
| `User` | `globalName` | propriedade | coberto-recurso |
| `User` | `id` | propriedade | coberto-recurso |
| `User` | `send` | método | coberto-recurso |
| `User` | `system` | propriedade | só-SDK |
| `User` | `toString` | método | coberto-recurso |
| `User` | `username` | propriedade | coberto-recurso |
| `UserFlagsBitField` | `Flags` | propriedade | só-SDK |
| `UserManager` | `fetch` | método | coberto-recurso |
| `UserManager` | `fetchWithProfile` | método | coberto-recurso |
| `UserManager` | `resolve` | método | coberto-recurso |
| `UserManager` | `sweep` | método | lacuna |
| `VoiceChannel` | `applyEditPatch` | método | lacuna |
| `VoiceChannel` | `bitrate` | propriedade | só-SDK |
| `VoiceChannel` | `contentWarningLevel` | propriedade | coberto-recurso |
| `VoiceChannel` | `contentWarningText` | propriedade | coberto-recurso |
| `VoiceChannel` | `guildId` | propriedade | coberto-recurso |
| `VoiceChannel` | `lastMessageId` | propriedade | só-SDK |
| `VoiceChannel` | `nsfw` | propriedade | coberto-recurso |
| `VoiceChannel` | `nsfwOverride` | propriedade | só-SDK |
| `VoiceChannel` | `rateLimitPerUser` | propriedade | coberto-recurso |
| `VoiceChannel` | `rtcRegion` | propriedade | só-SDK |
| `VoiceChannel` | `setSlowmode` | método | coberto-recurso |
| `VoiceChannel` | `topic` | propriedade | coberto-recurso |
| `VoiceChannel` | `userLimit` | propriedade | só-SDK |
| `VoiceChannel` | `voiceConnectionLimit` | propriedade | só-SDK |
| `Webhook` | `avatar` | propriedade | só-SDK |
| `Webhook` | `avatarURL` | método | coberto-recurso |
| `Webhook` | `channelId` | propriedade | coberto-recurso |
| `Webhook` | `client` | propriedade | coberto-recurso |
| `Webhook` | `createdAt` | acessor | coberto-recurso |
| `Webhook` | `createdTimestamp` | acessor | coberto-recurso |
| `Webhook` | `delete` | método | coberto-recurso |
| `Webhook` | `deleteMessage` | método | coberto-nativo |
| `Webhook` | `edit` | método | coberto-recurso |
| `Webhook` | `editMessage` | método | coberto-nativo |
| `Webhook` | `fetch` | método | coberto-recurso |
| `Webhook` | `fetchMessage` | método | coberto-recurso |
| `Webhook` | `fromToken` | método | coberto-recurso |
| `Webhook` | `guildId` | propriedade | coberto-recurso |
| `Webhook` | `id` | propriedade | coberto-recurso |
| `Webhook` | `name` | propriedade | coberto-recurso |
| `Webhook` | `send` | método | coberto-recurso |
| `Webhook` | `token` | propriedade | coberto-recurso |
| `Webhook` | `type` | propriedade | coberto-recurso |
| `Webhook` | `user` | propriedade | coberto-recurso |

## Eventos do cliente

Comparação entre `ClientEvents` do SDK e `scriptEventNames` do function mode. Todo evento do SDK pode ser recebido nativamente por `bot.on`/`bot.once`/`bot.event`/`bot.client.on` — a coluna Status marca só a cobertura do function mode.

| Evento | Function mode | Status |
|---|---|---|
| `channelCreate` | não | coberto-nativo |
| `channelDelete` | não | coberto-nativo |
| `channelMemberCountsUpdate` | não | coberto-nativo |
| `channelPinsUpdate` | não | coberto-nativo |
| `channelRecipientAdd` | não | coberto-nativo |
| `channelRecipientRemove` | não | coberto-nativo |
| `channelUpdate` | não | coberto-nativo |
| `debug` | não | coberto-nativo |
| `entranceSoundPlay` | não | coberto-nativo |
| `error` | não | coberto-nativo |
| `forumUnreads` | não | coberto-nativo |
| `guildAuditLogEntryCreate` | não | coberto-nativo |
| `guildAvailable` | não | coberto-nativo |
| `guildBanAdd` | não | coberto-nativo |
| `guildBanRemove` | não | coberto-nativo |
| `guildCountsUpdate` | não | coberto-nativo |
| `guildCreate` | não | coberto-nativo |
| `guildDelete` | não | coberto-nativo |
| `guildEmojisUpdate` | não | coberto-nativo |
| `guildMemberAdd` | sim | coberto-recurso |
| `guildMemberRemove` | sim | coberto-recurso |
| `guildMemberUpdate` | não | coberto-nativo |
| `guildMembersChunk` | não | coberto-nativo |
| `guildRoleCreate` | não | coberto-nativo |
| `guildRoleDelete` | não | coberto-nativo |
| `guildRoleUpdate` | não | coberto-nativo |
| `guildStickersUpdate` | não | coberto-nativo |
| `guildUnavailable` | não | coberto-nativo |
| `guildUpdate` | não | coberto-nativo |
| `inviteCreate` | não | coberto-nativo |
| `inviteDelete` | não | coberto-nativo |
| `messageCreate` | não | coberto-nativo |
| `messageDelete` | sim | coberto-recurso |
| `messageDeleteBulk` | não | coberto-nativo |
| `messageReactionAdd` | sim | coberto-recurso |
| `messageReactionAddMany` | não | coberto-nativo |
| `messageReactionRemove` | sim | coberto-recurso |
| `messageReactionRemoveAll` | não | coberto-nativo |
| `messageReactionRemoveEmoji` | não | coberto-nativo |
| `messageUpdate` | sim | coberto-recurso |
| `presenceUpdate` | não | coberto-nativo |
| `presenceUpdateBulk` | não | coberto-nativo |
| `ready` | não | coberto-nativo |
| `resumed` | não | coberto-nativo |
| `shardDisconnect` | não | coberto-nativo |
| `shardError` | não | coberto-nativo |
| `shardReady` | não | coberto-nativo |
| `shardReconnecting` | não | coberto-nativo |
| `shardResumed` | não | coberto-nativo |
| `shardingRequired` | não | coberto-nativo |
| `threadCreate` | não | coberto-nativo |
| `threadDelete` | não | coberto-nativo |
| `threadListSync` | não | coberto-nativo |
| `threadMemberListUpdate` | não | coberto-nativo |
| `threadMemberUpdate` | não | coberto-nativo |
| `threadMembersUpdate` | não | coberto-nativo |
| `threadUpdate` | não | coberto-nativo |
| `typingStart` | não | coberto-nativo |
| `userConnectionsUpdate` | não | coberto-nativo |
| `userUpdate` | não | coberto-nativo |
| `voiceServerUpdate` | não | coberto-nativo |
| `voiceStateAck` | não | coberto-nativo |
| `voiceStateUpdate` | não | coberto-nativo |
| `voiceStatesSync` | não | coberto-nativo |
| `webauthnCredentialsUpdate` | não | coberto-nativo |
| `webhooksUpdate` | não | coberto-nativo |

Eventos do function mode que o SDK não declara: nenhum.

## Exceções intencionais (só SDK)

- **Sharding e cluster** (`BETA_CLIENT_CLUSTER_WARNING`, `ClientCluster`, `ClientClusterEvents`): Fora deste lote. O Yuzuha expõe shardCount e shardIds em clientOptions; o wrapper yuzuha/sharding fica como seguimento.
- **CDN e helpers de URL** (`CDN_URL`, `STATIC_CDN_URL`, `cdnAvatarURL`, `cdnBannerURL`, `cdnDefaultAvatarURL`, `cdnDisplayAvatarURL`, `cdnEmojiURL`, `cdnGuildAssetURL`, `cdnMemberAvatarURL`, `cdnMemberBannerURL`, `cdnStickerURL`, `inviteUrl`): Disponível por `yuzuha/sdk` (e `SDK` na raiz); sem wrapper nativo por serem constantes, helpers puros ou classes de dados.
- **Constantes e bitfields puros** (`GuildMemberProfileFlags`, `GuildOperations`, `MessageAttachmentFlags`, `MessageFlags`, `MessageFlagsBitField`, `MessageFlagsBits`, `PublicUserFlags`, `Routes`, `SystemChannelFlags`, `ThreadMemberFlags`, `UserFlagsBitField`, `UserFlagsBits`, `resolvePermissionsToBitfield`, `ErrorCodes`): Disponível por `yuzuha/sdk` (e `SDK` na raiz); sem wrapper nativo por serem constantes, helpers puros ou classes de dados.
- **Instância, cache e logs** (`DEFAULT_INSTANCE_ENDPOINTS`, `INSTANCE_DISCOVERY_PATH`, `instanceDiscoveryUrl`, `normalizeApiOrigin`, `parseInstanceDiscovery`, `resolveInstanceEndpoints`, `DEFAULT_CACHE_LIMITS`, `normalizeCacheLimit`, `resolveCacheLimits`, `createLogger`, `serializeError`): Disponível por `yuzuha/sdk` (e `SDK` na raiz); sem wrapper nativo por serem constantes, helpers puros ou classes de dados.
- **Texto e parsing puros** (`parsePrefixCommand`, `parseUserMention`, `resolveKlipyToImageUrl`): Disponível por `yuzuha/sdk` (e `SDK` na raiz); sem wrapper nativo por serem constantes, helpers puros ou classes de dados.
- **Classes de dados do SDK** (`AnnouncementChannel`, `CategoryChannel`, `ForumChannel`, `MediaChannel`, `GuildRoleManager`): Disponível por `yuzuha/sdk` (e `SDK` na raiz); sem wrapper nativo por serem constantes, helpers puros ou classes de dados.
- **Internos do SDK** (membros): membro interno ou helper estático do SDK; fora da superfície pública, acessível por `bot.client` e `yuzuha/sdk`
- **Dados dos objetos do SDK** (membros): propriedade de dado do objeto do SDK, acessível por `bot.client` e pelos `*Info` do recurso quando normalizada
