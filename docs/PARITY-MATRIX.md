# Matriz automática de paridade

Gerada de declarações instaladas e de `scripts/parity/*.jsonl`. Atualize com `npm run docs:generate`; não edite à mão.

## Contrato semântico do function mode

Paridade significa toda operação segura do SDK alcançável por scripts, com exclusões justificadas. Não é inferida por nomes usados no código nativo. Cada ID inclui pacote, export e membro ou evento.

- **function**: operação alcançada pelas funções listadas.
- **equivalent**: comportamento equivalente por composição de funções existentes, descrito na justificativa.
- **excluded**: fora da linguagem por segurança ou por não representar operação; categoria e motivo visíveis.
- **pending**: operação segura reservada à área indicada; permitida durante desenvolvimento, não no gate de release.

**Function-mode safe coverage: 89.10%** (842/945). Denominador = function + equivalent + pending; excluded não entra. Cada linha é uma unidade, inclusive reexports em pacotes distintos; não é uma medição de testes ou completude de parâmetros.

Inventário: todos os exports (inclusive tipos), membros próprios não privados de classes, construtores e eventos dos contratos exportados *Events. Membros herdados aparecem no export de origem. Enums/constantes de runtime precisam de classificação operacional; interfaces e aliases são data-only. APIs novas exigem revisão explícita.

Pacotes: @fluxerjs/core, @fluxerjs/builders, @fluxerjs/types, @fluxerjs/voice, @fluxerjs/sharding, @fluxerjs/rest, @fluxerjs/ws, @fluxerjs/collection, @fluxerjs/util.

| Status | Itens |
|---|---:|
| function | 331 |
| equivalent | 511 |
| excluded | 860 |
| pending | 103 |

## Pendências por área

| Área | Itens pending |
|---|---:|
| pure | 0 |
| resources | 0 |
| entities | 0 |
| events | 59 |
| voice | 44 |

## pure

