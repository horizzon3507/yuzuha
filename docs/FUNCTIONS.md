# Referência das funções

Function mode opcional, importado de `yuzuha/functions`.
Gerada do registro executável: **310 funções**. Atualize com `npm run docs:generate`.

Aliases não contam como funções adicionais. Índices e semântica estão em [LANGUAGE.md](LANGUAGE.md).

## channels

| Função | Descrição | Aliases |
|---|---|---|
| `$channel[canal;propriedade?]` | Mostra um canal; com propriedade, mostra só ela. |  |
| `$channelPerms[canal;alvo;permitir?;negar?]` | Define permissões locais; listas separadas por vírgula. |  |
| `$channelPermsOf[canal;usuario]` | Permissões efetivas do usuário no canal. |  |
| `$channels` | Lista os canais do servidor atual por posição. |  |
| `$createChannel[nome;tipo?;categoria?]` | Cria um canal e mostra os dados. |  |
| `$createLinkChannel[nome;url;categoria?]` | Cria um canal de link com autorização do autor e do bot. |  |
| `$deleteChannel[canal]` | Apaga um canal. |  |
| `$editChannel[canal;nome?;topico?;slowmode?]` | Edita um canal; vazio mantém. |  |
| `$editLinkChannel[canal;url;motivo?]` | Altera a URL de um canal de link do servidor atual. |  |
| `$moveChannel[canal;posição]` | Move um canal para a posição indicada, a partir de 0. |  |
| `$setCategory[canal;categoria;motivo?]` | Define a categoria do canal; categoria vazia remove o vínculo. |  |
| `$setContentWarning[canal;nível;texto?;motivo?]` | Define aviso de conteúdo: 0 herda, 1 ativa, vazio remove o override. |  |
| `$slowmode[segundos;canal?]` | Define o modo lento (0 a 21600s). |  |

## collectors

| Função | Descrição | Aliases |
|---|---|---|
| `$awaitMessage[segundos;usuario?;canal?]` | Aguarda mensagem e retorna o conteúdo ou vazio em timeout. |  |
| `$awaitReaction[segundos;emoji?;mensagem?]` | Aguarda reação e retorna o userID ou vazio em timeout. |  |
| `$confirm[segundos;texto?]` | Pede confirmação com ✅/❌ e retorna boolean. |  |

## context

| Função | Descrição | Aliases |
|---|---|---|
| `$arg[nome]` | Argumento declarativo convertido. |  |
| `$authorID` | ID do autor. |  |
| `$authorName` | Nome do autor. |  |
| `$botID` | ID do bot. |  |
| `$caseID` | ID do último caso criado nesta execução. |  |
| `$channelID` | ID do canal; vazio se o evento não tiver canal. |  |
| `$guildID` | ID do servidor; vazio em DM. |  |
| `$help` | Ajuda dos comandos registrados. |  |
| `$mentioned[posição]` | Menção por posição, começando em 1; vazio se ausente. |  |
| `$message[posição?]` | Texto dos argumentos, ou argumento por posição começando em 0. |  |
| `$messageID` | ID da mensagem. |  |
| `$messageSlice[início;fim?]` | Fatia de argumentos, índice inicial 0 e fim exclusivo. |  |
| `$ping` | Latência do gateway em ms. |  |
| `$username` | Nome do autor. |  |

## embeds

| Função | Descrição | Aliases |
|---|---|---|
| `$color[#RRGGBB]` | Cor RGB hexadecimal. |  |
| `$description[texto]` | Parte de embed. |  |
| `$embed[parte;parte;...]` | Combina partes tipadas de embed. Separe-as por ponto e vírgula. |  |
| `$field[nome;valor;inline?]` | Campo de embed. |  |
| `$footer[texto]` | Parte de embed. |  |
| `$image[texto]` | Parte de embed. |  |
| `$thumbnail[texto]` | Parte de embed. |  |
| `$title[texto]` | Parte de embed. |  |

## events

| Função | Descrição | Aliases |
|---|---|---|
| `$eventChannelID` | Consulta o campo do evento; requer contexto de evento e preserva ausências como null. |  |
| `$eventContent` | Consulta o campo do evento; requer contexto de evento e preserva ausências como null. |  |
| `$eventEmoji` | Consulta o campo do evento; requer contexto de evento e preserva ausências como null. |  |
| `$eventGuildID` | Consulta o campo do evento; requer contexto de evento e preserva ausências como null. |  |
| `$eventMessageID` | Consulta o campo do evento; requer contexto de evento e preserva ausências como null. |  |
| `$eventName` | Consulta o campo do evento; requer contexto de evento e preserva ausências como null. |  |
| `$eventOldContent` | Consulta o campo do evento; requer contexto de evento e preserva ausências como null. |  |
| `$eventUserID` | Consulta o campo do evento; requer contexto de evento e preserva ausências como null. |  |

