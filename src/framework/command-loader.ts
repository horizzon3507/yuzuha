import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { importModule } from './module-loader.js';
import type { Command } from '../context.js';
import { YuzuhaError } from '../errors.js';

let generation = 0;
export async function commandFiles(directory: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await commandFiles(path));
    else if (entry.isFile() && /\.(?:m?js|cjs|ts|mts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) paths.push(resolve(path));
  }
  return paths.sort();
}
export async function loadCommands(directory: string): Promise<Command[]> {
  const commands: Command[] = [];
  const version = ++generation;
  for (const file of await commandFiles(directory)) {
    const url = pathToFileURL(file);
    url.searchParams.set('yuzuha', String(version));
    const module = await importModule(url.href);
    const exported = module.default;
    for (const value of Array.isArray(exported) ? exported : [exported]) {
      if (!value || typeof value !== 'object' || !('name' in value)) throw new YuzuhaError('COMMAND_FILE', `Exporte um comando como default: ${file}.`);
      commands.push({ ...(value as Command), file });
    }
  }
  return commands;
}
