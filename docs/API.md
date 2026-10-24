# API pública

Os exports suportados são `yuzuha` (nativo), `yuzuha/functions` (function mode),
`yuzuha/sdk`, `yuzuha/testing`, `yuzuha/tooling` (auxiliares de editor) e
`yuzuha/music` (Lavalink, filas e voz opcional).
A fonte das assinaturas completas são as declarações TypeScript distribuídas em
`dist/`. Este guia explica os contratos usados pelos comandos e extensões.

## Bot

`Yuzuha` e `Bot` são a mesma classe.

| Opção de construção | Contrato |
|---|---|
| `name` | Nome do diretório de dados padrão; letras ASCII, números, `_` e `-` |
| `prefix` | String, array de strings ou função sync/async de `IncomingMessage` |
| `client` | Instância de `Client` do Fluxer.js |
| `clientOptions` | Opções do SDK quando o client não é fornecido |
| `transport` | Implementação de `Transport`; padrão `FluxerTransport` |
| `resources` | Implementação de `Resources`; padrão `FluxerResources` sobre o client |
| `store` | Implementação de `Store`; padrão `JsonStore` |
| `scheduler` | `Scheduler` próprio, `false` para desligar; padrão sobre o mesmo store |
| `http` | `HttpService` próprio, `false` para desligar; padrão seguro |
| `music` | `MusicManager` injetado, exposto em `ctx.music`; bot encerra seus players |
| `voice` | `NativeVoice` injetado, exposto em `ctx.voice`; bot encerra suas conexões |
| `limits` | Subconjunto de `calls`, `depth`, `output`, `timeoutMs` |
| `now` | Função que retorna epoch em ms para cooldown, dados e scheduler; padrão `Date.now` |
| `onError(error, ctx?)` | Observação de falhas internas e operacionais |
| `onCommand(ctx, outcome)` | Observação do resultado de comandos encontrados |
| `onLog(record)` | Eventos estruturados opcionais, sem conteúdo/segredos automáticos |

`onCommand` recebe `success`, `guarded` ou `error` após o despacho; mensagens
ignoradas retornam `ignored` de `handle` e não chegam a esse hook.
Middleware pode encerrar a cadeia sem executar o corpo; nesse caso, se não lançar
erro, o resultado continua sendo `success`.

| Método | Resultado e uso |
|---|---|
| `command(command)` | Registra um comando validado e retorna o bot |
| `enableFunctions()` | Ativa o parser e os builtins de function mode; idempotente |
| `use(middleware)` | Acrescenta middleware e retorna o bot |
| `plugin(plugin)` | Instala funções, comandos, eventos e middleware; retorna o bot |
| `on(event, listener)`, `once(event, listener)` | Registra callback tipado do SDK, com erros e encerramento rastreados |
| `off(event, listener)` | Remove as inscrições do callback |
| `event(defineEvent(...))` | Registra uma definição de evento |
| `load(directory, replace = true)` | Valida a pasta e substitui tudo; `false` acrescenta |
| `reload(directory)` | Troca só os comandos daquela pasta |
| `listCommands()` | Snapshot das definições, sem duplicar aliases |
| `help(path?, prefix?)` | Catálogo visível ou ajuda detalhada de um comando/subcomando |
| `handle(message)` | Despacho manual; retorna `Promise<DispatchResult>` |
| `login(token?)` | Usa o argumento ou `FLUXER_BOT_TOKEN`; só aqui conecta |
| `destroy()` | Aguarda handlers, encerra client e store próprio; idempotente |

`client`, `transport`, `store`, `runtime` e `signal` são acessíveis. `signal` é
abortado quando o encerramento começa. `login` após
`destroy` falha com `BOT_CLOSED`; mensagens novas após o início do encerramento
são ignoradas. O bot não fecha store injetado; a CLI fecha o store da config.

Chamadas externas de `destroy` aguardam o encerramento completo. Se o próprio
comando, middleware ou hook chamar `destroy`, ele solicita a parada e recebe
confirmação imediata para poder terminar; o encerramento efetivo aguarda esse
retorno. O login pendente recebe cancelamento. Não use esse reconhecimento
dentro do handler como se todos os recursos já estivessem fechados.

