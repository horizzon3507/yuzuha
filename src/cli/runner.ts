import { Events } from '@fluxerjs/core';
import type { Yuzuha } from '../bot.js';
import { ScriptError } from '../errors.js';
import type { YuzuhaLogger } from '../framework/logging.js';
import { reportError } from '../framework/reporting.js';
import { watchCommands } from './watch.js';
import type { CommandWatcher } from './watch.js';

export interface RunnerTarget {
  on(event: string, listener: (...args: any[]) => void): unknown;
  once(event: string, listener: (...args: any[]) => void): unknown;
  off(event: string, listener: (...args: any[]) => void): unknown;
}

export interface RunBotOptions {
  target?: Pick<NodeJS.Process, 'on' | 'once' | 'off'> | RunnerTarget;
  timeoutMs?: number;
}

function logRunnerInfo(logger: YuzuhaLogger | false | undefined, message: string): void {
  if (logger === false) return;
  if (logger) {
    try { logger.info(message); } catch {}
    return;
  }
  console.log(message);
}

function logRunnerError(logger: YuzuhaLogger | false | undefined, message: string): void {
  if (logger === false) return;
  if (logger) {
    try { logger.error(message); } catch {}
    return;
  }
  console.error(message);
}

export async function runBot(
  bot: Yuzuha,
  commandsPath: string,
  development: boolean,
  runtime?: RunBotOptions,
): Promise<void> {
  const target = (runtime?.target ?? process) as RunnerTarget;
  const timeoutMs = runtime?.timeoutMs ?? 10_000;
  let watcher: CommandWatcher | undefined;
  let closeTask: Promise<void> | undefined;
  let crashing = false;

  const onReady = () => logRunnerInfo(bot.options.logger, 'Yuzuha conectado.');
  const detach = (): void => {
    target.off('SIGINT', signal);
    target.off('SIGTERM', signal);
    target.off('unhandledRejection', onRejection);
    target.off('uncaughtException', onException);
  };
  const close = (): Promise<void> => {
    closeTask ??= (async () => {
      detach();
      bot.client.off(Events.Ready, onReady);
      await watcher?.close();
      try { await bot.destroy({ timeoutMs }); }
      finally { await bot.options.store?.close?.(); }
    })();
    return closeTask;
  };
  const signal = () => { void close().catch(() => { process.exitCode = 1; }); };
  const onFatal = (error: unknown): void => {
    if (crashing) return;
    crashing = true;
    detach();
    process.exitCode = 1;
    void reportError(bot.options, error).finally(() => {
      void close().catch(() => { process.exitCode = 1; });
    });
  };
  const onRejection = (reason: unknown): void => { onFatal(reason); };
  const onException = (error: Error): void => { onFatal(error); };

  target.once('SIGINT', signal);
  target.once('SIGTERM', signal);
  target.on('unhandledRejection', onRejection);
  target.on('uncaughtException', onException);
  bot.client.on(Events.Ready, onReady);

  try {
    await bot.login();
    if (closeTask) { await closeTask; return; }
    if (development) watcher = watchCommands(commandsPath, async () => {
      await bot.reload(commandsPath); logRunnerInfo(bot.options.logger, 'Comandos recarregados.');
    }, error => logRunnerError(bot.options.logger, error instanceof ScriptError ? error.format() : 'Recarga recusada ou watcher indisponível. Reinicie o modo dev se necessário.'));
  } catch (error) {
    const interrupted = closeTask !== undefined;
    await close();
    if (!interrupted) throw error;
  }
}
