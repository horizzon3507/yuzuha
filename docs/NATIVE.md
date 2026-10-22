# Guia principal: bots em JavaScript e TypeScript

Este é o caminho principal do Yuzuha: comandos e eventos em JS/TS, sem funções
`$...`. O function mode é opcional, importado de `yuzuha/functions`, e compartilha
transporte, persistência, guards e moderação com os comandos nativos.
O acesso ao client Fluxer.js continua disponível para recursos específicos do SDK.

Os exemplos usam imports públicos de **Yuzuha 0.1.4**. JavaScript usa os mesmos
imports e objetos; TypeScript acrescenta inferência e validação estática.

## Um comando com argumentos inferidos

```ts
import { Yuzuha, arg, defineCommand } from 'yuzuha';

const bot = new Yuzuha({ prefix: '!' });

bot.command(defineCommand({
  name: 'somar',
  description: 'Soma dois números inteiros.',
  args: {
    a: arg.integer().required(),
    b: arg.integer().default(1),
  },
  async run(ctx) {
    const a = ctx.args.get('a'); // number
    const b = ctx.args.get('b'); // number: o padrão resolve a ausência
    await ctx.reply(String(a + b));
  },
}));

await bot.login();
```

`!somar 10 5` responde `15`; `!somar 10` responde `11`. Em TypeScript, a chave
passada a `get` também é conferida. Não é necessário `Number(...)` ou cast.
Um argumento opcional sem valor padrão inclui `undefined` em seu tipo.

Use schemas de objeto em `defineCommand` ou diretamente em `bot.command`: ambos
normalizam os argumentos para as definições usadas pelo framework, preservando a
inferência. O formato anterior `args: [{ name, type, ... }]` permanece válido e
`ctx.args` mantém a interface de `Map`.

## Argumentos e validação

| Builder | Valor entregue ao handler |
|---|---|
| `arg.string()` / `arg.text()` | `string` |
| `arg.number()` | `number` finito |
| `arg.integer()` | `number` inteiro seguro |
| `arg.boolean()` | `boolean` |
| `arg.user()` | ID de usuário em `string`, normalizado de ID/menção |
| `arg.duration()` | Duração em milissegundos, como `number` |

Os builders são imutáveis. `required()`, `optional()` e `default(valor)` definem
como tratar a ausência. `min(n)` e `max(n)` limitam números; em texto limitam o
comprimento. `choices([...])` restringe valores e infere uma união literal.
`validate(predicado, mensagem)` acrescenta uma validação síncrona.

```ts
const modo = arg.text().choices(['resumo', 'completo']).default('resumo');
const quantidade = arg.integer().min(1).max(100).default(10);
const motivo = arg.text().min(3).max(500).rest().required();
```

Argumentos seguem a ordem das propriedades do schema e são posicionais.
`rest()` reúne os tokens restantes e deve estar no último argumento. Aspas
permitem um argumento com espaços. `boolean()` aceita `true/false`, `yes/no`,
`sim/não/nao` e `1/0`.

`user()` não faz busca de rede nem retorna `GuildMember`. Para um objeto real,
resolva o membro pelo SDK. Nos comandos legados ou em código que recebe apenas
`CommandContext`, `ctx.args.require(nome)` exige a presença;
`string/number/boolean(nome)` verificam o tipo e retornam `undefined` se ausente.

## Moderação com um serviço compartilhado

