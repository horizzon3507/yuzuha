# Saída de áudio Lavalink para Fluxer

O plugin `yuzuha-audio` exporta o áudio dos players do Lavalink em WebM/Opus.
`FluxerLavalinkBridge` entrega esse stream ao `@fluxerjs/voice`. Pausa, seek,
filtros, volume e eventos continuam no Lavalink; o bot não precisa de FFmpeg.

Compatibilidade verificada: Lavalink **4.2.2**, Java **21**, Node **22/26** e
`@fluxerjs/voice` **3.1.0**. O plugin compila para Java 17 usando exclusivamente
a API pública e as dependências fornecidas pelo servidor.

## Instalação no servidor

No checkout do Yuzuha, com JDK 17 ou superior (`java`, `javac` e `jar` no PATH):

```sh
npm run music:build-plugin
```

O script baixa o Lavalink 4.2.2 oficial, verifica seu SHA-256 e gera
`bridges/lavalink/build/yuzuha-audio-0.1.8.jar`. Para usar uma cópia já baixada:

```sh
YUZUHA_LAVALINK_JAR=/caminho/Lavalink.jar npm run music:build-plugin
```

Copie apenas `yuzuha-audio-0.1.8.jar` para o diretório `plugins/` do seu Lavalink.
Reinicie esse servidor. O [application.yml](application.yml) de exemplo usa
`LAVALINK_PASSWORD` no ambiente, limita a saída a 128 conexões e desativa fontes
de arquivos/HTTP. Ative os source managers e plugins de busca necessários ao bot.
Se o bot estiver em outra máquina, ajuste o endereço do servidor e o proxy.

O pacote npm também inclui os fontes e o compilador em `bridges/lavalink/`.
Na instalação npm, execute `node node_modules/yuzuha/bridges/lavalink/build.mjs`.
Java é necessário apenas no servidor/build do plugin; o bot usa Node.

## Configuração do bot

```sh
npm install @fluxerjs/voice@^3.1.0
```

```ts
import { FluxerVoice, FluxerLavalinkBridge, LavalinkNode, MusicManager } from 'yuzuha/music';

const voice = new FluxerVoice(client);
const audio = new FluxerLavalinkBridge({ voice });
const node = new LavalinkNode({
  url: 'http://127.0.0.1:2333',
  password: process.env.LAVALINK_PASSWORD!,
  userID: client.user!.id,
});
node.on('nodeError', console.error);
await node.connect();
const music = new MusicManager({ nodes: [node], audio, onError: console.error });
const player = music.createPlayer(guildID);
await player.connect(channelID);
player.enqueueResult(await music.search('scsearch:termo'));
await player.play();
```

Nesse exemplo, aguarde o client estar pronto para ler `client.user.id`. Um ID de
bot configurado permite preparar a integração antes de `bot.login()`.
Valide servidor/canal/permissões no comando.
Veja o [exemplo completo](../../examples/lavalink.ts) e o
[guia de música](../../docs/MUSIC.md). Se construir `Yuzuha({ client, music, voice })`,
`bot.destroy()` encerra os players e a voz. O chamador encerra o node com
`await node.close()`.

## Transporte e limites

- `GET /v4/yuzuha/info` informa protocolo, formato e conexões ativas.
- `GET /v4/yuzuha/sessions/{sessionId}/players/{guildId}/audio` abre a saída.
- Ambos exigem o header `Authorization` do Lavalink. Não coloque senhas na URL.
- O stream usa Opus estéreo a 48 kHz, frames de 20 ms e uma publicação contínua
  por player, inclusive entre faixas e durante pausa. Frames ociosos são silêncio.
- O plugin não transcodifica os frames Opus. O SDK oficial decodifica e publica
  no LiveKit; sua implementação atual publica áudio mono.
- Há dois threads de envio compartilhados e I/O assíncrono. Um consumidor lento
  interrompe a extração de frames; após 15 segundos sem escrita, sua saída fecha.
  A próxima conexão pode retomar o mesmo player.
- Há apenas um consumidor por sessão/player (`409`); excesso global retorna
  `429`. Destruir o player/sessão fecha suas saídas. Não conecte o mesmo player
  simultaneamente a outro transporte de voz: a saída do plugin consome seu áudio.
- `Cache-Control: no-store` e `X-Accel-Buffering: no` acompanham a resposta.
  Configure proxies para streaming, sem buffering e com timeout adequado.

## Verificação local

```sh
npm run music:integration
```

Requer JDK e o peer de voz instalado. Inicia um Lavalink local temporário com
áudio sintético, usa o plugin real, os controles Yuzuha e o decoder oficial do
SDK. Testa áudio audível, silêncio em pausa/volume zero, seek, filtros, avanço de
fila, reinício do servidor, autenticação, limites e descarte dos recursos.
Somente a publicação no LiveKit é simulada; não há login de bot.

Relatórios da validação: [Node 22](results/node22.json) e
[Node 26](results/node26.json), com RMS dos trechos, controles verificados e
SHA-256 do servidor, plugin e código executados.