## Comandos e argumentos

`defineCommand` preserva a definição recebida no formato de array e normaliza
schemas de objeto `arg.*` para esse formato. Schemas inferem os tipos de
`ctx.args.get/require`, também em `bot.command(...)` direto. A validação efetiva
acontece ao registrar ou carregar o comando. Veja o [guia nativo](NATIVE.md).

```ts
import { defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'lembrar',
  aliases: ['lembrete'],
  guildOnly: true,
  cooldown: '5s',
  args: [
    { name: 'tempo', type: 'duration', required: true },
    { name: 'texto', type: 'string', rest: true, required: true },
  ],
  async run(ctx) {
    await ctx.reply(
      String(ctx.args.get('tempo')) + ' ms: ' + String(ctx.args.get('texto')),
    );
  },
});
```

Esse exemplo valida a duração e responde; ele não agenda um lembrete.
`duration` retorna milissegundos. Números usados como cooldown também são ms.

Campos: `name`, `aliases`, `description`, `code` ou `run`, `guildOnly`,
`permissions`, `botPermissions`, `cooldown`, `args`, `flags`, `subcommands`, `examples`,
`checks`, `middleware`, `hidden`, `http` e `file`.
`hidden` omite da ajuda, mas não bloqueia execução. `file` identifica a origem
dos diagnósticos e é preenchido pelo loader.

Grupos podem ter somente `subcommands`, sem `code`/`run`, e não declaram entrada
posicional ou flags próprias. Folhas recebem as restrições ancestrais; exemplos
e regras completas estão em [NATIVE.md](NATIVE.md). Os helpers `commandUsage`
e `commandHelp` produzem texto a partir de uma definição normalizada, sem
executar seus callbacks. Para resolver um caminho na árvore, use `bot.help`.

Tipos de argumento:

| Tipo | Valor no Map `ctx.args` |
|---|---|
| `string` ou omitido | Texto |
| `number` | Número finito |
| `integer` | Inteiro seguro |
| `user` | ID textual validado a partir de menção ou ID, sem buscar membro |
| `duration` | Milissegundos inteiros positivos |
| `boolean` | Booleano convertido de true/false, yes/no, sim/não/nao ou 1/0 |

`required` exige presença; `choices` compara a representação textual;
`rest` junta os tokens restantes e só pode aparecer no último argumento.
`defaultValue`, `min`, `max` e `validators` também existem no formato de array.
Checks rodam após a preparação e antes dos middlewares globais e locais;
`false` ou uma string recusam a execução. Veja [NATIVE.md](NATIVE.md).
Nomes/aliases são únicos sem distinção entre maiúsculas e minúsculas.

## Contexto

| Membro | Contrato |
|---|---|
| `message` | Mensagem normalizada; `raw` pode guardar o objeto original |
| `authorID`, `guildID` | Autor e servidor; servidor vazio em DM |
| `command`, `input`, `tokens` | Definição, texto dos argumentos e tokens |
| `args` | ArgumentBag compatível com Map; get/require inferidos para schemas |
| `flags` | Flags declaradas e convertidas; get/require inferidos para schemas |
| `now()` | Epoch em ms pelo relógio configurado; use para cálculos de prazo |
| `vars` | Map local daquela execução |
| `reply(stringOuPayload)` | Retorna o ID da resposta |
| `send`, `edit`, `delete`, `react` | Helpers do transporte, usando o canal/mensagem atuais como padrão |
| `client`, `nativeMessage` | Client real e mensagem original opcional do SDK |
| `mod` | ban/kick/timeout/unban/move/mute/deafen com registro de caso por padrão |
| `resources` | Contratos nativos de usuários, cargos, canais, mensagens, coletores, webhooks, emojis, threads e convites |
| `scheduler` | Agendador persistente; lança `NATIVE_UNAVAILABLE` se desligado |
| `http` | Cliente HTTP seguro; lança `NATIVE_UNAVAILABLE` se desligado |
| `data.guild/user/global` | get/set/delete/update/expire/ttl atômicos por escopo |
| `data.userFor(id)` | Dados de outro usuário; exige contexto de servidor |
| `data.transaction(callback)` | Transação síncrona entre chaves e escopos, com rollback |
| `members` | search e setNickname com autorização compartilhada |
| `assert(condition, message)` | Lança GuardError quando a condição é falsa |
| `signal` | AbortSignal cooperativo do encerramento |
| `executionID` | Identificador de correlação, compartilhado com a claim em agendamentos |
| `requireGuild()` | Retorna o ID do servidor ou lança `GuardError` |
| `requirePermission(name, bot?, message?)` | Verifica permissão de servidor do autor ou bot |
| `cooldown(duration, message?)` | Reivindica cooldown por autor/canal/servidor/comando |
| `moderate(action, target, reason, options?)` | Executa moderação; retorna caso se `record` |
| `case(id)` | Consulta caso do servidor, ou `undefined` |
| `variable(scope, name, fallback?)` | Lê valor JSON |
| `setVariable(scope, name, value, options?)` | Persiste valor JSON com TTL opcional |
| `deleteVariable(scope, name)` | Remove valor persistente |
| `lastCase` | Último caso criado com sucesso na execução |
| `store`, `transport`, `help()` | Contratos compartilhados e ajuda |

