# Function mode: linguagem de scripts

O function mode é opcional. Importe `script` de `yuzuha/functions` ou registre
um comando com `code`; o runtime é ativado sob demanda. Comandos nativos não
usam esta linguagem.

## Sintaxe

```text
$reply[Olá, $username!]
```

Funções começam com `$`, usam nomes sem espaços e recebem argumentos entre `[` e
`]`. `;` separa argumentos. Nomes de funções não distinguem maiúsculas/minúsculas;
nomes de variáveis distinguem. Uma função sem argumentos pode omitir colchetes.
`$reply[]` é inválido porque não contém argumento.

```text
$reply[$uppercase[$username]]
```

Escape caracteres literais com `\$`, `\[`, `\]`, `\;` ou `\\`. Colchetes
balanceados dentro de um argumento também são aceitos literalmente, o que permite
passar JSON sem escapar cada nível:

```text
$httpJson[POST;https://exemplo.com;[1,2,3]]
```

Aspas não são delimitadores especiais na linguagem; para textos com `;` é
necessário escapar. No JS/TS, use `String.raw` para preservar os escapes:

```ts
const code = String.raw`$reply[Preço: \$10\; opções: \[A\] e \[B\]]`;
```

## Execução e valores

As chamadas são executadas na ordem do texto, de cima para baixo e da esquerda
para a direita. Cada argumento é avaliado no máximo uma vez por chamada. Funções
que realizam ações normalmente retornam texto vazio; `$sendMessage` retorna um ID.

Uma expressão isolada preserva o valor tipado: booleano, número ou objeto.
Interpolação em texto converte para string. Objetos isolados entre espaços e
quebras de linha também preservam o tipo, para permitir embeds multilinha.
Propriedades de objetos são lidas com `$prop[objeto;nome]`; a sintaxe `.id` depois
de `$get[...]` é texto literal, não acesso a propriedade.

```text
$let[total;$math[2;+;3]]
$reply[Total: $get[total]]
```

Texto literal restante no nível principal vira uma resposta automática ao final.
Espaços e quebras de linha no início/fim dessa resposta são removidos. Prefira
`$reply` quando quiser controlar exatamente o que é enviado.

```text
Olá, $username!
```

Dados retornados por `$message`, `$username` ou funções JS são valores. Mesmo que
contenham `$ban[...]`, nunca são recompilados como script.

## Condicionais e guards

```text
$if[$eq[$authorID;123];$reply[Olá, dono!];$reply[Olá!]]
```

Somente o ramo escolhido é executado. `$and` e `$or` também param assim que o
resultado é conhecido. Esta versão usa `$if[condição;então;senão]`; não há blocos
`$endif` ou `$else`.

```text
$onlyIf[$mentioned[1]!=;Mencione um membro.]
$onlyIf[$messageSlice[1]!=;Informe o motivo.]
```

Condições textuais aceitam `==`, `!=`, `>`, `<`, `>=`, `<=`; igualdade é textual e
ordenação é numérica. Para dados arbitrários, prefira `$eq[a;b]` e `$ne[a;b]` para
evitar ambiguidade com operadores presentes no próprio texto. Textos vazios,
`false`, `0`, `null` e `undefined` são falsos. Outras strings são verdadeiras.

`$onlyIf`, guards de permissão e `$requireGuild` encerram o comando quando falham,
com uma mensagem para o usuário. `$stop` encerra sem resposta automática.
`$try[operação;fallback]` captura falhas operacionais, mas não captura guards,
limites de execução ou moderação parcialmente concluída.

## Argumentos de mensagem

Para `!ban @membro spam no chat`:

| Expressão | Resultado |
|---|---|
| `$mentioned[1]` | ID do primeiro usuário mencionado |
| `$message` | Texto completo depois do nome do comando |
| `$message[0]` | Primeiro argumento, a menção |
| `$messageSlice[1]` | `spam no chat` |
| `$messageSlice[1;2]` | `spam` |

`mentioned` começa em **1**. `message` e `messageSlice` começam em **0**.
Menções ausentes retornam vazio. Argumentos da mensagem aceitam aspas simples ou
duplas e escapes com barra invertida. `messageSlice` junta os tokens com um espaço,
por isso não preserva os espaços/aspas originais; `$message` preserva o texto.

## Moderação curta

```text
$modBan[$mentioned[1];$messageSlice[1]]
$reply[Membro banido. Caso #$caseID.]
```

