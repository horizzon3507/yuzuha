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

O core 3.3.0 aceita `ClientOptions.shardCount`, `shardIds`, `buildStrategy`,
`sessionStore` e `identifyThrottler`, e o Yuzuha expõe o contexto de shard
nativamente em `bot.shard` e `ctx.shard` (`BotShard` / `ShardInfo`):

```ts
import { Yuzuha, shardIdForGuild } from 'yuzuha';

const bot = new Yuzuha({
  clientOptions: { shardCount: 4, shardIds: [0, 1] },
  sharding: { leaderShardID: 0, schedulerMode: 'leader' },
});

console.log(bot.shard?.ids, bot.shard?.isLeader);
console.log(shardIdForGuild('1234567890123456789', 4));
```

`bot.shard` fica disponível quando `YuzuhaOptions.sharding` (`true` ou objeto
`ShardingOptions`), `clientOptions.shardCount`/`shardIds`, `client.shard` ou as
variáveis `FLUXER_SHARD_*` do `ShardingManager` estão presentes (`sharding: false`
desativa a exposição). `ctx.shard` espelha `bot.shard` em comandos e eventos com
contexto.

| Membro de `BotShard` | Comportamento |
|---|---|
| `id`, `ids`, `count` | Primeiro shard do processo, fatia atribuída e contagem total |
| `isLeader` | `true` quando `ids` inclui `leaderShardID ?? 0` |
| `shardIdForGuild(guildID)` | `(BigInt(guildID) >> 22n) % BigInt(count)` |
| `broadcastEval(fn, { context? })` | Delega a `ShardClientUtil.broadcastEval` sob `ShardingManager` ou avalia localmente `[await fn(bot.client, context)]` em processo único |
| `fetchClientValues(prop)` | Delega a `ShardClientUtil.fetchClientValues` ou lê `[...]` localmente (suporta caminhos pontilhados) |
| `respawn({ delay? })` | Solicita respawn sob `ShardingManager`; fora dele rejeita com `YuzuhaError('SHARDING_UNAVAILABLE')` |

Quando `bot.shard.count > 1`, `schedulerMode` assume `'leader'` por padrão na
ausência de `options.lock`: somente o processo líder inicia `scheduler.start()`
e a limpeza periódica de variáveis no `login()`, evitando disputa sobre
`JsonStore` ou `SQLiteStore` sem lock distribuído. Com `options.lock` ou
`schedulerMode: 'all'`, todos os processos iniciam ambos; `'disabled'` desliga o
início automático em todos os shards.

Processos separados usam o peer opcional `@fluxerjs/sharding` (carregado sob
demanda; se ausente, falha com `ConfigError('SHARDING_UNAVAILABLE')`). Em um
processo filho do `ShardingManager`, `bot.login()` anexa `attachShardClientUtil`
automaticamente quando necessário e notifica `notifyReady()` após conectar.

Não execute callbacks serializados ou `broadcastEval` com dados não confiáveis de
usuários ou scripts. Para estado compartilhado entre shards, prefira um store
transacional com `Lock` e `RateLimiter` distribuídos; veja [SCHEDULER.md](SCHEDULER.md).

Fonte: [guia oficial de sharding](https://github.com/fluxerjs/core/blob/main/apps/docs/content/guides/sharding.mdx).
A conexão real de shards precisa de validação num servidor autorizado; os testes
da biblioteca conferem roteamento snowflake, liderança, IPC mockado e client sem login.

### Cluster multi-bot no mesmo processo (`YuzuhaCluster`)

Enquanto sharding divide **um mesmo token** em fatias de servidores, `YuzuhaCluster`
e `YuzuhaClusterEvents` supervisionam **múltiplos bots independentes** (tokens
distintos ou instâncias Fluxer separadas via `discovery`) no mesmo processo sobre
`ClientCluster`:

```ts
import { MemoryStore, YuzuhaCluster, YuzuhaClusterEvents } from 'yuzuha';

const cluster = new YuzuhaCluster<{ prefix: string }>({
  botOptions: (_runtime, meta) => ({
    prefix: meta?.prefix ?? '!',
    store: new MemoryStore(),
  }),
  setup(bot) {
    bot.command({ name: 'ping', async run(ctx) { await ctx.reply('pong'); } });
  },
});

cluster.on(YuzuhaClusterEvents.RuntimeReady, entry => {
  console.log(entry.id, entry.status);
});

await cluster.addAll([
  { id: 'instancia-a', token: process.env.TOKEN_A!, meta: { prefix: '!' } },
  { id: 'instancia-b', token: process.env.TOKEN_B!, discovery: 'https://chat.exemplo.org', meta: { prefix: '?' } },
]);
```

Cada entrada mantém seu próprio `Client`, `Yuzuha`, registro de comandos e `Store`
isolados. Tokens nunca ficam retidos nas entradas nem na receita interna: `restart(id, { token })`
exige o novo token explicitamente, destrói o bot e o client anteriores sem vazar
listeners e reconstrói o runtime com a mesma configuração não sensível. Veja [API.md](API.md).
