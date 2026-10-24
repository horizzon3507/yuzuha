# HTTP

`ctx.http` oferece requisições textuais, binárias, streaming e multipart. O
serviço padrão limita respostas a 1.000.000 bytes, impõe prazo total de 5 segundos
e bloqueia endereços privados, loopback e metadados de rede. Redirects passam
novamente pela política de hosts; credenciais são removidas ao mudar de origem.
O sinal do contexto cancela todas essas operações durante o encerramento.

## Respostas e streaming

```ts
const response = await ctx.http.stream({
  method: 'GET',
  url: 'https://api.example.com/export',
});

const reader = response.body.getReader();
try {
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    await consumeBytes(chunk.value);
  }
} finally {
  await reader.cancel();
  reader.releaseLock();
}
```

O retorno contém `status`, `ok`, `headers` e `body`, um
`ReadableStream<Uint8Array>`. A primeira parte da resposta pode ser consumida
antes de o servidor terminar. O limite de bytes é acumulado entre chunks e
`Content-Length` excessivo é recusado antes da leitura. O timeout permanece ativo
até terminar ou cancelar o corpo, inclusive quando ninguém começa a ler.
Cancelar o reader cancela o corpo recebido e remove o listener de cancelamento.

`request` reúne o corpo e decodifica UTF-8; `requestBytes` reúne bytes sem
conversão. Ambos retornam os mesmos metadados. Streaming está na API nativa; o
function mode continua usando respostas limitadas em memória com `$http` e
`$httpJson`.

## Multipart

```ts
const response = await ctx.http.multipart({
  method: 'POST',
  url: 'https://api.example.com/upload',
  parts: [
    { name: 'tag', value: 'relatório' },
    { name: 'tag', value: 'mensal' },
    {
      name: 'file',
      value: new Uint8Array([0, 255, 1]),
      filename: 'data.bin',
      contentType: 'application/octet-stream',
    },
  ],
});
```

Campos repetidos preservam sua ordem. Valores podem ser texto ou `Uint8Array`;
arquivos binários usam `file.bin` e `application/octet-stream` quando nome e MIME
são omitidos. O serviço cria `FormData`; o fetch define `Content-Type` com o
boundary correto. Cabeçalho `Content-Type` manual é recusado nesse método.

São permitidas de 1 a 100 partes. O nome tem de 1 a 128 caracteres, o arquivo
de 1 a 255 e o MIME até 127, com validação de formato e sem quebras de linha nos
metadados. `maxRequestBytes`, padrão 10.000.000, limita a soma de nomes e
metadados em UTF-8 com os valores textuais ou bytes binários decodificados. O
overhead de boundary e cabeçalhos gerados pelo FormData fica fora dessa soma.
Payloads e partes inválidas são recusados antes de iniciar o fetch. GET e HEAD
não aceitam multipart.

Em scripts, cada parte tem `value` textual ou `base64` canônico, sem espaços ou
quebras de linha, nunca ambos:

```text
$httpMultipart[POST;https://api.example.com/upload;$array[$object[name;file;base64;AP8=;filename;data.bin]]]
```

A função retorna o corpo textual da resposta e compartilha os mesmos limites e
cancelamento da API nativa. Valores recebidos permanecem dados; não são
reinterpretados como código.

## Políticas por comando

```ts
import { defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'status',
  http: {
    allowedHosts: ['api.example.com'],
    timeoutMs: 2000,
    maxBytes: 100_000,
    maxRequestBytes: 10_000,
  },
  async run(ctx) {
    const response = await ctx.http.request({
      method: 'GET', url: 'https://api.example.com/status',
    });
    await ctx.reply(response.body);
  },
});
```

`command.http` restringe o serviço antes de vinculá-lo ao sinal do contexto.
`service.withPolicy(policy)` permite aplicar a mesma regra em código nativo.
Hosts são intersectados com a lista do serviço pai; uma interseção vazia é
recusada. Hosts são exatos, sem wildcard, protocolo ou caminho. Os limites podem
ser reduzidos; valores maiores preservam o limite do pai. Uma política não pode
habilitar rede privada, substituir o fetch ou remover cancelamento.

Por exemplo, um serviço limitado a `a.example.com` e `b.example.com`, restringido
por um comando a `b.example.com` e `c.example.com`, permite apenas
`b.example.com`. Essa interseção também vale para cada redirect. `withSignal`
combina os sinais existentes, inclusive após `withPolicy`; um sinal por
requisição também não substitui o sinal do contexto.

Os erros incluem `HTTP_HOST`, `HTTP_PRIVATE`, `HTTP_TIMEOUT`,
`HTTP_BODY_TOO_LARGE`, `HTTP_REQUEST_TOO_LARGE`, `HTTP_MULTIPART` e
`HTTP_POLICY`. Cancelamento externo produz `EXECUTION_ABORTED` e não pode ser
capturado por `$try`.

Veja [guia nativo](NATIVE.md) e [referência de funções](FUNCTIONS.md).

## Streaming em scripts

```text
$httpStream[GET;https://api.yuzuha.example/export;$reply[Trecho $httpChunkIndex: $httpChunk]]
```

`httpStream` reavalia o terceiro argumento para cada trecho UTF-8 decodificado.
Corpo e cabeçalhos opcionais ocupam os argumentos quatro e cinco. O retorno
concatena as expressões concluídas do callback, sujeito ao limite de saída;
`reply` envia cada resposta e retorna vazio. O consumidor lê o próximo trecho
somente depois do callback, sem carregar a resposta inteira na memória.

`httpChunkIndex` começa em zero e `httpChunk` fornece texto literal. A decodificação
preserva caracteres divididos entre chunks; não cria mensagens SSE, linhas ou
objetos NDJSON automaticamente. Um trecho pode conter várias linhas ou parte de
uma. Esses formatos exigem um parser incremental próprio no modo nativo.

Até 1000 chunks de bytes são aceitos, além dos limites de resposta, tempo e
hosts da política HTTP do comando. Texto e retorno seguem o limite de saída do
runtime. `break` encerra o stream, `continue` pula o restante do callback e ambos
atravessam `try`. Streams aninhados restauram o contexto anterior. Cancelamento,
guards e limites propagam; o reader é cancelado e liberado em qualquer saída.
