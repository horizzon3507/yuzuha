# Editor e diagnóstico local

A extensão VS Code da 0.1.5 fornece autocomplete com argumentos em snippets,
hover, assinatura/argumento ativo e diagnósticos durante a edição. Reconhece arquivos
`.yz`/`.yuzuha` e strings JS/TS, incluindo JSX/TSX. Os metadados vêm do mesmo
registro usado pelo runtime e pela [referência de funções](FUNCTIONS.md).

## Usar a extensão

Na árvore da biblioteca:

```sh
npm run package:editor
code --install-extension artifacts/yuzuha-language-0.1.5.vsix
```

O primeiro comando usa `@vscode/vsce` pelo npm para empacotar localmente;
não publica no Marketplace. A instalação fica a cargo do usuário. O instalador
contém os auxiliares e o catálogo, sem depender de uma instalação global do Yuzuha.

Para experimentar a pasta distribuída com o pacote npm sem instalar:

```sh
code --extensionDevelopmentPath="$(npx yuzuha editor)" .
```

Digite `$` ou pressione `Ctrl+Space` para completar. `Ctrl+Shift+Space` abre
ajuda de parâmetros. O argumento ativo acompanha chamadas aninhadas,
separadores escapados e arrays JSON literais. Em JS/TS, use `String.raw`
quando precisar preservar escapes do script.

O editor aponta colchetes sem fechamento, funções desconhecidas e quantidade
inválida de argumentos. Atualiza o painel Problems ao abrir e editar arquivos;
remove os resultados ao corrigir ou fechar o documento. Durante chamadas
incompletas, aponta o fechamento ausente sem inventar erros de aridade.

Em JS/TS, a análise é lexical: lê strings, decodifica escapes e mantém as posições
do documento original; `String.raw` preserva os escapes do script. Comentários,
expressões regulares e código nativo ficam fora da análise. Templates com
`${expressão}` oferecem sugestões nos trechos estáticos, mas não recebem
diagnósticos de script, porque a interpolação pode alterar a sintaxe. Use strings
estáticas ou `yuzuha check` para validar o script final. Desative os diagnósticos
por workspace com `"yuzuha.diagnostics.enabled": false`.

O editor não executa callbacks nem conecta ao Fluxer. `yuzuha check` continua
validando os comandos e plugins carregados pelo projeto; não há servidor LSP.

## Funções de plugins

Adicione caminhos relativos ao workspace em `.vscode/settings.json`:

```json
{
  "yuzuha.functionCatalogs": ["tooling/minhas-funcoes.json"]
}
```

Cada arquivo contém somente metadados JSON:

```json
{
  "version": 1,
  "functions": [{
    "name": "saudar",
    "aliases": ["ola"],
    "usage": "$saudar[nome;saudação?]",
    "description": "Cumprimenta um membro.",
    "category": "meu-plugin",
    "minArgs": 1,
    "maxArgs": 2
  }]
}
```

Autocomplete, hover, assinaturas e diagnósticos usam o catálogo do workspace
correspondente. A extensão relê o JSON ao alterar, criar ou remover os arquivos.
JSON inválido, aridade inválida ou nomes/aliases duplicados geram um diagnóstico
de catálogo e preservam o último conjunto válido. Remover o caminho da configuração
remove suas funções do editor. Releituras antigas não substituem configurações novas.

Os arquivos são limitados a 2 MB, 5000 funções e 100 aliases por função; nomes
seguem `[A-Za-z_][A-Za-z_0-9]*` com até 64 caracteres e aridade de 0 a 1000.
Os caminhos devem ficar dentro do workspace. Campos desconhecidos, incluindo
`execute`, são rejeitados. A extensão não importa a configuração do bot nem
descobre plugins executando JS/TS. O catálogo deve acompanhar o registro real
fornecido pelo plugin.

## Auxiliares para outros editores

```ts
import { complete, hoverAt, signatureAt, documentDiagnostics,
  parseFunctionCatalog, mergeFunctionCatalogs } from 'yuzuha/tooling';
import { Runtime, registerBuiltins } from 'yuzuha/functions';

const metadata = registerBuiltins(new Runtime()).functions();
const source = '$math[1;+;';
const signature = signatureAt(source, source.length, metadata);
const suggestions = complete('$rep', 4, metadata);
const diagnostics = documentDiagnostics('$reply[', 'yuzuha', metadata);
const custom = parseFunctionCatalog('{"version":1,"functions":[]}');
const allMetadata = mergeFunctionCatalogs(metadata, custom);
```

Offsets são índices UTF-16, como nas APIs de texto do VS Code. Cada diagnóstico
tem `code`, `message`, `severity`, `start`, `end` e `range` com posições
`{ offset, line, column }`; linha/coluna começam em 1 e os intervalos terminam
antes do índice `end`. `diagnose` analisa um script; `documentDiagnostics` mapeia
scripts embutidos ao documento original. A análise limita scripts a 100000
caracteres, 64 níveis e 100 diagnósticos por script.

`scriptRegions` retorna os trechos de strings; `scriptRegion` localiza o trecho
no cursor e seu offset decodificado. Use `documentOffset(region, offset)` ao
converter um resultado de autocomplete/hover para o documento JS/TS original.
`hoverAt` resolve nomes e aliases. Os auxiliares consultam metadados e nunca
executam callbacks. `parseFunctionCatalog` valida e copia os metadados JSON;
`mergeFunctionCatalogs` copia os catálogos e rejeita colisões sem distinguir caixa.

## Doctor

```sh
npx yuzuha doctor ./yuzuha.config.ts
npx yuzuha doctor ./yuzuha.config.ts --json
```

Verifica Node, SDK fixado, config/comandos, nomes de permissões declaradas,
presença do token e acesso de leitura/escrita ao caminho do store ou ao ancestral
existente. Não cria diretórios nem abre o banco para escrita. Token ausente gera
aviso; falhas de config, SDK ou permissões declaradas resultam em saída `1`.

O token nunca aparece no relatório. `.env` é lido como dados, sem aplicar suas
variáveis ao processo. O diagnóstico não chama `login`, não testa concessões
remotas e não faz ações reais. Assim como `check`, importa config e plugins JS/TS
de confiança; código de inicialização desses módulos continua sendo código do usuário.

Rode `npm run docs:generate` após alterar metadados. `npm run check` confere
referência, catálogo gerado e tipos da extensão contra a API do VS Code.

## Usar o mesmo catálogo no editor e na CLI

```sh
yuzuha functions --catalog --config ./yuzuha.config.ts --plugins-only > tooling/plugins.json
yuzuha lint ./commands --catalog tooling/plugins.json --json
```

Configure `"yuzuha.functionCatalogs": ["tooling/plugins.json"]` para compartilhar
os mesmos metadados. `--plugins-only` evita repetir builtins já conhecidos pelo
editor e pelo lint. A exportação importa somente a config/setup explícita de
confiança, sem carregar seu diretório de comandos; o lint lê os arquivos como
texto e não importa config. O formato e os limites são os mesmos dos catálogos
adicionados manualmente. Consulte [CLI.md](CLI.md) para o runner de cenários
JSON e o formato dos diagnósticos usados em CI.
