import { defineConfig, defineEvent } from 'yuzuha';
import { Events } from 'yuzuha/sdk';

export default defineConfig({
  name: 'yuzuha-example',
  prefix: ['!', 'y!'],
  commands: './commands',
  setup(bot) {
    bot.plugin({
      name: 'greetings',
      events: [defineEvent({ event: Events.Ready, run() { console.log('Exemplo Yuzuha pronto.'); } })],
      functions: [{
        name: 'greet', category: 'example', description: 'Cumprimenta alguém.',
        minArgs: 1, maxArgs: 1, usage: '$greet[nome]',
        execute: async call => `Olá, ${await call.text(0)}!`,
      }],
    });
  },
});
