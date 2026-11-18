import { Events } from '@fluxerjs/core';
import type { Yuzuha } from '../bot.js';
import { ScriptError } from '../errors.js';
import { startHealthServer } from '../framework/health.js';
import type { HealthMetricsSource, HealthServer } from '../framework/health.js';
import type { YuzuhaLogger } from '../framework/logging.js';
import { reportError } from '../framework/reporting.js';
import { watchCommands } from './watch.js';
import type { CommandWatcher } from './watch.js';
import { isShardingChildProcess, notifyClientShardReady, prepareShardedChildRun } from './sharding.js';
import type { ChildShardingOptions } from './sharding.js';

export interface RunnerTarget {
  on(event: string, listener: (...args: any[]) => void): unknown;
  once(event: string, listener: (...args: any[]) => void): unknown;
  off(event: string, listener: (...args: any[]) => void): unknown;
}

export interface RunBotOptions {
  target?: Pick<NodeJS.Process, 'on' | 'once' | 'off'> | RunnerTarget;
  timeoutMs?: number;
  healthPort?: number;
  healthHost?: string;
  onHealthListening?: (server: HealthServer) => void;
  sharding?: ChildShardingOptions;
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
  let healthServer: HealthServer | undefined;
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
      finally {
        try { await healthServer?.close(); }
        finally { await bot.options.store?.close?.(); }
      }
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
    if (runtime?.healthPort !== undefined) {
      const candidateMetrics = bot.options.metrics as Partial<HealthMetricsSource> | undefined;
      const metrics = candidateMetrics && typeof candidateMetrics.render === 'function'
        ? (candidateMetrics as HealthMetricsSource)
        : undefined;
      healthServer = await startHealthServer(bot, {
        port: runtime.healthPort,
        ...(runtime.healthHost !== undefined ? { host: runtime.healthHost } : {}),
        ...(metrics ? { metrics } : {}),
      });
      runtime.onHealthListening?.(healthServer);
      if (closeTask) {
        await healthServer.close();
        await closeTask;
        return;
      }
    }
    const shardUtil = await prepareShardedChildRun(bot, runtime?.sharding);
    const customEnv = runtime?.sharding?.env;
    const token = customEnv !== undefined
      ? (customEnv.FLUXER_BOT_TOKEN?.trim()
        ? customEnv.FLUXER_BOT_TOKEN
        : (isShardingChildProcess(customEnv, runtime?.sharding?.hasIpc) ? customEnv.FLUXER_TOKEN : customEnv.FLUXER_BOT_TOKEN))
      : undefined;
    await bot.login(token);
    if (shardUtil) notifyClientShardReady(bot.client, shardUtil);
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
