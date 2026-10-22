import { MemoryStore, Yuzuha } from 'yuzuha';
import { script } from 'yuzuha/functions';
import { MockTransport, mockMessage } from 'yuzuha/testing';

const transport = new MockTransport();
const bot = new Yuzuha({ transport, store: new MemoryStore() });

// Function mode é ativado automaticamente ao registrar um comando com `code`.
bot.command(script({
  name: 'ban',
  code: '$modBan[$mentioned[1];$messageSlice[1]]$reply[Membro banido. Caso #$caseID.]',
}));

await bot.handle(mockMessage('!ban <@2> spam no chat'));
console.log(transport.messages[0]?.payload.content);
await bot.destroy();
