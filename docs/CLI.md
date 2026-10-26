# Referência da CLI

A CLI é distribuída com a biblioteca. Após instalar o pacote em um bot,
use `npx yuzuha` ou os scripts do scaffold. Na árvore da biblioteca, compile
e execute `node dist/cli.js` na raiz do repositório.

## Comandos

| Comando | Comportamento |
|---|---|
| `yuzuha`, `yuzuha help` ou `yuzuha --help` | Mostra ajuda |
| `yuzuha --version` | Mostra a versão do manifest |
| `yuzuha init <diretório> [--js \| --ts] [--functions] [--local] [--template nome]` | Cria um projeto em pasta nova; TS por padrão |
| `yuzuha templates [--json]` | Lista nomes, descrições e comandos das bases |
| `yuzuha check [config ou diretório] [--json]` | Importa e valida sem login |
| `yuzuha functions [--json] [--category nome] [--search termo]` | Lista e busca assinaturas e descrições |
| `yuzuha functions --catalog [--config arquivo] [--plugins-only]` | Exporta metadados JSON |
| `yuzuha lint <arquivo ou diretório> [--json] [--catalog arquivo]` | Diagnóstico de texto sem imports |
| `yuzuha test <cenários.json> [--json]` | Compara comandos/scripts em mocks offline |
| `yuzuha data <stats/cleanup/backup/restore> <store> [opções]` | Manutenção e backup sem config |
| `yuzuha doctor [config] [--json]` | Diagnóstico offline, sem exibir token |
| `yuzuha editor` | Caminho da extensão VS Code incluída no pacote |
| `yuzuha run [config]` | Carrega ambiente, config e comandos e conecta |
| `yuzuha dev [config]` | Executa com recarga dos arquivos de comando |

Opções desconhecidas, repetidas, argumentos extras ou `--js --ts` juntos
são erros. `--functions` acrescenta um comando de exemplo em `yuzuha/functions`;
os demais comandos do scaffold são nativos. Não há instalação automática de
dependências em `init`.

## Descoberta da config

Sem caminho explícito, a ordem é `yuzuha.config.ts`, `yuzuha.config.js`,
`yuzuha.config.mjs`, no diretório atual. Outros nomes precisam ser informados:

```sh
yuzuha check ./config/bot.ts
yuzuha run ./config/bot.ts
```

O campo `commands` é resolvido a partir da pasta dessa config. O `setup(bot)`
roda antes de carregar o diretório, permitindo registrar plugins, eventos e funções usadas em
function mode e comandos manuais. Os comandos da pasta são adicionados ao conjunto
de `setup`; colisões recusam a carga.

`run` e `dev` leem o `.env` da pasta da config. Valores existentes no ambiente
do processo têm prioridade. `check` não carrega esse arquivo automaticamente.

## Validação e JSON

```sh
yuzuha check ./yuzuha.config.ts --json
yuzuha check ./commands --json
```

Sucesso produz um objeto na saída padrão:

```json
{
  "valid": true,
  "version": "0.1.7",
  "commands": [
    {
      "name": "ping",
      "description": "Responde com a latência.",
      "usage": "!ping",
      "args": [],
      "flags": [],
      "examples": [],
      "subcommands": []
    }
  ]
}
```

`aliases` e `description` aparecem quando definidos pelo comando. O exemplo
acima ilustra o formato, não o número de comandos da config incluída no repo.
`args` e `flags` expõem nome, tipo, obrigatoriedade, aliases, descrição, escolhas,
valor padrão e limites definidos. Validadores e outros callbacks são omitidos.
`subcommands` usa o mesmo formato recursivamente; `usage` contém o caminho
completo. O prefixo vem da configuração estática; para uma função de prefixo,
o catálogo usa `!` sem executar a função.

Falha usa código de saída `1` e escreve em stderr:

```json
{
  "valid": false,
  "code": "UNKNOWN_FUNCTION",
  "message": "..."
}
```