```ts
import { arg, defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'ban',
  guildOnly: true,
  cooldown: '5s',
  args: {
    membro: arg.user().required(),
    motivo: arg.text().min(3).max(500).rest().required(),
  },
  async run(ctx) {
    const caso = await ctx.mod.ban(ctx.args.get('membro'), {
      reason: ctx.args.get('motivo'),
      deleteMessageDays: 0,
    });

    await ctx.reply(`Membro banido. Caso #${caso.id}.`);
  },
});
```

`ctx.mod.ban`, `kick`, `timeout` e `unban` usam as verificações de autor, bot e
hierarquia dos serviços de moderação. O alvo aceita um ID ou objeto com `id`.
O registro de caso é ativado por padrão e o retorno é um `CaseRecord`.
Com `{ record: false, reason: '...' }`, o retorno é `undefined`.

```ts
await ctx.mod.timeout(alvoID, { duration: '10m', reason: 'Spam repetido' });
await ctx.mod.kick(alvoID, { reason: 'Conta abusiva', record: false });
await ctx.mod.unban(alvoID, { reason: 'Recurso aceito' });
```

Uma ação remota e sua persistência não formam uma transação única. Se a ação
ocorrer e o caso falhar, `PartialModerationError` informa o resultado parcial.
Não repita a moderação automaticamente. Veja [estado e execução](STORAGE.md).
O método anterior `ctx.moderate(...)` continua disponível.

## Dados por escopo e atualizações atômicas

```ts
import { assert, defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'ponto',
  cooldown: '10s',
  async run(ctx) {
    const pontos = await ctx.data.user.update('pontos', atual => {
      assert(typeof atual === 'number', 'O saldo salvo não é numérico.');
      return atual + 1;
    }, 0);

    await ctx.reply(`Você tem ${pontos} pontos.`);
  },
});
```

`ctx.data.user` usa o autor; `guild` usa o servidor atual e exige execução em
servidor; `global` compartilha dados entre comandos daquele store. O escopo de
usuário não inclui o ID do servidor. Todas oferecem `get(nome, fallback?)`,
`set(nome, valor)`, `delete(nome)` e `update(nome, updater, fallback?)`.

`update` executa leitura e escrita na mesma atualização do store. Seu callback
é síncrono: receba e retorne um valor JSON, sem requests ou `await` dentro dele.
A atomicidade cobre o contrato e a transação do store; não é uma transação com
a API do Fluxer nem uma promessa de coordenação de vários processos para JSON.
O valor lido é `JsonValue`, portanto valide seu formato antes de operar. O retorno
de `update` infere o tipo produzido pelo callback; neste exemplo, `number`.

## Mensagens no transporte do Yuzuha

```ts
const enviadaID = await ctx.send('Processando…');
await ctx.edit(enviadaID, 'Concluído.');
await ctx.react('✅');
await ctx.delete(enviadaID);
```

| Método | Destino padrão e retorno |
|---|---|
| `reply(payload)` | Resposta à mensagem original; retorna ID |
| `send(payload, channelID?)` | Canal atual; retorna ID |
| `edit(messageID, payload, channelID?)` | Canal atual; retorna `void` |
| `delete(messageID, channelID?)` | Canal atual; retorna `void` |
| `react(emoji, messageID?, channelID?)` | Mensagem original e canal atual; retorna `void` |

Payload aceita texto ou o objeto do Yuzuha com `content` e `embeds`. Esses
métodos passam pelo transporte, permitindo `MockTransport` nos testes.
Para anexos e opções completas de envio, use o SDK.

## Usar o SDK diretamente

`ctx.client` é o client real. `ctx.nativeMessage` é a `Message` original quando
o evento de entrada fornece uma; pode estar ausente em dispatch manual e testes.
O objeto normalizado continua em `ctx.message`.

```ts
const guildID = ctx.requireGuild();
const guild = await ctx.client.guilds.fetch(guildID);
const membro = await guild.members.resolve(alvoID);
await ctx.reply(`${membro.displayName}: ${membro.roles.roleIds.length} cargos.`);
```

Um `CommandContext` construído manualmente precisa receber `native: { client }`
para expor o client. Sem isso, `ctx.client` lança `NATIVE_UNAVAILABLE`.
`bot.handle` com transporte mock pode ser testado usando apenas os serviços do
Yuzuha. Chamadas diretas ao client exigem mocks ou fixtures próprios.

`yuzuha/sdk` reexporta os exports públicos da raiz do SDK. Assim, você pode
importar `Events`, `AttachmentBuilder`, `EmbedBuilder` e os tipos do Fluxer.js.
A assinatura completa dessas classes pertence ao SDK fixado em 3.3.0.

## Recursos nativos

As funções `$...` de usuários, cargos, canais, mensagens, coletores, webhooks,
emojis, stickers, threads e convites passam por um conjunto de contratos em
`Resources`. O mesmo conjunto fica disponível em `ctx.resources` e compartilha a
tradução para o SDK entre scripts e comandos nativos.

```ts
const membro = await ctx.resources.users.member(ctx.requireGuild(), alvoID);
const canais = await ctx.resources.channels.list(ctx.requireGuild());
const fixadas = await ctx.resources.messages.pinned(ctx.message.channelID, 10);
await ctx.reply(`${membro.displayName}: ${canais.length} canais, ${fixadas.length} fixadas.`);
```

| Área | Operações principais |
|---|---|
| `users` | `user`, `member`, `members`, `memberCount`, `guild`, `bans`, `auditLogs`, `setPresence`, `searchMembers`, `setNickname`, `editGuild` |
| `roles` | `list`, `resolve`, `has`, `create`, `edit`, `delete`, `add`, `remove`, `move` |
| `channels` | `list`, `get`, `create`, `edit`, `delete`, `setSlowmode`, `overwrite`, `permissionsFor`, `move`, `setCategory` |
| `messages` | Histórico com cursores, fixados, reações, `dm`, `forward`, `search`, `sendFiles`, `sendBytes`, `sendAttachments` |
| `collectors` | `awaitMessage`, `awaitReaction` |
| `webhooks` | `list`, `create`, `send`, `edit`, `delete` |
| `expressions` | CRUD de emojis/stickers, `cloneEmoji`, `cloneSticker` |
| `threads` | `create`, `archive`, `unarchive`, `forumPost`, `addMember`, `removeMember`, `members`, `edit`, `join`, `leave`, `search` |
| `invites` | `get`, `create`, `delete`, `list`, `vanity`, `setVanity` |

Os retornos são objetos normalizados e serializáveis (`UserInfo`, `MemberInfo`,
`MessageInfo` etc.), não instâncias do SDK. Isso mantém os mesmos dados nos
scripts, nos testes e no contexto nativo. Para métodos não cobertos, use
`ctx.client`; a lista de lacunas está em [FUNCTION-GAPS.md](FUNCTION-GAPS.md).

Um bot real cria `FluxerResources` automaticamente. A opção `resources` permite
substituir a implementação; sem ela, `ctx.resources` lança `NATIVE_UNAVAILABLE`.
Os contratos completos são exportados pela raiz do pacote.

```ts
const usuarios = await ctx.resources.messages.reactionUsers(ctx.message.channelID, mensagemID, '👍', 100);
const membros = await ctx.resources.threads.members(threadID, 100, ultimoUsuarioID);
await ctx.resources.channels.move(canalID, 0);
await ctx.resources.channels.setCategory(canalID, null);
```

`reactionUsers` retorna IDs na ordem da API; use o último como cursor `after`.
`threads.members` retorna `ThreadMemberInfo[]`, com `threadID`, `userID`,
`joinedTimestamp` e `flags`; seu cursor também é um ID de usuário. Os dois métodos
aceitam de 1 a 100 itens por chamada. Posições começam em 0. Categorias precisam
pertencer ao mesmo servidor do canal.

`expressions.createEmoji` e `createSticker` recebem imagem **base64**, conforme
o SDK. `$createEmoji[nome;url]` faz o download e a conversão com `ctx.http`;
`$createSticker` recebe base64 diretamente. Edição de sticker suporta nome,
descrição e motivo; tags são aceitas na criação.

Implementações próprias dos contratos `MessagesResources`, `ThreadsResources`,
`ExpressionsResources`, `UsersResources`, `InvitesResources`, `ChannelsResources` e `RolesResources` precisam fornecer
as novas operações da 0.1.2. Para testes que exercitam apenas parte dos recursos,
use `mockResources`, que aceita implementações parciais por método.

## Recursos e estado da 0.1.2

### Membros e mensagens na 0.1.2

`ctx.members.search(nome, limite?, offset?)` retorna `members`, `total`, `hasMore`
e `indexing`. `ctx.members.setNickname(usuarioOuObjeto, apelidoOuNull, motivo)`
compartilha as verificações de `$nickname`: autor e bot precisam de permissão,
o bot precisa superar o alvo na hierarquia, e o dono é protegido. Para alterar
o próprio apelido, o autor pode usar `ChangeNickname`; `ManageNicknames` também
serve. O motivo deve ter de 1 a 512 caracteres; apelido vazio/null remove.

`resources.users.setNickname` é o port de baixo nível, como acesso direto ao SDK;
use `ctx.members` para autorização do autor. Os demais ports mantêm a autoridade
remota do bot e não substituem guards declarativos do comando.

```ts
const page = await ctx.resources.messages.search({
  content: 'reunião', guildID: ctx.guildID, limit: 25,
});
const history = await ctx.resources.messages.list(ctx.message.channelID, 20, { before: mensagemID });
await ctx.resources.messages.dm(usuarioID, 'Olá!');
await ctx.resources.messages.forward(destinoID, origemID, mensagemID);
await ctx.resources.messages.sendAttachments(ctx.message.channelID, [
  { name: 'a.txt', data: new TextEncoder().encode('conteúdo'), description: 'Texto' },
  { name: 'b.png', url: 'https://example.com/b.png' },
]);
```

Busca de mensagens retorna `{ indexing, messages, total, cursor }`; encaminhe
`cursor` para a próxima busca. Apenas um de `before`/`after`/`around` é permitido
no histórico. `threads.search` retorna indexação e `retryAfter` quando o índice
não está pronto. Anexos nativos aceitam até 10 arquivos e 10 MB de bytes no total;
as URLs são transferidas pelo SDK, sujeitas à sua política e aos limites remotos.

### Transações entre chaves

```ts
const contagem = await ctx.data.transaction(tx => {
  const guild = tx.guild.update('usos', value => Number(value) + 1, 0);
  tx.user.update('usos', value => Number(value) + 1, 0);
  tx.global.set('ultimoServidor', ctx.guildID);
  return guild;
});
```

`tx.guild`, `tx.user` e `tx.global` oferecem `get`, `set`, `delete` e `update`
síncronos. Uma exceção, resultado não clonável, callback assíncrono ou estado
inválido aborta tudo. Entradas, leituras e retorno são isolados por cópia; guardar
a referência `tx` não permite usá-la depois. Em DM, global/user funcionam;
acessar guild aborta a transação. Não aguarde I/O dentro do callback.

## Recursos acrescentados na 0.1.3

```ts
await ctx.mod.move('123', { channelID: '456', reason: 'organizar a sala' });
await ctx.mod.mute('123', { enabled: true, reason: 'ruído' });
await ctx.mod.deafen('123', { enabled: false, reason: 'restaurar áudio' });
const perfil = await ctx.resources.users.profile('123', ctx.guildID);
const contagens = await ctx.resources.users.guildCounts(ctx.guildID, { signal: ctx.signal });
const ativas = await ctx.resources.threads.active(ctx.requireGuild());
const arquivadas = await ctx.resources.threads.archived('456', { type: 'public', limit: 50 });
```

As três ações de voz exigem motivo, permissões do autor e bot e hierarquia.
`move` aceita `channelID: null` para desconectar e verifica permissões efetivas no
destino; o adaptador recusa destino fora do servidor ou sem tipo de voz. As regras
de permissão gerais são conservadoras e também exigem o grant no servidor.
Use `record: false` para omitir caso, mantendo os guards e o registro de efeito.
Uma falha ao salvar o caso após a ação gera `PartialModerationError`.

Threads arquivadas aceitam `public`, `private` ou `joined`. Limite é 2–100;
`before` é um timestamp nos dois primeiros tipos e ID no tipo `joined`.
O retorno inclui `threads`, `members`, `hasMore` e `nextBefore`; contagens ao vivo
aguardam eventos do gateway com timeout de 5s (configurável de 1 a 60000 ms).

`channels.create` aceita tipo `GuildLink` com `url` HTTP(S), e `channels.edit`
aceita `url`, `contentWarningLevel` (0, 1 ou null) e `contentWarningText`.
Os helpers de script verificam autor/bot e o servidor; ports nativos seguem
a autoridade do client. Áudio reproduzido em voz continua no pacote opcional.

TTL, `userFor` e transações declarativas estão descritos em
[STORAGE.md](STORAGE.md). Logs opcionais e correlação ficam em
[OBSERVABILITY.md](OBSERVABILITY.md).

## Agendamentos

```ts
const id = await ctx.scheduler.add({
  guildID: ctx.requireGuild(),
  channelID: ctx.message.channelID,
  authorID: ctx.authorID,
  command: 'status',
  input: '',
  due: Date.now() + 60_000,
  interval: 24 * 3_600_000, // opcional
});

