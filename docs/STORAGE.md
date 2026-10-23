# Estado, falhas e execução

## Stores

O padrão é `JsonStore`. `XDG_DATA_HOME` só é aceito se for absoluto; um valor
relativo usa o fallback `~/.local/share`. Sem nome de bot, usa:

```text
${XDG_DATA_HOME:-~/.local/share}/yuzuha/default/state.json
```

`new Yuzuha({ name: 'meu-bot' })` usa `yuzuha/meu-bot/state.json`.
Nomes aceitam letras ASCII, números, hífen e sublinhado. O caminho completo pode
ser escolhido com `new JsonStore('/caminho/state.json')`.

| Store | Persistência | Concorrência |
|---|---|---|
| `MemoryStore` | Somente memória | Fila de transações por instância |
| `JsonStore` | JSON, schema 2, arquivo temporário + fsync + rename | Uma instância escritora por arquivo |
| `SQLiteStore` | SQLite nativo do Node, WAL | Transações `BEGIN IMMEDIATE` entre conexões/processos |

Os stores são abertos apenas no primeiro acesso. Criar um bot ou executar `check`
não cria estado. Novas pastas de dados usam modo `0700`; arquivos de estado usam
`0600` no Linux. Pastas existentes não têm permissões alteradas. Os testes usam
diretórios temporários e não acessam os dados reais do usuário.

O `JsonStore` mantém um snapshot em memória. Compartilhe a mesma instância entre
bots que deliberadamente compartilham um arquivo; não abra duas instâncias ou
processos escritores para o mesmo JSON. Use SQLite nesses casos.

Na 0.1.6, memória e JSON atendem `ctx.data.*.get` por leitura pontual: a fila
aguarda operações anteriores, avalia o relógio de TTL e copia somente o valor
selecionado. O contrato `Store.readVariable(key, now)` é opcional; `now` é uma
função de relógio, chamada dentro da operação serializada. `undefined` significa
ausente ou expirado; `null` é um valor persistente válido. `Store.read` continua
fornecendo snapshots completos e stores próprios podem manter apenas esse método.
SQLite reutiliza statements, mantendo a leitura/validação do estado completo,
WAL e os mesmos limites de escala descritos abaixo.

```ts
import { defineCommand, SQLiteStore, Yuzuha } from 'yuzuha';

const store = new SQLiteStore('/caminho/dados/bot.sqlite');
const bot = new Yuzuha({ name: 'meu-bot', store });
bot.command(defineCommand({ name: 'ping', async run(ctx) { await ctx.reply('Pong!'); } }));
await bot.login();

process.once('SIGINT', async () => {
  await bot.destroy();
  await store.close();
});
```

O SQLite usa `node:sqlite`, disponível na versão mínima do Node. Essa API pode
emitir aviso experimental nas versões do Node em que ainda é experimental.
A importação é lazy: quem usa JSON não carrega SQLite. `busy_timeout` é de 5s.
O estado fica em um registro JSON dentro de uma transação SQLite. Isso preserva
o contrato do store e a numeração atômica; não é uma modelagem SQL por entidade.
É apropriado para bots pequenos/médios; bases muito grandes exigirão um adaptador
específico. `:memory:` é aceito para testes.

## Propriedade e encerramento

O bot fecha somente o store criado por ele. Quando `store` é passado nas opções,
o chamador continua responsável por `close?.()`, depois de aguardar `destroy()`.
Isso permite compartilhar uma instância de store entre bots sem que um deles
feche recursos dos outros. A CLI assume o ciclo de vida da config e fecha seu
store ao terminar `check`, `run` ou `dev`.

Chamadas externas de `destroy()` impedem novos despachos, retiram o listener,
aguardam comandos ativos, encerram o client e fecham o store próprio. O login
pendente recebe cancelamento. A operação é idempotente.

Se `destroy()` for chamado pelo próprio comando, middleware ou hook, sua promise
apenas reconhece o pedido de parada e permite que esse handler termine. O drain
efetivo continua aguardando a conclusão do handler; uma chamada externa pode
aguardá-lo. Não feche um store injetado imediatamente após esse reconhecimento
interno enquanto ainda houver comandos que dependem dele.

