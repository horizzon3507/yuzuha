# Yuzuha

Biblioteca TypeScript para bots do Fluxer; JavaScript ESM emitido em dist.

- Leia docs/PLAN.md e docs/PARITY.md antes de alterar arquitetura ou cobertura.
- Rode npm run check e npm run smoke:package para mudanças de pacote/CLI.
- Use npm run docs:generate após mudar metadados de funções.
- Scripts não executam eval e nunca reinterpretam dados do usuário como código.
- Guards, limites e PartialModerationError não podem ser engolidos por $try.
- Mudanças em moderação exigem testes de autor, bot, hierarquia e falha parcial.
- Testes usam MockTransport e stores temporários; não façam login ou ações reais.
- Paridade de exports nativos não equivale à cobertura por funções de script.
- Não publique releases, pacote npm ou bot sem instrução explícita do usuário.

## Organização

- `domain/` contém valores, tipos e regras; `ports/` define transporte e store.
- `services/` implementa autorização, moderação, casos e variáveis sobre os ports.
- `commands/` trata definições, argumentos e contexto; `scripting/` trata linguagem.
- `framework/` coordena execução; `infrastructure/` implementa Fluxer, JSON e SQLite.
- Builtins são registrados sob demanda, nunca no construtor de um bot nativo.
- `cli/` trata entrada, configuração, geração e ciclo de vida do processo.
- `src/index.ts` é a superfície nativa; `src/functions.ts` é a superfície do function mode.
- Arquivos públicos na raiz de `src/` são fachadas de compatibilidade.
- `npm run check:architecture` confere as dependências entre as camadas centrais.

## Contratos de integração

- Configs e comandos TS compartilham o loader para preservar identidade das classes públicas.
- `reload(dir)` preserva comandos manuais e de outros diretórios; `load(dir)` substitui todos.
- `destroy()` externo aguarda o encerramento; dentro de um handler, confirma o pedido e drena após o retorno.
- Stores fornecidos ao bot continuam sob responsabilidade do chamador; a CLI fecha os stores de sua config.
- Valide estado e copie o retorno antes de confirmar qualquer transação.
- Changelog usa Hory para bibliotecas: SemVer simples, títulos `vX.Y.Z`, sem `m` ou canais.
