# Validação local

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
