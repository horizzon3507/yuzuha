# Funções que ainda faltam

Auditoria da versão **0.1.4**, comparando o registro executável do Yuzuha com os
tipos públicos de **@fluxerjs/core 3.3.0**, fixado no lockfile. O inventário tem
**288 funções canônicas**; aliases não aumentam esse número.

Este documento distingue funções existentes, wrappers ainda ausentes e recursos
acessíveis pelo SDK em JavaScript/TypeScript. Os nomes na coluna “Propostas” são
ideias de API: **não estão registrados e não podem ser usados em scripts**.

## Cobertura atual

O function mode tem 288 funções canônicas, 19 a mais que na 0.1.3. O SDK continua
disponível em JS/TS, com recursos injetáveis e testáveis offline.
Esta tabela é um mapa do que existe hoje; não é uma promessa de paridade com
ForgeScript.

| Área | Funções | Cobertura |
|---|---|---|
| Usuários e servidor | `$user`, `$member`, `$members`, `$memberCount`, `$avatar`, `$displayName`, `$guild`, `$guildIcon`, `$guildBanner`, `$bans`, `$auditLogs`, `$setPresence`, `$setStatus`, `$setActivity` | Leitura de usuário, membro, servidor, banimentos, auditoria e presença |
| Cargos | `$role`, `$roles`, `$hasRole`, `$addRole`, `$removeRole`, `$createRole`, `$editRole`, `$deleteRole`, `$moveRole` | Resolução por nome, ID ou menção, mutações e posição |
| Canais | `$channel`, `$channels`, `$createChannel`, `$editChannel`, `$deleteChannel`, `$channelPerms`, `$channelPermsOf`, `$slowmode`, `$moveChannel`, `$setCategory` | Criação, edição, exclusão, posição, categoria, overwrites e permissões efetivas |
| Mensagens | `$fetchMessage`, `$messages`, `$pin`, `$unpin`, `$pinnedMessages`, `$sendFiles`, `$removeReaction`, `$clearReactions`, `$reactionUsers` | Histórico, fixados, anexos por URL e reações com paginação |
| Coletores | `$awaitMessage`, `$awaitReaction`, `$confirm` | Espera com timeout, filtro por autor e múltiplos emojis |
| Servidor e convites | `$invite`, `$createInvite`, `$deleteInvite` | Convite por código/URL e criação com duração |
| Webhooks | `$webhooks`, `$createWebhook`, `$sendWebhook`, `$editWebhook`, `$deleteWebhook` | CRUD e envio com ou sem token |
| Emojis e stickers | `$emoji`, `$emojis`, `$createEmoji`, `$editEmoji`, `$deleteEmoji`, `$sticker`, `$stickers`, `$createSticker`, `$editSticker`, `$deleteSticker` | Resolução por nome, ID ou menção e mutações; emoji por URL com download validado, sticker por base64 |
| Threads e fóruns | `$createThread`, `$archiveThread`, `$unarchiveThread`, `$forumPost`, `$addThreadMember`, `$removeThreadMember`, `$threadMembers` | Threads de canal, posts de fórum/mídia e membros com paginação |
| JSON e objetos | `$object`, `$jsonEncode`, `$jsonDecode`, `$jsonGet`, `$jsonSet`, `$jsonDelete`, `$jsonMerge`, `$jsonKeys`, `$jsonValues`, `$jsonEntries`, `$hasProp` | Construção, serialização, navegação por propriedades próprias, mesclagem e remoção por caminho |
| Arrays | `$array`, `$arrayPush`, `$arrayGet`, `$arrayLength`, `$arraySlice`, `$arrayIncludes`, `$arrayIndexOf`, `$arrayJoin`, `$arraySort`, `$arrayReverse`, `$arrayUnique`, `$arrayConcat`, `$arrayFlat`, `$arrayChunk`, `$range`, `$paginate` | Construção, consulta, composição, ordenação e paginação |
| Callbacks de arrays | `$arrayMap`, `$arrayFilter`, `$arraySome`, `$arrayEvery`, `$arrayFind`, `$arrayReduce`, `$arraySortBy` | Expressões reavaliadas por item, curto-circuito e chaves estáveis, sem compilar dados como código |
| Texto | `$split`, `$sliceText`, `$includes`, `$startsWith`, `$endsWith`, `$padStart`, `$padEnd`, `$repeatText`, `$truncate`, `$escapeMarkdown`, `$mention` | Operações sem regex e formatação de menções |
| Números e datas | `$round`, `$floor`, `$ceil`, `$abs`, `$clamp`, `$fixed`, `$formatNumber`, `$date`, `$relativeTime`, `$parseDate` | Formatação, arredondamento e datas localizadas |
| Loops | `$repeat`, `$forEach`, `$loopIndex`, `$loopValue`, `$loopAccumulator` | Corpo reavaliado por iteração, com limite de 1000 e verificação incremental de saída |
| Estado composto | `$incrementVar`, `$pushVar`, `$pullVar`, `$setVarPath` e variantes `GuildVar`/`UserVar`, `$caseList`, `$caseCount` | Atualizações atômicas, caminho em objetos persistentes e consulta paginada de casos |
| Agendamentos | `$schedule`, `$scheduleEvery`, `$unschedule`, `$schedules` | Tarefas persistentes, repetíveis e recuperáveis |
| HTTP | `$http`, `$httpJson`, `$httpMultipart` | Requisições, upload multipart, timeout, limites e políticas de rede |