await ctx.scheduler.cancel(id);
const tarefas = await ctx.scheduler.list();
```

O scheduler é persistente no store, inicia junto com `login` e para em `destroy`.
Cada tarefa é reivindicada atomicamente antes da execução; o padrão de retry é
30 segundos e até cinco tentativas. Tarefas repetíveis avançam o vencimento sem
acumular execuções atrasadas. Use `scheduler: false` para desligar ou injete uma
instância própria em `scheduler`.

```ts
const id = await ctx.scheduler.add({
  guildID: ctx.guildID, channelID: ctx.message.channelID, authorID: ctx.authorID,
  command: 'lembrete', input: 'reunião', due: Date.now() + 60_000,
  maxAttempts: 3, retryDelayMs: 10_000, retryBackoff: 2,
});
await ctx.scheduler.pause(id);
await ctx.scheduler.edit(id, { input: 'reunião da equipe', interval: null });
await ctx.scheduler.resume(id, Date.now() + 120_000);
```

`interval: null` remove repetição. Pausar mantém o vencimento; retomar pode
definir outro e reinicia o contador de tentativas. Alterações em tarefas já
reivindicadas falham com `SCHEDULE_RUNNING`. `maxAttempts` aceita 1–100,
`retryDelayMs` aceita 1–604800000 ms e `retryBackoff` aceita 1–10. O atraso
exponencial é limitado a sete dias. Campos são opcionais e compatíveis com schema 2.

Guards e falhas após moderação aplicada, mesmo com `record: false`, são terminais.
Falhas operacionais anteriores recebem retry. `ScheduleExecutionError(false)`
permite sinalizar falhas terminais em callbacks próprios. Tarefas interrompidas
por queda do processo podem ser recuperadas: use comandos idempotentes; a API
remota e o store não formam uma transação distribuída.

```ts
const falhas = await ctx.scheduler.failed();
const historico = await ctx.scheduler.history();
if (falhas[0]?.retryable) await ctx.scheduler.retry(falhas[0].id, Date.now() + 60_000);
```

O ID de reexecução é o da entrada do histórico. O padrão retém 1000 execuções,
com snapshot, resultado, instantes e código de erro. Guards e efeitos de moderação
recusam reexecução manual. Heartbeat mantém a reserva de tarefas longas e falhas de
manutenção chegam aos hooks; veja os limites em [STORAGE.md](STORAGE.md).

## HTTP

```ts
const resposta = await ctx.http.request({
  method: 'GET',
  url: 'https://api.exemplo.com/itens',
  headers: { Accept: 'application/json' },
});
const dados = JSON.parse(resposta.body) as unknown;
```

`ctx.http` é um `HttpService` com timeout de 5s, limite de 1 MB e bloqueio de
hosts privados/loopback/metadados por padrão. A allowlist, o tempo, o limite e a
implementação de `fetch` são configuráveis:

```ts
import { HttpService, Yuzuha } from 'yuzuha';

