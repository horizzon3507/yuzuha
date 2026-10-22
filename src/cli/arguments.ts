import { YuzuhaError } from '../errors.js';
import { NODE_REQUIREMENT, VERSION } from './version.js';

export const usage = `Yuzuha ${VERSION}

yuzuha init <diretório> [--js | --ts] [--functions] [--local] Cria um projeto de bot
yuzuha check [config ou diretório] [--json] Valida comandos sem login
yuzuha functions [--json] [--category nome] Lista funções e assinaturas
yuzuha lint <arquivo|diretório> [--json] [--catalog arquivo] Valida texto sem importar
yuzuha test <cenários.json> [--json]       Executa cenários offline
yuzuha data <stats|cleanup|backup|restore> <store> [opções] Manutenção offline
yuzuha functions --catalog [--config arquivo] Exporta catálogo JSON
yuzuha doctor [config] [--json]            Diagnostica ambiente e configuração sem login
yuzuha editor                             Mostra o caminho da extensão VS Code
yuzuha run [config]                        Carrega .env e conecta
yuzuha dev [config]                        Recarrega comandos ao editar

Config padrão: yuzuha.config.ts ou yuzuha.config.js. Node ${NODE_REQUIREMENT}.
init usa o pacote npm; --local vincula a instalação atual para desenvolvimento.
`;

export type CLIArguments = { action: 'help' } | { action: 'version' }
  | { action: 'init'; directory: string; language: 'js' | 'ts'; functions: boolean; local: boolean }
  | { action: 'functions'; json: boolean; category?: string; catalog?: boolean; config?: string; pluginsOnly?: boolean }
  | { action: 'lint'; input: string; json: boolean; catalogs: string[] }
  | { action: 'test'; input: string; json: boolean }
  | { action: 'data'; operation: 'stats' | 'cleanup' | 'backup' | 'restore'; input: string; json: boolean;
      limit?: number; cursor?: string; file?: string; policy?: 'replace' | 'merge'; apply: boolean }
  | { action: 'check' | 'doctor'; input?: string; json: boolean }
  | { action: 'editor' }
  | { action: 'run' | 'dev'; input?: string };

export function parseArguments(args: string[]): CLIArguments {
  const [action, ...rest] = args;
  const fail = (message = 'Argumentos inválidos.'): never => { throw new YuzuhaError('USAGE', `${message}\n${usage}`); };
  if (!action || action === 'help' || action === '--help') {
    if (rest.length) fail();
    return { action: 'help' };
  }
  if (action === '--version') { if (rest.length) fail(); return { action: 'version' }; }
  if (action === 'editor') { if (rest.length) fail(); return { action }; }
  if (action === 'init') {
    const [directory, ...flags] = rest;
    if (!directory) return fail('Use init <diretório> [--js | --ts] [--functions] [--local].');
    if (directory.startsWith('-') || flags.some(flag => !['--js', '--ts', '--functions', '--local'].includes(flag))
      || new Set(flags).size !== flags.length || flags.filter(flag => flag === '--js' || flag === '--ts').length > 1) {
      fail('Use init <diretório> [--js | --ts] [--functions] [--local].');
    }
    return { action, directory, language: flags.includes('--js') ? 'js' : 'ts', functions: flags.includes('--functions'), local: flags.includes('--local') };
  }
  if (action === 'functions') {
    let json = false, category: string | undefined, catalog = false, config: string | undefined, pluginsOnly = false;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--json' && !json) json = true;
      else if (rest[i] === '--catalog' && !catalog) catalog = true;
      else if (rest[i] === '--plugins-only' && !pluginsOnly) pluginsOnly = true;
      else if (rest[i] === '--category' && !category && rest[i + 1] && !rest[i + 1]!.startsWith('-')) category = rest[++i];
      else if (rest[i] === '--config' && !config && rest[i + 1] && !rest[i + 1]!.startsWith('-')) config = rest[++i];
      else fail();
    }
    if (config && !catalog) fail('--config exige functions --catalog.');
    if (pluginsOnly && (!catalog || !config)) fail('--plugins-only exige --catalog e --config explícito.');
    return { action, json, category, ...(catalog ? { catalog } : {}), ...(config ? { config } : {}), ...(pluginsOnly ? { pluginsOnly } : {}) };
  }
  if (action === 'lint' || action === 'test') {
    let input: string | undefined, json = false;
    const catalogs: string[] = [];
    for (let i = 0; i < rest.length; i++) {
      const value = rest[i]!;
      if (value === '--json' && !json) json = true;
      else if (action === 'lint' && value === '--catalog' && rest[i + 1] && !rest[i + 1]!.startsWith('-')) catalogs.push(rest[++i]!);
      else if (!value.startsWith('-') && !input) input = value;
      else fail();
    }
    if (!input) fail(`Use ${action} <arquivo ou diretório>.`);
    return action === 'lint' ? { action, input: input!, json, catalogs } : { action, input: input!, json };
  }
  if (action === 'data') {
    const [operation, input, ...flags] = rest;
    if (!['stats', 'cleanup', 'backup', 'restore'].includes(operation ?? '') || !input || input.startsWith('-')) fail('Use data <stats|cleanup|backup|restore> <store>.');
    let json = false, apply = false, limit: number | undefined, cursor: string | undefined, file: string | undefined, policy: 'replace' | 'merge' | undefined;
    for (let i = 0; i < flags.length; i++) {
      const flag = flags[i]!;
      const next = () => {
        const value = flags[++i];
        if (value === undefined || value.startsWith('--')) return fail('Opção exige um valor.');
        return value;
      };
      if (flag === '--json' && !json) json = true;
      else if (flag === '--apply' && operation === 'restore' && !apply) apply = true;
      else if (flag === '--limit' && operation === 'cleanup' && limit === undefined) {
        const raw = next(); limit = Number(raw);
        if (!/^\d+$/.test(raw) || !Number.isSafeInteger(limit) || limit < 1 || limit > 10000) fail('Limite deve estar entre 1 e 10000.');
      } else if (flag === '--cursor' && operation === 'cleanup' && cursor === undefined) cursor = next();
      else if (flag === '--file' && ['backup', 'restore'].includes(operation!) && file === undefined) file = next();
      else if (flag === '--policy' && operation === 'restore' && policy === undefined) {
        const value = next(); if (value !== 'replace' && value !== 'merge') fail('Política deve ser replace ou merge.'); policy = value as 'replace' | 'merge';
      } else fail();
    }
    if (operation === 'restore' && !file) fail('Restauração exige --file <backup.json>.');
    return { action, operation: operation as 'stats' | 'cleanup' | 'backup' | 'restore', input: input!, json, apply,
      ...(limit === undefined ? {} : { limit }), ...(cursor === undefined ? {} : { cursor }),
      ...(file === undefined ? {} : { file }), ...(policy === undefined ? {} : { policy }) };
  }
  if (action === 'check' || action === 'doctor' || action === 'run' || action === 'dev') {
    let input: string | undefined, json = false;
    for (const value of rest) {
      if ((action === 'check' || action === 'doctor') && value === '--json' && !json) json = true;
      else if (!value.startsWith('-') && !input) input = value;
      else fail();
    }
    return action === 'check' || action === 'doctor' ? { action, input, json } : { action, input };
  }
  return fail(`Comando desconhecido: ${action}.`);
}
