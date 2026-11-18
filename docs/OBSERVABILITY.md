# Logs, correlação e métricas

`onLog`, `logger` e `metrics` são opcionais. O Yuzuha entrega eventos estruturados e
observações operacionais aos adaptadores escolhidos pelo bot; não envia dados para
serviços externos nem instala estado global.

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
| `debug` | `command.start`, `command.finish`, `event.start`, `event.finish`, `sdk.debug` |
| `info` | `schedule.start`, `schedule.finish`, `gateway.ready`, `gateway.resumed`, `gateway.shard_ready`, `gateway.shard_resumed` |
| `warn` | `transport.retry`, `message.ttl_failed`, `authorization.disabled`, `dispatch.dropped`, `rate_limit.evicted`, `shutdown.timeout`, `gateway.shard_reconnecting`, `gateway.shard_disconnect`, `gateway.sharding_required`, `sdk.warn` |
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
| `shutdown.timeout` | `pending?` com a quantidade de execuções ainda ativas no prazo |
| `schedule.start` | `scheduleID`, `executionID` da claim |
| `schedule.finish` | Mesmos campos, `status`, `durationMs`, `retryable`, `errorCode?` |
| `schedule.error` | `errorCode` da falha de manutenção |
| `gateway.ready` | `executionID` |
| `gateway.resumed` | `executionID` |
| `gateway.shard_ready` | `shardID`, `executionID` |
| `gateway.shard_resumed` | `shardID`, `executionID` |
| `gateway.shard_reconnecting` | `shardID`, `executionID` |
| `gateway.shard_disconnect` | `shardID`, `closeCode`, `executionID` |
| `gateway.sharding_required` | `shardID`, `numShards`, `executionID` |
| `sdk.warn` | `message`, `executionID` |
| `sdk.debug` | `message`, `executionID` (somente com `gatewayLogs: { debug: true }`) |

## Ciclo de vida do gateway e shards (`gatewayLogs`)

Por padrão, eventos informativos e de reconexão do gateway não geram registros em
`onLog`/`logger`. Configure `gatewayLogs: true` ou `gatewayLogs: { debug?: boolean }`
(`GatewayLogOptions`) em `YuzuhaOptions` para encaminhar `Ready`, `Resumed`,
`ShardReady`, `ShardResumed`, `ShardReconnecting`, `ShardDisconnect`,
`ShardingRequired` e `'warn'` do client. Opções inválidas lançam `ConfigError`
com código `GATEWAY_LOG_OPTIONS`.

```ts
const bot = new Yuzuha({
  logger: createConsoleLogger({ level: 'debug' }),
  gatewayLogs: { debug: true },
});
```

Eventos `Events.Debug` (`sdk.debug`) só recebem listener quando `debug: true` é
habilitado explicitamente em `gatewayLogs`. Cada emissão cria um `executionID`
próprio com `source: 'gateway'` e `event` igual ao nome do evento do SDK em
`currentExecution()`. Tanto `destroy()` quanto falhas em `login()` drenam os
registros em andamento e removem 100% dos listeners anexados pelo bot (preservando
listeners do consumidor em um `Client` injetado); uma nova chamada a `login()`
reconecta os listeners sem duplicação.

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
| `event` | Nome do evento em `bot.on`, `contextEvent`, `scriptEvent` e `gatewayLogs` |
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

Os campos automáticos de comandos, eventos e erros não contêm o conteúdo da
mensagem, argumentos, cabeçalhos, token, stack ou mensagem de erro (`sdk.warn` e
`sdk.debug`, quando `gatewayLogs` está ativo, repassam o texto `message` emitido
pelo SDK). Erros conhecidos usam um código; os demais recebem `UNEXPECTED_ERROR`.
O histórico persistente do scheduler contém a tarefa original, incluindo `input`,
e deve receber a mesma proteção do store.

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

## Métricas operacionais (`MetricsSink` e `yuzuha/metrics`)

`YuzuhaOptions.metrics` aceita qualquer objeto compatível com a porta `MetricsSink`
(reexportada em `yuzuha` e `yuzuha/metrics`). Opções inválidas lançam `ConfigError`
com código `METRICS_OPTIONS`. Exceções síncronas ou promises rejeitadas por um
`MetricsSink` customizado são contidas e nunca derrubam comandos, eventos ou o
agendador.