O campo `message` é uma mensagem de diagnóstico, podendo incluir linha, coluna
e trecho do script. Não analise a sua redação; prefira `valid` e `code`.
Logs emitidos pela própria config, por plugins ou comandos no momento do import
continuam sendo responsabilidade desses módulos e podem misturar-se à saída.

Ao validar só uma pasta, o bot usa apenas funções internas. Se seus scripts
dependem de funções de plugin, valide a config que registra esse plugin.

`check` verifica nomes/aliases, definições, permissões e scripts. Não executa
os comandos, não faz typecheck TS e não comprova token ou permissões remotas.
Config e módulos importados são código confiável e podem executar efeitos.

## Consultar funções

```sh
yuzuha functions --category moderation
yuzuha functions --category storage --json
yuzuha functions --search mensagem
yuzuha functions --search reply --category messages
yuzuha functions --search '$nickname' --json
```

Categorias internas: `context`, `flow`, `guards`, `values`, `messages`, `embeds`,
`moderation` e `storage`. O filtro é exato. Categoria inexistente produz erro e
informa as disponíveis.

`--search <termo>` procura trechos nos nomes, aliases e descrições, ignorando
maiúsculas e minúsculas. Espaços nas extremidades e um `$` inicial são removidos;
a comparação preserva acentos, sem busca aproximada. Use aspas simples ao passar
`$` pelo shell. A ordem do catálogo é mantida. O filtro combina com `--category`,
`--json`, `--catalog` e as opções existentes de plugins, respeitando suas restrições.

Sem resultados, o modo textual mostra `Nenhuma função encontrada.`; `--json`
retorna `[]` e `--catalog` retorna `{ "version": 1, "functions": [] }`, sempre
com código de saída `0`. Valor ausente, vazio ou repetição de `--search` produz
erro `USAGE`. Categoria desconhecida continua produzindo `CATEGORY`, mesmo
quando a busca não encontra funções.

A listagem usa o registro interno, sem carregar config ou plugins. Em JSON,
cada função inclui `name`, `aliases` quando presentes, `category`, `description`,
`usage`, `minArgs` e `maxArgs`. A função executável não é serializada.

## Modo de desenvolvimento

O watcher observa arquivos `.js`, `.mjs`, `.cjs`, `.ts` e `.mts` de comandos
recursivamente, ignorando declarações `.d.ts`. Eventos próximos são agrupados
antes de recarregar. Recargas são serializadas.

Uma carga inválida é recusada e a versão anterior continua ativa.
Uma carga válida substitui somente os comandos daquela pasta; comandos manuais
e de `setup` permanecem registrados.

Config, ambiente e plugins não são recarregados. Alterações em dependências
importadas também podem exigir reinício, pois não há invalidação geral do cache
ESM. Reimporte módulos sem efeitos de inicialização desnecessários.

`SIGINT` e `SIGTERM` fecham o watcher, aguardam comandos em execução, encerram
o client e fecham o store da config. O encerramento usa o mesmo contrato de
propriedade descrito em [STORAGE.md](STORAGE.md).

## Gerar JavaScript ou TypeScript

```sh
yuzuha init ./meu-bot-js --js
yuzuha init ./meu-bot-ts --ts
```

A pasta deve ser nova. O scaffold inclui três comandos, config, `.env.example`,
`.gitignore`, scripts de execução e `test/hello.test.js` ou `.ts` com `npm test`.
TS inclui `tsconfig.json`, dependências de tipos e `tsx` para os testes;
o JS roda como ESM diretamente no Node.

Por padrão, a dependência usa `^0.1.7` do npm. A opção `--local` troca essa
dependência por `file:` apontando para a instalação que gerou o scaffold.
Use `--local` para desenvolver a biblioteca; compartilhe projetos com a
dependência npm. Instale as dependências antes de executar `npm test`. Veja
[QUICKSTART.md](QUICKSTART.md).

## Bases de bots

Na árvore compilada, liste as opções e gere uma pasta nova:

