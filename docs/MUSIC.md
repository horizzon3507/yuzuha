# Música e voz

A 0.1.6 oferece `FluxerVoice` para áudio nativo, cliente Lavalink v4, filas e
`FluxerLavalinkBridge` para transmitir o áudio do Lavalink ao Fluxer. Os imports vivem em `yuzuha/music`.
São APIs JS/TS; o catálogo de 288 funções de script não inclui reprodução.

| Integração | Conexão de áudio | Recursos |
|---|---|---|
| `FluxerVoice` | Pacote oficial `@fluxerjs/voice`, inclusive LiveKit | Join/leave, WebM/Opus, stop e volume quando suportado pelo driver |
| `LavalinkNode` + `MusicManager` + `FluxerLavalinkBridge` | Plugin `yuzuha-audio` no Lavalink e pacote oficial de voz no bot | Busca, playlists, edição de filas, loop, pausa, seek, filtros, eventos e recuperação de sessão/áudio |

O plugin fornecido pelo Yuzuha extrai os frames Opus do player e os entrega em
WebM ao SDK de voz do Fluxer. Pausa, seek, filtros, volume e avanço continuam no
Lavalink. O fluxo de áudio é contínuo entre faixas; não depende de um evento de
fim do SDK de voz nem de credenciais de voz do Discord. A instalação no servidor
está em [bridges/lavalink](../bridges/lavalink/README.md).

## Áudio nativo do Fluxer

```sh
npm install @fluxerjs/voice@^3.1.0
```

A dependência é opcional. O módulo só é importado na primeira chamada a `join`;
os requisitos nativos do pacote de voz pertencem a ele. Não há download de áudio,
login ou inicialização de codec ao construir um bot sem voz.

```ts
import { Yuzuha } from 'yuzuha';
import { Client } from 'yuzuha/sdk';
import { FluxerVoice } from 'yuzuha/music';

const client = new Client();
const voice = new FluxerVoice(client);
voice.on('voiceError', (error, guildID) => {
  console.error(`Falha de áudio no servidor ${guildID}:`, error);
});
const bot = new Yuzuha({ client, voice });
```

Dentro de um comando nativo, depois de verificar servidor, canal e permissões:

```ts
await ctx.voice.join(channelID);
await ctx.voice.play(ctx.requireGuild(), './musicas/faixa.webm');
ctx.voice.setVolume(ctx.requireGuild(), 80);
ctx.voice.stop(ctx.requireGuild());
await ctx.voice.leave(ctx.requireGuild());
```

`channelID` deve ser resolvido pelo comando. Um exemplo completo de comandos com
essa validação está em [native-voice.ts](../examples/native-voice.ts).
O caminho de áudio é configuração confiável do operador; o driver oficial também
aceita URLs e streams Node. Não passe uma entrada arbitrária de mensagem como
caminho de arquivo. Para baixar uma URL informada pelo usuário, aplique a política
de [HTTP](HTTP.md) e entregue um stream ao driver.

O formato de áudio oferecido pelo SDK inspecionado é WebM/Opus; uma URL de página
do YouTube não é um stream de áudio. Resolução/conversão de fontes pertence à
aplicação. `play()` confirma a preparação do stream, sem esperar a música inteira;
o SDK 3.1.0 não oferece um evento público de fim para construir uma fila automática
confiável. Pause, seek e fila automática pertencem à integração Lavalink. Volume
nativo aceita 0–200 quando a conexão implementa `setVolume`.

`FluxerVoice` encaminha erros posteriores para `voiceError`; falhas durante a
preparação também rejeitam `play()`. Uma conexão por servidor é mantida. Entre
em outro canal após `leave`. `close()` aguarda joins pendentes e sai das conexões.
O SDK continua responsável pelo timeout da conexão de voz.

## Lavalink com áudio no Fluxer

No checkout, com JDK 17+ disponível, rode `npm run music:build-plugin`.
Copie `bridges/lavalink/build/yuzuha-audio-0.1.6.jar` para `plugins/` no Lavalink
4.2.2 e reinicie o servidor. No bot, instale `@fluxerjs/voice@^3.1.0` e configure:

