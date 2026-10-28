# Funções que ainda faltam

Inventário da versão **0.1.8**, comparando o registro executável do Yuzuha com os
tipos públicos de **@fluxerjs/core 3.3.0**, fixado no lockfile. O inventário tem
**310 funções canônicas**; aliases não aumentam esse número.

Este documento distingue funções existentes, wrappers ainda ausentes e recursos
acessíveis pelo SDK em JavaScript/TypeScript. Os nomes na coluna “Propostas” são
ideias de API: **não estão registrados e não podem ser usados em scripts**.

## Cobertura atual

O function mode tem 310 funções canônicas, 22 a mais que na 0.1.6. O SDK continua
disponível em JS/TS, com recursos injetáveis e testáveis offline.
Esta tabela é um mapa dos recursos entregues pelo Yuzuha e das APIs nativas
disponíveis para escrever novos comandos.

| Área | Funções | Cobertura |
|---|---|---|
| Usuários e servidor | `$user`, `$member`, `$members`, `$memberCount`, `$avatar`, `$displayName`, `$guild`, `$guildIcon`, `$guildBanner`, `$bans`, `$auditLogs`, `$setPresence`, `$setStatus`, `$setActivity` | Leitura de usuário, membro, servidor, banimentos, auditoria e presença |
| Cargos | `$role`, `$roles`, `$hasRole`, `$addRole`, `$removeRole`, `$createRole`, `$editRole`, `$deleteRole`, `$moveRole` | Resolução por nome, ID ou menção, mutações e posição |
| Canais | `$channel`, `$channels`, `$createChannel`, `$editChannel`, `$deleteChannel`, `$channelPerms`, `$channelPermsOf`, `$slowmode`, `$moveChannel`, `$setCategory` | Criação, edição, exclusão, posição, categoria, overwrites e permissões efetivas |
| Mensagens | `$fetchMessage`, `$messages`, `$pin`, `$unpin`, `$pinnedMessages`, `$pinnedMessagesPage`, `$searchMessagesAdvanced`, `$sendFiles`, `$removeReaction`, `$clearReactions`, `$reactionUsers`, `$reactionUsersPage` | Histórico, páginas de fixadas por timestamp, busca com filtros do SDK, anexos por URL e reações com metadados de paginação |
| Coletores | `$awaitMessage`, `$awaitReaction`, `$confirm` | Espera com timeout, filtro por autor e múltiplos emojis |
| Servidor e convites | `$invite`, `$createInvite`, `$deleteInvite` | Convite por código/URL e criação com duração |
| Webhooks | `$webhooks`, `$createWebhook`, `$sendWebhook`, `$editWebhook`, `$deleteWebhook` | CRUD e envio com ou sem token |
| Emojis e stickers | `$emoji`, `$emojis`, `$createEmoji`, `$editEmoji`, `$deleteEmoji`, `$sticker`, `$stickers`, `$createSticker`, `$editSticker`, `$deleteSticker` | Resolução por nome, ID ou menção e mutações; emoji por URL com download validado, sticker por base64 |
| Threads e fóruns | `$createThread`, `$archiveThread`, `$unarchiveThread`, `$forumPost`, `$addThreadMember`, `$removeThreadMember`, `$threadMembers`, `$threadMember` | Threads de canal, posts de fórum/mídia, membros com paginação e consulta individual com estado de mute |
| JSON e objetos | `$object`, `$jsonEncode`, `$jsonDecode`, `$jsonGet`, `$jsonSet`, `$jsonDelete`, `$jsonMerge`, `$jsonKeys`, `$jsonValues`, `$jsonEntries`, `$hasProp` | Construção, serialização, navegação por propriedades próprias, mesclagem e remoção por caminho |
| Arrays | `$array`, `$arrayPush`, `$arrayGet`, `$arrayLength`, `$arraySlice`, `$arrayIncludes`, `$arrayIndexOf`, `$arrayJoin`, `$arraySort`, `$arrayReverse`, `$arrayUnique`, `$arrayConcat`, `$arrayFlat`, `$arrayChunk`, `$range`, `$paginate` | Construção, consulta, composição, ordenação e paginação |
| Callbacks de arrays | `$arrayMap`, `$arrayFilter`, `$arraySome`, `$arrayEvery`, `$arrayFind`, `$arrayReduce`, `$arraySortBy` | Expressões reavaliadas por item, curto-circuito e chaves estáveis, sem compilar dados como código |
| Texto | `$split`, `$sliceText`, `$includes`, `$startsWith`, `$endsWith`, `$padStart`, `$padEnd`, `$repeatText`, `$truncate`, `$escapeMarkdown`, `$mention` | Operações sem regex e formatação de menções |
| Números e datas | `$round`, `$floor`, `$ceil`, `$abs`, `$clamp`, `$fixed`, `$formatNumber`, `$date`, `$relativeTime`, `$parseDate` | Formatação, arredondamento e datas localizadas |
| Loops | `$repeat`, `$forEach`, `$loopIndex`, `$loopValue`, `$loopAccumulator` | Corpo reavaliado por iteração, com limite de 1000 e verificação incremental de saída |
| Estado composto | `$incrementVar`, `$pushVar`, `$pullVar`, `$setVarPath` e variantes `GuildVar`/`UserVar`, `$caseList`, `$caseCount` | Atualizações atômicas, caminho em objetos persistentes e consulta paginada de casos |
| Agendamentos | `$schedule`, `$scheduleEvery`, `$unschedule`, `$schedules` | Tarefas persistentes, repetíveis e recuperáveis |
| HTTP | `$http`, `$httpJson`, `$httpMultipart` | Requisições, upload multipart, timeout, limites e políticas de rede |

