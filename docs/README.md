# Documentação do Yuzuha

Referência da versão **0.1.4**, em JavaScript ESM e TypeScript, para Node >=22.13.

Ferramentas: [CLI e cenários offline](CLI.md), [editor e catálogos](EDITOR.md)
e [benchmarks reproduzíveis](BENCHMARKS.md).
O pacote usa `@fluxerjs/core` 3.3.0. O guia inicial cobre instalação pelo npm e
uso de uma cópia local. Exemplos de testes e validação não conectam ao Fluxer.

O caminho principal é JS/TS. Function mode (`$...`) é opcional e vive em
`yuzuha/functions`.

## Começar

1. Siga o [guia inicial JS/TS](QUICKSTART.md) para gerar um bot.
2. Aprenda comandos, eventos e plugins no [guia nativo](NATIVE.md).
3. Só se precisar de scripts, leia [function mode](LANGUAGE.md) e a
   [referência de funções](FUNCTIONS.md).
4. Use a [CLI](CLI.md) para validar e desenvolver sem editar o núcleo.

## Integrar

| Tema | Conteúdo |
|---|---|
| [JS/TS nativo](NATIVE.md) | Argumentos inferidos, contexto, moderação, dados, eventos e plugins |
| [Framework](FRAMEWORK.md) | Registro de comandos, contexto, plugins, middleware e function mode |
| [API pública](API.md) | Entrypoints, opções, métodos, contratos e erros |
| [Function mode](LANGUAGE.md) | Sintaxe, funções, escopo e limites dos scripts |
| [Referência de funções](FUNCTIONS.md) | Assinaturas geradas do registro executável |
| [Funções ausentes](FUNCTION-GAPS.md) | Inventário auditado, propostas de wrappers e limites de cobertura |
| [Estado e execução](STORAGE.md) | JSON/SQLite, transações, fechamento, limites e falhas parciais |
| [Eventos de scripts](EVENTS.md) | Payloads, contexto, guards e ciclo de vida |
| [Agendamentos](SCHEDULER.md) | Cron, fusos, concorrência, atrasos e retry |
| [HTTP](HTTP.md) | Streaming, multipart, cancelamento e políticas por comando |
| [Logs e correlação](OBSERVABILITY.md) | Eventos estruturados opcionais, duração, erros e privacidade |
| [Cobertura](PARITY.md) | Acesso ao SDK e diferenças em relação ao ForgeScript |

## Manter

| Tema | Conteúdo |
|---|---|
| [Arquitetura](ARCHITECTURE.md) | Camadas, entrypoints e fluxo de mensagens |
| [Testes](TESTING.md) | Mocks, consumidores e reprodução |
| [Problemas comuns](TROUBLESHOOTING.md) | Sintaxe, token, estado e recarga |
| [Plano](PLAN.md) | Objetivos, decisões e critérios de aceite |
| [Validação](VALIDATION.md) | Evidência executada e limites offline |
| [Contribuição](../CONTRIBUTING.md) | Onde mudar código e verificações |
| [Versões](../VERSIONING.md) | SemVer, Hory e procedimento local |
| [Changelog](../CHANGELOG.md) | Histórico por versão |

Os exemplos usam imports públicos de `yuzuha`, `yuzuha/functions`, `yuzuha/sdk` e
`yuzuha/testing`. Caminhos em `src/` explicam a implementação e não são subpaths
novos do pacote.
