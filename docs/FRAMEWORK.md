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

## Contexto

| Membro | Uso |
|---|---|
| `ctx.message` | Mensagem normalizada; `raw` guarda a mensagem original do SDK |
| `ctx.authorID`, `ctx.guildID`, `ctx.input`, `ctx.tokens` | Dados da execução |
| `ctx.args` | Map de argumentos declarativos convertidos |
| `ctx.vars` | Map de variáveis locais da execução |
| `ctx.reply(textoOuPayload)` | Resposta sem pings pelo adaptador |
| `ctx.requireGuild()` | Exige servidor e retorna seu ID |
| `ctx.requirePermission(nome, bot?, mensagem?)` | Exige permissão de servidor |
| `ctx.cooldown(duração, mensagem?)` | Cooldown da execução |
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
consideradas ao compilar seus scripts. Se o plugin trouxer um comando com `code`,
os builtins são registrados antes da compilação. Nomes de plugin, funções e comandos não
podem colidir nos respectivos registros. Também é
possível usar `bot.runtime.register(...)` e `registerAll(...)` diretamente.
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
`destroy()` remove o listener, recusa novas mensagens, aguarda os comandos ativos
e encerra o client. Chamadas externas aguardam todo o encerramento; chamadas de
dentro de um comando, middleware ou hook apenas solicitam o encerramento e retornam
para o handler poder terminar. O login pendente recebe um sinal de cancelamento.
O bot fecha seu store padrão, mas não um store fornecido pelo chamador. Veja
[STORAGE.md](STORAGE.md) para propriedade e fechamento.

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
