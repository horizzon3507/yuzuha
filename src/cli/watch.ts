import { watch } from 'node:fs';

export interface CommandWatcher { close(): Promise<void> }
export function watchCommands(directory: string, reload: () => Promise<void>, report: (error: unknown) => void): CommandWatcher {
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chain: Promise<void> = Promise.resolve();
  const watcher = watch(directory, { recursive: true }, (_event, filename) => {
    if (!filename || !/\.(?:m?js|cjs|ts|mts)$/.test(filename) || filename.endsWith('.d.ts')) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      chain = chain.then(async () => {
        if (closed) return;
        try { await reload(); } catch (error) { report(error); }
      });
    }, 150);
  });
  watcher.on('error', report);
  return {
    async close() { closed = true; clearTimeout(timer); watcher.close(); await chain; },
  };
}
