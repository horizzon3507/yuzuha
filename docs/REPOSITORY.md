# Trabalhar no repositório

O repositório contém a biblioteca npm Yuzuha, sua CLI, exemplos e ferramentas.
Node >=22.13 executa o runtime, os testes e os scripts de build; npm gerencia
as dependências com `package-lock.json`.

## Diretórios

| Diretório | Responsabilidade |
|---|---|
| `src` | Biblioteca TypeScript, entrypoints e CLI |
| `test` | Testes offline e fixtures temporárias |
| `docs` | Guias Markdown, contratos e metadados da documentação |
| `examples` | Bots e comandos de exemplo |
| `scripts` | Build, geração de referência e verificações do pacote |
| `editors/vscode` | Extensão e catálogo para o editor |
| `bridges/lavalink` | Plugin de áudio e integração local |
| `benchmarks` | Cargas reproduzíveis e resultados registrados |
| `dist` | JavaScript ESM e declarações gerados pelo build |

## Preparar e verificar

Execute na raiz:

```sh
npm ci
npm run check
npm run smoke:package
```

`npm ci` instala a árvore fixada em `package-lock.json`. Ao alterar uma
dependência, use `npm install`, revise as mudanças no manifest e no lockfile
e confira novamente a instalação com `npm ci`.

Para compilar e experimentar a CLI local:

```sh
npm run build
node dist/cli.js --help
node dist/cli.js init ../meu-bot --ts --local
```

O scaffold com `--local` depende dessa cópia da biblioteca. A instalação npm
padrão e os exemplos de consumidor estão no [guia inicial](QUICKSTART.md).

## Editar a documentação

Edite os guias em `docs/`. A referência de funções em `docs/FUNCTIONS.md` e o
catálogo do editor são gerados a partir dos metadados dos builtins:

```sh
npm run docs:generate
npm run check:docs
```

Os testes usam mocks e stores temporários, sem login nem ações reais. Veja
[testes e validação](TESTING.md) e o [guia de contribuição](../CONTRIBUTING.md)
para os contratos que uma mudança precisa preservar.

## Inspecionar o pacote

```sh
npm pack --dry-run
npm run smoke:package
```

O smoke instala o tarball em consumidores temporários para verificar imports,
tipos e CLI. Build, checks e inspeção local não publicam o pacote nem criam
releases. A [política de versões](../VERSIONING.md) define a preparação de uma
publicação.
