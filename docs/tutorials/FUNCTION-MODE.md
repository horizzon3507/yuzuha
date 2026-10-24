# Function mode: crie seu primeiro script

Function mode é uma forma opcional de escrever o corpo de comandos com
`$função[argumentos]`. O bot, o contexto e as regras de autorização continuam
sendo os da Yuzuha. O caminho principal da biblioteca permanece JS/TS nativo.

## Registrar um comando

Salve este arquivo no diretório de comandos configurado:

```ts
import { script } from 'yuzuha/functions';

export default script({
  name: 'eco',
  description: 'Repete o texto recebido.',
  code: '$reply[$message]',
});
```

Valide a configuração com `yuzuha check`. Registrar um comando com `code` ativa
os builtins sob demanda. Você pode misturar esse arquivo com comandos
`defineCommand` que usam um handler `run`.

## Ler a sintaxe

Em `$reply[$message]`, o runtime resolve `$message` e entrega seu resultado como
argumento de `$reply`. O ponto e vírgula (`;`) separa argumentos, enquanto
`[` e `]` delimitam uma chamada. Uma quebra de linha não separa argumentos, e
aspas não têm significado especial para o parser da linguagem.

Este exemplo grava e recupera uma variável local:

```text
$let[nome;Ana]
$reply[Olá, $get[nome]!]
```

`$let` grava a variável e não produz texto. `$get` recupera o valor. Essas
variáveis desaparecem ao fim da execução; elas não são dados persistentes.

## Não executar dados recebidos

Se alguém enviar `!eco $ban[123;motivo]`, o valor recebido por `$message`
continua sendo texto. O runtime não recompila esse dado nem executa um
banimento.

Funções JS registradas por plugins são código confiável. Scripts não oferecem
JavaScript embutido, `eval` ou acesso arbitrário ao processo.

## Preservar valores tipados

```text
$let[numeros;$array[1;2;3]]
$reply[$jsonEncode[$get[numeros]]]
```

Uma expressão isolada pode retornar array, objeto, número ou booleano. Quando o
valor é interpolado em prosa, ele é convertido para texto. Use `$jsonEncode`
quando precisar de uma representação JSON explícita.

Texto literal no nível principal pode virar resposta automática. Prefira
`$reply` para controlar o envio.

## Executar somente o ramo escolhido

```text
$if[$eq[$message;oi];$reply[Olá!];$reply[Envie oi.]]
```

Somente o ramo escolhido é executado. Esta gramática usa uma chamada `$if` com
dois ou três argumentos, sem blocos `$endif` ou `$else`. Para comparar dados
arbitrários, prefira `$eq` e `$ne` a condições textuais com operadores no meio.

## Tratar erros sem esconder recusas

`$try[operação;fallback]` trata falhas operacionais. Guards, limites de
execução, cancelamento e moderação parcialmente concluída atravessam `$try`.
O fallback não permite continuar um comando cuja autorização foi recusada.

O script inteiro compartilha os limites de chamadas, profundidade, saída e
prazo.

## Encontrar uma função

Use a busca da CLI:

```sh
yuzuha functions --search mensagem
yuzuha functions --search reply --category messages
yuzuha functions --search '$arrayMap' --json
```

A busca ignora maiúsculas e procura nome, aliases e descrição. Na documentação,
a área Funções separa o catálogo por categoria e oferece uma página para cada
assinatura. Aliases não aumentam a contagem canônica de funções.

Consulte a [sintaxe e as regras de avaliação](../LANGUAGE.md), o
[catálogo completo de funções](../FUNCTIONS.md) e os
[eventos de script](../EVENTS.md).
