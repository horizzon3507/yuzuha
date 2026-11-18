import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { Client } from '@fluxerjs/core';
import type { PresenceUpdateOptions } from '@fluxerjs/core';
import {
  ConfigError,
  FluxerResources,
  MemoryStore,
  Yuzuha,
  isYuzuhaError,
} from '../src/index.js';
import type { PresenceInput } from '../src/index.js';
import { MockTransport } from '../src/testing.js';

function trackedTimers() {
  const pending = new Map<number, { fn: () => void; at: number }>();
  let now = 0;
  let seq = 0;
  return {
    get activeCount(): number {
      return pending.size;
    },
    setTimeout(fn: () => void, ms: number): unknown {
      const handle = ++seq;
      pending.set(handle, { fn, at: now + ms });
      return handle;
    },
    clearTimeout(handle: unknown): void {
      pending.delete(handle as number);
    },
    advance(ms: number): void {
      now += ms;
      for (const [handle, timer] of [...pending]) {
        if (timer.at <= now) {
          pending.delete(handle);
          timer.fn();
        }
      }
    },
  };
}

test('users.setPresence preserva retrocompatibilidade (status, activity?) e suporta PresenceInput rico', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const users = new FluxerResources(client).users;

  // Falha NOT_READY quando client.user está ausente (mas validação roda antes)
  await assert.rejects(users.setPresence('online'), err => isYuzuhaError(err, 'NOT_READY'));
  await assert.rejects(
    users.setPresence('invalido' as never),
    err => isYuzuhaError(err, 'PRESENCE_OPTIONS'),
  );

  const payloads: PresenceUpdateOptions[] = [];
  Reflect.set(client, 'user', {
    id: '999',
    setPresence(options: PresenceUpdateOptions) {
      payloads.push(options);
    },
  });

  // Assinatura legada (status, activity?)
  await users.setPresence('online');
  await users.setPresence('dnd', { type: 'playing', name: 'Yuzuha', url: 'https://fluxer.app' });
  await users.setPresence('idle', { type: 'custom', name: 'Pausa para café' });

  assert.deepEqual(payloads.splice(0), [
    { status: 'online' },
    { status: 'dnd', activities: [{ name: 'Yuzuha', type: 0, url: 'https://fluxer.app' }] },
    { status: 'idle', customStatus: { text: 'Pausa para café' } },
  ]);

  // PresenceInput rico: activities[], customStatus string/objeto com emoji unicode/customizado, afk e state
  await users.setPresence({
    status: 'dnd',
    afk: true,
    activities: [
      { type: 'listening', name: 'Lo-Fi' },
      { type: 'competing', name: 'Torneio' },
    ],
    customStatus: { text: 'Em manutenção', emoji: '🔧' },
  });

  await users.setPresence({
    customStatus: { text: 'Comunidade', emoji: '<a:festa:1234567890>' },
    activities: [],
  });

  await users.setPresence({
    status: 'invisible',
    customStatus: { text: 'Par', emoji: 'yuzu:98765' },
  });

  await users.setPresence({
    status: 'online',
    activity: { type: 'custom', name: 'Custom', state: 'Via state' },
  });

  await users.setPresence({
    status: 'online',
    customStatus: null,
  });

  assert.deepEqual(payloads.splice(0), [
    {
      status: 'dnd',
      afk: true,
      activities: [
        { name: 'Lo-Fi', type: 2 },
        { name: 'Torneio', type: 5 },
      ],
      customStatus: { text: 'Em manutenção', emojiName: '🔧' },
    },
    {
      status: 'online',
      activities: [],
      customStatus: { text: 'Comunidade', emojiName: 'festa', emojiId: '1234567890' },
    },
    {
      status: 'invisible',
      customStatus: { text: 'Par', emojiName: 'yuzu', emojiId: '98765' },
    },
    {
      status: 'online',
      customStatus: { text: 'Via state' },
    },
    {
      status: 'online',
      customStatus: null,
    },
  ]);

  // Rejeições de validação
  await assert.rejects(
    users.setPresence({ status: 'online' } as never, { type: 'playing', name: 'x' }),
    err => isYuzuhaError(err, 'PRESENCE_OPTIONS'),
  );
  await assert.rejects(
    users.setPresence({ activities: [{ type: 'watching', name: '   ' }] }),
    err => isYuzuhaError(err, 'PRESENCE_OPTIONS'),
  );
  await assert.rejects(
    users.setPresence({ afk: 'sim' as never }),
    err => isYuzuhaError(err, 'PRESENCE_OPTIONS'),
  );
});