Assinaturas e aliases estão na [referência gerada](FUNCTIONS.md). Consulte o
contrato do Yuzuha para conferir argumentos, retorno e limites de cada chamada.

## Cobertura adicional da 0.1.2

| Área | Funções entregues | Contrato |
|---|---|---|
| Mensagens | `$dm`, `$forward`, `$searchMessages`; cursores em `$messages` | IDs de envio, buscas com índice/cursor e histórico paginado |
| Membros | `$searchMembers`, `$nickname` | Busca por nome e mutação com autorização compartilhada em `ctx.members` |
| Servidor | `$editGuild`, `$invites`, `$vanity`, `$setVanity` | Edição por objeto e convites; mutações com guards |
| Threads | `$editThread`, `$joinThread`, `$leaveThread`, `$searchThreads` | Edição, associação do bot e busca com indexação/paginação |
| Expressões | `$cloneEmoji`, `$cloneSticker` | Clonagem para o servidor atual |
| Anexos | `$fileBase64`, `$sendFileBase64`, `$sendAttachments` | Bytes/base64, URLs e múltiplos anexos em uma mensagem |
| Tarefas | `$editSchedule`, `$pauseSchedule`, `$resumeSchedule` | Autor/servidor, edição, pausa/retomada e retry configurável |
| Ferramentas | Extensão VS Code, `yuzuha/tooling`, `doctor` e benchmarks | Metadados gerados, diagnóstico offline e medições reproduzíveis |

`ctx.data.transaction` é uma API nativa para operações síncronas entre várias
chaves. `$dataTransaction` recebe operações declarativas; não executa callbacks
assíncronos dentro do store. A extensão cobre as 310 funções internas.

## Cobertura adicional da 0.1.3

