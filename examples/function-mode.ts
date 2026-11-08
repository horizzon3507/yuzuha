import { MemoryStore, Yuzuha } from 'yuzuha';
import { functions, script } from 'yuzuha/functions';
import { MockTransport, mockMessage } from 'yuzuha/testing';

const transport = new MockTransport();
const bot = new Yuzuha({ transport, store: new MemoryStore(), engine: functions() });

// Comandos com `code` exigem um engine de function mode instalado no bot.
bot.command(script({
  name: 'ban',
  code: '$modBan[$mentioned[1];$messageSlice[1]]$reply[Membro banido. Caso #$caseID.]',
}));

await bot.handle(mockMessage('!ban <@2> spam no chat'));
console.log(transport.messages[0]?.payload.content);
await bot.destroy();
