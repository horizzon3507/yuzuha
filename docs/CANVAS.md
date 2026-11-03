# Canvas para cartões

`yuzuha/canvas` compõe cartões PNG, JPEG e WebP com texto, imagens, formas,
badges e barras. Use Canvas para montar uma imagem nova; use
[`yuzuha/images`](IMAGES.md) quando já tiver uma imagem e quiser transformá-la
com Sharp.

## Instalação

O backend é um peer opcional. Instale-o somente nos bots que renderizam Canvas:

```sh
npm install yuzuha@0.2.0 @napi-rs/canvas@^1.0.13
```

Os imports `yuzuha`, `yuzuha/functions` e `yuzuha/canvas` continuam disponíveis
sem o peer. Criar um bot, um `CanvasBuilder` ou uma cena não carrega Skia nem
inicia um processo. O pacote nativo só é importado pelo processo filho quando
`render()` começa. Sem uma versão compatível, a renderização falha com
`CANVAS_DEPENDENCY` e informa a instalação necessária. Canvas não depende de
Sharp.

## Um cartão nativo

Em comandos JS/TS, `ctx.canvas` usa o sinal de cancelamento, os limites HTTP e o
transporte do contexto. `send()` não lê `ctx.message`, então também funciona em
eventos sem mensagem:

```ts
const author = await ctx.resources.users.user(ctx.authorID);
const card = ctx.canvas.create(1000, 340, { scale: 2, background: '#101722' });
if (author.avatarURL) card.avatar(author.avatarURL, { x: 44, y: 92, size: 156 });
card.text(ctx.authorName, {
    x: 230, y: 68, maxWidth: 710,
    fontSize: 52, minFontSize: 34, weight: 700,
  })
  .badges([
    { text: 'Contributor', selected: true },
    { text: 'TypeScript' },
    { text: 'Community helper' },
  ], { x: 230, y: 178, maxWidth: 710 });

await ctx.canvas.send(card, { name: 'perfil.png' });
```

`send()` envia por `resources.messages.sendBytes` e retorna o ID da mensagem.
O canal padrão é `ctx.channelID`; passe `channelID` quando o evento não tiver
canal. O método aceita também `content`, `description`, `format`, `quality`,
`matte` e `timeoutMs`. A mensagem só é enviada depois de a renderização
terminar e o sinal ser verificado novamente.

Eventos JavaScript/TypeScript com contexto usam `bot.contextEvent`. O callback
recebe um `EventContext`; eventos como `guildMemberAdd` não precisam fornecer
uma mensagem:

```ts
bot.contextEvent({
  event: 'guildMemberAdd',
  channelID: '1234567890',
  run: async ctx => {
    const card = ctx.canvas.create(980, 300, { background: '#111923' })
      .text(`Bem-vindo, ${ctx.authorName}!`, { x: 32, y: 32, maxWidth: 900 });
    await ctx.canvas.send(card, { name: 'boas-vindas.png' });
  },
});
```

## Uso independente

`createCanvas()` de `yuzuha/canvas` cria o mesmo builder sem contexto de bot:

```ts
import { createCanvas } from 'yuzuha/canvas';
import { readFile, writeFile } from 'node:fs/promises';

const avatar = new Uint8Array(await readFile('./avatar.png'));
const image = await createCanvas(640, 240, { scale: 2, background: '#101722' })
  .avatar(avatar, { x: 24, y: 56, size: 128 })
  .text('Perfil demonstrativo', { x: 184, y: 64, maxWidth: 420, fontSize: 36, weight: 700 })
  .render();
await writeFile('./perfil.png', image.data);
```

Para buscar fontes ou imagens remotas no uso independente, passe `http` e,
opcionalmente, `signal`, `assets`, `fonts` e `timeoutMs` nas opções de
`createCanvas`. Sem `http`, fontes remotas são recusadas. Não são aceitos
caminhos, `file:` ou data URLs.

## Builder

Todas as chamadas de composição retornam o próprio builder. A ordem das
chamadas define a sobreposição. As coordenadas usam unidades lógicas; `scale`
altera somente a resolução física de 1 a 4.

| Método | Uso |
|---|---|
| `font(family, source, { weight? })` | Registra uma fonte TTF/OTF para a cena, peso 400 ou 700. |
| `rect(options)` | Retângulo com preenchimento, borda e raio. |
| `circle(options)` | Círculo pelo centro `x/y` e `radius`. |
| `line(options)` | Segmento com espessura, cor e acabamento. |
| `image(source, options)` | Imagem em uma caixa com ajuste e recorte. |
| `avatar(source, options)` | Imagem quadrada em círculo, com borda opcional. |
| `text(value, options)` | Texto com quebra, redução e overflow. |
| `badges(items, options)` | Fileira medida de badges com contador `+N`. |
| `progress(options)` | Barra limitada entre zero e `max`. |
| `render(options?)` | Retorna `Promise<CanvasResult>`. |