| ID | Tipo | Status | Funções / exclusão | Justificativa |
|---|---|---|---|---|
| `@fluxerjs/builders#APIAttachmentPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/builders#AttachmentBuilderOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/builders#AttachmentFileInput` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/builders#AttachmentPayloadOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/builders#EmbedAuthorOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/builders#EmbedFieldData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/builders#EmbedFooterOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/builders#EmbedMediaOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/builders#MessagePayload.static:ContentMaxLength` | property | function | $sdkConstant | ContentMaxLength é o limite padrão do SDK; não modifica o payload. |
| `@fluxerjs/builders#MessagePayloadCreateOptions` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/builders#MessagePayloadData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/builders#RESTPostAPIEmbed` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/collection#Collection` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/collection#Collection.cache` | accessor | equivalent | $sdkCollection | Use o valor local da coleção ou clone; não há alias de cache do SDK. |
| `@fluxerjs/collection#Collection.clone` | method | function | $sdkCollection | clone copia os pares ordenados sem estado compartilhado. |
| `@fluxerjs/collection#Collection.concat` | method | function | $sdkCollection | Operação concat em até 1000 pares locais. |
| `@fluxerjs/collection#Collection.each` | method | equivalent | $forEach, $let, $get | Percorra os pares com $loopValue/$loopIndex; reutilize o valor original para encadear. |
| `@fluxerjs/collection#Collection.every` | method | equivalent | $arrayEvery, $loopValue | Avalie um predicado por par, com $loopValue contendo [chave, valor]. |
| `@fluxerjs/collection#Collection.filter` | method | equivalent | $arrayFilter, $loopValue | Filtre os pares [chave, valor], preservando chaves e ordem. |
| `@fluxerjs/collection#Collection.find` | method | equivalent | $arrayFind, $jsonGet, $loopValue | Busque o primeiro par pelo predicado e extraia o valor no caminho 1, com fallback se ausente. |
| `@fluxerjs/collection#Collection.findKey` | method | equivalent | $arrayFind, $jsonGet, $loopValue | Busque o primeiro par pelo predicado e extraia a chave no caminho 0, com fallback se ausente. |
| `@fluxerjs/collection#Collection.first` | method | function | $sdkCollection | Operação first em até 1000 pares locais. |
| `@fluxerjs/collection#Collection.last` | method | function | $sdkCollection | Operação last em até 1000 pares locais. |
| `@fluxerjs/collection#Collection.map` | method | equivalent | $arrayMap, $loopValue | Transforme cada par; o callback recebe [chave, valor] em $loopValue. |
| `@fluxerjs/collection#Collection.partition` | method | function | $sdkCollection | Operação partition em até 1000 pares locais. |
| `@fluxerjs/collection#Collection.random` | method | function | $sdkCollection | Operação random em até 1000 pares locais. |
| `@fluxerjs/collection#Collection.reduce` | method | equivalent | $arrayReduce, $loopValue | Reduza pares ordenados com acumulador e $loopValue. |
| `@fluxerjs/collection#Collection.some` | method | equivalent | $arraySome, $loopValue | Avalie um predicado por par, com $loopValue contendo [chave, valor]. |
| `@fluxerjs/collection#Collection.sort` | method | equivalent | $arraySortWith, $sortLeft, $sortRight | Ordene uma cópia dos pares com comparador que recebe pares e acessa chave e valor. |
| `@fluxerjs/collection#Collection.tap` | method | equivalent | $let, $get | Guarde a coleção, execute a expressão no script e retorne o valor original com $get. |
| `@fluxerjs/collection#Collection.toJSON` | method | function | $sdkCollection | values retorna o array de valores na ordem da coleção. |
| `@fluxerjs/collection#Collection.toString` | method | function | $sdkCollection | text retorna Collection(n). |
| `@fluxerjs/collection#LimitedCollection` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/collection#LimitedCollection.bounded` | accessor | function | $sdkCollection | describe retorna bounded; null em maxSize significa sem capacidade explícita. |
| `@fluxerjs/collection#LimitedCollection.clone` | method | equivalent | $sdkCollection | describe copia os pares e acompanha a capacidade explícita, sem callback ou estado vivo. |
| `@fluxerjs/collection#LimitedCollection.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/collection#LimitedCollection.maxSize` | property | function | $sdkCollection | describe retorna maxSize; null representa capacidade ilimitada. |
| `@fluxerjs/collection#LimitedCollection.onEvict` | property | equivalent | $sdkCollection, $jsonGet, $if | set retorna o par evicted para tratamento explícito com $if, sem callback JS. |
| `@fluxerjs/collection#LimitedCollection.set` | method | function | $sdkCollection | set retorna a nova coleção e o par expulso em FIFO, se houver. |
| `@fluxerjs/collection#LimitedCollection.sweep` | method | function | $sdkCollection | sweep retorna os pares restantes e a contagem de removidos; aceita predicado de script. |
| `@fluxerjs/collection#LimitedCollectionOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/collection#ReadonlyCollection` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#AddClientRuntimeOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#AllowedMentions` | variable | equivalent | $object, $jsonMerge, $reply | Compor allowedMentions {parse:[], repliedUser:false} ou listas permitidas no payload; autorização valida relaxamento de menções. |
| `@fluxerjs/core#AllowedMentionsOptions` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#AllowedMentionType` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#APIAllowedMentions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#APIBulkMessageFetchRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#APIBulkMessageFetchResponse` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#APIBulkMessageFetchResponseChannel` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#APIGuildMemberSearchResponse` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#APIInstance` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#APIInstanceEndpoints` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#APIWellKnownFluxer` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#AttachmentUploadCompleteItem` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#AttachmentUploadCompleteResponse` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#AttachmentUploadPlanItem` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#AttachmentUploadPlanResponse` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#AuditLogActionType` | enum | function | $sdkConstant | Leitura explícita de AuditLogActionType ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#AuditLogChange` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#AuditLogEntryPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#AuditLogFetchPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#BETA_CLIENT_CLUSTER_WARNING` | variable | excluded | internal | Marcador/aviso do protocolo de supervisão nativa; sem operação de produto. |
| `@fluxerjs/core#BulkFetchMessagesChannelResult` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#BulkFetchMessagesOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#BulkFetchMessagesRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#BulkFetchMessagesResult` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#CacheSizeLimits` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#CacheStats` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#CDN_URL` | variable | function | $sdkConstant, $cdnURL | CDN_URL é a constante SDK hospedada; use cdnURL para a base da instância. |
| `@fluxerjs/core#cdnAvatarURL` | function | function | $cdnURL | Tipo avatar via CDN do contexto; sem requisição. |
| `@fluxerjs/core#cdnBannerURL` | function | function | $cdnURL | Tipo banner via CDN do contexto; sem requisição. |
| `@fluxerjs/core#cdnDefaultAvatarURL` | function | function | $cdnURL | Tipo defaultAvatar via CDN do contexto; sem requisição. |
| `@fluxerjs/core#cdnDisplayAvatarURL` | function | function | $cdnURL | Tipo displayAvatar via CDN do contexto; sem requisição. |
| `@fluxerjs/core#cdnEmojiURL` | function | function | $cdnURL | Tipo emoji via CDN do contexto; sem requisição. |
| `@fluxerjs/core#cdnGuildAssetURL` | function | function | $cdnURL | Tipo guildIcon/guildBanner/guildSplash via CDN do contexto; sem requisição. |
| `@fluxerjs/core#cdnMemberAvatarURL` | function | function | $cdnURL | Tipo memberAvatar via CDN do contexto; sem requisição. |
| `@fluxerjs/core#cdnMemberBannerURL` | function | function | $cdnURL | Tipo memberBanner via CDN do contexto; sem requisição. |
| `@fluxerjs/core#cdnStickerURL` | function | function | $cdnURL | Tipo sticker via CDN do contexto; sem requisição. |
| `@fluxerjs/core#CdnUrlOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ChannelEditOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ChannelInviteCreateOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ChannelMemberCountsUpdatePayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ChannelPinsUpdatePayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ChannelRecipientPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ChannelSlowmodePayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ChannelType` | enum | function | $sdkConstant | Leitura explícita de ChannelType ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#ClientClusterEventListener` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ClientClusterEventMap` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ClientClusterEventName` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ClientClusterEvents` | variable | function | $sdkConstant | Leitura explícita de ClientClusterEvents ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#ClientClusterOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ClientEventListener` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ClientEventMethods` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ClientEventName` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ClientOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ClientRuntime` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ClientRuntimeStatus` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#CollectedReaction` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ContentWarningLevel` | enum | function | $sdkConstant | Leitura explícita de ContentWarningLevel ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#createLogger` | function | excluded | internal | O logger, o sink e a saída do processo são controlados pelo host confiável; scripts não criam loggers do SDK. |
| `@fluxerjs/core#DEFAULT_CACHE_LIMITS` | variable | function | $sdkConstant | Leitura explícita de DEFAULT_CACHE_LIMITS ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#DEFAULT_INSTANCE_ENDPOINTS` | variable | function | $sdkConstant | Leitura explícita de DEFAULT_INSTANCE_ENDPOINTS ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#DefaultReactionEmojiInput` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#DiscoveryApplicationOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#DiscoveryApplicationPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#DiscoveryOrigin` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#DiscoveryStatusPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ErrorCodes` | variable | function | $sdkConstant | Leitura explícita de ErrorCodes ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#Events` | variable | function | $sdkConstant | Leitura explícita de Events ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#ExpressionCreateOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ExpressionEditOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#fetchActiveThreads` | function | function | $activeThreads | Lista threads ativas pelo recurso threads.active. |
| `@fluxerjs/core#FetchArchivedThreadsOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#FetchedThreads` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#FetchedUserWithProfile` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#FetchJoinedArchivedThreadsOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#FetchMessagesOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#FetchPinnedMessagesOptions` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#FetchThreadMembersOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#FluxerError` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#FluxerError.code` | property | function | $sdkError, $jsonGet | info inclui code quando seguro; não expõe o objeto do SDK. |
| `@fluxerjs/core#FluxerError.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#FluxerError.static:isFluxerError` | method | function | $sdkError | isFluxer testa a instância real que falhou, sem expor o objeto de erro. |
| `@fluxerjs/core#FluxerError.toJSON` | method | equivalent | $sdkError | info retorna metadados serializáveis de erros SDK; não expõe mensagem, causa, URL ou corpo. |
| `@fluxerjs/core#FluxerError.toString` | method | equivalent | $sdkError | text retorna tipo e código conhecido, sem expor mensagem ou causa. |
| `@fluxerjs/core#FluxerErrorOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ForumAvailableTag` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ForumLayout` | enum | function | $sdkConstant | Leitura explícita de ForumLayout ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#ForumParentEditOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ForumParentFields` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ForumSortOrder` | enum | function | $sdkConstant | Leitura explícita de ForumSortOrder ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#ForumTagOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ForumTagSetting` | enum | function | $sdkConstant | Leitura explícita de ForumTagSetting ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#ForumUnreadEntry` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ForumUnreadsPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#GatewayOpcodes` | enum | function | $sdkConstant | Leitura explícita de GatewayOpcodes ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#GroupDmEditOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#GuildChannelCreateOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#GuildCountsUpdatePayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#GuildEmojisUpdatePayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#GuildMemberEditOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#GuildMemberProfileFlags` | variable | function | $sdkConstant | Leitura explícita de GuildMemberProfileFlags ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#GuildMembersChunkPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#GuildMemberSearchHit` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#GuildMemberSearchOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#GuildMemberSearchPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#GuildNSFWLevel` | enum | function | $sdkConstant | Leitura explícita de GuildNSFWLevel ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#GuildOperations` | variable | function | $sdkConstant | Leitura explícita de GuildOperations ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#GuildRoleDeletePayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#GuildRoleUpdatePayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#GuildStickersUpdatePayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#INSTANCE_DISCOVERY_PATH` | variable | function | $sdkConstant | Leitura explícita de INSTANCE_DISCOVERY_PATH ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#instanceDiscoveryUrl` | function | function | $instanceValue | Operação discoveryURL sobre valores, sem requisição ou configuração do client. |
| `@fluxerjs/core#InviteChannelSnapshot` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#InviteDeletePayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#InviteGuildSnapshot` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#InviteType` | enum | function | $sdkConstant | Leitura explícita de InviteType ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#inviteUrl` | function | function | $inviteURL | Monta URL usando código seguro e base informada ou da instância, sem requisição. |
| `@fluxerjs/core#LogFields` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#Logger` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#LoggerOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#LogLevel` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageAttachment` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageAttachmentEdit` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageAttachmentFlags` | variable | function | $sdkConstant | Leitura explícita de MessageAttachmentFlags ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#MessageCall` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageCollectorEndReason` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageCollectorOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageDeleteBulkPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageEditOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageEmbed` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageEmbedAuthor` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageEmbedField` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageEmbedFooter` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageEmbedMedia` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageFlags` | variable | function | $sdkConstant | Leitura explícita de MessageFlags ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#MessageFlagsBitField` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#MessageFlagsBitField.static:Flags` | property | function | $flags | table da família message retorna os nomes e máscaras decimais. |
| `@fluxerjs/core#MessageFlagsBits` | variable | function | $sdkConstant | Leitura explícita de MessageFlagsBits ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#MessageFlagsResolvable` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageFlagsString` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessagePayload.static:ContentMaxLength` | property | function | $sdkConstant | ContentMaxLength é o limite padrão do SDK; não modifica o payload. |
| `@fluxerjs/core#MessagePrepareInput` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageReactionAddManyEntry` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageReactionAddManyPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageReactionPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageReactionRemoveAllPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageReactionRemoveEmojiPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageReference` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageReferenceType` | enum | function | $sdkConstant | Leitura explícita de MessageReferenceType ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#MessageReplyTarget` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageSearchIndexing` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageSearchOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageSearchResponse` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageSearchResults` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageSendOptions` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageSnapshot` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#MessageType` | enum | function | $sdkConstant | Leitura explícita de MessageType ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#normalizeApiOrigin` | function | function | $instanceValue | Operação normalize sobre valores, sem requisição ou configuração do client. |
| `@fluxerjs/core#normalizeCacheLimit` | function | function | $sdkCacheLimit | Cálculo local normalizeCacheLimit, sem alterar o cache ou emitir aviso; null representa infinito. |
| `@fluxerjs/core#OverwriteType` | enum | function | $sdkConstant | Leitura explícita de OverwriteType ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#parseInstanceDiscovery` | function | function | $instanceValue | Operação parse sobre valores, sem requisição ou configuração do client. |
| `@fluxerjs/core#parsePrefixCommand` | function | function | $sdkParse | Operação prefix sobre valores, sem interpretar a entrada como código. |
| `@fluxerjs/core#parseUserMention` | function | function | $sdkParse | Operação userMention sobre valores, sem interpretar a entrada como código. |
| `@fluxerjs/core#PartialUserGuildPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#PermissionFlags` | variable | function | $sdkConstant | Leitura explícita de PermissionFlags ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#PermissionOverwriteEditOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#PermissionResolvable` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#PermissionsBitField` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#PermissionsBitField.any` | method | function | $flags | Operação any com máscaras limitadas a 128 bits e aritmética exata. |
| `@fluxerjs/core#PermissionsBitField.has` | method | function | $flags | Operação has com máscaras limitadas a 128 bits e aritmética exata. |
| `@fluxerjs/core#PermissionsBitField.missing` | method | function | $flags | Operação missing com máscaras limitadas a 128 bits e aritmética exata. |
| `@fluxerjs/core#PermissionsBitField.static:Flags` | property | function | $flags | table da família permissions retorna os nomes e máscaras decimais. |
| `@fluxerjs/core#PermissionString` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#PinnedMessagesPage` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#PresenceActivity` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#PresenceUpdateBulkPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#PresenceUpdateOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#PresenceUpdatePayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ProfilePayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#PublicUserFlags` | variable | function | $sdkConstant | Leitura explícita de PublicUserFlags ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#ReactionCollectorEndReason` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ReactionCollectorOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ReactionEmojiPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#RelationshipType` | enum | function | $sdkConstant | Leitura explícita de RelationshipType ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#ReplyOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#resolveCacheLimits` | function | function | $sdkCacheLimit | Cálculo local resolveCacheLimits, sem alterar o cache ou emitir aviso; null representa infinito. |
| `@fluxerjs/core#ResolvedCacheLimits` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ResolvedInstance` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#resolveInstanceEndpoints` | function | function | $instanceValue | Operação resolve sobre valores, sem requisição ou configuração do client. |
| `@fluxerjs/core#resolveKlipyToImageUrl` | function | excluded | raw-transport | O SDK faz fetch direto com redirects automáticos e lê o corpo sem limite, fora da política HTTP do Yuzuha. |
| `@fluxerjs/core#resolvePermissionsToBitfield` | function | function | $flags | resolve na família permissions devolve texto decimal exato. |
| `@fluxerjs/core#RestartClientRuntimeOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#RoleCreateOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#RoleEditOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#RoleResolvable` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#Routes` | variable | excluded | raw-transport | Rotas REST autenticadas arbitrárias contornariam os ports e guards; usar operações tipadas. |
| `@fluxerjs/core#RtcRegionPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#serializeError` | function | equivalent | $sdkError | info retorna metadados serializáveis de erros SDK; não expõe mensagem, causa, URL ou corpo. |
| `@fluxerjs/core#SplashCardAlignment` | enum | function | $sdkConstant | Leitura explícita de SplashCardAlignment ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#StartForumThreadOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#StartThreadFromMessageOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#StartThreadOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#STATIC_CDN_URL` | variable | function | $sdkConstant, $cdnURL | STATIC_CDN_URL é a constante SDK hospedada; use cdnURL para a base da instância. |
| `@fluxerjs/core#StickerCreateOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#StickerEditOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#SudoVerificationOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#SystemChannelFlags` | variable | function | $sdkConstant | Leitura explícita de SystemChannelFlags ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#TextBasedChannel` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ThreadAutoArchiveDuration` | enum | function | $sdkConstant | Leitura explícita de ThreadAutoArchiveDuration ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#ThreadEditOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ThreadListSyncPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ThreadMemberFlags` | variable | function | $sdkConstant | Leitura explícita de ThreadMemberFlags ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#ThreadMemberListEntry` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ThreadMemberListUpdatePayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ThreadMemberSettingsOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ThreadMembersUpdatePayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ThreadParentEditOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ThreadSearchOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ThreadSearchPage` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#TypingStartPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#UploadFileForSend` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#UserFlagsBitField` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#UserFlagsBitField.static:Flags` | property | function | $flags | table da família user retorna os nomes e máscaras decimais. |
| `@fluxerjs/core#UserFlagsBits` | variable | function | $sdkConstant | Leitura explícita de UserFlagsBits ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/core#UserFlagsResolvable` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#UserFlagsString` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#VanityURLPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#WebhookEditOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#WebhookMessageEditOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#WebhookSendOptions` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#WebhooksUpdatePayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/rest#FluxerAPIError` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/rest#FluxerAPIError.code` | property | function | $sdkError, $jsonGet | info inclui code quando seguro; não expõe o objeto do SDK. |
| `@fluxerjs/rest#FluxerAPIError.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/rest#FluxerAPIError.errors` | property | excluded | credentials | Corpo/metadados brutos de falhas podem conter segredos e dados privados da resposta. |
| `@fluxerjs/rest#FluxerAPIError.isRetryable` | accessor | function | $sdkError, $jsonGet | info inclui isRetryable quando seguro; não expõe o objeto do SDK. |
| `@fluxerjs/rest#FluxerAPIError.method` | property | function | $sdkError, $jsonGet | info inclui method quando seguro; não expõe o objeto do SDK. |
| `@fluxerjs/rest#FluxerAPIError.path` | property | excluded | credentials | O caminho bruto pode incluir segredos embutidos na rota. |
| `@fluxerjs/rest#FluxerAPIError.rawBody` | property | excluded | credentials | Corpo/metadados brutos de falhas podem conter segredos e dados privados da resposta. |
| `@fluxerjs/rest#FluxerAPIError.statusCode` | property | function | $sdkError, $jsonGet | info inclui statusCode quando seguro; não expõe o objeto do SDK. |
| `@fluxerjs/rest#HTTPError` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/rest#HTTPError.body` | property | excluded | credentials | Corpo/metadados brutos de falhas podem conter segredos e dados privados da resposta. |
| `@fluxerjs/rest#HTTPError.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/rest#HTTPError.isRetryable` | accessor | function | $sdkError, $jsonGet | info inclui isRetryable quando seguro; não expõe o objeto do SDK. |
| `@fluxerjs/rest#HTTPError.method` | property | function | $sdkError, $jsonGet | info inclui method quando seguro; não expõe o objeto do SDK. |
| `@fluxerjs/rest#HTTPError.path` | property | excluded | credentials | O caminho bruto pode incluir segredos embutidos na rota. |
| `@fluxerjs/rest#HTTPError.statusCode` | property | function | $sdkError, $jsonGet | info inclui statusCode quando seguro; não expõe o objeto do SDK. |
| `@fluxerjs/rest#RateLimitError` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/rest#RateLimitError.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/rest#RateLimitError.global` | property | function | $sdkError, $jsonGet | info inclui global quando seguro; não expõe o objeto do SDK. |
| `@fluxerjs/rest#RateLimitError.retryAfter` | property | function | $sdkError, $jsonGet | info inclui retryAfter quando seguro; não expõe o objeto do SDK. |
| `@fluxerjs/types#AllowedMentionType` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIAllowedMentions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIApplicationMe` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIBan` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIBulkMessageFetchRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIBulkMessageFetchRequestItem` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIBulkMessageFetchResponse` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIBulkMessageFetchResponseChannel` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIChannel` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIChannelOverwrite` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIChannelPartial` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIChannelPinItem` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIChannelPinsPage` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIChannelSlowmodeState` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIConnectedAccount` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIDefaultReactionEmoji` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIDiscoveryApplication` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIDiscoveryStatus` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIEmbed` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIEmbedAuthor` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIEmbedChild` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIEmbedField` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIEmbedFooter` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIEmbedMedia` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIEmoji` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIEmojiMetadata` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIEmojiWithUser` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIErrorBody` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIErrorCode` | enum | function | $sdkConstant | Leitura explícita de APIErrorCode ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#APIForumTag` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIForumTagUpdate` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIForumThreadMessageRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIGatewayBotResponse` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIGroupDmInvite` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIGroupDmInviteMetadata` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIGuild` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIGuildAuditLog` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIGuildAuditLogEntry` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIGuildEmojiBulkCreateResponse` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIGuildFeatureToggle` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIGuildInvite` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIGuildInviteMetadata` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIGuildMember` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIGuildMemberSearchRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIGuildMemberSearchResponse` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIGuildMemberSearchResult` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIGuildPartial` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIGuildStickerBulkCreateResponse` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIInstance` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIInstanceAgePolicy` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIInstanceAgePolicyGeo` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIInstanceAppPublic` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIInstanceCaptcha` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIInstanceCommunity` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIInstanceDomainMigration` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIInstanceEndpoints` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIInstanceFeatures` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIInstanceGif` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIInstanceLimitRule` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIInstanceLimits` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIInstancePush` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIInstanceRegistration` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIInstanceServices` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIInstanceSso` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIInvite` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIInviteMetadata` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIInviteResponse` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIMessage` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIMessageAttachment` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIMessageCall` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIMessageReaction` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIMessageReference` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIMessageSearchIndexing` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIMessageSearchRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIMessageSearchResponse` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIMessageSearchResults` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIMessageSnapshot` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIMessageSticker` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIOAuthApplication` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIPreloadMessagesResponse` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIProfileResponse` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIReactionEmoji` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIRole` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIRtcRegion` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APISearchIndexNotReady` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIStartForumThreadRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIStartThreadFromMessageRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIStartThreadRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APISticker` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIStickerMetadata` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIStickerWithUser` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APISudoVerification` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIThreadMember` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIThreadMemberMuteConfig` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIThreadMemberSettingsRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIThreadMetadata` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIThreadSearchResponse` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIThreadsListing` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIUser` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIUserConnection` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIUserConnectionsUpdate` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIUserPartial` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIUserProfile` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIUserTagCheck` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIVanityURL` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIVoiceState` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIVoiceStateStub` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIWebAuthnCredential` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIWebhook` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIWebhookEditMessageRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIWebhookTokenUpdateRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIWebhookUpdateRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#APIWellKnownFluxer` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#AuditLogActionType` | enum | function | $sdkConstant | Leitura explícita de AuditLogActionType ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#ChannelCreateRequest` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#ChannelInviteCreateRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#ChannelType` | enum | function | $sdkConstant | Leitura explícita de ChannelType ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#ContentWarningLevel` | enum | function | $sdkConstant | Leitura explícita de ContentWarningLevel ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#DefaultMessageNotifications` | enum | function | $sdkConstant | Leitura explícita de DefaultMessageNotifications ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#EmbedMediaFlags` | variable | function | $sdkConstant | Leitura explícita de EmbedMediaFlags ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#EmbedType` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#FLUXER_EPOCH` | variable | function | $sdkConstant | Leitura explícita de FLUXER_EPOCH ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#ForumLayout` | enum | function | $sdkConstant | Leitura explícita de ForumLayout ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#ForumSortOrder` | enum | function | $sdkConstant | Leitura explícita de ForumSortOrder ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#ForumTagSetting` | enum | function | $sdkConstant | Leitura explícita de ForumTagSetting ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#GatewayAuthSessionChangeDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayCallCreateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayCallDeleteDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayCallUpdateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayChannelCreateDispatchData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayChannelDeleteDispatchData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayChannelMemberCountEntry` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayChannelMemberCountsUpdateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayChannelPinsAckDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayChannelPinsUpdateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayChannelRecipientAddDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayChannelRecipientRemoveDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayChannelUpdateBulkDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayChannelUpdateDispatchData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayCustomStatus` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayDispatchEventName` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayDispatchEvents` | variable | function | $sdkConstant | Leitura explícita de GatewayDispatchEvents ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#GatewayEntranceSoundPlayDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayErrorCode` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayErrorCodes` | variable | function | $sdkConstant | Leitura explícita de GatewayErrorCodes ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#GatewayFavoriteMemeCreateDispatchData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayFavoriteMemeDeleteDispatchData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayFavoriteMemePayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayFavoriteMemeUpdateDispatchData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayForumUnreadEntry` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayForumUnreadsDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildAuditLogEntryCreateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildBanAddDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildBanRemoveDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildCountEntry` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildCountsUpdateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildCreateDispatchData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildDeleteDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildEmojisUpdateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildMemberAddDispatchData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildMemberListItem` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildMemberListUpdateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildMemberRemoveDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildMembersChunkDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildMemberUpdateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildRoleCreateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildRoleDeleteDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildRoleUpdateBulkDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildRoleUpdateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildSnapshot` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildStickersUpdateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildSyncDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayGuildUpdateDispatchData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayHelloData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayIdentifyData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayIdentifyFlags` | variable | function | $sdkConstant | Leitura explícita de GatewayIdentifyFlags ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#GatewayInviteCreateDispatchData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayInviteDeleteDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayLazyRequestData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayLazyRequestSubscription` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayMessageAckDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayMessageCreateDispatchData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayMessageDeleteBulkDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayMessageDeleteDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayMessageReactionAddDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayMessageReactionAddManyDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayMessageReactionAddManyEntry` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayMessageReactionRemoveAllDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayMessageReactionRemoveDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayMessageReactionRemoveEmojiDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayMessageUpdateDispatchData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayOpcodes` | enum | function | $sdkConstant | Leitura explícita de GatewayOpcodes ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#GatewayPassiveUpdatesDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayPresenceUpdateBulkDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayPresenceUpdateData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayPresenceUpdateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayReactionEmoji` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayReactionMemberSnapshot` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayReadyDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayReceivePayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayRecentMentionDeleteDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayRelationshipAddDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayRelationshipRemoveDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayRelationshipUpdateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayRequestChannelMemberCountsData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayRequestForumUnreadsData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayRequestForumUnreadsThread` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayRequestGuildCountsData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayRequestGuildMembersData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayResumeData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayResumedDispatchData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewaySavedMessageCreateDispatchData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewaySavedMessageDeleteDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewaySendPayload` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewaySession` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewaySessionsReplaceDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayThreadCreateDispatchData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayThreadDeleteDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayThreadListSyncDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayThreadMemberListEntry` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayThreadMemberListUpdateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayThreadMembersUpdateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayThreadMemberUpdateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayThreadUpdateDispatchData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayTypingStartDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayUnavailableGuild` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayUserConnectionsUpdateDispatchData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayUserGuildSettingsUpdateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayUserNoteUpdateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayUserPinnedDmsUpdateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayUserSettingsUpdateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayUserUpdateDispatchData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayVoiceServerUpdateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayVoiceStateAckDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayVoiceStatesSyncData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayVoiceStateUpdateData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayVoiceStateUpdateDispatchData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayWebAuthnCredentialsUpdateDispatchData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GatewayWebhooksUpdateDispatchData` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GuildAnnouncementChannelCreateRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GuildCategoryChannelCreateRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GuildExplicitContentFilter` | enum | function | $sdkConstant | Leitura explícita de GuildExplicitContentFilter ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#GuildFeature` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GuildForumChannelCreateRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GuildLinkChannelCreateRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GuildMediaChannelCreateRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GuildMemberProfileFlags` | variable | function | $sdkConstant | Leitura explícita de GuildMemberProfileFlags ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#GuildMemberProfileFlagsValue` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GuildMFALevel` | enum | function | $sdkConstant | Leitura explícita de GuildMFALevel ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#GuildNSFWLevel` | enum | function | $sdkConstant | Leitura explícita de GuildNSFWLevel ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#GuildOperations` | variable | function | $sdkConstant | Leitura explícita de GuildOperations ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#GuildOperationsValue` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GuildTextChannelCreateRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#GuildVerificationLevel` | enum | function | $sdkConstant | Leitura explícita de GuildVerificationLevel ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#GuildVoiceChannelCreateRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#InviteType` | enum | function | $sdkConstant | Leitura explícita de InviteType ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#isGroupDmInvite` | function | function | $sdkParse | Operação groupDmInvite sobre valores, sem interpretar a entrada como código. |
| `@fluxerjs/types#isGuildInvite` | function | function | $sdkParse | Operação guildInvite sobre valores, sem interpretar a entrada como código. |
| `@fluxerjs/types#isUploadedAttachment` | function | function | $sdkParse | Operação uploadedAttachment sobre valores, sem interpretar a entrada como código. |
| `@fluxerjs/types#MessageAttachmentFlags` | variable | function | $sdkConstant | Leitura explícita de MessageAttachmentFlags ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#MessageFlags` | variable | function | $sdkConstant | Leitura explícita de MessageFlags ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#MessageFlagsValue` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#MessageReferenceType` | enum | function | $sdkConstant | Leitura explícita de MessageReferenceType ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#MessageSearchScope` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#MessageType` | enum | function | $sdkConstant | Leitura explícita de MessageType ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#OverwriteType` | enum | function | $sdkConstant | Leitura explícita de OverwriteType ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#PublicUserFlags` | variable | function | $sdkConstant | Leitura explícita de PublicUserFlags ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#PublicUserFlagsValue` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RateLimitErrorBody` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RelationshipType` | enum | function | $sdkConstant | Leitura explícita de RelationshipType ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#RESTCreateRoleBody` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPatchAPIGuildDiscoveryJSONBody` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPatchAPIGuildEmojiJSONBody` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPatchAPIGuildStickerJSONBody` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIChannelAttachmentCompleteItem` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIChannelAttachmentCompleteRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIChannelAttachmentCompleteResponse` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIChannelAttachmentCompleteResult` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIChannelAttachmentUploadItem` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIChannelAttachmentUploadMultipart` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIChannelAttachmentUploadMultipartPart` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIChannelAttachmentUploadRequest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIChannelAttachmentUploadResponse` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIChannelAttachmentUploadResponseItem` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIChannelAttachmentUploadSinglepart` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIEmbed` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIEmbedAuthor` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIEmbedFooter` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIEmbedMedia` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIGuildDiscoveryJSONBody` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIGuildEmojiJSONBody` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIGuildStickerJSONBody` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIMessageAttachment` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIMessageAttachmentMeta` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIMessageUploadedAttachment` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTPostAPIPreloadMessagesJSONBody` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#RESTUpdateRoleBody` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#Routes` | variable | excluded | raw-transport | Rotas REST autenticadas arbitrárias contornariam os ports e guards; usar operações tipadas. |
| `@fluxerjs/types#Snowflake` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#SplashCardAlignment` | enum | function | $sdkConstant | Leitura explícita de SplashCardAlignment ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#SystemChannelFlags` | variable | function | $sdkConstant | Leitura explícita de SystemChannelFlags ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#SystemChannelFlagsValue` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#ThreadAutoArchiveDuration` | enum | function | $sdkConstant | Leitura explícita de ThreadAutoArchiveDuration ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#ThreadChannelType` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#ThreadMemberFlags` | variable | function | $sdkConstant | Leitura explícita de ThreadMemberFlags ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/types#ThreadSearchSortBy` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#ThreadSearchSortOrder` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/types#WebhookType` | enum | function | $sdkConstant | Leitura explícita de WebhookType ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/util#ALL_PERMISSIONS_BIGINT` | variable | function | $sdkConstant | Leitura explícita de ALL_PERMISSIONS_BIGINT ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/util#asRecord` | function | function | $sdkParse | Operação record sobre valores, sem interpretar a entrada como código. |
| `@fluxerjs/util#BitField` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/util#BitField.[Symbol.iterator]` | method | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/util#BitField.[Symbol.toStringTag]` | accessor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/util#BitField.add` | method | function | $flags | Operação add com máscaras limitadas a 128 bits e aritmética exata. |
| `@fluxerjs/util#BitField.any` | method | function | $flags | Operação any com máscaras limitadas a 128 bits e aritmética exata. |
| `@fluxerjs/util#BitField.bitfield` | property | equivalent | $flags | resolve produz uma máscara decimal imutável por valor, sem objeto do SDK. |
| `@fluxerjs/util#BitField.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/util#BitField.equals` | method | function | $flags | Operação equals com máscaras limitadas a 128 bits e aritmética exata. |
| `@fluxerjs/util#BitField.freeze` | method | equivalent | $flags | resolve produz uma máscara decimal imutável por valor, sem objeto do SDK. |
| `@fluxerjs/util#BitField.has` | method | function | $flags | Operação has com máscaras limitadas a 128 bits e aritmética exata. |
| `@fluxerjs/util#BitField.missing` | method | function | $flags | Operação missing com máscaras limitadas a 128 bits e aritmética exata. |
| `@fluxerjs/util#BitField.remove` | method | function | $flags | Operação remove com máscaras limitadas a 128 bits e aritmética exata. |
| `@fluxerjs/util#BitField.serialize` | method | function | $flags | Operação serialize com máscaras limitadas a 128 bits e aritmética exata. |
| `@fluxerjs/util#BitField.static:DefaultBit` | property | function | $sdkConstant | DefaultBit em texto decimal. |
| `@fluxerjs/util#BitField.static:Flags` | property | function | $flags | table da família bits retorna os nomes e máscaras decimais. |
| `@fluxerjs/util#BitField.static:resolve` | method | function | $flags | Operação resolve com máscaras limitadas a 128 bits e aritmética exata. |
| `@fluxerjs/util#BitField.toArray` | method | function | $flags | Operação names com máscaras limitadas a 128 bits e aritmética exata. |
| `@fluxerjs/util#BitField.toJSON` | method | equivalent | $flags | resolve produz uma máscara decimal imutável por valor, sem objeto do SDK. |
| `@fluxerjs/util#BitField.toString` | method | equivalent | $flags | resolve produz uma máscara decimal imutável por valor, sem objeto do SDK. |
| `@fluxerjs/util#BitField.valueOf` | method | equivalent | $flags | resolve produz uma máscara decimal imutável por valor, sem objeto do SDK. |
| `@fluxerjs/util#BitFieldResolvable` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/util#createLogger` | function | excluded | internal | O logger, o sink e a saída do processo são controlados pelo host confiável; scripts não criam loggers do SDK. |
| `@fluxerjs/util#DeconstructedSnowflake` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/util#ErrorCode` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/util#ErrorCodes` | variable | function | $sdkConstant | Leitura explícita de ErrorCodes ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/util#escapeMarkdown` | function | equivalent | $escapeMarkdown | Escape de Markdown com builtin limitado. |
| `@fluxerjs/util#FLUXER_EPOCH` | variable | function | $sdkConstant | Leitura explícita de FLUXER_EPOCH ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/util#FluxerError` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/util#FluxerError.code` | property | function | $sdkError, $jsonGet | info inclui code quando seguro; não expõe o objeto do SDK. |
| `@fluxerjs/util#FluxerError.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/util#FluxerError.static:isFluxerError` | method | function | $sdkError | isFluxer testa a instância real que falhou, sem expor o objeto de erro. |
| `@fluxerjs/util#FluxerError.toJSON` | method | equivalent | $sdkError | info retorna metadados serializáveis de erros SDK; não expõe mensagem, causa, URL ou corpo. |
| `@fluxerjs/util#FluxerError.toString` | method | equivalent | $sdkError | text retorna tipo e código conhecido, sem expor mensagem ou causa. |
| `@fluxerjs/util#FluxerErrorOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/util#formatColor` | function | function | $sdkFormat | Operação color sobre valores de script. |
| `@fluxerjs/util#formatEmoji` | function | function | $sdkFormat | Operação emoji sobre valores de script. |
| `@fluxerjs/util#formatTimestamp` | function | function | $sdkFormat | Operação timestamp sobre valores de script. |
| `@fluxerjs/util#getUnicodeFromShortcode` | function | function | $sdkParse | Operação shortcode sobre valores, sem interpretar a entrada como código. |
| `@fluxerjs/util#isRecord` | function | function | $sdkParse | Operação isRecord sobre valores, sem interpretar a entrada como código. |
| `@fluxerjs/util#KlipyMediaResult` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/util#LogFields` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/util#Logger` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/util#LoggerOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/util#LoggerSink` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/util#LogLevel` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/util#MessageFlagsBitField` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/util#MessageFlagsBitField.static:Flags` | property | function | $flags | table da família message retorna os nomes e máscaras decimais. |
| `@fluxerjs/util#MessageFlagsBits` | variable | function | $sdkConstant | Leitura explícita de MessageFlagsBits ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/util#MessageFlagsResolvable` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/util#MessageFlagsString` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/util#num` | function | function | $sdkParse | Operação number sobre valores, sem interpretar a entrada como código. |
| `@fluxerjs/util#ParsedEmoji` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/util#ParsedPrefixCommand` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/util#parseEmoji` | function | function | $sdkParse | Operação emoji sobre valores, sem interpretar a entrada como código. |
| `@fluxerjs/util#parsePrefixCommand` | function | function | $sdkParse | Operação prefix sobre valores, sem interpretar a entrada como código. |
| `@fluxerjs/util#parseRoleMention` | function | function | $sdkParse | Operação roleMention sobre valores, sem interpretar a entrada como código. |
| `@fluxerjs/util#parseUserMention` | function | function | $sdkParse | Operação userMention sobre valores, sem interpretar a entrada como código. |
| `@fluxerjs/util#PermissionFlags` | variable | function | $sdkConstant | Leitura explícita de PermissionFlags ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/util#PermissionResolvable` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/util#PermissionsBitField` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/util#PermissionsBitField.any` | method | function | $flags | Operação any com máscaras limitadas a 128 bits e aritmética exata. |
| `@fluxerjs/util#PermissionsBitField.has` | method | function | $flags | Operação has com máscaras limitadas a 128 bits e aritmética exata. |
| `@fluxerjs/util#PermissionsBitField.missing` | method | function | $flags | Operação missing com máscaras limitadas a 128 bits e aritmética exata. |
| `@fluxerjs/util#PermissionsBitField.static:Flags` | property | function | $flags | table da família permissions retorna os nomes e máscaras decimais. |
| `@fluxerjs/util#PermissionString` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/util#resolveColor` | function | function | $sdkFormat | Operação resolveColor sobre valores de script. |
| `@fluxerjs/util#resolveKlipyToImageUrl` | function | excluded | raw-transport | O SDK faz fetch direto com redirects automáticos e lê o corpo sem limite, fora da política HTTP do Yuzuha. |
| `@fluxerjs/util#resolvePermissionsToBitfield` | function | function | $flags | resolve na família permissions devolve texto decimal exato. |
| `@fluxerjs/util#serializeError` | function | equivalent | $sdkError | info retorna metadados serializáveis de erros SDK; não expõe mensagem, causa, URL ou corpo. |
| `@fluxerjs/util#SnowflakeUtil` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/util#SnowflakeUtil.static:dateFromSnowflake` | method | function | $snowflake | Operação date; datas em ISO e bigint em texto decimal. |
| `@fluxerjs/util#SnowflakeUtil.static:deconstruct` | method | function | $snowflake | Operação deconstruct; datas em ISO e bigint em texto decimal. |
| `@fluxerjs/util#SnowflakeUtil.static:EPOCH` | property | function | $sdkConstant | FLUXER_EPOCH em texto decimal exato. |
| `@fluxerjs/util#SnowflakeUtil.static:isValid` | method | function | $snowflake | Operação valid; datas em ISO e bigint em texto decimal. |
| `@fluxerjs/util#SnowflakeUtil.static:parse` | method | function | $snowflake | Operação parse; datas em ISO e bigint em texto decimal. |
| `@fluxerjs/util#SnowflakeUtil.static:snowflakeFromTimestamp` | method | function | $snowflake | Operação fromTimestamp; datas em ISO e bigint em texto decimal. |
| `@fluxerjs/util#SnowflakeUtil.static:timestampFromSnowflake` | method | function | $snowflake | Operação timestamp; datas em ISO e bigint em texto decimal. |
| `@fluxerjs/util#str` | function | function | $sdkParse | Operação string sobre valores, sem interpretar a entrada como código. |
| `@fluxerjs/util#TimestampStyle` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/util#truncate` | function | function | $sdkFormat | Operação truncate sobre valores de script. |
| `@fluxerjs/util#UserFlagsBitField` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/util#UserFlagsBitField.static:Flags` | property | function | $flags | table da família user retorna os nomes e máscaras decimais. |
| `@fluxerjs/util#UserFlagsBits` | variable | function | $sdkConstant | Leitura explícita de UserFlagsBits ou de uma chave própria; BigInt é texto decimal. |
| `@fluxerjs/util#UserFlagsResolvable` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/util#UserFlagsString` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |

## resources

| ID | Tipo | Status | Funções / exclusão | Justificativa |
|---|---|---|---|---|
| `@fluxerjs/core#CacheController` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#CacheController.cascadeChannel` | method | function | $cascadeCache | Cascata no cache local por ID; exige dono do bot. |
| `@fluxerjs/core#CacheController.cascadeGuild` | method | function | $cascadeCache | Cascata no cache local por ID; exige dono do bot. |
| `@fluxerjs/core#CacheController.cascading` | accessor | equivalent | $cacheStats | Campos retornados em limits do snapshot do cache. |
| `@fluxerjs/core#CacheController.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#CacheController.limits` | property | equivalent | $cacheStats | Campos retornados em limits do snapshot do cache. |
| `@fluxerjs/core#CacheController.stats` | method | function | $cacheStats | Snapshot normalizado do cache local; exige dono do bot. |
| `@fluxerjs/core#CacheController.sweepChannels` | method | function | $sweepCache | Limpeza no bucket selecionado, por escopo/idade quando aplicável; sem callbacks do script. |
| `@fluxerjs/core#CacheController.sweepGuilds` | method | function | $sweepCache | Limpeza no bucket selecionado, por escopo/idade quando aplicável; sem callbacks do script. |
| `@fluxerjs/core#CacheController.sweepMembers` | method | function | $sweepCache | Limpeza no bucket selecionado, por escopo/idade quando aplicável; sem callbacks do script. |
| `@fluxerjs/core#CacheController.sweepMessages` | method | function | $sweepCache | Limpeza no bucket selecionado, por escopo/idade quando aplicável; sem callbacks do script. |
| `@fluxerjs/core#CacheController.sweepUsers` | method | function | $sweepCache | Limpeza no bucket selecionado, por escopo/idade quando aplicável; sem callbacks do script. |
| `@fluxerjs/core#Channel.awaitMessages` | method | equivalent | $collectMessages | Janela finita com filtros declarativos e resultado normalizado; sem instância SDK. |
| `@fluxerjs/core#Channel.createMessageCollector` | method | equivalent | $collectMessages | Janela finita com filtros declarativos e resultado normalizado; sem instância SDK. |
| `@fluxerjs/core#Channel.fetchRtcRegions` | method | function | $channelRtcRegions | Consulta regiões de canal visível do servidor atual. |
| `@fluxerjs/core#Channel.fetchSlowmode` | method | function | $channelSlowmode | Consulta modo lento de canal visível do servidor atual. |
| `@fluxerjs/core#Channel.sendTyping` | method | function | $sendTyping | Indica digitação no servidor atual com SendMessages de autor e bot. |
| `@fluxerjs/core#ChannelManager.delete` | method | equivalent | $evictCachedChannel | Remove ID do cache local; não apaga canal na API. |
| `@fluxerjs/core#Client` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#Client._addMessageToCache` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Client._clearMessageCache` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Client._deferredGatewayDispatches` | property | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Client._finalizeReady` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Client._getMessageCache` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Client._guildStreamSettleTimeout` | property | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Client._messageCacheStats` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Client._onGuildReceived` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Client._pendingGuildIds` | property | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Client._readyStubGuildIds` | property | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Client._removeMessageFromCache` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Client._sendToAllShards` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Client._ws` | property | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Client.assertReady` | method | function | $requireBotReady | Guard não capturável por $try quando o runtime não está pronto. |
| `@fluxerjs/core#Client.bulkFetchMessages` | method | equivalent | $bulkFetchMessages | Compõe listagens autorizadas por canal; a rota de lote do SDK é restrita a contas de usuário. |
| `@fluxerjs/core#Client.cache` | property | equivalent | $cacheStats, $sweepCache, $cascadeCache | Fachada com leituras, limpezas e cascatas autorizadas; não expõe CacheController. |
| `@fluxerjs/core#Client.channels` | property | equivalent | $channel, $channels | Consultas normalizadas, sem expor o gerenciador SDK. |
| `@fluxerjs/core#Client.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#Client.destroy` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/core#Client.emit` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/core#Client.events` | property | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/core#Client.fetchApplication` | method | function | $applicationInfo | Retorna a aplicação autenticada sem clientSecret, com guarda de dono. |
| `@fluxerjs/core#Client.fetchEmojiMetadata` | method | function | $emojiMetadata | Retorna metadados normalizados pelo ID do emoji. |
| `@fluxerjs/core#Client.fetchGatewayInfo` | method | function | $gatewayInfo | Consulta informações normalizadas do gateway, com guarda de dono. |
| `@fluxerjs/core#Client.fetchInstance` | method | function | $instanceInfo | Consulta a descoberta da instância configurada, com guarda de dono. |
| `@fluxerjs/core#Client.fetchOAuthApplications` | method | function | $oauthApplications | Consulta aplicações sob guarda de dono e remove clientSecret de cada item. |
| `@fluxerjs/core#Client.fetchStickerMetadata` | method | function | $stickerMetadata | Retorna metadados normalizados pelo ID do sticker. |
| `@fluxerjs/core#Client.getOrCreateUser` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Client.guilds` | property | equivalent | $guild, $selfGuilds | Leitura normalizada do servidor atual ou dos servidores do bot sob guarda de dono. |
| `@fluxerjs/core#Client.instance` | property | equivalent | $instanceInfo | Descrição normalizada da instância resolvida, com descoberta e endpoints. |
| `@fluxerjs/core#Client.isReady` | method | function | $botReadiness | Retorna ready, readyAt e uptimeMs do runtime atual. |
| `@fluxerjs/core#Client.logger` | property | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/core#Client.login` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/core#Client.off` | method | excluded | lifecycle | Listeners arbitrários do objeto SDK ficam no lifecycle nativo; os scripts usam eventos declarativos mapeados na área events. |
| `@fluxerjs/core#Client.on` | method | excluded | lifecycle | Listeners arbitrários do objeto SDK ficam no lifecycle nativo; os scripts usam eventos declarativos mapeados na área events. |
| `@fluxerjs/core#Client.once` | method | excluded | lifecycle | Listeners arbitrários do objeto SDK ficam no lifecycle nativo; os scripts usam eventos declarativos mapeados na área events. |
| `@fluxerjs/core#Client.options` | property | excluded | credentials | Configuração do client pode conter token e estado de autenticação; não expor ao script. |
| `@fluxerjs/core#Client.preloadMessages` | method | function | $preloadMessages | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Client.preloadMessagesAlt` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Client.readyAt` | property | function | $botReadiness | Retorna ready, readyAt e uptimeMs do runtime atual. |
| `@fluxerjs/core#Client.requestChannelMemberCounts` | method | function | $channelCounts | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Client.requestForumUnreads` | method | function | $requestForumUnreads | Pedido validado por fórum/post e leitura autorizada no servidor atual. |
| `@fluxerjs/core#Client.requestGuildCounts` | method | function | $requestGuildCounts | Pedido para o servidor atual com ManageGuild de autor e bot. |
| `@fluxerjs/core#Client.requestGuildMembers` | method | function | $requestGatewayMembers, $fetchGatewayMembers | Pedido validado e limitado, com ManageGuild de autor e bot; inclui versão aguardável. |
| `@fluxerjs/core#Client.resolveEmoji` | method | function | $resolveEmoji | Resolve emoji textual e considera o servidor quando disponível. |
| `@fluxerjs/core#Client.rest` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#Client.searchMessages` | method | equivalent | $searchMessagesAdvanced | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Client.sendToGateway` | method | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/core#Client.static:fromDiscovery` | method | excluded | internal | Fábrica de instâncias/configuração nativa; script usa operações e valores normalizados. |
| `@fluxerjs/core#Client.static:Routes` | accessor | excluded | raw-transport | Rotas REST autenticadas arbitrárias contornariam os ports e guards; usar operações tipadas. |
| `@fluxerjs/core#Client.subscribeThreads` | method | function | $subscribeThreads | Assinatura declarativa no servidor atual, autorizada por dono do bot e ManageGuild de autor e bot. |
| `@fluxerjs/core#Client.sweepMembers` | method | function | $sweepCache | Limpeza local com filtros declarativos de escopo/idade conforme o bucket. |
| `@fluxerjs/core#Client.sweepMessages` | method | function | $sweepCache | Limpeza local com filtros declarativos de escopo/idade conforme o bucket. |
| `@fluxerjs/core#Client.uptime` | accessor | function | $botReadiness | Retorna ready, readyAt e uptimeMs do runtime atual. |
| `@fluxerjs/core#Client.user` | property | equivalent | $selfUser | Consulta normalizada do usuário autenticado; não retorna ClientUser. |
| `@fluxerjs/core#Client.users` | property | equivalent | $user, $userProfile | Consultas normalizadas, sem expor o gerenciador SDK. |
| `@fluxerjs/core#Client.ws` | accessor | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#ClientCluster` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#ClientCluster.add` | method | excluded | lifecycle | Inicializar ou desligar runtimes requer credenciais e coordenação do processo; exclusivamente nativo. |
| `@fluxerjs/core#ClientCluster.addAll` | method | excluded | lifecycle | Inicializar ou desligar runtimes requer credenciais e coordenação do processo; exclusivamente nativo. |
| `@fluxerjs/core#ClientCluster.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#ClientCluster.destroy` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/core#ClientCluster.emit` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/core#ClientCluster.get` | method | equivalent | $clusterInfo | Filtra o snapshot por ID; a presença de um resultado equivale a has, sem retornar bot, client ou erros. |
| `@fluxerjs/core#ClientCluster.has` | method | equivalent | $clusterInfo | Filtra o snapshot por ID; a presença de um resultado equivale a has, sem retornar bot, client ou erros. |
| `@fluxerjs/core#ClientCluster.off` | method | excluded | lifecycle | Listeners arbitrários do supervisor pertencem ao lifecycle nativo. |
| `@fluxerjs/core#ClientCluster.on` | method | excluded | lifecycle | Listeners arbitrários do supervisor pertencem ao lifecycle nativo. |
| `@fluxerjs/core#ClientCluster.once` | method | excluded | lifecycle | Listeners arbitrários do supervisor pertencem ao lifecycle nativo. |
| `@fluxerjs/core#ClientCluster.remove` | method | excluded | lifecycle | Inicializar ou desligar runtimes requer credenciais e coordenação do processo; exclusivamente nativo. |
| `@fluxerjs/core#ClientCluster.restart` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/core#ClientCluster.runtimeValues` | method | equivalent | $clusterInfo | Snapshot limitado de IDs e status; não cria iteradores nem expõe runtimes SDK. |
| `@fluxerjs/core#ClientCluster.size` | accessor | function | $clusterInfo | Total no snapshot sanitizado, com guarda de dono. |
| `@fluxerjs/core#ClientCluster.values` | method | equivalent | $clusterInfo | Snapshot limitado de IDs e status; não cria iteradores nem expõe runtimes SDK. |
| `@fluxerjs/core#ClientUser` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#ClientUser.bulkDeleteMyMessagesInGuild` | method | function | $deleteMyMessages | Pedido sem senha/MFA/WebAuthn; exige dono do bot e ManageMessages de autor e bot no servidor atual. Se o servidor exigir sudo, a operação falha. |
| `@fluxerjs/core#ClientUser.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#ClientUser.fetch` | method | function | $selfUser | Usuário autenticado normalizado, com guarda de dono do bot. |
| `@fluxerjs/core#ClientUser.fetchGuilds` | method | function | $selfGuilds | Servidores autenticados com contagens opcionais sob guarda de dono do bot. |
| `@fluxerjs/core#ClientUser.leaveGuild` | method | function | $selfLeaveGuild | Saída do servidor atual sem credenciais sudo; exige dono do servidor e do bot. |
| `@fluxerjs/core#ClientUser.setPresence` | method | function | $setPresence | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Message.awaitReactions` | method | equivalent | $collectReactions | Janela finita com filtros declarativos e resultado normalizado; sem instância SDK. |
| `@fluxerjs/core#Message.createReactionCollector` | method | equivalent | $collectReactions | Janela finita com filtros declarativos e resultado normalizado; sem instância SDK. |
| `@fluxerjs/core#MessageCollector` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#MessageCollector.channelId` | property | equivalent | $collectMessages | Canal atual, filtros declarativos e resultado final; encerra por prazo, máximo ou cancelamento do contexto. |
| `@fluxerjs/core#MessageCollector.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#MessageCollector.collected` | property | equivalent | $collectMessages | Canal atual, filtros declarativos e resultado final; encerra por prazo, máximo ou cancelamento do contexto. |
| `@fluxerjs/core#MessageCollector.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#MessageCollector.emit` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/core#MessageCollector.on` | method | excluded | lifecycle | Não executa listeners arbitrários da instância SDK; a coleta delimitada retorna itens sem callbacks. |
| `@fluxerjs/core#MessageCollector.options` | property | equivalent | $collectMessages | Canal atual, filtros declarativos e resultado final; encerra por prazo, máximo ou cancelamento do contexto. |
| `@fluxerjs/core#MessageCollector.static:awaitMessages` | method | equivalent | $collectMessages | Canal atual, filtros declarativos e resultado final; encerra por prazo, máximo ou cancelamento do contexto. |
| `@fluxerjs/core#MessageCollector.stop` | method | equivalent | $collectMessages | Canal atual, filtros declarativos e resultado final; encerra por prazo, máximo ou cancelamento do contexto. |
| `@fluxerjs/core#MessageManager.get` | method | function | $cachedMessage | Consulta mensagem normalizada no cache do canal atual, com controle de leitura. |
| `@fluxerjs/core#ReactionCollector` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#ReactionCollector.channelId` | property | equivalent | $collectReactions | Canal atual, filtros declarativos e resultado final; encerra por prazo, máximo ou cancelamento do contexto. |
| `@fluxerjs/core#ReactionCollector.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#ReactionCollector.collected` | property | equivalent | $collectReactions | Canal atual, filtros declarativos e resultado final; encerra por prazo, máximo ou cancelamento do contexto. |
| `@fluxerjs/core#ReactionCollector.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#ReactionCollector.emit` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/core#ReactionCollector.messageId` | property | equivalent | $collectReactions | Canal atual, filtros declarativos e resultado final; encerra por prazo, máximo ou cancelamento do contexto. |
| `@fluxerjs/core#ReactionCollector.on` | method | excluded | lifecycle | Não executa listeners arbitrários da instância SDK; a coleta delimitada retorna itens sem callbacks. |
| `@fluxerjs/core#ReactionCollector.options` | property | equivalent | $collectReactions | Canal atual, filtros declarativos e resultado final; encerra por prazo, máximo ou cancelamento do contexto. |
| `@fluxerjs/core#ReactionCollector.static:awaitReactions` | method | equivalent | $collectReactions | Canal atual, filtros declarativos e resultado final; encerra por prazo, máximo ou cancelamento do contexto. |
| `@fluxerjs/core#ReactionCollector.stop` | method | equivalent | $collectReactions | Canal atual, filtros declarativos e resultado final; encerra por prazo, máximo ou cancelamento do contexto. |
| `@fluxerjs/core#Webhook.deleteMessage` | method | function | $deleteWebhookMessage | Mensagem de webhook sob ManageWebhooks de autor e bot, sem expor o token ao script. |
| `@fluxerjs/core#Webhook.editMessage` | method | function | $editWebhookMessage | Mensagem de webhook sob ManageWebhooks de autor e bot, sem expor o token ao script. |
| `@fluxerjs/core#Webhook.fetchMessage` | method | function | $fetchWebhookMessage | Mensagem de webhook sob ManageWebhooks de autor e bot, sem expor o token ao script. |
| `@fluxerjs/rest#AttachmentData` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/rest#AttachmentPayload` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/rest#buildFormData` | function | excluded | raw-transport | Helper de transporte HTTP cru; usar operações tipadas e políticas de anexos/HTTP. |
| `@fluxerjs/rest#closeSharedFetch` | function | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/rest#DEFAULT_API` | variable | function | $restDefaults | Snapshot dos padrões do SDK sem acesso ao transporte REST. |
| `@fluxerjs/rest#DEFAULT_LOCALE` | variable | function | $restDefaults | Snapshot dos padrões do SDK sem acesso ao transporte REST. |
| `@fluxerjs/rest#DEFAULT_USER_AGENT` | variable | function | $restDefaults | Snapshot dos padrões do SDK sem acesso ao transporte REST. |
| `@fluxerjs/rest#DEFAULT_VERSION` | variable | function | $restDefaults | Snapshot dos padrões do SDK sem acesso ao transporte REST. |
| `@fluxerjs/rest#RateLimitManager` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/rest#RateLimitManager.getBucket` | method | equivalent | $restRateLimits | Simulação isolada e limitada; não lê nem altera os limites do transporte do bot. |
| `@fluxerjs/rest#RateLimitManager.getGlobalReset` | method | equivalent | $restRateLimits | Simulação isolada e limitada; não lê nem altera os limites do transporte do bot. |
| `@fluxerjs/rest#RateLimitManager.getWaitTime` | method | equivalent | $restRateLimits | Simulação isolada e limitada; não lê nem altera os limites do transporte do bot. |
| `@fluxerjs/rest#RateLimitManager.prune` | method | equivalent | $restRateLimits | Simulação isolada e limitada; não lê nem altera os limites do transporte do bot. |
| `@fluxerjs/rest#RateLimitManager.setBucket` | method | equivalent | $restRateLimits | Simulação isolada e limitada; não lê nem altera os limites do transporte do bot. |
| `@fluxerjs/rest#RateLimitManager.setGlobalReset` | method | equivalent | $restRateLimits | Simulação isolada e limitada; não lê nem altera os limites do transporte do bot. |
| `@fluxerjs/rest#RateLimitManager.size` | accessor | equivalent | $restRateLimits | Simulação isolada e limitada; não lê nem altera os limites do transporte do bot. |
| `@fluxerjs/rest#RateLimitManager.updateFromHeaders` | method | equivalent | $restRateLimits | Simulação isolada e limitada; não lê nem altera os limites do transporte do bot. |
| `@fluxerjs/rest#RateLimitState` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/rest#RequestManager` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/rest#RequestManager.baseUrl` | accessor | excluded | raw-transport | Requisição autenticada genérica contorna guards; scripts usam ports de operações autorizadas. |
| `@fluxerjs/rest#RequestManager.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/rest#RequestManager.getToken` | method | excluded | credentials | Credenciais, segredo ou sessão autenticada não são expostos a scripts. |
| `@fluxerjs/rest#RequestManager.request` | method | excluded | raw-transport | Requisição autenticada genérica contorna guards; scripts usam ports de operações autorizadas. |
| `@fluxerjs/rest#RequestManager.setToken` | method | excluded | credentials | Credenciais, segredo ou sessão autenticada não são expostos a scripts. |
| `@fluxerjs/rest#RequestOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/rest#REST` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/rest#REST.baseUrl` | accessor | excluded | raw-transport | Requisição autenticada genérica contorna guards; scripts usam ports de operações autorizadas. |
| `@fluxerjs/rest#REST.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/rest#REST.delete` | method | excluded | raw-transport | Requisição autenticada genérica contorna guards; scripts usam ports de operações autorizadas. |
| `@fluxerjs/rest#REST.get` | method | excluded | raw-transport | Requisição autenticada genérica contorna guards; scripts usam ports de operações autorizadas. |
| `@fluxerjs/rest#REST.patch` | method | excluded | raw-transport | Requisição autenticada genérica contorna guards; scripts usam ports de operações autorizadas. |
| `@fluxerjs/rest#REST.post` | method | excluded | raw-transport | Requisição autenticada genérica contorna guards; scripts usam ports de operações autorizadas. |
| `@fluxerjs/rest#REST.put` | method | excluded | raw-transport | Requisição autenticada genérica contorna guards; scripts usam ports de operações autorizadas. |
| `@fluxerjs/rest#REST.setToken` | method | excluded | credentials | Credenciais, segredo ou sessão autenticada não são expostos a scripts. |
| `@fluxerjs/rest#REST.static:Routes` | accessor | excluded | raw-transport | Rotas REST autenticadas arbitrárias contornariam os ports e guards; usar operações tipadas. |
| `@fluxerjs/rest#REST.token` | accessor | excluded | credentials | Credenciais, segredo ou sessão autenticada não são expostos a scripts. |
| `@fluxerjs/rest#RestOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/rest#RESTOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/rest#RetryPolicy` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/rest#RetryPolicyContext` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/rest#Routes` | variable | excluded | raw-transport | Rotas REST autenticadas arbitrárias contornariam os ports e guards; usar operações tipadas. |
| `@fluxerjs/rest#sharedFetch` | function | excluded | raw-transport | Helper de transporte HTTP cru; usar operações tipadas e políticas de anexos/HTTP. |
| `@fluxerjs/sharding#attachShardClientUtil` | function | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/sharding#BETA_SHARDING_WARNING` | variable | excluded | internal | Marcador/aviso do protocolo de supervisão nativa; sem operação de produto. |
| `@fluxerjs/sharding#ClusterManagerOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/sharding#createEnvelope` | function | excluded | internal | Envelope/nonce do IPC pertence ao supervisor, não à linguagem. |
| `@fluxerjs/sharding#IBroker` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/sharding#IClusterCoordinator` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/sharding#IPC_MARKER` | variable | excluded | internal | Marcador/aviso do protocolo de supervisão nativa; sem operação de produto. |
| `@fluxerjs/sharding#IpcEnvelope` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/sharding#IpcOp` | enum | excluded | internal | Marcador/aviso do protocolo de supervisão nativa; sem operação de produto. |
| `@fluxerjs/sharding#isIpcEnvelope` | function | excluded | internal | Envelope/nonce do IPC pertence ao supervisor, não à linguagem. |
| `@fluxerjs/sharding#nextNonce` | function | excluded | internal | Envelope/nonce do IPC pertence ao supervisor, não à linguagem. |
| `@fluxerjs/sharding#ParentIdentifyThrottler` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/sharding#ParentIdentifyThrottler.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/sharding#ParentIdentifyThrottler.waitForIdentify` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/sharding#ReshardPlan` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/sharding#ShardClientUtil` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/sharding#ShardClientUtil.broadcastEval` | method | excluded | eval | Executa JavaScript arbitrário; viola a linguagem sem eval. |
| `@fluxerjs/sharding#ShardClientUtil.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/sharding#ShardClientUtil.count` | property | function | $shardInfo | Snapshot dos shards do runtime atual, sem utilitário IPC. |
| `@fluxerjs/sharding#ShardClientUtil.fetchClientValues` | method | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/sharding#ShardClientUtil.id` | accessor | function | $shardInfo | Snapshot dos shards do runtime atual, sem utilitário IPC. |
| `@fluxerjs/sharding#ShardClientUtil.ids` | property | function | $shardInfo | Snapshot dos shards do runtime atual, sem utilitário IPC. |
| `@fluxerjs/sharding#ShardClientUtil.notifyReady` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/sharding#ShardClientUtil.requestSpawnToken` | method | excluded | credentials | Credenciais, segredo ou sessão autenticada não são expostos a scripts. |
| `@fluxerjs/sharding#ShardClientUtil.respawn` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/sharding#ShardClientUtil.send` | method | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/sharding#ShardClientUtil.shardIdForGuildId` | method | function | $shardIdForGuild | Roteamento por snowflake e total dos shards. |
| `@fluxerjs/sharding#ShardClientUtilOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/sharding#ShardingManager` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/sharding#ShardingManager.broadcastEval` | method | excluded | eval | Executa JavaScript arbitrário; viola a linguagem sem eval. |
| `@fluxerjs/sharding#ShardingManager.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/sharding#ShardingManager.destroy` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/sharding#ShardingManager.fetchClientValues` | method | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/sharding#ShardingManager.file` | property | excluded | internal | Caminho de entrada do supervisor, potencialmente sensível e desnecessário ao roteamento. |
| `@fluxerjs/sharding#ShardingManager.respawnAll` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/sharding#ShardingManager.respawnShard` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/sharding#ShardingManager.shardCount` | accessor | equivalent | $shardInfo | Total lógico publicado no contexto, sem expor o supervisor. |
| `@fluxerjs/sharding#ShardingManager.shards` | property | excluded | raw-transport | Tabela do supervisor contém objetos de processo e controle IPC; scripts veem IDs locais via $shardInfo. |
| `@fluxerjs/sharding#ShardingManager.spawn` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/sharding#ShardingManager.token` | property | excluded | credentials | Credenciais, segredo ou sessão autenticada não são expostos a scripts. |
| `@fluxerjs/sharding#ShardingManagerOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/sharding#ShardingMode` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/sharding#ShardLease` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/sharding#ShardProcess` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/sharding#ShardProcess.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/sharding#ShardProcess.eval` | method | excluded | eval | Executa JavaScript arbitrário; viola a linguagem sem eval. |
| `@fluxerjs/sharding#ShardProcess.fetchClientValue` | method | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/sharding#ShardProcess.id` | property | equivalent | $shardInfo | ID e shards publicados para o processo atual, sem enumerar objetos de processos irmãos. |
| `@fluxerjs/sharding#ShardProcess.kill` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/sharding#ShardProcess.readyAt` | accessor | excluded | internal | Timestamp do supervisor não é publicado ao worker; $botReadiness expõe somente o timestamp local. |
| `@fluxerjs/sharding#ShardProcess.respawn` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/sharding#ShardProcess.send` | method | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/sharding#ShardProcess.shardIds` | accessor | equivalent | $shardInfo | ID e shards publicados para o processo atual, sem enumerar objetos de processos irmãos. |
| `@fluxerjs/sharding#ShardProcess.spawn` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/sharding#ShardProcessOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/ws#BuildShardingStrategy` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/ws#BuildShardingStrategyFn` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/ws#DEFAULT_GUILDS_PER_SHARD` | variable | function | $gatewayConstants | Constantes públicas do SDK sem acesso ao gateway ativo. |
| `@fluxerjs/ws#DEFAULT_RESUME_TTL_MS` | variable | function | $gatewayConstants | Constantes públicas do SDK sem acesso ao gateway ativo. |
| `@fluxerjs/ws#GatewayCloseCodes` | variable | function | $gatewayConstants | Constantes públicas do SDK sem acesso ao gateway ativo. |
| `@fluxerjs/ws#getDefaultWebSocket` | function | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/ws#getDefaultWebSocketSync` | function | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/ws#guildMatchesShard` | function | function | $guildMatchesShard | Compara roteamento para servidor e shard usando números. |
| `@fluxerjs/ws#IIdentifyThrottler` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/ws#ISessionStore` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/ws#IShardingStrategy` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/ws#isSessionInfoFresh` | function | equivalent | $gatewaySessionFresh | Janela de resume calculada com timestamps, sem ler sessão ou credenciais. |
| `@fluxerjs/ws#MAX_GUILDS_PER_SHARD` | variable | function | $gatewayConstants | Constantes públicas do SDK sem acesso ao gateway ativo. |
| `@fluxerjs/ws#MAX_SHARD_COUNT` | variable | function | $gatewayConstants | Constantes públicas do SDK sem acesso ao gateway ativo. |
| `@fluxerjs/ws#MemorySessionStore` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/ws#MemorySessionStore.clear` | method | excluded | credentials | Armazenamento de sessão/resume pertence ao gateway nativo e não ao script. |
| `@fluxerjs/ws#MemorySessionStore.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/ws#MemorySessionStore.retrieveSessionInfo` | method | excluded | credentials | Armazenamento de sessão/resume pertence ao gateway nativo e não ao script. |
| `@fluxerjs/ws#MemorySessionStore.updateSessionInfo` | method | excluded | credentials | Armazenamento de sessão/resume pertence ao gateway nativo e não ao script. |
| `@fluxerjs/ws#narrowGatewayPayload` | function | function | $normalizeGatewayPayload | Normaliza somente valores do próprio script; não recebe nem envia tráfego do gateway. |
| `@fluxerjs/ws#recommendedShardCount` | function | function | $recommendedShardCount | Calcula a quantidade recomendada de shards com argumentos limitados. |
| `@fluxerjs/ws#SessionInfo` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/ws#shardIdForGuild` | function | function | $shardIdForGuild | Roteamento por snowflake e total dos shards. |
| `@fluxerjs/ws#ShardStatus` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/ws#shouldReconnectOnClose` | function | function | $gatewayShouldReconnect | Classifica código de fechamento sem reconectar. |
| `@fluxerjs/ws#SimpleIdentifyThrottler` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/ws#SimpleIdentifyThrottler.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/ws#SimpleIdentifyThrottler.destroy` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/ws#SimpleIdentifyThrottler.waitForIdentify` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/ws#SimpleIdentifyThrottlerOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/ws#SimpleShardingStrategy` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/ws#SimpleShardingStrategy.connect` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/ws#SimpleShardingStrategy.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/ws#SimpleShardingStrategy.destroy` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/ws#SimpleShardingStrategy.fetchStatus` | method | equivalent | $gatewayStatus | Snapshot de IDs, status e latência disponível da estratégia ativa, sem sockets nem processos. |
| `@fluxerjs/ws#SimpleShardingStrategy.getPing` | method | equivalent | $gatewayStatus | Snapshot de IDs, status e latência disponível da estratégia ativa, sem sockets nem processos. |
| `@fluxerjs/ws#SimpleShardingStrategy.getShard` | method | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/ws#SimpleShardingStrategy.getShards` | method | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/ws#SimpleShardingStrategy.send` | method | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/ws#SimpleShardingStrategy.spawn` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/ws#SimpleShardingStrategyContext` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/ws#WebSocketConstructor` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/ws#WebSocketLike` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/ws#WebSocketManager` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/ws#WebSocketManager.connect` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/ws#WebSocketManager.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/ws#WebSocketManager.destroy` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/ws#WebSocketManager.fetchStatus` | method | function | $gatewayStatus | Snapshot autorizado de status, URL, total e latência sem expor WebSocketManager. |
| `@fluxerjs/ws#WebSocketManager.getGatewayUrl` | method | function | $gatewayStatus | Snapshot autorizado de status, URL, total e latência sem expor WebSocketManager. |
| `@fluxerjs/ws#WebSocketManager.getIdentifyThrottler` | method | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/ws#WebSocketManager.getOptions` | method | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/ws#WebSocketManager.getSessionStore` | method | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/ws#WebSocketManager.getShard` | method | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/ws#WebSocketManager.getShardCount` | method | function | $gatewayStatus | Snapshot autorizado de status, URL, total e latência sem expor WebSocketManager. |
| `@fluxerjs/ws#WebSocketManager.getShards` | method | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/ws#WebSocketManager.ping` | accessor | function | $gatewayStatus | Snapshot autorizado de status, URL, total e latência sem expor WebSocketManager. |
| `@fluxerjs/ws#WebSocketManager.send` | method | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/ws#WebSocketManagerOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/ws#WebSocketManagerRest` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/ws#WebSocketShard` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/ws#WebSocketShard.connect` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/ws#WebSocketShard.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/ws#WebSocketShard.destroy` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/ws#WebSocketShard.handlePayload` | method | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/ws#WebSocketShard.id` | accessor | equivalent | $gatewayStatus | Snapshot de IDs, status e latência disponível da estratégia ativa, sem sockets nem processos. |
| `@fluxerjs/ws#WebSocketShard.ping` | accessor | equivalent | $gatewayStatus | Snapshot de IDs, status e latência disponível da estratégia ativa, sem sockets nem processos. |
| `@fluxerjs/ws#WebSocketShard.send` | method | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/ws#WebSocketShard.sequence` | accessor | excluded | internal | Sequência de resume do protocolo é mantida pelo gateway. |
| `@fluxerjs/ws#WebSocketShard.session` | accessor | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/ws#WebSocketShard.status` | accessor | equivalent | $gatewayStatus | Snapshot de IDs, status e latência disponível da estratégia ativa, sem sockets nem processos. |
| `@fluxerjs/ws#WebSocketShardOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/ws#WorkerShardingStrategy` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/ws#WorkerShardingStrategy.connect` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/ws#WorkerShardingStrategy.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/ws#WorkerShardingStrategy.destroy` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/ws#WorkerShardingStrategy.fetchStatus` | method | equivalent | $gatewayStatus | Snapshot de IDs, status e latência disponível da estratégia ativa, sem sockets nem processos. |
| `@fluxerjs/ws#WorkerShardingStrategy.getPing` | method | equivalent | $gatewayStatus | Snapshot de IDs, status e latência disponível da estratégia ativa, sem sockets nem processos. |
| `@fluxerjs/ws#WorkerShardingStrategy.send` | method | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/ws#WorkerShardingStrategy.spawn` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/ws#WorkerShardingStrategyOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |

