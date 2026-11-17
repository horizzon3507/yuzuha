# Framework JS/TS

## Configuração e CLI

```ts
import { defineConfig } from 'yuzuha';

export default defineConfig({
  name: 'meu-bot',
  prefix: ['!', 'y!'],
  commands: './commands',
});
```

`name` seleciona o diretório padrão de dados. Escolha nomes distintos para bots
distintos. `commands` é relativo à configuração. JS ESM (`.js`, `.mjs`), CommonJS
(`.cjs`) e TS (`.ts`, `.mts`) são carregados; arquivos `.d.ts` são ignorados.
Subpastas são percorridas, links simbólicos e pastas ocultas não são percorridos.
O default export pode ser um comando ou um array de comandos.
O carregador usa o suporte TS incluído no Yuzuha; `bot.load` não exige instalar
ou registrar um transpiler no projeto consumidor.

`yuzuha run` carrega `.env` ao lado da config, respeitando variáveis já definidas
no ambiente. `check` não carrega `.env` nem chama login; importa os módulos de
confiança e executa o `setup` da config para registrar plugins. Não é sandbox.

`yuzuha dev` recarrega arquivos de comandos, validando o conjunto completo antes
de substituir o anterior. Erros preservam os comandos anteriores. Alterações na
configuração, plugins ou dependências importadas exigem reiniciar o processo.
A recarga invalida os módulos de entrada ESM dos comandos; módulos transitivos
seguem o cache do Node. Em CommonJS, reinicie para garantir a atualização do cache.
Comandos registrados em `setup` ou manualmente são preservados: o modo `dev`
usa `bot.reload(diretório)` e troca somente os comandos daquela origem.
A importação TS compartilha o mesmo registro de transformação, preservando a
identidade de classes de erro importadas por comandos e plugins.

## Uso como biblioteca

```ts
import { Yuzuha } from 'yuzuha';
import { Events } from 'yuzuha/sdk';

const bot = new Yuzuha({
  name: 'meu-bot',
  prefix: '!',
  onError(error, ctx) {
    console.error('Falha no comando', ctx?.command.name, error);
  },
});

bot.once(Events.Ready, () => console.log('Pronto'));
await bot.load('./commands');
await bot.login();
```

O callback `onError` é para diagnóstico de confiança. Evite registrar tokens,
mensagens ou dados pessoais em produção. O logger padrão do Yuzuha registra só
o código do erro. `onCommand(ctx, outcome)` recebe `success`, `guarded` ou `error`.
`handle` retorna também `ignored` para mensagens que não executam comandos.

### Respostas de erro (`errorReply`)

Para personalizar a resposta enviada ao usuário quando um comando é recusado por
guard ou falha na execução, configure `errorReply(error, ctx?)` (tipo de retorno
`ErrorReplyResult`):

```ts
import { GuardError, Yuzuha, embed } from 'yuzuha';

const bot = new Yuzuha({
  prefix: '!',
  errorReply(error, ctx) {
    if (error instanceof GuardError) return `Aviso em ${ctx?.command.name ?? 'entrada'}: ${error.message}`;
    return { embeds: [embed({ title: 'Falha inesperada', description: 'Tente novamente em instantes.' })] };
  },
});
```

- `string` ou `Payload` substitui a resposta padrão via `ctx.reply` (ou pelo transporte quando `ctx` ainda não existe, como em erro de aspas abertas).
- `null` silencia a resposta ao usuário (sem afetar `onError` em falhas reais).
- `undefined` mantém a resposta padrão (`GuardError.message`, `PartialModerationError.message` ou mensagem genérica).
- Se `errorReply` lançar erro, o framework reporta a falha em `onError` e envia a resposta padrão.

### Hooks de ciclo de comando (`hooks`)

`YuzuhaOptions.hooks` (`YuzuhaHooks`) oferece pontos especializados para
cooldown, recusas de guarda e comandos desconhecidos:

