export const extraCommands: Record<string, string> = {
  'moderation/kick': `import { arg, defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'kick',
  description: 'Expulsa um membro e registra um caso.',
  guildOnly: true,
  args: {
    membro: arg.user().required(),
    motivo: arg.text().rest().min(1).max(400).required(),
  },
  async run(ctx) {
    const record = await ctx.mod.kick(ctx.args.get('membro'), {
      reason: ctx.args.get('motivo'),
    });
    await ctx.reply({ embeds: [{ title: 'Caso #' + record.id, color: 0x5865F2,
      fields: [
        { name: 'Ação', value: record.action, inline: true },
        { name: 'Usuário (ID)', value: record.targetID, inline: true },
        { name: 'Motivo', value: record.reason, inline: false },
      ],
    }] });
  },
});
`,
  'moderation/timeout': `import { arg, defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'timeout',
  description: 'Aplica timeout a um membro e registra um caso.',
  guildOnly: true,
  args: {
    membro: arg.user().required(),
    duracao: arg.duration().min(1000).max(2419200000).required(),
    motivo: arg.text().rest().min(1).max(400).required(),
  },
  async run(ctx) {
    const record = await ctx.mod.timeout(ctx.args.get('membro'), {
      reason: ctx.args.get('motivo'),
      duration: ctx.args.get('duracao'),
    });
    await ctx.reply({ embeds: [{ title: 'Caso #' + record.id, color: 0x5865F2,
      fields: [
        { name: 'Ação', value: record.action, inline: true },
        { name: 'Usuário (ID)', value: record.targetID, inline: true },
        { name: 'Motivo', value: record.reason, inline: false },
      ],
    }] });
  },
});
`,
  'moderation/unban': `import { arg, defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'unban',
  description: 'Remove um banimento e registra um caso.',
  guildOnly: true,
  args: {
    membro: arg.user().required(),
    motivo: arg.text().rest().min(1).max(400).required(),
  },
  async run(ctx) {
    const record = await ctx.mod.unban(ctx.args.get('membro'), {
      reason: ctx.args.get('motivo'),
    });
    await ctx.reply({ embeds: [{ title: 'Caso #' + record.id, color: 0x5865F2,
      fields: [
        { name: 'Ação', value: record.action, inline: true },
        { name: 'Usuário (ID)', value: record.targetID, inline: true },
        { name: 'Motivo', value: record.reason, inline: false },
      ],
    }] });
  },
});
`,
  'moderation/case': `import { arg, defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'caso', description: 'Consulta um caso de moderação deste servidor.',
  guildOnly: true, permissions: ['ManageGuild'],
  args: { numero: arg.integer().min(1).required() },
  async run(ctx) {
    const record = await ctx.case(ctx.args.get('numero'));
    if (!record) { await ctx.reply('Caso não encontrado neste servidor.'); return; }
    await ctx.reply({ embeds: [{ title: 'Caso #' + record.id, color: 0x5865F2,
      fields: [
        { name: 'Ação', value: record.action, inline: true },
        { name: 'Usuário (ID)', value: record.targetID, inline: true },
        { name: 'Moderador (ID)', value: record.moderatorID, inline: true },
        { name: 'Motivo', value: record.reason || 'Sem motivo informado.', inline: false },
      ],
    }] });
  },
});
`,
  'community/rules': `import { arg, assert, defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'regras', description: 'Consulta ou configura as regras do servidor.', guildOnly: true,
  subcommands: [
    { name: 'ver', description: 'Mostra as regras.', async run(ctx) {
      const text = await ctx.data.guild.get('regras', 'As regras ainda não foram configuradas.');
      assert(typeof text === 'string' && text.length <= 3000, 'As regras salvas são inválidas.');
      await ctx.reply({ embeds: [{ title: 'Regras do servidor', description: text, color: 0x5865F2 }] });
    } },
    defineCommand({ name: 'definir', description: 'Define as regras (ManageGuild).', permissions: ['ManageGuild'],
      args: { texto: arg.text().rest().min(1).max(3000).required() },
      async run(ctx) { await ctx.data.guild.set('regras', ctx.args.get('texto')); await ctx.reply('Regras atualizadas.'); },
    }),
  ],
});
`,
  'community/suggestions': `import { arg, defineCommand } from 'yuzuha';
import { readStrings } from '../../helpers/state.js';

export default defineCommand({
  name: 'sugestao', description: 'Envia e consulta as últimas 10 sugestões públicas.', guildOnly: true,
  subcommands: [
    defineCommand({ name: 'enviar', description: 'Envia uma sugestão pública.', cooldown: '30s',
      args: { texto: arg.text().rest().min(1).max(250).required() },
      async run(ctx) {
        const line = ctx.authorID + ': ' + ctx.args.get('texto');
        await ctx.data.guild.update('sugestoes', current => [...readStrings(current), line].slice(-10), []);
        await ctx.reply('Sugestão registrada. Use sugestao listar para consultar.');
      },
    }),
    { name: 'listar', description: 'Lista as sugestões públicas mais recentes.', async run(ctx) {
      const lines = readStrings(await ctx.data.guild.get('sugestoes', []));
      await ctx.reply({ embeds: [{ title: 'Sugestões da comunidade', color: 0x5865F2,
        description: lines.join('\\n') || 'Ainda não há sugestões.',
      }] });
    } },
  ],
});
`,
  'community/poll': `import { arg, assert, defineCommand } from 'yuzuha';
import { readPoll } from '../../helpers/state.js';

export default defineCommand({
  name: 'enquete', description: 'Enquete de sim ou não por canal; votos podem ser alterados.', guildOnly: true,
  subcommands: [
    defineCommand({ name: 'criar', description: 'Abre uma enquete (ManageGuild).', permissions: ['ManageGuild'],
      args: { pergunta: arg.text().rest().min(1).max(500).required() },
      async run(ctx) {
        await ctx.data.guild.update('enquete:' + ctx.channelID, current => {
          if (current !== null) assert(readPoll(current).closed, 'Feche a enquete atual antes de criar outra.');
          return { question: ctx.args.get('pergunta'), authorID: ctx.authorID, closed: false, votes: [] };
        });
        await ctx.reply('Enquete aberta. Vote com enquete votar sim ou enquete votar nao.');
      },
    }),
    defineCommand({ name: 'votar', description: 'Registra ou altera seu voto.',
      args: { voto: arg.text().choices(['sim', 'nao']).required() },
      async run(ctx) {
        await ctx.data.guild.update('enquete:' + ctx.channelID, current => {
          const poll = readPoll(current);
          assert(!poll.closed, 'Esta enquete já foi encerrada.');
          const votes = poll.votes.filter(vote => vote.id !== ctx.authorID);
          assert(votes.length < 1000, 'Esta enquete atingiu o limite de participantes.');
          return { ...poll, votes: [...votes, { id: ctx.authorID, choice: ctx.args.get('voto') }] };
        });
        await ctx.reply('Voto registrado.');
      },
    }),
    { name: 'resultado', description: 'Mostra o resultado atual.', async run(ctx) {
      const poll = readPoll(await ctx.data.guild.get('enquete:' + ctx.channelID));
      await ctx.reply({ embeds: [{ title: poll.closed ? 'Enquete encerrada' : 'Enquete aberta',
        description: poll.question, color: 0x5865F2,
        fields: ['sim', 'nao'].map(choice => ({ name: choice === 'sim' ? 'Sim' : 'Não',
          value: String(poll.votes.filter(vote => vote.choice === choice).length), inline: true })),
      }] });
    } },
    { name: 'fechar', description: 'Encerra sua enquete.', async run(ctx) {
      await ctx.data.guild.update('enquete:' + ctx.channelID, current => {
        const poll = readPoll(current);
        assert(poll.authorID === ctx.authorID, 'Somente o criador pode encerrar esta enquete.');
        assert(!poll.closed, 'Esta enquete já foi encerrada.');
        return { ...poll, closed: true };
      });
      await ctx.reply('Enquete encerrada. O resultado continua disponível.');
    } },
  ],
});
`,
  'economy/balance': `import { arg, defineCommand } from 'yuzuha';
import { readBalance } from '../../helpers/state.js';

export default defineCommand({
  name: 'saldo', description: 'Consulta moedas virtuais neste servidor.', guildOnly: true,
  args: { usuario: arg.user() },
  async run(ctx) {
    const id = ctx.args.get('usuario') ?? ctx.authorID;
    const balance = readBalance(await ctx.data.guild.get('saldo:' + id, 0));
    await ctx.reply({ embeds: [{ title: 'Carteira', color: 0x5865F2, fields: [
      { name: 'Usuário (ID)', value: id, inline: true },
      { name: 'Moedas', value: String(balance), inline: true },
    ] }] });
  },
});
`,
  'economy/daily': `import { assert, defineCommand } from 'yuzuha';
import { readBalance } from '../../helpers/state.js';

export default defineCommand({
  name: 'diario', description: 'Recebe 100 moedas a cada 24 horas.', guildOnly: true,
  async run(ctx) {
    const balance = await ctx.data.transaction(data => {
      const claim = 'diario:' + ctx.authorID;
      assert(data.guild.get(claim) === null, 'Você já recebeu esta recompensa. Aguarde o prazo.');
      const key = 'saldo:' + ctx.authorID;
      const next = readBalance(readBalance(data.guild.get(key, 0)) + 100);
      data.guild.set(key, next);
      data.guild.set(claim, true, { ttlMs: 86400000 });
      return next;
    });
    await ctx.reply({ embeds: [{ title: 'Recompensa recebida', color: 0x5865F2,
      description: '100 moedas adicionadas.', fields: [{ name: 'Saldo', value: String(balance), inline: true }],
    }] });
  },
});
`,
  'economy/work': `import { assert, defineCommand } from 'yuzuha';
import { readBalance } from '../../helpers/state.js';

export default defineCommand({
  name: 'trabalhar', description: 'Recebe 25 moedas a cada hora.', guildOnly: true,
  async run(ctx) {
    const balance = await ctx.data.transaction(data => {
      const claim = 'trabalhar:' + ctx.authorID;
      assert(data.guild.get(claim) === null, 'Você já recebeu esta recompensa. Aguarde o prazo.');
      const key = 'saldo:' + ctx.authorID;
      const next = readBalance(readBalance(data.guild.get(key, 0)) + 25);
      data.guild.set(key, next);
      data.guild.set(claim, true, { ttlMs: 3600000 });
      return next;
    });
    await ctx.reply({ embeds: [{ title: 'Recompensa recebida', color: 0x5865F2,
      description: '25 moedas adicionadas.', fields: [{ name: 'Saldo', value: String(balance), inline: true }],
    }] });
  },
});
`,
  'economy/pay': `import { arg, assert, defineCommand } from 'yuzuha';
import { readBalance } from '../../helpers/state.js';

export default defineCommand({
  name: 'pagar', description: 'Transfere moedas virtuais para outra pessoa neste servidor.', guildOnly: true,
  args: { usuario: arg.user().required(), quantidade: arg.integer().min(1).max(1000000).required() },
  async run(ctx) {
    const id = ctx.args.get('usuario');
    const amount = ctx.args.get('quantidade');
    assert(id !== ctx.authorID, 'Escolha outra pessoa.');
    const user = await ctx.resources.users.user(id);
    assert(!user.bot, 'Transferências para bots não são permitidas.');
    await ctx.data.transaction(data => {
      const fromKey = 'saldo:' + ctx.authorID;
      const toKey = 'saldo:' + id;
      const balance = readBalance(data.guild.get(fromKey, 0));
      assert(balance >= amount, 'Saldo insuficiente.');
      const received = readBalance(readBalance(data.guild.get(toKey, 0)) + amount);
      data.guild.set(fromKey, balance - amount);
      data.guild.set(toKey, received);
    });
    await ctx.reply('Transferência concluída: ' + amount + ' moedas para ' + id + '.');
  },
});
`,
  'fun/choose': `import { randomInt } from 'node:crypto';
import { arg, assert, defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'escolher', description: 'Escolhe entre 2 a 20 opções separadas por |.',
  args: { opcoes: arg.text().rest().max(1500).required() },
  async run(ctx) {
    const options = ctx.args.get('opcoes').split('|').map(option => option.trim());
    assert(options.length >= 2 && options.length <= 20 && options.every(option => option.length > 0 && option.length <= 100),
      'Informe de 2 a 20 opções não vazias de até 100 caracteres, separadas por |.');
    await ctx.reply({ embeds: [{ title: 'Minha escolha', description: options[randomInt(options.length)], color: 0x5865F2 }] });
  },
});
`,
  'fun/eightball': `import { randomInt } from 'node:crypto';
import { arg, defineCommand } from 'yuzuha';

const answers = ['Sim.', 'Não.', 'Talvez.', 'Pergunte outra vez.', 'Tudo indica que sim.', 'Melhor esperar.'];

export default defineCommand({
  name: 'bola8', aliases: ['8ball'], description: 'Responde uma pergunta por diversão.',
  args: { pergunta: arg.text().rest().min(1).max(500).required() },
  async run(ctx) {
    await ctx.reply({ embeds: [{ title: 'Bola 8', description: ctx.args.get('pergunta'), color: 0x5865F2,
      fields: [{ name: 'Resposta', value: answers[randomInt(answers.length)], inline: false }],
      footer: { text: 'Resposta aleatória, só por diversão.' },
    }] });
  },
});
`,
  'utilities/notes': `import { arg, assert, defineCommand } from 'yuzuha';
import { readStrings } from '../../helpers/state.js';

export default defineCommand({
  name: 'notas', description: 'Notas pessoais, disponíveis apenas em mensagens diretas.',
  checks: [ctx => !ctx.guildID || 'Use notas em uma mensagem direta com o bot.'],
  subcommands: [
    defineCommand({ name: 'adicionar', description: 'Adiciona uma nota (até 10 notas).',
      args: { texto: arg.text().rest().min(1).max(300).required() },
      async run(ctx) {
        const count = await ctx.data.user.update('notas', current => {
          const notes = readStrings(current);
          assert(notes.length < 10, 'Você atingiu o limite de 10 notas. Apague uma antes de adicionar outra.');
          return [...notes, ctx.args.get('texto')];
        }, []);
        await ctx.reply('Nota #' + count.length + ' salva.');
      },
    }),
    { name: 'listar', description: 'Lista suas notas.', async run(ctx) {
      const notes = readStrings(await ctx.data.user.get('notas', []));
      await ctx.reply({ embeds: [{ title: 'Suas notas', color: 0x5865F2,
        description: notes.map((note, index) => (index + 1) + '. ' + note).join('\\n') || 'Nenhuma nota salva.',
      }] });
    } },
    defineCommand({ name: 'apagar', description: 'Apaga uma nota pelo número atual.',
      args: { numero: arg.integer().min(1).max(10).required() },
      async run(ctx) {
        const index = ctx.args.get('numero') - 1;
        await ctx.data.user.update('notas', current => {
          const notes = readStrings(current);
          assert(index < notes.length, 'Nota não encontrada.');
          return notes.filter((_, position) => position !== index);
        }, []);
        await ctx.reply('Nota apagada. Os números das notas seguintes foram atualizados.');
      },
    }),
  ],
});
`,
  'utilities/timestamp': `import { arg, assert, defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'data', description: 'Converte uma data ISO com fuso para UTC e Unix em segundos.',
  args: { iso: arg.text().max(35).required() },
  async run(ctx) {
    const iso = ctx.args.get('iso');
    assert(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:Z|[+-]\\d{2}:\\d{2})$/.test(iso),
      'Use ISO com fuso, por exemplo 2026-01-20T18:30:00-03:00.');
    const date = new Date(iso);
    assert(Number.isFinite(date.getTime()), 'Data inválida.');
    assert(new Date(iso.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) === iso.slice(0, 10)
      && Number(iso.slice(11, 13)) < 24, 'Data inválida.');
    await ctx.reply({ embeds: [{ title: 'Data convertida', color: 0x5865F2, fields: [
      { name: 'UTC', value: date.toISOString(), inline: false },
      { name: 'Unix (segundos)', value: String(Math.floor(date.getTime() / 1000)), inline: false },
    ] }] });
  },
});
`,
};
