import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { importModule } from '../framework/module-loader.js';
import { Yuzuha } from '../bot.js';
import type { YuzuhaConfig } from '../config.js';
import { YuzuhaError } from '../errors.js';

export async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

export async function findConfig(input?: string): Promise<string> {
  if (input) return resolve(input);
  for (const file of ['yuzuha.config.ts', 'yuzuha.config.js', 'yuzuha.config.mjs']) {
    if (await exists(file)) return resolve(file);
  }
  throw new YuzuhaError('CONFIG_MISSING', 'Config não encontrada. Execute yuzuha init meu-bot ou informe o caminho.');
}

export async function loadEnvironment(directory: string): Promise<void> {
  const path = join(directory, '.env');
  if (!(await exists(path))) return;
  for (const [key, value] of Object.entries(parseEnv(await readFile(path, 'utf8')))) process.env[key] ??= value;
}

export async function configuredBot(path: string, environment: boolean, loadCommands = true): Promise<{ bot: Yuzuha; commandsPath: string }> {
  const directory = dirname(path);
  if (environment) await loadEnvironment(directory);
  const module = await importModule(pathToFileURL(path).href);
  if (!module.default || typeof module.default !== 'object' || Array.isArray(module.default)) throw new YuzuhaError('CONFIG_INVALID', 'Config deve exportar um objeto default.');
  const config = module.default as YuzuhaConfig;
  if ((config.commands !== undefined && typeof config.commands !== 'string') || (config.setup !== undefined && typeof config.setup !== 'function')) throw new YuzuhaError('CONFIG_INVALID', 'commands deve ser texto e setup deve ser uma função.');
  const bot = new Yuzuha(config);
  try {
    await config.setup?.(bot);
    const commandsPath = resolve(directory, config.commands ?? 'commands');
    if (loadCommands) await bot.load(commandsPath, false);
    return { bot, commandsPath };
  } catch (error) {
    await bot.destroy();
    await config.store?.close?.();
    throw error;
  }
}
