# Dados por servidor: contador com incrementos atômicos

Implemente um contador por servidor e escolha entre `get`, `set`, `update` e
transações sem perder incrementos. O estado usa o store configurado no bot, sem
exigir que o handler abra arquivos ou acesse SQLite diretamente.

## Escolher o escopo

| Acesso | Compartilhamento |
|---|---|
| `ctx.data.guild` | Mesmo servidor |
| `ctx.data.user` | Autor atual |
| `ctx.data.global` | Todo o store do bot |
| `ctx.data.userFor(id)` | Usuário escolhido explicitamente, em contexto de servidor |

Use `guildOnly: true` em comandos que dependem do servidor. Uma chave chamada
`contador` em `guild` não é a mesma chave em `user` ou `global`.

Os valores persistidos são JSON: objetos, arrays, strings, números finitos,
booleanos e `null`. Funções e recursos de processo não são valores persistíveis.

## Incrementar com uma operação atômica

```ts
import { defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'contar',
  guildOnly: true,
  async run(ctx) {
    const total = await ctx.data.guild.update('contador', current => {
      if (typeof current !== 'number') {
        throw new Error('O contador armazenado precisa ser um número.');
      }
      return current + 1;
    }, 0);
    await ctx.reply(`Contagem: ${total}`);
  },
});
```

Partindo de uma chave ausente, `!contar` responde `Contagem: 1`. Duas execuções
concorrentes a partir de zero geram `Contagem: 1` e `Contagem: 2`, sem perder
incrementos.

O `0` é o fallback quando a chave não existe. O callback recebe o valor atual e
retorna o próximo; ele precisa ser síncrono. O store serializa a atualização e
confirma o estado validado. Se o callback lançar, a alteração não é confirmada.

Ler com `get`, somar e gravar com `set` pode perder incrementos quando dois
comandos leem o mesmo número. O `update` mantém leitura e escrita na mesma
transação. Não faça HTTP, replies ou moderação dentro do callback de estado:
efeitos externos não são desfeitos por rollback.

## Ler e escrever configurações

```ts
await ctx.data.guild.set('boasVindas', { canal: '123', habilitado: true });
const configuracao = await ctx.data.guild.get('boasVindas', null);
```

O fallback de `get` não escreve uma chave. Leituras devolvem cópias isoladas,
portanto alterar um objeto recebido não confirma uma nova configuração. Use
`set` ou `update` para persistir. Valide o formato de dados antigos antes de
usá-los em uma operação.

## Expirar dados temporários

```ts
await ctx.data.user.set('rascunho', { texto: 'Ainda em edição' }, { ttlMs: 60_000 });
const restante = await ctx.data.user.ttl('rascunho');
await ctx.data.user.expire('rascunho', null);
```

`ttlMs` é um intervalo em milissegundos, e `ttl` consulta o tempo restante.
O `expire(..., null)` remove a expiração e torna a chave persistente.

Um `set` sem TTL também grava sem prazo. O `update` conserva o prazo de um valor
ainda vivo, e a leitura de um valor expirado usa o fallback. Consulte os
[valores especiais retornados por `ttl`](../STORAGE.md) antes de tratar o
resultado.

## Escolher o backend

Memória é útil para testes e dados descartáveis. JSON usa substituição atômica
de arquivo. SQLite usa WAL e transações para processos concorrentes.

Os caminhos padrão seguem XDG. Escolher um nome de bot diferente separa o estado
padrão. Trocar de backend não migra dados automaticamente.

## Encerrar stores compartilhados

Stores fornecidos ao bot continuam pertencendo ao chamador. Aguarde
`bot.destroy()` antes de fechar um store compartilhado. A CLI fecha os stores
da configuração durante seu próprio ciclo de vida.

Para transações entre chaves, backup, restauração e falhas parciais, consulte o
[guia de estado e persistência](../STORAGE.md). Para scripts, veja as
[transações declarativas](../LANGUAGE.md) e a assinatura de
[`$dataTransaction` no catálogo de funções](../FUNCTIONS.md).