`modBan` verifica servidor, alvo, motivo, permissões do autor e do bot, dono e
hierarquia. O histórico é preservado por padrão. O terceiro argumento opcional
remove de 0 a 7 dias de mensagens. `ban` faz as mesmas verificações e não cria caso.

```text
$modKick[$mentioned[1];$messageSlice[1]]
$reply[Membro removido. Caso #$caseID.]
```

```text
$modTimeout[$mentioned[1];10m;$messageSlice[1]]
$reply[Membro silenciado. Caso #$caseID.]
```

`timeout` aceita duração de até 28 dias e não pode ser aplicado a administradores.
`unban` aceita um ID sem exigir que o usuário pertença ao servidor. Todas essas
ações exigem motivo. Sem confirmação implícita: a chamada executa a ação após as
checagens. Para pedir confirmação antes de uma ação, use `$confirm`.

## Interações e coletores

```text
$onlyIf[$confirm[30;Confirmar banimento?];Cancelado.]
$modBan[$mentioned[1];$messageSlice[1]]
```

| Função | Resultado |
|---|---|
| `$awaitMessage[segundos;usuario?;canal?]` | Conteúdo da próxima mensagem, ou vazio no timeout |
| `$awaitReaction[segundos;emoji?;mensagem?]` | ID do autor da reação, ou vazio no timeout |
| `$confirm[segundos;texto?]` | `true` para ✅, `false` para ❌, timeout ou outra reação |

`$confirm` responde com a pergunta, reage com ✅ e ❌ e aceita apenas a reação do
autor do comando. `$awaitMessage` e `$awaitReaction` usam a mensagem atual por
padrão. A duração aceita segundos puros (`30`) ou o formato de `parseDuration`
(`500ms`, `5s`, `10m`). O prazo de `limits.timeoutMs` é verificado entre chamadas;
`$awaitMessage`, `$awaitReaction` e `$confirm` usam `call.wait` e não consomem o
prazo enquanto esperam. Funções HTTP fazem o mesmo com a requisição.

## Embeds

Separe cada parte por `;`, inclusive quando estiver em outra linha:

```text
$reply[$embed[
  $title[Perfil];
  $description[Informações do membro];
  $color[#FCE300];
  $field[Nome;$username;true];
  $field[ID;$authorID;true];
  $footer[Yuzuha]
]]
```

Limites: título 256, descrição 4096, rodapé 2048, até 25 campos, nome de campo 256,
valor de campo 1024 e total textual 6000 caracteres. `$reply` textual aceita até
2000 caracteres. Mensagens enviadas pelo adaptador Yuzuha desativam pings.

## Estado e casos

```text
$setGuildVar[boasVindas;Olá!]
$reply[$getGuildVar[boasVindas;Bem-vindo!]]
```

`Var` usa o escopo global daquele store; `GuildVar` usa o servidor e `UserVar` usa
o autor. Nomes são locais ao escopo. Para incrementos concorrentes, use uma
transação JS com `ctx.store.update`; uma sequência get + set de script não é uma
única transação.

```text
$let[caso;$case[1]]
$onlyIf[$get[caso];Caso não encontrado.]
$reply[Motivo: $prop[$get[caso];reason]]
```

As funções compostas fazem a leitura e a escrita na mesma transação do store:

| Função | Efeito e retorno |
|---|---|
| `$incrementVar[nome;delta?]` | Soma um delta finito (padrão `1`) e retorna o novo número |
| `$pushVar[nome;valor]` | Acrescenta um item JSON ao array e retorna o array novo |
| `$pullVar[nome;valor]` | Remove todas as ocorrências do valor e retorna o array novo |
| `$setVarPath[nome;caminho;novo]` | Atualiza caminho em objeto persistente e retorna o valor completo |
| `$caseList[página?;tamanho?]` | Página 1-based dos casos do servidor; tamanho padrão 10, máximo 100 |
| `$caseCount` | Quantidade de casos do servidor atual |

`Var`, `GuildVar` e `UserVar` têm as mesmas variantes. `increment` aceita uma
string numérica armazenada; `push` cria o array quando a chave não existe e falha
se o valor atual não for array. `set*Path` cria objetos e arrays intermediários,
aceita caminho vazio para substituir o valor inteiro e faz tudo na mesma
transação do store.

## Objetos, arrays e JSON