```ts
import { Yuzuha } from 'yuzuha';

const bot = new Yuzuha({
  prefix: '!',
  hooks: {
    onCooldown(remainingMs, ctx) {
      return `Aguarde ${Math.ceil(remainingMs / 1000)}s para usar ${ctx.command.name}.`;
    },
    onDenied(error, ctx) {
      if (error.reason === 'CHECK_FAILED') return `Check recusado em ${ctx.command.name}: ${error.message}`;
      return undefined; // segue para errorReply -> resposta padrão
    },
    onUnknownCommand(info) {
      return `Comando ${info.prefix}${info.name} não encontrado.`;
    },
  },
});
```

- `onCooldown(remainingMs, ctx, error)`: chamado quando `GuardError` tem
  `reason === 'COOLDOWN'` (`error.remainingMs` é preenchido tanto pelo cooldown
  declarativo quanto por `ctx.cooldown`).
- `onDenied(error, ctx)`: chamado para os demais motivos de `GuardError` quando
  o contexto já existe (`CHECK_FAILED`, `PERMISSION_MISSING_AUTHOR`,
  `NOT_IN_GUILD`, etc.). Falhas antes de `ctx` (ex.: aspas abertas) seguem
  diretamente para `errorReply`.
- **Precedência**: `string` ou `Payload` do hook substitui a resposta; `null`
  silencia; hook ausente ou retorno `undefined`/`void` segue para `errorReply` e
  depois para a mensagem padrão. Se o hook lançar erro, a falha é enviada a
  `onError` e a resposta cai no padrão do framework.
- `onUnknownCommand(info)`: recebe `UnknownCommandContext` (`{ name, input,
  prefix, message }`) quando o prefixo (estático ou assíncrono) casa, o comando
  raiz não existe e a mensagem não é duplicada. Retornar `string` ou `Payload`
  responde à mensagem; `handle` continua retornando `'ignored'` sem acionar
  `onCommand`. A execução assíncrona é rastreada até `destroy()`.

`bot.load(dir)` substitui todos os comandos após validar o diretório inteiro.
`bot.load(dir, false)` adiciona comandos, recusando colisões. `bot.reload(dir)`
atualiza somente a pasta indicada e preserva comandos manuais e de outras pastas.
`bot.command(...)` registra um comando. `listCommands()` e `help()` expõem a lista
e a ajuda. Consulte os detalhes em [API.md](API.md).
O [guia nativo JS/TS](NATIVE.md) cobre schemas `arg.*`, handlers com tipos
inferidos, eventos, checks e middleware por comando.

## Comando nativo

```ts
import { arg, defineCommand } from 'yuzuha';

bot.command(defineCommand({
  name: 'eco',
  description: 'Repete o texto.',
  args: { texto: arg.text().rest().required() },
  async run(ctx) {
    await ctx.reply(ctx.args.get('texto'));
  },
}));
```

`defineCommand` é o caminho principal. Comandos com `code` continuam válidos e
ativam o function mode automaticamente. Veja o [guia nativo](NATIVE.md).

Na 0.1.5, `subcommands` organiza grupos como `!config prefixo ?`; cada folha
declara seus `args` e `flags`. Os builders `arg.*` também inferem os tipos em
`ctx.flags`. `bot.help('config prefixo', '!')` mostra o uso e os metadados da
folha. As regras de herança, parsing e exemplos completos estão em
[NATIVE.md](NATIVE.md).

## Contexto