| Área | Funções entregues | Contrato |
|---|---|---|
| Moderação de voz | `$moveMember`, `$muteMember`, `$deafenMember` e variantes `mod*` | Autor/bot, hierarquia, motivo e casos/falhas parciais compartilhados com `ctx.mod` |
| Threads | `$activeThreads`, `$archivedThreads` | Membros e cursores para arquivos públicos, privados e privados associados |
| Canais | `$createLinkChannel`, `$editLinkChannel`, `$setContentWarning` | URL HTTP(S), nível de aviso e autorização de autor/bot |
| Usuários | `$userProfile`, `$guildCounts`, `$channelCounts` | Perfis normalizados e eventos de contagem filtrados com timeout/cancelamento |
| Dados | `$ttlVar`, `$expireVar` e variantes guild/user; `$dataTransaction` | TTL e até 100 operações atômicas entre chaves/escopos |
| Tarefas | `$scheduleHistory`, `$failedSchedules`, `$retrySchedule` | Histórico limitado, acesso por autor/servidor e reexecução operacional explícita |
| Ferramentas | Diagnósticos, catálogos de plugins, logs e benchmarks comparativos | Análise offline, correlação e cargas/memória maiores |

## Cobertura adicional da 0.1.4

| Área | Funções entregues | Contrato |
|---|---|---|
| Mensagens | `$preloadMessages` | Última mensagem por canal; array de 1 a 100 IDs, com entradas ausentes normalizadas como null |
| Expressões | `$createEmojisBulk` | 1 a 50 objetos name/image base64, até 10 MB; success/failed preservam falhas parciais |
| Autorização | Cargos, canais e webhooks em `ctx.resources` | Guards de autor/bot compartilhados entre nativo e script, servidor, permissões locais e hierarquia; token de webhook não contorna a política |
| Eventos | `$eventName`, `$eventUserID`, `$eventGuildID`, `$eventChannelID`, `$eventMessageID`, `$eventContent`, `$eventOldContent`, `$eventEmoji` | Seis eventos de SDK, ausências null, metadados imutáveis, ator explícito e cancelamento; veja [EVENTS.md](EVENTS.md) |
| Arrays | `$arrayUnion`, `$arrayIntersection`, `$arrayDifference` | Operações de conjuntos preservando ordem e igualdade profunda |
| Números | `$formatBytes`, `$percent`, `$toBase`, `$fromBase` | Bytes SI/IEC, percentuais e conversão exata de inteiros em bases 2–36 |
| Agendamentos | `$scheduleCron` | Cron de cinco campos em fuso IANA, missedRun e retryJitter; veja [SCHEDULER.md](SCHEDULER.md) |
| HTTP | `$httpMultipart`; `HttpService.stream`/`withPolicy` nativos | Upload limitado, streaming cancelável e políticas restritivas por comando; veja [HTTP.md](HTTP.md) |
| Ferramentas e estado | `lint`, catálogos JSON, cenários offline e `StateMaintenance` | Diagnósticos sem importar módulos; estatísticas, limpeza limitada, backup e restauração simulável; veja [STORAGE.md](STORAGE.md) |

## Cobertura adicional da 0.1.7

- `$guildFeatures` copia os recursos habilitados do servidor; `$leaveGuild` exige
  o dono do servidor e contexto de servidor.
- `$while`, `$break` e `$continue` oferecem controle limitado de loops, com
  restauração de estado e propagação dos erros protegidos.
- `$arraySortWith`, `$sortLeft` e `$sortRight` permitem comparadores estáveis.
- `$regexTest`, `$regexMatch` e `$regexReplace` executam em workers com prazo,
  cancelamento e limites de entrada, saída e concorrência.
- `$decimal`, `$decimalCompare` e `$decimalRound` usam BigInt para operações
  decimais em texto, com precisão e arredondamento explícitos.

- `$queryVars` e `ctx.data.*.query` oferecem páginas por prefixo com TTL. SQLite
  usa índice derivado; o snapshot de escrita ainda é integral.
- `$httpStream`, `$httpChunk` e `$httpChunkIndex` processam trechos UTF-8 sem
  carregar a resposta inteira e preservam política HTTP e cancelamento.
- Agendamentos têm prioridade e capacidade compartilhada por claims SQLite;
  veja os requisitos de configuração no [guia](SCHEDULER.md).