| Função | Uso |
|---|---|
| `$object[chave;valor;...]` | Monta um objeto; exige número par de argumentos |
| `$jsonEncode[valor]` / `$jsonDecode[texto]` | Serializa e decodifica JSON |
| `$jsonGet[valor;caminho;padrão?]` | Lê caminho com pontos e índices, como `a.0.b` |
| `$jsonSet[valor;caminho;novo]` | Retorna cópia alterada, sem mutar o original |
| `$jsonDelete[valor;caminho]` | Cópia sem o caminho; remove índice de array |
| `$jsonMerge[valor;...]` | Mescla objetos em profundidade; o último vence |
| `$jsonKeys[valor]` | Chaves de objeto ou índices de array |
| `$jsonValues[valor]` / `$jsonEntries[valor]` | Valores próprios ou pares `[chave, valor]` |
| `$hasProp[valor;chave]` | Verifica propriedade própria |
| `$array[valor;...]` | Monta um array |
| `$arrayPush[array;valor;...]` | Retorna novo array com os itens adicionados |
| `$arrayGet[array;índice;padrão?]` | Item por índice, ou padrão se ausente |
| `$arrayLength`, `$arraySlice`, `$arrayIncludes`, `$arrayIndexOf` | Consulta e fatia |
| `$arrayJoin[array;separador]` | Converte itens para texto e junta |
| `$arraySort[array;direção]` | Ordena cópia do array em `asc` ou `desc` |
| `$arrayReverse`, `$arrayUnique` | Inverte e deduplica sem mutar |
| `$arrayConcat[array;...]`, `$arrayFlat[array;profundidade?]` | Concatena arrays ou achata até 64 níveis |
| `$arrayChunk[array;tamanho]` | Divide em grupos, mantendo o último grupo incompleto |
| `$arrayMap[array;expressão]`, `$arrayFilter[array;expressão]` | Transforma ou filtra até 1000 itens |
| `$arraySome[array;expressão]`, `$arrayEvery[array;expressão]` | Predicados com curto-circuito; vazio retorna `false`/`true` |
| `$arrayFind[array;expressão]` | Primeiro item correspondente, ou `null` |
| `$arrayReduce[array;inicial;expressão]` | Redução com `$loopAccumulator` |
| `$arraySortBy[array;chave;direção?]` | Chave calculada uma vez por item; `asc`/`desc` preservam empates |
| `$range[início;fim;passo?]` | Sequência inclusiva; máximo 1000 itens |
| `$paginate[array;página;tamanho]` | Página 1-based |

Em `$array`, `$object`, `$push*`, `$pull*` e `$set*Path`, escalares textuais exatos
são convertidos para número, booleano ou `null`: `1` deixa de ser texto e vira número,
`true` vira booleano. Fora dessas estruturas, a interpolação continua textual.
Caminhos inválidos e JSON malformado geram erro com código estável. `$jsonSet`
preserva o texto recebido; use `$set*Path` quando o valor precisar da conversão
de escalares.

Caminhos acessam apenas propriedades próprias. Chaves como `__proto__` são dados
comuns em `$object`, `$jsonSet` e `$jsonMerge`, sem alterar protótipos. Escritas
por caminho em arrays aceitam índices de **0 a 9999**; a restrição também vale
para `$setVarPath`, `$setGuildVarPath` e `$setUserVarPath`.

Callbacks recebem `$loopValue` e `$loopIndex`, sem converter strings em código:

```text
$arrayMap[$range[1;3];$math[$loopValue;*;2]]
$arrayFilter[$range[1;5];$loopValue>2]
$arrayReduce[$range[1;4];0;$math[$loopAccumulator;+;$loopValue]]
```

Os resultados acima são `[2,4,6]`, `[3,4,5]` e `10`. Cada expressão é reavaliada
por item. Os callbacks compartilham limites de chamadas, profundidade, saída e
tempo com o resto do script; variáveis de loops externos são restauradas mesmo
quando há erro. `$arraySortBy` exige chaves todas numéricas finitas ou todas
textuais, para uma ordenação consistente. `$loopValue` preserva `null`, `false`
e `0`; `$arrayReduce` exige valor inicial e o devolve quando o array é vazio.

## Texto, números e datas