`moderate` aceita `ban`, `kick`, `timeout`, `unban`, `move`, `mute`, `deafen` e
opções `record`, `duration` em ms, `deleteMessageDays` de 0 a 7, `channelID` para
movimento e `enabled` booleano para mute/deafen. Todas as ações exigem motivo.
A camada de moderação continua verificando permissão e hierarquia mesmo que
o comando não tenha guards declarativos.

Escopos de variável: `global`, `guild` e `user`. O escopo de usuário é global
ao store para aquele autor, não uma combinação automática servidor+usuário.

## Recursos, agendador e HTTP

`Resources` agrupa contratos por área. O bot cria a implementação Fluxer; para
testes, `mockResources` simula apenas as áreas necessárias.

```ts
import type { Resources } from 'yuzuha';

async function exemplo(resources: Resources, guildID: string) {
  const membros = await resources.users.members(guildID, 10);
  const canais = await resources.channels.list(guildID);
  const emojis = await resources.expressions.emojis(guildID);
  return { membros, canais, emojis };
}
```

Os retornos são objetos serializáveis, não classes do SDK. As áreas e assinaturas
estão em `src/ports/resources/` e nas declarações distribuídas; a referência de
uso por script fica em [FUNCTIONS.md](FUNCTIONS.md).

| Classe | Contrato |
|---|---|
| `FluxerResources` | Implementação sobre `Client`; criada pelo bot |
| `Scheduler` | `add`, `cancel`, `list`, `edit`, `pause`, `resume`, `history`, `failed`, `retry`, `tick`, `recover`, `start`, `stop`, `drain` |
| `HttpService` | `request({ method, url, body?, headers?, signal? })` retorna corpo textual; `requestBytes` retorna `HttpResponse<Uint8Array>`, ambos com `status`, `ok`, `headers` e `body`; `withSignal` cria uma visão com cancelamento |

`ScheduleInput` exige `guildID`, `channelID`, `authorID`, `command` e `due`;
`input` e `interval` completam a tarefa. `HttpOptions` aceita `timeoutMs`,
`maxBytes`, `maxRequestBytes`, `allowedHosts`, `allowPrivate`, `fetch` e `signal`. HTTP e collectors
obtidos por `ctx` recebem o sinal de encerramento automaticamente.
`SchedulerOptions` configura lease/heartbeat, retenção e hooks; histórico e
reexecução estão descritos em [STORAGE.md](STORAGE.md). `mockResources` está em
`yuzuha/testing` e falha com `NATIVE_UNAVAILABLE` em áreas ou métodos ausentes.
Aceita overrides parciais por método, tipados por `MockResourceOverrides`.

### Contratos acrescentados na 0.1.4

- `bot.scriptEvent(ScriptEventDefinition)` e `plugin.scriptEvents` registram
  seis eventos do SDK. `EventContext` estende o contexto com `event` imutável;
  `ScriptEventData`, `ScriptEventName` e `EventContextOptions` são públicos.
  Campos ausentes são `null`; acesso à mensagem depende do payload real.
  Veja [EVENTS.md](EVENTS.md).
