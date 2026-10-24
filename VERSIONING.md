# Versionamento

O Yuzuha aplica o formato Hory ao histórico e usa **SemVer simples** no pacote.
A versão desta atualização é **0.1.7**.

## Pacote e histórico

| Lugar | Formato nesta versão |
|---|---|
| `package.json` e entrada raiz de `package-lock.json` | `0.1.7` |
| Pacote npm e saída de `yuzuha --version` | `0.1.7` |
| Título do changelog | `## v0.1.7 · 23/10/2026` |
| Eventual tag Git | `v0.1.7` |

O SDK e a CLI pertencem ao mesmo pacote. Para bibliotecas, a convenção Hory mantém
SemVer sem `m`, sem seções por superfície e sem sufixos de canal.

As datas dos títulos usam `DD/MM/YYYY`. Cada entrada começa com uma frase sobre
o resultado da versão, menciona o produto, a data e a tag, e lista mudanças
de uso ou manutenção. O histórico preserva as datas e os fatos anteriores.

## Compatibilidade

A série `0.x` ainda evolui. Mesmo assim, correções patch preservam os imports
públicos e os comandos documentados; mudanças incompatíveis recebem uma nota
explícita no changelog.

Mudanças incompatíveis planejadas devem entrar numa versão minor enquanto
estivermos em `0.x`. Ao chegar a `1.0.0`, mudanças incompatíveis exigem major;
novas funcionalidades compatíveis, minor; correções compatíveis, patch.

Os exports públicos são `yuzuha`, `yuzuha/functions`, `yuzuha/sdk`,
`yuzuha/testing`, `yuzuha/tooling`, `yuzuha/music` e `yuzuha/images`. A organização interna de `src/` não cria estabilidade de deep
imports. Schema persistido,
gramática e funções documentadas também fazem parte da compatibilidade.

A versão do SDK é fixada separadamente. Atualizá-la exige revisar
[PARITY.md](docs/PARITY.md), o adaptador e o teste de consumidor. A versão do bot
gerado por `init` pertence ao consumidor e não precisa acompanhar a biblioteca.

## Preparar uma atualização

### Migrar para 0.1.7

A distribuição 0.1.7 inclui o conteúdo preparado na 0.1.6 e acrescenta
`yuzuha functions --search <termo>`. A busca combina com os filtros e formatos
existentes sem alterar imports anteriores, schema 2 ou SDK 3.3.0.
A linguagem recebe 18 funções, chegando a 306. `GuildInfo.features` e
`UsersResources.leaveGuild` são opcionais para preservar recursos customizados;
os novos auxiliares do contexto recusam recursos ausentes explicitamente.
O port `Store.queryVariables` também é opcional; memória/JSON mantêm fallback
por snapshot. SQLite cria um índice derivado automaticamente na primeira consulta,
sem alterar schema 2. Prioridade padrão é zero e capacidade compartilhada só é
ativada com `globalConcurrency`. `yuzuha/images` requer instalar Sharp; o restante
da biblioteca continua independente dele. Não há mudanças obrigatórias nos bots
existentes.
As instruções da 0.1.6 abaixo continuam aplicáveis ao atualizar da 0.1.5.

### Migrar para 0.1.6

Imports, schema 2, SDK 3.3.0 e 288 funções permanecem disponíveis. Os serviços do
contexto e seus mapas são inicializados sob demanda; as referências devolvidas
continuam estáveis por contexto. Mensagens ignoradas não criam uma execução.
O sinal de cancelamento pode ser compartilhado entre comandos do mesmo bot;
não dependa de sua identidade para correlacionar execuções: use `executionID`.

`Store.readVariable` é opcional e deve retornar uma cópia isolada, respeitar a
ordenação das transações e avaliar o callback de relógio `now` dentro da leitura,
após aguardar operações anteriores. `undefined` indica
ausente/expirado; `null` continua sendo um valor JSON válido. Não há migração de
disco. SQLite conserva validação do estado completo antes de cada commit.

`yuzuha/music` é um import adicional. Configure `music`/`voice` explicitamente;
o bot encerra os serviços fornecidos e o chamador fecha os nodes Lavalink.
`@fluxerjs/voice` é um peer opcional carregado em `join`. Para áudio Lavalink no
Fluxer, configure `FluxerLavalinkBridge` e instale o plugin `yuzuha-audio` fornecido
pelo Yuzuha no servidor; veja [MUSIC.md](docs/MUSIC.md).
Não há wrappers de música no function mode nesta versão.

Benchmarks agora exigem a versão exata do Node e o mesmo modo de GC, suíte e
carga. Relatórios de outro runtime devem ser executados novamente antes de comparar.

### Migrar para 0.1.5

Imports, argumentos posicionais e comandos existentes continuam disponíveis.
Flags são interpretadas somente em comandos que as declaram. Grupos de
subcomandos não declaram argumentos ou flags próprios; a folha define sua entrada.
Permissões, checks, middleware e demais restrições dos grupos continuam valendo
nos filhos. Veja o contrato em [NATIVE.md](docs/NATIVE.md).

O scaffold agora declara a versão npm do Yuzuha. Para desenvolver contra a
instalação que executa a CLI, use `init --local`. Projetos já gerados conservam
suas dependências; a atualização não reescreve projetos consumidores.
O schema de persistência permanece em 2 e o SDK em 3.3.0.

### Migrar para 0.1.4