Retângulos e imagens usam a origem no canto superior esquerdo. Círculos usam o
centro. `opacity` vai de 0 a 1. Cada operação restaura o estado interno do
contexto de desenho. Sombras usam `{ color, blur, offsetX, offsetY }`. Cores
aceitas: hexadecimal e `rgb()`/`rgba()`; cores CSS desconhecidas são recusadas.

Preenchimentos aceitam uma cor ou um gradiente linear/radial. Gradientes usam
coordenadas lógicas e de 2 a 16 stops com offsets crescentes entre 0 e 1.
Retângulos, círculos, linhas, imagens e texto validam cores e medidas antes de
iniciar o worker.

Imagens aceitam `fit: 'cover' | 'contain' | 'stretch'`, com `cover` como padrão.
`cropX` e `cropY` ajustam o ponto de recorte entre 0 e 1; o padrão é o centro.
`clip` aceita `rect`, `rounded` ou `circle`. `contain` mantém transparentes as
áreas vazias. Avatares sempre usam recorte circular e `cover`.

Texto usa Inter, peso 400, 24 px, branco e alinhamento à esquerda por padrão.
`x/y` iniciam a caixa e `maxWidth` define seu limite horizontal; se omitido,
vale a largura restante do cartão. `wrap` aceita `none` ou `word`; `maxLines`
é 1 por padrão, `lineHeight` é 1.2 e `overflow` é `ellipsis`. `minFontSize`
permite reduzir a fonte para caber. Quebra e reticências respeitam grafemas
Unicode, incluindo acentos e sequências combinadas. Uma fonte própria adiciona
os glifos que contém; não há promessa de cobertura universal de idiomas ou
emojis.

Badges preservam a ordem, medem os rótulos, respeitam `maxWidth` e reservam
espaço para `+N`. Um item pode indicar destaque com `selected`. Progresso exige
`max > 0`; valores abaixo de zero ou acima do máximo são limitados aos extremos.

## Fontes e assets

Inter 4.1 Regular e Bold, sem alterações, está em `assets/canvas/`, com a licença
SIL OFL 1.1 e origem. O worker não depende das fontes instaladas no sistema.
Famílias próprias podem vir de `Uint8Array`, de `asset:nome` ou de uma URL
HTTP/HTTPS.

O código confiável da configuração pode carregar arquivos locais e registrar
os bytes no bot:

```ts
import { readFile } from 'node:fs/promises';
import { Yuzuha } from 'yuzuha';

const bot = new Yuzuha({
  canvas: {
    assets: { avatar: new Uint8Array(await readFile('./assets/avatar.png')) },
    fonts: {
      Marca: {
        regular: new Uint8Array(await readFile('./assets/Marca-Regular.ttf')),
        bold: new Uint8Array(await readFile('./assets/Marca-Bold.ttf')),
      },
    },
  },
});
```

Scripts podem usar `asset:avatar`, mas não recebem caminhos, bytes, base64,
objetos Skia nem acesso ao filesystem. Assets e fontes remotos passam por
`ctx.http.requestBytes`, portanto respeitam hosts permitidos, redirects,
status HTTP, cancelamento e limites de bytes do serviço existente. O padrão HTTP
é 1 MB. Para permitir respostas maiores, configure `new HttpService({
maxBytes: 10_000_000 })` no bot; Canvas não aumenta o limite por conta própria.
Um mesmo URL é baixado uma vez por renderização. Não há cache entre cenas.

Uma família própria desconhecida gera `CANVAS_INPUT`. Se uma fonte tiver apenas
arquivo regular, o peso 700 reutiliza esse arquivo. O limite conta até oito
arquivos próprios por cena.

## Formatos e snapshots

PNG é o padrão e mantém transparência. JPEG e WebP aceitam `quality` de 1 a 100,
padrão 85; informar `quality` para PNG gera `CANVAS_OPTIONS`. JPEG compõe áreas
transparentes sobre `matte`, branco por padrão. O resultado contém bytes
isolados em `Uint8Array`, formato, largura e altura físicos.

Se o nome for omitido, o anexo usa `canvas.png`, `canvas.jpg` ou `canvas.webp`.
Nomes sem extensão recebem a extensão correspondente; extensões fornecidas
precisam corresponder ao formato. Opções e bytes são copiados ao entrar no
builder. `render()` captura a cena antes do primeiro `await`; mudanças posteriores
afetam renderizações futuras.

## Function mode

