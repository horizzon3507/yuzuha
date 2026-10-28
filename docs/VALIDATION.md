# Validação local

## Preparação da 0.1.8 (28/10/2026)

Linux x64, Node **26.11.1**, npm **12.2.1**. Biblioteca, CLI e extensão incluída
alinhadas em **0.1.8**; SDK **3.3.0**, schema **2** e sete entrypoints.

| Verificação | Resultado |
|---|---|
| `npm run check` | PASS: **613 testes**, tipos, arquitetura de **181 módulos**, build, editor, **310 funções** e links de **39 arquivos Markdown** |
| `npm run smoke:package` | PASS: tarball instalado, consumidores JS/TS, paridade de exports do SDK, CLI 0.1.8, catálogo do editor, 14 pares de base/linguagem e function mode |
| Histórico em commits | PASS: 17 snapshots intermediários verificados isoladamente com typecheck e build antes dos metadados da release |
| Migração | Novos métodos de recursos customizados, autorização de expressões e restrições HTTP documentados em [VERSIONING.md](../VERSIONING.md) |

Esta seção registra a validação anterior à publicação. Os testes usam mocks e
stores temporários, sem login nem ações reais no Fluxer. As medições de
cooldowns permanecem locais e não comprovam aceleração geral; veja
[BENCHMARKS.md](BENCHMARKS.md). A revisão anterior em Node 22/26 está preservada
abaixo com as versões e os fatos originais.

## Revisão local após a 0.1.7 (28/10/2026)

Linux x64, npm **12.2.1**, Node **26.11.1** e **22.22.3**. O pacote continua
em 0.1.7, com o SDK fixado em 3.3.0 e o schema de estado preservado.

| Verificação | Resultado |
|---|---|
| `npm ci` | PASS: lockfile instalado, auditoria sem vulnerabilidades reportadas |
| `npm run check` em Node 26 e Node 22 | PASS em ambos: **613 testes**, tipos, arquitetura de **181 módulos**, build, editor, **310 funções** e links locais |
| `npm run smoke:package` em Node 26 e Node 22 | PASS em ambos: pacote instalado, consumidores JS/TS, SDK, CLI, editor, 14 templates e function mode |
| Paridade de recursos | PASS: páginas de fixadas/reações, filtros avançados e membro individual de thread preservam metadados; testes com SDK e REST simulados |
| Autorização | PASS: todas as mutações de expressões exigem autor/bot e servidor do contexto; download de emoji é recusado antes do HTTP quando falta permissão |
| Runtime e persistência | PASS: erros protegidos atravessam JSON e `$try`, atualizações validam saída antes de persistir, prazo monotônico e intervalos de espera sem crédito duplicado |
| HTTP e anexos | PASS: IPv6 e redes especiais, redirects, cópia de buffers reutilizados, cancelamento pendente, metadados estáveis e readers liberados |
| Cooldowns | PASS: expiração, capacidade, renovação e deduplicação; resultados comparativos e limites da medição em [BENCHMARKS.md](BENCHMARKS.md) |

Os testes usam mocks, fontes sintéticas e stores temporários, sem login ou
ações reais de bot. A validação DNS anterior à conexão não elimina DNS
rebinding; o contrato e as restrições estão em [HTTP.md](HTTP.md).
Essas mudanças não publicam pacote, release, tag ou bot.

## Preparação final da 0.1.7 — 24/10/2026

Biblioteca e CLI na raiz, instaladas com `npm ci` e `package-lock.json`.
Verificação em Linux x64, Node **26.11.1** e **22.22.3**, npm **12.2.1**.