```ts
import { FluxerVoice, FluxerLavalinkBridge, LavalinkNode, MusicManager } from 'yuzuha/music';

const voice = new FluxerVoice(client);
const audio = new FluxerLavalinkBridge({ voice });
const node = new LavalinkNode({
  url: 'http://127.0.0.1:2333', password: process.env.LAVALINK_PASSWORD!,
  userID: client.user!.id,
});
node.on('nodeError', error => console.error(error));
await node.connect();
const music = new MusicManager({ nodes: [node], audio, onError: console.error });
const player = music.createPlayer(guildID);
await player.connect(channelID);
player.enqueueResult(await music.search('scsearch:termo'));
await player.play();
```

Se derivar `userID` de `client.user.id`, aguarde o ready do client; um ID de bot
configurado permite preparar a integração antes de `bot.login()`. Os IDs e permissões devem ser validados no
comando; o exemplo [lavalink.ts](../examples/lavalink.ts) mostra comandos de
join, play, pause/resume, skip, stop, seek, volume, fila, shuffle e leave.

`FluxerLavalinkBridge({ voice, maxStreams = 128, reconnect? })` mantém uma saída
por servidor. Reconexão de áudio usa até cinco tentativas, atraso inicial de
250 ms e teto de 5000 ms; `false` desliga. A quebra de HTTP ou da conexão de voz
informa `playerError`/`onError`, marca `state.connected = false` e interrompe a
estimativa de posição. A ponte reconecta a saída sem reenviar a faixa. Uma sessão
nova do Lavalink reconstrói o player; uma sessão retomada preserva sua reprodução.
`player.connect(channelID)` permite tentar a saída novamente após corrigir uma
falha. Troca de canal exige destruir o player e criar outro.

`maxStreams` é o limite agregado da ponte, somando seus nodes. Ajuste-o junto
com os limites de saída de cada `LavalinkNode` e servidor/plugin.

`size` informa saídas da ponte e `close()` as encerra. A ponte sai apenas dos
canais que abriu; recusa assumir uma conexão nativa já utilizada por outro
proprietário. `MusicManager.close()` desconecta seus players, mas permite
reutilizar a ponte em outro gerenciador. A instância `voice` continua sendo do
chamador; passe-a também a `Yuzuha({ client, music, voice })` para que o bot a
encerre. O chamador fecha os nodes Lavalink.

O plugin transmite Opus estéreo a 48 kHz, com frames de 20 ms, sem FFmpeg ou
transcodificação no caminho plugin/ponte. O SDK 3.1.0 decodifica e publica áudio
mono no LiveKit. Pausa/ociosidade transmitem silêncio para manter a publicação;
`stop()` interrompe a faixa e `destroy()`/leave libera voz e saída HTTP.
Headers autenticam a saída; proxies precisam permitir streaming sem buffering.

## Cliente Lavalink v4

```ts
import { LavalinkNode } from 'yuzuha/music';

const node = new LavalinkNode({
  url: 'http://127.0.0.1:2333',
  password: process.env.LAVALINK_PASSWORD!,
  userID: bot.client.user!.id,
});
node.on('nodeError', error => console.error(error));
await node.connect();
const result = await node.loadTracks('scsearch:termo de busca');
```

Use o ID do bot configurado ou obtenha `userID` depois do ready do client. A senha é enviada em headers;
redirecionamentos HTTP são recusados. A URL pode conter um prefixo de proxy,
como `/audio/`. REST usa `/v4`; a conexão WebSocket usa `/v4/websocket`.
O `sessionID` do node vem do `ready` Lavalink e difere do `sessionId` de voz.

