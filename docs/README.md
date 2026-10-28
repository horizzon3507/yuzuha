# Documentação da Yuzuha

Esta documentação cobre a Yuzuha 0.1.8, em JavaScript ESM e TypeScript, para
Node >=22.13. O pacote usa `@fluxerjs/core` 3.3.0.

JS/TS é o caminho principal da biblioteca. Function mode (`$...`) é opcional e
fica em `yuzuha/functions`. O guia inicial explica tanto a instalação pelo npm
quanto o uso de uma cópia local. Os exemplos de testes e validação não se
conectam ao Fluxer.

## Escolha por onde começar

| Objetivo | Caminho recomendado |
|---|---|
| Criar o primeiro bot | [Instale e gere o projeto](QUICKSTART.md), depois [crie e teste o comando `!hello`](tutorials/FIRST-COMMAND.md) |
| Programar com a API nativa | Aprenda [comandos, eventos e plugins em JS/TS](NATIVE.md) e consulte os [contratos da API pública](API.md) |
| Escrever comandos em function mode | [Crie o primeiro script](tutorials/FUNCTION-MODE.md) e consulte a [sintaxe e as regras de avaliação](LANGUAGE.md) |
| Consultar referências | Use a [referência da API pública](API.md), o [catálogo de funções](FUNCTIONS.md) e a [referência da CLI](CLI.md) |

## Desenvolver e integrar

| Tema | Conteúdo |
|---|---|
| [Guia nativo JS/TS](NATIVE.md) | Argumentos inferidos, contexto, moderação, dados, eventos e plugins |
| [Framework](FRAMEWORK.md) | Registro de comandos, contexto, plugins, middleware e function mode |
| [API pública](API.md) | Entrypoints, opções, métodos, contratos e erros |
| [Function mode](LANGUAGE.md) | Sintaxe, funções, escopo e limites dos scripts |
| [Referência de funções](FUNCTIONS.md) | Assinaturas geradas do registro executável |
| [Funções ausentes](FUNCTION-GAPS.md) | Inventário auditado, propostas de wrappers e limites de cobertura |
| [Contador e dados por escopo](tutorials/DATA.md) | Incrementos atômicos, leitura, escrita, TTL e escolha do store |
| [Estado e execução](STORAGE.md) | JSON/SQLite, transações, fechamento, limites e falhas parciais |
| [Eventos de scripts](EVENTS.md) | Payloads, contexto, guards e ciclo de vida |
| [Agendamentos](SCHEDULER.md) | Cron, fusos, concorrência, atrasos e retry |
| [HTTP](HTTP.md) | Streaming, multipart, cancelamento e políticas por comando |
| [Música e voz](MUSIC.md) | Lavalink v4, plugin e ponte de áudio para Fluxer, filas e recuperação |
| [Logs e correlação](OBSERVABILITY.md) | Eventos estruturados opcionais, duração, erros e privacidade |
| [Cobertura](PARITY.md) | Acesso ao SDK, contratos do function mode e limites |

## Testar e diagnosticar

| Tema | Conteúdo |
|---|---|
| [Teste de um comando](tutorials/TESTING.md) | Fixture offline, respostas, guards, relógio e serviços externos |
| [Testes e validação do pacote](TESTING.md) | Mocks, consumidores e reprodução da suíte |
| [CLI e cenários offline](CLI.md) | Validação, desenvolvimento, diagnóstico e cenários sem login |
| [Problemas comuns](TROUBLESHOOTING.md) | Sintaxe, token, estado e recarga |

## Usar as ferramentas do projeto

| Tema | Conteúdo |
|---|---|
| [Editor e catálogos](EDITOR.md) | Diagnóstico no editor e metadados das funções |
| [Benchmarks reproduzíveis](BENCHMARKS.md) | Medições e comparações com procedimentos reproduzíveis |
| [Organização do repositório](REPOSITORY.md) | Instalação, diretórios e inspeção do pacote |
| [Arquitetura](ARCHITECTURE.md) | Camadas, entrypoints e fluxo de mensagens |
| [Plano](PLAN.md) | Objetivos, decisões e critérios de aceite |
| [Validação](VALIDATION.md) | Evidência executada e limites offline |
| [Contribuição](../CONTRIBUTING.md) | Onde mudar código e quais verificações executar |
| [Versões](../VERSIONING.md) | SemVer, Hory e procedimento local |
| [Changelog](../CHANGELOG.md) | Histórico por versão |

Os exemplos usam imports públicos de `yuzuha`, `yuzuha/functions`, `yuzuha/sdk` e
`yuzuha/testing`. Caminhos em `src/` aparecem para explicar a implementação e
não são subpaths novos do pacote.

Consulte também os guias de [loops, regex e decimais](LANGUAGE-EXTENSIONS.md),
[imagens e streams de anexos](IMAGES.md) e
[integrações e sharding](INTEGRATIONS.md).

As sete bases JS/TS da CLI, seus comandos e testes estão em [BOT-BASES.md](BOT-BASES.md).