## expressions

| Função | Descrição | Aliases |
|---|---|---|
| `$cloneEmoji[idOrigem]` | Clona expressão de outro servidor para o atual; exige ManageExpressions. |  |
| `$cloneSticker[idOrigem]` | Clona expressão de outro servidor para o atual; exige ManageExpressions. |  |
| `$createEmoji[nome;url]` | Exige ManageExpressions de autor e bot antes de baixar a imagem por HTTP, converter para base64 e criar emoji no servidor. |  |
| `$createEmojisBulk[emojis]` | Cria de 1 a 50 emojis com name e image em base64; retorna success e failed sem ocultar falhas parciais. |  |
| `$createSticker[nome;imagemBase64;descrição?;tags?;motivo?]` | Cria sticker com imagem em base64; tags separadas por vírgula. |  |
| `$deleteEmoji[nomeOuID]` | Apaga emoji do servidor. |  |
| `$deleteSticker[nomeOuID;motivo?]` | Apaga um sticker do servidor. |  |
| `$editEmoji[nomeOuID;novoNome;motivo?]` | Renomeia um emoji do servidor e retorna suas informações. |  |
| `$editSticker[nomeOuID;novoNome?;descrição?;motivo?]` | Edita sticker; nome vazio mantém e descrição vazia limpa. |  |
| `$emoji[nomeOuID;propriedade?]` | Busca emoji do servidor por ID, nome ou menção. |  |
| `$emojis` | Lista emojis do servidor atual. |  |
| `$sticker[nomeOuID;propriedade?]` | Busca sticker do servidor por ID ou nome. |  |
| `$stickers` | Lista stickers do servidor atual. |  |

## flow

| Função | Descrição | Aliases |
|---|---|---|
| `$get[nome]` | Recupera variável local preservando seu tipo. |  |
| `$if[condição;então;senão?]` | Avalia somente o ramo escolhido. |  |
| `$let[nome;valor]` | Define variável local sem produzir texto. |  |
| `$stop` | Encerra a execução sem resposta automática. |  |
| `$throw[mensagem]` | Emite erro explícito. |  |
| `$try[operação;fallback]` | Captura erros de operações; guards, limites e ações parciais continuam sendo erros. |  |

## guards

| Função | Descrição | Aliases |
|---|---|---|
| `$cooldown[duração;erro?]` | Cooldown por autor/canal/servidor/comando; erro aceita {remaining}. |  |
| `$onlyBotPerms[permissão;erro?]` | Exige permissão do bot no servidor. | `$requireBotPermission` |
| `$onlyIf[condição;erro]` | Encerra se a condição for falsa; aceita ==, !=, >, <, >= e <=. | `$require` |
| `$onlyPerms[permissão;erro?]` | Exige permissão do autor no servidor. | `$requirePermission` |
| `$requireGuild[erro?]` | Exige execução em servidor. | `$onlyGuild` |

## invites

| Função | Descrição | Aliases |
|---|---|---|
| `$createInvite[canal;maxUsos?;duracao?]` | Cria um convite; duração como 1h, 0 nunca expira. |  |
| `$deleteInvite[codigo]` | Apaga um convite por código ou URL. |  |
| `$invite[codigo]` | Mostra um convite por código ou URL. |  |
| `$invites` | Lista convites do servidor; exige ManageGuild de autor e bot. |  |
| `$setVanity[código]` | Define convite personalizado; vazio remove. Exige ManageGuild. |  |
| `$vanity` | Obtém código e usos do convite personalizado do servidor. |  |

## language

