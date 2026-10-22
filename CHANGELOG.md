# Changelog

O Yuzuha segue [Semantic Versioning](https://semver.org/) e
[Keep a Changelog](https://keepachangelog.com/). Biblioteca, SDK reexportado e CLI
são entregues no mesmo pacote npm.

<details>
<summary>Para saber mais sobre o versionamento, expanda aqui.</summary>

As versões do pacote usam SemVer simples, como `0.1.0`. Os títulos do histórico
e eventuais tags Git incluem `v`, como `v0.1.0`.

O Yuzuha é uma biblioteca com CLI incluída. Não há sufixo `m`, divisão por
superfícies ou canais `-alpha`, `-beta` e `-stable` no histórico. A série `0.x`
continua em desenvolvimento inicial; ausência de sufixo não significa validação
de operação no Fluxer real.

Cada entrada usa `## vX.Y.Z · DD/MM/YYYY`, um resumo humano e a lista de mudanças.
Publicar um pacote ou criar uma tag é uma operação separada da atualização destes
documentos. Veja a [política completa](VERSIONING.md).

</details>

## v0.1.5 · 22/10/2026

Subcomandos e flags tipadas, ajuda derivada das definições e testes nativos com relógio controlável, com projetos gerados prontos para compartilhar. Esta atualização da biblioteca Yuzuha foi preparada em 22/10/2026 (v0.1.5).

- Comandos aceitam árvores de subcomandos e flags com inferência de tipos, aliases, valores entre aspas e separador `--`. As restrições dos grupos são preservadas na execução dos filhos.
- Ajuda detalha argumentos, flags, escolhas, valores padrão, exemplos e subcomandos. Erros de entrada incluem o uso esperado; metadados também ficam disponíveis no JSON de `check`.
- `createTestBot`, em `yuzuha/testing`, reúne transporte, recursos simulados, estado isolado, mensagens, erros e resultados. O relógio controlável permite verificar cooldown, TTL e tarefas sem aguardar tempo real; o descarte aguarda o encerramento.
- `init` usa dependência npm por padrão; `--local` seleciona a instalação local explicitamente. Projetos JS/TS incluem teste offline de exemplo e `npm test`.
- SDK permanece em 3.3.0 e o catálogo mantém 288 funções. Os contratos e exemplos novos são compartilhados com a documentação e a validação do pacote instalado.

## v0.1.4 · 22/10/2026

Eventos em scripts, cron com fuso, HTTP em streaming e ferramentas de manutenção e testes offline, com autorização compartilhada nos recursos. Esta atualização da biblioteca Yuzuha foi preparada em 22/10/2026 (v0.1.4).

- **19 funções novas**, totalizando **288**: eventos, cron, HTTP multipart, conjuntos de arrays, bytes, percentuais, conversão exata de bases, pré-carga de mensagens e criação de emojis em lote. O SDK permanece em **3.3.0**.
- Mutações de cargos, canais e webhooks em `ctx.resources` verificam autor e bot, servidor, permissões locais e hierarquia aplicável, tanto em scripts quanto em comandos nativos. IDs autorizados são usados na operação final; tokens de webhook não dispensam os guards.
- `bot.scriptEvent` e `plugin.scriptEvents` atendem seis eventos do SDK com dados próprios e imutáveis. Payloads parciais mantêm campos ausentes como `null`; reply exige mensagem disponível. Cancelamento, erros, logs e encerramento seguem o ciclo de vida do bot.
- Scheduler aceita cron de cinco campos, fusos IANA, políticas de execuções atrasadas, concorrência limitada e jitter de retry. Mantém claims, heartbeat e proteção de efeitos parciais; trata transições de horário de verão e expressões sem ocorrência válida.
- `HttpService.stream` entrega o corpo incrementalmente, mantendo timeout, limite e cancelamento durante a leitura. Multipart aceita texto e bytes; políticas por comando só restringem hosts e limites existentes. `$try` continua sem capturar guards e cancelamento.
- Transações reduzem cópias redundantes mantendo isolamento e rollback. `StateMaintenance` oferece estatísticas, limpeza paginada por cursor e backup versionado; restore valida conflitos e claims antes de aplicar, com simulação por padrão.
- CLI acrescenta `lint --json`, exportação de catálogo de plugins, `test` com cenários JSON offline e `data` para manutenção. Lint e cenários não importam código do usuário; exportar funções de uma config exige indicar o arquivo confiável explicitamente.
- Ports próprios precisam implementar os novos métodos e o campo `RoleInfo.managed`; o SDK fixado não expõe esse metadado. As mudanças de autorização e migração estão em [VERSIONING.md](VERSIONING.md).
- Correções de integração preservam IDs reais em eventos sem cache, recusam autor ausente antes de consultas ou dados de usuário, rejeitam arrays esparsos antes de persistir e descartam corpos HTTP também em falhas de redirecionamento.
- Catálogo do editor, referência gerada, documentação e testes do pacote instalado atualizados. Instruções de instalação pelo npm e de uso local incluídas; a validação funcional é offline, sem login no Fluxer.
- Manifest usa o caminho normalizado da CLI para evitar avisos no publish; o teste do pacote instalado também verifica `npm exec --offline -- yuzuha --version`.

## v0.1.3 · 21/10/2026

Histórico de tarefas, diagnósticos no editor, variáveis com expiração e mais recursos do Fluxer, com cancelamento e logs integrados. Esta atualização da biblioteca Yuzuha foi preparada em 21/10/2026 (v0.1.3).

- **24 funções novas**, totalizando **269**: moderação de voz, threads ativas/arquivadas, canais de link, avisos de conteúdo, perfis, contagens ao vivo, TTL, transações declarativas e histórico/reexecução de tarefas.
- `ctx.mod.move`, `mute` e `deafen` compartilham guards de autor/bot, hierarquia, proteção de alvos e casos; falhas parciais continuam escapando de `$try` e impedem retry.
- Threads arquivadas preservam membros, paginação e cursores; perfis normalizados e contagens de gateway incluem timeout e cancelamento. O SDK permanece em **3.3.0**.
- Scheduler persiste histórico limitado, oferece consulta de falhas e reexecução manual segura, renova a claim por heartbeat e encaminha falhas de manutenção aos hooks. Encerramento cancela e aguarda a finalização das execuções rastreadas.
- Variáveis recebem TTL consistente em memória, JSON e SQLite; `userFor` escolhe outro usuário explicitamente. `$dataTransaction` executa até 100 operações entre escopos com rollback, validação e limite de saída antes do commit.
- Editor aponta sintaxe, nomes desconhecidos e aridade em arquivos e strings JS/TS, com posições UTF-16. Catálogos JSON de plugins atualizam sugestões e diagnósticos sem importar código do workspace.
- HTTP e collectors recebem automaticamente `ctx.signal`; cancelamento encerra esperas, remove listeners e não é capturado por `$try`. Respostas HTTP que chegam após o cancelamento têm o corpo descartado.
- `onLog` fornece eventos estruturados com correlação, resultado e duração, sem incluir entrada de comandos, mensagens de erro ou tokens automaticamente. Não há serviço de telemetria.
- Contextos criam os adaptadores de HTTP/collectors sob demanda. Benchmarks acrescentam catálogo grande, payload maior, séries de memória e comparação com baseline compatível, com limiar opcional de regressão.
- Documentação, exemplos de migração e verificações do pacote/editor atualizados. Validação continua offline, sem login ou publicação.

## v0.1.2 · 21/10/2026

Busca e envio de mensagens, gestão de membros e threads, tarefas editáveis, transações entre chaves e ferramentas de desenvolvimento. Esta atualização da biblioteca Yuzuha foi preparada em 21/10/2026 (v0.1.2).

- **21 funções novas**, totalizando **245**: mensagens diretas, encaminhamento, buscas, apelidos, servidor, threads, convites/vanity, clonagem, anexos e controles de agendamento.
- Histórico com cursores `before`, `after` ou `around`; buscas preservam paginação e o estado de indexação do Fluxer.
- `ctx.members.setNickname` e `$nickname` compartilham motivo, permissões do autor/bot, hierarquia e proteção do dono. `ctx.members.search` acrescenta busca por nome.
- Edição de servidor e threads, entrada/saída do bot em threads, convites/vanity e clonagem de expressões sobre **@fluxerjs/core 3.3.0**.
- `$fileBase64`, `$sendFileBase64`, `$sendAttachments` e `sendBytes`/`sendAttachments` nativos: até dez anexos URL/binários na mesma mensagem, com descrições e menções desabilitadas.
- Scheduler com edição, pausa, retomada e política persistente de retry/backoff por tarefa. Alterações recusam tarefas em execução; scripts só alteram tarefas do mesmo autor e servidor.
- Falhas de dispatch agora chegam ao scheduler. Guards e moderação aplicada ou parcialmente concluída encerram a tarefa sem retry automático; claims impedem que uma conclusão antiga apague uma tarefa reivindicada novamente.
- `ctx.data.transaction` oferece operações síncronas entre várias chaves e escopos, com rollback, validação antes do commit e isolamento em memória, JSON e SQLite.
- `yuzuha doctor [config] [--json]` verifica Node, SDK, configuração, comandos, permissões declaradas, presença de token e acesso ao caminho do store, sem login ou exposição de segredos.
- Extensão VS Code incluída no pacote e instalador VSIX local: autocomplete, argumentos em snippets, hover e assinatura ativa para `.yz`/`.yuzuha` e strings JS/TS. Catálogo gerado do registro; `yuzuha/tooling` expõe os auxiliares de linguagem.
- Benchmarks reproduzíveis de dispatch, compilação, avaliação, memória e transações concorrentes, com aquecimento, amostras e JSON. Resultados locais não representam desempenho em rede.
- Guias de migração, editor, benchmarks e cobertura atualizados; validação offline dos contratos novos e do tarball instalado.

## v0.1.1 · 21/10/2026

Mais recursos do Fluxer.js nos modos nativo e script, operações de arrays e correções de execução, JSON e HTTP. Esta atualização da biblioteca Yuzuha foi preparada em 21/10/2026 (v0.1.1).

- **26 funções novas**, totalizando **224**: reações de mensagens, membros de threads, edição de emojis, criação/edição/exclusão de stickers, posição de canais/cargos e categorias.
- `$arrayMap`, `$arrayFilter`, `$arraySome`, `$arrayEvery`, `$arrayFind`, `$arrayReduce` e `$arraySortBy`, com expressões reavaliadas por item, curto-circuito, restauração de variáveis e os mesmos orçamentos do runtime. `$loopAccumulator` expõe o acumulador da redução.
- `$arrayConcat`, `$arrayFlat`, `$arrayChunk`, `$jsonValues` e `$jsonEntries` para compor e consultar dados sem alterar os valores originais.
- Os recursos de `ctx.resources` compartilham as novas operações com scripts. Listas de usuários de reações e membros de threads aceitam limite e cursor de paginação.
- `$createEmoji[nome;url]` baixa bytes respeitando a política HTTP e envia base64 ao SDK; corrige o envio da URL como se fosse uma imagem codificada. `ctx.http.requestBytes` permite downloads binários sem conversão UTF-8.
- HTTP remove credenciais ao seguir redirecionamentos para outra origem, cancela streams que excedem o tamanho permitido e identifica timeout durante a leitura do corpo.
- Caminhos JSON deixam de seguir propriedades herdadas; `$object` e `$jsonMerge` preservam `__proto__` como dado. Escritas em arrays por caminho aceitam índices de **0 a 9999**, evitando alocações descontroladas.
- `$range` termina corretamente nos extremos de inteiros seguros; loops verificam a saída entre iterações, e `$loopValue` preserva itens `null`.
- Deduplicação de valores primitivos em `$arrayUnique` usa um conjunto, mantendo igualdade profunda para objetos. Arquivar e bloquear uma thread usa uma única chamada ao SDK.
- Resolução de emojis, stickers e cargos preserva erros de transporte; buscas por ID deixam de disparar listagens extras após falha.
- `mockResources` aceita implementações parciais por método, mantém `this` para campos privados e informa recursos ausentes com `NATIVE_UNAVAILABLE`.
- Referência gerada, inventário de lacunas, exemplos e testes offline atualizados. O SDK continua fixado em **@fluxerjs/core 3.3.0**; os wrappers ampliam a cobertura sem prometer uma função para cada método do SDK.

## v0.1.0 · 20/10/2026

Primeira versão do Yuzuha como framework para Fluxer.js com function mode opcional. Um bot nativo ganha comandos tipados, guards, estado, moderação, recursos, agendamentos e HTTP sem carregar o runtime de scripts; quem quiser a sintaxe curta ativa `yuzuha/functions`.

- Entrypoint `yuzuha` focado em JS/TS: `Yuzuha`, `defineCommand`, `arg`, eventos, contexto, plugins, middleware, recursos, stores, scheduler, HTTP e `yuzuha/sdk`.
- Function mode isolado em `yuzuha/functions`: parser, AST, evaluator, `Runtime`, `registerBuiltins`, `script()` e **198 funções**.
- Builtins registrados sob demanda: comandos nativos não pagam o custo nem expõem a linguagem; `code` ativa o modo automaticamente e `bot.enableFunctions()` permite pré-carregar.
- Comandos com prefixos, aliases, argumentos tipados, cooldowns, permissões, checks, middleware e recarga atômica de diretórios.
- Eventos tipados, plugins com comandos/eventos/funções e encerramento idempotente.
- Moderação compartilhada entre JS/TS e scripts, com permissões efetivas, hierarquia, proteção do alvo e casos por servidor.
- Recursos de usuários, membros, servidor, banimentos, auditoria, presença, cargos, canais, mensagens, fixados, anexos, convites, webhooks, emojis, stickers, threads e fóruns.
- Coletores com timeout e filtro por autor, `$confirm`, JSON, arrays, texto, números, datas, loops e caminhos persistentes.
- Agendamentos persistentes com retry e recuperação de tarefas órfãs; HTTP com timeout, limite de bytes, allowlist e bloqueio de hosts privados.
- Estado em memória, JSON e SQLite com schema 2, transações, snapshots isolados e migração automática do schema 1.
- CLI `init`, `check`, `functions`, `run` e `dev`; scaffolds JS/TS com `--functions` opcional.
- `MockTransport`, `mockResources` e `MemoryStore` para validação offline, sem login ou ações reais.
- **168 testes** offline, **198 funções** na referência gerada e documentação de linguagem, framework, API, arquitetura, estado, paridade, CLI e validação.
