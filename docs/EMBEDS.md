# Embeds e mensagens

Referência dos embeds de envio e de leitura, das opções de mensagem e dos limites
validados pelo Yuzuha. Vale para a API nativa (`ctx.reply`, `ctx.send`, `ctx.edit`)
e para o function mode (`$reply`, `$sendMessage`, `$editMessage`), que usam as
mesmas regras.

Os limites seguem o `EmbedBuilder` de `@fluxerjs/core` 3.3.0. Regras sem fonte no SDK
ou no servidor estão marcadas abaixo. Só uma validação ao vivo, em servidor de teste,
confirma esses pontos.

## Modelo de embed

| Campo | Tipo | Limite | Observação |
|---|---|---|---|
| `url` | URL HTTP(S) | — | Torna o título clicável. |
| `title` | texto | 256 | |
| `description` | texto | 4096 | |
| `color` | número, `#RRGGBB`, `r,g,b` ou nome | 0 a 0xFFFFFF | Nomes: `black`, `white`, `gray`, `red`, `orange`, `yellow`, `green`, `cyan`, `blue`, `purple`, `pink`. |
| `timestamp` | ISO-8601 com fuso | — | Ex.: `2026-01-20T21:30:00Z`. Na função, `$embedTimestamp[agora]` usa o instante atual. |
| `author` | `{ name, url?, iconURL? }` | nome: 256 | `url` e `iconURL` são HTTP(S). |
| `fields` | `[{ name, value, inline? }]` | 25 campos; nome 256; valor 1024 | Valor vazio só em campo `inline`. |
| `footer` | `{ text, iconURL? }` | texto: 2048 | Rodapé sem texto é erro. |
| `image` | `{ url, description? }` | `description` (alt text): 1024 | |
| `thumbnail` | `{ url, description? }` | `description` (alt text): 1024 | |

Limite total do embed: **6000 caracteres**, contando título, descrição, nome do
autor, texto do rodapé e nome e valor de cada campo. Uma mensagem aceita **10
embeds**.

### Quando um embed é aceito

O embed precisa de algum conteúdo: texto (título, descrição, campo ou rodapé),
imagem, miniatura, autor ou URL. Um embed vazio é erro `EMBED_EMPTY`.

> A regra "autor ou URL bastam" segue a proposta do plano. O SDK não impõe essa regra
> e o servidor não foi consultado offline. Confirme em servidor de teste antes de
> depender dela.

## Funções de script

Todas são funções `$` com aridade explícita. Partes são combinadas por `$embed`.

| Função | Retorno | Uso |
|---|---|---|
| `$embed[parte;...]` | embed | Combina partes e valida o resultado. |
| `$title`, `$description`, `$footer` | parte | Texto. |
| `$url[url]` | parte | Link do título. |
| `$embedTimestamp[iso\|agora]` | parte | Data do embed. |
| `$author[nome;url?;iconURL?]` | parte | Autor. |
| `$footerIcon[iconURL]` | parte | Ícone do rodapé; use depois de `$footer`. |
| `$image[url]`, `$thumbnail[url]` | parte | Imagem e miniatura. |
| `$imageAlt[texto]`, `$thumbnailAlt[texto]` | parte | Texto alternativo; combina com `$image` e `$thumbnail`. |
| `$color[cor]` | parte | Cor, conforme a tabela acima. |
| `$field[nome;valor;inline?]` | parte | Um campo. |
| `$fields[array]` | parte | Vários campos: `$array[nome;valor;true]` ou objetos `{name, value, inline}`. |
| `$addField[embed;nome;valor;inline?]` | embed | Cópia com campo no fim. |
| `$removeField[embed;índice]` | embed | Cópia sem o campo do índice (começa em 0). |
| `$editField[embed;índice;nome;valor;inline?]` | embed | Cópia com o campo substituído; sem `inline`, mantém o anterior. |
| `$embedFromObject[objeto\|json]` | embed | Monta a partir de objeto ou JSON, com as mesmas regras. |
| `$embeds[embed;...]` | lista | Lista de até 10 embeds para enviar. |
| `$addEmbed[lista;embed]` | lista | Nova lista com o embed no fim. |
| `$messageOptions[tts?;stickerIds?;flags?]` | opções | Opções para mesclar com `$jsonMerge` e um payload. |