O schema persistido continua em 2. Cron, timezone, missedRun e retryJitter são
campos opcionais das tarefas; stores próprios devem preservá-los. Backup usa um
envelope separado `yuzuha-state` versão 1, validado antes de qualquer gravação.
`StateMaintenance.restore` exige política `replace` ou `merge` e simula por
padrão; passe `dryRun: false` ou `data restore --apply` para confirmar a alteração.
Pare e drene o scheduler antes de backup/restore de tarefas em execução.

Implementações próprias de `Resources` precisam acrescentar `messages.preload`,
`expressions.createEmojisBulk` e `webhooks.fetch`, além de `RoleInfo.managed`.
`transport.member(guildID, userID, channelID)` precisa resolver permissões locais
em qualquer canal do servidor, inclusive categorias. O adaptador do SDK 3.3.0
usa `false` quando o campo `managed` não está disponível no SDK; essa limitação
não permite afirmar proteção completa de cargos gerenciados remotamente.

Mutações de cargos/canais e operações de webhooks pelo contexto agora exigem as
permissões do autor e do bot, com hierarquia e escopo aplicáveis. Comandos que antes
usavam apenas a autoridade do bot podem receber `GuardError`. Use `ctx.resources`
para a autorização compartilhada. `bot.resources` e `bot.client` permanecem APIs
de código nativo confiável com a autoridade do bot.

`ScriptEventDefinition` é separado de comandos. Em eventos, `ctx.event` contém
os dados disponíveis; eventos parciais ou de exclusão não oferecem uma mensagem
para reply. Defina um canal de saída quando necessário e um `actorID` explícito
somente quando o código confiável precisar escolher outro autor. Não há promoção
automática para a identidade do bot. Veja [EVENTS.md](docs/EVENTS.md).

Políticas `command.http` só restringem a política global; configurações inválidas
são recusadas no registro. O timeout do streaming permanece ativo até o corpo
terminar ou ser cancelado. Código nativo deve consumir ou cancelar o corpo de
`stream`. Consulte [HTTP.md](docs/HTTP.md), [SCHEDULER.md](docs/SCHEDULER.md) e
[CLI.md](docs/CLI.md) para limites e formatos novos.

### Migrar para 0.1.3

Schema 2 anterior continua legível. Os campos opcionais `variableExpirations` e
`scheduleHistory` guardam TTL e histórico; não remova esses campos ao escrever um
store próprio. `set` sem TTL mantém o comportamento persistente; `update` preserva
o prazo de valores vivos. `userFor` é explícito e exige contexto de servidor.

Implementações próprias de `Resources` precisam acrescentar `users.profile`,
`users.guildCounts`, `users.channelCounts`, `threads.active` e `threads.archived`.
Collectors aceitam `AbortSignal` opcional; o transporte passa a receber as ações
`move`, `mute` e `deafen`, as opções de voz no sexto argumento de `moderate` e
um canal opcional em `member` para verificar permissões efetivas. Adapte esses
contratos antes de habilitar os novos comandos. `mockResources` continua
permitindo mocks parciais. Os ports brutos mantêm a autoridade do bot; prefira
`ctx.mod` para autorização do autor e casos.

`destroy` agora cancela HTTP/collectors do contexto e aguarda também o scheduler.
Callbacks próprios do scheduler recebem `signal` como segundo argumento;
callbacks antigos que ignoram esse argumento continuam válidos. Use `stop()`
seguido de `await drain()` ao gerenciar uma instância fora do bot. Cancelamento
é cooperativo e não desfaz efeitos já confirmados.

O histórico retém 1000 execuções por padrão. Reexecução manual usa o ID da
execução com falha, cria uma tarefa nova e recusa guards/efeitos de moderação.
Os catálogos do editor são JSON declarativo configurado em
`yuzuha.functionCatalogs`; não são imports de plugins. Veja
[STORAGE.md](docs/STORAGE.md), [NATIVE.md](docs/NATIVE.md) e
[EDITOR.md](docs/EDITOR.md).

### Migrar para 0.1.2

Os imports existentes e o schema 2 continuam válidos. Implementações próprias
de `Resources` precisam fornecer os novos métodos das áreas de mensagens,
usuários, threads, convites e expressões. Mocks podem usar implementações parciais
com `mockResources`. A extensão tem a mesma versão numérica da biblioteca e
continua sendo uma ferramenta incluída, sem criar uma superfície Hory separada.

Operações de agendamento em script agora respeitam autor e servidor; um ID de
outro escopo retorna `false`. Tarefas em execução recusam edição/pausa/retomada.
Falhas de comandos passam a receber retry conforme a política; guards e
moderação já aplicada são terminais. Revise comandos agendados com efeitos
externos para idempotência. Veja [NATIVE.md](docs/NATIVE.md) e
[EDITOR.md](docs/EDITOR.md).

### Procedimento

1. Atualize `package.json` e regenere `package-lock.json` para a mesma versão.
2. Acrescente a entrada no [CHANGELOG.md](CHANGELOG.md), com data real e mudanças verificáveis.
3. Atualize migração, cobertura e documentação quando o contrato mudar.
4. Rode `npm run check` e `npm run smoke:package` e registre a evidência.
5. Inspecione `npm pack --dry-run` para conferir a distribuição.

A CLI lê a versão do manifest; não mantenha um número paralelo no código.
`npm run check:docs` verifica links locais e a correspondência entre manifest,
lockfile e título do changelog.

Atualizar estes arquivos prepara a versão local. Publicação npm, criação de tag
e release remota são operações separadas e exigem instrução explícita.
