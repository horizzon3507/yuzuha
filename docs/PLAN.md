# Plano de implementação do Yuzuha

## Objetivo e experiência

Ser um Fluxer.js melhorado: manter o SDK e o gateway originais e entregar a
ergonomia que falta para bots — comandos, argumentos tipados, guards, estado,
moderação, recursos, agendamentos, HTTP e testes offline. Function mode é um
adaptador opcional, não a identidade do projeto. Implementação original em
TypeScript, saída ESM e declarações de tipos. Node >=22.13.

Exemplo de aceite central (JS/TS):

```ts
import { arg, defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'ban',
  args: { membro: arg.user().required(), motivo: arg.text().rest() },
  async run(ctx) {
    const caso = await ctx.mod.ban(ctx.args.get('membro'), {
      reason: ctx.args.get('motivo') ?? '',
    });
    await ctx.reply(`Membro banido. Caso #${caso.id}.`);
  },
});
```

O mesmo caso de uso em function mode, disponível em `yuzuha/functions`:

```text
$modBan[$mentioned[1];$messageSlice[1]]
$reply[Membro banido. Caso #$caseID.]
```

As duas formas compartilham guards, permissões, moderação, persistência e
recursos. O runtime de scripts só é registrado quando o function mode é usado.

## Arquitetura e decisões

1. SDK: fixar `@fluxerjs/core` 3.3.0, reexportar em `yuzuha/sdk` e expor
   `bot.client`. Não reimplementar gateway, REST, cache ou voz. Atualizações do SDK
   exigem revisão da matriz de cobertura e testes do adaptador.
2. Entrypoints: `yuzuha` é nativo; `yuzuha/functions` contém parser, AST,
   evaluator, `Runtime`, `registerBuiltins` e `script()`. `yuzuha/sdk`,
   `yuzuha/testing` e os auxiliares de editor em `yuzuha/tooling` completam a superfície pública.
3. Ativação do function mode: registrar um comando com `code` ou um evento de script chama
   `bot.enableFunctions()` automaticamente. `bot.enableFunctions()` é idempotente
   e permite pré-carregar o runtime. Comandos 100% nativos não registram builtins.
4. Transporte: interface pequena, tipada e substituível. Adaptador Fluxer real e
   adaptador em memória para testes sem token. Objetos de mensagens preservam os
   dados usados pelo contexto; acesso ao objeto original é explícito.
5. Linguagem: parser recursivo para texto e `$nome[argumentos]`; `;` separa
   argumentos, `\` escapa delimitadores. AST com offsets, linha e coluna. Chamadas
   são awaitadas da esquerda para a direita. Dados de usuário nunca são
   reinterpretados como código.
6. Execução: registro extensível de funções, avaliação preguiçosa para guards e
   condicionais, valores tipados quando uma expressão ocupa todo o argumento,
   variáveis locais, orçamento de chamadas/profundidade/saída e prazo cooperativo.
   Sem eval, Function ou acesso JS arbitrário dentro da linguagem. Plugins JS são
   código confiável; limites cooperativos não constituem sandbox de processos.
7. Framework: prefixos, aliases, argumentos declarativos opcionais, middleware,
   cooldown, permissões, hooks e carregamento de comandos JS/TS. Novo conjunto de
   comandos só substitui o anterior após carregar e validar todos os arquivos.
8. Moderação: checagens compartilhadas entre JS/TS e scripts, permissões efetivas,
   hierarquia do autor e do bot, proteção do dono/bot/autor, casos por servidor.
   Não repetir uma ação se o registro posterior falhar: erro parcial específico.
9. Estado: memória, JSON com substituição atômica e SQLite com WAL e transações
   para processos concorrentes; numeração de casos e variáveis por escopo.
   Arquivos fora do cwd por padrão via XDG. Falha de leitura não apaga dados.
10. CLI: scaffolds JS/TS com `init`, execução/recarga com `run`/`dev`, diagnóstico
    com `check`/`doctor`, `lint` textual, catálogos de funções, cenários offline
    e manutenção de dados. Nenhuma ferramenta de validação faz login.

## Entregas e dependências

A atualização 0.1.8 amplia buscas com filtros do SDK, paginação de
fixadas por timestamp, paginação de usuários de reações e consulta individual
de membros de threads. O catálogo passa a 310 funções, preservando os exports
do SDK 3.3.0. A mesma revisão corrige
propagação de erros protegidos no JSON, validação de saída antes de persistir
operações de estado, autorização de expressões, endereços IPv6 e redirects no
HTTP, ciclo de vida dos leitores de streams, prazo monotônico do evaluator e
limpeza/admissão dos cooldowns. A deduplicação de mensagens deixa de varrer
cooldowns; a coleta só ocorre quando há expiração possível ou pressão de capacidade.
A entrega inclui as sete bases JS/TS da CLI e documenta os requisitos de
adaptação de recursos customizados em [VERSIONING.md](../VERSIONING.md).

A atualização 0.1.7 distribui o conteúdo preparado na 0.1.6 e acrescenta busca
por nome, alias e descrição em `yuzuha functions --search <termo>`, combinável
com os filtros e formatos existentes. Acrescenta 18 funções de controle de loops,
ordenação, regex, decimais e servidor; o catálogo passa a 306. SDK e schema
permanecem iguais.

A atualização 0.1.6 prioriza o custo de despacho: deduplicação circular,
prefixos reaproveitados, mensagens ignoradas sem contexto de execução,
cancelamento compartilhado, serviços/mapas sob demanda e tokenização simples
por trechos. Registro individual deixa de copiar o catálogo; carga/recarga
mantêm a transação de registro. Parser, evaluator, leituras pontuais em memória/JSON
e statements SQLite recebem otimizações verificadas contra a 0.1.5.

`yuzuha/music` reúne cliente Lavalink v4, filas limitadas e controles por servidor.
`MusicBackend` separa o serviço de players do protocolo de rede. `FluxerVoice`
usa o pacote oficial de voz sob demanda, sem reimplementar codec, gateway ou
LiveKit. `FluxerLavalinkBridge` implementa `MusicAudioOutput`: consome a saída
WebM/Opus do plugin `yuzuha-audio` fornecido em `bridges/lavalink/` e a publica
pelo SDK oficial. A ponte usa a conexão de voz do Fluxer e não depende de um evento
de fim no SDK de voz. O plugin usa a API pública do Lavalink 4.2.2, extração ritmada de
frames, I/O assíncrono e limite de saídas. A integração local verifica áudio
sintético e decoder reais; a publicação na sala LiveKit é simulada.
Contratos, ciclo de vida, capacidades e limites estão em [MUSIC.md](MUSIC.md).
Música é nativa nesta versão; o catálogo de scripts continua em 288 funções.
O refinamento inclui reconstrução automática de sessões perdidas com concorrência
limitada, preservação de sessões retomadas, balanceamento por carga, controles
pendentes limitados, edição/paginação de filas e buscas compartilhadas com
cancelamento independente. Uma sessão antiga não confirma transações de fila.

A atualização 0.1.5 acrescenta subcomandos e flags tipadas, ajuda e uso derivados
dos metadados, scaffolds com dependência npm e testes offline gerados. O helper
`createTestBot` reúne fixtures e relógio controlável para cooldown, TTL e tarefas.
Grupos preservam suas restrições nos filhos e a recarga continua atômica.
O SDK permanece em 3.3.0, o schema em 2 e o catálogo em 288 funções.

A atualização 0.1.4 acrescenta autorização compartilhada para mutações de cargos,
canais e webhooks, eventos no function mode, cron com fuso IANA e concorrência
limitada, streaming/multipart e políticas HTTP por comando. Inclui manutenção de
estado, backups/restauração com simulação, otimizações de cópia nas transações,
CLI de lint/catálogos/cenários e 19 funções novas, totalizando 288. Os contratos
estão em [EVENTS.md](EVENTS.md), [SCHEDULER.md](SCHEDULER.md),
[HTTP.md](HTTP.md) e [STORAGE.md](STORAGE.md).

A atualização 0.1.3 acrescentou moderação de voz com casos, listagem de threads,
canais de link/avisos, perfis e contagens ao vivo, TTL e transações declarativas,
histórico e heartbeat de tarefas, cancelamento integrado e logs opcionais.
O editor inclui diagnósticos e catálogos JSON de plugins; benchmarks comparam
baselines e exercitam catálogos/payloads maiores e séries de memória.

A atualização 0.1.2 acrescentou mensagens diretas/encaminhamento/busca e cursores,
busca de membros e apelidos com autorização compartilhada, gestão de threads e
servidor, convites/vanity, clonagem de expressões e anexos binários/múltiplos.
Também inclui edição/pausa/retomada e retry configurável no scheduler,
transações de dados entre chaves, diagnóstico CLI offline, extensão VS Code
com metadados gerados e benchmarks locais reproduzíveis. O SDK continua em 3.3.0.

| Fase | Conteúdo | Aceite |
|---|---|---|
| A | Estrutura, entrypoints, dependência SDK e contratos | Instalação e tipos do SDK inspecionados; raiz sem parser |
| B | Framework nativo de comandos, eventos e plugins | Dispatch, aliases, guards, erros e recarga atômicos |
| C | Store e serviços de moderação | Persistência, concorrência e falha parcial testadas |
| D | Recursos do Fluxer | Usuários, cargos, canais, mensagens, threads, webhooks e convites com mocks |
| E | Function mode isolado | Parser, AST, runtime, 310 funções e ativação sob demanda |
| F | Agendamentos, HTTP e limites | Cron/fusos, concorrência, retry, recuperação, streaming/multipart e políticas de rede |
| G | CLI, exemplos e documentação | Scaffolds, lint/catálogos/cenários offline, manutenção de dados e guias nativos |
| H | Integração e empacotamento | Typecheck, testes, build, tarball e import de consumidor passam |

## Bases de bots na CLI

O gerador oferece simple, multifunctional, moderation, community, economy,
entertainment e utility, listadas por `yuzuha templates`. A multifuncional reúne
24 comandos raiz e subcomandos. Enquetes, regras, sugestões, notas e moedas
virtuais usam os serviços de estado; moderação usa autorização e casos existentes.
Todos os projetos incluem testes offline, JS/TS e function mode opcional.
Não há mudança no catálogo de funções ou no SDK. Veja [BOT-BASES.md](BOT-BASES.md).