| Membro | Uso |
|---|---|
| `ctx.message` | Mensagem normalizada; `raw` guarda a mensagem original do SDK |
| `ctx.authorID`, `ctx.guildID`, `ctx.input`, `ctx.tokens` | Dados da execução |
| `ctx.args` | Map de argumentos declarativos convertidos |
| `ctx.flags` | Map de flags declaradas convertidas |
| `ctx.vars` | Map de variáveis locais da execução |
| `ctx.reply(textoOuPayload)` | Resposta sem pings pelo adaptador |
| `ctx.requireGuild()` | Exige servidor e retorna seu ID |
| `ctx.requirePermission(nome, bot?, mensagem?)` | Exige permissão de servidor |
| `ctx.cooldown(duração, mensagem?)` | Cooldown da execução (`void \| Promise<void>`; use `await` com `rateLimiter` assíncrono) |
| `ctx.moderate(ação, alvo, motivo, opções)` | Moderação compartilhada com scripts |
| `ctx.store`, `ctx.transport` | Persistência e operações de transporte |
| `ctx.variable`, `ctx.setVariable` | Variáveis JSON por escopo |
| `ctx.case(id)` | Consulta caso do servidor; retorna `undefined` se ausente |
| `ctx.deleteVariable(scope, name)` | Remove uma variável persistente |
| `ctx.lastCase` | Último caso criado nesta execução |
| `ctx.mod` | ban/kick/timeout/unban com caso por padrão |
| `ctx.data.guild/user/global` | Dados JSON por escopo com update atômico |
| `ctx.client`, `ctx.nativeMessage` | Client e mensagem original opcional do SDK |
| `ctx.resources` | Recursos nativos de usuários, cargos, canais, mensagens, coletores, webhooks, emojis, threads e convites |
| `ctx.scheduler`, `ctx.http` | Agendamentos persistentes e cliente HTTP seguro |
| `ctx.send/edit/delete/react` | Operações de mensagem pelo transporte |
| `ctx.signal`, `ctx.assert` | Cancelamento cooperativo e recusa de execução |

`moderate` aceita `ban`, `kick`, `timeout`, `unban`; opções: `record`, `duration`
(ms) e `deleteMessageDays`. Com `record: true` retorna o caso. As permissões
consultadas por guards são de servidor, adequadas à moderação; para permissões
específicas de canal, use `GuildMember.permissionsIn` pelo client original.

## Plugins e funções personalizadas (function mode)

```ts
import { defineConfig } from 'yuzuha';

export default defineConfig({
  name: 'meu-bot',
  setup(bot) {
    bot.plugin({
      name: 'saudacoes',
      functions: [{
        name: 'saudar',
        category: 'personalizado',
        description: 'Monta uma saudação.',
        usage: '$saudar[nome]',
        minArgs: 1,
        maxArgs: 1,
        async execute(call) {
          return `Olá, ${await call.text(0)}!`;
        },
      }],
    });
  },
});
```

Uso: `$reply[$saudar[$username]]`. `call.arg(i)` preserva o tipo, `call.text(i)`
converte em texto e `call.all()` avalia os argumentos em ordem. Argumentos são
lazy e memoizados, inclusive promessas. `call.ctx` expõe o contexto e
`call.wait(promise)` aguarda I/O sem consumir o prazo do script.

Plugins podem incluir `commands`, `events` e `middleware`. A instalação valida
o lote antes de alterar os registros; funções do próprio plugin já são
consideradas ao compilar seus scripts. Nomes de plugin, funções e comandos não
podem colidir nos respectivos registros. Também é
possível usar `bot.engine.registerAll(...)` diretamente.
Registre as funções antes de carregar comandos que as utilizam.

## Middleware

```ts
bot.use(async (ctx, next) => {
  const start = performance.now();
  await next();
  console.log(ctx.command.name, Math.round(performance.now() - start));
});
```

Os guards declarativos e argumentos são preparados antes do middleware. Chamar
`next` executa o próximo middleware ou o comando; omitir `next` interrompe a cadeia.
Cada middleware só pode chamar `next` uma vez e deve aguardar sua promessa.
Checks do comando rodam após a preparação, seguidos pelos middlewares globais e
pelos middlewares do comando. `false` ou uma string em um check recusam a execução.

## Instâncias próprias do Fluxer

```ts
import { Client } from 'yuzuha/sdk';
import { defineCommand, Yuzuha } from 'yuzuha';

const client = await Client.fromDiscovery('https://minha-instancia.example');
const bot = new Yuzuha({ client, name: 'instancia-local', prefix: '!' });
bot.command(defineCommand({
  name: 'ping',
  async run(ctx) { await ctx.reply('Pong!'); },
}));
await bot.login(process.env.FLUXER_BOT_TOKEN);
```

