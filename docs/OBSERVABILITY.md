# Logs e correlação

`onLog` e `logger` são opcionais. O Yuzuha entrega eventos estruturados ao callback
ou logger escolhido pelo bot; não envia esses eventos para um serviço externo nem
instala um logger global.

```ts
import { createConsoleLogger, Yuzuha } from 'yuzuha';

const bot = new Yuzuha({
  logger: createConsoleLogger({ level: 'info' }),
  onLog(record) { console.log(JSON.stringify(record)); },
});
```

## Logger estruturado (`logger`)

`YuzuhaOptions.logger` aceita um `YuzuhaLogger` (compatível com Pino: `info`,
`warn`, `error` obrigatórios, além de `debug` e `child` opcionais) ou `false`.
Opções inválidas lançam `YuzuhaError` com código `LOGGER_OPTIONS`.

`createConsoleLogger({ level? })` cria uma implementação padrão sobre `console`
(`'debug' | 'info' | 'warn' | 'error'`, padrão `'info'`), respeitando o nível
mínimo e propagando bindings em `child(bindings)`.

O framework encaminha os eventos de log para `logger` usando `(campos, evento)`
nos seguintes níveis:

| Nível | Eventos |
|---|---|
| `debug` | `command.start`, `command.finish`, `event.start`, `event.finish` |
| `info` | `schedule.start`, `schedule.finish` |
| `warn` | `transport.retry`, `message.ttl_failed`, `authorization.disabled`, `dispatch.dropped`, `rate_limit.evicted` |
| `error` | `error`, `schedule.error` |

Se `logger.debug` for omitido, eventos `debug` são ignorados sem erro. Falhas
lançadas por métodos do `logger` são contidas e não alteram o resultado do
comando.

Quando `onError` não está configurado, falhas reportadas passam a chamar
`logger.error({ code, source, trigger?, executionID?, command?, err }, '[yuzuha]')`. Com
`logger: false`, o fallback padrão em `console.error` e as mensagens de ciclo de
vida/recarga da CLI ficam silenciosos; com `logger: undefined`, o comportamento
anterior via `console` é preservado.

## Eventos e campos

Os registros têm `timestamp` ISO e um `event`:

| Evento | Campos específicos |
|---|---|
| `command.start` | `executionID`, `command` |
| `command.finish` | Mesmos campos, `outcome`, `durationMs` |
| `event.start` | `executionID`, `command` no formato `event:nome` |
| `event.finish` | Mesmos campos, `outcome`, `durationMs` |
| `error` | `errorCode`, `source`, `trigger?`, `executionID?`, `command?` |
| `transport.retry` | `attempt`, `delayMs?`, `executionID?` |
| `message.ttl_failed` | `messageID`, `channelID`, `executionID?`, `errorCode?` |
| `authorization.disabled` | Sem campos extras |
| `dispatch.dropped` | `reason`, `guildID?`, `channelID?` |
| `rate_limit.evicted` | Sem campos extras |
| `schedule.start` | `scheduleID`, `executionID` da claim |
| `schedule.finish` | Mesmos campos, `status`, `durationMs`, `retryable`, `errorCode?` |
| `schedule.error` | `errorCode` da falha de manutenção |

## Correlação implícita (`currentExecution`)

O framework propaga um `ExecutionStore` congelado via `AsyncLocalStorage` através
de chamadas assíncronas (`await`). Serviços auxiliares podem ler o contexto sem
receber `ctx`:

```ts
import { currentExecution } from 'yuzuha';

function registrarOperacao() {
  const exec = currentExecution();
  // { executionID, source: 'command' | 'event' | 'gateway' | 'scheduler', ... }
  return exec?.executionID;
}
```

| Campo | Descrição |
|---|---|
| `executionID` | Mesmo valor de `ctx.executionID` (ou da claim no scheduler) |
| `source` | `'command'`, `'event'`, `'gateway'` ou `'scheduler'` |
| `command` | Nome resolvido do comando ou subcomando, quando aplicável |
| `event` | Nome do evento em `contextEvent` e `scriptEvent` |
| `guildID`, `channelID`, `userID` | Identificadores da execução, quando presentes |

Fora de uma execução do bot, `currentExecution()` retorna `undefined`. Falhas
reportadas sem `ctx` e eventos `transport.retry` herdam automaticamente o
`executionID` da execução corrente. O escopo também registra o bot dono da
execução: chamar `botA.destroy()` dentro de um handler de `botA` retorna
imediatamente para evitar deadlock, enquanto chamar `botB.destroy()` a partir do
mesmo handler aguarda a drenagem de `botB`.

`ctx.executionID` continua disponível diretamente no contexto. Uma execução
agendada compartilha o ID da claim com seu despacho, ligando os eventos de tarefa
e comando. O resultado de comando pode ser `success`, `guarded` ou
`error`; mensagens ignoradas não criam contexto ou eventos de comando.

Os campos automáticos não contêm o conteúdo da mensagem, argumentos, cabeçalhos,
token, stack ou mensagem de erro. Erros conhecidos usam um código; os demais
recebem `UNEXPECTED_ERROR`. O histórico persistente do scheduler contém a tarefa
original, incluindo `input`, e deve receber a mesma proteção do store.

`onError(error, ctx, info)` continua disponível para diagnóstico com a causa
original; o código do bot decide o que registrar desse objeto. O terceiro
parâmetro `info` (`ErrorReportInfo`) é congelado e traz `source`
(`'command' | 'event' | 'gateway' | 'scheduler' | 'hook'`), além de `event?`,
`ctx?` e `executionID?` quando disponíveis; assinaturas com um ou dois parâmetros
permanecem compatíveis. Nos registros de log de `error`, `source` identifica a
origem e `trigger?` traz o nome do evento disparador (como `'error'`,
`'shardError'`, `'messageCreate'` ou o evento registrado). Eventos nativos podem
não ter contexto de comando. `onCommand(ctx, outcome)` mantém seu contrato
anterior. Eventos de script e `contextEvent` fornecem `EventContext` a
`onError`, incluindo `ctx.event`, mas não chamam `onCommand`. O payload do
evento não é incluído nos logs automáticos. Veja [EVENTS.md](EVENTS.md).

Callbacks são confiáveis e aguardados. Uma falha de `onLog` gera apenas
`LOG_HANDLER_FAILED` no stderr e não altera o resultado do comando. Hooks podem
pedir `bot.destroy()`; o pedido interno retorna e o encerramento drena o trabalho
após o retorno do hook. Evite I/O lento nesse caminho se o tempo dos comandos
for relevante para seu bot.
