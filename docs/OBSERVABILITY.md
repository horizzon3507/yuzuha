# Logs e correlação

`onLog` é opcional. O Yuzuha entrega objetos ao callback escolhido pelo bot;
não envia esses eventos para um serviço externo nem instala um logger global.

```ts
import { Yuzuha } from 'yuzuha';

const bot = new Yuzuha({
  onLog(record) { console.log(JSON.stringify(record)); },
});
```

Os registros têm `timestamp` ISO e um `event`:

| Evento | Campos específicos |
|---|---|
| `command.start` | `executionID`, `command` |
| `command.finish` | Mesmos campos, `outcome`, `durationMs` |
| `event.start` | `executionID`, `command` no formato `event:nome` |
| `event.finish` | Mesmos campos, `outcome`, `durationMs` |
| `error` | `errorCode`, contexto de execução quando houver |
| `schedule.start` | `scheduleID`, `executionID` da claim |
| `schedule.finish` | Mesmos campos, `status`, `durationMs`, `retryable`, `errorCode?` |
| `schedule.error` | `errorCode` da falha de manutenção |

`ctx.executionID` permite correlacionar logs próprios ao comando. Uma execução
agendada compartilha o ID da claim com seu despacho, ligando os eventos de tarefa
e comando. O resultado de comando pode ser `success`, `guarded` ou
`error`; mensagens ignoradas não criam contexto ou eventos de comando.

Os campos automáticos não contêm o conteúdo da mensagem, argumentos, cabeçalhos,
token, stack ou mensagem de erro. Erros conhecidos usam um código; os demais
recebem `UNEXPECTED_ERROR`. O histórico persistente do scheduler contém a tarefa
original, incluindo `input`, e deve receber a mesma proteção do store.

`onError(error, ctx?)` continua disponível para diagnóstico com a causa original;
o código do bot decide o que registrar desse objeto. Eventos nativos podem não
ter contexto de comando. `onCommand(ctx, outcome)` mantém seu contrato anterior.
Eventos de script fornecem `EventContext` a `onError`, incluindo `ctx.event`,
mas não chamam `onCommand`. O payload do evento não é incluído nos logs
automáticos. Veja [EVENTS.md](EVENTS.md).

Callbacks são confiáveis e aguardados. Uma falha de `onLog` gera apenas
`LOG_HANDLER_FAILED` no stderr e não altera o resultado do comando. Hooks podem
pedir `bot.destroy()`; o pedido interno retorna e o encerramento drena o trabalho
após o retorno do hook. Evite I/O lento nesse caminho se o tempo dos comandos
for relevante para seu bot.