Assinaturas e aliases estão na [referência gerada](FUNCTIONS.md). A presença de
um nome familiar não garante a mesma assinatura ou semântica do ForgeScript.

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
assíncronos dentro do store. A extensão cobre as 288 funções internas.

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

## Wrappers ainda ausentes

| Prioridade | Área | Propostas de funções | Alternativa nativa disponível |
|---|---|---|---|
| Média | Gestão adicional de servidor | `$leaveGuild`, `$guildFeatures` | `guild.leave` e propriedades do SDK |
| Baixa | Componentes | `$button`, `$select`, `$modal` | Dependem de API equivalente no Fluxer |

As prioridades expressam ordem sugerida, sem data prometida. Métodos do SDK usam
os tipos e permissões do Fluxer; mutações diretas não passam pelos guards, casos
de moderação ou transporte mock do Yuzuha automaticamente.

## Lacunas da própria linguagem

Estas funções precisam de comportamento e limites próprios. Não são apenas
nomes novos para métodos do SDK.

| Área | O que existe | O que falta desenhar e implementar |
|---|---|---|
| Texto | split, slice, includes, prefixo/sufixo, padding e escape | Regex com contrato de flags, timeout e proteção contra backtracking; busca e substituição com grupos |
| Arrays | Construção, composição, callbacks, redução, ordenação estável e conjuntos com igualdade profunda | Comparadores personalizados |
| Números | Arredondamento, datas, percentuais, bytes e bases 2–36 | Aritmética decimal de precisão arbitrária |
| Fluxo | `$repeat` e `$forEach` com limite de 1000 | `while`, `break`/`continue` e orçamento de tempo por iteração |
| Persistência | TTL, operações por chave, transações nativas e declarativas entre chaves/escopos | Índices e consultas sobre grandes coleções persistentes |
| Agendamentos | Histórico, heartbeat, cron/fusos, concorrência limitada e retry/backoff/jitter | Prioridades e coordenação de capacidade entre processos |
| HTTP | Respostas textuais/binárias, streaming nativo, multipart e políticas por comando | Streaming de respostas diretamente em scripts |
| Binários | URL, bytes nativos, base64 em script e envio múltiplo/misto | Manipulação de imagens e streaming de anexos |

Não há `$eval` de JavaScript nem reinterpretação de texto de usuário como código.
Funções JS/TS próprias podem ser registradas explicitamente. Para operações
complexas, use o [guia nativo](NATIVE.md).

## O que não entra na promessa de paridade

- ForgeScript trabalha com Discord. Slash commands, interações, botões, selects
  e modais do Discord não são contratos do Yuzuha. Exigem suporte e APIs
  equivalentes no Fluxer antes de qualquer implementação.
- Voz e sharding têm pacotes separados no ecossistema Fluxer.js. Reexportar a
  raiz de `@fluxerjs/core` não instala nem integra esses pacotes ao Yuzuha.
- Economia, XP, rankings, tickets e música são sistemas de produto. Ter variáveis,
  moderação ou acesso ao SDK não significa que esses sistemas já estejam prontos.
- LSP e migração automática do ForgeScript ainda não são ferramentas entregues.
  Autocomplete, hover, assinatura e diagnósticos estão na extensão VS Code incluída.

Não existe uma porcentagem de paridade com ForgeScript: não foi auditado um
catálogo completo e versionado de suas funções. A comparação verificável aqui é
com o registro atual do Yuzuha e a dependência instalada.

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

Fontes primárias externas: [código do Fluxer.js](https://github.com/fluxerjs/core),
[documentação Fluxer.js](https://fluxer.js.org) e
[ForgeScript](https://github.com/tryforge/ForgeScript), usado como referência de
sintaxe e ergonomia, sem alegação de compatibilidade integral.
