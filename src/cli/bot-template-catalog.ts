const general = ['general/ping', 'general/help', 'general/about', 'utilities/avatar'];
const information = ['utilities/profile', 'utilities/server'];
const moderation = ['moderation/ban', 'moderation/kick', 'moderation/timeout', 'moderation/unban', 'moderation/case'];
const community = ['community/rules', 'community/suggestions', 'community/poll'];
const economy = ['economy/balance', 'economy/daily', 'economy/work', 'economy/pay'];
const fun = ['fun/dice', 'fun/coin', 'fun/choose', 'fun/eightball'];
const utilities = ['utilities/notes', 'utilities/timestamp'];

export const botTemplates = {
  simple: { description: 'Bot pequeno com ajuda, informações, avatar e ping.', paths: general },
  multifunctional: { description: 'Todos os conjuntos: moderação, comunidade, economia, diversão e utilidades.', paths: [...general, ...information, ...moderation, ...community, ...economy, ...fun, ...utilities] },
  moderation: { description: 'Ban, kick, timeout, unban e consulta de casos com autorização compartilhada.', paths: [...general, ...information, ...moderation] },
  community: { description: 'Regras configuráveis, sugestões e enquetes com votos persistentes por canal.', paths: [...general, ...information, ...community] },
  economy: { description: 'Moedas virtuais por servidor: saldo, diário, trabalho e transferências atômicas.', paths: [...general, ...information, ...economy] },
  entertainment: { description: 'Dados, moeda, escolha entre opções e bola 8.', paths: [...general, ...information, ...fun] },
  utility: { description: 'Informações, notas pessoais com subcomandos e conversão de datas para UTC.', paths: [...general, ...information, ...utilities] },
} as const;

export type BotTemplate = keyof typeof botTemplates;

export function isBotTemplate(value: unknown): value is BotTemplate {
  return typeof value === 'string' && Object.hasOwn(botTemplates, value);
}
