# Contribuir com o Yuzuha

Use Node >=22.13. Instale a árvore fixada com `npm ci`. O projeto usa
TypeScript estrito, saída ESM e declarações de tipos, sem servidor próprio.

## Preparar e verificar

```sh
npm ci
npm run check
npm run smoke:package
```

Consulte [TESTING.md](docs/TESTING.md) para o alcance das verificações.
O smoke instala consumidores temporários e precisa acessar o registry npm.
Não use tokens ou dados reais nos testes de automação.

## Escolher o módulo

Leia o [mapa da arquitetura](docs/ARCHITECTURE.md) antes de mover regras.

- Domínio guarda dados e regras puras.
- Ports definem o que os serviços precisam de transporte e persistência.
- Serviços concentram autorização, moderação, casos e variáveis.
- Comandos e scripting usam esses serviços.
- Framework compõe registro, despacho e ciclo de vida.
- Infrastructure traduz para SDK e disco.
- CLI configura e executa; não duplica regras do núcleo.

Evite concentrar comportamento nos arquivos de reexport da raiz. Imports públicos
dos consumidores continuam em `yuzuha`, `yuzuha/functions`, `yuzuha/sdk` e
`yuzuha/testing`.

`src/index.ts` é a superfície nativa e não deve exportar parser, evaluator,
`Runtime` ou `registerBuiltins`. Esses símbolos pertencem a `src/functions.ts`.
O function mode é ativado sob demanda; não volte a registrar builtins no
construtor do bot.

## Nova função de script

1. Acrescente a função na categoria adequada em `src/scripting/builtins/`.
2. Declare nome, descrição, categoria, assinatura e aridade.
3. Use `call.arg` para preservar valores tipados e `call.text` para texto.
4. Avalie somente os argumentos necessários; não quebre funções lazy.
5. Reuse contexto/serviços para regras de permissão, moderação e estado.
6. Adicione teste do comportamento quando houver regra ou efeito.
7. Execute `npm run docs:generate` e confira a referência.

Não edite `docs/FUNCTIONS.md` manualmente. O check detecta divergência em relação
ao registro. Uma mudança de assinatura também pede atualização de exemplos e da documentação
de function mode.

## Alterar persistência ou SDK

Stores devem preservar snapshots isolados, callbacks síncronos, validação antes
do commit e rollback quando falham. Não reinicialize dados corrompidos silenciosamente.
Mudanças de schema precisam de plano de migração e testes com backups.

Ao atualizar `@fluxerjs/core`, fixe a nova versão, revise
[PARITY.md](docs/PARITY.md) e execute os testes do adaptador e do pacote instalado.
Acesso ao SDK não implica cobertura equivalente de funções de script.

## Documentação e compatibilidade

Documente comportamento observável, exemplos executáveis e limitações concretas.
Diferencie validação offline de operação no Fluxer real. Não descreva trabalho
planejado como implementado.

Use a [política de versões](VERSIONING.md) e acrescente mudanças ao
[CHANGELOG.md](CHANGELOG.md). A série 0.x ainda evolui, mas correções patch
preservam imports e comandos documentados. Versão desta atualização: **0.1.0**.

## Antes de enviar

Confira `npm run check`, o teste de consumidor quando houver impacto no pacote,
a referência gerada e o diff. Remova arquivos temporários e não inclua `.env`,
bancos, tokens ou `node_modules`. Descreva o problema, o comportamento resultante
e as verificações executadas.

Criar tags e publicar pacotes são operações separadas. Este fluxo local não
publica nada automaticamente.
