import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { importModule } from '../framework/module-loader.js';
import { Yuzuha } from '../bot.js';
import { functions } from '../functions.js';
import type { YuzuhaConfig } from '../config.js';
import { ConfigError } from '../errors.js';

export async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

export async function findConfig(input?: string): Promise<string> {
  if (input) return resolve(input);
  for (const file of ['yuzuha.config.ts', 'yuzuha.config.js', 'yuzuha.config.mjs']) {
    if (await exists(file)) return resolve(file);
  }
  throw new ConfigError('CONFIG_MISSING', 'Config não encontrada. Execute yuzuha init meu-bot ou informe o caminho.');
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
  if (!module.default || typeof module.default !== 'object' || Array.isArray(module.default)) throw new ConfigError('CONFIG_INVALID', 'Config deve exportar um objeto default.');
  const config = module.default as YuzuhaConfig;
  if ((config.commands !== undefined && typeof config.commands !== 'string') || (config.setup !== undefined && typeof config.setup !== 'function')) {
    await config.store?.close?.();
    throw new ConfigError('CONFIG_INVALID', 'commands deve ser texto e setup deve ser uma função.');
  }
  let bot: Yuzuha;
  try {
    bot = new Yuzuha({ ...config, engine: config.engine ?? functions() });
  } catch (error) {
    await config.store?.close?.();
    throw error;
  }
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