| Função | Uso |
|---|---|
| `$split[texto;separador]` | Divide o texto; separador vazio retorna caracteres |
| `$sliceText[texto;início;fim?]` | Fatia por caracteres Unicode, fim exclusivo |
| `$includes`, `$startsWith`, `$endsWith` | Busca e prefixo/sufixo |
| `$padStart[texto;tamanho;preenchimento?]`, `$padEnd[...]` | Alinha texto |
| `$repeatText[texto;vezes]`, `$truncate[texto;limite;sufixo?]` | Repetição e corte |
| `$escapeMarkdown[texto]` | Escapa caracteres especiais de Markdown |
| `$mention[id;tipo]` | Gera menção de usuário, cargo ou canal |
| `$round[valor;casas?]`, `$floor`, `$ceil`, `$abs`, `$clamp` | Arredondamento e intervalo |
| `$fixed[valor;casas?]`, `$formatNumber[valor;local?]` | Texto numérico localizado |
| `$date[timestamp?;formato;local?]` | Formata em `iso`, `date`, `time`, `datetime` ou `relative` |
| `$relativeTime[timestamp;local?]`, `$parseDate[texto]` | Distância até agora e parse |

Locais usam `Intl` e caem em `pt-BR` quando omitidos. `$parseDate` aceita o formato
entendido por `Date.parse`; a saída de timestamps é sempre em milissegundos.

## Loops

```text
$forEach[$array[a;b;c];$loopValue]
```

| Função | Comportamento |
|---|---|
| `$repeat[vezes;corpo;...]` | Repete o corpo e concatena os resultados |
| `$forEach[array;corpo;...]` | Executa o corpo para cada item |
| `$loopIndex` / `$loopValue` | Índice e item da iteração atual; vazio fora de loops |
| `$loopAccumulator` | Acumulador da redução atual; vazio fora de reduções |

O corpo pode ocupar vários argumentos e é **reavaliado** em cada iteração, então
`$let` e `$increment` funcionam como acumuladores. O máximo é 1000 iterações.
Variáveis de loop anteriores são restauradas ao fim, inclusive em erro.
O tamanho da saída é conferido durante a construção do resultado, antes de
executar a próxima iteração.

## Agendamentos

```text
$schedule[10m;lembrete;tomar água]
$scheduleEvery[1h;status;]
```

| Função | Resultado |
|---|---|
| `$schedule[duração;comando;entrada?]` | ID do agendamento único |
| `$scheduleEvery[duração;comando;entrada?]` | ID do agendamento repetido |
| `$schedules` | Agendamentos do servidor atual |
| `$unschedule[id]` | `true` se removeu, `false` se não existia |

O comando é executado como se o autor original tivesse enviado a mensagem, no
mesmo canal. Tarefas ficam no store e sobrevivem a reinícios. Falhas são
reagendadas por padrão após 30 segundos, até cinco tentativas. O scheduler usa uma
reivindicação atômica por tarefa e libera tarefas órfãs após cinco minutos.
`$schedule` exige um scheduler configurado; use `scheduler: false` para desligar.

`$schedule` e `$scheduleEvery` aceitam um quarto argumento de retry:
`$object[maxAttempts;3;retryDelayMs;10000;retryBackoff;2]`.
`$pauseSchedule[id]`, `$editSchedule[id;opções]` e `$resumeSchedule[id;duração?]`
alteram apenas tarefas do mesmo autor e servidor; `$unschedule` segue a mesma regra.
`editSchedule` aceita `command`, `input`, `due` (timestamp em ms), `interval`
(ms ou null para remover repetição) e os três campos de retry. Tarefas em execução
não podem ser alteradas. `$schedules` inclui `paused`, autor e a política atual.

## Recursos novos da 0.1.2

| Função | Comportamento |
|---|---|
| `$dm[usuário;conteúdo]` | Mensagem direta, retorna ID |
| `$forward[destino;origem;mensagem]` | Encaminha e retorna novo ID |
| `$messages[canal;limite?;before?;after?;around?]` | Histórico; use somente um cursor |
| `$searchMessages[texto;canal?;limite?;cursor?;autor?]` | Página com `indexing`, `messages`, `total` e `cursor` |
| `$searchMembers[nome;limite?;offset?]` | Página com membros, total, hasMore e indexing |
| `$nickname[usuário;apelido;motivo]` | Permissões/hierarquia compartilhadas com `ctx.members`; vazio remove |
| `$editGuild[opções]` | Nome, icon, banner, systemChannelID, afkChannelID e afkTimeout |
| `$editThread[thread;opções]` | Nome, archived, locked, autoArchiveDuration, slowmode, tags e reason |
| `$joinThread[thread]`, `$leaveThread[thread]` | Entrada/saída do bot |
| `$searchThreads[canal;nome?;limite?;offset?]` | Até 25 itens, com indexação e paginação |
| `$invites`, `$vanity`, `$setVanity[código]` | Convites e vanity; código vazio remove |
| `$cloneEmoji[id]`, `$cloneSticker[id]` | Clona expressão para o servidor atual |
| `$fileBase64[base64;nome;descrição?]` | Descritor de anexo para envio múltiplo |
| `$sendFileBase64[canal;base64;nome;conteúdo?]` | Envia bytes decodificados |
| `$sendAttachments[canal;array;conteúdo?]` | Até 10 anexos URL/base64 na mesma mensagem |

