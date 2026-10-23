# Benchmarks locais

O runner usa `MockTransport`, `MemoryStore` e funções determinísticas, sem token,
rede ou ações reais. Mede nove cenários com a configuração padrão:

- Dispatch nativo e function mode, sequenciais e com concorrência configurável.
- Compilação de um script fixo e avaliação de um programa já compilado.
- Transações concorrentes com duas chaves, verificando que não há incrementos perdidos.
- Dispatch com 1000 comandos e avaliação de um payload de 4096 caracteres.

Após as medições, executa cinco rodadas adicionais de 1000 despachos e registra
heap/RSS entre rodadas, com GC explícito quando disponível. Os comandos não
enviam mensagens nem acumulam respostas no mock.

## Executar

```sh
npm run bench
npm run bench -- --iterations 1000 --samples 7 --concurrency 16 --json
```

Para salvar JSON sem os avisos do npm:

```sh
npm run build
node --expose-gc benchmarks/run.mjs --iterations 1000 --samples 7 --concurrency 16 --json > resultado.json
```

O pacote npm também contém `benchmarks/run.mjs`, utilizável com os arquivos de
`dist` instalados. O runner valida os resultados durante a medição.

## Ler os resultados

Cada cenário aquece até 200 operações antes de medir. O relatório registra
amostras, mediana, p95 do tempo total de cada amostra, operações por segundo e
variação de heap/RSS, além de Node, versão do pacote, CPU, plataforma e parâmetros.
Com `--expose-gc`, há GC explícito antes e depois da série, fora dos tempos medidos.

Concorrência significa tarefas simultâneas no event loop; não paralelismo de
CPU. Dispatch inclui contexto, roteamento e deduplicação. Os comandos usados
não enviam respostas; os dados não se acumulam no mock de mensagens.

O p95 é das amostras, não de latências individuais. Variação de memória pode
ser negativa e inclui efeitos de caches, GC e do processo. Não comprova ausência
de vazamentos. Os cenários executam trabalhos diferentes; não representam uma
comparação direta de custo entre comandos equivalentes.

## Comparar uma referência salva

```sh
node --expose-gc benchmarks/run.mjs --json > baseline.json
node --expose-gc benchmarks/run.mjs --baseline baseline.json --json > atual.json
node --expose-gc benchmarks/run.mjs --baseline baseline.json --max-regression 20
```

O comparador exige CPU, plataforma, arquitetura, versão exata do Node, modo de GC e
parâmetros iguais. Mantenha também a carga de fundo ao
comparar versões. Cenários novos aparecem como `new`; os comuns mostram variação
percentual de throughput e diferença de heap. `--max-regression 20` termina com
código 1 se algum cenário comparável perder mais de 20% de operações por segundo.
Sem esse argumento, a comparação é informativa. O p95 continua sendo de amostras.

Relatórios da 0.1.2 podem servir de referência para os sete cenários comuns.
Parâmetros novos ausentes nesses relatórios não impedem a comparação; as cargas
que não existiam aparecem como `new`, sem percentual ou limiar aplicado.

Os parâmetros adicionais são `--catalog-size` (1–10000), `--payload-size`
(1–99000 caracteres) e `--soak-rounds` (1–1000). Para observar uma série maior:

```sh
node --expose-gc benchmarks/run.mjs --iterations 1000 --soak-rounds 200 --json > memoria.json
```

Isso acrescenta 200000 despachos e 201 pontos de memória ao relatório. Crescimento
de heap não é diagnosticado automaticamente como vazamento: caches limitados,
JIT e GC também afetam a série. Repita as medições e conserve o JSON original.
Não há um limiar de desempenho obrigatório no CI nem medição de latência da
API/gateway do Fluxer.

## Cargas adicionais de performance da 0.1.6

```sh
npm run bench:performance
node --expose-gc benchmarks/performance.mjs --json > performance.json
node --expose-gc benchmarks/performance.mjs --baseline referencia.json --json
```

Essa suíte mede mensagens comuns/bots/comandos desconhecidos que serão ignorados,
dispatch com 4096 caracteres de entrada simples, entre aspas ou com apóstrofo,
registro de 1000 comandos e leitura de
uma variável em um estado com 2000 chaves. São os caminhos alterados na 0.1.6.
Não usa token, HTTP real nem áudio.

Para reproduzir uma referência com o mesmo runner e o build de outra versão:

```sh
node --expose-gc benchmarks/performance.mjs --package-root /caminho/versao-anterior --json > referencia.json
node --expose-gc benchmarks/performance.mjs --baseline referencia.json --json > atual.json
```

