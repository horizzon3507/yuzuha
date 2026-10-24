# Imagens e anexos por stream

O módulo `yuzuha/images` é opcional e separado do runtime e da raiz da biblioteca.
Ele usa `sharp` instalado pelo consumidor; importar a raiz do Yuzuha não carrega
a biblioteca de imagens nem inicia processos.

## Instalação e transformação

```sh
npm install yuzuha@0.1.7 sharp@^0.35.5
```

```ts
import { transformImage } from 'yuzuha/images';

const result = await transformImage(bytes, {
  format: 'webp',
  width: 512,
  height: 512,
  fit: 'inside',
  grayscale: false,
  quality: 85,
}, { signal: ctx.signal, timeoutMs: 5000 });

await ctx.resources.messages.sendBytes(ctx.message.channelID, [{
  name: 'yuzuha.webp',
  data: result.data,
}]);
```

`bytes` deve ser um `Uint8Array` já obtido por uma fonte confiável ou pelo serviço
HTTP sujeito à política do comando. O módulo não abre caminhos de arquivo nem
faz downloads a partir de strings. Retorna `data`, `format`, `width` e `height`.
O chamador é responsável por autorizar o envio e escolher o canal.

Entradas aceitas: PNG, JPEG e WebP estáticos. Saída: `png` (padrão), `jpeg` ou
`webp`. SVG, PDF, GIF, arquivos arbitrários e imagens animadas são recusados.
`rotate` aceita 0, 90, 180 ou 270 graus. `grayscale` é booleano; `quality` vai de
1 a 100, padrão 80 para JPEG/WebP. PNG usa compressão sem redução de paleta.
Os metadados são removidos na saída; a orientação EXIF não é aplicada
implicitamente. Para girar, informe `rotate`.

## Dimensões e limites

`width` e `height` aceitam inteiros de 1 a 4096; informe um ou ambos.
`fit` aceita `inside` (padrão), `contain` ou `cover`. A transformação não amplia
imagens menores; `contain` pode acrescentar bordas ao canvas solicitado.
Os pixels de entrada são limitados a 16777216 e cada entrada/saída a 10 MB.

Até dois processos de transformação podem executar simultaneamente por processo
do bot. Não há fila implícita. O prazo padrão é 5000 ms; aceita 10–30000 ms e
inclui inicialização, transformação e encerramento. Cancelamento ou prazo encerra
o processo filho, incluindo o processamento nativo, e libera a vaga depois de
confirmar seu fechamento. A entrada é copiada e não é transferida ou alterada.

Cada filho usa um thread de processamento, cache Sharp desabilitado e heap JS
limitado a 128 MB. Memória nativa do decoder é limitada indiretamente por bytes,
pixels e concorrência; isso não constitui um teto rígido de RSS. Não há
composição com canvas, texto, fontes ou acesso ao sistema de arquivos na API.

## Erros

- `IMAGE_DEPENDENCY`: Sharp ausente ou sem binário compatível; instale-o no bot.
- `IMAGE_INPUT`: bytes vazios/excessivos ou formato não permitido.
- `IMAGE_OPTIONS`: dimensões, formato, rotação, qualidade ou prazo inválidos.
- `IMAGE_PROCESS`: decoder recusou dados corrompidos, pixels excessivos ou outra
  falha no processo. O módulo não tenta repetir a transformação.
- `EXECUTION_LIMIT`: prazo, concorrência ou tamanho da saída excedidos.
- `EXECUTION_ABORTED`: sinal cancelado.

O peer opcional permite usar o restante do Yuzuha sem instalar Sharp. O sistema
operacional e a arquitetura precisam ser suportados pelos binários da versão
instalada. Veja a [instalação do Sharp](https://sharp.pixelplumbing.com/install/)
e sua [API de saída](https://sharp.pixelplumbing.com/api-output/).

## Entrada de anexo por stream

```ts
const response = await ctx.http.stream({
  method: 'GET', url: 'https://api.yuzuha.example/export',
});
await ctx.sendStream(response.body, {
  name: 'exportacao.bin',
  content: 'Exportação do Yuzuha',
  maxBytes: 2_000_000,
  timeoutMs: 5000,
});
```

`sendStream` aceita `ReadableStream<Uint8Array>` e responde com o ID da mensagem.
O terceiro argumento opcional escolhe o canal; o padrão é o canal atual. Nome e
opções são validados antes de adquirir o reader. Copia chunks, aceita até 10000
e limita o total a `maxBytes` (1–10000000, padrão 10000000). O prazo de leitura
aceita 1–30000 ms, padrão 5000. Falha, overflow, timeout e cancelamento descartam
o conteúdo e não enviam anexos parciais. O reader é cancelado e liberado.

A leitura usa backpressure, mas acumula os bytes antes de chamar `sendBytes`:
o SDK 3.3.0 aceita Blob/ArrayBuffer/Uint8Array/URL, sem contrato de upload por
ReadableStream. Portanto isso não é transmissão contínua de multipart pela rede.
Memória cresce com os bytes lidos; o buffer final exige outra cópia. O prazo
refere-se à leitura, não ao upload do SDK. Depois de iniciar o envio, o método
aguarda a confirmação ou falha do transporte; não devolve cancelamento como se
uma mensagem já enviada pudesse ser desfeita. `ATTACHMENT_TIMEOUT` identifica
prazo de leitura e `EXECUTION_LIMIT` identifica bytes/chunks excessivos.