```sh
node dist/cli.js templates
node dist/cli.js templates --json
node dist/cli.js init ../bot-comunidade --template community --ts --local
```

Bases: `simple`, `multifunctional`, `moderation`, `community`, `economy`,
`entertainment` e `utility`. Cada uma aceita `--js`, `--ts`, `--functions`
e `--local`. A multifuncional reúne todos os conjuntos: 24 arquivos de comandos,
com subcomandos de regras, sugestões, enquetes e notas. As bases incluem embeds,
README com exemplos e testes offline próprios.

`templates` não importa configuração nem conecta. Em JSON, retorna uma lista
com `name`, `description` e `commands` (caminhos dos comandos raiz).
Sem `--template`, `init` mantém o scaffold original com `ping`, `hello` e `ban`.
As opções novas dependem desta árvore compilada até a próxima publicação.
Consulte comandos, limites e permissões em [BOT-BASES.md](BOT-BASES.md).

## Lint sem imports

```sh
yuzuha lint ./commands --json
yuzuha lint ./scripts/boas-vindas.yz --catalog ./tooling/plugins.json
```

`lint` analisa somente texto: arquivos `.yz`/`.yuzuha` e strings estáticas de
JS/TS, MJS/CJS, MTS/CTS e JSX/TSX. Nunca importa os alvos, configs ou catálogos.
Compartilha diagnósticos com o editor: sintaxe, função desconhecida, aridade e
limite de fonte. Não é um typechecker JS/TS. Templates dinâmicos seguem a
limitação lexical descrita em [EDITOR.md](EDITOR.md).

`--catalog caminho` pode aparecer até 16 vezes para acrescentar metadados de
plugins. Duplicações de nomes/aliases, inclusive com builtins, são recusadas.
Diretórios são percorridos sem seguir symlinks; `node_modules`, `.git`, `dist`,
`coverage`, `artifacts` e declarações `.d.ts`/`.d.mts`/`.d.cts` são ignorados.
Limites: 1000 arquivos, 2 MB por arquivo, 20 MB totais, 32 níveis de diretório e
10000 diagnósticos. Cada diretório aceita até 10000 entradas.

Em JSON, retorna `{ valid, offline: true, files, diagnostics }`; cada diagnóstico
inclui `file`, `code`, `message`, offsets e `range` com linha/coluna 1-based.
Diagnósticos resultam em código de saída `1` e relatório em stdout; erros de
entrada/catálogo usam stderr. Nenhuma função do catálogo é executada.

## Exportar catálogos

```sh
yuzuha functions --catalog > funcoes-completas.json
yuzuha functions --catalog --config ./yuzuha.config.ts --plugins-only > tooling/plugins.json
```

`--catalog` produz `{ version: 1, functions: [...] }`. Sem config, contém apenas
builtins. `--config` precisa ser explícito e importa config/setup de confiança,
sem ler `.env`, carregar o diretório de comandos ou fazer login. Não procura
config automaticamente nessa operação. Funções não são chamadas para gerar
metadados, mas o código de inicialização da config/plugin continua executável.
`--category` filtra antes da exportação.

`--plugins-only` exige `--catalog` e `--config` e remove funções internas pelo
nome canônico, preservando funções personalizadas de qualquer categoria. Use
essa opção ao fornecer o catálogo como complemento para o editor ou `lint`,
que já conhecem as funções internas. `execute` nunca é exportado. Os campos
continuam precisando respeitar o contrato de catálogo do editor.

## Cenários de comandos offline

```sh
yuzuha test ./test/cenarios.json --json
```

O arquivo é JSON com `version: 1` e `scenarios`. Exemplo completo:

```json
{
  "version": 1,
  "scenarios": [{
    "name": "resposta e autorização",
    "commands": [
      { "name": "ping", "code": "$reply[Pong]" },
      { "name": "ban", "code": "$ban[2;motivo]" }
    ],
    "members": [
      { "guildID": "100", "id": "1", "owner": false, "permissions": [], "rank": 10 }
    ],
    "messages": [
      { "content": "!ping", "expect": { "outcome": "success", "responses": ["Pong"] } },
      { "content": "!ban", "expect": { "outcome": "guarded", "actions": [], "errorCodes": [] } }
    ]
  }]
}
```

