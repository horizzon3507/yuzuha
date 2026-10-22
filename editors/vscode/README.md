# Yuzuha para VS Code

Autocomplete, snippets, hover, ajuda de assinatura e diagnósticos do function
mode em `.yz`/`.yuzuha` e strings JavaScript/TypeScript, incluindo JSX/TSX.
O catálogo interno é gerado do registro da biblioteca.

A extensão aponta sintaxe inválida, funções desconhecidas e quantidade de
argumentos. Os resultados acompanham a edição e são removidos ao corrigir ou
fechar o arquivo. Ela não conecta um bot, não importa configurações JS/TS e não
executa scripts ou funções de plugins.

Na árvore do Yuzuha, gere o instalador com `npm run package:editor` e instale o
arquivo `.vsix` em **Extensions: Install from VSIX…**. Esse comando empacota
localmente; não publica no Marketplace.

Para experimentar a pasta incluída no pacote npm:

```sh
code --extensionDevelopmentPath="$(npx yuzuha editor)" .
```

Digite `$` para sugestões ou use `Ctrl+Space`; `Ctrl+Shift+Space` abre ajuda de
parâmetros. A assinatura acompanha chamadas aninhadas e separadores escapados.
Em JS/TS, `String.raw` preserva os escapes do script. Templates com interpolação
JS oferecem sugestões nos trechos estáticos; a análise de erros fica para o
script final, pois a interpolação pode mudar sua sintaxe.

Para incluir funções de plugins, adicione caminhos JSON relativos ao workspace:

```json
{
  "yuzuha.functionCatalogs": ["tooling/funcoes.json"],
  "yuzuha.diagnostics.enabled": true
}
```

Formato do catálogo:

```json
{
  "version": 1,
  "functions": [{
    "name": "saudar",
    "aliases": ["ola"],
    "usage": "$saudar[nome]",
    "description": "Cumprimenta um membro.",
    "category": "meu-plugin",
    "minArgs": 1,
    "maxArgs": 1
  }]
}
```

A extensão recarrega os arquivos ao alterá-los. Dados inválidos ou nomes/aliases
duplicados aparecem como erros de catálogo; o último conjunto válido continua
ativo até a correção. Remover um caminho da configuração remove suas funções.
Campos executáveis e caminhos fora do workspace são rejeitados. Cada JSON tem
limite de 2 MB e 5000 funções. O catálogo fornece dados ao editor e deve acompanhar
as funções registradas pelo plugin. Não é um servidor LSP.