| Função | Descrição | Aliases |
|---|---|---|
| `$abs[valor]` | Valor absoluto. |  |
| `$array[valor;...]` | Monta um array com os valores informados. |  |
| `$arrayChunk[array;tamanho]` | Divide array em grupos do tamanho indicado. |  |
| `$arrayConcat[array;...]` | Concatena arrays sem alterar os originais. |  |
| `$arrayDifference[array;outroArray]` | Itens únicos do primeiro array ausentes do segundo. Máximo de 1000 itens somados. |  |
| `$arrayEvery[array;expressão]` | Retorna false no primeiro item com expressão falsa; true se todos, inclusive array vazio. Usa $loopValue/$loopIndex; máximo 1000 itens. |  |
| `$arrayFilter[array;expressão]` | Retorna os itens cuja expressão é verdadeira. Usa $loopValue/$loopIndex; máximo 1000 itens. |  |
| `$arrayFind[array;expressão]` | Retorna o primeiro item com expressão verdadeira, ou null se ausente. Usa $loopValue/$loopIndex; máximo 1000 itens. |  |
| `$arrayFlat[array;profundidade?]` | Achata arrays; profundidade inteira entre 0 e 64. |  |
| `$arrayGet[array;índice;padrão?]` | Obtém item por índice; retorna padrão se ausente. |  |
| `$arrayIncludes[array;valor]` | Verifica se o array contém o valor. |  |
| `$arrayIndexOf[array;valor]` | Posição da primeira ocorrência, ou -1. |  |
| `$arrayIntersection[array;outroArray]` | Itens únicos do primeiro array presentes no segundo. Máximo de 1000 itens somados. |  |
| `$arrayJoin[array;separador]` | Junta itens convertidos para texto. |  |
| `$arrayLength[array]` | Quantidade de itens do array. |  |
| `$arrayMap[array;expressão]` | Retorna um array com o resultado da expressão para cada item. Usa $loopValue/$loopIndex; máximo 1000 itens. |  |
| `$arrayPush[array;valor;...]` | Retorna novo array com os valores adicionados. |  |
| `$arrayReduce[array;inicial;expressão]` | Reduz até 1000 itens usando $loopAccumulator, $loopValue e $loopIndex. |  |
| `$arrayReverse[array]` | Retorna cópia invertida do array. |  |
| `$arraySlice[array;início;fim?]` | Fatia do array; fim exclusivo. |  |
| `$arraySome[array;expressão]` | Retorna true no primeiro item com expressão verdadeira; false se nenhum. Usa $loopValue/$loopIndex; máximo 1000 itens. |  |
| `$arraySort[array;direção?]` | Ordena cópia do array; direção asc ou desc. |  |
| `$arraySortBy[array;chave;direção?]` | Ordena até 1000 itens por chaves de mesmo tipo, texto ou número; calculadas uma vez por item. Asc/desc preservam empates. |  |
| `$arraySortWith[array;comparador]` | Ordenação estável com expressão numérica negativa/zero/positiva; máximo 1000 itens e 10000 comparações. |  |
| `$arrayUnion[array;outroArray]` | União sem duplicados; preserva a ordem da primeira ocorrência. Máximo de 1000 itens somados. |  |
| `$arrayUnique[array]` | Remove duplicados, mantendo a primeira ocorrência. |  |
| `$break` | Encerra o loop mais próximo; exige corpo de repeat, forEach ou while. |  |
| `$caseCount` | Quantidade de casos do servidor atual. |  |
| `$caseList[página?;tamanho?]` | Lista casos do servidor; página 1-based, tamanho padrão 10, máximo 100. |  |
| `$ceil[valor]` | Arredonda para cima. |  |
| `$clamp[valor;mínimo;máximo]` | Limita valor ao intervalo. |  |
| `$continue` | Avança para a próxima iteração do loop mais próximo. |  |
| `$date[timestamp?;formato?;local?]` | Formata data; timestamp em ms, formato date/time/datetime/iso/relative. |  |
| `$decimal[a;operador;b;casas?]` | Aritmética decimal exata em texto, até 1000 dígitos; divisão usa 18 casas por padrão e empates arredondam para longe de zero. |  |
| `$decimalCompare[a;b]` | Compara decimais sem conversão para Number; retorna -1, 0 ou 1. |  |
| `$decimalRound[valor;casas]` | Arredonda decimal em texto; empates para longe de zero e zeros finais são removidos. |  |
| `$endsWith[texto;sufixo]` | Verifica sufixo do texto. |  |
| `$escapeMarkdown[texto]` | Escapa caracteres especiais de Markdown. |  |
| `$fixed[valor;casas?]` | Texto com casas decimais fixas. |  |
| `$floor[valor]` | Arredonda para baixo. |  |
| `$forEach[array;corpo;...]` | Concatena o corpo para cada item, com $loopValue e $loopIndex. |  |
| `$formatBytes[bytes;casas?;base?]` | Formata bytes não negativos; casas 0–6, base 1024 (KiB) ou 1000 (kB). |  |
| `$formatNumber[valor;local?]` | Formata número para o local informado. |  |
| `$fromBase[texto;base]` | Converte texto de base 2–36 para texto decimal exato; até 1024 dígitos, sem prefixos. |  |
| `$hasProp[valor;chave]` | Verifica propriedade própria de objeto. |  |
| `$includes[texto;busca]` | Verifica se o texto contém a busca. |  |
| `$incrementGuildVar[nome;delta?]` | Incrementa número persistente de forma atômica; retorna o novo valor. |  |
| `$incrementUserVar[nome;delta?]` | Incrementa número persistente de forma atômica; retorna o novo valor. |  |
| `$incrementVar[nome;delta?]` | Incrementa número persistente de forma atômica; retorna o novo valor. |  |
| `$jsonDecode[texto]` | Decodifica texto JSON. Erro se inválido. |  |
| `$jsonDelete[valor;caminho]` | Retorna cópia sem o caminho; remove índice de array. Caminho ausente não altera. |  |
| `$jsonEncode[valor]` | Codifica valor como texto JSON. |  |
| `$jsonEntries[valor]` | Lista valores ou pares de chaves e valores próprios de objeto ou array. |  |
| `$jsonGet[valor;caminho;padrão?]` | Lê caminho com pontos e índices, ex. "a.0.b". Retorna padrão se ausente. |  |
| `$jsonKeys[valor]` | Lista chaves próprias de objeto ou índices de array. |  |
| `$jsonMerge[valor;...]` | Mescla objetos em profundidade, sem mutar; o último valor vence e arrays são substituídos. |  |
| `$jsonSet[valor;caminho;novo]` | Retorna cópia com caminho alterado, sem mutar o original. |  |
| `$jsonValues[valor]` | Lista valores ou pares de chaves e valores próprios de objeto ou array. |  |
| `$loopAccumulator` | Acumulador atual de $arrayReduce; vazio fora da redução. |  |
| `$loopIndex` | Índice da iteração atual; vazio fora de loops. |  |
| `$loopValue` | Valor da iteração atual; vazio fora de loops. |  |
| `$mention[id;tipo?]` | Menciona user, role ou channel; ID deve ser numérico. |  |
| `$object[chave;valor;...]` | Monta objeto com pares chave;valor. Número ímpar de argumentos é erro. |  |
| `$padEnd[texto;tamanho;preenchimento?]` | Preenche à direita até o tamanho. |  |
| `$padStart[texto;tamanho;preenchimento?]` | Preenche à esquerda até o tamanho. |  |
| `$paginate[array;página;tamanho]` | Página 1-based do array. |  |
| `$parseDate[texto]` | Converte texto de data em milissegundos; erro se inválido. |  |
| `$percent[parte;total;casas?]` | Formata parte/total × 100 com %; total positivo, casas 0–6 (padrão 2). |  |
| `$pullGuildVar[nome;valor]` | Remove todas as ocorrências do valor em array persistente. |  |
| `$pullUserVar[nome;valor]` | Remove todas as ocorrências do valor em array persistente. |  |
| `$pullVar[nome;valor]` | Remove todas as ocorrências do valor em array persistente. |  |
| `$pushGuildVar[nome;valor]` | Adiciona item a array persistente; cria se ausente. |  |
| `$pushUserVar[nome;valor]` | Adiciona item a array persistente; cria se ausente. |  |
| `$pushVar[nome;valor]` | Adiciona item a array persistente; cria se ausente. |  |
| `$range[início;fim;passo?]` | Sequência de números; no máximo 1000 itens. |  |
| `$regexMatch[texto;padrão;flags?;timeoutMs?]` | Regex em worker isolado; flags gimsu, prazo padrão 500 ms, até 1000 correspondências e saída limitada. |  |
| `$regexReplace[texto;padrão;substituição;flags?;timeoutMs?]` | Regex em worker isolado; flags gimsu, prazo padrão 500 ms, até 1000 correspondências e saída limitada. |  |
| `$regexTest[texto;padrão;flags?;timeoutMs?]` | Regex em worker isolado; flags gimsu, prazo padrão 500 ms, até 1000 correspondências e saída limitada. |  |
| `$relativeTime[timestamp;local?]` | Descreve distância até agora, ex. "há 2 dias". |  |
| `$repeat[vezes;corpo;...]` | Repete o corpo reavaliando a cada iteração; retorna a concatenação. |  |
| `$repeatText[texto;vezes]` | Repete texto; no máximo 100000 caracteres. |  |
| `$round[valor;casas?]` | Arredonda com casas decimais. |  |
| `$setGuildVarPath[nome;caminho;novo]` | Atualiza caminho em objeto persistente de forma atômica; cria a estrutura ausente e retorna o valor completo. |  |
| `$setUserVarPath[nome;caminho;novo]` | Atualiza caminho em objeto persistente de forma atômica; cria a estrutura ausente e retorna o valor completo. |  |
| `$setVarPath[nome;caminho;novo]` | Atualiza caminho em objeto persistente de forma atômica; cria a estrutura ausente e retorna o valor completo. |  |
| `$sliceText[texto;início;fim?]` | Fatia caracteres; fim exclusivo. |  |
| `$sortLeft` | Item da esquerda no comparador de arraySortWith; vazio fora dele. |  |
| `$sortRight` | Item da direita no comparador de arraySortWith; vazio fora dele. |  |
| `$split[texto;separador]` | Divide texto; separador vazio retorna caracteres. |  |
| `$startsWith[texto;prefixo]` | Verifica prefixo do texto. |  |
| `$toBase[inteiroDecimal;base]` | Converte inteiro seguro ou texto decimal exato para base 2–36; até 1024 dígitos de entrada. |  |
| `$truncate[texto;limite;sufixo?]` | Corta texto no limite e adiciona sufixo. |  |
| `$while[condição;corpo;...]` | Reavalia condição e corpo; máximo 1000 iterações, com cancelamento e orçamento compartilhados. |  |

