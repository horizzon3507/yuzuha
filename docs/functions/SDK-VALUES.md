# Valores do SDK no function mode

Os helpers de valores não buscam recursos nem alteram o client. Funcionam em
DMs e eventos sem mensagem, sem exigir permissões de servidor. A autorização
da operação original continua valendo ao inspecionar um erro com `$sdkError`.

## URLs e instância

```text
$cdnURL[media]
$cdnURL[displayAvatar;123456789012345678]
$cdnURL[guildSplash;123456789012345678;hash]
$cdnURL[memberAvatar;123456789012345678;987654321098765432;hash;512;webp]
$inviteURL[MeuConvite]
$instanceValue[discoveryURL;https://fluxer.exemplo/api/v1]
```

`$cdnURL` usa `media` e `static_cdn` da instância; `cdn.mediaBase` substitui
somente `media`. `$inviteURL` usa `invite` da instância ou a base HTTP(S)
informada, sem credenciais, consulta ou fragmento. Use hash vazio para recurso
ausente: o resultado é `null`, exceto em `displayAvatar`, que usa o avatar
padrão. IDs longos devem ser texto decimal. O tamanho solicitado passa pelo
ajuste automático do SDK para cada tipo de recurso. `$instanceValue[parse;...]`
e `$instanceValue[resolve;...]` devolvem dados; não fazem discovery de rede.

## Constantes e flags

```text
$sdkConstant[ChannelType;GuildText]
$sdkConstant[ErrorCodes;InvalidInvite]
$flags[permissions;has;Administrator;SendMessages]
$flags[bits;resolve;$jsonDecode[\["9007199254740993", "2"\]]]
```

`$sdkConstant` só aceita nomes da lista do SDK exposta pelo builtin e lê apenas
chaves próprias. Constantes CDN hospedadas continuam distintas das bases do
contexto. Os bitfields aceitam nomes exatos, máscaras decimais e listas de ambos.
Use strings em listas JSON para máscaras acima de (2^{53}-1); números
arredondados são rejeitados. Resultados numéricos de máscaras sempre são texto
decimal, inclusive dentro de objetos.

## Coleções locais

Use um array de pares `[chave, valor]` na ordem de inserção. O limite é de 1000
pares; chaves são textos ou inteiros seguros, sem duplicatas. Para operadores
como map, filter e sort, use os combinadores de array: em callbacks,
`$loopValue` contém o par inteiro. Para coleções com capacidade,
`$sdkCollection[set;...]` retorna os novos pares em `entries` e o par removido
em `evicted` (ou `null`). A entrada não é alterada.

```text
$let[pares;$array[$array[a;1];$array[b;2]]]
$sdkCollection[set;$get[pares];c;$jsonDecode[3];2]
$jsonGet[$arrayFind[$get[pares];$arrayGet[$loopValue;0]==b];1]
```

## Erros

`$sdkError[info;operação]` executa a expressão uma vez. Só serializa tipos
reconhecidos do SDK: tipo do erro, código conhecido e metadados REST permitidos
(status, método, possibilidade de retry e dados de rate limit). Quando não há
erro, `info` e `text` retornam `null`; `isFluxer` só é verdadeiro para um
`FluxerError` real. Mensagem, stack, URL, corpo e causa não são expostos.
Guards, limites, cancelamentos e falhas parciais são propagados.
