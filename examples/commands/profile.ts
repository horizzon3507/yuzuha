import { defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'perfil', description: 'Exemplo de embed e função de plugin.',
  code: `
    $reply[$embed[
      $title[$greet[$username]];
      $color[#FCE300];
      $field[ID;$authorID;true];
      $field[Servidor;$guildID;true]
    ]]
  `,
});
