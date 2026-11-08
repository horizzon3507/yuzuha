# Yuzuha

Framework TypeScript para bots do [Fluxer](https://fluxer.app), com comandos
tipados em JavaScript/TypeScript e uma linguagem opcional de scripts.
Os dois modos compartilham permissões, moderação, estado e recursos.

O Yuzuha usa **Fluxer.js 3.3.0**. Você continua tendo acesso ao client original
por `bot.client`, aos exports do SDK em `yuzuha/sdk` e a todos os subpaths e
pacotes satélites por `yuzuha/sdk/*` (client, errors, message, cluster, internal,
types, rest, ws, builders, collection e util, além de voice e sharding como peers
opcionais).

[0.3.0](CHANGELOG.md) · Node **22.13+** · ESM · [MIT](LICENSE)

[Começar](#começar) · [Comandos](#escrever-comandos) · [Recursos](#recursos) · [Testes](#testar-sem-token) · [Documentação](#documentação)

## Começar

### Criar um bot

```sh
npx yuzuha@0.3.0 init ./meu-bot --ts
cd meu-bot
npm install
npm run check
npm run typecheck
npm test
cp .env.example .env
```

Preencha `FLUXER_BOT_TOKEN` no `.env` e inicie o bot:

```sh
npm run dev
```

O projeto inclui três comandos, configuração e um teste offline. Para JavaScript,
troque `--ts` por `--js` e omita `typecheck`. Acrescente `--functions` ao `init`
para incluir um comando de exemplo com scripts.

`npm run check`, `npm run typecheck` e `npm test` validam o projeto sem conectar o bot.
`npm run dev` conecta e recarrega os arquivos de comando ao editar;
`npm start` executa sem recarga automática.

### Usar em um projeto existente

```sh
npm install yuzuha@0.3.0
```

Use `"type": "module"` no `package.json`. O [guia inicial](docs/QUICKSTART.md)
mostra como configurar o bot e carregar comandos.

## Escrever comandos

Salve **uma das versões** abaixo em `commands/eco.ts` (`.js` para JavaScript).
Ambas respondem a `!eco Olá, Yuzuha!` com `Olá, Yuzuha!`.

### JavaScript / TypeScript

```ts
import { arg, defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'eco',
  description: 'Repete o texto informado.',
  args: { texto: arg.text().rest().required() },
  async run(ctx) {
    await ctx.reply(ctx.args.get('texto'));
  },
});
```

Schemas `arg.*` inferem os tipos de argumentos e flags. Você também pode declarar
subcomandos, checks e middleware. O [guia nativo](docs/NATIVE.md) cobre esses
contratos, eventos, moderação e persistência.

### Function mode (opcional)

O function mode é opcional e isolado da raiz. Comandos com `code` e eventos de
script exigem um engine explícito:

```ts
import { functions, script } from 'yuzuha/functions';

const bot = new Yuzuha({ transport, store, engine: functions() });

bot.command(script({
  name: 'eco',
  description: 'Repete o texto informado.',
  code: '$reply[$messageSlice[0]]',
}));
```

O function mode tem **336 funções** para mensagens, guards, moderação, variáveis,
JSON, arrays, loops, eventos e agendamentos.

As funções seguem as assinaturas e regras do runtime do Yuzuha. Consulte a
[linguagem](docs/functions/LANGUAGE.md), as [assinaturas das funções](docs/functions/FUNCTIONS.md)
e a [cobertura](docs/PARITY.md).

## Recursos

| Área | O que está disponível |
|---|---|
| Comandos | Prefixos, aliases, subcomandos, argumentos e flags tipadas, cooldowns e ajuda gerada dos metadados |
| Extensões | Plugins, eventos, checks, middleware e recarga atômica de comandos |
| Moderação | Ban, kick, timeout, unban e moderação de voz, com permissões, hierarquia e casos por servidor |
| Fluxer | Usuários, membros, cargos, canais, mensagens com embeds, reações, anexos, threads, convites, webhooks, expressões, gateway, instância, conta autenticada e cache |
| Collectors | `collectMessages` e `collectReactions` como streams assíncronas, com tempo, limite e cancelamento |
| Dados | Memória, JSON e SQLite; TTL, transações, limpeza e backup/restauração com simulação |
| Agendamentos | Tarefas persistentes, cron, fusos IANA, pausa/retomada, histórico e retry |
| HTTP | Texto, bytes, streaming e multipart, com limites, cancelamento e políticas por comando |
| Canvas | Cartões com texto, avatares, imagens, gradientes, badges e progresso; peer nativo opcional |
| Música | Lavalink v4 com plugin e ponte de áudio para Fluxer, recuperação, filas editáveis, loop, seek, volume e filtros |
| Desenvolvimento | CLI, autocomplete e diagnósticos no VS Code, mocks e relógio controlável para testes |

## Testar sem token

O scaffold já inclui um teste executável com `npm test`. Para testar o comando
`eco` acima, crie `test/eco.test.ts` (`.js` para JavaScript):

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestBot } from 'yuzuha/testing';
import eco from '../commands/eco.js';

test('eco responde com o texto informado', async t => {
  const fixture = createTestBot({ commands: [eco] });
  t.after(() => fixture.destroy());

  assert.equal(await fixture.send('!eco Olá, Yuzuha!'), 'success');
  assert.equal(fixture.messages.at(-1)?.payload.content, 'Olá, Yuzuha!');
});
```

`createTestBot` usa transporte e recursos simulados, com estado isolado. O relógio
controlável permite testar cooldown, TTL e tarefas sem aguardar tempo real.
Veja fixtures, stores e cenários na [documentação de testes](docs/TESTING.md).

## CLI

Execute estes comandos no diretório do seu bot:

| Comando | Uso |
|---|---|
| `npx yuzuha check` | Validar configuração e comandos sem login |
| `npx yuzuha doctor` | Diagnosticar ambiente, configuração e store |
| `npx yuzuha lint commands --json` | Analisar scripts sem importar módulos |
| `npx yuzuha functions --category moderation` | Consultar funções e assinaturas |
| `npx yuzuha functions --search mensagem` | Buscar funções por nome, alias ou descrição |
| `npx yuzuha editor` | Encontrar a extensão VS Code incluída no pacote |

`check` importa configurações e comandos JS/TS de confiança; a verificação de
tipos é feita por `npm run typecheck`. A [referência da CLI](docs/CLI.md) também cobre
catálogos de plugins, cenários offline e manutenção de dados.

## Documentação

O [índice completo](docs/README.md) reúne os guias e as referências.

| Quero… | Ler |
|---|---|
| Criar e configurar um bot | [Guia inicial](docs/QUICKSTART.md) |
| Programar em JS/TS | [Guia nativo](docs/NATIVE.md), [framework](docs/FRAMEWORK.md) e [API](docs/API.md) |
| Criar um bot de música | [Lavalink, filas e voz Fluxer](docs/MUSIC.md) |
| Medir performance | [Benchmarks e comparações com a 0.1.5](docs/BENCHMARKS.md) |
| Compor cartões e imagens | [Canvas](docs/CANVAS.md) e [transformações de imagem](docs/IMAGES.md) |
| Escrever scripts `$...` | [Linguagem](docs/functions/LANGUAGE.md) e [referência de funções](docs/functions/FUNCTIONS.md) |
| Copiar exemplos | [Receitas](docs/COOKBOOK.md) e [código de exemplo](examples) |
| Usar o editor ou diagnosticar um erro | [VS Code](docs/EDITOR.md) e [problemas comuns](docs/TROUBLESHOOTING.md) |
| Entender a cobertura | [Paridade](docs/PARITY.md) e [funções ausentes](docs/functions/FUNCTION-GAPS.md) |
| Conferir mudanças e validação | [Changelog](CHANGELOG.md), [versionamento](VERSIONING.md) e [evidências](docs/VALIDATION.md) |

## Desenvolver a biblioteca

Na cópia do repositório:

```sh
git clone https://github.com/horizzon3507/yuzuha.git
cd yuzuha
npm ci
npm run check
npm run smoke:package
```

Para experimentar os exemplos offline:

```sh
npx tsx examples/offline.ts
npx tsx examples/function-mode.ts
```

Para gerar um bot que use sua instalação local da biblioteca:

```sh
node dist/cli.js init ../meu-bot-local --ts --local
```

O `init` usa a dependência npm por padrão; `--local` aponta para a instalação
que executa a CLI. Veja [contribuição](CONTRIBUTING.md) para as regras de código
e as verificações do projeto.

Transformações opcionais de imagens e entrada de anexos por stream estão em
[IMAGES.md](docs/IMAGES.md); consultas por prefixo e cursor em
[STORAGE.md](docs/STORAGE.md), e limites das integrações em
[INTEGRATIONS.md](docs/INTEGRATIONS.md).

### Bases de bots

Sete opções: `simple`, `multifunctional`, `moderation`, `community`, `economy`,
`entertainment` e `utility`. Na cópia local compilada:

```sh
node dist/cli.js templates
node dist/cli.js init ../bot-comunidade --template community --ts --local
```

A multifuncional reúne 24 comandos raiz com embeds e subcomandos, incluindo
moderação com casos, regras, sugestões, enquetes, moedas virtuais, diversão
e notas pessoais em DM. Todas as bases aceitam JS/TS e `--functions`, com README
e testes offline próprios. Veja [BOT-BASES.md](docs/BOT-BASES.md).