## entities

| ID | Tipo | Status | Funções / exclusão | Justificativa |
|---|---|---|---|---|
| `@fluxerjs/builders#AttachmentBuilder` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/builders#AttachmentBuilder.attachment` | property | equivalent | $fileBase64, $sendAttachments | Anexo declarativo carrega bytes, nome e descrição; envio faz upload pelo adaptador. |
| `@fluxerjs/builders#AttachmentBuilder.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/builders#AttachmentBuilder.description` | property | equivalent | $fileBase64, $sendAttachments | Anexo declarativo carrega bytes, nome e descrição; envio faz upload pelo adaptador. |
| `@fluxerjs/builders#AttachmentBuilder.filename` | accessor | equivalent | $fileBase64, $sendAttachments | Anexo declarativo carrega bytes, nome e descrição; envio faz upload pelo adaptador. |
| `@fluxerjs/builders#AttachmentBuilder.name` | property | equivalent | $fileBase64, $sendAttachments | Anexo declarativo carrega bytes, nome e descrição; envio faz upload pelo adaptador. |
| `@fluxerjs/builders#AttachmentBuilder.setDescription` | method | equivalent | $fileBase64, $sendAttachments | Anexo declarativo carrega bytes, nome e descrição; envio faz upload pelo adaptador. |
| `@fluxerjs/builders#AttachmentBuilder.setName` | method | equivalent | $fileBase64, $sendAttachments | Anexo declarativo carrega bytes, nome e descrição; envio faz upload pelo adaptador. |
| `@fluxerjs/builders#AttachmentBuilder.setSpoiler` | method | equivalent | $fileBase64, $sendAttachments | spoiler booleano em anexo declarativo URL/base64; adaptador normaliza flags/nome, sem objeto SDK mutável. |
| `@fluxerjs/builders#AttachmentBuilder.spoiler` | property | equivalent | $fileBase64, $sendAttachments | spoiler booleano em anexo declarativo URL/base64; adaptador normaliza flags/nome, sem objeto SDK mutável. |
| `@fluxerjs/builders#AttachmentBuilder.toFileData` | method | equivalent | $fileBase64, $sendAttachments | Anexo declarativo enviado pelo port; conversão para FileData ocorre no adaptador. |
| `@fluxerjs/builders#AttachmentBuilder.toJSON` | method | equivalent | $fileBase64, $sendAttachments | Anexo declarativo enviado pelo port; conversão para FileData ocorre no adaptador. |
| `@fluxerjs/builders#AttachmentBuilder.url` | property | equivalent | $sendAttachments, $object | Anexo declarativo com url HTTP/HTTPS e name; download e upload são realizados pelo port com limites. |
| `@fluxerjs/builders#AttachmentMeta` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/builders#AttachmentMeta.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/builders#AttachmentMeta.description` | property | equivalent | $fileBase64, $sendAttachments | Anexo declarativo carrega bytes, nome e descrição; envio faz upload pelo adaptador. |
| `@fluxerjs/builders#AttachmentMeta.filename` | property | equivalent | $fileBase64, $sendAttachments | Anexo declarativo carrega bytes, nome e descrição; envio faz upload pelo adaptador. |
| `@fluxerjs/builders#AttachmentMeta.id` | property | equivalent | $sendAttachments, $loopIndex | O ID do metadado é o índice no array de upload; o adaptador gera esse índice, disponível como $loopIndex ao percorrer os anexos. |
| `@fluxerjs/builders#AttachmentMeta.setDescription` | method | equivalent | $fileBase64, $sendAttachments | Anexo declarativo carrega bytes, nome e descrição; envio faz upload pelo adaptador. |
| `@fluxerjs/builders#AttachmentMeta.setName` | method | equivalent | $fileBase64, $sendAttachments | Anexo declarativo carrega bytes, nome e descrição; envio faz upload pelo adaptador. |
| `@fluxerjs/builders#AttachmentMeta.setSpoiler` | method | equivalent | $fileBase64, $sendAttachments | spoiler booleano em anexo declarativo URL/base64; adaptador normaliza flags/nome, sem objeto SDK mutável. |
| `@fluxerjs/builders#AttachmentMeta.spoiler` | property | equivalent | $fileBase64, $sendAttachments | spoiler booleano em anexo declarativo URL/base64; adaptador normaliza flags/nome, sem objeto SDK mutável. |
| `@fluxerjs/builders#AttachmentMeta.toJSON` | method | equivalent | $fileBase64, $sendAttachments | Anexo declarativo enviado pelo port; conversão para FileData ocorre no adaptador. |
| `@fluxerjs/builders#EmbedBuilder` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/builders#EmbedBuilder.addFields` | method | equivalent | $embed, $fields | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/builders#EmbedBuilder.data` | property | equivalent | $embedFromObject | Conversão por objeto validado de embed; descarta campos somente de resposta. |
| `@fluxerjs/builders#EmbedBuilder.setAuthor` | method | equivalent | $embed, $author | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/builders#EmbedBuilder.setColor` | method | equivalent | $embed, $color | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/builders#EmbedBuilder.setDescription` | method | equivalent | $embed, $description | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/builders#EmbedBuilder.setFields` | method | equivalent | $embed, $fields | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/builders#EmbedBuilder.setFooter` | method | equivalent | $embed, $footer | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/builders#EmbedBuilder.setImage` | method | equivalent | $embed, $image | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/builders#EmbedBuilder.setThumbnail` | method | equivalent | $embed, $thumbnail | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/builders#EmbedBuilder.setTimestamp` | method | equivalent | $embed, $embedTimestamp | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/builders#EmbedBuilder.setTitle` | method | equivalent | $embed, $title | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/builders#EmbedBuilder.setURL` | method | equivalent | $embed, $url | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/builders#EmbedBuilder.spliceFields` | method | equivalent | $embedFromObject, $prop, $arraySlice, $arrayConcat, $fields, $jsonMerge | Copiar campos, concatenar prefixo + novos campos + sufixo e validar com embedFromObject; não muta builder. |
| `@fluxerjs/builders#EmbedBuilder.static:from` | method | equivalent | $embedFromObject | Conversão por objeto validado de embed; descarta campos somente de resposta. |
| `@fluxerjs/builders#EmbedBuilder.toJSON` | method | equivalent | $embedFromObject | Conversão por objeto validado de embed; descarta campos somente de resposta. |
| `@fluxerjs/builders#MessagePayload` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/builders#MessagePayload.addEmbed` | method | equivalent | $embeds, $addEmbed, $jsonMerge, $reply | Lista de embeds validada composta no payload de envio. |
| `@fluxerjs/builders#MessagePayload.data` | property | equivalent | $object, $jsonMerge, $reply | Payload declarativo validado no envio em vez de instância mutável. |
| `@fluxerjs/builders#MessagePayload.setAllowedMentions` | method | equivalent | $object, $jsonMerge, $reply | Payload allowedMentions tipado; relaxar menções exige autorização. |
| `@fluxerjs/builders#MessagePayload.setAttachments` | method | equivalent | $sendAttachments | Payload declarativo cobre o campo no envio, sem instância mutável do SDK. |
| `@fluxerjs/builders#MessagePayload.setContent` | method | equivalent | $object, $reply, $sendMessage | Objeto com content enviado por $reply/$sendMessage; respeita limite e validação. |
| `@fluxerjs/builders#MessagePayload.setEmbeds` | method | equivalent | $embeds, $addEmbed, $jsonMerge, $reply | Lista de embeds validada composta no payload de envio. |
| `@fluxerjs/builders#MessagePayload.setFlags` | method | equivalent | $messageOptions | Payload declarativo cobre o campo no envio, sem instância mutável do SDK. |
| `@fluxerjs/builders#MessagePayload.setReply` | method | equivalent | $reply | Payload declarativo cobre o campo no envio, sem instância mutável do SDK. |
| `@fluxerjs/builders#MessagePayload.setTTS` | method | equivalent | $messageOptions | Payload declarativo cobre o campo no envio, sem instância mutável do SDK. |
| `@fluxerjs/builders#MessagePayload.static:create` | method | excluded | internal | Fábrica de instância SDK; compor payload declarativo em vez de construir objeto SDK. |
| `@fluxerjs/builders#MessagePayload.toJSON` | method | equivalent | $object, $jsonMerge, $reply | Payload declarativo validado no envio em vez de instância mutável. |
| `@fluxerjs/core#AnnouncementChannel` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#AttachmentBuilder` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#AttachmentBuilder.attachment` | property | equivalent | $fileBase64, $sendAttachments | Anexo declarativo carrega bytes, nome e descrição; envio faz upload pelo adaptador. |
| `@fluxerjs/core#AttachmentBuilder.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#AttachmentBuilder.description` | property | equivalent | $fileBase64, $sendAttachments | Anexo declarativo carrega bytes, nome e descrição; envio faz upload pelo adaptador. |
| `@fluxerjs/core#AttachmentBuilder.filename` | accessor | equivalent | $fileBase64, $sendAttachments | Anexo declarativo carrega bytes, nome e descrição; envio faz upload pelo adaptador. |
| `@fluxerjs/core#AttachmentBuilder.name` | property | equivalent | $fileBase64, $sendAttachments | Anexo declarativo carrega bytes, nome e descrição; envio faz upload pelo adaptador. |
| `@fluxerjs/core#AttachmentBuilder.setDescription` | method | equivalent | $fileBase64, $sendAttachments | Anexo declarativo carrega bytes, nome e descrição; envio faz upload pelo adaptador. |
| `@fluxerjs/core#AttachmentBuilder.setName` | method | equivalent | $fileBase64, $sendAttachments | Anexo declarativo carrega bytes, nome e descrição; envio faz upload pelo adaptador. |
| `@fluxerjs/core#AttachmentBuilder.setSpoiler` | method | equivalent | $fileBase64, $sendAttachments | spoiler booleano em anexo declarativo URL/base64; adaptador normaliza flags/nome, sem objeto SDK mutável. |
| `@fluxerjs/core#AttachmentBuilder.spoiler` | property | equivalent | $fileBase64, $sendAttachments | spoiler booleano em anexo declarativo URL/base64; adaptador normaliza flags/nome, sem objeto SDK mutável. |
| `@fluxerjs/core#AttachmentBuilder.toFileData` | method | equivalent | $fileBase64, $sendAttachments | Anexo declarativo enviado pelo port; conversão para FileData ocorre no adaptador. |
| `@fluxerjs/core#AttachmentBuilder.toJSON` | method | equivalent | $fileBase64, $sendAttachments | Anexo declarativo enviado pelo port; conversão para FileData ocorre no adaptador. |
| `@fluxerjs/core#AttachmentBuilder.url` | property | equivalent | $sendAttachments, $object | Anexo declarativo com url HTTP/HTTPS e name; download e upload são realizados pelo port com limites. |
| `@fluxerjs/core#AttachmentMeta` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#AttachmentMeta.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#AttachmentMeta.description` | property | equivalent | $fileBase64, $sendAttachments | Anexo declarativo carrega bytes, nome e descrição; envio faz upload pelo adaptador. |
| `@fluxerjs/core#AttachmentMeta.filename` | property | equivalent | $fileBase64, $sendAttachments | Anexo declarativo carrega bytes, nome e descrição; envio faz upload pelo adaptador. |
| `@fluxerjs/core#AttachmentMeta.id` | property | equivalent | $sendAttachments, $loopIndex | O ID do metadado é o índice no array de upload; o adaptador gera esse índice, disponível como $loopIndex ao percorrer os anexos. |
| `@fluxerjs/core#AttachmentMeta.setDescription` | method | equivalent | $fileBase64, $sendAttachments | Anexo declarativo carrega bytes, nome e descrição; envio faz upload pelo adaptador. |
| `@fluxerjs/core#AttachmentMeta.setName` | method | equivalent | $fileBase64, $sendAttachments | Anexo declarativo carrega bytes, nome e descrição; envio faz upload pelo adaptador. |
| `@fluxerjs/core#AttachmentMeta.setSpoiler` | method | equivalent | $fileBase64, $sendAttachments | spoiler booleano em anexo declarativo URL/base64; adaptador normaliza flags/nome, sem objeto SDK mutável. |
| `@fluxerjs/core#AttachmentMeta.spoiler` | property | equivalent | $fileBase64, $sendAttachments | spoiler booleano em anexo declarativo URL/base64; adaptador normaliza flags/nome, sem objeto SDK mutável. |
| `@fluxerjs/core#AttachmentMeta.toJSON` | method | equivalent | $fileBase64, $sendAttachments | Anexo declarativo enviado pelo port; conversão para FileData ocorre no adaptador. |
| `@fluxerjs/core#Base` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#Base.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#CategoryChannel` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#Channel` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#Channel._patch` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Channel.acknowledgePins` | method | function | $acknowledgePins | Atualiza leitura dos pins somente no canal atual, com ReadMessageHistory de autor e bot ou participação na DM. |
| `@fluxerjs/core#Channel.bulkDelete` | method | function | $bulkDelete | Exclusão autorizada de 1 a 100 IDs, com deduplicação e preservação da resposta parcial. |
| `@fluxerjs/core#Channel.bulkDeleteMyMessages` | method | equivalent | $bulkDeleteMyMessages | Exclusão limitada às mensagens do bot em janela de até 100 mensagens; sem rota global ou sudo de sessão, com ManageMessages de autor e bot. |
| `@fluxerjs/core#Channel.canSendMessage` | method | equivalent | $canSend | Consulta permissões efetivas de envio em canal do servidor atual. |
| `@fluxerjs/core#Channel.clearReadState` | method | function | $clearReadState | Limpa estado de leitura somente do canal atual, com autorização de autor e bot ou participação na DM. |
| `@fluxerjs/core#Channel.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#Channel.completeAttachmentUploads` | method | equivalent | $sendAttachments | Uploads são resolvidos dentro do envio de anexos declarativos, sem expor URLs de sessão. |
| `@fluxerjs/core#Channel.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#Channel.createdAt` | accessor | equivalent | $channel | O leitor $channel expõe createdAt pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Channel.createdTimestamp` | accessor | equivalent | $channel | $channel expõe createdTimestamp no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Channel.delete` | method | function | $deleteChannel | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Channel.icon` | property | equivalent | $channel | $channel expõe icon no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Channel.id` | property | equivalent | $channel, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Channel.isAnnouncement` | method | equivalent | $channel, $prop, $eq, $or | Comparar ChannelInfo.type com os valores públicos de ChannelType; guildID distingue canal de servidor. |
| `@fluxerjs/core#Channel.isCategory` | method | equivalent | $channel, $prop, $eq, $or | Comparar ChannelInfo.type com os valores públicos de ChannelType; guildID distingue canal de servidor. |
| `@fluxerjs/core#Channel.isDM` | method | equivalent | $channel, $prop, $eq, $or | Comparar ChannelInfo.type com os valores públicos de ChannelType; guildID distingue canal de servidor. |
| `@fluxerjs/core#Channel.isForum` | method | equivalent | $channel, $prop, $eq, $or | Comparar ChannelInfo.type com os valores públicos de ChannelType; guildID distingue canal de servidor. |
| `@fluxerjs/core#Channel.isGuild` | method | equivalent | $channel, $prop, $eq, $or | Comparar ChannelInfo.type com os valores públicos de ChannelType; guildID distingue canal de servidor. |
| `@fluxerjs/core#Channel.isLink` | method | equivalent | $channel, $prop, $eq, $or | Comparar ChannelInfo.type com os valores públicos de ChannelType; guildID distingue canal de servidor. |
| `@fluxerjs/core#Channel.isMedia` | method | equivalent | $channel, $prop, $eq, $or | Comparar ChannelInfo.type com os valores públicos de ChannelType; guildID distingue canal de servidor. |
| `@fluxerjs/core#Channel.isPersonalNotes` | method | equivalent | $channel, $prop, $eq, $or | Comparar ChannelInfo.type com os valores públicos de ChannelType; guildID distingue canal de servidor. |
| `@fluxerjs/core#Channel.isText` | method | equivalent | $channel, $prop, $eq, $or | Comparar ChannelInfo.type com os valores públicos de ChannelType; guildID distingue canal de servidor. |
| `@fluxerjs/core#Channel.isTextBased` | method | equivalent | $channel, $prop, $eq, $or | Comparar ChannelInfo.type com os valores públicos de ChannelType; guildID distingue canal de servidor. |
| `@fluxerjs/core#Channel.isThread` | method | equivalent | $channel, $prop, $eq, $or | Comparar ChannelInfo.type com os valores públicos de ChannelType; guildID distingue canal de servidor. |
| `@fluxerjs/core#Channel.isVoice` | method | equivalent | $channel, $prop, $eq, $or | Comparar ChannelInfo.type com os valores públicos de ChannelType; guildID distingue canal de servidor. |
| `@fluxerjs/core#Channel.lastPinTimestamp` | property | equivalent | $channel | $channel expõe lastPinTimestamp no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Channel.messages` | accessor | equivalent | $messages | Listar mensagens normalizadas do canal em vez de expor manager mutável. |
| `@fluxerjs/core#Channel.name` | property | equivalent | $channel, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Channel.requestAttachmentUploads` | method | equivalent | $sendAttachments | Uploads são resolvidos dentro do envio de anexos declarativos, sem expor URLs de sessão. |
| `@fluxerjs/core#Channel.static:createDM` | method | excluded | internal | Fábrica de instâncias/configuração nativa; script usa operações e valores normalizados. |
| `@fluxerjs/core#Channel.static:from` | method | excluded | internal | Fábrica de instâncias/configuração nativa; script usa operações e valores normalizados. |
| `@fluxerjs/core#Channel.static:fromOrCreate` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Channel.toString` | method | equivalent | $mention | Formata a menção pelo ID numérico. |
| `@fluxerjs/core#Channel.type` | property | equivalent | $channel, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Channel.uploadAttachmentsForSend` | method | equivalent | $sendAttachments | Uploads são resolvidos dentro do envio de anexos declarativos, sem expor URLs de sessão. |
| `@fluxerjs/core#ChannelManager` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#ChannelManager.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#ChannelManager.fetch` | method | function | $channel | Busca um canal por ID pelo recurso channels.get; não confundir com listagem $channels. |
| `@fluxerjs/core#ChannelManager.fetchMessage` | method | equivalent | $fetchMessage | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#ChannelManager.resolve` | method | equivalent | $channel | Resolver canal por ID através de busca normalizada; sem referência mutável. |
| `@fluxerjs/core#ChannelManager.send` | method | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/core#DMChannel` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#DMChannel._patch` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#DMChannel.addRecipient` | method | function | $addRecipient | Adiciona destinatário somente ao grupo DM atual, com participação do autor e autoridade do dono; nunca altera o bot. |
| `@fluxerjs/core#DMChannel.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#DMChannel.edit` | method | equivalent | $editChannel | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#DMChannel.lastMessageId` | property | equivalent | $channel | $channel expõe lastMessageId no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#DMChannel.nicks` | property | equivalent | $channel | $channel expõe nicks no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#DMChannel.ownerId` | property | equivalent | $channel, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#DMChannel.pinInList` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#DMChannel.purgeMessages` | method | excluded | credentials | No SDK 3.3.0 esta rota apaga exclusivamente anotações pessoais (tipo 999), dependentes de sessão de usuário; o recurso autorizado recusa esse canal e não expõe sudo ou sessão em scripts. |
| `@fluxerjs/core#DMChannel.recipients` | property | equivalent | $channel, $user | recipientIDs fornece IDs; $user resolve os dados públicos de cada destinatário. |
| `@fluxerjs/core#DMChannel.removeRecipient` | method | function | $removeRecipient | Remove destinatário somente do grupo DM atual; terceiros exigem dono, saída própria exige participação, bot protegido. |
| `@fluxerjs/core#DMChannel.unpinFromList` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#EmbedBuilder` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#EmbedBuilder.addFields` | method | equivalent | $embed, $fields | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/core#EmbedBuilder.data` | property | equivalent | $embedFromObject | Conversão por objeto validado de embed; descarta campos somente de resposta. |
| `@fluxerjs/core#EmbedBuilder.setAuthor` | method | equivalent | $embed, $author | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/core#EmbedBuilder.setColor` | method | equivalent | $embed, $color | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/core#EmbedBuilder.setDescription` | method | equivalent | $embed, $description | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/core#EmbedBuilder.setFields` | method | equivalent | $embed, $fields | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/core#EmbedBuilder.setFooter` | method | equivalent | $embed, $footer | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/core#EmbedBuilder.setImage` | method | equivalent | $embed, $image | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/core#EmbedBuilder.setThumbnail` | method | equivalent | $embed, $thumbnail | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/core#EmbedBuilder.setTimestamp` | method | equivalent | $embed, $embedTimestamp | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/core#EmbedBuilder.setTitle` | method | equivalent | $embed, $title | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/core#EmbedBuilder.setURL` | method | equivalent | $embed, $url | Composição de partes tipadas em $embed; não requer builder mutável. |
| `@fluxerjs/core#EmbedBuilder.spliceFields` | method | equivalent | $embedFromObject, $prop, $arraySlice, $arrayConcat, $fields, $jsonMerge | Copiar campos, concatenar prefixo + novos campos + sufixo e validar com embedFromObject; não muta builder. |
| `@fluxerjs/core#EmbedBuilder.static:from` | method | equivalent | $embedFromObject | Conversão por objeto validado de embed; descarta campos somente de resposta. |
| `@fluxerjs/core#EmbedBuilder.toJSON` | method | equivalent | $embedFromObject | Conversão por objeto validado de embed; descarta campos somente de resposta. |
| `@fluxerjs/core#ForumChannel` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#ForumChannel._patch` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#ForumChannel.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#ForumChannel.defaultForumLayout` | property | equivalent | $channel | $channel expõe defaultForumLayout no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#ForumChannel.setDefaultForumLayout` | method | function | $setDefaultForumLayout | Define layout default/list/grid ou limpa override com ManageChannels de autor e bot no servidor atual. |
| `@fluxerjs/core#Guild` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#Guild._patch` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Guild.adjustMemberCount` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Guild.afkChannelId` | property | equivalent | $guild | $guild expõe afkChannelId no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.afkTimeout` | property | equivalent | $guild | $guild expõe afkTimeout no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.applyForDiscovery` | method | function | $applyForDiscovery | $applyForDiscovery opera no servidor atual por port autorizado; valida argumentos e preserva erros, sem repetir mutações. |
| `@fluxerjs/core#Guild.available` | property | equivalent | $guild | $guild expõe available no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.ban` | method | function | $ban | Moderação autorizada por $ban; guards compartilhados. |
| `@fluxerjs/core#Guild.banner` | property | equivalent | $guild | $guild expõe banner no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.bannerHeight` | property | equivalent | $guild | $guild expõe bannerHeight no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.bannerURL` | method | function | $guildBanner | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Guild.bannerWidth` | property | equivalent | $guild | $guild expõe bannerWidth no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.channels` | property | equivalent | $channels | Listar canais normalizados em vez do manager mutável. |
| `@fluxerjs/core#Guild.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#Guild.cloneEmoji` | method | function | $cloneEmoji | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Guild.cloneSticker` | method | function | $cloneSticker | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Guild.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#Guild.contentWarningLevel` | property | equivalent | $guild | $guild expõe contentWarningLevel no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.contentWarningText` | property | equivalent | $guild | $guild expõe contentWarningText no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.createChannel` | method | equivalent | $createChannel | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Guild.createdAt` | accessor | equivalent | $guild, $prop, $date | Derivar data de GuildInfo.createdTimestamp. |
| `@fluxerjs/core#Guild.createdTimestamp` | accessor | equivalent | $guild, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Guild.createEmoji` | method | function | $createEmoji | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Guild.createEmojisBulk` | method | function | $createEmojisBulk | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Guild.createRole` | method | equivalent | $createRole | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Guild.createSticker` | method | function | $createSticker | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Guild.createStickersBulk` | method | function | $createStickersBulk | $createStickersBulk opera no servidor atual por port autorizado; valida argumentos e preserva erros, sem repetir mutações. |
| `@fluxerjs/core#Guild.defaultMessageNotifications` | property | equivalent | $guild | $guild expõe defaultMessageNotifications no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.delete` | method | excluded | lifecycle | Destruição irreversível do servidor permanece fora da autoridade de scripts; somente o ciclo de vida nativo pode executar essa operação. |
| `@fluxerjs/core#Guild.disabledOperations` | property | equivalent | $guild | $guild expõe disabledOperations no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.edit` | method | function | $editGuild | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Guild.editDiscoveryApplication` | method | function | $editDiscoveryApplication | $editDiscoveryApplication opera no servidor atual por port autorizado; valida argumentos e preserva erros, sem repetir mutações. |
| `@fluxerjs/core#Guild.editVanityURL` | method | equivalent | $setVanity | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Guild.embedSplash` | property | equivalent | $guild | $guild expõe embedSplash no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.emojis` | property | equivalent | $emojis | Listar emojis normalizados em vez do manager mutável. |
| `@fluxerjs/core#Guild.explicitContentFilter` | property | equivalent | $guild | $guild expõe explicitContentFilter no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.features` | property | equivalent | $guild, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Guild.fetchActiveThreads` | method | equivalent | $activeThreads | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Guild.fetchAuditLogs` | method | equivalent | $auditLogs | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Guild.fetchBans` | method | equivalent | $bans | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Guild.fetchChannels` | method | function | $channels | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Guild.fetchDiscoveryStatus` | method | function | $discoveryStatus | $discoveryStatus opera no servidor atual por port autorizado; valida argumentos e preserva erros, sem repetir mutações. |
| `@fluxerjs/core#Guild.fetchEmoji` | method | equivalent | $emoji | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Guild.fetchEmojis` | method | equivalent | $emojis | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Guild.fetchInvite` | method | function | $invite | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Guild.fetchInvites` | method | function | $invites | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Guild.fetchMe` | method | equivalent | $guildMe | Busca o membro do bot no servidor atual como valor normalizado, sem instância SDK ou cache mutável. |
| `@fluxerjs/core#Guild.fetchMember` | method | equivalent | $member | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Guild.fetchRole` | method | equivalent | $role | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Guild.fetchRoles` | method | equivalent | $roles | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Guild.fetchSticker` | method | equivalent | $sticker | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Guild.fetchStickers` | method | equivalent | $stickers | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Guild.fetchVanityURL` | method | function | $vanity | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Guild.fetchWebhooks` | method | equivalent | $webhooks | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Guild.icon` | property | equivalent | $guild | $guild expõe icon no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.iconURL` | method | function | $guildIcon | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Guild.id` | property | equivalent | $guild, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Guild.kick` | method | function | $kick | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Guild.memberCount` | property | equivalent | $guild, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Guild.members` | property | equivalent | $members | Listar membros normalizados em vez do manager mutável. |
| `@fluxerjs/core#Guild.messageHistoryCutoff` | property | equivalent | $guild | $guild expõe messageHistoryCutoff no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.mfaLevel` | property | equivalent | $guild | $guild expõe mfaLevel no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.name` | property | equivalent | $guild, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Guild.nsfw` | property | equivalent | $guild | $guild expõe nsfw no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.nsfwLevel` | property | equivalent | $guild | $guild expõe nsfwLevel no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.onlineCount` | property | equivalent | $guild | $guild expõe onlineCount no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.ownerId` | property | equivalent | $guild, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Guild.permissions` | property | equivalent | $guild | O leitor $guild expõe permissions pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Guild.resetRoleHoistPositions` | method | function | $resetRoleHoistPositions | $resetRoleHoistPositions opera no servidor atual por port autorizado; valida argumentos e preserva erros, sem repetir mutações. |
| `@fluxerjs/core#Guild.resolveRoleId` | method | equivalent | $role | $role[consulta;id] resolve ID, menção ou nome no servidor atual e retorna somente o ID normalizado. |
| `@fluxerjs/core#Guild.roles` | property | equivalent | $roles | Listar cargos normalizados em vez do manager mutável. |
| `@fluxerjs/core#Guild.rulesChannelId` | property | equivalent | $guild | $guild expõe rulesChannelId no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.setChannelPositions` | method | function | $setChannelPositions | $setChannelPositions opera no servidor atual por port autorizado; valida argumentos e preserva erros, sem repetir mutações. |
| `@fluxerjs/core#Guild.setRoleHoistPositions` | method | function | $setRoleHoistPositions | $setRoleHoistPositions opera no servidor atual por port autorizado; valida argumentos e preserva erros, sem repetir mutações. |
| `@fluxerjs/core#Guild.setRolePositions` | method | function | $setRolePositions | $setRolePositions opera no servidor atual por port autorizado; valida argumentos e preserva erros, sem repetir mutações. |
| `@fluxerjs/core#Guild.splash` | property | equivalent | $guild | $guild expõe splash no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.splashCardAlignment` | property | equivalent | $guild | $guild expõe splashCardAlignment no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.splashHeight` | property | equivalent | $guild | $guild expõe splashHeight no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.splashURL` | method | equivalent | $guild | $guild expõe splashURL no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.splashWidth` | property | equivalent | $guild | $guild expõe splashWidth no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.stickers` | property | equivalent | $stickers | Listar stickers normalizados em vez do manager mutável. |
| `@fluxerjs/core#Guild.systemChannelFlags` | property | equivalent | $guild | $guild expõe systemChannelFlags no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.systemChannelId` | property | equivalent | $guild | $guild expõe systemChannelId no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.toString` | method | equivalent | $guild | A propriedade name retorna o nome textual do servidor. |
| `@fluxerjs/core#Guild.transferOwnership` | method | function | $transferOwnership | $transferOwnership opera no servidor atual por port autorizado; valida argumentos e preserva erros, sem repetir mutações. |
| `@fluxerjs/core#Guild.unban` | method | function | $unban | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Guild.vanityURLCode` | property | equivalent | $guild | $guild expõe vanityURLCode no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.verificationLevel` | property | equivalent | $guild | $guild expõe verificationLevel no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Guild.withdrawDiscoveryApplication` | method | function | $withdrawDiscoveryApplication | $withdrawDiscoveryApplication opera no servidor atual por port autorizado; valida argumentos e preserva erros, sem repetir mutações. |
| `@fluxerjs/core#GuildBan` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#GuildBan.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#GuildBan.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#GuildBan.expiresAt` | property | equivalent | $banInfo | O leitor $banInfo expõe expiresAt pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#GuildBan.guildId` | property | equivalent | $banInfo | O leitor $banInfo expõe guildID pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#GuildBan.reason` | property | equivalent | $bans, $prop, $arrayFind | BanInfo.reason acessível na listagem de bans autorizada. |
| `@fluxerjs/core#GuildBan.unban` | method | function | $unban | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#GuildBan.user` | property | equivalent | $banInfo | O leitor $banInfo expõe user pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#GuildChannel` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#GuildChannel._patch` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#GuildChannel.applyEditPatch` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#GuildChannel.canSend` | method | equivalent | $canSend | Verifica permissões efetivas do bot para enviar no canal atual ou informado. |
| `@fluxerjs/core#GuildChannel.canSendMessage` | method | equivalent | $canSend | Consulta efetiva assíncrona em vez do estado de cache do SDK. |
| `@fluxerjs/core#GuildChannel.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#GuildChannel.createInvite` | method | equivalent | $createInvite | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#GuildChannel.createWebhook` | method | equivalent | $createWebhook | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#GuildChannel.edit` | method | function | $editChannel | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#GuildChannel.fetchInvites` | method | equivalent | $invites, $arrayFilter, $prop | Lista convites do servidor atual com ManageGuild de autor e bot; filtrar channelID seleciona os convites do canal, sem manager SDK. |
| `@fluxerjs/core#GuildChannel.fetchWebhooks` | method | equivalent | $webhooks | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#GuildChannel.guildId` | property | equivalent | $channel, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#GuildChannel.name` | property | equivalent | $channel, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#GuildChannel.parentId` | property | equivalent | $channel, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#GuildChannel.permissionOverwrites` | property | equivalent | $channel | $channel expõe permissionOverwrites no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#GuildChannel.position` | property | equivalent | $channel, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#GuildEmoji` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#GuildEmoji._patch` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#GuildEmoji.animated` | property | equivalent | $emoji, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#GuildEmoji.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#GuildEmoji.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#GuildEmoji.createdAt` | accessor | equivalent | $emoji | O leitor $emoji expõe createdAt pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#GuildEmoji.createdTimestamp` | accessor | equivalent | $emoji | O leitor $emoji expõe createdTimestamp pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#GuildEmoji.delete` | method | function | $deleteEmoji | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#GuildEmoji.edit` | method | function | $editEmoji | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#GuildEmoji.guildId` | property | equivalent | $emoji | O leitor $emoji expõe guildID pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#GuildEmoji.id` | property | equivalent | $emoji, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#GuildEmoji.identifier` | accessor | equivalent | $emoji | O leitor $emoji expõe identifier pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#GuildEmoji.name` | property | equivalent | $emoji, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#GuildEmoji.toString` | method | equivalent | $emoji | O leitor $emoji expõe mention pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#GuildEmoji.url` | accessor | equivalent | $emoji | O leitor $emoji expõe url pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#GuildManager` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#GuildManager.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#GuildManager.delete` | method | excluded | lifecycle | Destruição irreversível do servidor permanece fora da autoridade de scripts; somente o ciclo de vida nativo pode executar essa operação. |
| `@fluxerjs/core#GuildManager.fetch` | method | function | $guild | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#GuildManager.resolve` | method | equivalent | $guild | Resolver servidor por ID através de busca normalizada. |
| `@fluxerjs/core#GuildMember` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#GuildMember._clone` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#GuildMember._patch` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#GuildMember.accentColor` | property | equivalent | $userProfile, $prop | Perfil de servidor/global normalizado por $userProfile; propriedades nullable. |
| `@fluxerjs/core#GuildMember.avatar` | property | equivalent | $member | $member expõe avatar no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#GuildMember.avatarURL` | method | function | $avatar | Avatar por usuário/servidor, sem expor a instância. |
| `@fluxerjs/core#GuildMember.ban` | method | function | $ban | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#GuildMember.bannable` | accessor | equivalent | $member | O leitor $member expõe bannable pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#GuildMember.banner` | property | equivalent | $userProfile, $prop | Perfil de servidor/global normalizado por $userProfile; propriedades nullable. |
| `@fluxerjs/core#GuildMember.bannerURL` | method | function | $userBanner | Banner por usuário/servidor, com retorno nulo quando ausente. |
| `@fluxerjs/core#GuildMember.bio` | property | equivalent | $userProfile, $prop | Perfil de servidor/global normalizado por $userProfile; propriedades nullable. |
| `@fluxerjs/core#GuildMember.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#GuildMember.communicationDisabledUntil` | property | equivalent | $member, $prop | MemberInfo.timedOutUntil contém o timestamp do timeout ou null. |
| `@fluxerjs/core#GuildMember.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#GuildMember.deaf` | property | equivalent | $member | $member expõe deaf no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#GuildMember.displayAvatarURL` | method | function | $avatar | Avatar por usuário/servidor, sem expor a instância. |
| `@fluxerjs/core#GuildMember.displayName` | accessor | equivalent | $member, $prop | MemberInfo.displayName preserva member.displayName, inclusive apelido. |
| `@fluxerjs/core#GuildMember.edit` | method | function | $editMember | Edita apelido e/ou cargos em uma chamada; motivo obrigatório, permissões de autor/bot e hierarquia de membro/cargos antes da API. |
| `@fluxerjs/core#GuildMember.guild` | property | equivalent | $member, $guild | Resolve guildID pelo leitor normalizado e consulta a entidade no contexto atual; sem expor instâncias SDK. |
| `@fluxerjs/core#GuildMember.id` | property | equivalent | $member, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#GuildMember.joinedAt` | property | equivalent | $member, $prop, $date | Derivar data de MemberInfo.joinedTimestamp. |
| `@fluxerjs/core#GuildMember.kick` | method | function | $kick | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#GuildMember.kickable` | accessor | equivalent | $member | O leitor $member expõe kickable pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#GuildMember.mentionFlags` | property | equivalent | $member | $member expõe mentionFlags no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#GuildMember.moderatable` | accessor | equivalent | $member | O leitor $member expõe moderatable pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#GuildMember.move` | method | function | $moveMember | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#GuildMember.mute` | property | function | $muteMember | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#GuildMember.nick` | property | equivalent | $member, $prop | MemberInfo.nickname contém o apelido; null sem apelido. |
| `@fluxerjs/core#GuildMember.partial` | property | equivalent | $member | $member expõe partial no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#GuildMember.permissions` | accessor | equivalent | $member, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#GuildMember.permissionsIn` | method | equivalent | $channelPermsOf | Obtém permissões efetivas do membro no canal do servidor atual. |
| `@fluxerjs/core#GuildMember.profileFlags` | property | equivalent | $member | $member expõe profileFlags no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#GuildMember.pronouns` | property | equivalent | $userProfile, $prop | Perfil de servidor/global normalizado por $userProfile; propriedades nullable. |
| `@fluxerjs/core#GuildMember.roles` | property | equivalent | $member, $prop | MemberInfo.roles é a lista normalizada de IDs; objetos de cargo são resolvidos por $role. |
| `@fluxerjs/core#GuildMember.timeout` | method | function | $timeout | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#GuildMember.toString` | method | equivalent | $mention | Formata a menção pelo ID numérico. |
| `@fluxerjs/core#GuildMember.user` | property | equivalent | $member, $prop, $user | Consultar UserInfo por ID do membro; não expor referência mutável. |
| `@fluxerjs/core#GuildMemberManager` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#GuildMemberManager.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#GuildMemberManager.fetch` | method | function | $member | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#GuildMemberManager.fetchMe` | method | equivalent | $guildMe | Busca o membro do bot no servidor atual pelo port normalizado, sem cache nativo. |
| `@fluxerjs/core#GuildMemberManager.me` | accessor | equivalent | $guildMe | Busca atualizada do membro do bot substitui a referência em cache e oferece whitelist opcional de propriedades. |
| `@fluxerjs/core#GuildMemberManager.resolve` | method | equivalent | $member | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#GuildMemberManager.search` | method | function | $searchMembers | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#GuildMemberRoleManager` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#GuildMemberRoleManager._patch` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#GuildMemberRoleManager.add` | method | function | $addRole | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#GuildMemberRoleManager.cache` | accessor | equivalent | $member, $prop, $roles, $arrayFilter, $arrayIncludes | Copiar IDs de MemberInfo.roles e filtrar os valores normalizados de $roles; não entregar cache mutável. |
| `@fluxerjs/core#GuildMemberRoleManager.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#GuildMemberRoleManager.has` | method | function | $hasRole | Consulta de cargo por serviço autorizado. |
| `@fluxerjs/core#GuildMemberRoleManager.remove` | method | function | $removeRole | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#GuildMemberRoleManager.roleIds` | accessor | equivalent | $member, $prop | MemberInfo.roles é a lista normalizada de IDs; objetos de cargo são resolvidos por $role. |
| `@fluxerjs/core#GuildMemberRoleManager.set` | method | function | $setMemberRoles | Substitui até 100 cargos; array vazio limpa, valida lote, permissões, hierarquia e motivo antes de mutar. |
| `@fluxerjs/core#GuildRoleManager` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#GuildRoleManager.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#GuildRoleManager.everyone` | accessor | equivalent | $roles, $arrayFind, $prop, $eq | Buscar em $roles o cargo cujo id é o guildID. |
| `@fluxerjs/core#GuildSticker` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#GuildSticker._patch` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#GuildSticker.animated` | property | equivalent | $sticker | O leitor $sticker expõe animated pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#GuildSticker.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#GuildSticker.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#GuildSticker.createdAt` | accessor | equivalent | $sticker | O leitor $sticker expõe createdAt pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#GuildSticker.createdTimestamp` | accessor | equivalent | $sticker | O leitor $sticker expõe createdTimestamp pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#GuildSticker.delete` | method | function | $deleteSticker | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#GuildSticker.description` | property | equivalent | $sticker, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#GuildSticker.edit` | method | function | $editSticker | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#GuildSticker.guildId` | property | equivalent | $sticker | O leitor $sticker expõe guildID pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#GuildSticker.id` | property | equivalent | $sticker, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#GuildSticker.name` | property | equivalent | $sticker, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#GuildSticker.nsfw` | property | equivalent | $sticker | O leitor $sticker expõe nsfw pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#GuildSticker.tags` | property | equivalent | $sticker, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#GuildSticker.url` | accessor | equivalent | $sticker | O leitor $sticker expõe url pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Invite` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#Invite.channelSnapshot` | property | equivalent | $inviteInfo | O leitor $inviteInfo expõe channelSnapshot pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Invite.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#Invite.code` | property | equivalent | $invite, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Invite.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#Invite.createdAt` | property | equivalent | $inviteInfo | O leitor $inviteInfo expõe createdAt pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Invite.delete` | method | function | $deleteInvite | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Invite.expiresAt` | property | equivalent | $inviteInfo | O leitor $inviteInfo expõe expiresAt pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Invite.guildSnapshot` | property | equivalent | $inviteInfo | O leitor $inviteInfo expõe guildSnapshot pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Invite.inviter` | property | equivalent | $inviteInfo | O leitor $inviteInfo expõe inviter pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Invite.isGroupDM` | method | equivalent | $inviteInfo | O leitor $inviteInfo expõe isGroupDM pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Invite.isGuild` | method | equivalent | $inviteInfo | O leitor $inviteInfo expõe isGuild pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Invite.maxAge` | property | equivalent | $inviteInfo | O leitor $inviteInfo expõe maxAge pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Invite.maxUses` | property | equivalent | $invite, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Invite.memberCount` | property | equivalent | $inviteInfo | O leitor $inviteInfo expõe memberCount pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Invite.presenceCount` | property | equivalent | $inviteInfo | O leitor $inviteInfo expõe presenceCount pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Invite.resolveChannel` | method | equivalent | $invite, $prop, $channel | channelID do convite resolve por $channel. |
| `@fluxerjs/core#Invite.resolveGuild` | method | equivalent | $invite, $prop, $guild | guildID do convite resolve por $guild. |
| `@fluxerjs/core#Invite.static:fetch` | method | equivalent | $inviteInfo | Busca explícita por código de convite do servidor atual. |
| `@fluxerjs/core#Invite.temporary` | property | equivalent | $inviteInfo | O leitor $inviteInfo expõe temporary pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Invite.type` | property | equivalent | $inviteInfo | O leitor $inviteInfo expõe type pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Invite.url` | accessor | equivalent | $invite, $prop | InviteInfo.url é calculada pelo adaptador. |
| `@fluxerjs/core#Invite.uses` | property | equivalent | $invite, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#LinkChannel` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#LinkChannel.applyEditPatch` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#LinkChannel.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#LinkChannel.url` | property | equivalent | $channel, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#MediaChannel` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#Message` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#Message._patch` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Message._send` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Message.attachments` | property | equivalent | $fetchMessage, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Message.author` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe author pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Message.call` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe call pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Message.channel` | accessor | equivalent | $fetchMessage, $channel | Resolve channelID pelo leitor normalizado e consulta a entidade no contexto atual; sem expor instâncias SDK. |
| `@fluxerjs/core#Message.channelId` | property | equivalent | $fetchMessage, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Message.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#Message.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#Message.content` | property | equivalent | $fetchMessage, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Message.createdAt` | property | equivalent | $fetchMessage, $prop, $date | Derivar data de MessageInfo.createdTimestamp. |
| `@fluxerjs/core#Message.delete` | method | function | $deleteMessage | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Message.deleteAttachment` | method | function | $deleteAttachment | Remove anexo da mensagem local: autoria dispensa ManageMessages apenas para o próprio ator; demais autoridades são verificadas. |
| `@fluxerjs/core#Message.edit` | method | function | $editMessage | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Message.editedAt` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe editedAt pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Message.embeds` | property | equivalent | $fetchMessage, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Message.fetch` | method | equivalent | $fetchMessage | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Message.fetchReactionUsers` | method | equivalent | $reactionUsers | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Message.fetchReactionUsersPage` | method | equivalent | $reactionUsersPage | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Message.flags` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe flags pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Message.guild` | accessor | equivalent | $fetchMessage, $guild | Resolve guildID pelo leitor normalizado e consulta a entidade no contexto atual; sem expor instâncias SDK. |
| `@fluxerjs/core#Message.guildId` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe guildID pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Message.id` | property | equivalent | $fetchMessage, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Message.member` | accessor | equivalent | $fetchMessage, $member | Resolve authorID pelo leitor normalizado e consulta a entidade no contexto atual; sem expor instâncias SDK. |
| `@fluxerjs/core#Message.mentionEveryone` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe mentionEveryone pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Message.mentionRoles` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe mentionRoles pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Message.mentions` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe mentions pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Message.messageReference` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe messageReference pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Message.messageSnapshots` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe messageSnapshots pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Message.nonce` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe nonce pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Message.nsfwEmojis` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe nsfwEmojis pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Message.partial` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe partial pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Message.pin` | method | function | $pin | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Message.pinned` | property | equivalent | $fetchMessage, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Message.react` | method | function | $react | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Message.reactions` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe reactions pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Message.referencedMessage` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe referencedMessage pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Message.removeAllReactions` | method | equivalent | $clearReactions | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Message.removeReaction` | method | equivalent | $removeReaction | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Message.removeReactionEmoji` | method | equivalent | $clearReactions | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Message.reply` | method | function | $reply | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Message.resolveChannel` | method | equivalent | $fetchMessage, $prop, $channel | channelID da mensagem resolve por $channel. |
| `@fluxerjs/core#Message.resolveGuild` | method | equivalent | $fetchMessage, $guild | Resolve guildID pelo leitor normalizado e consulta a entidade no contexto atual; sem expor instâncias SDK. |
| `@fluxerjs/core#Message.send` | method | excluded | raw-transport | Objeto/transporte cru ou introspecção arbitrária pode contornar guards ou revelar estado da sessão. |
| `@fluxerjs/core#Message.sendTo` | method | equivalent | $sendMessage | Envia conteúdo para outro canal por ID, retornando o novo ID sem depender de instância Message; não é encaminhamento implícito. |
| `@fluxerjs/core#Message.startThread` | method | equivalent | $createThread | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#Message.static:_createMessageBody` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Message.static:resolve` | method | equivalent | $fetchMessage | Busca explícita pelo canal e ID em vez de resolução implícita pelo cache. |
| `@fluxerjs/core#Message.stickers` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe stickers pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Message.thread` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe thread pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Message.tts` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe tts pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Message.type` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe type pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Message.unpin` | method | function | $unpin | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Message.webhookId` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe webhookId pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#MessageManager` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#MessageManager.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#MessageManager.fetch` | method | function | $fetchMessage, $messages | Overload por ID via fetchMessage; overload de consulta paginada via messages. |
| `@fluxerjs/core#MessageManager.resolve` | method | equivalent | $fetchMessage | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#MessagePayload` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#MessagePayload.addEmbed` | method | equivalent | $embeds, $addEmbed, $jsonMerge, $reply | Lista de embeds validada composta no payload de envio. |
| `@fluxerjs/core#MessagePayload.data` | property | equivalent | $object, $jsonMerge, $reply | Payload declarativo validado no envio em vez de instância mutável. |
| `@fluxerjs/core#MessagePayload.setAllowedMentions` | method | equivalent | $object, $jsonMerge, $reply | Payload allowedMentions tipado; relaxar menções exige autorização. |
| `@fluxerjs/core#MessagePayload.setAttachments` | method | equivalent | $sendAttachments | Payload declarativo cobre o campo no envio, sem instância mutável do SDK. |
| `@fluxerjs/core#MessagePayload.setContent` | method | equivalent | $object, $reply, $sendMessage | Objeto com content enviado por $reply/$sendMessage; respeita limite e validação. |
| `@fluxerjs/core#MessagePayload.setEmbeds` | method | equivalent | $embeds, $addEmbed, $jsonMerge, $reply | Lista de embeds validada composta no payload de envio. |
| `@fluxerjs/core#MessagePayload.setFlags` | method | equivalent | $messageOptions | Payload declarativo cobre o campo no envio, sem instância mutável do SDK. |
| `@fluxerjs/core#MessagePayload.setReply` | method | equivalent | $reply | Payload declarativo cobre o campo no envio, sem instância mutável do SDK. |
| `@fluxerjs/core#MessagePayload.setTTS` | method | equivalent | $messageOptions | Payload declarativo cobre o campo no envio, sem instância mutável do SDK. |
| `@fluxerjs/core#MessagePayload.static:create` | method | excluded | internal | Fábrica de instância SDK; compor payload declarativo em vez de construir objeto SDK. |
| `@fluxerjs/core#MessagePayload.toJSON` | method | equivalent | $object, $jsonMerge, $reply | Payload declarativo validado no envio em vez de instância mutável. |
| `@fluxerjs/core#MessageReaction` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#MessageReaction._data` | property | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#MessageReaction.channel` | accessor | equivalent | $reactionInfo, $channel | Resolve channelID pelo leitor normalizado e consulta a entidade no contexto atual; sem expor instâncias SDK. |
| `@fluxerjs/core#MessageReaction.channelId` | property | equivalent | $reactionInfo | O leitor $reactionInfo expõe channelID pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#MessageReaction.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#MessageReaction.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#MessageReaction.count` | property | equivalent | $reactionInfo | O leitor $reactionInfo expõe count pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#MessageReaction.emoji` | property | equivalent | $reactionInfo | O leitor $reactionInfo expõe emoji pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#MessageReaction.emojiIdentifier` | accessor | equivalent | $reactionInfo | O leitor $reactionInfo expõe emojiIdentifier pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#MessageReaction.fetchMessage` | method | equivalent | $fetchMessage | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#MessageReaction.guild` | accessor | equivalent | $reactionInfo, $guild | Resolve guildID pelo leitor normalizado e consulta a entidade no contexto atual; sem expor instâncias SDK. |
| `@fluxerjs/core#MessageReaction.guildId` | property | equivalent | $reactionInfo | O leitor $reactionInfo expõe guildID pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#MessageReaction.me` | property | equivalent | $reactionInfo | O leitor $reactionInfo expõe me pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#MessageReaction.message` | accessor | equivalent | $reactionInfo, $fetchMessage | Resolve messageID pelo leitor normalizado e consulta a entidade no contexto atual; sem expor instâncias SDK. |
| `@fluxerjs/core#MessageReaction.messageId` | property | equivalent | $reactionInfo | O leitor $reactionInfo expõe messageID pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#MessageReaction.static:fromMessage` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#MessageReactionManager` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#MessageReactionManager._patch` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#MessageReactionManager.[Symbol.iterator]` | method | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#MessageReactionManager.cache` | accessor | equivalent | $fetchMessage | A propriedade reactions retorna agregados normalizados em JSON, sem expor o cache mutável. |
| `@fluxerjs/core#MessageReactionManager.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#MessageReactionManager.size` | accessor | equivalent | $fetchMessage, $jsonDecode, $arrayLength | Decodifica o JSON da propriedade reactions e conta o array de agregados, sem acessar o cache nativo. |
| `@fluxerjs/core#MessageSticker` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#MessageSticker.animated` | property | equivalent | $fetchMessage | A propriedade stickers contém animated de cada figurinha de mensagem em JSON normalizado. |
| `@fluxerjs/core#MessageSticker.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#MessageSticker.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#MessageSticker.createdAt` | accessor | equivalent | $fetchMessage | A propriedade stickers contém createdAt de cada figurinha de mensagem em JSON normalizado. |
| `@fluxerjs/core#MessageSticker.createdTimestamp` | accessor | equivalent | $fetchMessage | A propriedade stickers contém createdTimestamp de cada figurinha de mensagem em JSON normalizado. |
| `@fluxerjs/core#MessageSticker.description` | property | equivalent | $fetchMessage | A propriedade stickers contém description de cada figurinha de mensagem em JSON normalizado. |
| `@fluxerjs/core#MessageSticker.id` | property | equivalent | $fetchMessage | A propriedade stickers contém id de cada figurinha de mensagem em JSON normalizado. |
| `@fluxerjs/core#MessageSticker.name` | property | equivalent | $fetchMessage | A propriedade stickers contém name de cada figurinha de mensagem em JSON normalizado. |
| `@fluxerjs/core#MessageSticker.tags` | property | equivalent | $fetchMessage | A propriedade stickers contém tags de cada figurinha de mensagem em JSON normalizado. |
| `@fluxerjs/core#MessageSticker.url` | accessor | equivalent | $fetchMessage | A propriedade stickers contém url de cada figurinha de mensagem em JSON normalizado. |
| `@fluxerjs/core#PartialGuildMember` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#PartialGuildMember.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#PartialGuildMember.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#PartialGuildMember.fetch` | method | equivalent | $member | Acesso por builtin ao recurso autorizado correspondente; resolve/fetch usa busca normalizada, não instância SDK. |
| `@fluxerjs/core#PartialGuildMember.guild` | property | equivalent | $member, $guild | Resolve guildID pelo leitor normalizado e consulta a entidade no contexto atual; sem expor instâncias SDK. |
| `@fluxerjs/core#PartialGuildMember.guildId` | property | equivalent | $member | O leitor $member expõe guildID pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#PartialGuildMember.id` | property | equivalent | $member | O leitor $member expõe id pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#PartialGuildMember.partial` | property | equivalent | $member | O leitor $member expõe partial pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#PartialGuildMember.user` | property | equivalent | $member, $user | Resolve id pelo leitor normalizado e consulta a entidade no contexto atual; sem expor instâncias SDK. |
| `@fluxerjs/core#PartialMessage` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#PartialMessage.author` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe author pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#PartialMessage.authorId` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe authorID pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#PartialMessage.channel` | accessor | equivalent | $fetchMessage, $channel | Resolve channelID pelo leitor normalizado e consulta a entidade no contexto atual; sem expor instâncias SDK. |
| `@fluxerjs/core#PartialMessage.channelId` | property | equivalent | $fetchMessage, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#PartialMessage.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#PartialMessage.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#PartialMessage.content` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe content pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#PartialMessage.createdAt` | property | equivalent | $fetchMessage, $date | Formata createdTimestamp da mensagem buscada como ISO. |
| `@fluxerjs/core#PartialMessage.fetch` | method | function | $fetchMessage | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#PartialMessage.guildId` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe guildID pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#PartialMessage.id` | property | equivalent | $fetchMessage, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#PartialMessage.partial` | property | equivalent | $fetchMessage | O leitor $fetchMessage expõe partial pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#PartialMessage.resolveChannel` | method | equivalent | $fetchMessage, $prop, $channel | channelID da mensagem resolve por $channel. |
| `@fluxerjs/core#PermissionOverwrite` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#PermissionOverwrite._allow` | property | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#PermissionOverwrite._deny` | property | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#PermissionOverwrite.allow` | accessor | equivalent | $channel | $channel[canal;permissionOverwrites] lista id, type e bitfields allow/deny como strings, sem identidade SDK. |
| `@fluxerjs/core#PermissionOverwrite.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#PermissionOverwrite.deny` | accessor | equivalent | $channel | $channel[canal;permissionOverwrites] lista id, type e bitfields allow/deny como strings, sem identidade SDK. |
| `@fluxerjs/core#PermissionOverwrite.id` | property | equivalent | $channel | $channel[canal;permissionOverwrites] lista id, type e bitfields allow/deny como strings, sem identidade SDK. |
| `@fluxerjs/core#PermissionOverwrite.toJSON` | method | equivalent | $channel | $channel[canal;permissionOverwrites] lista id, type e bitfields allow/deny como strings, sem identidade SDK. |
| `@fluxerjs/core#PermissionOverwrite.type` | property | equivalent | $channel | $channel[canal;permissionOverwrites] lista id, type e bitfields allow/deny como strings, sem identidade SDK. |
| `@fluxerjs/core#PermissionOverwriteManager` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#PermissionOverwriteManager._patch` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#PermissionOverwriteManager.[Symbol.iterator]` | method | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#PermissionOverwriteManager.cache` | accessor | equivalent | $channel | $channel[canal;permissionOverwrites] lista os overwrites normalizados; composição com JSON obtém tamanho e dados sem expor instâncias SDK. |
| `@fluxerjs/core#PermissionOverwriteManager.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#PermissionOverwriteManager.delete` | method | function | $deleteChannelOverwrite | Remove overwrite local com ManageRoles de autor e bot, hierarquia do alvo e motivo opcional. |
| `@fluxerjs/core#PermissionOverwriteManager.edit` | method | equivalent | $channelPerms | Edição declarativa do overwrite existente pelo recurso autorizado, com permissões e hierarquia de autor/bot. |
| `@fluxerjs/core#PermissionOverwriteManager.size` | accessor | equivalent | $channel | $channel[canal;permissionOverwrites] lista os overwrites normalizados; composição com JSON obtém tamanho e dados sem expor instâncias SDK. |
| `@fluxerjs/core#PermissionOverwriteManager.toJSON` | method | equivalent | $channel | $channel[canal;permissionOverwrites] lista os overwrites normalizados; composição com JSON obtém tamanho e dados sem expor instâncias SDK. |
| `@fluxerjs/core#Role` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#Role._clone` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Role._patch` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Role._permissions` | property | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#Role.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#Role.color` | property | equivalent | $role, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Role.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#Role.createdAt` | accessor | equivalent | $role | O leitor $role expõe createdAt pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Role.createdTimestamp` | accessor | equivalent | $role | O leitor $role expõe createdTimestamp pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Role.delete` | method | function | $deleteRole | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Role.edit` | method | function | $editRole | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Role.guildId` | property | equivalent | $role | O leitor $role expõe guildID pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Role.has` | method | equivalent | $roleHasPermission | Verifica a permissão do cargo no servidor atual, incluindo Administrator. |
| `@fluxerjs/core#Role.hoist` | property | equivalent | $role, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Role.hoistPosition` | property | equivalent | $role, $prop | RoleInfo.hoistPosition preserva posição de destaque normalizada. |
| `@fluxerjs/core#Role.id` | property | equivalent | $role, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Role.mentionable` | property | equivalent | $role, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Role.name` | property | equivalent | $role, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Role.permissions` | accessor | equivalent | $role, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Role.position` | property | equivalent | $role, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Role.toString` | method | equivalent | $mention | Formata a menção pelo ID numérico. |
| `@fluxerjs/core#Role.unicodeEmoji` | property | equivalent | $role, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#TextChannel` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#TextChannel.applyEditPatch` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#TextChannel.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#TextChannel.contentWarningLevel` | property | equivalent | $channel, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#TextChannel.contentWarningText` | property | equivalent | $channel, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#TextChannel.defaultAutoArchiveDuration` | property | equivalent | $channel | $channel expõe defaultAutoArchiveDuration no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#TextChannel.defaultThreadRateLimitPerUser` | property | equivalent | $channel | $channel expõe defaultThreadRateLimitPerUser no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#TextChannel.editThreadDefaults` | method | function | $editThreadDefaults | Edita duração de arquivamento e modo lento padrão com validação completa e ManageChannels de autor e bot. |
| `@fluxerjs/core#TextChannel.lastMessageId` | property | equivalent | $channel | $channel expõe lastMessageId no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#TextChannel.nsfw` | property | equivalent | $channel, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#TextChannel.nsfwOverride` | property | equivalent | $channel | $channel expõe nsfwOverride no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#TextChannel.rateLimitPerUser` | property | equivalent | $channel, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#TextChannel.setSlowmode` | method | function | $slowmode | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#TextChannel.threads` | accessor | equivalent | $searchThreads, $archivedThreads, $createThread | Operações normalizadas de busca, paginação de arquivadas e criação substituem o manager; joined lista arquivadas privadas já associadas. |
| `@fluxerjs/core#TextChannel.topic` | property | equivalent | $channel, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#ThreadChannel` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#ThreadChannel._patch` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#ThreadChannel.appliedTags` | property | equivalent | $threadInfo | $threadInfo[propriedade;thread] consulta a thread do servidor atual; arrays/objetos são JSON e null é vazio. |
| `@fluxerjs/core#ThreadChannel.archived` | property | equivalent | $searchThreads, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#ThreadChannel.archiveTimestamp` | property | equivalent | $threadInfo | $threadInfo[propriedade;thread] consulta a thread do servidor atual; arrays/objetos são JSON e null é vazio. |
| `@fluxerjs/core#ThreadChannel.autoArchiveDuration` | property | equivalent | $threadInfo | $threadInfo[propriedade;thread] consulta a thread do servidor atual; arrays/objetos são JSON e null é vazio. |
| `@fluxerjs/core#ThreadChannel.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#ThreadChannel.edit` | method | function | $editThread | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#ThreadChannel.editSelf` | method | function | $editThreadSelf | Edita somente associação do bot, validando flags e muteConfig e exigindo ViewChannel de autor e bot. |
| `@fluxerjs/core#ThreadChannel.flags` | property | equivalent | $threadInfo | $threadInfo[propriedade;thread] consulta a thread do servidor atual; arrays/objetos são JSON e null é vazio. |
| `@fluxerjs/core#ThreadChannel.invitable` | property | equivalent | $threadInfo | $threadInfo[propriedade;thread] consulta a thread do servidor atual; arrays/objetos são JSON e null é vazio. |
| `@fluxerjs/core#ThreadChannel.join` | method | function | $joinThread | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#ThreadChannel.lastMessageId` | property | equivalent | $threadInfo | $threadInfo[propriedade;thread] consulta a thread do servidor atual; arrays/objetos são JSON e null é vazio. |
| `@fluxerjs/core#ThreadChannel.leave` | method | function | $leaveThread | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#ThreadChannel.locked` | property | equivalent | $searchThreads, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#ThreadChannel.member` | property | equivalent | $threadInfo | $threadInfo[propriedade;thread] consulta a thread do servidor atual; arrays/objetos são JSON e null é vazio. |
| `@fluxerjs/core#ThreadChannel.memberCount` | property | equivalent | $threadInfo | $threadInfo[propriedade;thread] consulta a thread do servidor atual; arrays/objetos são JSON e null é vazio. |
| `@fluxerjs/core#ThreadChannel.members` | property | equivalent | $threadMembers, $threadMember | Lista paginada e busca de associações normalizadas substituem manager e cache de membros da thread. |
| `@fluxerjs/core#ThreadChannel.messageCount` | property | equivalent | $searchThreads, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#ThreadChannel.ownerId` | property | equivalent | $searchThreads, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#ThreadChannel.parentId` | property | equivalent | $searchThreads, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#ThreadChannel.rateLimitPerUser` | property | equivalent | $threadInfo | $threadInfo[propriedade;thread] consulta a thread do servidor atual; arrays/objetos são JSON e null é vazio. |
| `@fluxerjs/core#ThreadChannel.setArchived` | method | function | $archiveThread | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#ThreadChannel.setLocked` | method | function | $editThread | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#ThreadChannel.totalMessageSent` | property | equivalent | $threadInfo | $threadInfo[propriedade;thread] consulta a thread do servidor atual; arrays/objetos são JSON e null é vazio. |
| `@fluxerjs/core#ThreadManager` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#ThreadManager.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#ThreadManager.create` | method | function | $createThread | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#ThreadManager.createPost` | method | function | $forumPost | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#ThreadManager.editDefaults` | method | function | $editThreadDefaults | Configura padrões da thread pelo canal pai atual, validando opções e ManageChannels de autor e bot. |
| `@fluxerjs/core#ThreadManager.fetchArchived` | method | function | $archivedThreads | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#ThreadManager.fetchJoinedPrivateArchived` | method | function | $archivedThreads | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#ThreadManager.search` | method | function | $searchThreads | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#ThreadMember` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#ThreadMember.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#ThreadMember.flags` | property | equivalent | $threadMember, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#ThreadMember.id` | property | equivalent | $threadMember, $prop | O ID da thread é threadID no membro normalizado; $prop seleciona esse campo sem entidade SDK. |
| `@fluxerjs/core#ThreadMember.joinedAt` | property | equivalent | $threadMember, $prop, $date | Derivar data de ThreadMemberDetails.joinedTimestamp. |
| `@fluxerjs/core#ThreadMember.muted` | property | equivalent | $threadMember, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#ThreadMember.muteEndTime` | property | equivalent | $threadMember, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#ThreadMember.muteWindow` | property | equivalent | $threadMember, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#ThreadMember.userId` | property | equivalent | $threadMember, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#ThreadMemberManager` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#ThreadMemberManager.add` | method | function | $addThreadMember | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#ThreadMemberManager.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#ThreadMemberManager.fetch` | method | function | $threadMembers | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#ThreadMemberManager.fetchOne` | method | function | $threadMember | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#ThreadMemberManager.remove` | method | function | $removeThreadMember | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#User` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#User._patch` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#User.avatar` | property | equivalent | $user | $user expõe avatar no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#User.avatarColor` | property | equivalent | $user | $user expõe avatarColor no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#User.avatarURL` | method | function | $avatar | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#User.banner` | property | equivalent | $user | $user expõe banner no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#User.bannerURL` | method | function | $userBanner | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#User.bot` | property | equivalent | $user, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#User.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#User.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#User.createdAt` | accessor | equivalent | $user, $prop, $date | Derivar data de UserInfo.createdTimestamp. |
| `@fluxerjs/core#User.createDM` | method | function | $createDM | Abre DM com usuário por ID e retorna canal normalizado, sem enviar mensagem. |
| `@fluxerjs/core#User.createdTimestamp` | accessor | equivalent | $user, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#User.discriminator` | property | equivalent | $user | $user expõe discriminator no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#User.displayAvatarURL` | method | function | $avatar | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#User.flags` | property | equivalent | $user | $user expõe flags no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#User.globalName` | property | equivalent | $user | $user expõe globalName no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#User.id` | property | equivalent | $user, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#User.send` | method | function | $dm | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#User.system` | property | equivalent | $user | $user expõe system no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#User.toString` | method | equivalent | $mention | Formata a menção pelo ID numérico. |
| `@fluxerjs/core#User.username` | property | equivalent | $user, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#UserManager` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#UserManager.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#UserManager.fetch` | method | function | $user | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#UserManager.fetchWithProfile` | method | function | $userProfile | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#UserManager.resolve` | method | equivalent | $user | Resolver usuário por ID através de busca normalizada. |
| `@fluxerjs/core#UserManager.sweep` | method | excluded | internal | Manutenção do cache de usuários é responsabilidade interna do SDK, sem semântica pública de entidade para scripts. |
| `@fluxerjs/core#VoiceChannel` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#VoiceChannel.applyEditPatch` | method | excluded | internal | Helper interno, backing state ou patch de sessão; usar a operação pública autorizada. |
| `@fluxerjs/core#VoiceChannel.bitrate` | property | equivalent | $channel | $channel expõe bitrate no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#VoiceChannel.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#VoiceChannel.contentWarningLevel` | property | equivalent | $channel, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#VoiceChannel.contentWarningText` | property | equivalent | $channel, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#VoiceChannel.guildId` | property | equivalent | $channel, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#VoiceChannel.lastMessageId` | property | equivalent | $channel | $channel expõe lastMessageId no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#VoiceChannel.nsfw` | property | equivalent | $channel, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#VoiceChannel.nsfwOverride` | property | equivalent | $channel | $channel expõe nsfwOverride no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#VoiceChannel.rateLimitPerUser` | property | equivalent | $channel, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#VoiceChannel.rtcRegion` | property | equivalent | $channel | $channel expõe rtcRegion no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#VoiceChannel.setSlowmode` | method | function | $slowmode | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#VoiceChannel.topic` | property | equivalent | $channel, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#VoiceChannel.userLimit` | property | equivalent | $channel | $channel expõe userLimit no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#VoiceChannel.voiceConnectionLimit` | property | equivalent | $channel | $channel expõe voiceConnectionLimit no objeto normalizado e na leitura por propriedade; objetos/arrays são JSON, null é vazio. |
| `@fluxerjs/core#Webhook` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/core#Webhook.avatar` | property | equivalent | $webhookInfo | O leitor $webhookInfo expõe avatar pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Webhook.avatarURL` | method | equivalent | $webhookInfo | O leitor $webhookInfo expõe avatarURL pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Webhook.channelId` | property | equivalent | $webhooks, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Webhook.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/core#Webhook.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/core#Webhook.createdAt` | accessor | equivalent | $webhookInfo | O leitor $webhookInfo expõe createdAt pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Webhook.createdTimestamp` | accessor | equivalent | $webhookInfo | O leitor $webhookInfo expõe createdTimestamp pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Webhook.delete` | method | function | $deleteWebhook | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Webhook.edit` | method | function | $editWebhook | Operação por builtin e recurso/serviço compartilhado; ver contrato de argumentos na referência. |
| `@fluxerjs/core#Webhook.guildId` | property | equivalent | $webhooks, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Webhook.id` | property | equivalent | $webhooks, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Webhook.name` | property | equivalent | $webhooks, $prop | Valor normalizado pelo recurso da entidade; $prop seleciona o campo (IDs usam sufixo ID). |
| `@fluxerjs/core#Webhook.send` | method | excluded | credentials | O builtin sendWebhook exige token de webhook; este caminho com segredo no script não conta como operação segura. Envio sem segredo requer fachada nativa. |
| `@fluxerjs/core#Webhook.static:fetch` | method | equivalent | $webhookInfo | Busca explícita por ID, com ManageWebhooks de autor e bot e sem token. |
| `@fluxerjs/core#Webhook.static:fromToken` | method | excluded | credentials | Credenciais, segredo ou sessão autenticada não são expostos a scripts. |
| `@fluxerjs/core#Webhook.token` | property | excluded | credentials | Credenciais, segredo ou sessão autenticada não são expostos a scripts. |
| `@fluxerjs/core#Webhook.type` | property | equivalent | $webhookInfo | O leitor $webhookInfo expõe type pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |
| `@fluxerjs/core#Webhook.user` | property | equivalent | $webhookInfo | O leitor $webhookInfo expõe user pelo contrato normalizado; objetos e arrays novos são JSON, ausências são vazias. |

