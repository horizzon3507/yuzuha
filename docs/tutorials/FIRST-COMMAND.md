# Primeiro comando: crie e teste `!hello`

Crie um comando em TypeScript, valide sua entrada e teste a resposta sem
conectar ao Fluxer. O mesmo handler funciona em JavaScript ESM: use arquivos
`.js` e omita o typecheck do projeto consumidor.

## Preparar o projeto

Quando a versão desejada estiver disponível no npm, gere um projeto em uma
pasta nova:

```sh
npx yuzuha init meu-bot --ts
cd meu-bot
npm install
```

O scaffold inclui `yuzuha.config.ts`, `.env.example`, comandos e um teste
offline. Para testar uma cópia local da biblioteca, compile a biblioteca e execute
na raiz dela:

```sh
node dist/cli.js init ../meu-bot --ts --local
```

A opção `--local` vincula o caminho local; o scaffold padrão usa uma versão npm.
O [guia de instalação](../QUICKSTART.md) detalha as duas opções.

## Declarar o comando

Salve como `commands/hello.ts`:

```ts
import { arg, defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'hello',
  description: 'Cumprimenta a pessoa informada.',
  args: { nome: arg.text().default('mundo') },
  async run(ctx) {
    const nome = ctx.args.get('nome');
    await ctx.reply(`Olá, ${nome}!`);
  },
});
```

O `defineCommand` preserva a inferência do schema, portanto `nome` é uma string
no handler. O campo `name`, e não o nome do arquivo, define o nome do comando.

Confira as duas respostas:

| Entrada | Resposta |
|---|---|
| `!hello Ana` | `Olá, Ana!` |
| `!hello` | `Olá, mundo!` |

`arg.text()` lê um argumento. Para receber uma frase sem exigir aspas, use
`arg.text().rest()`. Para recusar uma entrada ausente, use `.required()` em vez
de `.default(...)`. Flags e argumentos posicionais têm schemas separados.

## Carregar o comando pela configuração

O scaffold já configura o diretório de comandos. A forma mínima é:

```ts
import { defineConfig } from 'yuzuha';

export default defineConfig({
  name: 'meu-bot',
  prefix: '!',
  commands: './commands',
});
```

O caminho `commands` é relativo ao arquivo de configuração, não ao shell. Cada
arquivo exporta um comando default ou um array de comandos. Arquivos de
declaração `.d.ts`, diretórios ocultos e links simbólicos não são percorridos.
Colisões de nomes ou aliases recusam a carga completa antes de trocar o
catálogo.

## Escrever o teste offline

Crie `test/hello.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestBot } from 'yuzuha/testing';
import hello from '../commands/hello.js';

test('hello usa o nome ou o padrão', async t => {
  const fixture = createTestBot({ commands: [hello] });
  t.after(() => fixture.destroy());

  assert.equal(await fixture.send('!hello Ana'), 'success');
  assert.equal(fixture.messages.at(-1)?.payload.content, 'Olá, Ana!');
  assert.equal(await fixture.send('!hello'), 'success');
  assert.equal(fixture.messages.at(-1)?.payload.content, 'Olá, mundo!');
  assert.deepEqual(fixture.errors, []);
});
```

O teste envia mensagens pelo mesmo dispatch do bot, com transporte simulado e
store em memória. Assim, parsing, valor padrão e resposta são exercitados sem
login. O import termina em `.js` para conservar o contrato ESM do projeto
TypeScript. Sempre destrua a fixture para drenar recursos e tarefas pendentes.

## Validar antes de conectar

Execute as verificações do projeto:

```sh
npm run check
npm run typecheck
npm test
```

Cada comando tem uma função: `check` importa e valida os comandos sem login,
`typecheck` confere os tipos e `test` executa o teste offline. Um import pode
executar código de inicialização próprio, por isso configurações e plugins são
código de confiança. Essas verificações não comprovam o token nem as permissões
remotas.

## Executar no Fluxer

Copie `.env.example` para `.env`, preencha `FLUXER_BOT_TOKEN` localmente e rode
`npm run dev`. O processo carrega o ambiente ao lado da configuração e conecta.

Ao editar arquivos de comando, uma recarga inválida mantém a versão anterior.
Mudanças na configuração ou nas dependências importadas podem exigir reinício.

Continue com os guias de [argumentos, flags e subcomandos](../NATIVE.md),
[testes de comandos com fixtures](TESTING.md) e
[diagnóstico pela CLI](../CLI.md).