| Método | Resultado |
|---|---|
| `connect()` | Aguarda ready e configuração de retomada; chamadas simultâneas compartilham a conexão |
| `loadTracks(identifier, signal?)` | União `track`, `playlist`, `search`, `empty` ou `error`; `empty.data` é `null` |
| `decodeTrack(encoded, signal?)`, `decodeTracks(encoded[], signal?)` | Metadados validados; lote de 1–1000 faixas, limitado também por bytes |
| `getInfo(signal?)`, `getStats(signal?)` | Informações e estatísticas do node |
| `getPlayers(signal?)`, `getPlayer(guildID, signal?)` | Snapshot remoto da sessão atual |
| `updatePlayer(guildID, patch, { noReplace?, signal? })` | PATCH de faixa, voz, volume, pausa, posição e filtros |
| `destroyPlayer(guildID, signal?)` | DELETE remoto sem retry automático |
| `openAudioStream(guildID, signal?)` | Saída WebM/Opus incremental do plugin; `data` tem um consumidor e `close()` cancela a conexão |
| `subscribe(listener)` | Inscrição de eventos; devolve função para removê-la |
| `subscribeLifecycle(listener)` | Ready, disconnect e closed, sem acoplar serviços ao WebSocket |
| `diagnostics` | Contadores de requisições, buscas compartilhadas, cache, operações pendentes e `activeAudioStreams` |
| `close()` | Cancela rede/reconexão, aguarda requisições e remove listeners; idempotente |

`loadTracks` e consultas de informação funcionam sem uma sessão de player. As
operações de player exigem `connect()` concluído. As fontes e prefixos de busca
dependem dos plugins/source managers instalados no servidor Lavalink.

| Opção | Padrão |
|---|---|
| `timeoutMs` | 10000 ms para conexão e requisições, incluindo leitura do corpo |
| `resumeTimeoutSeconds` | 60; zero desabilita retomada |
| `reconnect` | Até 5 tentativas, atraso inicial 1000 ms, teto 30000 ms; `false` desliga |
| `maxPendingRequests` | 128 requisições; excesso recebe `LAVALINK_CAPACITY` |
| `maxPendingLoads` | 1024 chamadas de busca aguardando resposta, mesmo quando compartilham uma requisição |
| `maxResponseBytes` | 2000000 bytes por resposta/evento |
| `maxAudioStreams` | 128 saídas simultâneas, limitadas separadamente das requisições REST curtas |
| `audioIdleTimeoutMs` | 15000 ms sem dados durante uma leitura de áudio; o timeout de abertura usa `timeoutMs` |
| `cache` | LRU de até 64 buscas, 4000000 bytes serializados, TTL de 15000 ms; `false` desliga |
| `sessionID` | Sessão anterior para tentar retomar, opcional |
| `fetch`, `socketFactory` | Implementações injetáveis para testes e infraestrutura própria |

O cache devolve cópias isoladas e não guarda resultados `error`. Buscas iguais
compartilham uma requisição em andamento, inclusive com signals diferentes.
Cada chamada cancela sua própria espera; a última desistência aborta a requisição.
O limite de bytes do cache se refere ao JSON; o heap tem custo adicional.

Após uma reconexão, observe `ready` e seu booleano `resumed`. Se for `false`, os
players da sessão anterior foram perdidos no servidor. `MusicManager` os
reconstrói conforme a seção abaixo. Usando apenas `LavalinkNode`, a aplicação
controla essa reconstrução. Eventos acumulados pelo Lavalink só são entregues
após a confirmação da sessão; o buffer tem limite agregado de `maxResponseBytes`
e até `maxPendingLoads` eventos. Mutações HTTP não têm retry automático.

## Gerenciador, filas e controles

`new MusicManager({ nodes, audio?, voice?, maxPlayers?, queueLimit?, maxPendingControls?,
recoveryConcurrency?, onError? })` mantém um player por servidor. Novos players
e buscas escolhem o menor valor de `players locais + node.penalty`. `available:
false` exclui o node. Sem `penalty`, a distribuição considera apenas players locais.
O limite padrão é 1000 players e 1000 músicas pendentes por fila.

`LavalinkNode.penalty` usa `playingPlayers + lavalinkLoad × 100`, mais a
porcentagem de frames perdidos/nulos sobre 3000 frames por minuto. O Lavalink já
informa a média por player; não há outra divisão pelo número de players.
Quando há saída de áudio pelo plugin, os contadores do emissor Discord são
ignorados, pois esse transporte não é utilizado. CPU e players continuam no
cálculo. Déficit negativo não penaliza. Estatísticas com mais de 90 segundos deixam de participar
do cálculo. Essa fórmula é uma política do Yuzuha, baseada nos campos publicados
pelo Lavalink; não é uma medida de latência de áudio.