O function mode oferece 12 funções da categoria `canvas`, levando o catálogo a
322 funções na 0.1.9. Elas retornam texto vazio, inclusive `$canvasSend`, para impedir
uma resposta automática além do anexo. IDs são únicos por execução, aceitam de 1
a 64 letras, números, `_` ou `-`, e podem ser reutilizados depois de
`$canvasDispose`. Enviar não descarta o builder; cada tentativa é explícita.

```text
$canvasCreate[perfil;1000;340;$object[scale;2;background;#101722]]
$canvasText[perfil;$username;48;48;$object[maxWidth;904;fontSize;50;minFontSize;28;weight;700]]
$canvasProgress[perfil;48;220;400;14;75;100;$object[fill;#70d8bc;background;#202938]]
$canvasSend[perfil;$object[name;perfil.png]]
```

| Função | Assinatura |
|---|---|
| `$canvasCreate` | `[id;largura;altura;opções?]` |
| `$canvasFont` | `[id;família;fonte;opções?]` |
| `$canvasRect` | `[id;x;y;largura;altura;opções?]` |
| `$canvasCircle` | `[id;x;y;raio;opções?]` |
| `$canvasLine` | `[id;x1;y1;x2;y2;opções?]` |
| `$canvasImage` | `[id;fonte;x;y;largura;altura;opções?]` |
| `$canvasAvatar` | `[id;fonte;x;y;tamanho;opções?]` |
| `$canvasText` | `[id;texto;x;y;opções?]` |
| `$canvasBadges` | `[id;itens;x;y;larguraMáxima;opções?]` |
| `$canvasProgress` | `[id;x;y;largura;altura;valor;máximo;opções?]` |
| `$canvasSend` | `[id;opções?]` |
| `$canvasDispose` | `[id]` |

Opções são objetos e arrays criados com as funções de linguagem existentes.
Cada `Evaluator` mantém seu próprio mapa privado, fora de `ctx.vars`, e o limpa
em `finally`, também em `$stop`, falhas e cancelamento. Duas execuções podem usar
o mesmo ID sem compartilhar canvases. Texto retornado de dados do usuário não é
reavaliado como código.

## Limites, processos e erros

| Recurso | Limite inicial |
|---|---:|
| Saída física por eixo | 4096 pixels |
| Pixels de saída ou entrada | 16.777.216 |
| Entrada por eixo | 8192 pixels |
| Operações por cena, incluindo itens de badges | 512 |
| Imagens distintas por cena | 64 |
| Fontes próprias por cena | 8 arquivos |
| Bytes por imagem ou fonte | 10 MB |
| Assets e fontes por cena | 20 MB |
| Texto por operação / cena | 4096 / 32.768 caracteres |
| Badges por chamada | 32 |
| Saída codificada | 10 MB |
| Prazo padrão / configurável | 5000 / 10–30.000 ms |
| Script por execução | 4 canvases ativos e 4 tentativas de envio |

PNG, JPEG e WebP estáticos têm assinatura, estrutura e dimensões inspecionadas
antes do decode. GIF, SVG, dados truncados e imagens animadas são recusados; as
dimensões são conferidas outra vez depois de decodificar. O prazo inclui assets,
inicialização, desenho, codificação e encerramento. Cancelamento e timeout
encerram o processo filho. Canvas e Sharp compartilham duas vagas de processo,
sem fila implícita. O heap JS do processo filho é limitado, mas isso não define
um teto de RSS da memória nativa.

- `CANVAS_OPTIONS`: opções, formatos, cores ou medidas inválidas.
- `CANVAS_INPUT`: imagem/fonte inválida ou família não registrada.
- `CANVAS_ASSET`: alias ausente, HTTP sem sucesso ou remoto sem serviço HTTP.
- `CANVAS_STATE`: ID duplicado/inexistente ou builder de outro contexto.
- `CANVAS_DEPENDENCY`: peer ausente ou incompatível.
- `CANVAS_PROCESS`: falha no worker, decode ou codificação.
- `EXECUTION_LIMIT`: quota, concorrência, prazo ou tamanho excedidos.
- `EXECUTION_ABORTED`: contexto cancelado.

`$try` pode capturar falhas normais de opções, assets e estado para permitir
fallback explícito. Guards, limites e cancelamento continuam atravessando
`$try`. Renderizações e envios não são repetidos automaticamente.

## Exemplos offline

Os exemplos usam uma fixture local e dados demonstrativos. Eles cobrem perfil,
boas-vindas em evento sem mensagem e ranking com dez nomes e barras:

```sh
npm run examples:canvas
```

Os fontes JS/TS, scripts e PNGs exportados ficam em
[`examples/canvas`](../examples/canvas). Os exemplos chamam o renderer real e
não fazem login nem tráfego de rede.
