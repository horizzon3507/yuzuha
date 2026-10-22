import { defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'ban', aliases: ['banir'],
  description: 'Bane um membro e registra o motivo.',
  code: `
    $modBan[$mentioned[1];$messageSlice[1]]
    $reply[Membro banido. Caso #$caseID.]
  `,
});