| Verificação | Resultado |
|---|---|
| `npm run check` em Node 26 e Node 22 | PASS em ambos: **542 testes**, tipos, arquitetura de **174 módulos**, build, editor, **306 funções** e links de **38 arquivos Markdown** |
| `npm run smoke:package` em Node 26 e Node 22 | PASS em ambos: tarball instalado, sete entrypoints, paridade do SDK, consumidores e scaffolds JS/TS, CLI, regex e imagens com/sem Sharp |
| Gateway | PASS: seis regressões sem login, cobrindo Error/ShardError, emissão pareada, hooks com rejeição, listeners externos, encerramento reentrante e limpeza de login tardio |
| Streaming de scripts | PASS: fonte cujo `cancel()` nunca termina não impede a propagação de guards nem a restauração do contexto |
| Parser | PASS: AST, escapes, offsets e erros preservados em **20.000 casos determinísticos**; nove amostras alternadas antes/depois em [BENCHMARKS.md](BENCHMARKS.md) |
| Distribuição | PASS: workers de regex/imagens, tipos, fontes e guias incluídos; apps, workspaces, dependências web e metadados exclusivos do site ausentes |

Os trechos longos melhoraram no microbenchmark do parser; os casos curtos e
densos ficaram próximos. A medição não demonstra aceleração do despacho completo.
O site anterior está preservado na branch local `archive/site-0.1.7-20261024`.
Esta preparação não criou tag, push, publicação npm ou release remota. Os testes
usaram mocks, stores temporários e imagens sintéticas, sem conexão ao Fluxer.

## Lacunas implementadas na 0.1.7 — registro de 23/10/2026

Verificação em **23/10/2026**, Linux x64, Node **26.11.1**, npm **12.2.1** e
Bun **1.4.2**. Esta rodada amplia a preparação inicial da 0.1.7 descrita abaixo.

| Verificação | Resultado |
|---|---|
| `npm run check` | PASS: **532 testes da biblioteca**, **68 dos docs**, tipos, arquitetura de **174 módulos**, build, editor e catálogo |
| Referência web anterior | PASS: **556 páginas**, **306 funções**; 18 inclusões na v0.1.7 com versão na página e no dropdown |
| Linguagem | PASS: loops, comparador estável, decimais BigInt e regex com prazo/worker/cancelamento |
| Consultas | PASS: memória/JSON/SQLite, prefixo, cursor, ordem Unicode, TTL, snapshots, rollback e uso do índice SQLite |
| Tarefas | PASS: prioridades, teto compartilhado em conexões e **processos Node independentes**, recuperação de leases |
| Streams | PASS: HTTP incremental em scripts, UTF-8 dividido, backpressure, erros protegidos, limite e cancelamento; entrada de anexos limitada |
| Imagens | PASS: imagens sintéticas reais, resize/rotação/tons de cinza, limites e processos canceláveis |
| Node 22.22.3 | PASS: **35 testes focados** das novidades, usando o binário Node 22 diretamente; inclui filhos de imagem/regex e processos do scheduler |
| SDK | PASS: configuração nativa de shards e client injetado sem login; componentes ausentes conferidos nos exports |
| `npm run smoke:package` | PASS: CLI instalada, regex, JS/TS, SDK, scaffolds e módulo de imagens com e sem Sharp |
| `npm pack --workspace yuzuha --dry-run` | PASS: **0.1.7**, **960 arquivos**, workers de regex/imagens incluídos e apps excluídos |
| Interface atualizada | PASS: httpStream exibe versão no corpo e menu; uso sem caixa; animação de altura de 220 ms ao fechar/abrir sem mudança de URL |

O índice SQLite é derivado e reconstruído na primeira consulta após escrita;
as escritas ainda serializam o estado integral. Anexos recebidos por stream
são acumulados antes do upload exigido pelo SDK. Componentes interativos e
comandos de aplicação continuam sem contrato equivalente verificado.
[FUNCTION-GAPS.md](FUNCTION-GAPS.md) e [INTEGRATIONS.md](INTEGRATIONS.md)
registram essas limitações. Não houve publicação ou ações reais de bot.

## Monorepo e documentação web — rodada anterior

Verificação local em **23/10/2026**, Linux x64, Node **26.11.1**, npm **12.2.1**
e Bun **1.4.2**. O pacote permanece em 0.1.7; os apps são privados.