## events

| ID | Tipo | Status | Funções / exclusão | Justificativa |
|---|---|---|---|---|
| `@fluxerjs/core#ClientEvents` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/core#ClientEvents:channelCreate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:channelDelete` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:channelMemberCountsUpdate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:channelPinsUpdate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:channelRecipientAdd` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:channelRecipientRemove` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:channelUpdate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:debug` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:entranceSoundPlay` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:error` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:forumUnreads` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:guildAuditLogEntryCreate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:guildAvailable` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:guildBanAdd` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:guildBanRemove` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:guildCountsUpdate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:guildCreate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:guildDelete` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:guildEmojisUpdate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:guildMemberAdd` | event | function | $eventName | scriptEvent adapta este evento; $eventName e os seletores $event* leem seu contexto. |
| `@fluxerjs/core#ClientEvents:guildMemberRemove` | event | function | $eventName | scriptEvent adapta este evento; $eventName e os seletores $event* leem seu contexto. |
| `@fluxerjs/core#ClientEvents:guildMembersChunk` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:guildMemberUpdate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:guildRoleCreate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:guildRoleDelete` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:guildRoleUpdate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:guildStickersUpdate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:guildUnavailable` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:guildUpdate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:inviteCreate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:inviteDelete` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:messageCreate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:messageDelete` | event | function | $eventName | scriptEvent adapta este evento; $eventName e os seletores $event* leem seu contexto. |
| `@fluxerjs/core#ClientEvents:messageDeleteBulk` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:messageReactionAdd` | event | function | $eventName | scriptEvent adapta este evento; $eventName e os seletores $event* leem seu contexto. |
| `@fluxerjs/core#ClientEvents:messageReactionAddMany` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:messageReactionRemove` | event | function | $eventName | scriptEvent adapta este evento; $eventName e os seletores $event* leem seu contexto. |
| `@fluxerjs/core#ClientEvents:messageReactionRemoveAll` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:messageReactionRemoveEmoji` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:messageUpdate` | event | function | $eventName | scriptEvent adapta este evento; $eventName e os seletores $event* leem seu contexto. |
| `@fluxerjs/core#ClientEvents:presenceUpdate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:presenceUpdateBulk` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:ready` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:resumed` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:shardDisconnect` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:shardError` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:shardingRequired` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:shardReady` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:shardReconnecting` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:shardResumed` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:threadCreate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:threadDelete` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:threadListSync` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:threadMemberListUpdate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:threadMembersUpdate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:threadMemberUpdate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:threadUpdate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:typingStart` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:userConnectionsUpdate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:userUpdate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:voiceServerUpdate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:voiceStateAck` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:voiceStatesSync` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:voiceStateUpdate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |
| `@fluxerjs/core#ClientEvents:webauthnCredentialsUpdate` | event | excluded | credentials | Evento contém material de autenticação WebAuthn; não deve ser encaminhado a scripts. |
| `@fluxerjs/core#ClientEvents:webhooksUpdate` | event | pending |  | Falta adaptação de payload, ator e contexto de evento para script. |

