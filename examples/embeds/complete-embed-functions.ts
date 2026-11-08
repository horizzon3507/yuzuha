import { MemoryStore, Yuzuha } from 'yuzuha';
import { functions, script } from 'yuzuha/functions';
import { MockTransport, mockMessage } from 'yuzuha/testing';

// Mesmo embed do exemplo nativo, montado em function mode. Cada parte é validada pelas mesmas regras.
const code = [
  '$reply[$embed[',
  '$title[Relatório semanal];',
  '$url[https://exemplo.com/relatorio];',
  '$author[Hory;https://exemplo.com;https://exemplo.com/icone.png];',
  '$embedTimestamp[2026-01-20T21:30:00Z];',
  '$description[Resumo da atividade do servidor.];',
  '$color[blue];',
  '$field[Mensagens;1.204;true];',
  '$field[Membros;87;true];',
  '$field[​;;true];',
  '$image[https://exemplo.com/grafico.png];',
  '$imageAlt[Gráfico de atividade dos últimos sete dias];',
  '$footer[Yuzuha];',
  '$footerIcon[https://exemplo.com/yuzuha.png]',
  ']]',
].join('');

const transport = new MockTransport();
const bot = new Yuzuha({ transport, store: new MemoryStore(), engine: functions() });

bot.command(script({ name: 'relatorio', code }));

await bot.handle(mockMessage('!relatorio'));
console.log(JSON.stringify(transport.messages[0]?.payload, null, 2));
await bot.destroy();