Opções de edição são objetos tipados, por exemplo
`$editThread[123;$object[locked;true;slowmode;5]]`. Gestão de servidor/convites/vanity
exige `ManageGuild`, edição de thread exige `ManageChannels` e clonagem exige
`ManageExpressions`, para autor e bot. Busca ainda em indexação deve ser tentada
novamente pelo chamador. Cursor de mensagens é o array da página anterior.

```text
$sendAttachments[$channelID;$array[
  $attachment[https://example.com/a.png;a.png];
  $fileBase64[b2zDoQ==;ola.txt;Saudação]
];Arquivos]
```

Bytes decodificados têm limite de 10 MB no total; o orçamento de saída do runtime
também limita descritores/base64 antes do envio.

## Recursos novos da 0.1.3

```text
$setGuildVar[evento;aberto;60000]
$reply[Prazo restante: $ttlGuildVar[evento] ms]
```

`$expireGuildVar[evento;null]` remove o prazo; zero expira imediatamente.
As variantes `Var` e `UserVar` seguem as mesmas regras. `$dataTransaction` recebe
um array de até 100 operações JSON para ler, escrever, apagar, incrementar e
alterar/consultar TTL em vários escopos atomicamente. Uma operação inválida ou
saída acima do orçamento desfaz tudo; veja [STORAGE.md](STORAGE.md).
Não há execução de scripts assíncronos dentro de transações do store.

`$modMoveMember[usuário;canal;motivo]`, `$modMuteMember[usuário;true;motivo]`
e `$modDeafenMember[usuário;false;motivo]` compartilham guards e casos com JS/TS.
As versões sem `mod` mantêm autorização e omitem o caso; destino vazio em
`moveMember` desconecta. `$try` não captura guards ou falhas parciais.

Listagens `$activeThreads`/`$archivedThreads`, canais de link, avisos, perfis e
contagens ao vivo estão na [referência gerada](FUNCTIONS.md). Contagens aguardam
o gateway e aceitam timeout; os testes simulam os eventos sem conectar.

`$scheduleHistory` e `$failedSchedules` consultam execuções do autor/servidor;
`$retrySchedule[idDaExecução;duração?]` cria uma nova tarefa para falha operacional.
Guards e moderação aplicada ou parcialmente concluída impedem reexecução.

## Conjuntos e formatação da 0.1.4

| Função | Retorno e limites |
|---|---|
| `$arrayUnion[array;outroArray]` | Array com a união, sem duplicados |
| `$arrayIntersection[array;outroArray]` | Itens únicos do primeiro array também presentes no segundo |
| `$arrayDifference[array;outroArray]` | Itens únicos do primeiro array ausentes do segundo |
| `$formatBytes[bytes;casas?;base?]` | Texto com unidade; casas 0–6 (padrão 2), base 1024 ou 1000 |
| `$percent[parte;total;casas?]` | Texto com `%`; casas 0–6 (padrão 2), total positivo |
| `$toBase[inteiroDecimal;base]` | Texto na base 2–36, com letras minúsculas |
| `$fromBase[texto;base]` | Texto decimal exato a partir da base 2–36 |

As três operações de conjuntos aceitam dois arrays com até **1000 itens somados**.
Usam igualdade profunda, preservam a primeira ocorrência e não alteram os arrays
recebidos. Na união, percorrem primeiro o array da esquerda, depois o da direita;
interseção e diferença preservam a ordem do primeiro array. A ordem das chaves
não diferencia objetos de mesmo conteúdo; número `1` e texto `"1"` são distintos.
`null` permanece `null`, propriedades como `__proto__` continuam dados comuns e
zeros `0`/`-0` são distintos quando chegam preservados pelo valor de entrada.

