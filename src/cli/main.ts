import { lint } from './lint.js';
import { runScenarios } from './scenarios.js';
import { dataCommand } from './data.js';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Yuzuha } from '../bot.js';
import { ScriptError, YuzuhaError } from '../errors.js';
import { registerBuiltins } from '../functions.js';
import { Runtime } from '../runtime.js';
import { parseArguments, usage } from './arguments.js';
import { configuredBot, findConfig } from './config.js';
import { runBot } from './runner.js';
import { scaffold } from './scaffold.js';
import { packageRoot, VERSION } from './version.js';
import { doctor } from './doctor.js';
import { commandCatalog } from './command-catalog.js';

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseArguments(args);
  if (options.action === 'help') { console.log(usage); return; }
  if (options.action === 'version') { console.log(VERSION); return; }
  if (options.action === 'editor') { console.log(resolve(packageRoot, 'editors/vscode')); return; }
  if (options.action === 'lint') {
    const report = await lint(options.input, options.catalogs);
    console.log(options.json ? JSON.stringify(report, null, 2) : report.diagnostics.length
      ? report.diagnostics.map(value => `${value.file}:${value.range.start.line}:${value.range.start.column} [${value.code}] ${value.message}`).join('\n')
      : `${report.files} arquivos válidos. Nenhum módulo importado.`);
    if (!report.valid) process.exitCode = 1;
    return;
  }
  if (options.action === 'test') {
    const report = await runScenarios(resolve(options.input));
    console.log(options.json ? JSON.stringify(report, null, 2) : report.scenarios.map(value => `${value.passed ? 'PASS' : 'FAIL'} ${value.name}: ${value.messages.filter(message => message.passed).length}/${value.messages.length}`).join('\n'));
    if (!report.valid) process.exitCode = 1;
    return;
  }
  if (options.action === 'data') {
    const report = await dataCommand(options);
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (options.action === 'doctor') {
    const report = await doctor(options.input);
    console.log(options.json ? JSON.stringify(report, null, 2) : report.checks.map(check => `${check.status.toUpperCase()} ${check.name}: ${check.message}`).join('\n'));
    if (!report.ok) process.exitCode = 1;
    return;
  }
  if (options.action === 'init') { await scaffold(options.directory, options.language, options.functions, options.local); return; }
  if (options.action === 'functions') {
    let catalogBot: Yuzuha | undefined;
    let all;
    try {
      if (options.config) {
        ({ bot: catalogBot } = await configuredBot(await findConfig(options.config), false, false));
        all = catalogBot.enableFunctions().runtime.functions();
      } else all = registerBuiltins(new Runtime()).functions();
    } finally { if (catalogBot) { await catalogBot.destroy(); await catalogBot.options.store?.close?.(); } }

    const builtinNames = options.pluginsOnly ? new Set(registerBuiltins(new Runtime()).functions().map(fn => fn.name.replace(/^\$/, '').toLowerCase())) : undefined;
    const visible = builtinNames ? all.filter(fn => !builtinNames.has(fn.name.replace(/^\$/, '').toLowerCase())) : all;
    const functions = options.category ? visible.filter(fn => fn.category === options.category) : visible;
    if (options.category && !functions.length) throw new YuzuhaError('CATEGORY', `Categoria desconhecida. Escolha: ${[...new Set(all.map(fn => fn.category))].join(', ')}.`);
    const metadata = functions.map(({ execute: _execute, ...value }) => value);
    console.log(options.catalog ? JSON.stringify({ version: 1, functions: metadata }, null, 2) : options.json ? JSON.stringify(metadata, null, 2) : functions.map(fn => `${fn.usage.padEnd(52)} ${fn.description}`).join('\n'));
    return;
  }
  let bot: Yuzuha, commandsPath: string;
  if (options.action === 'check' && options.input && (await stat(resolve(options.input))).isDirectory()) {
    bot = new Yuzuha(); commandsPath = resolve(options.input);
    try { await bot.load(commandsPath); } catch (error) { await bot.destroy(); throw error; }
  } else ({ bot, commandsPath } = await configuredBot(await findConfig(options.input), options.action !== 'check'));
  if (options.action === 'check') {
    try {
      const configuredPrefix = bot.options.prefix;
      const prefix = typeof configuredPrefix === 'string' ? configuredPrefix : Array.isArray(configuredPrefix) ? configuredPrefix[0] ?? '!' : '!';
      const commands = commandCatalog(bot.listCommands(), prefix);
      console.log(options.json ? JSON.stringify({ valid: true, version: VERSION, commands }, null, 2) : `${commands.length} comandos válidos. Nenhum login realizado.`);
    } finally { await bot.destroy(); await bot.options.store?.close?.(); }
    return;
  }
  await runBot(bot, commandsPath, options.action === 'dev');
}

export function formatCLIError(error: unknown, json: boolean): string {
  const code = error instanceof YuzuhaError ? error.code : (error as NodeJS.ErrnoException)?.code ?? 'CLI_ERROR';
  const message = error instanceof ScriptError ? error.format()
    : error instanceof YuzuhaError ? error.message
    : code === 'ENOENT' ? 'Arquivo ou diretório não encontrado. Confira o caminho informado.'
    : code === 'EEXIST' ? 'O diretório já existe. Escolha um diretório novo para gerar o bot.'
    : 'Falha ao executar. Confira configuração, dependências e conexão.';
  return json ? JSON.stringify({ valid: false, code, message }) : `[${code}] ${message}`;
}