const http = new HttpService({
  timeoutMs: 10_000,
  maxBytes: 2_000_000,
  allowedHosts: ['api.exemplo.com'],
});

const bot = new Yuzuha({ prefix: '!', http });
```

Redirecionamentos são seguidos manualmente e revalidados contra a mesma política.
Credenciais `Authorization`, `Proxy-Authorization` e `Cookie` são removidas
quando o destino muda de origem. Para imagens e outros binários, use
`ctx.http.requestBytes({ method: 'GET', url })`: o retorno é
`HttpResponse<Uint8Array>`, com os mesmos controles de rede, tamanho e tempo.
`http: false` remove o serviço e faz `ctx.http` lançar `NATIVE_UNAVAILABLE`.

## Testes offline com recursos simulados

```ts
import { mockResources } from 'yuzuha/testing';

const users = {
  async user(id: string) {
    return { id, username: 'ana', displayName: 'Ana', bot: false,
      avatarURL: null, bannerURL: null, createdTimestamp: 0 };
  },
};

const resources = mockResources({ users });
```

`mockResources` preenche áreas e métodos não informados com uma implementação que
lança `NATIVE_UNAVAILABLE` ao ser chamada. Sobrescreva só os métodos exercitados;
campos privados e o `this` da implementação são preservados. O helper não substitui o SDK real:
testes de integração ainda precisam de fixtures próprios.

## Checks e middleware por comando

```ts
import { defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'status',
  checks: [ctx => ctx.guildID !== '' || 'Use em um servidor.'],
  middleware: [async (ctx, next) => {
    const inicio = performance.now();
    await next();
    console.log(ctx.command.name, performance.now() - inicio);
  }],
  async run(ctx) {
    await ctx.reply('Operando.');
  },
});
```

Um check pode ser assíncrono. `false` recusa a execução; uma string recusa com
aquela mensagem; `true` ou `undefined` continuam. Os checks rodam após a preparação
(permissões, argumentos e cooldown) e antes dos middlewares globais e locais. `ctx.assert(condição, mensagem)`
lança `GuardError` para recusar dentro de um handler. Para estreitar tipos no
TypeScript, importe `assert` de `yuzuha`, como no exemplo de dados acima;
`ctx.assert` oferece a mesma recusa em runtime sem estreitamento estático.

Middleware usa `await next()` para continuar e pode omiti-lo para interromper.
É executado na ordem de registro, com o retorno passando pela ordem inversa.
Chamadas repetidas de `next()` são erros. O middleware global de `bot.use` e de
plugins continua disponível.

## Cancelamento e encerramento

`ctx.signal` recebe o sinal de encerramento do bot. HTTP e collectors acessados
pelo contexto combinam esse sinal com um sinal adicional da chamada, encerrando
esperas e removendo listeners. HTTP retorna `EXECUTION_ABORTED`; timeout continua
como `HTTP_TIMEOUT`. O runtime verifica cancelamento entre avaliações e `$try`
não o captura. Use-o também em operações próprias que
aceitem `AbortSignal` ou verifique-o em trabalho prolongado. O cancelamento é
cooperativo: não desfaz uma ação de moderação já confirmada nem interrompe toda
Promise automaticamente. O bot aguarda trabalho rastreado antes de encerrar.

## Eventos tipados e erros assíncronos

Com o `bot` criado, registre listeners usando os nomes do SDK:

```ts
import { defineEvent } from 'yuzuha';
import { Events } from 'yuzuha/sdk';

