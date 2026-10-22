# Testes e validação

O núcleo é testado sem token usando o mesmo caminho de dispatch, runtime e
moderação da execução normal. O transporte simula respostas da API; os stores
usam memória ou diretórios temporários.

## Verificações do repositório

```sh
npm ci
npm run check
npm run smoke:package
```

| Comando | O que verifica |
|---|---|
| `npm run typecheck` | TypeScript estrito, incluindo exemplos |
| `npm run check:architecture` | Dependências entre camadas locais |
| `npm test` | Comportamento de domínio, runtime, bot, CLI, adaptador e stores |
| `npm run build` | Saída ESM, declarações e source maps; limpa `dist` antes |
| `npm run docs:generate` | Regera a referência a partir dos metadados internos |
| `npm run check:docs` | Links Markdown locais e versão manifest/lock/changelog |
| `npm run check:editor` | Tipos da extensão contra a API do VS Code, após build |
| `npm run check` | Executa as verificações acima e detecta referência gerada desatualizada |
| `npm run smoke:package` | Empacota, instala e testa consumidores isolados JS/TS |

`smoke:package` precisa do registry npm para instalar dependências dos consumidores.
Cria fixtures temporários e os remove ao concluir. Ele verifica imports públicos,
paridade dos exports do SDK, CLI, scaffolds e comandos sem login. Também exercita
redução de arrays, usuários de reações e HTTP binário a partir do tarball instalado.
Também valida `yuzuha/tooling`, TTL, transações declarativas e entre escopos,
histórico/reexecução, pausa/retomada, `doctor`, catálogo do editor e os tipos
novos de moderação, threads e perfis em um consumidor TS isolado.

Na 0.1.4, o consumidor também cobre eventos em scripts, cron, streaming/multipart,
manutenção de estado, novos tipos públicos e comandos de lint/catálogos/cenários.
Os cenários JSON da CLI executam comandos de script sobre `MockTransport` e
`MemoryStore`, com HTTP e scheduler desabilitados:

```sh
yuzuha lint commands --json
yuzuha test scenarios.json --json
```

O formato versionado e as expectativas estão em [CLI.md](CLI.md). Para plugins,
exporte o catálogo com uma config confiável indicada explicitamente; depois,
lint e editor usam somente o JSON declarativo.

`npm run bench` mede dispatch/runtime, memória e concorrência separadamente dos
testes de aceitação; veja [BENCHMARKS.md](BENCHMARKS.md). A extensão pode ser
empacotada localmente com `npm run package:editor`; veja [EDITOR.md](EDITOR.md).

A verificação de links confere arquivos locais; não valida páginas externas nem
o significado do conteúdo. A verificação de arquitetura não substitui teste
de comportamento.

## Primeiro teste de comando

Salve em `test/ping.test.js` no seu bot:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { defineCommand, MemoryStore, Yuzuha } from 'yuzuha';
import { MockTransport, mockMessage } from 'yuzuha/testing';

test('ping responde sem conectar', async () => {
  const transport = new MockTransport();
  const bot = new Yuzuha({ transport, store: new MemoryStore() });
  bot.command(defineCommand({
    name: 'ping',
    async run(ctx) { await ctx.reply('Pong!'); },
  }));

  try {
    const outcome = await bot.handle(mockMessage('!ping'));
    assert.equal(outcome, 'success');
    assert.equal(transport.messages[0]?.payload.content, 'Pong!');
  } finally {
    await bot.destroy();
  }
});
```

Para function mode, registre comandos com `script()` de `yuzuha/functions`.
Execute `node --test test/*.test.js`. Para testes TS, instale `tsx` no consumidor
e execute `npx tsx --test test/*.test.ts`.

## Testar moderação e registro

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { arg, defineCommand, MemoryStore, Yuzuha } from 'yuzuha';
import { MockTransport, mockMessage } from 'yuzuha/testing';

test('ban cria uma ação e um caso', async () => {
  const store = new MemoryStore();
  const transport = new MockTransport();
  const bot = new Yuzuha({ store, transport });
  bot.command(defineCommand({
    name: 'ban',
    args: { membro: arg.user().required(), motivo: arg.text().rest() },
    async run(ctx) {
      await ctx.mod.ban(ctx.args.get('membro'), { reason: ctx.args.get('motivo') ?? '' });
    },
  }));

  try {
    assert.equal(await bot.handle(mockMessage('!ban <@2> spam')), 'success');
    assert.equal(transport.actions.length, 1);
    assert.equal(transport.actions[0]?.targetID, '2');

    const cases = await store.read(state => state.cases['100']);
    assert.equal(cases?.length, 1);
    assert.equal(cases?.[0]?.reason, 'spam');
  } finally {
    await bot.destroy();
  }
});
```

Fixtures padrão: autor/dono `1`, alvo `2`, bot `999`, servidor `100`, canal `200`.
`mockMessage` gera IDs diferentes por chamada. Para testar deduplicação, reutilize
o mesmo objeto ou sobrescreva `id` explicitamente.

`transport.setMember(guildID, member)` altera permissões/hierarquia dos fixtures.
`transport.failAction = true` simula falha da API. `messages`, `actions` e
`reactions` registram os efeitos observados. Para simular falha de gravação após
a ação, forneça um store de teste que aceite `read` e rejeite `update`.

## Casos que merecem testes

- Guards impedem efeitos antes da ação.
- Ramos descartados de `$if` e funções lazy não chamam API.
- Texto de usuário com `$...` continua sendo dado.
- Erro de API não cria caso.
- Ação confirmada com falha do store informa resultado parcial e não repete.
- Recarga inválida preserva o conjunto anterior.
- Transação inválida não altera estado.
- Encerramento aguarda comandos ativos e não fecha store injetado.

Adicione testes quando houver regra, efeito, concorrência ou regressão real.
Evite testes que apenas repetem uma declaração ou a estrutura da implementação.

## Validação ao vivo e limites

Os testes locais não comprovam autenticação, autorização remota, reconexão ou
diferenças entre instâncias Fluxer. Para isso, use um bot e servidor de teste
autorizados, com alvos de teste e um store separado.

A matriz de CI está configurada para Node 22, 24 e 26. Execução configurada
não equivale a execução remota concluída. Resultados efetivamente observados
estão em [VALIDATION.md](VALIDATION.md).