Use um token emitido pela instância. Endpoints, REST, gateway e cache continuam
sob responsabilidade do SDK. O Yuzuha conecta apenas quando `login` é chamado.
`destroy(opções?)` remove o listener, recusa novas mensagens, aguarda os comandos
ativos e encerra o client. Chamadas externas aguardam todo o encerramento;
chamadas de dentro de um comando, middleware ou hook do próprio bot apenas
solicitam o encerramento e retornam para o handler poder terminar. O login
pendente recebe um sinal de cancelamento.

Passando `{ timeoutMs }` (inteiro entre `1` e `600_000`; valores inválidos
rejeitam com `SHUTDOWN_OPTIONS`), o encerramento limita a drenagem de comandos,
eventos e scheduler: se o prazo vencer antes do término, emite o evento
`shutdown.timeout` (`pending`) em nível `warn` e prossegue com o fechamento de
música, voz, timers, client e store. Para encerrar processos próprios em
resposta a sinais do sistema:

```ts
const dispose = bot.handleSignals({
  signals: ['SIGINT', 'SIGTERM'],
  timeoutMs: 10_000,
  onExit: code => { process.exitCode = code; },
});
```

`handleSignals` retorna um removedor idempotente e também é desconectado
automaticamente quando `bot.destroy()` executa. O bot fecha seu store padrão,
mas não um store fornecido pelo chamador. Veja [STORAGE.md](STORAGE.md) para
propriedade e fechamento.

### Cache de membros

Por padrão, `FluxerTransport.member` consulta o servidor, cargos e membro via REST
a cada resolução. Para reduzir chamadas repetidas entre comandos, habilite
`memberCache: { ttlMs, max? }` nas opções de `Yuzuha`:

```ts
const bot = new Yuzuha({
  name: 'meu-bot',
  memberCache: { ttlMs: 30_000, max: 5_000 },
});
```

`ttlMs` aceita inteiros entre `1` e `3_600_000`; `max` aceita inteiros entre `1`
e `1_000_000` (padrão `10_000`). Entradas expiradas ou mais antigas (LRU) são
removidas automaticamente, e eventos do gateway (`GuildMemberUpdate`,
`GuildMemberRemove`, `GuildRoleCreate`, `GuildRoleUpdate`, `GuildRoleDelete`,
`GuildDelete`, `ChannelUpdate` e `ChannelDelete`) invalidam o escopo afetado.
`destroy()` remove os listeners anexados e limpa o cache.

### Limites de concorrência

Para limitar execuções simultâneas de comandos, configure `concurrency` nas
opções de `Yuzuha`:

```ts
const bot = new Yuzuha({
  name: 'meu-bot',
  concurrency: { max: 32, perGuild: 4, maxPending: 128 },
});
```

- `max`: inteiro seguro `>= 1` com o teto global de comandos em execução.
- `perGuild`: inteiro seguro `>= 1` por `guildID`. Mensagens diretas (sem
  `guildID`) ignoram o limite por servidor e obedecem apenas a `max`.
- `maxPending`: inteiro seguro `>= 0` para a fila de espera. Quando a fila está
  cheia, despachos excedentes retornam `'ignored'` e registram em `onLog` o
  evento `dispatch.dropped` (`reason: 'concurrency'`, `guildID`, `channelID`).

Ao liberar uma vaga, o limitador acorda o item mais antigo da fila cujo servidor
tenha cota disponível, evitando que picos em um servidor bloqueiem os demais.
Opções inválidas lançam `CONCURRENCY_OPTIONS`. Em `destroy()`, os itens em
espera são liberados imediatamente como `'ignored'`, sem emitir
`dispatch.dropped`.

### Cache de prefixos dinâmicos

Quando `prefix` é uma função que consulta banco ou configuração externa,
habilite `prefixCache: { ttlMs, max? }` nas opções de `Yuzuha` (desligado por
padrão):

```ts
const bot = new Yuzuha({
  name: 'meu-bot',
  prefix: async message => carregarPrefixos(message.guildID),
  prefixCache: { ttlMs: 60_000, max: 5_000 },
});
```