## messages

| Função | Descrição | Aliases |
|---|---|---|
| `$attachment[url;nome?]` | Monta especificação de anexo sem enviar. |  |
| `$clearReactions[mensagem;emoji?;canal?]` | Remove todas as reações ou somente as de um emoji. |  |
| `$deleteMessage[canalID;mensagemID]` | Apaga mensagem. |  |
| `$dm[usuário;conteúdo]` | Envia mensagem direta e retorna o ID; não menciona usuários automaticamente. |  |
| `$editMessage[canalID;mensagemID;texto ou embed]` | Edita mensagem. |  |
| `$fetchMessage[canal;mensagem;propriedade?]` | Busca uma mensagem e retorna objeto ou propriedade. |  |
| `$fileBase64[base64;nome;descrição?]` | Monta um anexo base64 para $sendAttachments, sem enviá-lo. |  |
| `$forward[destino;canalOrigem;mensagem]` | Encaminha uma mensagem para outro canal e retorna o novo ID. |  |
| `$messages[canal;limite?;before?;after?;around?]` | Lista mensagens, da mais recente para a mais antiga; aceita somente um cursor por chamada. |  |
| `$pin[mensagem;canal?]` | Fixa uma mensagem no canal. |  |
| `$pinnedMessages[canal?;limite?]` | Lista mensagens fixadas, da mais recente para a mais antiga. |  |
| `$pinnedMessagesPage[canal?;limite?;before?]` | Pagina mensagens por data de fixação; retorna messages, pinnedAt, hasMore e nextBefore. Cursor ISO da página anterior. |  |
| `$preloadMessages[canais]` | Busca a última mensagem de até 100 canais; recebe array de IDs e retorna objeto por canal. |  |
| `$react[emoji]` | Reage à mensagem que executou o comando. |  |
| `$reactionUsers[mensagem;emoji;limite?;após?;canal?]` | Lista IDs de usuários que reagiram; limite de 1 a 100 e cursor por usuário. |  |
| `$reactionUsersPage[mensagem;emoji;limite?;após?;canal?]` | Retorna users com IDs, hasMore e nextAfter; limite de 1 a 100 e cursor por usuário. |  |
| `$removeReaction[mensagem;emoji;usuário?;canal?]` | Remove a reação do bot ou de um usuário da mensagem. |  |
| `$reply[texto ou embed]` | Responde sem pings e sem produzir texto adicional. |  |
| `$searchMessages[texto;canal?;limite?;cursor?;autor?]` | Busca mensagens; retorna indexing, messages, total e cursor. Cursor é array retornado pela página anterior. |  |
| `$searchMessagesAdvanced[opções]` | Busca por filtros de conteúdo, IDs, autores, menções, anexos, datas e ordem; texto é opcional. Até 100 resultados, opções de até 32 KiB; page ou cursor exclusivos. |  |
| `$sendAttachments[canal;array;conteúdo?]` | Envia de 1 a 10 anexos URL/base64 na mesma mensagem, com até 10 MB de bytes. |  |
| `$sendFileBase64[canal;base64;nome;conteúdo?]` | Decodifica base64 e envia um anexo binário, retornando o ID. |  |
| `$sendFiles[canal;url;nome?;conteudo?]` | Envia um anexo e retorna o ID da mensagem. |  |
| `$sendMessage[canalID;texto ou embed]` | Envia e retorna o ID da mensagem. |  |
| `$unpin[mensagem;canal?]` | Desafixa uma mensagem do canal. |  |

