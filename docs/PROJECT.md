# O projeto Yuzuha

Yuzuha é uma biblioteca independente para criar bots do Fluxer em JavaScript e
TypeScript. Usa o client do Fluxer.js e acrescenta comandos, contexto, serviços,
persistência e ferramentas de teste. A licença é MIT.

## Como a documentação está organizada

- **Yuzuha:** instalação, comandos nativos, recursos, música, testes e ferramentas.
- **Funções:** linguagem opcional de scripts, eventos e referência individual dos builtins.
- **Projeto:** arquitetura, contribuição, organização do repositório, cobertura, versões e evidências.

## O que é compatibilidade

Reexportar o SDK completo não significa que cada método tem uma função `$...`.
A [matriz de compatibilidade](PARITY.md) separa acesso nativo, wrappers de script
e limitações conhecidas. Os sete entrypoints públicos fazem parte do contrato;
deep imports da organização interna não recebem a mesma garantia.

## Como contribuir

Use a [organização do repositório](REPOSITORY.md) para preparar a biblioteca e o
[guia de contribuição](../CONTRIBUTING.md) para mudar código da biblioteca.
As camadas e o fluxo de execução estão em [arquitetura](ARCHITECTURE.md).
O [plano](PLAN.md) registra decisões e critérios de aceite.

## Como avaliar uma entrega

Consulte [validação](VALIDATION.md) para checks executados e seus limites.
[Benchmarks](BENCHMARKS.md) informam a máquina, o runtime, as cargas e as
referências usadas. Testes com mocks não comprovam integração ao vivo.

O [changelog](../CHANGELOG.md) conserva o histórico e a
[política de versões](../VERSIONING.md) define SemVer simples para a biblioteca.
Preparar uma versão local não publica o pacote, uma tag ou uma release.