A pasta indicada deve conter o pacote confiável já compilado em `dist`. O runner
importa esse pacote nativo, como a aplicação faria; não é um avaliador de scripts.
Use o mesmo arquivo de runner nas duas versões. O padrão é 10000 operações e
nove amostras; dispatch longo e leitura de estado usam um décimo das iterações,
e cada operação de registro instala um catálogo inteiro. Nesse último cenário,
`operationsPerSecond` conta comandos registrados, incluindo construção, inspeção
do catálogo e encerramento do bot. `unitsPerOperation` e `iterations` registram
essas diferenças; p95 continua sendo tempo por amostra.

As opções adicionais são `--state-keys` (1–10000), `--catalog-size`,
`--payload-size`, `--iterations` e `--samples`. Comparações exigem a versão exata
do Node, mesmo modo de GC, mesma suíte e mesmos parâmetros/unidades por cenário.
Relatórios antigos de outro Node precisam ser executados novamente.

## Resultados da 0.1.6 contra a 0.1.5

Medições locais de 22/10/2026, Node **26.11.1**, Linux x64, GC explícito e mesma
CPU. A referência foi compilada do commit `556e76d` (0.1.5), com o SDK 3.3.0.
A suíte principal usa 10000 operações/amostra, nove amostras, concorrência 16,
catálogo de 1000 comandos, payload de 4096 caracteres e 20 rodadas de memória.

| Cenário | 0.1.5 ops/s | 0.1.6 refinada, ops/s | Razão |
|---|---:|---:|---:|
| Dispatch nativo | 85058 | 257320 | 3,03× |
| Dispatch nativo concorrente | 86765 | 251574 | 2,90× |
| Dispatch de scripts | 69638 | 120503 | 1,73× |
| Dispatch de scripts concorrente | 67126 | 139221 | 2,07× |
| Compilação | 513687 | 585644 | 1,14× |
| Avaliação | 31327 | 42950 | 1,37× |
| Transação concorrente | 130871 | 122902 | 0,94× |
| Dispatch em catálogo grande | 90543 | 235365 | 2,60× |
| Payload de script maior | 643479 | 818820 | 1,27× |

As duas rodadas anteriores ao refinamento mediram **3,42–3,68×** no dispatch
nativo, **1,98–2,48×** em scripts e **1,45–1,54×** na avaliação. A tabela usa a
reexecução do build refinado; todos os relatórios permanecem disponíveis.
Transações variaram de **−7,2%** a **+4,9%**, ficando em **−6,1%** no build refinado:
não há evidência de aceleração geral de transações. O runner e as métricas são
os mesmos da referência; dispatch não envia respostas nem executa rede.

A suíte adicional usa o mesmo runner para os builds das duas versões. Seus
números foram coletados na primeira implementação da 0.1.6, antes do refinamento
de música e flags:

| Cenário | 0.1.5 ops/s | 0.1.6 inicial, ops/s | Razão |
|---|---:|---:|---:|
| Mensagem comum ignorada | 727224 | 4779755 | 6,57× |
| Comando desconhecido ignorado | 565066 | 2262446 | 4,00× |
| Mensagem de bot ignorada | 1007243 | 10268073 | 10,19× |
| Dispatch com entrada simples de 4096 caracteres | 567 | 106062 | 187,09× |
| Dispatch com 4096 caracteres entre aspas | 4946 | 20372 | 4,12× |
| Dispatch com 4096 caracteres e apóstrofo | 460 | 8289 | 18,01× |
| Registro de catálogo, comandos/s | 27768 | 224929 | 8,10× |
| Leitura de uma chave em estado de 2000 chaves | 348 | 257377 | 740,45× |

As razões maiores são específicas dessas cargas: tokenização de texto simples
sem aspas/escapes e leitura de um valor sem copiar o restante do estado. Não
representam aceleração de todo comando, persistência em disco ou transferência
de áudio. O ganho de leitura pontual é de memória/JSON já carregado; SQLite
continua lendo e validando seu snapshot.

Relatórios brutos, incluindo todas as amostras, p95, heap/RSS e configurações:

- [Referência da suíte principal](../benchmarks/results/v0.1.6/runtime-0.1.5.json).
- [Suíte principal, rodada 1](../benchmarks/results/v0.1.6/runtime-0.1.6.json).
- [Suíte principal, rodada 2](../benchmarks/results/v0.1.6/runtime-0.1.6-repeat.json).
- [Suíte principal, build refinado](../benchmarks/results/v0.1.6/runtime-0.1.6-refined.json).
- [Referência das cargas adicionais](../benchmarks/results/v0.1.6/performance-0.1.5.json).
- [Cargas adicionais da 0.1.6](../benchmarks/results/v0.1.6/performance-0.1.6.json).