## moderation

| Função | Descrição | Aliases |
|---|---|---|
| `$ban[usuário;motivo;diasDeHistórico?]` | Modera com guards e hierarquia, sem criar caso. |  |
| `$deafenMember[usuário;ativar;motivo]` | Modera voz com permissões e hierarquia. |  |
| `$kick[usuário;motivo]` | Modera com guards e hierarquia, sem criar caso. |  |
| `$modBan[usuário;motivo;diasDeHistórico?]` | Modera com guards e hierarquia e cria caso; define $caseID. |  |
| `$modDeafenMember[usuário;ativar;motivo]` | Modera voz com permissões e hierarquia, registra caso e define $caseID. |  |
| `$modKick[usuário;motivo]` | Modera com guards e hierarquia e cria caso; define $caseID. |  |
| `$modMoveMember[usuário;canalOuVazio;motivo]` | Modera voz com permissões e hierarquia, registra caso e define $caseID. |  |
| `$modMuteMember[usuário;ativar;motivo]` | Modera voz com permissões e hierarquia, registra caso e define $caseID. |  |
| `$modTimeout[usuário;duração;motivo]` | Modera com guards e hierarquia e cria caso; define $caseID. |  |
| `$modUnban[usuário;motivo]` | Modera com guards e hierarquia e cria caso; define $caseID. |  |
| `$moveMember[usuário;canalOuVazio;motivo]` | Modera voz com permissões e hierarquia. |  |
| `$muteMember[usuário;ativar;motivo]` | Modera voz com permissões e hierarquia. |  |
| `$timeout[usuário;duração;motivo]` | Modera com guards e hierarquia, sem criar caso. |  |
| `$unban[usuário;motivo]` | Modera com guards e hierarquia, sem criar caso. |  |