- `ttlMs`: inteiro seguro entre `1` e `3_600_000` (usa `now`, ou `Date.now`).
- `max`: inteiro seguro entre `1` e `100_000` (padrão `5_000`) com remoção LRU.
- Opções inválidas lançam `PREFIX_CACHE_OPTIONS`.

Com a entrada quente no cache por servidor (`guildID`) ou DM (`channelID`),
mensagens que não acionam comandos retornam `'ignored'` sincronamente sem chamar
`prefix`. Chame `bot.invalidatePrefix(guildID)` ao alterar o prefixo de um
servidor ou `bot.invalidatePrefix()` para limpar todo o cache; resoluções em
andamento antes da invalidação ou de `destroy()` não populam o cache. Arrays de
prefixos validados também reutilizam um cache LRU interno de até 256 entradas.

### Retry de transporte

Por padrão, `FluxerTransport` e os recursos de mensagens repetem operações
idempotentes em falhas transitórias e envios não entregues usando backoff
exponencial. Configure `retry: false | TransportRetryPolicy` nas opções de
`Yuzuha`:

```ts
const bot = new Yuzuha({
  name: 'meu-bot',
  retry: {
    requests: 3,
    delayMs: 500,
    backoff: 2,
    maxDelayMs: 10_000,
    jitter: 0.25,
    retryOn: (error, attempt) => attempt <= 2 && isTransientError(error),
  },
});
```

- `requests` (padrão `1`): inteiro não negativo com o máximo de repetições.
- `delayMs` (padrão `750`): atraso inicial finito maior que zero, em ms.
- `backoff` (padrão `2`): fator finito `>= 1` para o cálculo
  `min(maxDelayMs, delayMs * backoff ** (attempt - 1))`.
- `maxDelayMs` (padrão `30_000`): teto finito maior que zero para o atraso.
- `jitter` (padrão `0`): fator finito entre `0` e `1`; quando maior que zero,
  sorteia via `random()` (padrão `Math.random`, validado entre `0` e `1`) e
  limita o resultado a `[1, maxDelayMs]` (ou `maxDelayMs` se menor que `1`).
- `retryOn(error, attempt)`: predicado opcional com o número 1-based da
  repetição; quando informado, substitui o predicado padrão da operação.
- `retry: false`: desativa repetições; opções inválidas lançam
  `ConfigError` (subclasse de `YuzuhaError`) com código `RETRY_OPTIONS` já no construtor.

Quando `onLog` está definido, cada repetição emite `transport.retry` com
`attempt` e `delayMs`.

### Rate limiter e deduplicação (`rateLimiter`)

Por padrão, o bot cria um `MemoryRateLimiter` por instância usando `rateLimits`
(`maxCooldowns`, `onCooldownCapacity`, `maxDedupe`, `dedupeWindowMs`) e o
relógio `now`. Para compartilhar cooldowns e deduplicação de mensagens entre
vários processos (por exemplo, sobre Redis com `SET PX NX` ou script Lua),
injete uma implementação do port `RateLimiter` em `YuzuhaOptions.rateLimiter`:

```ts
import { Yuzuha } from 'yuzuha';
import type { RateLimiter } from 'yuzuha';

const rateLimiter: RateLimiter = {
  async cooldown(key, durationMs) {
    // Retorne 0 se concedido ou os milissegundos restantes (> 0) se bloqueado.
    return 0;
  },
  async duplicate(channelID, messageID) {
    // Retorne true se (channelID, messageID) já foi visto dentro da janela.
    return false;
  },
  async close() {
    // Opcional: encerramento de clientes/conexões externos.
  },
};

const bot = new Yuzuha({ prefix: '!', rateLimiter });
```

