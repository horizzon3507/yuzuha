import { randomUUID } from 'node:crypto';
import { ConfigError, YuzuhaError } from '../errors.js';
import type { PresenceInput } from '../ports/resources/common.js';
import { validatePresenceInput } from '../ports/resources/common.js';
import type { Yuzuha } from './bot.js';

export type PresenceRotationEntry =
  | PresenceInput
  | ((bot: Yuzuha) => PresenceInput | Promise<PresenceInput>);

export interface PresenceRotationOptions {
  entries: readonly PresenceRotationEntry[];
  intervalMs: number;
  random?: boolean;
}

const MIN_PRESENCE_ROTATION_MS = 5_000;
const MAX_PRESENCE_ROTATION_MS = 86_400_000;

export interface ValidatedPresenceRotation {
  entries: readonly PresenceRotationEntry[];
  intervalMs: number;
  random: boolean;
}

export function validatePresenceRotationOptions(options: unknown): ValidatedPresenceRotation {
  const prototype = options === null || typeof options !== 'object' || Array.isArray(options)
    ? undefined
    : Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ConfigError('PRESENCE_OPTIONS', 'Opções de rotação de presença inválidas.');
  }
  const candidate = options as Partial<PresenceRotationOptions>;
  if (!Array.isArray(candidate.entries) || candidate.entries.length === 0) {
    throw new ConfigError('PRESENCE_OPTIONS', 'entries deve ser uma lista não vazia de presenças ou callbacks.');
  }
  const entries: PresenceRotationEntry[] = candidate.entries.map(entry => {
    if (typeof entry === 'function') return entry;
    return validatePresenceInput(entry, true);
  });
  if (
    typeof candidate.intervalMs !== 'number'
    || !Number.isSafeInteger(candidate.intervalMs)
    || candidate.intervalMs < MIN_PRESENCE_ROTATION_MS
    || candidate.intervalMs > MAX_PRESENCE_ROTATION_MS
  ) {
    throw new ConfigError(
      'PRESENCE_OPTIONS',
      `intervalMs da rotação de presença deve ser um inteiro entre ${MIN_PRESENCE_ROTATION_MS} e ${MAX_PRESENCE_ROTATION_MS}.`,
    );
  }
  if (candidate.random !== undefined && typeof candidate.random !== 'boolean') {
    throw new ConfigError('PRESENCE_OPTIONS', 'random deve ser um booleano quando informado.');
  }
  return {
    entries,
    intervalMs: candidate.intervalMs,
    random: candidate.random === true,
  };
}

export interface ActivePresenceRotation {
  stop(): void;
  drain(): Promise<void>;
}

export function startPresenceRotation(params: {
  bot: Yuzuha;
  config: ValidatedPresenceRotation;
  timers: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void };
  isClosing: () => boolean;
  applyPresence: (input: PresenceInput) => Promise<void>;
  runScoped: (executionID: string, fn: () => Promise<void>) => Promise<void>;
  onError: (error: unknown) => Promise<void>;
}): ActivePresenceRotation {
  const { bot, config, timers, isClosing, applyPresence, runScoped, onError } = params;
  const { entries, intervalMs, random } = config;

  let disposed = false;
  let index = -1;
  let timer: unknown;
  let hasTimer = false;
  let inFlight: Promise<void> | undefined;

  const pickEntry = (): PresenceRotationEntry => {
    if (!random) {
      index = (index + 1) % entries.length;
      return entries[index]!;
    }
    if (entries.length === 1) {
      index = 0;
      return entries[0]!;
    }
    let next = Math.floor(Math.random() * entries.length);
    if (next === index) next = (next + 1) % entries.length;
    index = next;
    return entries[next]!;
  };

  const executeStep = (): Promise<void> => {
    if (disposed || isClosing()) return Promise.resolve();
    const entry = pickEntry();
    const task = runScoped(randomUUID(), async () => {
      try {
        const resolved = typeof entry === 'function' ? await entry(bot) : entry;
        if (disposed || isClosing()) return;
        await applyPresence(resolved);
      } catch (error) {
        if (disposed || isClosing()) return;
        if (error instanceof YuzuhaError && (error.code === 'NOT_READY' || error.code === 'BOT_CLOSED')) return;
        await onError(error);
      }
    }).finally(() => {
      if (inFlight === task) inFlight = undefined;
    });
    inFlight = task;
    return task;
  };

  const schedule = (): void => {
    if (disposed || isClosing() || hasTimer) return;
    let fired = false;
    const handle = timers.setTimeout(() => {
      fired = true;
      if (timer === handle) {
        timer = undefined;
        hasTimer = false;
      }
      if (disposed || isClosing()) return;
      const previous = inFlight;
      const cycle = (previous ? previous.then(() => executeStep()) : executeStep()).finally(() => {
        if (!disposed && !isClosing()) schedule();
      });
      inFlight = cycle;
    }, intervalMs);
    if (!fired && !disposed && !isClosing()) {
      timer = handle;
      hasTimer = true;
    }
  };

  const stop = (): void => {
    if (disposed) return;
    disposed = true;
    if (hasTimer) {
      timers.clearTimeout(timer);
      timer = undefined;
      hasTimer = false;
    }
  };

  void executeStep();
  schedule();

  return {
    stop,
    async drain() {
      stop();
      await inFlight;
    },
  };
}