## Transações

```ts
const total = await store.update(state => {
  const next = Number(state.variables['total'] ?? 0) + 1;
  state.variables['total'] = next;
  return next;
});
```

O callback é **síncrono**: não faça requests ou `await` dentro dele. Se lançar um
erro, o estado não é confirmado. O estado resultante precisa respeitar o schema
e conter apenas valores JSON finitos, sem ciclos ou objetos de classe.
A validação do estado e a cópia do retorno acontecem antes do commit. Um retorno
impossível de clonar também recusa a atualização, sem confirmar os dados.
`read` entrega um snapshot isolado; modificá-lo não altera o store.

`STORE_ASYNC` identifica callbacks que retornam promise/thenable; `STORE_INVALID`
identifica estado produzido fora do schema. Esses erros não gravam a transação.

Arquivos malformados e schemas desconhecidos causam `STORE_CORRUPT`; o arquivo
não é apagado ou reinicializado. Faça backup do JSON ou do banco. Para backup de
SQLite por cópia de arquivos, feche todos os escritores primeiro e preserve os
arquivos WAL/SHM quando existirem. Esta versão inicia em schema 2 e migra
automaticamente um estado schema 1 (sem `schedules`) na leitura; schemas futuros
não são reescritos.

## Variáveis, TTL e escopos

`ctx.data.guild`, `ctx.data.user` e `ctx.data.global` oferecem `get`, `set`,
`delete`, `update`, `expire` e `ttl`. O escopo `user` acompanha o autor e é
compartilhado entre servidores; `guild` pertence ao servidor atual. Os dados
são do bot e não são sincronizados com o perfil do Fluxer.

```ts
await ctx.data.guild.set('evento', { aberto: true }, { ttlMs: 60_000 });
const restante = await ctx.data.guild.ttl('evento');
await ctx.data.guild.expire('evento', null); // Remove o prazo.
await ctx.data.userFor('123').update('pontos', n => Number(n) + 1, 0);
```

TTL é um inteiro não negativo em milissegundos. Zero torna o valor imediatamente
ausente; no instante exato da expiração, `get` devolve o fallback e `ttl` devolve
`-2`. Um valor persistente tem TTL `-1`. `expire` devolve `false` para uma chave
ausente ou já expirada e `true` ao alterar uma chave viva. `expire(nome, null)`
remove o prazo. `set` sem TTL substitui o valor por um persistente. `update`
preserva o prazo de uma chave viva e recria uma chave expirada a partir do
fallback, sem prazo. Uma transação usa um único instante para todas as operações.

As expirações são timestamps absolutos em `state.variableExpirations`, campo
opcional compatível com schema 2 antigo. Memória, JSON e SQLite compartilham as
mesmas regras. Não existe timer por chave: leituras filtram valores expirados
sem gravar no disco; apagar, substituir ou atualizar uma chave também remove
seus metadados vencidos. Entradas ainda não acessadas podem permanecer no estado
bruto após o prazo. Alterar o relógio do sistema afeta o tempo restante.

`ctx.data.userFor(id)` e `tx.userFor(id)` escolhem explicitamente outro usuário.
Exigem um contexto de servidor e ID de 1–128 caracteres sem espaços nas
extremidades. Não fazem requests nem verificam se o usuário ainda pertence ao
servidor. Em DM, `user` do próprio autor e `global` continuam disponíveis;
`guild` e `userFor` recusam a operação. A política de acesso aos dados do bot
continua sendo responsabilidade do comando.

## Transações de dados em scripts

`$setVar`, `$setGuildVar` e `$setUserVar` aceitam TTL opcional como terceiro
argumento. `$ttlVar`, `$ttlGuildVar` e `$ttlUserVar` consultam o prazo;
`$expireVar`, `$expireGuildVar` e `$expireUserVar` alteram ou removem o prazo.