## voice

| ID | Tipo | Status | Funções / exclusão | Justificativa |
|---|---|---|---|---|
| `@fluxerjs/voice#getVoiceManager` | function | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#joinVoiceChannel` | function | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitAudioFrame` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/voice#LiveKitReceiveSubscription` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/voice#LiveKitRtcConnection` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/voice#LiveKitRtcConnection.channel` | property | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnection.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/voice#LiveKitRtcConnection.connect` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/voice#LiveKitRtcConnection.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/voice#LiveKitRtcConnection.destroy` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/voice#LiveKitRtcConnection.disconnect` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnection.getVolume` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnection.guildId` | property | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnection.isConnected` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnection.isSameServer` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnection.play` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnection.playing` | accessor | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnection.playingVideo` | accessor | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnection.playOpus` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnection.playVideo` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnection.setVolume` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnection.stop` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnection.stopVideo` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnection.subscribeParticipantAudio` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnectionEvents` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/voice#LiveKitRtcConnectionEvents:audioFrame` | event | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnectionEvents:disconnect` | event | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnectionEvents:error` | event | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnectionEvents:ready` | event | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnectionEvents:requestVoiceStateSync` | event | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnectionEvents:serverLeave` | event | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnectionEvents:speakerStart` | event | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#LiveKitRtcConnectionEvents:speakerStop` | event | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#VideoPlayOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/voice#VoiceConnection` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/voice#VoiceConnection.channel` | property | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#VoiceConnection.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/voice#VoiceConnection.connect` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/voice#VoiceConnection.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/voice#VoiceConnection.destroy` | method | excluded | lifecycle | Ciclo de vida, emissão ou coordenação de processos é controlado pela configuração nativa, não por scripts. |
| `@fluxerjs/voice#VoiceConnection.disconnect` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#VoiceConnection.guildId` | property | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#VoiceConnection.play` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#VoiceConnection.playing` | accessor | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#VoiceConnection.playOpus` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#VoiceConnection.sessionId` | accessor | excluded | credentials | Credenciais, segredo ou sessão autenticada não são expostos a scripts. |
| `@fluxerjs/voice#VoiceConnection.stop` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#VoiceConnectionEvents` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/voice#VoiceConnectionEvents:disconnect` | event | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#VoiceConnectionEvents:error` | event | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#VoiceConnectionEvents:ready` | event | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#VoiceConnectionLike` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/voice#VoiceManager` | class | excluded | data-only | Identidade da classe não é operação de script; membros são classificados separadamente, sem construir instâncias SDK. |
| `@fluxerjs/voice#VoiceManager.client` | property | excluded | raw-transport | Referência ao client/transporte SDK não é valor de script; usar recursos autorizados. |
| `@fluxerjs/voice#VoiceManager.constructor` | constructor | excluded | internal | Construção/iteração de instâncias SDK pertence ao adaptador nativo; scripts recebem valores normalizados. |
| `@fluxerjs/voice#VoiceManager.getConnection` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#VoiceManager.getVoiceChannelId` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#VoiceManager.join` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#VoiceManager.leave` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#VoiceManager.leaveChannel` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#VoiceManager.listParticipantsInChannel` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#VoiceManager.subscribeChannelParticipants` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#VoiceManager.updateVoiceState` | method | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#VoiceManager.voiceStates` | property | pending |  | Falta contrato declarativo de voz/música com limites, cancelamento e política de mídia. |
| `@fluxerjs/voice#VoiceManagerOptions` | interface | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
| `@fluxerjs/voice#VoiceStateMap` | type | excluded | data-only | Contrato de tipos apagado em JavaScript; operações e eventos têm entradas próprias. |
