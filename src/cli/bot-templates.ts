import { botTemplates } from './bot-template-catalog.js';
import type { BotTemplate } from './bot-template-catalog.js';
import { extraCommands } from './bot-template-commands.js';

const commands: Record<string, string> = {
  'general/ping': `import { defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'ping',
  description: 'Mostra a latência da conexão do bot.',
  async run(ctx) {
    await ctx.reply(\`Pong! \${ctx.transport.ping} ms\`);
  },
});
`,
  'general/help': `import { defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'ajuda',
  aliases: ['help', 'comandos'],
  description: 'Lista os comandos disponíveis.',
  async run(ctx) {
    await ctx.reply({ embeds: [{
      title: 'Comandos',
      description: ctx.help(),
      color: 0x5865F2,
      footer: { text: 'Argumentos entre < > são obrigatórios; entre [ ] são opcionais.' },
    }] });
  },
});
`,
  'general/about': `import { defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'sobre',
  aliases: ['botinfo'],
  description: 'Mostra informações sobre o bot.',
  async run(ctx) {
    await ctx.reply({ embeds: [{
      title: 'Sobre o bot',
      description: 'Bot para o Fluxer feito com Yuzuha. Use o comando ajuda para ver os comandos.',
      color: 0x5865F2,
      fields: [
        { name: 'ID', value: ctx.transport.botID, inline: true },
        { name: 'Latência', value: \`\${ctx.transport.ping} ms\`, inline: true },
      ],
    }] });
  },
});
`,
  'utilities/avatar': `import { arg, defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'avatar',
  description: 'Mostra o avatar de um usuário ou o seu.',
  args: { usuario: arg.user() },
  async run(ctx) {
    const user = await ctx.resources.users.user(ctx.args.get('usuario') ?? ctx.authorID);
    if (!user.avatarURL) {
      await ctx.reply('Esse usuário ainda não tem um avatar.');
      return;
    }
    await ctx.reply({ embeds: [{
      title: \`Avatar de \${user.username}\`,
      color: 0x5865F2,
      image: { url: user.avatarURL },
    }] });
  },
});
`,
  'utilities/profile': `import { arg, defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'perfil',
  aliases: ['userinfo'],
  description: 'Mostra informações da conta de um usuário ou da sua.',
  args: { usuario: arg.user() },
  async run(ctx) {
    const user = await ctx.resources.users.user(ctx.args.get('usuario') ?? ctx.authorID);
    await ctx.reply({ embeds: [{
      title: user.username,
      color: 0x5865F2,
      ...(user.avatarURL ? { thumbnail: { url: user.avatarURL } } : {}),
      fields: [
        { name: 'Nome', value: user.displayName, inline: true },
        { name: 'ID', value: user.id, inline: true },
        { name: 'Conta', value: user.bot ? 'Bot' : 'Pessoa', inline: true },
        { name: 'Criada em', value: new Date(user.createdTimestamp).toLocaleDateString('pt-BR', { timeZone: 'UTC' }), inline: true },
      ],
    }] });
  },
});
`,
  'utilities/server': `import { defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'servidor',
  aliases: ['serverinfo'],
  description: 'Mostra informações deste servidor.',
  guildOnly: true,
  async run(ctx) {
    const guild = await ctx.resources.users.guild(ctx.requireGuild());
    await ctx.reply({ embeds: [{
      title: guild.name,
      color: 0x5865F2,
      ...(guild.iconURL ? { thumbnail: { url: guild.iconURL } } : {}),
      fields: [
        { name: 'ID', value: guild.id, inline: true },
        { name: 'Dono (ID)', value: guild.ownerID, inline: true },
        { name: 'Membros', value: guild.memberCount === null ? 'Indisponível' : String(guild.memberCount), inline: true },
        { name: 'Criado em', value: new Date(guild.createdTimestamp).toLocaleDateString('pt-BR', { timeZone: 'UTC' }), inline: true },
      ],
    }] });
  },
});
`,
  'fun/dice': `import { randomInt } from 'node:crypto';
import { arg, defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'dado',
  aliases: ['roll'],
  description: 'Rola um dado de 2 a 100 lados (padrão: 6).',
  args: { lados: arg.integer().min(2).max(100).default(6) },
  async run(ctx) {
    const sides = ctx.args.get('lados');
    await ctx.reply(\`Dado de \${sides} lados: \${randomInt(1, sides + 1)}.\`);
  },
});
`,
  'fun/coin': `import { randomInt } from 'node:crypto';
import { defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'moeda',
  aliases: ['coinflip'],
  description: 'Joga uma moeda: cara ou coroa.',
  async run(ctx) {
    await ctx.reply(randomInt(2) === 0 ? 'Cara!' : 'Coroa!');
  },
});
`,
};

export function botTemplateFiles(template: BotTemplate, extension: string, ban: string): Record<string, string> {
  const files: Record<string, string> = {};
  const catalog: Record<string, string> = { ...commands, ...extraCommands, 'moderation/ban': ban };
  for (const path of botTemplates[template].paths) {
    const source = catalog[path];
    if (source === undefined) throw new Error(`Template sem comando: ${path}`);
    const name = template === 'simple' ? path.slice(path.indexOf('/') + 1) : path;
    files[`commands/${name}.${extension}`] = source;
  }
  return files;
}