| Verificação | Resultado |
|---|---|
| `bun install --frozen-lockfile` | PASS: lockfile único e dependências isoladas, sem alterações |
| `npm run check` | PASS: **497 testes da biblioteca**, **46 testes dos docs**, tipos, arquitetura, build, editor e catálogo |
| Docs do gerador anterior | PASS: **518 páginas**, áreas Yuzuha/Funções/Projeto, **288 referências individuais** em **20 categorias**, validação de build e links |
| Exemplos | PASS: tutoriais nativos, contador concorrente e scripts com resultado esperado em fixtures; exemplos de moderação/rede compilados sem ações |
| `npm run smoke:package` | PASS: consumidores JS/TS, SDK, CLI, editor, música sobre mocks e scaffolds instalados do tarball |
| Worker da landing | PASS: build React e `wrangler deploy --dry-run`, assets estáticos e nenhum binding |
| Interface | PASS: navegação por teclado, cópia e exemplos alternáveis; landing inspecionada entre 320 e 1280 px; docs em temas claro e escuro |
| Acento | PASS: `#EACB1A`; texto escuro no amarelo a **9,30:1**, links claros em variante escura a **6,79:1** |

Esse registro corresponde à organização anterior, com landing e documentação
web. O site e os relatórios de interface foram preservados na branch local
`archive/site-0.1.7-20261024`. A biblioteca voltou à raiz com guias Markdown;
as medições de interface acima são históricas. O ensaio do Worker não publicou
o site; nenhum bot fez login, e nenhum pacote, tag ou release foi criado.

## Atualização 0.1.7

Preparação local em **23/10/2026**, Linux x64, Node **26.11.1** e npm **12.2.1**.
A distribuição inclui o conteúdo preparado na 0.1.6 e acrescenta busca na CLI.

| Verificação | Resultado |
|---|---|
| `npm run check` | PASS: tipos, arquitetura, **497 testes**, build, editor, 288 funções e links |
| Busca de funções | PASS: nome, alias, descrição, caixa, `$`, espaços, categoria, JSON, catálogo, plugins, entradas inválidas e resultados vazios |
| `npm run smoke:package` | PASS: busca pela CLI instalada do tarball, consumidores JS/TS, SDK, música sobre mocks e scaffolds offline |
| `npm pack --dry-run` | PASS: versão 0.1.7, CLI, música, fontes do plugin, extensão e documentação incluídas |

Os testes não fizeram login nem ações reais no Fluxer. As integrações de áudio
e comparações de performance descritas na 0.1.6 abaixo são evidências históricas;
não foram repetidas nesta preparação. Nenhum pacote, tag ou release foi publicado.

## Atualização 0.1.6

Preparação local em **22/10/2026**, Linux x64, Node **26.11.1**, npm **12.2.1** e
`@fluxerjs/core` **3.3.0**. A referência de performance vem do commit `556e76d`
(0.1.5), recompilado em diretório temporário para a suíte adicional.

| Verificação | Resultado |
|---|---|
| `npm run check` | PASS: tipos, arquitetura de 164 módulos, **494 testes**, build, editor, catálogo e links |
| `npm run smoke:package` | PASS: instalação isolada, consumidores JS/TS, CLI, SDK e scaffolds |
| Compatibilidade de runtime | PASS: `npm run check` e `npm run smoke:package` completos em Node **22.22.3** e **26.11.1**, com 494 testes por runtime |
| Dispatch e runtime | PASS: prefixos alterados, TTL em fila, deduplicação limitada, AST editável, ordem, limites e guards |
| Comparação estrutural | PASS: 20000 entradas de tokenização e 10000 ASTs/diagnósticos equivalentes à 0.1.5; mais 10000 casos de flags e 10000 argumentos contra a primeira implementação 0.1.6, com geração determinística |
| Moderação | PASS: autor, bot, hierarquia, persistência de casos e falha parcial na suíte existente |
| Música | PASS: isolamento, carga, edição/páginas, loop, posição, controles limitados, eventos antigos/duplicados e falhas antes da confirmação da fila |
| Recuperação | PASS: sessão retomada sem reiniciar, reconstrução limitada de sessões perdidas, renovação de voz, transições interrompidas, respostas atrasadas e encerramento durante recuperação |
| Lavalink v4 | PASS: headers, REST validado, decode, ready/resume, buffer limitado, TTL/LRU/bytes, buscas compartilhadas com cancelamento independente e timeout com fetch/socket simulados |
| Voz Fluxer | PASS: driver injetado, join compartilhado, playback, volume, disconnect, late join, publicação cancelada e encerramento reentrante |
| Ponte de áudio | PASS: plugin Lavalink 4.2.2 real, Opus/WebM a 48 kHz, decoder oficial 3.1.0, pausa, volume, filtros, seek, avanço de fila e reinício do servidor em Node 22/26; publicação LiveKit simulada |
| Limites da ponte | PASS: autenticação, saídas duplicadas/capacidade, timeout/cancelamento de HTTP, reconexão limitada, uma inscrição por node, 16 servidores e liberação de recursos |
| Pacote instalado | PASS: sexto entrypoint `yuzuha/music`, tipos da ponte/stream, fontes do plugin, recuperação sobre mocks e construção sem dependência opcional de voz |
| Compatibilidade | PASS: SDK 3.3.0, schema 2, 288 funções e exports anteriores preservados |