- `yuzuha/images` transforma PNG/JPEG/WebP por processos isolados com Sharp opcional.
  `ctx.sendStream` recebe anexos por stream com limite, acumulando antes do upload
  exigido pelo SDK. Veja [IMAGES.md](IMAGES.md).

Veja contratos e exemplos no [guia de operações de dados](LANGUAGE-EXTENSIONS.md).

## Wrappers ainda ausentes

| Prioridade | Área | Propostas de funções | Alternativa nativa disponível |
|---|---|---|---|
| Baixa | Componentes | `$button`, `$select`, `$modal` | Dependem de API equivalente no Fluxer |

As prioridades expressam ordem sugerida, sem data prometida. Métodos do SDK usam
os tipos e permissões do Fluxer; mutações diretas não passam pelos guards, casos
de moderação ou transporte mock do Yuzuha automaticamente.

## Lacunas da própria linguagem

Estas funções precisam de comportamento e limites próprios. Não são apenas
nomes novos para métodos do SDK.

| Área | O que existe | O que falta desenhar e implementar |
|---|---|---|
| Persistência | TTL, transações, consulta por prefixo/cursor e índice SQLite por escopo/sujeito/nome | Índices por propriedades dos valores e escritas que não reserializem o snapshot inteiro |


| Binários | URL, bytes, base64, entrada por stream limitada e módulo opcional de imagens | Upload contínuo pela rede sem acumular bytes; o SDK atual não aceita esse contrato |

Não há `$eval` de JavaScript nem reinterpretação de texto de usuário como código.
Funções JS/TS próprias podem ser registradas explicitamente. Para operações
complexas, use o [guia nativo](NATIVE.md).

## Limites de escopo do Yuzuha

- Comandos de aplicação, botões, selects e modais ainda não são contratos do
  Yuzuha. Exigem suporte e APIs no Fluxer antes de qualquer implementação.
- Voz e sharding têm pacotes separados no ecossistema Fluxer.js. A 0.1.6 integra
  voz oficial opcional e controle Lavalink em `yuzuha/music`, sem wrappers de
  reprodução em scripts. O core aceita configuração de shards via clientOptions;
  gerência de processos exige `@fluxerjs/sharding`, não incluído no pacote.
  Veja a [auditoria de integrações](INTEGRATIONS.md).
- Economia, XP, rankings e tickets são sistemas de produto. Ter variáveis,
  moderação ou acesso ao SDK não significa que esses sistemas já estejam prontos.
- LSP e migração automática de scripts de outros runtimes ainda não são ferramentas entregues.
  Autocomplete, hover, assinatura e diagnósticos estão na extensão VS Code incluída.

A cobertura verificável usa o registro executável do Yuzuha e os tipos da
dependência instalada. Não mede compatibilidade com catálogos de outros runtimes.

## Como fechar uma lacuna

1. Confirmar o recurso no SDK e no Fluxer alvo, inclusive tipos de canal e permissões.
2. Definir argumentos, retorno tipado, resolução de IDs, erros e comportamento em DM.
3. Para ações com efeitos, prever falhas parciais, repetição e limites do runtime.
4. Implementar o serviço/port necessário; compartilhar a regra com a API nativa.
5. Cobrir com testes offline significativos e regenerar a referência de funções.
6. Registrar separadamente a validação real em servidor autorizado.

## Evidências

O inventário vem de `src/scripting/builtins/` e [FUNCTIONS.md](FUNCTIONS.md).
Os recursos nativos foram conferidos nas declarações distribuídas em
`node_modules/@fluxerjs/core/dist/index.d.ts` e nos arquivos `.d.ts` reexportados
por ela, incluindo `Guild`, `GuildMember`, `Channel`, `Message`, `Webhook` e
`ClientUser`.

Fontes primárias externas: [código do Fluxer.js](https://github.com/fluxerjs/core)
e [documentação Fluxer.js](https://fluxer.js.org).
