import { defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'help', aliases: ['ajuda'], description: 'Lista os comandos disponíveis.',
  code: '$reply[$help]',
});