bot.once(Events.Ready, () => {
  console.log('Conectado.');
});

bot.event(defineEvent({
  event: Events.GuildMemberAdd,
  async run(membro) {
    console.log(`${membro.displayName} entrou em ${membro.guild.name}.`);
  },
}));
```

Os parâmetros de cada evento são inferidos do SDK. `Events.Ready`, por exemplo,
não recebe argumentos. Os handlers recebem os objetos nativos, não um
`CommandContext`. Para enviar mensagens, use o client ou um serviço seu.

`bot.on(evento, handler)` e `bot.once(evento, handler)` aceitam funções síncronas
ou assíncronas. `bot.off(evento, handler)` remove as inscrições daquele callback;
preserve sua referência para removê-lo depois. Uma definição `defineEvent` pode
usar `once: true` e ser passada a `bot.event` ou a um plugin.

O framework encaminha exceções e rejeições para `onError`, rastreia handlers em
execução e remove seus listeners no encerramento. Eventos não têm contexto de
comando nesse callback de erro. Os handlers podem executar concorrentemente;
`emit` do client não aguarda suas Promises. Use `bot.signal` em operações de
listener que aceitem cancelamento.

Listeners registrados diretamente em `bot.client.on` continuam sob o ciclo de
vida e tratamento de erros do consumidor. Prefira `bot.on` quando quiser o
tratamento oferecido pelo Yuzuha.

## Plugins que agrupam capacidades

```ts
import { defineCommand, defineEvent } from 'yuzuha';
import { Events } from 'yuzuha/sdk';

