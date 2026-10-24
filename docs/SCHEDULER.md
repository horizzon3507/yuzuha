# Agendamentos

`ctx.scheduler` e `bot.scheduler` compartilham o mesmo serviço. Tarefas guardam o
autor e o servidor original; funções de script só editam, cancelam e reexecutam
tarefas do próprio autor no mesmo servidor. Comandos agendados passam novamente
pelos guards e pelas permissões durante a execução.

## Cron e fuso horário

```ts
await ctx.scheduler.addCron({
  guildID: ctx.guildID,
  channelID: ctx.message.channelID,
  authorID: ctx.authorID,
  command: 'resumo',
  input: '',
  expression: '0 18 * * 1-5',
  timezone: 'America/Bahia',
  missedRun: 'run-once',
});
```

```text
$scheduleCron[0 18 * * 1-5;America/Bahia;resumo;;$object[missedRun;skip]]
```

Os cinco campos são minuto (0–59), hora (0–23), dia do mês (1–31), mês (1–12) e
dia da semana (0–7, domingo 0 ou 7). São aceitos `*`, listas (`1,3,5`), faixas
(`1-5`) e passos (`*/15`, `10-50/10`). Nomes de meses/dias, segundos, `@daily`,
`L`, `W`, `#` e código JavaScript não fazem parte da sintaxe.

Quando dia do mês e dia da semana são ambos restritos, basta um dos dois
corresponder. Se um campo começa com `*`, os valores de ambos devem corresponder.
Expressões sem datas possíveis, fusos desconhecidos e cron junto com `interval`
são recusados antes de salvar. O serviço busca a próxima ocorrência em até oito
anos; ausência de ocorrência nessa janela produz `CRON_UNREACHABLE`. Se isso
ocorrer depois de um handler bem-sucedido, a tarefa termina com esse código no
histórico e sem reexecução automática do handler.

O fuso precisa ser um nome IANA reconhecido pelo `Intl` do Node, como
`America/Bahia`, `America/New_York` ou `UTC`; deslocamentos como `+03:00` são
recusados. Minutos locais que desaparecem numa transição de horário de verão são
pulados. Minutos que aparecem duas vezes no recuo do relógio geram duas
ocorrências, com instantes UTC distintos. Atualizações da base de fusos do Node
podem alterar ocorrências futuras. O campo `after` de `addCron` define uma
referência explícita, exclusiva, em milissegundos; o padrão é o relógio atual.

## Execuções perdidas e edição

`missedRun: 'run-once'`, padrão de `addCron`, executa uma vez ao encontrar uma
tarefa atrasada e avança para a primeira ocorrência posterior ao término.
`'skip'` descarta minutos já encerrados: uma ocorrência do minuto atual ainda
pode executar. Após indisponibilidade prolongada, não há replay de todas as
ocorrências perdidas. Tentativas operacionais de retry não são descartadas por
`skip`.

`edit(id, { cron, timezone, missedRun, ...retry }, access?)` atualiza uma tarefa
ociosa. Mudar expressão ou fuso recalcula o vencimento a partir do relógio atual,
exceto quando `due` é informado explicitamente. `cron: null` remove cron, fuso e
política; `interval: null` remove intervalo. Para trocar intervalo por cron,
remova o intervalo na mesma edição. Pausa e retomada mantêm a política; a retomada
pode receber um vencimento explícito. Uma tarefa com claim ativa recusa edição,
pausa ou retomada.

## Concorrência e retry

```ts
import { Scheduler } from 'yuzuha';

const scheduler = new Scheduler(store, execute, {
  concurrency: 4,
  globalConcurrency: 8,
  leaseMs: 300_000,
  heartbeatMs: 100_000,
});
```

`concurrency` limita os handlers simultâneos nesta instância, de 1 a 128, com
padrão 1. Ticks sobrepostos compartilham a execução já em andamento; um tick
posterior consulta as tarefas novamente. Cada worker reivindica sua tarefa em
uma transação imediatamente antes de executar. Instâncias que compartilham um
store transacional não reivindicam a mesma tarefa simultaneamente. SQLite é a
opção para processos concorrentes; stores JSON exigem um único processo escritor.

`globalConcurrency` limita de 1 a 128 as claims ativas no store compartilhado.
O padrão é omitido, preservando apenas o limite local. Todos os processos que
usam esse store devem configurar o mesmo teto e os mesmos tempos de lease.
A contagem e a claim são feitas na mesma transação SQLite; JSON continua sendo
um store de escritor único. Uma vaga ocupada faz o candidato aguardar outro
tick. Claims órfãs ocupam vagas até `recover()`; `start()` já chama a recuperação.
Nesse modo, cancelar uma tarefa em execução retorna `SCHEDULE_RUNNING`, mantendo
a vaga ocupada até o handler terminar. Handlers devem cooperar com cancelamento;
uma lease recuperada após falha não garante execução exatamente uma vez.

`priority` é um inteiro de -1000 a 1000, padrão 0, persistido na tarefa. Entre
candidatos vencidos, valores maiores vêm primeiro; empate usa o vencimento mais
antigo e depois a ordem de inserção. A ordem se aplica à seleção do tick, sem
interromper handlers ativos. Prioridades altas contínuas podem atrasar tarefas
baixas. `add`, `addCron`, `edit` e as opções das funções de script aceitam o campo.

A política de retry aceita `maxAttempts` (1–100, padrão 5), `retryDelayMs`
(1–604800000, padrão 30000), `retryBackoff` (1–10, padrão 1) e `retryJitter`
(0–1, padrão 0). Um jitter de 0.25 varia o atraso calculado entre 75% e 125%; o
resultado permanece entre 1 ms e sete dias. `random` nas opções do scheduler
permite uma fonte determinística de números entre 0 e 1 em testes. As funções
`schedule`, `scheduleEvery` e `scheduleCron` aceitam a mesma política.

Guards, falhas parciais de moderação e comandos que já produziram efeitos de
moderação terminam sem retry. O histórico registra sucesso, retry e falha com
códigos estáveis; `history`, `failed` e `retry` permitem inspeção e reexecução
manual das falhas operacionais elegíveis. O limite padrão é 1000 registros.

## Encerramento e recuperação

Heartbeat renova a claim enquanto o handler executa. `stop()` cancela os sinais
dos handlers ativos e interrompe novas claims; `drain()` aguarda os handlers e a
finalização persistida. Os handlers precisam respeitar cancelamento cooperativo.
O ciclo de vida do bot coordena essas operações durante `destroy()`.

Uma claim expirada pode ser recuperada por outra instância. Isso não garante
execução exatamente uma vez após queda entre uma chamada remota e a confirmação
local: comandos com efeitos externos devem ser idempotentes. Falhas automáticas
de store chegam a `onError` e aos eventos do scheduler; não são descartadas.

Veja também [armazenamento](STORAGE.md), [observabilidade](OBSERVABILITY.md) e
[referência de funções](FUNCTIONS.md).
