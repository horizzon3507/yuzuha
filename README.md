# Yuzuha

Framework para bots do Fluxer: a ergonomia que falta no Fluxer.js, com comandos
tipados, guards, estado, moderação, agendamentos e testes offline. Function mode
(scripts no estilo ForgeScript) é opcional. Versão **0.1.5**.

```ts
import { arg, defineCommand, Yuzuha } from 'yuzuha';

const bot = new Yuzuha({ name: 'meu-bot', prefix: '!' });

bot.command(defineCommand({
  name: 'ban',
  description: 'Bane um membro e registra um caso.',
  args: {
    membro: arg.user().required(),
    motivo: arg.text().rest(),
  },
  async run(ctx) {
    const caso = await ctx.mod.ban(ctx.args.get('membro'), {
      reason: ctx.args.get('motivo') ?? '',
    });
    await ctx.reply(`Membro banido. Caso #${caso.id}.`);
  },
}));

await bot.login();
```

Uso: `!ban @membro spam no chat`. `ctx.mod.ban` verifica permissões e hierarquia,
executa o banimento e registra o caso. O token vem de `FLUXER_BOT_TOKEN`.
`bot.client` continua sendo o client real do Fluxer.js.

## O que o Yuzuha adiciona ao Fluxer.js

- Comandos com prefixos, subcomandos, flags e argumentos tipados, cooldowns e permissões.
- Ajuda com uso, escolhas e exemplos a partir das definições dos comandos.
- Guards, middleware, plugins, eventos tipados e recarga de comandos sem reiniciar.
- Moderação compartilhada (ban, kick, timeout, unban) com casos por servidor.
- Recursos prontos: usuários, cargos, canais, mensagens, convites, webhooks,
  emojis, stickers, threads e fóruns, incluindo reações, membros de threads,
  posição de cargos/canais e categorias.
- Estado em memória, JSON ou SQLite, com transações e variáveis por escopo.
- Agendamentos persistentes com cron, fuso IANA, concorrência e retry com jitter.
- HTTP textual/binário, streaming e multipart, com limites e políticas por comando.
- `createTestBot`, relógio controlável, `MockTransport` e stores isolados para testar sem token.
- Transações entre chaves, agendamentos editáveis com pausa/retry e apelidos com autorização compartilhada.
- Limpeza de expirados, estatísticas e backup/restauração versionados com simulação.
- `doctor`, lint JSON, cenários offline, catálogos de plugins e extensão VS Code.
- SDK `@fluxerjs/core` **3.3.0** reexportado em `yuzuha/sdk`, sem esconder o original.

Não é um fork do Fluxer.js nem um wrapper de todos os métodos do SDK. O que não
estiver no framework continua acessível por `bot.client` e pelos tipos originais.

## Function mode (opcional)

Quem preferir a sintaxe curta do ForgeScript pode usar `yuzuha/functions`. O
runtime é ativado quando um comando com `code` ou um evento de script é registrado.

```ts
import { script } from 'yuzuha/functions';
import { Yuzuha } from 'yuzuha';

const bot = new Yuzuha({ prefix: '!' });

bot.command(script({
  name: 'ban',
  code: '$modBan[$mentioned[1];$messageSlice[1]]$reply[Membro banido. Caso #$caseID.]',
}));
```

Os dois modos compartilham guards, estado, moderação e recursos. São
**288 funções** com referência gerada, ou use `bot.enableFunctions()` para
pré-carregar o runtime.

`bot.scriptEvent()` registra scripts para entrada/saída de membros, edição/exclusão
de mensagens e reações. O contexto preserva os dados disponíveis do evento e exige
um canal real para enviar respostas. Veja [eventos](docs/EVENTS.md).

## Instalar pelo npm

Requer Node **22.13 ou mais recente**. O pacote é ESM; use `"type": "module"`
no `package.json` do seu projeto.

```sh
npm install yuzuha@0.1.5
```

Para gerar um bot novo:

```sh
npx yuzuha@0.1.5 init ./meu-bot --ts
cd meu-bot
npm install
npm run check
npm run typecheck
npm test
cp .env.example .env
```

`init` declara a dependência npm e gera um teste offline. O projeto pode ser
movido e compartilhado sem depender do caminho da instalação que o criou.
Para JavaScript, use `--js` e omita `typecheck`.
Para acrescentar um exemplo de script, use `--functions`.

Preencha `FLUXER_BOT_TOKEN` no `.env` e execute `npm run dev`.

## Desenvolver a biblioteca localmente

```sh
cd ~/Projects/yuzuha
npm ci
npm run build
node dist/cli.js init ~/Projects/meu-bot --ts --local
cd ~/Projects/meu-bot
npm install
npm run check
npm run typecheck
cp .env.example .env
```

O scaffold desse fluxo usa a biblioteca local. O
[guia inicial](docs/QUICKSTART.md) explica instalação e configuração.

## Experimentar sem token

```sh
npx tsx examples/offline.ts
npx tsx examples/function-mode.ts
node dist/cli.js check examples/yuzuha.config.js --json
node dist/cli.js functions --category moderation
```

Os exemplos usam `MockTransport`; nenhuma ação chega ao Fluxer. `check` importa
config e comandos JS/TS de confiança, valida os scripts e não chama `login`.
Ele não substitui o typecheck do TypeScript.

## Documentação

Comece pelo [índice da documentação](docs/README.md).

| Preciso de… | Documento |
|---|---|
| Criar meu primeiro bot JS ou TS | [Guia inicial](docs/QUICKSTART.md) |
| Programar comandos, eventos e plugins | [Guia nativo JS/TS](docs/NATIVE.md) |
| Escrever scripts `$...` | [Function mode](docs/LANGUAGE.md) e [referência](docs/FUNCTIONS.md) |
| Saber quais funções de script existem | [Lacunas auditadas](docs/FUNCTION-GAPS.md) |
| Usar comandos, contexto e extensões | [Framework](docs/FRAMEWORK.md) e [API](docs/API.md) |
| Copiar exemplos completos | [Receitas](docs/COOKBOOK.md) |
| Usar a linha de comando | [CLI](docs/CLI.md) |
| Entender módulos e dependências | [Arquitetura](docs/ARCHITECTURE.md) |
| Escolher persistência e tratar falhas | [Estado e execução](docs/STORAGE.md) |
| Diagnosticar ou testar | [Problemas comuns](docs/TROUBLESHOOTING.md) e [testes](docs/TESTING.md) |
| Usar autocomplete e diagnóstico offline | [Editor e doctor](docs/EDITOR.md) |
| Medir dispatch, runtime e memória | [Benchmarks](docs/BENCHMARKS.md) |
| Ver evidência local | [Validação](docs/VALIDATION.md) |

As mudanças estão no [changelog](CHANGELOG.md); a política de versões está em
[VERSIONING.md](VERSIONING.md). Leia [CONTRIBUTING.md](CONTRIBUTING.md) para contribuir.