- **Modo síncrono e assíncrono**: `cooldown` retorna `number | Promise<number>`
  e `duplicate` retorna `boolean | Promise<boolean>`. Limitadores síncronos
  (como `MemoryRateLimiter`) preservam o caminho rápido síncrono e o lançamento
  síncrono de `GuardError` em `ctx.cooldown(...)`. Quando `rateLimiter.cooldown`
  retorna uma `Promise`, `ctx.cooldown(...)` também retorna `Promise<void>` —
  prefira `await ctx.cooldown(...)` ao escrever comandos portáveis; `cooldown`
  declarativo e `$cooldown` aguardam automaticamente.
- **Deduplicação assíncrona**: se `duplicate` retornar `Promise<boolean>`, o
  bot aguarda a resolução dentro do despacho rastreado (inclusive sob
  `prefixCache` quente e `hooks.onUnknownCommand`) antes de cancelar ou seguir.
- **Validação e propriedade**: um `rateLimiter` sem métodos `cooldown` e
  `duplicate` válidos (ou `close` não-função) lança `ConfigError` com código
  `RATE_LIMIT_OPTIONS`. Como ocorre com `store`, `bot.destroy()` chama
  `close?.()` apenas quando o limitador foi criado pelo próprio bot; um
  `rateLimiter` injetado continua sob responsabilidade do chamador.

### Lock distribuído do scheduler (`lock`)

Para coordenar claims de tarefas agendadas entre várias instâncias (sem
recorrer a disputa de escrita no store), injete uma implementação do port `Lock`
em `YuzuhaOptions.lock` (ou diretamente em `SchedulerOptions.lock`):

```ts
import { Yuzuha } from 'yuzuha';
import type { Lock } from 'yuzuha';

const lock: Lock = {
  async acquire(key, ttlMs) {
    // Adquira a chave com TTL e token exclusivo, ou retorne null se já ocupada.
    return {
      key,
      token: 'lease-token',
      async renew(nextTtlMs) { return true; },
      async release() {},
    };
  },
  async close() {
    // Opcional: encerramento gerenciado pelo chamador.
  },
};

const bot = new Yuzuha({ prefix: '!', lock });
```

- **Chave, renovação e recuperação**: o scheduler adquire `schedule:<taskID>`
  com `ttlMs: leaseMs`, renova via `lease.renew?.(leaseMs)` no heartbeat (abortando
  a tarefa se `renew` retornar `false`), libera em `finally` após persistir o
  resultado e protege `recover()` com a mesma chave para não liberar tarefas
  ainda bloqueadas em outro processo.
- **Implementação em memória**: `MemoryLock` fornece um `Lock` síncrono em
  memória com expiração por TTL (`now`) e proteção por token para testes e
  ambientes de processo único.
- **Validação e propriedade**: um `lock` sem função `acquire` (ou `close`
  não-função) lança `ConfigError` com código `LOCK_OPTIONS`. Como ocorre com
  `store` e `rateLimiter` injetados, `bot.destroy()` drena o scheduler (liberando
  leases ativas) mas não chama `lock.close?.()`, mantendo a posse no chamador.
  Veja também [SCHEDULER.md](SCHEDULER.md).

## Testes sem rede

```ts
import { defineCommand, MemoryStore, Yuzuha } from 'yuzuha';
import { MockTransport, mockMessage } from 'yuzuha/testing';

const transport = new MockTransport();
const bot = new Yuzuha({ transport, store: new MemoryStore() });
bot.command(defineCommand({
  name: 'ping',
  async run(ctx) { await ctx.reply('Pong!'); },
}));
await bot.handle(mockMessage('!ping'));
console.log(transport.messages[0]?.payload.content);
await bot.destroy();
```

O mock usa IDs `1` para autor/dono, `2` para alvo, `999` para bot, `100` para
servidor e `200` para canal. Configure outros membros com `setMember`.


## Emojis personalizados

Não feche sobre valores de emoji capturados no load do módulo: comandos
são reimportados por `reload(dir)`, e o cache de emojis do SDK muda em
runtime. Resolva em tempo de chamada — por exemplo um getter de módulo
que lê `bot.client.guilds` → `guild.emojis` quando o comando executa.

```ts
const emoji = (guildID: string, name: string) =>
  [...bot.client.guilds.resolve(guildID).emojis.values()].find(e => e.name === name);
```