`manager.createPlayer(guildID, { node?, queueLimit?, maxPendingControls? })` reaproveita o player já
existente. `get(guildID)` consulta, `destroyPlayer(guildID)` encerra, `search`
consulta um node disponível, `drain()` aguarda recuperações/controles recebidos
e `close()` encerra todos os players.

`audio` recebe a ponte fornecida acima ou uma implementação de `MusicAudioOutput`.
`voice` é a alternativa para servidores que já implementem outro transporte de
voz compatível com o Fluxer e recebe um `MusicVoiceAdapter` com:

```ts
interface MusicVoiceAdapter {
  join(guildID: string, channelID: string, signal: AbortSignal): Promise<MusicVoiceState>;
  leave(guildID: string): Promise<void>;
}
```

O resultado contém `token`, `endpoint` e `sessionId`. O player preenche
`channelId` com o canal solicitado, também necessário no Lavalink 4.2; se a
ponte o informar, deve ser o mesmo canal. Esses dados precisam representar uma sessão compatível com o servidor
de áudio. Um adaptador que apenas renomeia campos de eventos Fluxer não satisfaz
esse contrato. `audio` e `voice` são mutuamente exclusivos. Sem nenhum deles,
`player.connect` rejeita com `MUSIC_VOICE_ADAPTER`.

| Operação do player | Comportamento |
|---|---|
| `enqueue(trackOrTracks)` | Valida/copia o lote inteiro antes de inserir; excesso não insere parcialmente |
| `enqueueResult(result, searchIndex = 0)` | Faixa, playlist inteira ou um resultado de busca; `empty` não altera a fila e `error` lança `MUSIC_LOAD` |
| `play()` | Começa a primeira pendente se estiver ocioso; chamadas simultâneas não consomem duas faixas |
| `skip()` | Substitui pela próxima ou interrompe se não houver próxima |
| `pause(true/false)` | Pausa ou retoma |
| `stop(clearQueue = true)` | Interrompe; opcionalmente preserva a fila |
| `seek(ms)` | Exige faixa com seek e posição dentro da duração |
| `setVolume(0..1000)`, `setFilters(filters)` | Controles Lavalink |
| `setLoop('off'/'track'/'queue')` | Repete faixa ou fila quando a faixa termina normalmente |
| `connect(channelID)` | Abre a saída de áudio no Fluxer ou obtém voz pelo adaptador configurado |
| `clearQueue()` | Remove pendentes; não interrompe a faixa atual |
| `remove(index, count = 1)`, `move(from, to)`, `shuffle(random?)` | Editam pendentes por índices a partir de zero; falhas de validação preservam a fila |
| `queuePage(start = 0, count = 25)` | Copia apenas a página pedida; o padrão se limita aos itens restantes |
| `current`, `queue`, `state` | Cópias para consulta; `queueSize` evita copiar a fila |
| `position`, `isPaused`, `volume`, `activeFilters` | Posição estimada por relógio monotônico, pausa/conexão/timescale e configurações atuais |
| `isRecovering`, `recover()` | Estado de recuperação e retry explícito após uma falha |
| `drain()`, `destroy()` | Aguarda operações recebidas; destruição cancela controles e encerra voz/player |

Cada player serializa controles e eventos; servidores diferentes continuam
independentes. Até 128 controles podem aguardar por player, configuráveis por
`maxPendingControls`; excesso recebe `MUSIC_CONTROL_LIMIT`. `pendingControls`
permite observar essa carga. Eventos de faixa têm espaço reservado e duplicatas
pendentes são descartadas, mesmo quando os controles atingem o limite.
Um PATCH que falha ou devolve estado inválido não retira a próxima música da fila.
Identidade do servidor, faixa, configurações e estado da resposta REST são
validados antes da confirmação; backends próprios também precisam retornar
estado válido. Erro de
rede após confirmação remota pode deixar o resultado incerto: confira o estado
remoto antes de decidir repetir uma ação.