## network

| Função | Descrição | Aliases |
|---|---|---|
| `$http[método;url;corpo?;cabeçalhos?]` | Executa requisição HTTP com timeout e limite de resposta; retorna o corpo. |  |
| `$httpChunk` | Trecho UTF-8 atual de httpStream; vazio fora do callback. |  |
| `$httpChunkIndex` | Índice do trecho textual de httpStream, começando em zero; vazio fora dele. |  |
| `$httpJson[método;url;corpo?;cabeçalhos?]` | Como $http, mas decodifica a resposta como JSON. |  |
| `$httpMultipart[método;url;partes;cabeçalhos?]` | Envia partes de formulário com value textual ou base64 binário; retorna o corpo da resposta. |  |
| `$httpStream[método;url;callback;corpo?;cabeçalhos?]` | Consome resposta por trechos UTF-8 e reavalia callback; até 1000 chunks, com backpressure, cancelamento e política HTTP do comando. |  |

## roles

| Função | Descrição | Aliases |
|---|---|---|
| `$addRole[usuário;cargo]` | Adiciona cargo ao usuário. |  |
| `$createRole[nome;cor?;permissões?]` | Cria cargo; cor #RRGGBB ou número; permissões separadas por vírgula. |  |
| `$deleteRole[cargo]` | Exclui cargo do servidor. |  |
| `$editRole[cargo;nome?;cor?;permissões?]` | Edita cargo; texto vazio mantém cada campo. |  |
| `$hasRole[usuário;cargo]` | Verifica se o usuário possui o cargo. |  |
| `$moveRole[cargo;posição]` | Move cargo com autorização e hierarquia do autor e do bot; posição a partir de 1. |  |
| `$removeRole[usuário;cargo]` | Remove cargo do usuário. |  |
| `$role[cargo;propriedade?]` | Resolve cargo do servidor atual; retorna o cargo ou uma propriedade. |  |
| `$roles` | Lista cargos do servidor ordenados por posição. |  |

## schedule

| Função | Descrição | Aliases |
|---|---|---|
| `$editSchedule[id;opções]` | Edita seu agendamento, cron/fuso, política e retry; interval ou cron null remove a repetição correspondente. |  |
| `$failedSchedules` | Lista suas execuções agendadas encerradas com falha. |  |
| `$pauseSchedule[id]` | Pausa seu agendamento, preservando o vencimento e a política de retry. |  |
| `$resumeSchedule[id;duração?]` | Retoma seu agendamento; duração opcional define novo vencimento a partir de agora. |  |
| `$retrySchedule[execução;duração?]` | Reagenda uma falha operacional sua; guards e efeitos de moderação impedem reexecução. |  |
| `$schedule[duração;comando;entrada?;retry?]` | Agenda execução única; retry recebe maxAttempts, retryDelayMs, retryBackoff, retryJitter e priority (-1000 a 1000). |  |
| `$scheduleCron[expressão;fuso;comando;entrada?;opções?]` | Agenda cron de cinco campos em fuso IANA; opções recebem missedRun (run-once ou skip) e retry com jitter e priority. |  |
| `$scheduleEvery[duração;comando;entrada?;retry?]` | Agenda execução repetida; retry recebe maxAttempts, retryDelayMs, retryBackoff, retryJitter e priority (-1000 a 1000). |  |
| `$scheduleHistory` | Lista o histórico dos seus agendamentos no servidor atual. |  |
| `$schedules` | Lista agendamentos do servidor atual. |  |
| `$unschedule[id]` | Cancela um agendamento; retorna true/false. |  |

