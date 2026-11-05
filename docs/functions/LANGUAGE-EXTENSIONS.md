# Loops e operações de dados

Recursos acrescentados na 0.1.7. Todos usam o mesmo runtime, contexto e orçamento
do comando; não executam JavaScript contido nos dados.

## While e controle de loops

`$while[condição;corpo;...]` reavalia a condição antes de cada iteração. O limite
é de 1000 iterações, além dos limites de chamadas, saída, profundidade e prazo.
`$loopIndex` começa em zero e já está disponível na condição.

```text
$let[n;0]
$while[$ne[$get[n];4];
  $let[n;$math[$get[n];+;1]];
  $if[$eq[$get[n];2];$continue];
  $reply[Passo $get[n]]
]
```

O comando responde nos passos 1, 3 e 4. `$break` encerra o loop mais próximo;
`$continue` pula o restante da iteração. Funcionam também em `$repeat` e
`$forEach` e atravessam `$try`. Callbacks de arrays e condições de while não são
alvos desses sinais: chamadas ali são recusadas. Estado do loop externo é
restaurado inclusive em caso de erro, cancelamento ou moderação parcial.

O retorno concatena argumentos do corpo que terminaram normalmente. Um
argumento interrompido não devolve seu texto parcial. Efeitos já concluídos,
como respostas enviadas, continuam aplicados.

## Comparadores de arrays

`$arraySortWith[array;comparador]` usa `$sortLeft` e `$sortRight` na expressão.
O resultado deve ser um número finito: negativo posiciona o item da esquerda
antes, zero preserva a ordem e positivo posiciona o da direita antes.

```text
$reply[$jsonEncode[$arraySortWith[$array[3;1;2];$math[$sortLeft;-;$sortRight]]]]
```

Resposta: `[1,2,3]`. A ordenação é estável, não altera o original e aceita até
1000 itens e 10000 comparações. O orçamento de chamadas do runtime também se
aplica: comparadores complexos podem esgotá-lo antes desse teto. Comparadores
aninhados restauram os operandos. Guards e falhas parciais atravessam `$try`.

## Regex com limites

- `$regexTest[texto;padrão;flags?;timeoutMs?]` retorna booleano.
- `$regexMatch[texto;padrão;flags?;timeoutMs?]` retorna correspondências com
  `value`, `index`, `captures` e `groups`. Capturas ausentes são null.
- `$regexReplace[texto;padrão;substituição;flags?;timeoutMs?]` retorna texto.

```text
$reply[$regexReplace[Yuzuha 17;Yuzuha (.+);Versão $1;;2000]]
```

Resposta: `Versão 17`. A substituição aceita referências de captura do RegExp
do JavaScript, incluindo `$1`, `$<nome>`, `$&` e `$$`. Esses dados não viram
funções Yuzuha. Escape delimitadores do script presentes no padrão: `\[` e
`\]` representam os colchetes de uma classe regex.

Flags: `g`, `i`, `m`, `s` e `u`, sem repetição. Sem `g`, match/replace usam só a
primeira correspondência. Índices são offsets UTF-16; correspondências vazias
com `u` avançam por ponto de código.

Cada operação usa um worker, com até quatro simultâneos. O prazo padrão é
500 ms, incluindo inicialização, configurável entre 10 e 2000 ms. O worker
encerra ao terminar, cancelar ou exceder o prazo. Backtracking pesado não
prende a thread do bot; o worker não executa JavaScript fornecido pelo script.

Limites: texto de 100000 caracteres, padrão de 512, substituição de 1000,
1000 correspondências e saída de 100000 caracteres. O runtime pode ter limites
menores. `$try` não captura prazo, cancelamento nem excesso de saída. Padrões
e flags inválidos são erros operacionais tratáveis.

## Decimais exatos

`$decimal[a;operador;b;casas?]` aceita `+`, `-`, `*`, `/` e `%`. Valores são
strings decimais com ponto e sem expoente, com até 1000 dígitos. O cálculo usa
BigInt, sujeito a esse orçamento, sem converter operandos para Number.

```text
$reply[$decimal[0.1;+;0.2]]
$reply[$decimal[9007199254740993;+;1]]
$reply[$decimal[2;/;3;2]]
```

Respostas: `0.3`, `9007199254740994` e `0.67`. A divisão usa 18 casas por padrão.
Quando casas é informado, arredonda o resultado; empates se afastam de zero.
Zeros finais e zero negativo são normalizados. O resultado respeita o limite
de 1000 dígitos; divisão por zero é recusada.

`$decimalCompare[a;b]` retorna -1, 0 ou 1. `$decimalRound[valor;casas]` arredonda
com a mesma regra. JS/TS exporta `decimal`, `decimalCompare` e `decimalRound`
de `yuzuha`, com contratos equivalentes.

## Recursos do servidor

`$guildFeatures` copia o array de features do servidor atual. `$leaveGuild`
solicita a saída do bot, somente quando o autor é dono do servidor. Os
equivalentes JS/TS são `ctx.guildFeatures()` e `ctx.leaveGuild()`.

Ambos recusam DMs. Um bot que seja dono não pode sair. Recursos customizados
podem omitir as capacidades novas sem quebrar contratos anteriores; os
auxiliares retornam `NATIVE_UNAVAILABLE` quando a capacidade não é fornecida.
Falhas de rede são propagadas sem repetição automática.
