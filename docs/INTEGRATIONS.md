# Integrações e suporte da plataforma

Auditoria de 23/10/2026 sobre os exports e declarações instalados de
`@fluxerjs/core 3.3.0` e `@fluxerjs/builders 3.0.0`. Recursos de outros pacotes e
versões não se tornam contratos do Yuzuha por aparecerem numa página do SDK.

## Servidor e anexos

`Guild.features` é um array disponível no SDK. O adaptador o copia em
`GuildInfo.features` e `ctx.guildFeatures()` retorna outra cópia.
`ClientUser.leaveGuild(id)` solicita a saída; não há `Guild.leave()` nessa
versão. `ctx.leaveGuild()` exige o dono do servidor, recusa DMs e impede sair de
um servidor cujo dono seja o próprio bot. Administrador sem ser dono não basta.

`AttachmentBuilder` aceita Blob, ArrayBuffer, Uint8Array ou string de arquivo/URL;
não aceita ReadableStream. O Yuzuha oferece uma entrada limitada por stream que
acumula bytes antes do upload. A distinção e os limites estão no
[guia de imagens e anexos](IMAGES.md).

## Componentes e comandos de aplicação

O core instalado não exporta ButtonBuilder, SelectMenuBuilder, ModalBuilder,
ApplicationCommand ou Interaction, e seu enum de eventos não tem
InteractionCreate. A documentação primária recomenda comandos por prefixo e
webhooks em vez de handlers de comandos de aplicação.

Assim, `$button`, `$select`, `$modal` e comandos de aplicação não são funções
executáveis do Yuzuha. Não há endpoint, payload ou evento equivalente verificado
nessa dependência que justifique implementar esses nomes. O Yuzuha oferece
`awaitMessage`, `awaitReaction` e `confirm` para conversas com limite de tempo;
eles mantêm seus próprios contratos e não simulam componentes clicáveis.

Fonte: [guia oficial de padrões do SDK](https://github.com/fluxerjs/core/blob/main/apps/docs/content/guides/from-discordjs.mdx).
A ausência de exports foi conferida no pacote fixado, e não inferida apenas pela
página externa, que pode acompanhar versões mais novas.

## Sharding e múltiplas instâncias

O core 3.3.0 já aceita `ClientOptions.shardCount`, `shardIds`, `buildStrategy`,
`sessionStore` e `identifyThrottler`. O Yuzuha preserva `clientOptions` e aceita
um `Client` injetado:

```ts
import { Yuzuha } from 'yuzuha';

const bot = new Yuzuha({
  clientOptions: { shardCount: 4, shardIds: [0, 1] },
});
```

Construir esse objeto não faz login. Os IDs são configuração do gateway, não
particionamento automático de stores, tarefas ou comandos do Yuzuha.
`ClientCluster` e `ClientClusterEvents` também são exports do core: coordenam
clientes de instâncias distintas e não substituem sharding de um mesmo bot.

Processos separados usam `@fluxerjs/sharding`; o pacote não é dependência nem
reexport do Yuzuha. Um processo filho pode construir o Client e injetá-lo no bot.
Cada processo precisa registrar comandos e plugins. Tokens, inicialização e
encerramento ficam com o gerenciador da aplicação. O core oferece eventos
ShardReady, ShardResumed, ShardDisconnect, ShardReconnecting e ShardError.

Não execute callbacks serializados ou broadcastEval com dados de scripts.
Para compartilhar dados, prefira mensagens tipadas ou um store transacional.
SQLite pode coordenar claims de tarefas com `globalConcurrency`; MemoryStore e
JSON não fornecem coordenação entre processos. Veja [SCHEDULER.md](SCHEDULER.md).

Fonte: [guia oficial de sharding](https://github.com/fluxerjs/core/blob/main/apps/docs/content/guides/sharding.mdx).
A conexão real de shards precisa de validação num servidor autorizado; os testes
da biblioteca conferem configuração e identidade de client sem login.
