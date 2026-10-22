# Primeiro bot em JavaScript ou TypeScript

## Requisitos e instalação pelo npm

Use Node >=22.13 e npm. O pacote é ESM; o projeto consumidor deve usar
`"type": "module"` no `package.json`. O scaffold já prepara isso.

Em um projeto ESM existente, execute `npm install yuzuha@0.1.4`. Para gerar um
bot em uma pasta nova:

```sh
npx yuzuha@0.1.4 init ./meu-bot --ts
cd meu-bot
npm install yuzuha@0.1.4
npm run check
npm run typecheck
```

O `init` usa uma referência `file:` à instalação que o executou. O `npm install`
acima a substitui pela versão no registro, evitando depender de um caminho do
cache do npx ou da máquina que gerou o bot. Use `--js` para JavaScript e omita
`typecheck`. `--functions` inclui um comando de exemplo de function mode.

## Usar uma cópia local da biblioteca

Compile a biblioteca e gere um diretório novo:

```sh
cd ~/Projects/yuzuha
npm ci
npm run build
node dist/cli.js init ~/Projects/meu-bot --ts
cd ~/Projects/meu-bot
npm install
npm run check
npm run typecheck
```

Troque `--ts` por `--js` para JavaScript. O modo TS é o padrão.
Em JS, não há script `typecheck` no scaffold. Acrescente `--functions` se quiser
também um exemplo de function mode.

A instalação gerada usa `file:` apontando para a cópia local do Yuzuha.
Ela depende desse caminho existir. Para adicionar a um projeto ESM já existente,
compile o Yuzuha e execute `npm install /caminho/absoluto/yuzuha` no consumidor.

## Estrutura gerada

```text
meu-bot/
  commands/
    ping.ts
    ban.ts
    hello.ts
  yuzuha.config.ts
  package.json
  tsconfig.json
  .env.example
  .gitignore
  README.md
```

Com `--functions`, `commands/eco.ts` também é criado. Em JavaScript, config e
comandos terminam em `.js` e não há `tsconfig.json`.
O nome do diretório define o nome do bot e seu diretório de dados por padrão.

## Configurar

```ts
import { defineConfig } from 'yuzuha';

export default defineConfig({
  name: 'meu-bot',
  prefix: '!',
  commands: './commands',
});
```

`commands` é relativo à pasta da config. O código funciona em `.js` e `.ts`.
Você pode usar um array de prefixos, como `['!', '?']`, ou uma função assíncrona
que escolhe prefixos para cada mensagem.

## Comando nativo JS/TS

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

Uso: `!somar 10 20`. Os argumentos são convertidos antes de `run`.
Schemas inferem os tipos dos argumentos. Veja moderação, persistência e eventos
no [guia nativo JS/TS](NATIVE.md).

O arquivo deve exportar um comando default ou um array de comandos. Pastas são
percorridas recursivamente; arquivos ocultos, `node_modules` e `.d.ts` são ignorados.

## Function mode opcional

Se quiser a sintaxe curta, importe `script` de `yuzuha/functions`:

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
Para pré-carregar, chame `bot.enableFunctions()`. Um comando aceita exatamente um
entre `code` e `run`. A sintaxe está em [Function mode](LANGUAGE.md).

## Validar sem conectar

```sh
npm run check
npm run typecheck
```

Execute o segundo comando apenas no scaffold TS. `check` valida nomes, aliases,
guardas declarativos e scripts; não se conecta nem carrega `.env` automaticamente.
Config e comandos são importados e executam seu código de inicialização.
Um `setup` que faz rede continua fazendo rede por conta própria.

Para testar respostas sem token, siga [Testes](TESTING.md).

## Conectar

```sh
cp .env.example .env
```

Preencha `FLUXER_BOT_TOKEN` no `.env` e execute `npm run dev`.

`run` e `dev` leem o `.env` junto da config; variáveis já definidas no processo
têm prioridade. O token não é salvo no store. `npm start` inicia sem watcher.

O modo `dev` recarrega arquivos de comandos. Se uma nova versão for inválida,
mantém os comandos anteriores. Comandos registrados por `setup` são preservados.
Mudanças na config, plugins e dependências importadas podem exigir reinício;
o watcher não recarrega todo o grafo de módulos.

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

Nesse modo, você gerencia ambiente e encerramento. `bot.login()` lê
`FLUXER_BOT_TOKEN` do processo; ele não lê `.env` sozinho. Se fornecer um store,
feche-o depois de `destroy`. Veja [API](API.md) e [persistência](STORAGE.md).