`$dataTransaction[operações]` recebe um array JSON de 1–100 operações declarativas:

```text
$dataTransaction[$jsonDecode[[{"op":"increment","scope":"guild","name":"saldo","delta":-10},{"op":"increment","scope":"user","userID":"123","name":"saldo","delta":10},{"op":"get","scope":"guild","name":"saldo"}]]]
```

Cada operação declara `op`, `scope` (`global`, `guild` ou `user`) e `name`.
`userID` é opcional apenas para `scope: "user"` e usa as regras de `userFor`.

| `op` | Campos adicionais | Retorno |
|---|---|---|
| `get` | `fallback?` | Valor ou fallback (`null` por padrão) |
| `set` | `value`, `ttlMs?` | `null` |
| `delete` | Nenhum | `null` |
| `increment` | `delta?` (1), `fallback?` (0) | Novo número |
| `expire` | `ttlMs` (número ou `null`) | Booleano |
| `ttl` | Nenhum | Milissegundos, `-1` ou `-2` |

O resultado é um array na mesma ordem das operações. `increment` exige números
finitos, incluindo valor já salvo; para valores numéricos em scripts use
`$jsonDecode[10]` em vez do texto `10`. Campos desconhecidos e operações inválidas
são recusados. Uma falha posterior desfaz também alterações anteriores e seus
TTLs. O resultado é copiado antes do commit, e o orçamento de saída do runtime
é verificado dentro da transação: uma saída grande aborta toda a atualização.
Dados contendo `$...` permanecem texto. Não há callbacks de script, `eval`,
requests ou execução assíncrona dentro da transação.

## Casos e falhas parciais

Cada servidor recebe sua sequência `1, 2, 3`. O registro inclui ação, alvo,
moderador, motivo, instante e duração, quando aplicável. O store é lido antes de
uma ação com caso para detectar estado já inválido antes de tocar na API.

Fluxer e o disco não compartilham uma transação. Se a ação for confirmada pela API
e o caso falhar depois, o framework lança `PartialModerationError` com ação e alvo.
O usuário recebe uma mensagem dizendo que a ação aconteceu e que não deve repeti-la.
`$try` não captura essa situação. O callback `onError` recebe a causa para diagnóstico.

Não há retry próprio de moderação. Uma falha de rede após o envio pode deixar o
resultado remoto desconhecido; confirme no servidor antes de executar novamente.
Um crash entre a ação e o registro também pode deixar a ação sem caso. Não existe
garantia de exactly-once entre o serviço remoto e armazenamento local.

Cooldown e deduplicação são por processo, em memória. IDs de mensagens são
deduplicados por 60s, com limite de 10000 entradas. Cooldowns suportam até 100000
entradas ativas. Não use isso como coordenação entre processos.

## Agendamentos

Tarefas aceitam `paused`, `maxAttempts`, `retryDelayMs` e `retryBackoff`
opcionais no mesmo schema 2. `edit`, `pause` e `resume` são atualizações atômicas
e recusam tarefas reivindicadas. Uma claim identifica a execução: uma conclusão
atrasada não pode finalizar uma claim nova. Recuperação local não libera tarefas
que ainda estão em execução naquele scheduler.

Tarefas de `$schedule` e `ctx.scheduler` ficam em `state.schedules`. O scheduler
reivindica cada tarefa com `runningAt` dentro de um `store.update` antes de
executar, impedindo que dois ticks concorrentes rodem a mesma tarefa. Uma tarefa
repetível avança `due` pelo intervalo e não acumula execuções perdidas.

Falhas operacionais são tentadas novamente por padrão após 30 segundos, até cinco tentativas. Uma tarefa
que estava em execução e cujo processo morreu fica com `runningAt` antigo; após
cinco minutos, `recover` a libera. Enquanto está executando, o heartbeat renova
`runningAt` a cada 100 segundos por padrão, impedindo recuperação por outra
instância que compartilhe o mesmo store. Cada ciclo automático verifica órfãs;
não há escrita de recuperação quando não existem tarefas vencidas. A execução é um novo despacho de mensagem no
canal original, com o autor original, e passa pelos mesmos guards e limites.

