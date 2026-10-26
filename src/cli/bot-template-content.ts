import { botTemplates } from './bot-template-catalog.js';
import type { BotTemplate } from './bot-template-catalog.js';

export const templateExamples = {
  simple: ['!ping', '!ajuda', '!sobre', '!avatar @usuario'],
  multifunctional: ['!ajuda', '!regras definir Respeite os membros.', '!enquete criar Vamos jogar hoje?', '!enquete votar sim', '!diario', '!pagar @usuario 25', '!notas listar', '!caso 1'],
  moderation: ['!ban @usuario spam', '!kick @usuario spam', '!timeout @usuario 10m spam', '!unban 123456789 revisão', '!caso 1'],
  community: ['!regras definir Respeite os membros.', '!regras ver', '!sugestao enviar Adicionar um canal de jogos', '!sugestao listar', '!enquete criar Vamos jogar hoje?', '!enquete votar sim', '!enquete resultado', '!enquete fechar'],
  economy: ['!saldo', '!saldo @usuario', '!diario', '!trabalhar', '!pagar @usuario 25'],
  entertainment: ['!dado 20', '!moeda', '!escolher pizza | sushi | massa', '!bola8 Vai chover?'],
  utility: ['!perfil @usuario', '!servidor', '!data 2026-01-20T18:30:00-03:00', '!notas adicionar Comprar café', '!notas listar', '!notas apagar 1'],
} satisfies Record<BotTemplate, string[]>;

export function templateReadme(template: BotTemplate): string {
  const paths: readonly string[] = botTemplates[template].paths;
  const paragraphs = [
    `Base: **${template}**. ${botTemplates[template].description}`,
    'Todas as bases incluem `!ping`, `!ajuda` (aliases `help`, `comandos`), `!sobre` e `!avatar [@usuario]`. Ajuda e consultas de informações usam embeds. As pastas de commands são carregadas recursivamente.',
    `Exemplos:\n\n${templateExamples[template].map(value => `- \`${value}\``).join('\n')}`,
  ];
  if (paths.includes('moderation/ban')) paragraphs.push('Moderação exige permissões de autor e bot e hierarquia sobre o alvo. `caso` exige ManageGuild. Kick, timeout e unban exigem motivo; timeout aceita de 1 segundo a 28 dias. Falha depois da ação é parcial: não repita a ação para tentar salvar o caso.');
  if (paths.includes('community/rules')) paragraphs.push('Regras e criação de enquetes exigem ManageGuild. Há uma enquete de sim/não por canal, até 1000 participantes, com alteração de voto. Somente o criador encerra; o resultado permanece disponível. Sugestões são públicas, limitadas às 10 mais recentes, com cooldown de 30 segundos por autor/canal.');
  if (paths.includes('economy/daily')) paragraphs.push('Moedas são virtuais e isoladas por servidor. Diário concede 100 a cada 24 horas; trabalho, 25 a cada hora. Prazos persistem após reinício. Transferências de 1 a 1000000 moedas são atômicas, não permitem saldo negativo, autoenvio ou bots. Não há dinheiro real ou pagamentos externos.');
  if (paths.includes('utilities/notes')) paragraphs.push('Notas funcionam somente em DM, são isoladas por usuário e limitadas a 10 entradas de 300 caracteres. Apagar uma nota renumera as seguintes. `data` exige ISO com fuso explícito e retorna UTC e Unix em segundos.');
  if (paths.includes('fun/choose')) paragraphs.push('`escolher` aceita de 2 a 20 opções não vazias de até 100 caracteres, separadas por |. `dado` aceita de 2 a 100 lados. `bola8` responde aleatoriamente, apenas por diversão.');
  paragraphs.push('Os testes usam MockTransport, recursos simulados e store em memória. `check` valida sem login; `npm test` exercita comandos e guards. Dados reais usam o store configurado pela CLI; reinicie o processo após mudar helpers fora de commands/.');
  return paragraphs.join('\n\n');
}

export function templateHelpers(template: BotTemplate, language: 'js' | 'ts'): Record<string, string> {
  const paths: readonly string[] = botTemplates[template].paths;
  if (!paths.some(path => path.startsWith('community/') || path.startsWith('economy/') || path === 'utilities/notes')) return {};
  const input = language === 'ts' ? ': unknown' : '';
  return { [`helpers/state.${language}`]: `import { assert } from 'yuzuha';

export function readStrings(value${input}) {
  assert(Array.isArray(value) && value.length <= 10, 'A lista salva é inválida.');
  return value.map(item => {
    assert(typeof item === 'string' && item.length <= 400, 'A entrada salva é inválida.');
    return item;
  });
}

export function readBalance(value${input}) {
  assert(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0, 'O saldo salvo é inválido ou atingiu o limite.');
  return value;
}

function readVote(value${input}) {
  assert(value !== null && typeof value === 'object' && 'id' in value && 'choice' in value, 'Voto salvo inválido.');
  assert(typeof value.id === 'string' && (value.choice === 'sim' || value.choice === 'nao'), 'Voto salvo inválido.');
  return { id: value.id, choice: value.choice };
}

export function readPoll(value${input}) {
  assert(value !== null && typeof value === 'object' && 'question' in value && 'authorID' in value && 'closed' in value && 'votes' in value,
    'Nenhuma enquete válida neste canal.');
  assert(typeof value.question === 'string' && value.question.length <= 500 && typeof value.authorID === 'string'
    && typeof value.closed === 'boolean' && Array.isArray(value.votes) && value.votes.length <= 1000,
    'A enquete salva é inválida.');
  const votes = value.votes.map(readVote);
  assert(new Set(votes.map(vote => vote.id)).size === votes.length, 'Há votos duplicados na enquete salva.');
  return { question: value.question, authorID: value.authorID, closed: value.closed, votes };
}
` };
}