```text
$arrayUnion[$array[1;2;2;null];$array[2;3;null]]
$arrayIntersection[$array[1;2;2;null];$array[2;3;null]]
$arrayDifference[$array[1;2;2;null];$array[2;3;null]]
```

Os resultados tipados são `[1,2,null,3]`, `[2,null]` e `[1]`. Use arrays de valores
tipados, como `$array` ou `$jsonDecode`, em vez de passar JSON como texto direto.
Para objetos, a comparação também inclui os valores aninhados:

```text
$arrayIntersection[$jsonDecode[[{"a":1,"b":[2]}]];$jsonDecode[[{"b":[2],"a":1}]]]
```

O resultado é um array com o objeto do primeiro argumento. Nenhuma comparação
executa texto como código ou consulta propriedades herdadas.

```text
$formatBytes[1536]
$formatBytes[1000000;0;1000]
$percent[1;3]
```

Os resultados são os textos `1.5 KiB`, `1 MB` e `33.33%`. Bytes precisam ser
inteiros não negativos no intervalo seguro de JavaScript. Base 1024 usa unidades
IEC (`KiB`, `MiB`, etc.); base 1000 usa SI (`kB`, `MB`, etc.). Zeros decimais
finais são removidos em bytes; percentuais mantêm exatamente a quantidade de
casas solicitada. Ambas as funções usam ponto decimal e não recebem locale.
Parte/total devem ser finitos, total deve ser maior que zero e o percentual
resultante precisa ser finito. Percentuais negativos e acima de 100 são aceitos.

Conversões de bases não passam por ponto flutuante para inteiros grandes:

```text
$toBase[255;16]
$fromBase[FF;16]
$fromBase[$toBase[90071992547409931234567890;36];36]
$jsonEncode[$fromBase[ff;16]]
```

Os resultados são `ff`, `255`, `90071992547409931234567890` e `"255"`; todos são
**strings**, inclusive o retorno decimal de `$fromBase`. O último exemplo
explicita o tipo pela serialização JSON.

`$toBase` aceita um número inteiro seguro ou texto decimal opcionalmente negativo,
com até **1024 dígitos de entrada**, sem espaços, prefixos ou notação exponencial.
Por exemplo, `$toBase[$jsonDecode[42];2]` aceita o número tipado `42`, enquanto
`$toBase[$jsonDecode[9007199254740993];16]` recusa o número já fora do intervalo
seguro. Para preservar todos os dígitos, passe texto decimal diretamente ou
obtenha uma string por `$jsonDecode["9007199254740993"]`.

`$fromBase` exige texto com até **1024 dígitos de entrada**, aceita letras
maiúsculas/minúsculas e sinal negativo. Cada caractere deve pertencer à base
informada; prefixos não recebem interpretação especial. A conversão exata pode
produzir mais de 1024 dígitos na saída, mas continua sujeita ao orçamento de
saída do runtime. Uma saída longa de `$toBase` pode ultrapassar o limite de
entrada de `$fromBase` ao ser encadeada. Zero negativo é normalizado para `"0"`.

## HTTP

```text
$let[resposta;$httpJson[GET;https://api.exemplo.com/itens]]
$reply[Total: $arrayLength[$prop[$get[resposta];itens]]]
```

`$http[método;url;corpo?;cabeçalhos?]` retorna o corpo como texto.
`$httpJson` decodifica JSON, define `Content-Type: application/json` quando há
corpo e retorna `null` para resposta vazia. Cabeçalhos usam `Nome: valor`,
separados por vírgula ou quebra de linha.

O cliente bloqueia por padrão loopback, redes privadas e endereços de metadados,
inclusive após redirecionamentos. Também aplica timeout, limite de bytes e uma
allowlist opcional de hosts. As opções ficam em `new HttpService({ ... })`;
veja [API](API.md). Use `http: false` para remover o serviço do contexto.

## Diagnóstico e limites

Scripts são analisados antes de registrar os comandos. Função desconhecida,
aridade incorreta e delimitadores incompletos são erros com arquivo/linha/coluna.
O runtime envolve falhas com o local da chamada e mantém a causa para o handler.
O editor também aponta esses problemas enquanto digita e pode ler metadados de
plugins em JSON, conforme [EDITOR.md](EDITOR.md). Cancelamento HTTP/collectors
do contexto interrompe a espera e não é capturado por `$try`.
O usuário recebe um erro genérico nas falhas internas; guards usam suas próprias
mensagens. Confira os limites e o modelo de confiança em [STORAGE.md](STORAGE.md).