| Método de `MetricsSink` | Campos observados |
|---|---|
| `onCommand?(event)` | `{ command, outcome: 'success' \| 'guarded' \| 'error', durationMs }` |
| `onDispatchDropped?(event)` | `{ reason: 'concurrency', guildID? }` |
| `onError?(event)` | `{ source: 'command' \| 'event' \| 'gateway' \| 'scheduler' \| 'hook', code }` |
| `onTransportRetry?(event)` | `{ attempt, delayMs }` |
| `onSchedule?(event)` | `{ outcome: 'completed' \| 'failed' \| 'cancelled', durationMs? }` |
| `onActiveExecutions?(activeExecutions)` | Inteiro não negativo com a quantidade atual de execuções ativas |

O subpath `yuzuha/metrics` fornece `PrometheusMetrics` e `createPrometheusMetrics`
sem dependências externas:

```ts
import { Yuzuha } from 'yuzuha';
import { createPrometheusMetrics } from 'yuzuha/metrics';

const metrics = createPrometheusMetrics({
  prefix: 'yuzuha',
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
});

const bot = new Yuzuha({ metrics });

// Em um endpoint HTTP de raspagem:
// Content-Type: metrics.contentType ('text/plain; version=0.0.4; charset=utf-8')
const exposition = metrics.render();
```

`PrometheusMetricsOptions` aceita `prefix` (padrão `'yuzuha'`), `buckets` em
milissegundos (estritamente crescentes, positivos e finitos) e `maxSeries`
(padrão `10_000`, limitando a cardinalidade por família). Valores de labels
escapam `\\`, `\n` e `"` conforme o formato Prometheus text exposition `0.0.4`, e
`metrics.reset()` zera contadores, histogramas e gauges em testes.

Séries emitidas com o prefixo padrão `yuzuha`:

- `yuzuha_commands_total{command,outcome}` e `yuzuha_command_duration_milliseconds`
- `yuzuha_dispatch_dropped_total{reason,guild_id?}`
- `yuzuha_errors_total{source,code}`
- `yuzuha_transport_retries_total{attempt}` e `yuzuha_transport_retry_delay_milliseconds_total`
- `yuzuha_scheduler_executions_total{outcome}` e `yuzuha_scheduler_duration_milliseconds`
- `yuzuha_active_executions`

## Healthcheck (`bot.health()` e `startHealthServer`)

`bot.health()` retorna um `HealthReport` congelado sem fazer I/O de rede:

```ts
import { startHealthServer, Yuzuha } from 'yuzuha';
import { createPrometheusMetrics } from 'yuzuha/metrics';

const metrics = createPrometheusMetrics();
const bot = new Yuzuha({ metrics });
const health = await startHealthServer(bot, {
  port: 8080,
  host: '127.0.0.1',
  metrics,
});

console.log(bot.health());
// { status: 'starting', ready: false, closing: false, uptimeMs: null, activeExecutions: 0, schedulerRunning: false, timestamp: ... }

// No encerramento:
await bot.destroy();
await health.close();
```

Campos de `HealthReport`:

| Campo | Descrição |
|---|---|
| `status` | `'starting'` antes do `Ready`, `'ok'` quando conectado e pronto, `'closed'` a partir de `destroy()` |
| `ready` | `true` somente quando o client está pronto e o bot não está encerrando |
| `closing` | `true` após o início de `destroy()` |
| `uptimeMs` | Tempo ativo em ms quando `status === 'ok'`, ou `null` nos demais estados |
| `activeExecutions` | Quantidade instantânea de comandos, eventos e varreduras em andamento |
| `schedulerRunning` | `true` enquanto o ciclo automático do `Scheduler` está ativo |
| `timestamp` | Instante em ms segundo `options.now ?? Date.now` |

`startHealthServer(bot, options?)` sobe um servidor `node:http` vinculado por
padrão a `127.0.0.1` (`port` inteiro `0..65535`, `path` padrão `'/health'`,
aceitando também `'/healthz'`). Opções inválidas lançam `ConfigError` com código
`HEALTH_OPTIONS`.

- `GET` e `HEAD` em `/health` ou `/healthz`: respondem `200` com
  `application/json; charset=utf-8` quando `status === 'ok'` e `503` quando
  `'starting'` ou `'closed'`.
- `GET` e `HEAD` em `/metrics` (somente quando `options.metrics` é fornecido):
  respondem `200` com `metrics.render()` e `metrics.contentType` (padrão
  `text/plain; version=0.0.4; charset=utf-8`).
- Outros métodos HTTP retornam `405` (`Allow: GET, HEAD`); outras rotas retornam `404`.
- Na CLI, `yuzuha run --health-port <porta>` e `yuzuha dev --health-port <porta>`
  gerenciam a abertura, a publicação automática de `/metrics` (se `bot.options.metrics`
  expor `render()`) e o fechamento determinístico durante sinais ou falhas. Veja [CLI.md](CLI.md).