## storage

| Função | Descrição | Aliases |
|---|---|---|
| `$case[número]` | Consulta caso do servidor atual. |  |
| `$dataTransaction[operações]` | Executa atomicamente 1–100 operações JSON get/set/delete/increment/expire/ttl entre escopos; retorna resultados na ordem. |  |
| `$deleteGuildVar[nome]` | Remove variável persistente do escopo. |  |
| `$deleteUserVar[nome]` | Remove variável persistente do escopo. |  |
| `$deleteVar[nome]` | Remove variável persistente do escopo. |  |
| `$expireGuildVar[nome;ttlMs]` | Define expiração em milissegundos; null remove TTL, zero expira imediatamente. Retorna se o valor existia. |  |
| `$expireUserVar[nome;ttlMs]` | Define expiração em milissegundos; null remove TTL, zero expira imediatamente. Retorna se o valor existia. |  |
| `$expireVar[nome;ttlMs]` | Define expiração em milissegundos; null remove TTL, zero expira imediatamente. Retorna se o valor existia. |  |
| `$getGuildVar[nome;padrão?]` | Lê variável persistente do escopo. |  |
| `$getUserVar[nome;padrão?]` | Lê variável persistente do escopo. |  |
| `$getVar[nome;padrão?]` | Lê variável persistente do escopo. |  |
| `$queryVars[escopo;opções?]` | Consulta prefixo de variáveis global/guild/user; opções prefix, after e limit (1–100); retorna entries e nextCursor. |  |
| `$setGuildVar[nome;valor;ttlMs?]` | Salva variável do escopo; TTL opcional em milissegundos. Sem TTL, o valor é persistente. |  |
| `$setUserVar[nome;valor;ttlMs?]` | Salva variável do escopo; TTL opcional em milissegundos. Sem TTL, o valor é persistente. |  |
| `$setVar[nome;valor;ttlMs?]` | Salva variável do escopo; TTL opcional em milissegundos. Sem TTL, o valor é persistente. |  |
| `$ttlGuildVar[nome]` | Retorna TTL restante em milissegundos; -1 persistente, -2 ausente ou expirada. |  |
| `$ttlUserVar[nome]` | Retorna TTL restante em milissegundos; -1 persistente, -2 ausente ou expirada. |  |
| `$ttlVar[nome]` | Retorna TTL restante em milissegundos; -1 persistente, -2 ausente ou expirada. |  |

## threads

| Função | Descrição | Aliases |
|---|---|---|
| `$activeThreads` | Lista threads ativas do servidor e suas associações. |  |
| `$addThreadMember[thread;usuário]` | Adiciona ou remove um membro da thread. |  |
| `$archivedThreads[canal;tipo?;limite?;antes?]` | Pagina threads arquivadas: public/private usam timestamp ISO; joined usa ID. |  |
| `$archiveThread[thread;bloquear?]` | Arquiva thread; bloquear aceita true/false. |  |
| `$createThread[nome;canal?;mensagem?;arquivamento?]` | Cria thread no canal atual ou informado. |  |
| `$editThread[thread;opções]` | Edita nome, arquivamento, bloqueio, duração, slowmode e tags; exige ManageChannels. |  |
| `$forumPost[canal;título;conteúdo;tags?]` | Cria post em fórum/mídia; tags separadas por vírgula. |  |
| `$joinThread[thread]` | Faz o bot entrar na thread. |  |
| `$leaveThread[thread]` | Faz o bot sair da thread. |  |
| `$removeThreadMember[thread;usuário]` | Adiciona ou remove um membro da thread. |  |
| `$searchThreads[canal;nome?;limite?;offset?]` | Busca threads; retorna threads, total, hasMore, indexing e retryAfter. |  |
| `$threadMember[thread;usuário?]` | Busca um membro da thread com flags e estado de mute; usuário padrão é o autor. |  |
| `$threadMembers[thread;limite?;após?]` | Lista membros da thread com limite de 1 a 100 e cursor por usuário. |  |
| `$unarchiveThread[thread]` | Desarquiva thread. |  |

