# Cobertura e compatibilidade

Referência fixada: **@fluxerjs/core 3.3.0**, instalada e inspecionada nesta entrega.
Fontes primárias: [repositório Fluxer.js](https://github.com/fluxerjs/core) e
[documentação](https://fluxer.js.org). O Yuzuha é um projeto independente.

O produto é o framework nativo sobre o Fluxer.js. A coluna de function mode é
opcional e existe para quem prefere a sintaxe curta do ForgeScript; ela não é a
identidade nem a promessa principal do pacote.

## O que significa paridade

`yuzuha/sdk` executa `export * from '@fluxerjs/core'`. Isso preserva os exports
públicos da raiz do pacote e seus tipos. `bot.client` é uma instância real de
`Client`; `SDK` na raiz do Yuzuha é um namespace do mesmo pacote. O acesso nativo
não é uma reprodução parcial do client.

Isso não significa que cada método tem uma função `$...`, nem que pacotes opcionais
ou subpaths do SDK foram incorporados à raiz. O teste de consumidor compara os
exports de `yuzuha/sdk` aos da dependência instalada.

| Área | JS/TS pelo client/SDK | Function mode |
|---|---|---|
| Gateway, conexão, heartbeat e reconexão | Herdado do SDK | Via inicialização do bot |
| Eventos | `bot.on/once/off`, `bot.event`, `bot.scriptEvent` e `bot.client.on` | Eventos de membros, edição/exclusão de mensagens e reações, com contexto próprio |
| Mensagens e replies | API completa do SDK | reply, sendMessage, editMessage, deleteMessage, fetchMessage, messages com cursores, pin/unpin, dm, forward, searchMessages e preloadMessages |
| Reações e collectors | API do SDK | react, removeReaction, clearReactions, reactionUsers paginado, awaitMessage, awaitReaction, confirm |
| Embeds e anexos | Builders do SDK, sendBytes e sendAttachments | Embeds, anexos URL/base64 e múltiplos anexos na mesma mensagem |
| Membros, cargos, canais e permissões | API do SDK e `ctx.members` | User/member, perfil completo, contagens ao vivo, nickname, roles, canais de link, avisos, posição, categorias e overwrites |
| Ban, kick, timeout, unban e moderação de voz | SDK + `ctx.mod` e `ctx.moderate` | Versões simples e mod* com casos, incluindo move/mute/deafen |
| Servidor, convites, webhooks e expressões | API do SDK | editGuild, convites/vanity, clonagem e mutações de emojis/stickers, createEmojisBulk; CRUD e envio de webhooks |
| Threads e fóruns | API do SDK | Criação, edição, busca, posts, membros e listagens ativas/arquivadas com paginação |
| Presença | `client.user.setPresence` | setPresence, setStatus e setActivity |
| Cache e presença | Opções e métodos do SDK | Acesso nativo |
| Instância própria/discovery | `Client.fromDiscovery`, client injetado | Mesmo adaptador do client |
| Áudio em voz | Pacote separado `@fluxerjs/voice` | Sem reprodução de áudio própria; moderação de membros usa o SDK core |
| Sharding | Pacote separado `@fluxerjs/sharding` | Sem coordenação própria |
| Cluster/subpaths | Imports diretos de `@fluxerjs/core/cluster` | Sem wrapper próprio |
| Estado e casos | `ctx.data`, TTL, userFor, transaction entre chaves e stores | Variáveis, TTL, incrementos, listas, casos e dataTransaction com operações declarativas |
| Agendamentos | `ctx.scheduler`, cron/fusos, concorrência limitada, histórico, heartbeat e controles | schedule, scheduleEvery, scheduleCron, controles, histórico, reexecução e retry com jitter |
| HTTP | `request`, `requestBytes`, `stream`, `multipart`, `withPolicy` e cancelamento | `$http`, `$httpJson`, `$httpMultipart` e download de imagens com política de rede por comando |
| CLI, plugins, comandos e middleware | Recursos próprios do Yuzuha; lint/catálogos/cenários e manutenção de dados | 288 funções canônicas; comandos e eventos de script |

A camada nativa do Yuzuha — o caminho principal — acrescenta schemas de argumentos
com inferência, checks e middleware por comando, eventos com encaminhamento de
erros e plugins que agrupam comandos e eventos. Os mesmos contratos de recursos atendem scripts
e comandos nativos, e `ctx.scheduler`/`ctx.http` expõem agendamento e rede sem
duplicar regras. Veja o [guia nativo](NATIVE.md) e o
[inventário de lacunas](FUNCTION-GAPS.md), que separa wrappers ausentes de
recursos já acessíveis no SDK.

O lockfile registra a árvore exata. Ao atualizar o SDK, rode os testes de tipos,
adaptador, consumidores JS/TS e paridade de exports antes de alterar esta tabela.

## Autorização dos recursos de contexto

Mutações de `ctx.resources.roles`, `channels` e `webhooks` passam pelo mesmo
serviço em comandos JS/TS e scripts. Cargos exigem `ManageRoles` de autor e bot,
hierarquia sobre o cargo e o membro, proteção de `@everyone` e metadado
`managed: false` conhecido. Permissões concedidas por cargo ou overwrite devem
estar disponíveis para ambos os atores. O SDK 3.3.0 não expõe um sinal de cargo
gerenciado em `Role`/`APIRole`; o adaptador informa `false` quando esse campo está
ausente. Recursos customizados precisam informar o booleano explicitamente.

Canais e categorias devem pertencer ao servidor do contexto. Edição, remoção,
slowmode, posição e categoria exigem `ManageChannels` efetivo no canal; criação
em categoria verifica as permissões dessa categoria. Overwrites exigem
`ManageRoles` local, resolução do alvo no servidor e hierarquia. Permissões
locais vêm de `transport.member(guildID, userID, channelID)`.

Criação, listagem, consulta, envio, edição e exclusão de webhooks exigem
`ManageWebhooks` efetivo para autor e bot no canal do webhook. Mesmo com token,
o webhook precisa ser consultável pela autenticação do bot e pertencer ao
servidor atual. `bot.resources` e `bot.client` preservam a autoridade direta do
SDK; seu uso é uma decisão explícita do código nativo confiável.

`messages.preload` recebe de 1 a 100 IDs e retorna a última mensagem normalizada
por canal, ou `null`. `expressions.createEmojisBulk` recebe de 1 a 50 imagens em
base64, limitadas a 10 MB decodificados no total, e preserva as listas `success`
e `failed` do SDK. No contexto, a criação em lote exige `ManageExpressions` de
ambos os atores. Os lotes são validados por inteiro antes da chamada ao SDK.

## Relação com ForgeScript

Referência de ergonomia: [ForgeScript](https://github.com/tryforge/ForgeScript).
O parser/runtime do Yuzuha é uma implementação original. Não foi copiado código
do ForgeScript e não há dependência de seu interpretador.

Compatibilidade é **parcial**, voltada à familiaridade da escrita:

- Usa `$função[argumento;argumento]`, funções aninhadas e texto interpolado.
- Inclui nomes familiares: `$reply`, `$username`, `$onlyIf`, `$onlyPerms`,
  `$mentioned`, `$message`, `$let`, `$get`, `$ban`.
- Não promete que aridade, retorno ou comportamento de funções homônimas seja igual.
- Usa `$if[condição;então;senão]`, sem blocos `$endif` nesta versão.
- Não executa JavaScript embutido em scripts; funções JS são registradas explicitamente.
- Não tem slash commands do Discord, modais ou componentes Discord.
- `mentioned` é 1-based; `message` e `messageSlice` são 0-based.
- Embeds recebem partes separadas por `;`, preservando objetos tipados.
- Moderação simples também verifica permissões e hierarquia; funções `mod*`
  acrescentam casos e definem `$caseID`.

Migração de scripts deve ser revisada função por função com a referência gerada
em [FUNCTIONS.md](FUNCTIONS.md). Funcionalidades disponíveis apenas no Discord não
são simuladas como se existissem no Fluxer.

## Extensões futuras

A extensão VS Code oferece autocomplete, hover, assinatura, diagnósticos e
catálogos JSON de plugins; os auxiliares estão em `yuzuha/tooling`.
Logs opcionais e correlação estão documentados em [OBSERVABILITY.md](OBSERVABILITY.md).
A CLI inclui lint textual, exportação de catálogos e cenários JSON offline.
O scheduler e a rede têm guias próprios em [SCHEDULER.md](SCHEDULER.md) e
[HTTP.md](HTTP.md); estatísticas, limpeza, backups e restauração estão em
[STORAGE.md](STORAGE.md). LSP, bibliotecas de canvas/voz e ferramentas
de migração continuam fora desta versão. Integração ao vivo deve ser validada em
um servidor de teste antes de distribuir um bot para produção.