## Refinamento de música e flags

`npm run bench:refinement` exercita parsing de sete flags tipadas, dispatch com
essas flags, páginas de 25 faixas numa fila de 5000 e lotes de 32 buscas iguais
com signals independentes. O backend de busca é um fetch simulado, sem rede,
que devolve uma faixa após `setImmediate`. Cada chamada recebe sua própria cópia.

```sh
npm run build
node --expose-gc benchmarks/refinement.mjs --package-root /caminho/referencia --json > /tmp/refinement-baseline.json
node --expose-gc benchmarks/refinement.mjs --baseline /tmp/refinement-baseline.json --json > /tmp/refinement-current.json
```

Esta comparação usa a primeira implementação local da **0.1.6**, anterior ao
refinamento, como referência. O tarball original foi preservado localmente em
`artifacts/yuzuha-0.1.6-initial.tgz`; não é uma versão npm distinta. Ambos os lados
usam o mesmo runner, Node **26.11.1**, Ryzen 5 5625U, GC explícito e sete amostras.
Há 10000 operações por amostra em flags/dispatch, com 2000 de aquecimento, e
100 operações por amostra em música, com 100 de aquecimento. Os relatórios
registram SHA-256 dos módulos para distinguir os dois builds da mesma versão.

| Cenário | Primeira 0.1.6, ops/s | Refinada, rodada 1 | Refinada, rodada 2 | Com ponte de áudio | Razão |
|---|---:|---:|---:|---:|---:|
| Parsing de flags | 245078 | 361187 | 382458 | 362426 | 1,47–1,56× |
| Dispatch com flags | 65096 | 62084 | 90629 | 92253 | 0,95–1,42× |
| Página da fila | 82 | 18369 | 17767 | 18363 | 217–224× |
| Lote de buscas com signals | 553 | 3511 | 3368 | 3387 | 6,09–6,34× |

A referência pagina com `player.queue.slice(...)`, copiando a fila inteira;
`queuePage` copia só as 25 faixas solicitadas. O ganho depende da razão entre
tamanho da fila e da página, e não acelera a transmissão de áudio. No lote de
buscas, a contagem caiu de **32 para 1 requisição simulada**, ou **96,875% menos**,
mantendo cancelamento e cópias por chamada. Isso mede custo de cliente e deduplicação,
não latência de um servidor Lavalink real.

O parsing isolado melhorou nas três rodadas. O dispatch com flags variou de
−4,6% a +41,7%; não há ganho estável demonstrado nesse cenário completo.
As rodadas piloto de aquecimento menor também variaram e ficaram nos artefatos
locais; os números da tabela usam o aquecimento e os hashes registrados abaixo.

- [Primeira implementação da 0.1.6](../benchmarks/results/v0.1.6/refinement-initial.json).
- [Refinamento, rodada 1](../benchmarks/results/v0.1.6/refinement-final.json).
- [Refinamento, rodada 2](../benchmarks/results/v0.1.6/refinement-final-repeat.json).
- [Reexecução após a ponte de áudio](../benchmarks/results/v0.1.6/refinement-audio.json).

A última rodada usa o build com `FluxerLavalinkBridge`, mantendo as mesmas cargas
offline e uma requisição por lote de buscas. A integração de áudio real é uma
verificação funcional separada, descrita em [MUSIC.md](MUSIC.md); esses números
não medem qualidade ou latência do áudio.

## Série da 0.1.4

A comparação local da 0.1.4 reexecuta a 0.1.3 a partir do tarball anterior com o
mesmo runner e a mesma versão exata do Node, **26.11.1**. As séries antigas em
Node 26.8.2 permanecem históricas; trocar o runtime impede atribuir sua variação
à biblioteca.

`artifacts/benchmark-0.1.3-reference-0.1.4-long.json` contém a referência renovada;
`artifacts/benchmark-0.1.4-long.json` contém a versão atual e a comparação.
Ambas usam 10000 operações por amostra, sete amostras, concorrência 16,
1000 comandos, payload de 4096 caracteres e 20 rodadas de memória. Também foram
conservadas as séries padrão de 1000 operações, cujos resultados variaram mais.
Números e limitações estão em [VALIDATION.md](VALIDATION.md).