## users

| Função | Descrição | Aliases |
|---|---|---|
| `$auditLogs[limite?]` | Logs de auditoria do servidor atual; padrão 50, máximo 100. |  |
| `$avatar[id;tamanho?]` | URL do avatar; tamanho de 16 a 4096; vazio se ausente. |  |
| `$bans[limite?]` | Banimentos do servidor atual; padrão 50, máximo 1000. |  |
| `$channelCounts[canal?;timeout?]` | Solicita contagens ao vivo do canal ao gateway, aguardando o evento correspondente. |  |
| `$displayName[id]` | Nome de exibição do usuário; vazio se não existir. |  |
| `$editGuild[opções]` | Edita nome, ícone, banner, canal de sistema/AFK e timeout AFK; exige ManageGuild de autor e bot. |  |
| `$guild[propriedade?]` | Servidor atual, ou uma propriedade própria. |  |
| `$guildBanner[tamanho?]` | URL do banner do servidor atual; vazio se ausente. |  |
| `$guildCounts[timeout?]` | Solicita contagens ao vivo de membros e online ao gateway; timeout em milissegundos. |  |
| `$guildFeatures` | Retorna as features do servidor atual como array; exige suporte do recurso. |  |
| `$guildIcon[tamanho?]` | URL do ícone do servidor atual; vazio se ausente. |  |
| `$leaveGuild` | Remove o bot do servidor atual; somente o dono do servidor pode executar. |  |
| `$member[id;propriedade?]` | Membro do servidor atual, ou propriedade; vazio se não existir. |  |
| `$memberCount` | Total de membros do servidor atual. |  |
| `$members[limite?]` | Membros do servidor atual; padrão 50, máximo 1000. |  |
| `$nickname[usuário;apelido;motivo]` | Altera apelido com permissões e hierarquia; vazio remove. Retorna o membro. |  |
| `$searchMembers[nome;limite?;offset?]` | Busca membros por nome; retorna members, total, hasMore e indexing. |  |
| `$setActivity[atividade;tipo?]` | Define a atividade com status online. |  |
| `$setPresence[status;atividade?;tipo?]` | Define presença: status e atividade opcional (playing por padrão). |  |
| `$setStatus[status]` | Define o status da presença; limpa a atividade. |  |
| `$user[id;propriedade?]` | Usuário por ID, ou uma propriedade própria; vazio se não existir. |  |
| `$userBanner[id;tamanho?]` | URL do banner do usuário; tamanho de 16 a 4096; vazio se ausente. |  |
| `$userCreated[id]` | Criação da conta em milissegundos; vazio se não existir. |  |
| `$userProfile[usuário]` | Busca usuário, perfil global e perfil/membro do servidor atual quando disponível. |  |

## values

| Função | Descrição | Aliases |
|---|---|---|
| `$and[a;b;...]` | E lógico com avaliação curta. |  |
| `$eq[a;b]` | Compara igualdade textual. |  |
| `$join[separador;valor;...]` | Junta valores. |  |
| `$length[texto]` | Transformação de texto. |  |
| `$lowercase[texto]` | Transformação de texto. |  |
| `$math[a;operador;b]` | Calcula +, -, *, / ou % sem eval. |  |
| `$ne[a;b]` | Compara diferença textual. |  |
| `$not[valor]` | Inverte condição. |  |
| `$or[a;b;...]` | OU lógico com avaliação curta. |  |
| `$prop[objeto;propriedade]` | Obtém uma propriedade própria de objeto. |  |
| `$random[mínimo;máximo]` | Inteiro aleatório com ambos os limites inclusivos. |  |
| `$replace[texto;busca;substituição]` | Substitui todas as ocorrências literais. |  |
| `$timestamp` | Timestamp Unix em milissegundos. |  |
| `$trim[texto]` | Transformação de texto. |  |
| `$uppercase[texto]` | Transformação de texto. |  |

## webhooks

| Função | Descrição | Aliases |
|---|---|---|
| `$createWebhook[canal;nome]` | Cria webhook no canal e retorna suas informações. |  |
| `$deleteWebhook[id;token?]` | Apaga webhook do servidor atual com ManageWebhooks; token não contorna autorização. |  |
| `$editWebhook[id;nome;token?]` | Renomeia webhook do servidor atual com ManageWebhooks; sem token usa a autenticação do bot. |  |
| `$sendWebhook[id;token;texto]` | Envia via webhook do servidor atual com ManageWebhooks do autor e bot; token não contorna autorização. |  |
| `$webhooks[canal?]` | Lista webhooks do canal (padrão: canal atual). |  |
