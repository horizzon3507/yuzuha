import { defineCommand, embed, MemoryStore, Yuzuha } from 'yuzuha';
import { MockTransport, mockMessage } from 'yuzuha/testing';

// Embed completo: autor, link, data, campos (inclusive um campo inline vazio), imagem com texto alternativo e rodapé com ícone.
const relatorio = embed({
  url: 'https://exemplo.com/relatorio',
  title: 'Relatório semanal',
  description: 'Resumo da atividade do servidor.',
  color: 0x3498DB,
  timestamp: '2026-01-20T21:30:00Z',
  author: { name: 'Hory', url: 'https://exemplo.com', iconURL: 'https://exemplo.com/icone.png' },
  fields: [
    { name: 'Mensagens', value: '1.204', inline: true },
    { name: 'Membros', value: '87', inline: true },
    { name: '​', value: '', inline: true },
  ],
  image: { url: 'https://exemplo.com/grafico.png', description: 'Gráfico de atividade dos últimos sete dias' },
  footer: { text: 'Yuzuha', iconURL: 'https://exemplo.com/yuzuha.png' },
});

const transport = new MockTransport();
const bot = new Yuzuha({ transport, store: new MemoryStore() });

bot.command(defineCommand({
  name: 'relatorio',
  async run(ctx) {
    await ctx.reply({ embeds: [relatorio] });
  },
}));

await bot.handle(mockMessage('!relatorio'));
console.log(JSON.stringify(transport.messages[0]?.payload, null, 2));
await bot.destroy();
