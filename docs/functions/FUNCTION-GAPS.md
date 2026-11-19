# Cobertura segura e exclusões

Contrato da v0.8.0 sobre o SDK fixado no lockfile: **100,00% de cobertura
segura (934/934), zero pending** no inventário atual. As funções canônicas e seus aliases estão na
[referência gerada](FUNCTIONS.md).

A fonte de verdade é a [matriz semântica](../PARITY-MATRIX.md), gerada dos
JSONL por área em `scripts/parity/`. Ela inclui core/builders/types e os
satélites voice/sharding/rest/ws/collection/util. Contagens e porcentagem
atualizadas estão na matriz, não duplicadas neste documento.

## Áreas entregues

| Área / arquivo JSONL | Escopo seguro coberto | Base existente |
|---|---|---|
| pure | CDN, inviteUrl, constantes/flags/bitfields, parsing/guards, erros, helpers de instância e operações declarativas de coleção | ctx.cdn, helpers SDK e funções de arrays/texto; não é acesso JS arbitrário |
| resources | Sem entradas pendentes; operações administrativas usam guardas de dono e retornos normalizados | ctx.resources.instance/cache/self/gateway/webhooks/collectors e snapshots de shard/cluster |
| entities | Campos normalizados e operações de guild/canal/thread/membro/mensagem: discovery, transferência de dono, role hoist, grupo de DM, acks/read-state, self settings de thread, stickers em lote | Ports users/channels/threads/messages/roles/expressions; autorização e mocks compartilhados |
| events | Eventos seguros de ClientEvents com ator, contexto parcial e redação de dados sensíveis | Eventos contextuais nativos já abrangem o SDK; script-events.ts adapta os eventos seguros do SDK e seis eventos de voz |
| voice | Estados de voz, participantes e controle declarativo de áudio/música | VoiceStateTracker, ports voice/music, FluxerVoice, plugin Lavalink e filas |

As cinco áreas estão sem pendências nesta release. Para novas APIs do SDK,
acrescente classificação explícita antes de implementar; não invente um segundo registro. Eventos de voz
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
`$awaitMessage` retorna só conteúdo e `$awaitReaction` só usuário.
`$collectMessages` e `$collectReactions` retornam resultados normalizados de uma
janela limitada no canal atual, sem listeners arbitrários.

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

Persistência ainda requer desenho para índices por propriedades; SQLite já
usa escritas pontuais de variáveis/casos. Upload de rede sem acumular bytes
depende de suporte do SDK.
São evoluções de contrato próprias, não justificativas para expor transporte cru.
Para operações nativas complexas, use o [guia JS/TS](../NATIVE.md).