`new Scheduler(store, executar, { leaseMs, heartbeatMs, historyLimit, onEvent,
onError })` configura a instância. `leaseMs` deve ser inteiro de pelo menos 3 ms;
`heartbeatMs` deve ser positivo e menor que o lease. `historyLimit` aceita 1–10000
(padrão 1000). `onError` recebe falhas de manutenção, incluindo store/heartbeat;
sem hook, o stderr recebe apenas um código. O callback `executar(tarefa, signal)`
recebe cancelamento cooperativo. `stop` para novos ciclos e cancela execuções;
`await drain()` aguarda a finalização e o registro. O bot faz ambos em `destroy`.

O histórico em `state.scheduleHistory` registra snapshot da tarefa, ID da claim,
início/fim, `success`, `retrying` ou `failed`, código de erro e indicação de retry.
`history()` e `failed()` retornam cópias; `retry(idDaExecução, due?)` cria uma nova
tarefa a partir de falha operacional terminal. Guards e moderação aplicada ou
parcial recusam reexecução. Retenção é limitada e não equivale a arquivo permanente
de auditoria. O snapshot inclui a entrada original do comando; códigos de erro
não incluem mensagem/stack da exceção.

Scripts usam `$scheduleHistory`, `$failedSchedules` e `$retrySchedule`, sempre
restritos ao autor/servidor atuais. As APIs nativas aceitam um `ScheduleAccess`
opcional para aplicar a mesma restrição. IDs de execução e de tarefa são distintos.

O JSON continua tendo uma instância escritora por arquivo; SQLite coordena
escritores por transação. O agendador não é um sistema de fila distribuído e não
garante exatamente uma execução se o processo cair depois do efeito remoto.

## Confiança e limites

O interpretador não usa `eval` nem `Function`. Ele só chama funções do registro.
As funções nativas JS/TS, a config e os arquivos de comando são código confiável
com as permissões do processo. Não importe plugins ou comandos de fontes não confiáveis.

Limites padrão por execução:

| Limite | Valor |
|---|---|
| Tamanho do script | 100000 caracteres |
| Profundidade do parser | 64 níveis |
| Chamadas de função | 10000 |
| Profundidade do runtime | 64 níveis |
| Texto intermediário/resultado por avaliação | 100000 caracteres |
| Prazo cooperativo | 10 segundos |

`new Yuzuha({ limits: { calls: 500, timeoutMs: 3000 } })` altera os limites de
runtime. O prazo é verificado antes/depois de funções e durante avaliações; não
interrompe uma promise pendurada, um loop síncrono de plugin ou request já enviado.
Funções nativas que esperam I/O podem usar `call.wait(promise)` para não consumir
o prazo; coletores e `$http` já fazem isso. O prazo não é um sandbox de CPU/memória
nem um mecanismo de cancelamento de API.

Guards de moderação consultam membros e cargos atuais via REST. Entre a checagem
e a chamada ainda pode haver mudança de permissões; o Fluxer decide a autorização
final. Permissões de administrador não ignoram hierarquia de cargos; só o dono
ignora a hierarquia do autor. O bot continua sujeito à própria hierarquia.

## Rede e privacidade

Não há telemetria, analytics ou serviço próprio do Yuzuha. `login` conecta ao
gateway e API da instância configurada no Fluxer.js. Ações enviam apenas seus
payloads ao Fluxer; casos ficam no store escolhido. Discovery via
`Client.fromDiscovery` faz a consulta de rede quando chamado explicitamente.
Tokens ficam no ambiente ou em `.env` e não entram no store.

Respostas, envios e edições pelo `FluxerTransport` usam `allowedMentions` sem
pings de usuários, cargos, everyone ou autor respondido. Operações feitas
diretamente em `bot.client` seguem as opções e padrões do SDK original.

## Manutenção, estatísticas e backups