test('bot.setPresence e bot.rotatePresence rotacionam determinísticamente com timers, callbacks e destroy()', async () => {
  const timers = trackedTimers();
  const client = new Client();
  const applied: PresenceUpdateOptions[] = [];
  Reflect.set(client, 'user', {
    id: '999',
    setPresence(options: PresenceUpdateOptions) {
      applied.push(options);
    },
  });

  const bot = new Yuzuha({
    client,
    transport: new MockTransport(),
    store: new MemoryStore(),
    timers,
    scheduler: false,
    variables: false,
  });

  // Validação de opções de rotatePresence
  for (const invalid of [
    null,
    [],
    { entries: [], intervalMs: 5_000 },
    { entries: [{ status: 'online' }], intervalMs: 4_999 },
    { entries: [{ status: 'online' }], intervalMs: 5_000.5 },
    { entries: [{ status: 'bad' }], intervalMs: 5_000 },
    { entries: [{ status: 'online' }], intervalMs: 5_000, random: 'yes' },
  ]) {
    assert.throws(
      () => bot.rotatePresence(invalid as never),
      err => err instanceof ConfigError && isYuzuhaError(err, 'PRESENCE_OPTIONS'),
    );
  }

  await bot.setPresence({ status: 'idle', customStatus: 'Manual' });
  assert.deepEqual(applied.splice(0), [{ status: 'idle', customStatus: { text: 'Manual' } }]);

  let tickCounter = 0;
  const stop = bot.rotatePresence({
    intervalMs: 5_000,
    entries: [
      { status: 'online', activity: { type: 'playing', name: 'Entrada 1' } },
      async (currentBot): Promise<PresenceInput> => {
        tickCounter++;
        return {
          status: 'dnd',
          customStatus: `Dinâmico #${tickCounter} (${currentBot.voiceStates.size})`,
          afk: false,
        };
      },
      { status: 'idle', activities: [{ type: 'watching', name: 'Entrada 3' }] },
    ],
  });

  // Timer agendado imediatamente e primeira entrada aplicada
  assert.equal(timers.activeCount, 1);
  await setImmediate();
  assert.deepEqual(applied.splice(0), [
    { status: 'online', activities: [{ name: 'Entrada 1', type: 0 }] },
  ]);

  // Avança 5s -> segunda entrada (callback dinâmico assíncrono)
  timers.advance(5_000);
  await setImmediate();
  assert.deepEqual(applied.splice(0), [
    { status: 'dnd', afk: false, customStatus: { text: 'Dinâmico #1 (0)' } },
  ]);
  assert.equal(timers.activeCount, 1);

  // Avança 5s -> terceira entrada
  timers.advance(5_000);
  await setImmediate();
  assert.deepEqual(applied.splice(0), [
    { status: 'idle', activities: [{ name: 'Entrada 3', type: 3 }] },
  ]);

  // Avança 5s -> volta para a primeira entrada
  timers.advance(5_000);
  await setImmediate();
  assert.deepEqual(applied.splice(0), [
    { status: 'online', activities: [{ name: 'Entrada 1', type: 0 }] },
  ]);

  // Disposer é idempotente e cancela timers
  stop();
  stop();
  assert.equal(timers.activeCount, 0);
  timers.advance(15_000);
  await setImmediate();
  assert.deepEqual(applied, []);

  // Nova rotação com random: true para automaticamente em bot.destroy()
  bot.rotatePresence({
    intervalMs: 6_000,
    random: true,
    entries: [
      { status: 'online', customStatus: 'A' },
      { status: 'idle', customStatus: 'B' },
    ],
  });
  assert.equal(timers.activeCount, 1);
  await setImmediate();
  assert.equal(applied.length, 1);

  await bot.destroy();
  assert.equal(timers.activeCount, 0);
  const countAtDestroy = applied.length;
  timers.advance(30_000);
  await setImmediate();
  assert.equal(applied.length, countAtDestroy);
  await assert.rejects(bot.setPresence({ status: 'online' }), err => isYuzuhaError(err, 'BOT_CLOSED'));
  assert.throws(
    () => bot.rotatePresence({ entries: [{ status: 'online' }], intervalMs: 5_000 }),
    err => isYuzuhaError(err, 'BOT_CLOSED'),
  );
});
