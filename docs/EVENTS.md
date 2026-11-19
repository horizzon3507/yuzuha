# Eventos no function mode

`bot.scriptEvent` registra scripts para os payloads normalizados do Fluxer.js.
O registro ativa o function mode sob demanda e compila o script antes de instalar
o listener. Não faz login nem busca mensagens ou membros para preencher campos
que não vieram no evento.

```ts
import { Yuzuha } from 'yuzuha';

const bot = new Yuzuha();
bot.scriptEvent({
  event: 'guildMemberAdd',
  channelID: '123456789012345678',
  code: 'Olá <@$eventUserID>!',
});
```

Todo `ClientEventName` seguro do SDK é aceito por `bot.scriptEvent` (64
eventos). Ficam fora apenas `debug`, log interno do gateway sem contrato estável
que pode conter IDs de sessão e URLs de resume, e `webauthnCredentialsUpdate`,
que carrega material de autenticação. Ambos continuam disponíveis em `bot.on` e
`bot.contextEvent`; veja [NATIVE.md](NATIVE.md#eventos-tipados-e-erros-assíncronos).

| Opção | Comportamento |
|---|---|
| `event` | Qualquer evento listado em [Famílias e payloads](#famílias-e-payloads) |
| `code` | Script compilado no registro; funções precisam estar registradas |
| `channelID` | Destino da saída automática; substitui o canal original para essa saída |
| `actorID` | Principal fixo para autorização e escopo de dados de usuário; por padrão usa o usuário do evento |
| `ignoreBots` | `true` por padrão; ignora eventos cujo usuário foi identificado como bot |
| `once` | Remove o listener na primeira ocorrência bruta do SDK, inclusive quando `ignoreBots` descarta essa ocorrência |
| `http` | Política de rede restritiva do handler, no mesmo formato da política de um comando |

O objeto de definição é copiado ao registrar. Execuções de listeners são
concorrentes: a conclusão de um handler não bloqueia os outros handlers do evento.

## Campos e mensagens parciais

| Função | Retorno |
|---|---|
| `$eventName` | Nome do evento |
| `$eventUserID` | ID do membro, autor conhecido ou usuário que reagiu |
| `$eventGuildID` | Servidor, quando disponível |
| `$eventChannelID` | Canal original do evento, quando disponível |
| `$eventMessageID` | Mensagem envolvida, quando disponível |
| `$eventContent` | Conteúdo conhecido da mensagem |
| `$eventOldContent` | Conteúdo anterior conhecido em `messageUpdate` |
| `$eventEmoji` | Unicode ou `nome:id` para emoji customizado |
| `$eventData[caminho?;padrão?]` | Payload normalizado e redigido; caminho com pontos e índices, ex. `old.name` ou `reactions.0.emoji.name` |

Ausências retornam `null`, inclusive autores de mensagens não armazenadas no
cache. A interpolação em texto transforma `null` em texto vazio; um argumento
formado somente pela função preserva o valor tipado. Em funções JS de plugins,
`ctx.event` contém esses metadados como objeto imutável. Essas funções `$event*`
recusam contextos comuns de comando.

`$eventData` sem argumentos retorna o objeto inteiro (cópia; o original é
imutável). Caminho ausente retorna o padrão ou `null`; só chaves próprias são
lidas, então `__proto__` e `constructor` são ausências. Caminho malformado, como
`a..b`, gera erro. Listas são limitadas a 100 itens e acompanhadas de um campo
`<lista>Count` com o total recebido; textos são limitados a 4000 caracteres.
Datas viram ISO-8601 e campos aninhados desconhecidos viram `null`.

## Famílias e payloads

O ator (`$eventUserID` e o principal de autorização) é o usuário identificado
pelo evento; sem usuário, o principal fica vazio e funções que exigem permissão
do autor recusam com guard, a menos que `actorID` seja definido. Eventos sem
canal (servidor, gateway, presença em massa, usuário) exigem `channelID` ou
`$sendMessage` com canal explícito para produzir saída.

| Família | Eventos | `$eventData` | Ator |
|---|---|---|---|
| Gateway | `ready`, `resumed`, `error`, `shardReady`, `shardResumed`, `shardReconnecting`, `shardDisconnect`, `shardError`, `shardingRequired` | `{}`, `shardID`, `code`, `numShards`, `error.{name,message,code}` | nenhum |
| Mensagens | `messageCreate`, `messageUpdate`, `messageDelete`, `messageDeleteBulk` | `message` ou `old`/`new` com `id`, `channelID`, `guildID`, `authorID`, `content`, `partial`; bulk: `ids`, `count`, `messages` | autor conhecido |
| Reações | `messageReactionAdd`, `messageReactionAddMany`, `messageReactionRemove`, `messageReactionRemoveAll`, `messageReactionRemoveEmoji` | `messageID`, `channelID`, `guildID`, `emoji`, `user`, `member`, `message`, `reactions` | quem reagiu |
| Servidores | `guildCreate`, `guildAvailable`, `guildUnavailable`, `guildUpdate`, `guildDelete`, `guildCountsUpdate`, `guildAuditLogEntryCreate` | `guild` ou `old`/`new`; `counts`; auditoria com `actionType`, `userID`, `targetID`, `reason`, `options` e `changes` escalares | executor da auditoria |
| Canais e threads | `channelCreate`, `channelUpdate`, `channelDelete`, `channelPinsUpdate`, `channelRecipientAdd`, `channelRecipientRemove`, `channelMemberCountsUpdate`, `threadCreate`, `threadUpdate`, `threadDelete`, `threadListSync`, `threadMemberUpdate`, `threadMembersUpdate`, `threadMemberListUpdate`, `forumUnreads` | `channel` ou `old`/`new` com `id`, `name`, `type`, `guildID`, `parentID`, `ownerID`; membros de thread com `threadID`, `userID`, `flags` | destinatário ou membro de thread |
| Membros e moderação | `guildMemberAdd`, `guildMemberUpdate`, `guildMemberRemove`, `guildMembersChunk`, `guildBanAdd`, `guildBanRemove` | `member` ou `old`/`new` com `id`, `user`, `nick`, `joinedAt`, `communicationDisabledUntil`; ban com `user`, `reason`, `expiresAt` | membro ou usuário banido |
| Cargos e expressões | `guildRoleCreate`, `guildRoleUpdate`, `guildRoleDelete`, `guildEmojisUpdate`, `guildStickersUpdate` | `role` com `permissions` em texto; `roleID`; `emojis`, `stickers` | nenhum |
| Voz | `voiceStateUpdate`, `voiceStateAck`, `voiceServerUpdate`, `voiceStatesSync`, `entranceSoundPlay` | `state` com `guildID`, `channelID`, `userID`, `mute`, `deaf`, `selfMute`, `selfDeaf`, `suppress`, `selfVideo`, `selfStream`, `nick`; servidor: `guildID`, `channelID`, `hasEndpoint`, `redacted` | usuário da voz |
| Presença e usuário | `presenceUpdate`, `presenceUpdateBulk`, `typingStart`, `userUpdate`, `userConnectionsUpdate` | `presence` com `status`, `activities`, `customStatus`; `user`; `connections` com `type`, `name`, `verified` | usuário; `userUpdate` é o próprio bot e é ignorado por `ignoreBots` |
| Convites e webhooks | `inviteCreate`, `inviteDelete`, `webhooksUpdate` | `code`, `guildID`, `channelID`, `inviter`, `uses`, `maxUses`, `maxAge`, `temporary`, `expiresAt` | quem convidou |

### Redação

Scripts nunca recebem `token`, `endpoint`, `connection_id` nem `e2ee_key` de
`voiceServerUpdate`; `session_id`, `connection_id` e `viewer_stream_keys` de
estados de voz; IDs internos ou tokens de conexões de usuário; nem objetos
brutos do SDK. `$eventData` é montado por lista de campos permitidos, então um
campo novo do SDK só aparece depois de ser adicionado e testado. `ctx.eventArgs`
continua com os objetos originais apenas para funções JS de plugins.

`$reply` funciona em `messageUpdate` com mensagem completa e em reações quando o
SDK forneceu uma mensagem completa em cache. Ele responde à mensagem original,
mesmo quando `channelID` define outro destino de saída automática. Eventos de
membro, exclusões e mensagens parciais recusam `$reply` com um guard.

Para enviar sem uma mensagem completa, informe um canal explicitamente:

```text
$let[id;$sendMessage[123456789012345678;Saiu: $eventUserID]]
```

`$sendMessage` retorna um ID; `$let` consome esse retorno para evitar enviá-lo
novamente como saída automática. Texto restante do script é enviado ao
`channelID` configurado ou ao canal conhecido do evento. Saída sem destino
conhecido produz um guard. Conteúdo de usuário continua sendo dado: retornar
`$eventContent` com texto como `$ban[...]` não executa esse texto.

## Permissões e plugins

Os serviços de moderação e os recursos autorizados usam o principal escolhido
por `actorID` ou o usuário do evento. Não há substituição automática pelo bot.
Um evento de exclusão sem autor conhecido não ganha permissões de outro usuário.
`actorID` permite declarar um principal fixo para automações; as permissões,
hierarquia, motivos e casos continuam sendo verificados pelos mesmos serviços.
Guards, limites e `PartialModerationError` escapam de `$try`.

Plugins podem registrar funções, comandos, eventos nativos e eventos de script:

```ts
bot.plugin({
  name: 'entrada',
  scriptEvents: [{
    event: 'guildMemberAdd',
    channelID: '123456789012345678',
    code: 'Entrou: $eventUserID',
  }],
});
```

Funções do próprio plugin estão disponíveis durante a compilação de seus
scripts. Todos os comandos e eventos são validados em staging. Falha de validação
ou compilação impede a instalação de funções, comandos e listeners desse plugin.

## Erros e encerramento

Erros de execução chegam a `onError(error, ctx)` com `ctx.event`. Logs opcionais
emitem `event.start` e `event.finish`, com correlação e duração; consulte
[OBSERVABILITY.md](OBSERVABILITY.md).

`destroy()` remove os listeners e cancela o sinal das execuções ativas. Chamado de
fora de um handler, aguarda a drenagem. Dentro do próprio handler, confirma o
pedido e conclui o encerramento após o retorno, como em comandos nativos.
Stores fornecidos pelo chamador continuam sob responsabilidade do chamador.

A validação offline usa instâncias dos payloads do SDK e `MockTransport`, sem
token, conexão ao gateway ou ações reais. Consulte
[PARITY.md](PARITY.md) para a distinção entre eventos nativos e wrappers de script.

O normalizador preserva `reaction.guildId` e `PartialMessage.authorId` quando
os objetos correspondentes não estão no cache. Um ID conhecido não fornece
nome ou status de bot: `userName` permanece `null` e `userBot` fica `false`;
`ignoreBots` só descarta usuários identificados como bots. Quando nem o ID do autor
está disponível, o escopo de dados de usuário e operações que exigem a autorização
do autor recusam com guard antes de consultar membros. Dados globais/de servidor
e `userFor(id)` explícito continuam disponíveis no escopo apropriado.

## Erros do gateway

Além dos erros de scripts, o bot encaminha `Events.Error` e `Events.ShardError`
do client para `onError(error)`, sem `ctx`. Uma falha de shard emitida nos dois
eventos é reportada uma vez. Sem callback configurado, o framework usa
`console.error`. O encerramento aguarda os relatórios pendentes; veja também
[eventos nativos](NATIVE.md#eventos-tipados-e-erros-assíncronos).
