# Escritas pontuais de estado

Node 24.21.0, macOS arm64. Medianas de três execuções por tamanho,
com 10 operações medidas e até 5 de aquecimento por cenário e store.
Cada store começa com o número indicado de variáveis **e** casos no mesmo guild.
Preparação e fechamento ficam fora das medições. Arquivos temporários são removidos.

```sh
npm ci
npm run build
# Repetir três vezes antes e depois, para cada tamanho:
node benchmarks/store-throughput.mjs --entries 10000 --iterations 10 --json
node benchmarks/store-throughput.mjs --entries 100000 --iterations 10 --json
npm run bench -- --iterations 100 --samples 3 --soak-rounds 1
```

`updateSingle` mede set; `updateValue` mede read-modify-write;
`createCase` inclui resolução do import dinâmico já aquecido do CaseService.
Valores absolutos, sobretudo memória (amostras curtas) e JSON (fsync), são
sensíveis ao ruído da máquina. Mudanças de memória/JSON não devem ser atribuídas
a uma otimização de escrita: seus caminhos copy-on-write/coalescência permanecem.

| Entradas | Store / cenário | Antes ops/s | Depois ops/s | Antes µs/op | Depois µs/op |
|---:|---|---:|---:|---:|---:|
| 10.000 | memory.updateValue | 152091,3 | 105216,6 | 6,57 | 9,50 |
| 10.000 | memory.createCase | 19,2 | 48,8 | 52145,47 | 20507,84 |
| 10.000 | memory.updateSingle | 144316,8 | 103717,2 | 6,93 | 9,64 |
| 10.000 | memory.readVariable | 141093,5 | 176600,4 | 7,09 | 5,66 |
| 10.000 | memory.queryPrefix | 67,5 | 107,9 | 14822,00 | 9267,41 |
| 10.000 | json.updateValue | 13,1 | 141,5 | 76467,36 | 7065,56 |
| 10.000 | json.createCase | 3,4 | 32,6 | 292122,83 | 30695,45 |
| 10.000 | json.updateSingle | 23,3 | 124,2 | 42990,12 | 8053,37 |
| 10.000 | json.readVariable | 556854,9 | 615384,6 | 1,80 | 1,62 |
| 10.000 | json.queryPrefix | 55,7 | 111,5 | 17955,51 | 8964,62 |
| 10.000 | sqlite.updateValue | 8,7 | 7953,9 | 114294,33 | 125,72 |
| 10.000 | sqlite.createCase | 8,0 | 5467,6 | 125126,96 | 182,90 |
| 10.000 | sqlite.updateSingle | 6,2 | 7721,0 | 161679,37 | 129,52 |
| 10.000 | sqlite.readVariable | 128000,0 | 155843,3 | 7,81 | 6,42 |
| 10.000 | sqlite.queryPrefix | 13801,8 | 16034,2 | 72,45 | 62,37 |
| 100.000 | memory.updateValue | 125457,9 | 114777,6 | 7,97 | 8,71 |
| 100.000 | memory.createCase | 3,6 | 4,5 | 275761,50 | 223307,49 |
| 100.000 | memory.updateSingle | 117532,3 | 122261,3 | 8,51 | 8,18 |
| 100.000 | memory.readVariable | 173160,2 | 171429,6 | 5,77 | 5,83 |
| 100.000 | memory.queryPrefix | 8,0 | 8,5 | 124715,05 | 117358,70 |
| 100.000 | json.updateValue | 12,6 | 17,1 | 79323,89 | 58512,94 |
| 100.000 | json.createCase | 2,5 | 3,5 | 399149,56 | 284162,75 |
| 100.000 | json.updateSingle | 11,9 | 17,8 | 84283,39 | 56241,54 |
| 100.000 | json.readVariable | 421798,5 | 441170,0 | 2,37 | 2,27 |
| 100.000 | json.queryPrefix | 7,4 | 8,7 | 135805,57 | 115328,70 |
| 100.000 | sqlite.updateValue | 1,1 | 8822,9 | 899457,00 | 113,34 |
| 100.000 | sqlite.createCase | 1,2 | 6758,1 | 839589,93 | 147,97 |
| 100.000 | sqlite.updateSingle | 1,2 | 8905,1 | 838977,07 | 112,30 |
| 100.000 | sqlite.readVariable | 88691,8 | 173160,2 | 11,28 | 5,77 |
| 100.000 | sqlite.queryPrefix | 14930,9 | 15905,6 | 66,98 | 62,87 |

No `npm run bench`, `store/transaction-concurrent` reportou 151207 ops/s antes
e 150116 ops/s depois, com medianas de 0,72 ms e 0,70 ms por amostra de 100
operações (7,2 e 7,0 µs/op na amostra mediana). A taxa impressa por esse runner
usa o tempo total das três amostras, não a amostra mediana.

SQLite não hidrata nem valida/diffa o estado inteiro nesses três caminhos de
escrita; os statements pontuais continuam síncronos e podem bloquear em I/O.
JSON continua serializando o estado inteiro: a medição mostra esse custo, mas
não justifica neste trabalho trocar seu formato/persistência atômica. Casos
em memória/JSON ainda percorrem a lista do guild pelo caminho existente.
