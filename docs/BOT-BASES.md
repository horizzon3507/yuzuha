# Bases de bots

A CLI gera sete bases JS/TS. Cada projeto contém comandos nativos, configuração,
`.env.example`, `.gitignore`, README com exemplos, scripts e testes offline.
Não é necessário configurar banco externo nem instalar dependências de voz.

As opções desta página estão na árvore local; precisam de uma publicação para
ficarem disponíveis no npm. Na raiz da biblioteca:

```sh
npm run build
node dist/cli.js templates
node dist/cli.js templates --json
node dist/cli.js init ../meu-bot --template community --ts --local
cd ../meu-bot
npm install
npm run check
npm run typecheck
npm test
```

Para JavaScript, use `--js` e omita `npm run typecheck`. `--functions` acrescenta
um comando `eco` que usa o interpretador do Yuzuha; os demais continuam nativos.
Sem `--template`, o scaffold original permanece com ping, hello e ban.
A pasta de destino precisa ser nova; o gerador não sobrescreve projetos.

| Base | Arquivos de comandos | Finalidade |
|---|---:|---|
| `simple` | 4 | Ping, ajuda em embed, informações do bot e avatar |
| `multifunctional` | 24 | Todos os conjuntos abaixo, incluindo subcomandos |
| `moderation` | 11 | Informações, moderação com casos e autorização compartilhada |
| `community` | 9 | Informações, regras, sugestões e enquetes |
| `economy` | 10 | Informações e moedas virtuais por servidor |
| `entertainment` | 10 | Informações, dados, moeda, escolhas e bola 8 |
| `utility` | 8 | Informações, notas pessoais em DM e datas |

As contagens são de comandos raiz. Regras, sugestões, enquetes e notas incluem
subcomandos adicionais. `--functions` acrescenta um arquivo a cada base.
`templates --json` informa nome, descrição e caminhos dos comandos de cada base.

## Comandos comuns e informações

Todas as bases incluem `!ping`, `!ajuda` (`help`, `comandos`), `!sobre`
(`botinfo`) e `!avatar [@usuario]`. Todas, exceto simple, também incluem
`!perfil [@usuario]` (`userinfo`) e `!servidor` (`serverinfo`).
Ajuda, informações e imagens usam embeds. Sem menção, avatar e perfil consultam
o autor. Avatar ausente recebe resposta textual; quantidade de membros ausente
aparece como indisponível. O comando servidor recusa mensagens diretas.

## Moderação

Disponível em moderation e multifunctional:

```text
!ban @usuario motivo
!kick @usuario motivo
!timeout @usuario 10m motivo
!unban ID motivo
!caso 1
```

Ban/unban exigem BanMembers, kick exige KickMembers e timeout exige
ModerateMembers, sempre para autor e bot. As ações sobre membros verificam
hierarquia, dono, autor e bot. Unban opera pelo ID e não exige presença do alvo
no servidor. Timeout aceita de 1 segundo a 28 dias. Motivos são obrigatórios.
A consulta de casos exige ManageGuild e só consulta o servidor atual.

Ações usam `ctx.mod`, com registro de caso. Se a ação remota funcionar mas
salvar o caso falhar, o erro é parcial: não repita a ação para tentar salvar.
Os testes gerados verificam autor, bot, hierarquia e falha parcial, sem executar
moderação real.

## Comunidade

Disponível em community e multifunctional:

```text
!regras definir Respeite os membros e evite spam.
!regras ver
!sugestao enviar Criar um canal para jogos
!sugestao listar
!enquete criar Jogamos hoje?
!enquete votar sim
!enquete votar nao
!enquete resultado
!enquete fechar
```

Definir regras e criar enquete exigem ManageGuild. Regras aceitam até 3000
caracteres. Sugestões são públicas e preservam as últimas 10 entradas de até
250 caracteres, com cooldown de 30 segundos por autor/canal.

Há uma enquete de sim/não por canal. Um voto substitui o anterior do mesmo
usuário; até 1000 pessoas participam. Somente o criador encerra a enquete e
ninguém vota depois do encerramento. Criar outra exige encerrar a atual.
O resultado permanece disponível até a próxima criação. Regras, sugestões
e enquetes persistem e são isoladas por servidor; enquetes também por canal.

## Economia

Disponível em economy e multifunctional:

```text
!saldo
!saldo @usuario
!diario
!trabalhar
!pagar @usuario 25
```

São moedas virtuais, sem valor monetário ou pagamentos externos. O diário
concede 100 moedas a cada 24 horas; trabalho concede 25 a cada hora.
Os prazos ficam no store e continuam após reinício. Créditos e pagamentos
usam transações: duas solicitações simultâneas não duplicam uma recompensa nem
permitem gastar o mesmo saldo duas vezes.

Saldo e prazos são por servidor. Pagamentos aceitam inteiros de 1 a 1000000,
recusam autoenvio, bots, saldo insuficiente e overflow. Um erro de validação
não confirma débito parcial. Os testes verificam concorrência, reinício,
expiração e isolamento de servidor.

## Diversão

Disponível em entertainment e multifunctional:

```text
!dado 20
!moeda
!escolher pizza | sushi | massa
!bola8 Vai chover?
```

Dado aceita de 2 a 100 lados, com padrão de 6 (alias roll). Moeda responde cara
ou coroa (alias coinflip). Escolher aceita de 2 a 20 opções não vazias, com até
100 caracteres cada. Bola 8 (alias 8ball) responde aleatoriamente, apenas por
diversão. Nenhum desses comandos avalia expressões ou código do usuário.

## Utilidades

Disponível em utility e multifunctional:

```text
!data 2026-01-20T18:30:00-03:00
!notas adicionar Comprar café
!notas listar
!notas apagar 1
```

Notas funcionam somente em DM e são isoladas por usuário, com até 10 entradas
de 300 caracteres. Apagar uma entrada renumera as seguintes. A listagem recusa
canais de servidor. Datas exigem ISO com fuso explícito e retornam UTC e Unix
em segundos; datas inválidas são recusadas.

## Configuração, dados e testes

`yuzuha.config.js` ou `.ts` define nome, prefixo e pasta dos comandos. Os comandos
usam os serviços do contexto; as bases de estado incluem `helpers/state.js`
ou `.ts` para validar valores salvos. Ao mudar helpers, reinicie o processo:
o watcher observa os arquivos de comando, sem invalidar todo o grafo ESM.

O store padrão da CLI persiste dados no diretório XDG do bot. Troque `name` na
config para separar instalações independentes. Não compartilhe o mesmo store
JSON entre processos escritores; veja [STORAGE.md](STORAGE.md).

`npm run check` importa a config sem fazer login. `npm test` usa MockTransport,
recursos simulados e MemoryStore. TypeScript também oferece `npm run typecheck`.
Para execução real, configure FLUXER_BOT_TOKEN no ambiente ou no `.env` e execute
`npm run dev` ou `npm start`. Veja [QUICKSTART.md](QUICKSTART.md).
