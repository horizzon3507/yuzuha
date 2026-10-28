# Guia inicial: primeiro bot em JavaScript ou TypeScript

Gere um projeto, defina um comando, valide-o sem conectar e execute o bot no
Fluxer. O pacote é ESM e exige `"type": "module"` no `package.json` do projeto
consumidor. O scaffold já configura essa opção.

## Instalar e gerar o projeto

Use Node >=22.13 e npm. Em um projeto ESM existente, instale a versão desta
documentação:

```sh
npm install yuzuha@0.1.8
```

Para gerar um bot em uma pasta nova, execute:

```sh
npx yuzuha@0.1.8 init ./meu-bot --ts
cd meu-bot
npm install
npm run check
npm run typecheck
npm test
```

O `init` declara a versão npm da Yuzuha, para que o projeto possa ser
compartilhado e instalado em outra máquina. Use `--js` para JavaScript e omita
`npm run typecheck`, pois o scaffold JS não inclui esse script. A opção
`--functions` acrescenta um comando de exemplo de function mode.

## Usar uma cópia local da biblioteca

Compile a biblioteca e gere um diretório novo:

```sh
cd ~/Projects/yuzuha
npm ci
npm run build
node dist/cli.js init ~/Projects/meu-bot --ts --local
cd ~/Projects/meu-bot
npm install
npm run check
npm run typecheck
```

O modo TS é o padrão. As opções `--js` e `--functions` também valem para o
scaffold local. Em JavaScript, config e comandos usam `.js`, e não há script
`typecheck`.

A instalação gerada usa `file:` apontando para a cópia local da Yuzuha e depende
desse caminho continuar existindo. Para adicionar a biblioteca a um projeto ESM
já existente, compile a Yuzuha e execute
`npm install /caminho/absoluto/yuzuha` no consumidor.

## Escolher uma base

Na árvore local compilada, liste as bases e escolha com `--template`:

```sh
node dist/cli.js templates
node dist/cli.js init ../bot-comunidade --template community --ts --local
node dist/cli.js init ../bot-multifuncional --template multifunctional --js --local
```

São sete bases: simple, multifunctional, moderation, community, economy,
entertainment e utility. Todas incluem testes offline e aceitam `--functions`.
A multifuncional reúne 24 comandos raiz e subcomandos. Veja exemplos, limites,
embeds e permissões em [BOT-BASES.md](BOT-BASES.md).
Sem `--template`, a estrutura original abaixo continua igual.

## Conhecer a estrutura gerada

```text
meu-bot/
  commands/
    ping.ts
    ban.ts
    hello.ts
  test/
    hello.test.ts
  yuzuha.config.ts
  package.json
  tsconfig.json
  .env.example
  .gitignore
  README.md
```

Com `--functions`, o scaffold também cria `commands/eco.ts`. Em JavaScript, a
configuração e os comandos terminam em `.js`, e `tsconfig.json` não é criado.
O nome do diretório define o nome do bot e seu diretório de dados por padrão.

## Configurar o bot

```ts
import { defineConfig } from 'yuzuha';

export default defineConfig({
  name: 'meu-bot',
  prefix: '!',
  commands: './commands',
});
```

O caminho `commands` é relativo à pasta da configuração. O mesmo código funciona
em `.js` e `.ts`. Você pode usar um array de prefixos, como `['!', '?']`, ou uma
função assíncrona que escolhe prefixos para cada mensagem.

## Criar um comando nativo JS/TS

Crie `commands/somar.ts` ou `commands/somar.js`:

```ts
import { arg, defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'somar',
  description: 'Soma dois números.',
  args: {
    a: arg.number().required(),
    b: arg.number().required(),
  },
  async run(ctx) {
    const a = ctx.args.get('a');
    const b = ctx.args.get('b');
    await ctx.reply(String(a + b));
  },
});
```

Use `!somar 10 20`. Os argumentos são convertidos antes de `run`, e os schemas
inferem os tipos recebidos pelo handler.

Cada arquivo deve exportar um comando default ou um array de comandos. O
carregador percorre as pastas recursivamente e ignora arquivos ocultos,
`node_modules` e declarações `.d.ts`.

Para criar um comando com argumento opcional e testar suas duas respostas, siga
o [tutorial do comando `!hello`](tutorials/FIRST-COMMAND.md). O
[guia nativo JS/TS](NATIVE.md) cobre argumentos, moderação, persistência e
eventos.

## Adicionar function mode opcional

Para usar a sintaxe curta, importe `script` de `yuzuha/functions`:

```ts
import { script } from 'yuzuha/functions';

export default script({
  name: 'oi',
  aliases: ['ola'],
  description: 'Responde com uma saudação.',
  code: '$reply[Olá, $username!]',
});
```

O runtime de funções é ativado automaticamente no primeiro comando com `code`.
Para pré-carregá-lo, chame `bot.enableFunctions()`. Um comando executável aceita
exatamente um entre `code` e `run`. Grupos também podem declarar somente
`subcommands`.

Consulte a [sintaxe do function mode](LANGUAGE.md), o
[tutorial do primeiro script](tutorials/FUNCTION-MODE.md) e os
[grupos e subcomandos nativos](NATIVE.md).

## Validar sem conectar

```sh
npm run check
npm run typecheck
```

Execute `npm run typecheck` apenas no scaffold TS. O `check` valida nomes,
aliases, guards declarativos e scripts sem se conectar e sem carregar `.env`
automaticamente. A configuração e os comandos são importados, portanto seu
código de inicialização é executado. Um `setup` que faz rede continua fazendo
rede por conta própria.

Para testar respostas sem token, use o
[tutorial de testes com fixtures offline](tutorials/TESTING.md).

## Conectar ao Fluxer

Copie o arquivo de ambiente:

```sh
cp .env.example .env
```

Preencha `FLUXER_BOT_TOKEN` no `.env` e execute `npm run dev`.

`run` e `dev` leem o `.env` junto da configuração. Variáveis já definidas no
processo têm prioridade, e o token não é salvo no store. `npm start` inicia o
bot sem watcher.

O modo `dev` recarrega arquivos de comandos. Se uma nova versão for inválida,
os comandos anteriores permanecem ativos. Comandos registrados por `setup`
também são preservados. Mudanças na configuração, nos plugins e nas
dependências importadas podem exigir reinício, pois o watcher não recarrega
todo o grafo de módulos.

## Usar a biblioteca diretamente

```js
import { defineCommand, Yuzuha } from 'yuzuha';

const bot = new Yuzuha({ name: 'meu-bot', prefix: '!' });
bot.command(defineCommand({
  name: 'ping',
  async run(ctx) { await ctx.reply('Pong!'); },
}));

process.once('SIGINT', () => { void bot.destroy(); });
process.once('SIGTERM', () => { void bot.destroy(); });

await bot.login();
```

Nesse modo, você gerencia o ambiente e o encerramento. `bot.login()` lê
`FLUXER_BOT_TOKEN` do processo e não lê `.env` sozinho. Se fornecer um store,
feche-o depois de `destroy`. Consulte a [referência da API](API.md) e o
[guia de persistência e propriedade dos stores](STORAGE.md).