Cada cenário cria `MockTransport`, `MemoryStore` e recursos simulados novos;
mensagens do mesmo cenário compartilham estado. HTTP e scheduler ficam
desativados; recursos não configurados falham localmente. Não há imports,
`eval`, login, armazenamento persistente ou ações reais a partir desse JSON.
Scripts usam somente o interpretador limitado do Yuzuha.

Campos opcionais do cenário: `prefix` (padrão `!`) e `members`. Cada comando
aceita `name`, `code`, `aliases`, `permissions`, `botPermissions` e `guildOnly`.
Membros declaram `guildID`, `id`, `permissions` por nome e `rank`; `owner` é
`false` quando omitido e `topRoleID` é opcional. As entradas substituem membros
do mock: por padrão, servidor `100` tem autor `1` dono, bot `999` administrador
com rank 90 e alvo `2` com rank 1. Configure o autor explicitamente ao testar
negação de permissão.

Mensagens aceitam `content`, `authorID`, `channelID`, `guildID` e `mentions`.
Os padrões são autor `1`, canal `200` e servidor `100`; `guildID: null` simula DM.
`expect.outcome` é obrigatório: `success`, `guarded`, `error` ou `ignored`.
`responses`, `errorCodes` e `actions` são opcionais; quando presentes, precisam
corresponder exatamente aos arrays observados nessa mensagem. `responses`
contém conteúdo textual de envios/replies em ordem; não confere embeds/anexos.
`actions` contém pares `{ action, targetID }` de moderação. `errorCodes` registra
os códigos recebidos por `onError`: guards não entram nesse hook e erros de
função podem aparecer encapsulados como `FUNCTION_ERROR`.

Limites por arquivo: 5 MB, 100 cenários com nomes distintos, 50 comandos e 100
mensagens por cenário, 1000 mensagens totais e 100 membros por cenário.
Cada script/mensagem tem no máximo 100000 caracteres; o runtime usa prazo
cooperativo de 1 s, 10000 chamadas e saída de 100000 caracteres por execução.
Campos desconhecidos, `run` e código JS embutido são recusados.

O relatório JSON inclui `valid`, `offline` e resultados por cenário/mensagem,
com valores observados e nomes dos campos divergentes em `mismatches`. Uma
expectativa divergente resulta em saída `1`; não interrompe as outras mensagens.
Falhas de schema/compilação usam o diagnóstico da CLI em stderr.

## Manutenção de estado pela CLI

```sh
yuzuha data stats ./state.sqlite --json
yuzuha data cleanup ./state.sqlite --limit 100 --json
yuzuha data backup ./state.sqlite --file ./backup.json
yuzuha data restore ./state.sqlite --file ./backup.json --policy merge --json
yuzuha data restore ./state.sqlite --file ./backup.json --policy merge --apply
```

O caminho do store deve existir e terminar em `.json`, `.sqlite` ou `.db`.
Esses comandos não importam config. As saídas são JSON, inclusive sem `--json`.
`stats` lê estatísticas; `cleanup` confirma um lote limitado de remoções e aceita
`--cursor` com a chave devolvida no lote anterior. `backup` escreve o envelope em
stdout ou cria o arquivo de `--file` com modo `0600`, recusando sobrescrevê-lo.

`restore` exige `--file` e simula por padrão; somente `--apply` confirma a
restauração. `--policy` aceita `replace` (padrão) ou `merge`. Backups de entrada
são limitados a 50 MB. SQLite usa conexão somente leitura para estatísticas,
backup e simulação; essas operações não inicializam tabelas nem gravam estado.
Pare e aguarde os processos escritores antes de restaurar. Validação, conflitos,
claims ativas e regras de merge estão em [STORAGE.md](STORAGE.md).