- `Scheduler.addCron(CronScheduleInput)` aceita expressão, timezone e
  política de atraso. `parseCron`, `nextCron` e `assertTimezone` também são
  exportados. `SchedulerOptions.concurrency` limita workers da instância;
  `RetryPolicy.retryJitter` adiciona variação ao backoff.
  Veja [SCHEDULER.md](SCHEDULER.md).
- `HttpService.stream(HttpRequest)` retorna `HttpStreamResponse`;
  `multipart` recebe `HttpMultipartPart[]`. `withPolicy(HttpPolicy)` aplica
  restrições aos limites e hosts do pai; comandos e eventos aceitam `http`.
  Veja [HTTP.md](HTTP.md).
- `new StateMaintenance(store)` expõe `stats`, `cleanupExpired`, `backup` e
  `restore`. `StateBackup` usa versão própria e `RestoreOptions` exige política
  de conflito; o padrão é simulação. Os tipos de opções e relatórios são
  exportados na raiz. Veja [STORAGE.md](STORAGE.md).
- `messages.preload` e `expressions.createEmojisBulk` usam lotes limitados;
  `EmojiCreateInput` e `EmojiBulkResult` são públicos. Recursos de contexto
  verificam autorização compartilhada para cargos, canais e webhooks.
  Veja [PARITY.md](PARITY.md) e [migração](../VERSIONING.md).

## Funções de script e plugins

Uma `FunctionDefinition` declara `name`, `aliases?`, `category`, `description`,
`usage`, `minArgs`, `maxArgs` e `execute(call)`.

```ts
import type { YuzuhaPlugin } from 'yuzuha';

export const saudacoes: YuzuhaPlugin = {
  name: 'saudacoes',
  functions: [{
    name: 'saudar',
    category: 'personalizado',
    description: 'Monta uma saudação.',
    usage: '$saudar[nome]',
    minArgs: 1,
    maxArgs: 1,
    async execute(call) {
      return 'Olá, ' + await call.text(0) + '!';
    },
  }],
};
```

Instale com `bot.plugin(saudacoes)` antes de carregar um script que use
`$saudar`. As funções recebem argumentos lazy, memoizados por chamada:
`arg(i)` preserva tipo, `text(i)` converte para texto, `all()` avalia em ordem.
`count` informa aridade e `ctx` dá acesso ao contexto. `wait(promise)` aguarda
uma operação externa sem consumir o prazo de `limits.timeoutMs`.
`fresh(i)` reavalia o argumento, para funções de iteração; não compila texto
retornado por ele. `checkOutput(valor)` verifica saídas intermediárias e lança
`OUTPUT_LIMIT` quando necessário, inclusive dentro de `$try`.

Plugins podem fornecer arrays `commands`, `events` (com `defineEvent`) e
`middleware`. Scripts no próprio plugin podem usar funções declaradas nele.
Nomes de plugins, funções e comandos não podem colidir em seus registros.
O registro valida o lote antes de aplicá-lo. Também
existem `bot.runtime.register(fn)` e `registerAll(functions)`.

`Runtime`, `registerBuiltins`, `parse` e `script` vêm de `yuzuha/functions`,
não da raiz. `Runtime` expõe `compile(source, file?)`, `execute(program, ctx)` e
`functions()`. Um runtime novo é vazio; `registerBuiltins(new Runtime())`
instala as funções internas. `parse` produz AST sem validar a presença
das funções. Prefira `compile` para um script executável. `script()` é um
identity helper tipado para deixar explícito que um comando usa `code`.

## Transporte e store

`Transport` define `botID`, `ping`, `reply`, `send`, `edit`, `delete`,
`react`, `member` e `moderate`. O adaptador retorna membros normalizados
com ID, permissões e hierarquia. Para anexos, collectors e APIs específicas,
use o SDK original por `bot.client`.

