# Receitas

Os comandos abaixo funcionam como exports default de arquivos em `commands/`.
Salve em `.js` ou `.ts` e use `defineCommand` para inferência. As receitas
começam pelo caminho nativo; quando usam `code`, indicam function mode.

## Ban com caso

```ts
import { arg, defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'ban',
  description: 'Bane e registra um caso.',
  args: { membro: arg.user().required(), motivo: arg.text().rest() },
  async run(ctx) {
    const caso = await ctx.mod.ban(ctx.args.get('membro'), {
      reason: ctx.args.get('motivo') ?? '',
    });
    await ctx.reply(`Membro banido. Caso #${caso.id}.`);
  },
});
```

Uso: `!ban @membro spam no chat`. O serviço exige motivo, permissões do autor
e do bot, verifica hierarquia e protege dono, autor e bot. O histórico é preservado
por padrão. `deleteMessageDays` remove de 0 a 7 dias.

`ctx.mod.kick`, `timeout` e `unban` têm as mesmas verificações. Não há confirmação
interativa implícita. Uma falha posterior ao ban não autoriza repeti-lo;
veja [falhas parciais](STORAGE.md).

## Ban em function mode

```ts
import { script } from 'yuzuha/functions';

export default script({
  name: 'ban-funcoes',
  code: `
    $modBan[$mentioned[1];$messageSlice[1]]
    $reply[Membro banido. Caso #$caseID.]
  `,
});
```

O runtime é ativado no registro do comando. O terceiro argumento opcional de
`$modBan` remove de 0 a 7 dias; `$ban` não registra caso.

## Timeout com duração e motivo

```ts
import { defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'silenciar',
  args: [
    { name: 'membro', type: 'user', required: true },
    { name: 'tempo', type: 'string', required: true },
    { name: 'motivo', type: 'string', rest: true, required: true },
  ],
  code: `
    $modTimeout[$arg[membro];$arg[tempo];$arg[motivo]]
    $reply[Membro silenciado. Caso #$caseID.]
  `,
});
```

Uso: `!silenciar @membro 10m flood`. O argumento `tempo` permanece texto para a
função interpretar `10m`. O máximo é 28 dias; administradores não podem receber
timeout. Em JS/TS, `ctx.moderate` recebe `duration` em milissegundos.

## Ajuda e cooldown

```ts
import { defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'ajuda',
  aliases: ['help'],
  description: 'Lista os comandos disponíveis.',
  cooldown: '3s',
  code: '$reply[$help]',
});
```

A ajuda omite comandos com `hidden: true`. O cooldown é por autor, canal,
servidor e comando. `$reply` tem limite de 2000 caracteres; bots com catálogos
grandes devem paginar a ajuda com um comando nativo.

## Embed de perfil

```ts
import { defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'perfil',
  code: `
    $reply[$embed[
      $title[Perfil de $username];
      $color[#EACB1A];
      $field[Usuário;$authorID;true];
      $field[Canal;$channelID;true];
      $footer[Yuzuha]
    ]]
  `,
});
```

As partes do embed são objetos tipados e precisam de `;` entre si.
Quebrar linha não separa argumentos. O adaptador desativa menções nas respostas.

## Configuração por servidor

```ts
import { defineCommand } from 'yuzuha';

export default [
  defineCommand({
    name: 'definir-boasvindas',
    guildOnly: true,
    permissions: ['ManageGuild'],
    args: [{ name: 'texto', rest: true, required: true }],
    code: `
      $setGuildVar[boasVindas;$arg[texto]]
      $reply[Mensagem salva.]
    `,
  }),
  defineCommand({
    name: 'boasvindas',
    guildOnly: true,
    code: '$reply[$getGuildVar[boasVindas;Bem-vindo!]]',
  }),
];
```

Essa receita armazena e consulta a mensagem; não instala um listener de entrada
de membros. O dado recebido nunca é recompilado como script.

## Incremento atômico em JS/TS

```ts
import { defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'contador',
  guildOnly: true,
  async run(ctx) {
    const guildID = ctx.requireGuild();
    const count = await ctx.store.update(state => {
      const key = JSON.stringify(['counter', guildID]);
      const next = Number(state.variables[key] ?? 0) + 1;
      state.variables[key] = next;
      return next;
    });
    await ctx.reply('Contagem: ' + count);
  },
});
```

Uma sequência `$getGuildVar` + `$setGuildVar` não é um incremento atômico.
Use um único callback síncrono de `update` para operações concorrentes.

## Consultar um caso

```ts
import { defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'caso',
  guildOnly: true,
  permissions: ['BanMembers'],
  args: [{ name: 'numero', type: 'integer', required: true }],
  async run(ctx) {
    const record = await ctx.case(Number(ctx.args.get('numero')));
    if (!record) {
      await ctx.reply('Caso não encontrado.');
      return;
    }
    await ctx.reply('Caso #' + record.id + ': ' + record.action + '. ' + record.reason);
  },
});
```

A consulta não aplica permissões de leitura automaticamente. Esta receita restringe
o comando a quem tem `BanMembers`. Revise a visibilidade dos motivos no seu bot.

## Consultar reações sem acessar o SDK diretamente

```ts
import { arg, defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'votos',
  args: { mensagem: arg.string().required() },
  async run(ctx) {
    const ids = await ctx.resources.messages.reactionUsers(
      ctx.message.channelID, ctx.args.get('mensagem'), '👍', 100,
    );
    await ctx.reply(`${ids.length} votos nesta página.`);
  },
});
```

O retorno contém IDs, na ordem da API. Para obter a próxima página, passe o
último ID no quinto argumento de `reactionUsers`. Em script, a operação é
`$reactionUsers[mensagem;👍;100;após?;canal?]`.

## Transformar dados em function mode

```text
$let[pares;$arrayFilter[$range[1;10];$eq[$math[$loopValue;%;2];0]]]
$let[quadrados;$arrayMap[$get[pares];$math[$loopValue;*;$loopValue]]]
$let[soma;$arrayReduce[$get[quadrados];0;$math[$loopAccumulator;+;$loopValue]]]
$reply[Soma dos quadrados pares: $get[soma]]
```

O resultado é `220`. As expressões são avaliadas para cada item com o mesmo
orçamento do script. Dados recebidos em `$loopValue` continuam sendo dados,
inclusive quando contêm nomes de funções.

## Instalar uma função JS própria

Em `yuzuha.config.ts` ou `yuzuha.config.js`:

```ts
import { defineConfig } from 'yuzuha';

export default defineConfig({
  name: 'meu-bot',
  commands: './commands',
  setup(bot) {
    bot.plugin({
      name: 'saudacoes',
      functions: [{
        name: 'saudar',
        category: 'personalizado',
        description: 'Retorna uma saudação.',
        usage: '$saudar[nome]',
        minArgs: 1,
        maxArgs: 1,
        async execute(call) {
          return 'Olá, ' + await call.text(0) + '!';
        },
      }],
    });
  },
});
```

Um comando pode usar `$reply[$saudar[$username]]`. Valide pela config para que
o plugin seja instalado antes de compilar o comando. A CLI `functions` lista
apenas as funções internas.

## Cronometrar comandos com middleware

```ts
bot.use(async (ctx, next) => {
  const start = performance.now();
  try {
    await next();
  } finally {
    console.log(ctx.command.name, Math.round(performance.now() - start), 'ms');
  }
});
```

O trecho assume um bot existente. O middleware roda após argumentos e guards
declarativos. Chame e aguarde `next()` no máximo uma vez. O `finally` registra
o tempo mesmo se o comando falhar; os hooks do bot ainda recebem o erro.