Os relatórios em [BENCHMARKS.md](BENCHMARKS.md) registram duas rodadas iniciais,
uma reexecução do build refinado e uma suíte adicional, contra a referência 0.1.5.
Nessa reexecução, dispatch nativo sequencial ficou em **3,03×**, scripts em
**1,73×**, e avaliação em **1,37×**. Transações variaram de −7,2% a +4,9% nas
três rodadas, com −6,1% no build refinado, sem ganho geral comprovado.
Entradas simples longas, registro de catálogo e leitura pontual têm cargas
específicas documentadas; não são estimativas de latência em produção.

O refinamento foi comparado também à primeira implementação local da 0.1.6:
paginação de 25/5000 faixas ficou em **217–224×**, parsing isolado de flags em
**1,47–1,56×** e lotes de 32 buscas com signals em **6,09–6,34×**. As buscas
compartilharam uma requisição simulada por lote em vez de 32. O dispatch com flags
variou de −4,6% a +41,7%, sem ganho estável demonstrado. A reexecução com a ponte
manteve **224×** na página da fila e **6,12×** no lote de buscas. Configurações,
hashes e amostras estão nos quatro relatórios de refinamento em [BENCHMARKS.md](BENCHMARKS.md).

Os testes principais usam `MockTransport`, `MockMusicBackend`, drivers/fetch/sockets
simulados e stores temporários. A integração adicional subiu um Lavalink 4.2.2
temporário com o plugin `yuzuha-audio`, WAV sintético e decoder real do SDK.
Os trechos pausados e com volume zero tiveram RMS 0; a recuperação voltou a
produzir áudio. Relatórios de [Node 22](../bridges/lavalink/results/node22.json)
e [Node 26](../bridges/lavalink/results/node26.json) incluem medidas, verificações
e hashes do servidor, plugin e módulos executados.

Somente a publicação LiveKit foi simulada: não houve login nem áudio em uma
sala real. O pacote e o plugin estão preparados localmente, sem publicação npm,
tag ou release remota. Instalação e limites estão em [MUSIC.md](MUSIC.md).
As evidências abaixo da 0.1.5 e anteriores permanecem históricas.

## Atualização 0.1.5

Executada em **22/10/2026**, Linux, Node **26.11.1**, npm **12.2.1** e
`@fluxerjs/core` **3.3.0**. A validação funcional usa mocks e stores isolados,
sem conexão de bot ao Fluxer. A distribuição pública foi conferida separadamente.

