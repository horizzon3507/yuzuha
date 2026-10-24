# Teste um comando sem token

Verifique a resposta observável de um comando pelo dispatch real. O
`createTestBot`, disponível em `yuzuha/testing`, prepara transporte simulado,
estado e relógio controlável. Ele não conecta ao gateway nem valida credenciais
reais.

## Definir uma unidade pequena

Este comando recebe um nome opcional e responde pelo contexto:

```ts
import { arg, defineCommand } from 'yuzuha';

export const hello = defineCommand({
  name: 'hello',
  args: { nome: arg.text().default('mundo') },
  async run(ctx) {
    await ctx.reply(`Olá, ${ctx.args.get('nome')}!`);
  },
});
```

Envie uma mensagem pela fixture em vez de chamar `run` diretamente quando o
teste precisar verificar parsing, guards e roteamento. O dispatch exercita essas
etapas antes do handler.

## Preparar a fixture e conferir a resposta

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestBot } from 'yuzuha/testing';
import { hello } from '../commands/hello.js';

test('hello responde com o argumento informado', async t => {
  const fixture = createTestBot({ commands: [hello] });
  t.after(() => fixture.destroy());

  const outcome = await fixture.send('!hello Ana');

  assert.equal(outcome, 'success');
  assert.equal(fixture.messages.at(-1)?.payload.content, 'Olá, Ana!');
  assert.deepEqual(fixture.errors, []);
});
```

Cada teste recebe sua própria fixture. Registre a limpeza logo após criá-la para
que ela rode mesmo quando uma asserção falhar. Não dependa da ordem dos testes
nem reutilize um store de produção.

## Cobrir situações diferentes

| Situação | Evidência a conferir |
|---|---|
| Argumento informado | Conteúdo da resposta e resultado `success` |
| Argumento omitido | Fallback documentado ou recusa de entrada obrigatória |
| Prefixo diferente | Comando ignorado, sem respostas nem efeitos |
| Flag inválida | Erro de parsing, sem executar o handler |
| Guard recusado | Ausência da ação protegida e erro esperado |
| Duas atualizações concorrentes | Ambos os incrementos presentes no estado |
| Encerramento | Recursos drenados e nenhuma tarefa pendurada |

Moderação exige casos próprios para autor, bot, hierarquia e falha parcial. Se
uma ação já foi aplicada antes de uma falha de persistência, o handler não deve
repeti-la, e o teste precisa conferir essa ausência de repetição. Esse cenário
é diferente de uma falha anterior à ação.

## Controlar o relógio e simular serviços

Para cooldown, TTL e tarefas, use o relógio controlável da fixture em vez de
esperas longas. Para HTTP e recursos, injete os mocks apropriados. Em música,
`MockMusicBackend` e `mockTrack` modelam filas e eventos sem um node Lavalink
real.

## Separar testes offline de validação ao vivo

Os testes provam comportamento contra os contratos simulados. Permissões
remotas, conexão ao Fluxer e publicação de áudio real exigem validações de
integração separadas, que não devem acontecer automaticamente na suíte offline.

Consulte [a suíte e o smoke do pacote](../TESTING.md), os
[contratos do framework](../FRAMEWORK.md) e o
[tutorial completo do primeiro comando](FIRST-COMMAND.md).
