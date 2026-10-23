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

Na 0.1.6, o tarball também verifica `yuzuha/music`, filas e controles com
`MockMusicBackend`, paginação, recuperação de sessão, tipos de música e construção de `FluxerVoice` sem carregar
a dependência de áudio opcional. Testes Lavalink injetam fetch e socket;
nenhum node real, bot logado ou codec é iniciado. `mockTrack` cria faixas
determinísticas, `MockMusicBackend.emit` entrega eventos do protocolo e
`emitLifecycle` simula retomada/perda da sessão. A suíte cobre estado REST inválido,
respostas atrasadas, concorrência de recuperação e saturação de controles sem
perder eventos de fim.

`npm run music:integration` é uma verificação adicional, com JDK 17+ e
`@fluxerjs/voice` 3.1.0 instalados. Compila o plugin, sobe um Lavalink 4.2.2
temporário e reproduz um WAV sintético pelo decoder real do SDK. Verifica áudio,
pausa/volume zero, seek/filtros, avanço da fila, reinício do servidor, headers,
limites e encerramento. Apenas a publicação no LiveKit é simulada; não há bot
logado. `YUZUHA_LAVALINK_JAR` permite usar o JAR oficial já baixado, sempre com
SHA-256 verificado. O comando não faz parte de `npm run check`, que continua
sem servidor ou codecs nativos.

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

`npm run bench` e `npm run bench:performance` medem dispatch/runtime, memória e concorrência separadamente dos
testes de aceitação; veja [BENCHMARKS.md](BENCHMARKS.md). A extensão pode ser
empacotada localmente com `npm run package:editor`; veja [EDITOR.md](EDITOR.md).

A verificação de links confere arquivos locais; não valida páginas externas nem
o significado do conteúdo. A verificação de arquitetura não substitui teste
de comportamento.

## Fixture para comandos nativos

`createTestBot`, em `yuzuha/testing`, cria um bot sem login, com `MockTransport`,
`MemoryStore` isolado, recursos simulados e HTTP desabilitado por padrão.
O scheduler executa apenas quando solicitado, sem iniciar polling.

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineCommand } from 'yuzuha';
import { createTestBot } from 'yuzuha/testing';

test('cooldown e expiração usam tempo controlado', async t => {
  const fixture = createTestBot({
    now: 1000,
    commands: [defineCommand({
      name: 'token',
      cooldown: '1s',
      async run(ctx) {
        await ctx.data.user.set('token', 'temporário', { ttlMs: 1000 });
        await ctx.reply('Criado.');
      },
    })],
  });
  t.after(() => fixture.destroy());

  assert.equal(await fixture.send('!token'), 'success');
  assert.equal(await fixture.send('!token'), 'guarded');
  fixture.clock.advance(1000);
  assert.equal(await fixture.send('!token'), 'success');
  assert.equal(fixture.messages.at(-1)?.payload.content, 'Criado.');
  assert.deepEqual(fixture.errors, []);
});
```

`send(content, overrides?)` retorna `DispatchResult`; os overrides escolhem autor,
servidor, canal ou ID da mensagem. `message` nas opções define defaults da fixture.
`messages`, `transport.actions`, `errors` e `results` permitem inspecionar os
efeitos. Erros capturados são os enviados a `onError`; recusas normais de guards
aparecem no resultado e nas respostas, sem virar erros internos.

`clock.now()` retorna epoch em ms. `clock.advance(ms)` apenas avança o relógio;
`await fixture.tick(ms)` também aguarda uma passagem do scheduler e seus handlers.
Cooldown, TTL e o scheduler padrão usam esse relógio. Use `ctx.now()` em cálculos
de prazo próprios; o relógio não altera `Date.now` global, timers de terceiros
ou timeouts de HTTP. Um scheduler fornecido pelo chamador controla seu próprio
relógio.

`resources` aceita overrides parciais como `mockResources`; métodos ausentes
falham explicitamente. `transport` aceita um `MockTransport` próprio. Stores
fornecidos continuam sendo responsabilidade do chamador.
`destroy()`, `close()` e `Symbol.asyncDispose` solicitam o encerramento e drenam
o trabalho conforme o contrato do bot. Use `t.after` ou `await using` para
garantir o descarte, inclusive quando uma asserção falhar.

Os scaffolds JS/TS já incluem `test/hello.test.js` ou `.ts` com essa fixture.
Execute `npm test` no projeto gerado. Os cenários JSON da CLI continuam
declarativos e atendem comandos de script; o helper permite testar handlers
JS/TS e scripts pelo mesmo caminho de dispatch.

## Primeiro teste de comando com os ports

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