| Verificação | Resultado |
|---|---|
| `npm run check` | PASS: tipos, arquitetura, **411 testes**, build, editor, referência e links |
| `npm run smoke:package` | PASS: tarball instalado, consumidores JS/TS, CLI, SDK e scaffolds |
| Comandos | PASS: aliases aninhados, flags inferidas, aspas, negativos, `--`, erros e ajuda |
| Herança | PASS: servidor, permissões de autor/bot, checks, middleware, cooldown e políticas HTTP |
| Registro e recarga | PASS: snapshots, ciclos/profundidade, conflitos, rollback e preservação de comandos manuais |
| Plugins | PASS: scripts em subcomandos usam builtins e funções do plugin |
| Fixture de testes | PASS: isolamento, mensagens/erros/resultados, TTL, cooldown, scheduler/retry e encerramento |
| Scaffold | PASS: dependência npm por padrão; modo local JS/TS e function mode passam instalação, testes e check |
| Consumidor TypeScript | PASS: flags e argumentos inferidos, tipos do helper e imports públicos |
| Catálogo | PASS: 288 funções; JSON dos comandos compartilha uso e metadados com a ajuda |
| Matriz local | PASS: `check` e `smoke:package` em Node **22.23.4**, **24.22.1** e **26.11.1** |
| GitHub Actions | PASS: matriz Node 22, 24 e 26 no commit da release |

O smoke confere o range npm do scaffold padrão e instala os exemplos com
`--local`, usando o pacote em teste. Após a publicação, scaffolds padrão JS/TS
também foram instalados pelo npm e passaram testes, check e typecheck TS.
HTTP nos testes usa fetch simulado; moderação usa `MockTransport`; stores de
teste são isolados. Relógio controlável não altera timers globais, timeout de
rede ou relógios de schedulers fornecidos pelo consumidor. Não foi executada
validação ao vivo no Fluxer.

### Publicação confirmada da 0.1.5

