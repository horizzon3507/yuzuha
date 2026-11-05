import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MemoryStore, Yuzuha } from 'yuzuha';
import { functions } from 'yuzuha/functions';
import { MockTransport, mockMessage, mockResources } from 'yuzuha/testing';
import { buildProfile } from './profile.js';
import { buildWelcome } from './welcome.js';
import { buildRanking } from './ranking.js';
import { buildProfile as buildProfileJS } from './profile.mjs';
import { buildWelcome as buildWelcomeJS } from './welcome.mjs';
import { buildRanking as buildRankingJS } from './ranking.mjs';

const directory = new URL('./', import.meta.url);
const output = new URL('./output/', import.meta.url);
const avatar = new Uint8Array(await readFile(new URL('./fixtures/avatar.png', import.meta.url)));
await mkdir(output, { recursive: true });

const examples = [
  ['profile.png', buildProfile('Ada Monteiro', avatar)],
  ['welcome.png', buildWelcome('Isadora de Albuquerque Nascimento', avatar)],
  ['ranking.png', buildRanking()],
  ['js-profile.png', buildProfileJS('Ada Monteiro', avatar)],
  ['js-welcome.png', buildWelcomeJS('Isadora de Albuquerque Nascimento', avatar)],
  ['js-ranking.png', buildRankingJS()],
] as const;
for (const [name, builder] of examples) await writeFile(new URL(name, output), (await builder.render()).data);

for (const name of ['profile', 'welcome', 'ranking']) {
  const source = await readFile(new URL(`./functions/${name}.yuzuha`, directory), 'utf8');
  let data: Uint8Array | undefined;
  const bot = new Yuzuha({ prefix: '!', store: new MemoryStore(), scheduler: false, http: false,
    engine: functions(), transport: new MockTransport(), canvas: { assets: { avatar } },
    resources: mockResources({ messages: { async sendBytes(_channelID, files) { data = new Uint8Array(files[0]!.data); return 'offline'; } } }) });
  try {
    if (name === 'welcome') {
      bot.scriptEvent({ event: 'guildMemberAdd', channelID: '300', code: source, ignoreBots: false });
      bot.client.emit('guildMemberAdd', { id: '42', user: { id: '42', username: 'Isadora de Albuquerque Nascimento', bot: false },
        guild: { id: '100' } } as never);
      for (let attempt = 0; attempt < 100 && !data; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    } else {
      bot.command({ name: 'canvas-example', code: source });
      await bot.handle(mockMessage('!canvas-example', { authorName: 'Isadora de Albuquerque Nascimento' }));
    }
  } finally { await bot.destroy(); }
  if (!data) throw new Error(`O exemplo ${name} não enviou um PNG.`);
  await writeFile(new URL(`function-${name}.png`, output), data);
}

console.log(`PNG offline gravados em ${resolve('examples/canvas/output')}`);