Os embeds de `$addField`, `$removeField`, `$editField` e `$embedFromObject` são
copiados e validados a cada chamada. O resultado original não é alterado.

## Enviar mensagens com objeto

`$reply`, `$sendMessage` e `$editMessage` aceitam texto, um embed, uma lista de
embeds (`$embeds`) ou um objeto de mensagem. O objeto aceita somente estas chaves:

| Chave | Tipo | Regra |
|---|---|---|
| `content` | texto | Até 2000 caracteres. Opcional quando há embeds. |
| `embeds` | embed ou lista | Até 10 embeds. |
| `tts` | booleano | Exige `SendTtsMessages` do autor. |
| `stickerIds` | lista | Até 3 IDs numéricos. O limite de 3 é escolha do Yuzuha, não verificado no servidor. |
| `flags` | inteiro | De 0 a 2³¹−1. |
| `allowedMentions` | objeto | Veja [Menções](#menções). |

Chave desconhecida é erro `MESSAGE_KEY`. Um objeto sem conteúdo nem embeds também é erro.

```text
$sendMessage[200;$jsonMerge[$object[embeds;$array[$embed[$title[Oi]]]];$messageOptions[false;;4]]]
```

Na edição, `tts` e `stickerIds` são descartados, porque o Fluxer não os aceita em edição.

## Menções

O padrão não menciona ninguém e não envia ping ao autor respondido. Nenhuma
mensagem do Yuzuha muda esse padrão sem pedido explícito.

- `parse`, `users`, `roles` e `repliedUser: true` relaxam o padrão. Para isso, o
  **autor** do comando precisa da permissão `MentionEveryone`. Sem ela, o script
  falha com `GuardError`.
- `users` e `roles` aceitam até 100 IDs numéricos.
- `parse: []` e `repliedUser: false` não relaxam nada e não exigem permissão.

Na API nativa, `allowedMentions` é repassado como o desenvolvedor escreveu. O
código nativo já é a autoridade do bot, então a checagem de autor fica no function mode.

## Leitura

`$fetchMessage` e `$messages` devolvem `embeds` normalizados, em camelCase. Além
dos campos de envio, aparecem `type`, `provider`, `video`, `audio`, `nsfw`,
`children`, `html`, `htmlWidth` e `htmlHeight`. Esses campos são somente leitura:
`$embedFromObject` os descarta ao reenviar um embed.

```text
$embedFromObject[$jsonGet[$fetchMessage[200;123;embeds];0]]
```

## API nativa

```ts
import { embed, defineCommand } from 'yuzuha';

const resumo = embed({ title: 'Resumo', fields: [{ name: 'Mensagens', value: '1.204', inline: true }] });

bot.command(defineCommand({
  name: 'resumo',
  async run(ctx) {
    await ctx.reply({ embeds: [resumo] });
  },
}));
```

`embed()` valida e devolve uma cópia. Para o builder completo do SDK, use
`EmbedBuilder` de `yuzuha/sdk`.

## Exemplo

[examples/embeds/complete-embed.ts](../examples/embeds/complete-embed.ts) monta um
embed com autor, link, data, campos, imagem com texto alternativo e rodapé com ícone,
usando a API nativa. [complete-embed-functions.ts](../examples/embeds/complete-embed-functions.ts)
monta o mesmo embed em function mode. Os dois rodam com `MockTransport`, sem login:

```sh
npx tsx examples/embeds/complete-embed.ts
npx tsx examples/embeds/complete-embed-functions.ts
```

As duas saídas têm o mesmo conteúdo. A ordem das chaves depende da ordem em que o
embed foi montado.

## Limitações

- Alt text, a quantidade de stickers e a quantidade de IDs de menção usam limites
  escolhidos pelo Yuzuha. O SDK não os declara.
- Anexos dentro de embed (`attachment://`) não são aceitos. Use `files` ou `$sendFiles`.
- Não há validação ao vivo offline. Use um servidor de teste antes de publicar.