`StateMaintenance` recebe um store e funciona offline em memória, JSON e SQLite:

```ts
import { StateMaintenance, SQLiteStore } from 'yuzuha';
const store = new SQLiteStore('./bot.sqlite');
const maintenance = new StateMaintenance(store);
const stats = await maintenance.stats();
let cursor: string | null = null;
do {
  const batch = await maintenance.cleanupExpired({ limit: 100, cursor });
  cursor = batch.cursor;
} while (cursor !== null);
const backup = await maintenance.backup();
const preview = await maintenance.restore(backup, { policy: 'replace' });
// Confirme a aplicação somente depois de revisar preview.
await maintenance.restore(backup, { policy: 'replace', dryRun: false });
await store.close();
```

As estatísticas incluem variáveis vivas/expiradas, metadados órfãos de TTL,
casos, tarefas pausadas/ativas, histórico e bytes do JSON compacto em UTF-8.
`jsonBytes` não representa o tamanho físico do SQLite, WAL ou arquivo formatado.

A limpeza examina até `limit` entradas de TTL por chamada (1–10000, padrão 100),
apaga valores vencidos e metadados órfãos e devolve `scanned`, `removed`,
`orphanExpirationsRemoved` e `cursor`. O cursor é a última chave examinada em
ordem lexical; passe-o sem alterar, inclusive quando for uma string vazia.
`null` encerra a passagem. Chaves inseridas antes de um cursor já avançado e
valores que vencerem depois de sua passagem precisam de uma nova passagem.
A quantidade de mutações e entradas examinadas é limitada; o contrato atual dos
stores ainda carrega/clona/valida o estado completo e ordena suas chaves de TTL.
A limpeza não é um índice SQL ou uma operação de custo constante.

O backup é JSON de dados com `{ format: "yuzuha-state", version: 1, createdAt,
state }`, preservando variáveis, TTL, casos, tarefas e histórico. `createdAt` é ISO
UTC e os prazos de TTL permanecem timestamps absolutos. Restaurar um backup
antigo não renova expirações. A API devolve o objeto isolado; serialização e
escrita do arquivo são explícitas pelo chamador ou pela CLI.

`restore` exige uma política e usa `dryRun: true` por padrão. A simulação valida
os dados e calcula estatísticas antes/depois sem confirmar uma transação.
`dryRun: false` valida novamente o destino dentro da transação e só confirma
quando estado e retorno estão válidos. Schema/envelope desconhecido, IDs de
tarefa/histórico duplicados, conflitos ou dados corrompidos recusam a operação
inteira. O destino não é apagado para tentar contornar corrupção.

- `replace`: substitui todo o estado pelo backup.
- `merge`: variáveis do backup prevalecem; um valor persistente remove o TTL
  anterior. Casos mantêm IDs e exigem um prefixo comum idêntico por servidor.
  Tarefas e histórico são unidos por ID, recusando conteúdos diferentes para o
  mesmo ID. Campos não relacionados do destino são preservados.

Criar backup ou restaurar exige tarefas sem `runningAt`/`claimID` ativos no
snapshot; a restauração também exige destino sem execuções ativas. Pare e aguarde
os schedulers antes de uma restauração. O teste na transação protege claims já
presentes, mas não substitui interromper todos os processos escritores, que
poderiam iniciar outro trabalho após a restauração. JSON mantém sua restrição de
uma instância escritora. O backup inclui entradas de comandos e dados do bot;
guarde-o com o mesmo cuidado aplicado ao store original.

Transações usam cópia direta para primitivos imutáveis e evitam uma cópia
redundante do resultado de `update`. Objetos continuam isolados em entradas,
retornos e snapshots; rollback, TTL e recusa de callbacks assíncronos são
preservados. Um microbenchmark local aquecido de duas atualizações numéricas por
transação (5000 operações, 11 amostras, Node 26.8.2) mediu mediana de 50858,7 para
59746,7 operações/s. É uma medição local desse cenário, não uma promessa de ganho
para outros payloads, máquinas ou stores persistentes.
