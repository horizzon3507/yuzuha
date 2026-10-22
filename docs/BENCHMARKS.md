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

O comparador exige CPU, plataforma, arquitetura, versão principal do Node e
parâmetros iguais. Mantenha também a versão exata do Node e a carga de fundo ao
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