bot.plugin({
  name: 'utilidades',
  commands: [defineCommand({
    name: 'ping',
    async run(ctx) {
      await ctx.reply('Pong!');
    },
  })],
  events: [defineEvent({
    event: Events.Ready,
    once: true,
    run() {
      console.log('Utilidades carregadas.');
    },
  })],
});
```

O mesmo plugin pode incluir `functions` e `middleware`. As funções ficam
disponíveis para validar scripts de seus comandos. Nome duplicado de plugin,
conflitos de comandos/funções e eventos inválidos são rejeitados antes de
registrar as capacidades do plugin.

O comando nativo e o comando com `code` usam a mesma registry: nomes e aliases
não podem disputar o mesmo espaço. Registrar um comando com `code` ativa o
function mode automaticamente; `bot.enableFunctions()` apenas antecipa o registro. Plugins não constituem um sandbox de JS/TS;
seu código tem as permissões normais do processo Node.

A [referência do framework](FRAMEWORK.md) detalha carregamento de diretórios,
recarga, middleware global e composição com funções de script.

## Recursos acrescentados na 0.1.4

`ctx.resources.roles`, `channels` e `webhooks` compartilham as verificações de
permissão do autor e do bot com scripts. O acesso direto por `bot.resources` ou
`bot.client` continua usando a autoridade do bot. Veja as regras e limitações
em [PARITY.md](PARITY.md) e as mudanças de ports em
[VERSIONING.md](../VERSIONING.md).

`bot.scriptEvent` e `plugin.scriptEvents` adicionam eventos de script com contexto
próprio; eventos nativos continuam recebendo os objetos originais do SDK.
Cron com fusos e retry/concorrência, HTTP em streaming/multipart e manutenção de
estado têm guias específicos:

- [Eventos](EVENTS.md): payloads parciais, principal de autorização e encerramento.
- [Scheduler](SCHEDULER.md): expressão, timezone, atrasos e claims.
- [HTTP](HTTP.md): limites, sinais e políticas por comando.
- [Estado](STORAGE.md): limpeza com cursor, estatísticas e backup/restauração.
- [CLI](CLI.md): lint, catálogos e cenários JSON sem conexão.
