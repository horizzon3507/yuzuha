# Function mode (opcional)

O function mode é uma linguagem de scripts declarativa opcional. Ele não faz
parte da superfície nativa: a raiz `yuzuha` não carrega parser, runtime nem
builtins. Para usá-lo em comandos com `code`, eventos de script ou plugins com
`functions`, instale um engine explicitamente:

```ts
import { Yuzuha, MemoryStore } from 'yuzuha';
import { functions, script } from 'yuzuha/functions';

const bot = new Yuzuha({
  transport,
  store: new MemoryStore(),
  engine: functions(),
});

bot.command(script({ name: 'ola', code: '$reply[Olá, $username!]' }));
```

Também é possível instalar depois com `bot.useEngine(engine)`. Registrar
`code` ou `scriptEvent` sem engine falha com `FUNCTIONS_REQUIRED`. A CLI injeta
`functions()` automaticamente, então `yuzuha.config.js` e `init --functions`
não exigem configuração extra.

## Documentos

- [LANGUAGE.md](LANGUAGE.md): sintaxe da linguagem de scripts.
- [FUNCTIONS.md](FUNCTIONS.md): referência gerada das 336 funções.
- [LANGUAGE-EXTENSIONS.md](LANGUAGE-EXTENSIONS.md): operações de dados e extensões.
- [FUNCTION-GAPS.md](FUNCTION-GAPS.md): lacunas conhecidas e como contorná-las.