Em **22/10/2026**, a autenticação por passkey confirmou a publicação de
[`yuzuha@0.1.5` no npm](https://www.npmjs.com/package/yuzuha/v/0.1.5), com
`latest` apontando para `0.1.5`. O tarball público tem **615092 bytes** e SHA-512
igual ao artefato local validado:

```text
sha512-Fa34WB61mBBTPIDM1+OiunlA5cfIk/E8+mOwVHMxX8FCu37kKcSjljlRk5Rk2jLgYH64Gef2pOXUWLMeUtzMbw==
```

A [release do GitHub](https://github.com/horizzon3507/yuzuha/releases/tag/v0.1.5)
inclui tarball, VSIX e checksums. A tag `v0.1.5` aponta para
`b1da0d32c77055591be6240ad0dc8b321aa08819`; os
[testes remotos desse commit](https://github.com/horizzon3507/yuzuha/actions/runs/39795420825)
e os da tag passaram nas três versões de Node.

Uma pasta temporária instalou a versão exata pelo registro e verificou a CLI,
os cinco entrypoints, 288 funções, paridade dos exports do SDK e execução de
subcomando com flag tipada sobre mocks. Scaffolds JS e TS gerados sem `--local`
instalaram `yuzuha@0.1.5` pelo npm e passaram `npm test`, `check` e o typecheck TS.
O comprovante local está em `artifacts/release-0.1.5-public-receipt.json`.

As seções seguintes preservam o registro histórico da 0.1.4, incluindo suas
medições e a publicação anterior; esses resultados não são medições da 0.1.5.

## Registro anterior: 0.1.4

Evidência da versão **0.1.4**, executada em **22/10/2026**, sem login ou ações
no Fluxer real. Ambiente: Linux, Node **26.11.1**, npm **12.2.1** e
`@fluxerjs/core` **3.3.0**, fixado no lockfile.

## Verificações

| Verificação | Resultado |
|---|---|
| `npm run check` | PASS: tipos, arquitetura, testes, build, editor, referência e documentação |
| Testes de comportamento | PASS: **386 testes**, nenhuma falha, cancelamento ou skip |
| Dependências entre camadas | PASS: **147 módulos**; domínio, ports, serviços e scripting isolados |
| Referência e documentação | PASS: **288 funções**, 28 arquivos Markdown e links locais |
| Manifest, lockfile e changelog | PASS: versão `0.1.4`, título Hory `v0.1.4` |
| `npm run smoke:package` | PASS: tarball instalado em consumidor externo e scaffolds JS/TS |
| Consumidor TypeScript | PASS: tipos novos de eventos, cron, HTTP, manutenção e lotes do SDK |
| CLI no pacote instalado | PASS: lint JSON, catálogos, plugins, cenários e manutenção de estado |
| Executável instalado | PASS: `npm exec --offline -- yuzuha --version` retorna `0.1.4` |
| `npm publish --dry-run --json` | PASS: prepack e conteúdo, sem avisos de normalização; apenas autenticação ausente |
| Scaffold `--functions` | PASS: 4 comandos, typecheck e execução offline de `!eco` |
| Paridade de exports do SDK | PASS: mesmas chaves públicas de `yuzuha/sdk` e `@fluxerjs/core` |
| CLI compilada | PASS: `--version` retorna `0.1.4`; config de exemplo valida 6 comandos |
| Exemplos nativo e de script | PASS: resposta `Membro banido. Caso #1.`, com transporte simulado |
| `npm run package:editor` | PASS: VSIX local 0.1.4 com catálogo de 288 funções |

## Cobertura da 0.1.4

- 19 funções novas, com catálogo e referência gerados do registro executável:
  conjuntos de arrays, bytes, percentuais, bases exatas, eventos, cron, multipart,
  pré-carga de mensagens e criação de emojis em lote.
- Autor/bot, servidor, hierarquia, permissões locais, cargos protegidos,
  overwrites e token de webhook nos recursos de contexto. Mutações delegam IDs
  já autorizados; getters e recursos herdados continuam disponíveis. O SDK
  fixado não expõe `managed`; a limitação do adaptador está em [PARITY.md](PARITY.md).
- Seis eventos com payloads reais do SDK, contextos imutáveis, mensagens
  parciais, identidade e servidor preservados mesmo sem objetos em cache.
  Autor realmente ausente recusa dados de usuário implícitos e autorização
  antes de consultar membros. Guards e falhas parciais escapam de `$try`.
- Eventos verificam `once`, filtro de bots, plugin com staging/rollback,
  texto de usuário sem reinterpretação, reply real, saída explícita, erros,
  cancelamento, remoção de listeners e destroy interno/externo.
- Cron verifica sintaxe, limites, calendários impossíveis, fusos IANA, DST,
  DOM/DOW, atraso, edição, jitter determinístico e concorrência. Claims,
  heartbeat, recuperação e finalização continuam protegidos; uma ocorrência
  futura inalcançável termina sem repetir o handler bem-sucedido.
- Streaming entrega bytes antes do fim e mantém timeout sem consumidor ou
  durante leitura. Testes verificam limite acumulado/content-length,
  cancelamento, listeners, redirect, credenciais, corpo tardio e descarte
  também em Location inválido ou excesso de redirects.
- Multipart preserva bytes, campos repetidos e boundary; rejeita métodos sem
  corpo, metadados inválidos, payload excessivo e base64 não canônico antes do
  fetch. Políticas só restringem hosts/limites e preservam sinais encadeados.
- TTL/transações mantêm isolamento, rollback, retornos copiados e recusa de
  callbacks assíncronos. Arrays esparsos e valores fora de JSON são rejeitados
  antes de persistir ou restaurar em memória, JSON e SQLite.
- Estatísticas, limpeza com cursor, backup versionado, restauração simulada e
  aplicada, merge, conflitos e claims. SQLite somente leitura não inicializa
  nem modifica o banco; os testes reabrem os stores após aplicar mudanças.
- CLI lint não importa módulos; catálogos de plugins são JSON declarativo.
  Cenários têm schema versionado e executam apenas scripts sobre mocks, com
  HTTP e scheduler desabilitados. Configs JS/TS só são importadas quando o
  comando correspondente exige explicitamente código confiável.
- Consumidor instalado exercita as APIs novas, cenários/lint, catálogo de
  plugin com roundtrip, backup/limpeza/preview e tipos públicos, além dos
  scaffolds anteriores e da igualdade de exports do SDK.

## Regressões preservadas

A suíte inclui moderação e casos com falha parcial, voz, nickname, paginação,
threads, perfis e contagens, TTL na fronteira exata, transações concorrentes,
reabertura JSON/SQLite, histórico/retry de tarefas e isolamento por autor/guild.
Também inclui parser e limites, dados de usuário inertes, caminhos/propriedades
próprias, diagnósticos UTF-16 e o host simulado da extensão VS Code.

A raiz nativa continua sem exports de parser/runtime; bots nativos não registram
builtins. Comandos com `code`, eventos de script e `enableFunctions()` ativam o
function mode sob demanda. Reload, fechamento, store injetado e identidade das
classes públicas em configs/comandos TS continuam cobertos.

## Limites da evidência

Os testes usam `MockTransport`, clientes sem conexão, stores temporários e fetch
simulado. A matriz remota de CI e uma sessão gráfica real do VS Code não foram
executadas. Exportar todo o SDK não equivale a cobrir cada método com scripts.
Esta evidência registra a verificação local anterior à publicação; ela não
comprova a presença do pacote no registro. A publicação exige autorização e
verificação separadas. Nenhum bot foi conectado ao Fluxer nesta validação.

## Medições de desempenho

As referências da 0.1.3 foram executadas novamente a partir do tarball anterior,
com o mesmo runner, SDK e **Node 26.11.1** da 0.1.4. Os relatórios anteriores
usavam Node 26.8.2; seus números não foram usados para atribuir ganhos à biblioteca.
Os processos foram sequenciais, sem builds, instalações ou suítes de testes
em paralelo. CPU: AMD Ryzen 5 5625U, Linux x64, GC explícito.

Relatórios brutos locais:

- `artifacts/benchmark-0.1.3-reference-0.1.4.json` e `artifacts/benchmark-0.1.4.json`.
- `artifacts/benchmark-0.1.3-reference-0.1.4-long.json` e `artifacts/benchmark-0.1.4-long.json`.

A série ampliada usa 10000 operações/amostra, 7 amostras, concorrência 16,
1000 comandos, payload de 4096 caracteres e 20 rodadas adicionais de memória,
totalizando 200000 despachos nessa etapa.

| Cenário | 0.1.3 ops/s | 0.1.4 ops/s | Variação |
|---|---:|---:|---:|
| Dispatch nativo | 82510 | 90771 | +10,0% |
| Dispatch nativo concorrente | 83843 | 85378 | +1,8% |
| Dispatch de scripts | 68609 | 71261 | +3,9% |
| Dispatch de scripts concorrente | 69490 | 74571 | +7,3% |
| Compilação | 549430 | 565770 | +3,0% |
| Avaliação | 32734 | 33129 | +1,2% |
| Transações concorrentes | 141527 | 138773 | -1,9% |
| Catálogo grande | 86613 | 88190 | +1,8% |
| Payload maior | 576592 | 617030 | +7,0% |

Transações removem cópias e adaptadores redundantes, mas essa carga não mostrou
ganho de throughput. A série padrão curta variou mais, incluindo quedas de cerca
de 22–25% em dois cenários de dispatch; ela permanece nos arquivos brutos.
Não há alegação de melhoria universal ou limiar de desempenho aprovado.

A série ampliada terminou com variação de heap de **55240 bytes** após GC e
RSS menor. Isso não comprova ausência de vazamentos. Os resultados são
exploratórios desta máquina; não medem latência real do Fluxer. Metodologia e
opções estão em [BENCHMARKS.md](BENCHMARKS.md).

## Publicação confirmada no npm

Em **22/10/2026**, `yuzuha@0.1.4` foi publicado no
[npm](https://www.npmjs.com/package/yuzuha/v/0.1.4), com `latest` apontando para
`0.1.4`. Após o processamento do registro, foram conferidos a versão pública,
a tag e o download do tarball: **591282 bytes**, com SHA-512 igual ao artefato
local validado. O comprovante local está em `artifacts/publish-0.1.4.json`.

Uma pasta temporária instalou `yuzuha@0.1.4` pelo registro público e confirmou a
CLI `0.1.4`, os cinco entrypoints, 288 funções, exports do SDK, cron, backup e
resposta de comando com transporte simulado. Nenhum bot foi conectado ao Fluxer.
