# Funções que ainda faltam

Contrato para a meta v0.8.0, sobre o SDK fixado no lockfile; não é uma declaração
de paridade já concluída. O registro atual tem **336 funções canônicas**;
aliases não aumentam esse número.

A fonte de verdade é a [matriz semântica](../PARITY-MATRIX.md), gerada dos
JSONL por área em `scripts/parity/`. Ela inclui core/builders/types e os
satélites voice/sharding/rest/ws/collection/util. Contagens e porcentagem
atualizadas estão na matriz, não duplicadas neste documento.

## Pendências divididas para PRs paralelos

| Área / arquivo JSONL | Escopo seguro ainda a implementar | Base existente |
|---|---|---|
| pure | CDN, inviteUrl, constantes/flags/bitfields, parsing/guards, erros, helpers de instância e operações declarativas de coleção | ctx.cdn, helpers SDK e funções de arrays/texto; não é acesso JS arbitrário |
| resources | Instância/aplicação, cache, self sem segredos sudo, gateway validado, mensagens de webhook, collectors completos e informação limitada de shard | ctx.resources.instance/cache/self/gateway/webhooks/collectors, bot.shard/ctx.shard; suporte nativo de sharding e cluster já existe |
| entities | Campos normalizados e operações de guild/canal/thread/membro/mensagem: discovery, transferência de dono, role hoist, grupo de DM, acks/read-state, self settings de thread, stickers em lote | Ports users/channels/threads/messages/roles/expressions; autorização e mocks compartilhados |
| events | Eventos ClientEvents ainda sem scriptEvent, com ator, contexto parcial e redação de dados sensíveis | Eventos contextuais nativos já abrangem o SDK; script-events.ts adapta seis eventos |
| voice | Estados de voz, participantes e controle declarativo de áudio/música | VoiceStateTracker, ports voice/music, FluxerVoice, plugin Lavalink e filas |

Os nomes acima são áreas, não novos nomes de funções. Consulte cada linha
pending antes de implementar; não invente um segundo registro. Eventos de voz
do pacote voice pertencem à área voice; eventos ClientEvents, inclusive estados
de voz, pertencem à área events.

## Equivalência não é coincidência de nomes

Embeds usam partes tipadas (`$embed`, `$title`, `$fields`, etc.), não builders
mutáveis. Payloads usam objetos validados e envio autorizado. Dados expostos
por recursos podem ser lidos por `$prop`; a linha da matriz indica o recurso,
a composição e as diferenças de normalização.

A existência de um método em `ctx.resources`, um nome parecido em um builtin,
ou um reexport em `yuzuha/sdk` **não** comprova acesso por function mode.
Por exemplo, coletores nativos oferecem streams e resultados completos;
`$awaitMessage` retorna só conteúdo e `$awaitReaction` só usuário. As operações
de coletor mais amplas permanecem pending até terem contrato declarativo.

## Exclusões documentadas

Não são wrappers a implementar: login/destroy/emit, raw ws/REST/Routes,
broadcastEval/eval, construtores/iteradores, _patch/campos internos, credenciais
e segredos sudo. Categorias: internal, credentials, lifecycle, eval,
raw-transport e data-only. Tipos apagados e identidade de classes não representam
operações de script; propriedades públicas úteis continuam pending quando não
há normalização, em vez de serem descartadas como data-only.

Não há `$eval` de JavaScript nem reinterpretação de texto de usuário como código.
Plugins JS/TS são código confiável e não alteram esta fronteira.

## Como fechar uma pendência

Siga a [receita em PARITY.md](../PARITY.md#adicionar-uma-função-e-atualizar-o-contrato):
implemente sobre ports autorizados, teste normal/vazio/erro, altere a linha
existente do seu JSONL para function/equivalent e regenere docs. Mantenha uma
entrada por linha sem reordenar áreas de outros PRs. `npm run check` permite
pending, mas rejeita classificações ausentes/obsoletas/duplicadas e funções
inexistentes. A release exige `node scripts/parity-matrix.mjs --check --release`
com zero pending.

## Limites da própria linguagem

Persistência ainda requer desenho para índices por propriedades e escritas
incrementais; upload de rede sem acumular bytes depende de suporte do SDK.
São evoluções de contrato próprias, não justificativas para expor transporte cru.
Para operações nativas complexas, use o [guia JS/TS](../NATIVE.md).
