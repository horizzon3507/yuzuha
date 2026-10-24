# Problemas comuns

Comece com `node --version`, `yuzuha --version` e `yuzuha check`. Para erros
de execução, configure `onError` para integrar seus logs; sem esse callback,
o framework escreve os erros em `console.error`. A mensagem enviada ao usuário
omite detalhes internos.

## Instalação e runtime

| Sintoma | O que conferir |
|---|---|
| `Cannot use import statement outside a module` | O consumidor precisa de `"type": "module"` ou arquivos `.mjs` |
| Entry point ou `dist` ausente | Rode `npm run build` na biblioteca antes de instalar/gerar o consumidor |
| Dependência `file:` ausente | Em projetos `--local`, preserve a instalação local ou troque pela versão npm do Yuzuha |
| Versão antiga na CLI | Confira `npm ls yuzuha` no consumidor e atualize a dependência |
| `node:sqlite` indisponível | Requer Node >=22.13; use JSON/memória se não precisar de SQLite |
| Aviso experimental do SQLite | Algumas versões do Node sinalizam essa API; ela só é carregada ao usar SQLite |

Imports suportados: `yuzuha`, `yuzuha/functions`, `yuzuha/sdk` e `yuzuha/testing`. Deep imports
internos não são parte do contrato distribuído.

## Config e token

`CONFIG_MISSING` significa que a CLI não achou config no diretório atual.
Passe o caminho explicitamente ou rode na pasta do bot. `commands` é relativo
à pasta da config, não necessariamente ao diretório de onde o comando foi chamado.

`TOKEN_MISSING` exige `FLUXER_BOT_TOKEN`. `run` e `dev` leem `.env` junto da
config; `bot.login()` usado diretamente só consulta o ambiente do processo.
Uma variável já definida no processo tem prioridade sobre `.env`.

`check` não faz login nem carrega `.env` automaticamente. Passar no check não
comprova validade do token, disponibilidade do servidor ou permissões remotas.

## Script não compila

| Código ou sintoma | Causa comum |
|---|---|
| `UNKNOWN_FUNCTION` | Nome incorreto ou plugin não registrado antes da carga |
| `ARITY` | Quantidade de argumentos diferente da assinatura |
| Colchete incompleto | Falta de `]` ou literal sem escape |
| Texto com `;` vira outro argumento | Escape como `\;`, usando `String.raw` em JS/TS |
| `.id` aparece como texto | Use `$prop[$get[objeto];id]`; acesso `.id` não faz parte da gramática |
| Embed acusa parte inválida | Separe cada `$title`, `$field` etc. com `;` |
| `$endif` desconhecido | Use `$if[condição;então;senão]` |

Funções não distinguem maiúsculas e minúsculas; variáveis distinguem.
`$reply[]` não possui argumento e é inválido. Consulte a
[linguagem](LANGUAGE.md) e a [referência gerada](FUNCTIONS.md).

Se o script usa uma função de plugin, valide a config em vez da pasta isolada:
`yuzuha check yuzuha.config.ts`.

## Mensagem ignorada ou comando duplicado

O framework ignora mensagens de bots, do próprio bot, prefixos alheios,
comandos desconhecidos, IDs vistos recentemente e novas mensagens durante
encerramento. Em testes, `mockMessage` cria um ID novo; reutilizar um objeto
simula duplicação.

`COMMAND_DUPLICATE` indica colisão de nome ou alias, inclusive entre arquivos
e comandos de `setup`. Comparação de nomes não distingue caixa.

## Moderação recusada ou parcialmente concluída

Autor e bot precisam da permissão adequada. O dono do servidor, o autor e
o próprio bot são protegidos. Administrador não ignora hierarquia de cargos;
timeout não pode ser aplicado a administradores.

Motivo é obrigatório e tem até 512 caracteres. Duração de timeout deve ser
positiva e até 28 dias; exclusão de histórico aceita inteiros de 0 a 7.

`MODERATION_PARTIAL` significa que a API confirmou a ação, mas o caso não foi
salvo. Preserve o erro e sua `cause`, confira o store e reconcilie o registro.
**Não repita a ação.** `$try` não captura falhas parciais.

Falha de rede após envio pode deixar o resultado desconhecido. Confira o servidor
antes de tentar novamente. Os detalhes estão em [STORAGE.md](STORAGE.md).

## Dados não aparecem ou store falha

O padrão é `~/.local/share/yuzuha/<nome>/state.json`. Um `XDG_DATA_HOME`
absoluto substitui `~/.local/share`; um caminho relativo é ignorado.
Sem nome, a pasta é `default`. Trocar `name` muda o local padrão.

`STORE_CORRUPT` preserva o arquivo em vez de reiniciar vazio. Pare os escritores,
faça backup e inspecione schema/conteúdo. Não apague o arquivo como primeira
tentativa. JSON exige uma única instância escritora por arquivo.

`STORE_INVALID` indica que a transação produziu dados fora do schema/JSON;
`STORE_ASYNC` indica callback assíncrono. Nesses casos, a atualização não é
confirmada. Faça chamadas de rede fora de `update`.

SQLite pode aguardar até 5 segundos por um lock. Transações devem ser curtas
e síncronas. Para backup por cópia, feche todos os escritores primeiro e
preserve WAL/SHM quando existirem.

## Recarga ou encerramento

`dev` observa comandos, preserva a versão anterior em erro e mantém registros
de `setup`. Config, ambiente e plugins exigem reinício. Dependências importadas
podem continuar no cache ESM. Um watcher indisponível exige reiniciar `dev`.

Para recarga manual preservando outros comandos, use `bot.reload(dir)`.
`bot.load(dir)` substitui todo o conjunto por compatibilidade.

`destroy` aguarda execuções ativas. Uma função nativa com promise pendurada
pode impedir o término, pois o prazo do runtime é cooperativo. Se você injetou
um store, feche-o após `destroy`; a biblioteca não assume sua propriedade.

## Falhas do gateway

O bot já trata os eventos `error` e `shardError` do client. Eles chegam a
`onError(error)` sem contexto de comando; teste a presença de `ctx` antes de
acessar seus campos. Quando o SDK emite ambos para a mesma falha de shard,
o framework reporta essa falha uma vez. Sem `onError`, confira a saída de erro
do processo. `destroy()` aguarda callbacks de erro pendentes, portanto um
callback que nunca termina também impede a conclusão do encerramento.
