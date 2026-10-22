import { Events } from '@fluxerjs/core';
import type { Yuzuha } from '../bot.js';
import { ScriptError } from '../errors.js';
import { watchCommands } from './watch.js';
import type { CommandWatcher } from './watch.js';

export async function runBot(bot: Yuzuha, commandsPath: string, development: boolean): Promise<void> {
  let watcher: CommandWatcher | undefined;
  let closeTask: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closeTask ??= (async () => {
      process.off('SIGINT', signal); process.off('SIGTERM', signal);
      await watcher?.close();
      try { await bot.destroy(); } finally { await bot.options.store?.close?.(); }
    })();
    return closeTask;
  };
  const signal = () => { void close().catch(() => { process.exitCode = 1; }); };
  process.once('SIGINT', signal); process.once('SIGTERM', signal);
  bot.client.on(Events.Ready, () => console.log('Yuzuha conectado.'));
  try {
    await bot.login();
    if (closeTask) { await closeTask; return; }
    if (development) watcher = watchCommands(commandsPath, async () => {
      await bot.reload(commandsPath); console.log('Comandos recarregados.');
    }, error => console.error(error instanceof ScriptError ? error.format() : 'Recarga recusada ou watcher indisponível. Reinicie o modo dev se necessário.'));
  } catch (error) {
    const interrupted = closeTask !== undefined;
    await close();
    if (!interrupted) throw error;
  }
}