`Store` define `read(reader)`, `update(writer)` e `close?()`. Opcionalmente,
`readVariable(key, now)` recebe uma função de relógio, avaliada dentro da leitura
serializada, e oferece leitura isolada de um valor, retornando
`undefined` para ausente/expirado. Memória e JSON implementam essa capacidade;
stores próprios e SQLite continuam atendidos por `read`. `update`
recebe callback síncrono. Valores persistentes são JSON e o schema atual
é `2`, com `variables`, `cases`, `schedules` e campos opcionais
`variableExpirations`/`scheduleHistory`; estados schema `1` são migrados
na leitura. Consulte [STORAGE.md](STORAGE.md) antes de criar um adaptador.

## Música e voz

`yuzuha/music` exporta `LavalinkNode`, `MusicManager`, `MusicPlayer`, `TrackQueue`,
`FluxerVoice` e `FluxerLavalinkBridge`, além dos tipos de protocolo e ports. A referência de métodos,
limites, dependência de voz opcional e instalação do plugin de áudio está em
[MUSIC.md](MUSIC.md). O catálogo do function mode tem 306 funções.

## Servidor e decimais

`await ctx.guildFeatures()` retorna uma cópia das features do servidor atual.
Recursos customizados devem fornecer `GuildInfo.features`; a ausência é um erro
`NATIVE_UNAVAILABLE`, não uma lista vazia presumida.

`await ctx.leaveGuild()` solicita a saída do bot pelo SDK. Exige um contexto de
servidor e autor identificado como dono; um bot que seja dono não pode sair.
A operação é opcional em `UsersResources.leaveGuild`. Falhas do transporte são
propagadas, sem repetição automática. O acesso direto ao recurso permanece uma
operação nativa confiável; prefira o auxiliar autorizado do contexto.

`decimal(a, operador, b, casas?)`, `decimalCompare(a, b)` e
`decimalRound(valor, casas)`, exportados por `yuzuha`, operam sobre strings
decimais com até 1000 dígitos. Não aceitam expoente; retornam texto normalizado,
exceto a comparação, que retorna -1, 0 ou 1. Veja [operações de dados](LANGUAGE-EXTENSIONS.md).

## Erros

| Classe/código | Significado |
|---|---|
| `YuzuhaError` | Erro com `code` estável para diagnóstico |
| `ScriptError` | Erro com fonte, offset, arquivo, linha, coluna e `format()` |
| `GuardError` / `GUARD` | Condição de uso recusada; mensagem apropriada ao usuário |
| `PartialModerationError` / `MODERATION_PARTIAL` | API confirmou ação, mas o caso não foi salvo |
| `StopExecution` | Controle interno de parada de scripts |
| `STORE_CORRUPT` | Arquivo/schema inválido; dados preservados |
| `STORE_INVALID` | Callback produziu estado inválido; sem commit |
| `STORE_ASYNC` | Callback de atualização retornou promise/thenable |
| `EXECUTION_LIMIT` / `OUTPUT_LIMIT` | Orçamento do script excedido |
| `EXECUTION_ABORTED` | Cancelamento cooperativo; não capturado por `$try` |
| `NATIVE_UNAVAILABLE` | Client, recurso, agendador ou HTTP não foi fornecido |
| `HTTP_*` | URL, host, DNS, rede, timeout, redirecionamento, corpo ou JSON inválido |
| `SCHEDULE` / `SCHEDULE_*` | Entrada de agendamento inválida |

No handler de erro, observe `cause` para a causa original.
Não repita automaticamente moderação após erro parcial. Mais detalhes e
limitações de prazo em [STORAGE.md](STORAGE.md).

## Consultas, streams e imagens

`ctx.data.guild.query({ prefix, after, limit })` e os escopos user/global retornam
`VariablePage`, com entradas copiadas, TTL e cursor por nome. `Store.queryVariables`
é opcional; veja custos do índice SQLite em [STORAGE.md](STORAGE.md).

`ctx.sendStream(source, { name, content?, description?, maxBytes?, timeoutMs? }, channelID?)`
aceita um ReadableStream de bytes, limita sua leitura e acumula antes do upload.
O retorno é o ID da mensagem; não transmite multipart continuamente pela rede.
Veja [IMAGES.md](IMAGES.md) para os limites e o módulo opcional `yuzuha/images`.

`yuzuha/images` exporta `transformImage`, `ImageTransform`, `ImageOptions` e
`ImageResult`. A raiz não importa Sharp. Não há funções de imagem registradas
implicitamente no function mode.
