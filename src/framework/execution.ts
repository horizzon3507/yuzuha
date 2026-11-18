import { AsyncLocalStorage } from 'node:async_hooks';

export interface ExecutionStore {
  readonly executionID: string;
  readonly source: 'command' | 'event' | 'gateway' | 'scheduler';
  readonly command?: string;
  readonly event?: string;
  readonly guildID?: string;
  readonly channelID?: string;
  readonly userID?: string;
}

interface ExecutionScope {
  readonly owner: object;
  readonly context: Readonly<ExecutionStore>;
}

const executionALS = new AsyncLocalStorage<ExecutionScope>();

/** Retorna os metadados da execução atual propagada via `AsyncLocalStorage`, quando existir. */
export function currentExecution(): ExecutionStore | undefined {
  return executionALS.getStore()?.context;
}

export function isExecutionOwner(owner: object): boolean {
  return executionALS.getStore()?.owner === owner;
}

export function runInExecution<T>(owner: object, context: ExecutionStore, fn: () => T): T {
  return executionALS.run({ owner, context: Object.freeze({ ...context }) }, fn);
}