`TrackEndEvent` avança em `finished` e `loadFailed`; `stopped`, `replaced` e
`cleanup` seguem as regras do protocolo. O campo reservado
`userData.__yuzuhaPlayback` correlaciona a reprodução para descartar eventos
antigos/duplicados, inclusive músicas com o mesmo encoded. Escute `trackStart`,
`trackEnd`, `queueEnd`, `playerError`, `voiceClose`, `nodeDisconnect` e `recovered` no player. Eventos inesperados
de plugins não são tratados como fim de faixa. O `onError` do gerenciador recebe
falhas de avanço automático e recuperação.

## Recuperação após desconexão

Com `resumed: true`, o Lavalink mantém a reprodução e reenvia os eventos que
acumulou. O gerenciador preserva o player e não envia outro PATCH para reiniciar
a faixa. Com `resumed: false`, reconstrói faixa, posição conhecida, pausa, volume
e filtros. Uma transição automática interrompida recupera a próxima faixa;
respostas da sessão antiga não confirmam alterações locais na fila.

Com `audio`, a ponte reabre a saída da nova sessão e reaproveita a publicação de
voz quando ela continua conectada. Com `voice`, o adaptador recebe `join`
novamente para renovar as credenciais; seu `join` deve suportar essa renovação
para o mesmo servidor/canal, respeitar o signal e desfazer joins incompletos
quando falhar. A fila continua
na memória do gerenciador e não é reenviada inteira ao node.

`recoveryConcurrency` limita a reconstrução a quatro players simultâneos por
node por padrão. Ajuste-a se o node tiver um limite HTTP menor. Durante a
recuperação, controles recebem `MUSIC_RECOVERY_REQUIRED` até sua vez de executar
encontrar o player recuperado. Uma falha mantém `isRecovering` e é informada por
`playerError`/`onError`; depois de corrigir a causa, `await player.recover()`
repete a reconstrução explicitamente. Operações com confirmação incerta precisam
de consulta ao estado remoto antes desse retry.

Backends próprios podem fornecer `subscribeLifecycle`. Quando não fornecem,
`await manager.recoverNode(backend)` marca e reconstrói seus players, com os
mesmos limites. Não há migração automática entre nodes nem persistência após
reiniciar o processo; retomada WebSocket, reconstrução de sessão e persistência
são ciclos diferentes.

## Contexto, encerramento e testes

Passe `music` e/ou `voice` nas opções do bot. `ctx.music` e `ctx.voice` dão acesso
nativo aos serviços. A ausência recebe `NATIVE_UNAVAILABLE`. Esses serviços usam
a autoridade do bot: comandos devem validar servidor, canal e permissões antes
de chamar a integração. Eles não acrescentam funções `$...` nem guards de
moderação novos.

`bot.destroy()` drena comandos, encerra players/voz e destrói o client, propagando
falhas de encerramento. Os nodes Lavalink continuam sob responsabilidade do
chamador: após encerrar o bot, chame `await node.close()`. Stores fornecidos
conservam sua política anterior de propriedade.

`MockMusicBackend` e `mockTrack` vêm de `yuzuha/testing`. O exemplo abaixo e
[music-offline.ts](../examples/music-offline.ts) não conectam a nenhum servidor:

```ts
import { MusicManager } from 'yuzuha/music';
import { MockMusicBackend, mockTrack } from 'yuzuha/testing';

const backend = new MockMusicBackend();
const music = new MusicManager({ nodes: [backend] });
try {
  const player = music.createPlayer('100');
  player.enqueue([mockTrack('primeira'), mockTrack('segunda')]);
  await player.play();
  await player.skip();
  console.log(player.current?.info.title); // segunda
} finally { await music.close(); }
```

Protocolo consultado em 22/10/2026:
[REST Lavalink](https://lavalink.dev/api/rest),
[WebSocket Lavalink](https://lavalink.dev/api/websocket) e
[retomada de sessões](https://lavalink.dev/api/#resuming),
[plugins Lavalink](https://lavalink.dev/api/plugins) e
[voz Fluxer](https://github.com/fluxerjs/core/tree/main/packages/voice).
`npm run music:integration` inicia um Lavalink 4.2.2 local e verifica o plugin,
os controles Yuzuha e o decoder real do SDK de voz 3.1.0 com áudio sintético.
Somente a publicação no LiveKit é simulada; não há bot logado nem validação
auditiva em uma sala real. Medições de dispatch não medem latência de áudio.
