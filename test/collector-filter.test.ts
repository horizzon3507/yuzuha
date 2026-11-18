import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Client, Events } from '@fluxerjs/core';
import type { Message } from '@fluxerjs/core';
import {
  CommandContext,
  FluxerResources,
  MemoryStore,
  YuzuhaError,
  defineCommand,
  isYuzuhaError,
} from '../src/index.js';
import type {
  AwaitReactionInput,
  CollectedMessageInfo,
  IncomingMessage,
  ReactionVote,
} from '../src/index.js';
import { createCollectorsResources } from '../src/infrastructure/fluxer/resources/collectors.js';
import { MockTransport, createTestBot, mockMessage } from '../src/testing.js';

async function drain<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of stream) items.push(item);
  return items;
}

interface FakeMessageOverrides {
  channelId?: string;
  guildId?: string | null;
  authorID?: string;
  authorName?: string;
  authorBot?: boolean;
  content?: string;
  mentions?: Array<{ id: string }>;
}

function fakeRichMessage(id: string, overrides: FakeMessageOverrides = {}): Message {
  return {
    id,
    channelId: overrides.channelId ?? '200',
    guildId: overrides.guildId === undefined ? '100' : overrides.guildId,
    author: {
      id: overrides.authorID ?? '1',
      username: overrides.authorName ?? 'Hory',
      bot: overrides.authorBot ?? false,
    },
    content: overrides.content ?? `msg ${id}`,
    mentions: overrides.mentions ?? [],
  } as unknown as Message;
}

function reactionAdd(messageId: string, channelId: string, userID: string, emoji: string) {
  return {
    reaction: { messageId, channelId, emoji: { name: emoji }, emojiIdentifier: emoji },
    user: { id: userID },
    userId: userID,
    messageId,
    channelId,
  };
}

test('CollectedMessageInfo exposes full IncomingMessage metadata and stays backwards-compatible', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  const emitter = client as unknown as EventEmitter;

  const guildMsg = fakeRichMessage('10', {
    channelId: '200',
    guildId: '100',
    authorID: '42',
    authorName: 'Ana',
    authorBot: false,
    content: 'olá <@2> e <@3>',
    mentions: [{ id: '2' }, { id: '3' }],
  });
  const dmMsg = fakeRichMessage('11', {
    channelId: '300',
    guildId: null,
    authorID: '99',
    authorName: 'HelperBot',
    authorBot: true,
    content: 'resposta dm',
    mentions: [],
  });

  const awaited = resources.awaitMessage('200', { timeMs: 5_000 });
  emitter.emit(Events.MessageCreate, guildMsg);
  const collected = await awaited;
  assert.ok(collected !== null);

  const asIncoming: IncomingMessage = collected;
  assert.equal(asIncoming.id, '10');
  assert.equal(collected.id, '10');
  assert.equal(collected.channelID, '200');
  assert.equal(collected.guildID, '100');
  assert.equal(collected.authorID, '42');
  assert.equal(collected.authorName, 'Ana');
  assert.equal(collected.authorBot, false);
  assert.equal(collected.content, 'olá <@2> e <@3>');
  assert.deepEqual(collected.mentions, ['2', '3']);
  assert.equal(collected.raw, guildMsg);

  const dmStream = drain(resources.collectMessages('300', { max: 1 }));
  emitter.emit(Events.MessageCreate, dmMsg);
  const [dmCollected] = await dmStream;
  assert.ok(dmCollected !== undefined);
  assert.equal(dmCollected.guildID, undefined);
  assert.equal(dmCollected.authorName, 'HelperBot');
  assert.equal(dmCollected.authorBot, true);
  assert.deepEqual(dmCollected.mentions, []);
  assert.equal(dmCollected.raw, dmMsg);
  assert.equal(client.listenerCount(Events.MessageCreate), 0);
});

test('awaitMessage applies filter on rich metadata, short-circuits built-in filters and resolves null on timeout', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  const emitter = client as unknown as EventEmitter;

  const inspectedIDs: string[] = [];
  const pending = resources.awaitMessage('200', {
    userID: '7',
    contains: 'confirmar',
    timeMs: 5_000,
    filter: message => {
      inspectedIDs.push(message.id);
      return !message.authorBot && message.authorName === 'Clara' && message.mentions.includes('999');
    },
  });

  // Rejeitadas antes do filter: canal, userID e contains diferentes.
  emitter.emit(Events.MessageCreate, fakeRichMessage('1', { channelId: '999', authorID: '7', content: 'confirmar' }));
  emitter.emit(Events.MessageCreate, fakeRichMessage('2', { authorID: '8', content: 'confirmar' }));
  emitter.emit(Events.MessageCreate, fakeRichMessage('3', { authorID: '7', content: 'outro texto' }));
  // Avaliadas pelo filter: bot ou sem menção ao bot 999.
  emitter.emit(Events.MessageCreate, fakeRichMessage('4', {
    authorID: '7', authorName: 'Clara', authorBot: true, content: 'confirmar <@999>', mentions: [{ id: '999' }],
  }));
  emitter.emit(Events.MessageCreate, fakeRichMessage('5', {
    authorID: '7', authorName: 'Clara', authorBot: false, content: 'confirmar agora', mentions: [],
  }));
  // Aceita pelo filter.
  emitter.emit(Events.MessageCreate, fakeRichMessage('6', {
    authorID: '7', authorName: 'Clara', authorBot: false, content: 'confirmar <@999>', mentions: [{ id: '999' }],
  }));

  const winner = await pending;
  assert.equal(winner?.id, '6');
  assert.deepEqual(inspectedIDs, ['4', '5', '6']);
  assert.equal(client.listenerCount(Events.MessageCreate), 0);

  const timedOut = resources.awaitMessage('200', {
    timeMs: 20,
    filter: message => message.authorName === 'Inexistente',
  });
  emitter.emit(Events.MessageCreate, fakeRichMessage('7', { authorName: 'Outra' }));
  assert.equal(await timedOut, null);
  assert.equal(client.listenerCount(Events.MessageCreate), 0);
});

test('collectMessages combines filter with userID, contains, max, maxBuffer and signal', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  const emitter = client as unknown as EventEmitter;

  const seenByFilter: string[] = [];
  const bounded = drain(resources.collectMessages('200', {
    userID: '5',
    contains: '!voto',
    max: 2,
    filter: msg => {
      seenByFilter.push(msg.id);
      return !msg.authorBot && msg.guildID === '100';
    },
  }));

  emitter.emit(Events.MessageCreate, fakeRichMessage('1', { authorID: '9', content: '!voto sim' }));
  emitter.emit(Events.MessageCreate, fakeRichMessage('2', { authorID: '5', content: 'ignorar' }));
  emitter.emit(Events.MessageCreate, fakeRichMessage('3', { authorID: '5', authorBot: true, content: '!voto bot' }));
  emitter.emit(Events.MessageCreate, fakeRichMessage('4', { authorID: '5', guildId: '777', content: '!voto outro guild' }));
  emitter.emit(Events.MessageCreate, fakeRichMessage('5', { authorID: '5', authorName: 'Bia', content: '!voto 1' }));
  emitter.emit(Events.MessageCreate, fakeRichMessage('6', { authorID: '5', authorName: 'Bia', content: '!voto 2' }));
  emitter.emit(Events.MessageCreate, fakeRichMessage('7', { authorID: '5', authorName: 'Bia', content: '!voto 3' }));

  const result = await bounded;
  assert.deepEqual(result.map(m => m.id), ['5', '6']);
  assert.deepEqual(seenByFilter, ['3', '4', '5', '6']);
  assert.equal(client.listenerCount(Events.MessageCreate), 0);

  // maxBuffer só contabiliza mensagens aprovadas pelo filter.
  const controller = new AbortController();
  const buffered = drain(resources.collectMessages('200', {
    maxBuffer: 2,
    signal: controller.signal,
    filter: msg => !msg.authorBot && msg.mentions.includes('1'),
  }));
  emitter.emit(Events.MessageCreate, fakeRichMessage('a', { mentions: [{ id: '1' }] }));
  emitter.emit(Events.MessageCreate, fakeRichMessage('b', { authorBot: true, mentions: [{ id: '1' }] }));
  emitter.emit(Events.MessageCreate, fakeRichMessage('c', { mentions: [{ id: '1' }] }));
  emitter.emit(Events.MessageCreate, fakeRichMessage('d', { mentions: [] }));
  emitter.emit(Events.MessageCreate, fakeRichMessage('e', { mentions: [{ id: '1' }] }));
  controller.abort();

  assert.deepEqual((await buffered).map(m => m.id), ['c', 'e']);
  assert.equal(client.listenerCount(Events.MessageCreate), 0);
});

test('collectReactions and awaitReaction overloads support filter predicates and options', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  const emitter = client as unknown as EventEmitter;

  const allowedVoters = new Set(['2', '4']);
  const votesPromise = drain(resources.collectReactions('200', {
    messageID: '10',
    emojis: ['👍', '👎'],
    max: 2,
    filter: vote => allowedVoters.has(vote.userID) && vote.messageID === '10',
  }));

  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '1', '👍'));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '2', '🎉'));
  emitter.emit(Events.MessageReactionAddMany, {
    channelId: '200',
    messageId: '10',
    guildId: '100',
    reactions: [
      { userId: '3', emoji: { name: '👍' } },
      { userId: '2', emoji: { name: '👍' } },
      { userId: '4', emoji: { name: '👎' } },
      { userId: '2', emoji: { name: '👎' } },
    ],
  });

  assert.deepEqual(await votesPromise, [
    { userID: '2', emoji: '👍', messageID: '10' },
    { userID: '4', emoji: '👎', messageID: '10' },
  ]);
  assert.equal(client.listenerCount(Events.MessageReactionAdd), 0);
  assert.equal(client.listenerCount(Events.MessageReactionAddMany), 0);

  // 1) Sobrecarga posicional clássica + filter opcional no 7º argumento.
  const positional = resources.awaitReaction(
    '200', '10', ['✅', '❌'], 5_000, undefined, undefined, vote => vote.userID !== '999',
  );
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '999', '✅'));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '5', '❌'));
  assert.deepEqual(await positional, { userID: '5', emoji: '❌', messageID: '10' });

  // 2) Sobrecarga posicional com objeto AwaitReactionOptions no 5º argumento.
  const withOptions = resources.awaitReaction('200', '10', ['🔥', '⭐'], 5_000, {
    userID: '8',
    filter: vote => vote.emoji === '⭐',
  });
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '8', '🔥'));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '8', '⭐'));
  assert.deepEqual(await withOptions, { userID: '8', emoji: '⭐', messageID: '10' });

  // 3) Sobrecarga AwaitReactionInput (com e sem emojis explícito).
  const byInput = resources.awaitReaction('200', {
    messageID: '10',
    timeMs: 5_000,
    filter: vote => vote.userID === '12' && vote.emoji === '🎯',
  });
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '12', '👀'));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '12', '🎯'));
  assert.deepEqual(await byInput, { userID: '12', emoji: '🎯', messageID: '10' });

  assert.equal(await resources.awaitReaction('200', { messageID: '10', emojis: [], timeMs: 50 }), null);
  await assert.rejects(
    resources.awaitReaction('200', { messageID: '', timeMs: 50 } as AwaitReactionInput),
    (err: unknown) => isYuzuhaError(err, 'COLLECTOR_MESSAGE'),
  );
  assert.equal(client.listenerCount(Events.MessageReactionAdd), 0);
  assert.equal(client.listenerCount(Events.MessageReactionAddMany), 0);
});

test('collectors reject non-function, async, generator and non-boolean filter predicates', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  const emitter = client as unknown as EventEmitter;

  const invalidFilters: unknown[] = [
    null,
    123,
    'filter',
    true,
    {},
    [],
    async () => true,
    function* () { yield true; },
  ];

  for (const invalid of invalidFilters) {
    assert.throws(
      () => resources.collectMessages('200', { max: 1, filter: invalid as never }),
      (err: unknown) => err instanceof YuzuhaError && err.code === 'COLLECTOR_BOUNDS',
    );
    assert.throws(
      () => resources.collectReactions('200', { messageID: '10', max: 1, filter: invalid as never }),
      (err: unknown) => err instanceof YuzuhaError && err.code === 'COLLECTOR_BOUNDS',
    );
    await assert.rejects(
      resources.awaitMessage('200', { timeMs: 100, filter: invalid as never }),
      (err: unknown) => err instanceof YuzuhaError && err.code === 'COLLECTOR_BOUNDS',
    );
    await assert.rejects(
      resources.awaitReaction('200', { messageID: '10', emojis: '✅', timeMs: 100, filter: invalid as never }),
      (err: unknown) => err instanceof YuzuhaError && err.code === 'COLLECTOR_BOUNDS',
    );
    await assert.rejects(
      resources.awaitReaction('200', '10', '✅', 100, { filter: invalid as never }),
      (err: unknown) => err instanceof YuzuhaError && err.code === 'COLLECTOR_BOUNDS',
    );
    await assert.rejects(
      resources.awaitReaction('200', '10', '✅', 100, undefined, undefined, invalid as never),
      (err: unknown) => err instanceof YuzuhaError && err.code === 'COLLECTOR_BOUNDS',
    );
  }

  assert.equal(client.listenerCount(Events.MessageCreate), 0);
  assert.equal(client.listenerCount(Events.MessageReactionAdd), 0);
  assert.equal(client.listenerCount(Events.MessageReactionAddMany), 0);

  // Retornos não booleanos em runtime (incluindo Promise rejeitada) falham com COLLECTOR_BOUNDS e limpam listeners.
  for (const badReturn of [
    () => 'sim',
    () => 1,
    () => undefined,
    () => null,
    () => Promise.reject(new Error('rejeição assíncrona ignorada')),
  ]) {
    const msgPromise = resources.awaitMessage('200', { timeMs: 60_000, filter: badReturn as never });
    emitter.emit(Events.MessageCreate, fakeRichMessage('1'));
    assert.equal(client.listenerCount(Events.MessageCreate), 0);
    await assert.rejects(msgPromise, (err: unknown) => isYuzuhaError(err, 'COLLECTOR_BOUNDS'));

    const streamPromise = drain(resources.collectMessages('200', { timeMs: 60_000, filter: badReturn as never }));
    emitter.emit(Events.MessageCreate, fakeRichMessage('2'));
    assert.equal(client.listenerCount(Events.MessageCreate), 0);
    await assert.rejects(streamPromise, (err: unknown) => isYuzuhaError(err, 'COLLECTOR_BOUNDS'));

    const rxStreamPromise = drain(resources.collectReactions('200', {
      messageID: '10', timeMs: 60_000, filter: badReturn as never,
    }));
    emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '1', '✅'));
    assert.equal(client.listenerCount(Events.MessageReactionAdd), 0);
    assert.equal(client.listenerCount(Events.MessageReactionAddMany), 0);
    await assert.rejects(rxStreamPromise, (err: unknown) => isYuzuhaError(err, 'COLLECTOR_BOUNDS'));
  }
});

test('filter exception immediately cleans up channel subscriptions, timers and isolates sibling collectors', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  const emitter = client as unknown as EventEmitter;

  // 1) awaitMessage com outro coletor concorrente no mesmo canal.
  const boom = new Error('falha no predicado de mensagem');
  const controller = new AbortController();
  const failingAwait = resources.awaitMessage('200', {
    timeMs: 60_000,
    signal: controller.signal,
    filter: msg => {
      if (msg.content === 'explodir') throw boom;
      return false;
    },
  });
  const siblingAwait = resources.awaitMessage('200', {
    timeMs: 60_000,
    filter: msg => msg.content === 'sobreviveu',
  });
  assert.equal(client.listenerCount(Events.MessageCreate), 2);

  emitter.emit(Events.MessageCreate, fakeRichMessage('1', { content: 'explodir' }));
  // O coletor com falha já se desinscreveu sincronicamente; o irmão segue inscrito.
  assert.equal(client.listenerCount(Events.MessageCreate), 1);
  controller.abort();
  await assert.rejects(failingAwait, (err: unknown) => err === boom);

  emitter.emit(Events.MessageCreate, fakeRichMessage('2', { content: 'sobreviveu' }));
  assert.equal((await siblingAwait)?.id, '2');
  assert.equal(client.listenerCount(Events.MessageCreate), 0);

  // 2) collectMessages: falha enquanto pausado entre next() limpa imediatamente antes do próximo next().
  const iterBoom = new Error('falha durante stream de mensagens');
  const iter = resources.collectMessages('200', {
    timeMs: 60_000,
    filter: msg => {
      if (msg.content === 'falhar') throw iterBoom;
      return true;
    },
  })[Symbol.asyncIterator]();

  const firstStep = iter.next();
  emitter.emit(Events.MessageCreate, fakeRichMessage('10', { content: 'ok' }));
  assert.equal((await firstStep).value?.id, '10');
  assert.equal(client.listenerCount(Events.MessageCreate), 1);

  // Enquanto o consumidor ainda não chamou iter.next() novamente, chega evento que lança no filter.
  emitter.emit(Events.MessageCreate, fakeRichMessage('11', { content: 'falhar' }));
  assert.equal(client.listenerCount(Events.MessageCreate), 0);
  // Eventos subsequentes não reativam o filter.
  emitter.emit(Events.MessageCreate, fakeRichMessage('12', { content: 'depois' }));
  await assert.rejects(iter.next(), (err: unknown) => err === iterBoom);
  assert.deepEqual(await iter.next(), { value: undefined, done: true });

  // 3) collectReactions e awaitReaction: falha em MessageReactionAddMany interrompe o lote e limpa ambos os listeners.
  const rxBoom = new Error('falha no filtro de reação');
  let callsInBatch = 0;
  const failingRxStream = drain(resources.collectReactions('200', {
    messageID: '10',
    timeMs: 60_000,
    filter: () => {
      callsInBatch++;
      throw rxBoom;
    },
  }));
  const siblingRxAwait = resources.awaitReaction('200', {
    messageID: '10',
    emojis: '🎉',
    timeMs: 60_000,
    filter: vote => vote.userID === '9',
  });

  emitter.emit(Events.MessageReactionAddMany, {
    channelId: '200',
    messageId: '10',
    guildId: '100',
    reactions: [
      { userId: '1', emoji: { name: '🔥' } },
      { userId: '2', emoji: { name: '✅' } },
      { userId: '9', emoji: { name: '🎉' } },
    ],
  });

  assert.equal(callsInBatch, 1);
  await assert.rejects(failingRxStream, (err: unknown) => err === rxBoom);
  assert.deepEqual(await siblingRxAwait, { userID: '9', emoji: '🎉', messageID: '10' });
  assert.equal(client.listenerCount(Events.MessageReactionAdd), 0);
  assert.equal(client.listenerCount(Events.MessageReactionAddMany), 0);

  // 4) Burst síncrono: item aprovado antes da falha é entregue e em seguida o iterador rejeita, inclusive com valor falsy.
  const collectedBeforeThrow: string[] = [];
  const burstRun = (async () => {
    for await (const msg of resources.collectMessages('200', {
      max: 5,
      filter: item => {
        if (item.id === 'b2') throw null;
        return true;
      },
    })) {
      collectedBeforeThrow.push(msg.id);
    }
  })();
  emitter.emit(Events.MessageCreate, fakeRichMessage('b1'));
  emitter.emit(Events.MessageCreate, fakeRichMessage('b2'));
  assert.equal(client.listenerCount(Events.MessageCreate), 0);
  await assert.rejects(burstRun, (err: unknown) => err === null);
  assert.deepEqual(collectedBeforeThrow, ['b1']);
});

test('filter failure clears active collector timers immediately across all four collector methods', async t => {
  const activeTimers = new Set<ReturnType<typeof setTimeout>>();
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  t.after(() => {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
  });
  globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
    const handle = realSetTimeout(...args);
    activeTimers.add(handle);
    return handle;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((handle?: ReturnType<typeof setTimeout>) => {
    if (handle !== undefined) activeTimers.delete(handle);
    realClearTimeout(handle);
  }) as typeof clearTimeout;

  const client = new Client();
  t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  const emitter = client as unknown as EventEmitter;

  const msgErr = new Error('timer-msg');
  const pMsg = resources.awaitMessage('200', { timeMs: 60_000, filter: () => { throw msgErr; } });
  assert.equal(activeTimers.size, 1);
  emitter.emit(Events.MessageCreate, fakeRichMessage('1'));
  assert.equal(activeTimers.size, 0);
  await assert.rejects(pMsg, (err: unknown) => err === msgErr);

  const rxErr = new Error('timer-rx');
  const pRx = resources.awaitReaction('200', '10', '✅', 60_000, undefined, undefined, () => { throw rxErr; });
  assert.equal(activeTimers.size, 1);
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '1', '✅'));
  assert.equal(activeTimers.size, 0);
  await assert.rejects(pRx, (err: unknown) => err === rxErr);

  const sMsgErr = new Error('timer-stream-msg');
  const sMsg = drain(resources.collectMessages('200', { timeMs: 60_000, filter: () => { throw sMsgErr; } }));
  assert.equal(activeTimers.size, 1);
  emitter.emit(Events.MessageCreate, fakeRichMessage('2'));
  assert.equal(activeTimers.size, 0);
  await assert.rejects(sMsg, (err: unknown) => err === sMsgErr);

  const sRxErr = new Error('timer-stream-rx');
  const sRx = drain(resources.collectReactions('200', {
    messageID: '10', timeMs: 60_000, filter: () => { throw sRxErr; },
  }));
  assert.equal(activeTimers.size, 1);
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '1', '✅'));
  assert.equal(activeTimers.size, 0);
  await assert.rejects(sRx, (err: unknown) => err === sRxErr);
});

test('CommandContext.resources.collectors propagates filter predicates, awaitReaction overloads and signals', async t => {
  const client = new Client();
  t.after(() => client.destroy());
  const emitter = client as unknown as EventEmitter;
  const cmdController = new AbortController();
  const ctx = new CommandContext({
    message: mockMessage('!quiz'),
    command: { name: 'quiz' },
    transport: new MockTransport(),
    store: new MemoryStore(),
    resources: new FluxerResources(client),
    signal: cmdController.signal,
    cooldown: () => 0,
  });

  const answerPromise = ctx.resources.collectors.awaitMessage('200', {
    timeMs: 60_000,
    filter: msg => !msg.authorBot && msg.content.startsWith('resposta:'),
  });
  emitter.emit(Events.MessageCreate, fakeRichMessage('1', { authorBot: true, content: 'resposta: bot' }));
  emitter.emit(Events.MessageCreate, fakeRichMessage('2', { authorName: 'Leo', content: 'resposta: 42' }));
  const answer = await answerPromise;
  assert.equal(answer?.id, '2');
  assert.equal(answer?.authorName, 'Leo');

  const voteByInput = ctx.resources.collectors.awaitReaction('200', {
    messageID: '55',
    emojis: ['🅰️', '🅱️'],
    timeMs: 60_000,
    filter: vote => vote.userID !== ctx.authorID,
  });
  emitter.emit(Events.MessageReactionAdd, reactionAdd('55', '200', ctx.authorID, '🅰️'));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('55', '200', '77', '🅱️'));
  assert.deepEqual(await voteByInput, { userID: '77', emoji: '🅱️', messageID: '55' });

  const votePositional = ctx.resources.collectors.awaitReaction(
    '200', '55', '✅', 60_000, undefined, undefined, vote => vote.userID === '88',
  );
  emitter.emit(Events.MessageReactionAdd, reactionAdd('55', '200', '11', '✅'));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('55', '200', '88', '✅'));
  assert.deepEqual(await votePositional, { userID: '88', emoji: '✅', messageID: '55' });

  const callAbort = new AbortController();
  const streamMsgs = drain(ctx.resources.collectors.collectMessages('200', {
    signal: callAbort.signal,
    filter: msg => msg.mentions.includes('77'),
  }));
  const streamRx = drain(ctx.resources.collectors.collectReactions('200', {
    messageID: '55',
    signal: callAbort.signal,
    filter: vote => vote.emoji === '🔥',
  }));
  emitter.emit(Events.MessageCreate, fakeRichMessage('20', { mentions: [] }));
  emitter.emit(Events.MessageCreate, fakeRichMessage('21', { mentions: [{ id: '77' }] }));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('55', '200', '3', '👀'));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('55', '200', '3', '🔥'));
  callAbort.abort();
  assert.deepEqual((await streamMsgs).map(m => m.id), ['21']);
  assert.deepEqual(await streamRx, [{ userID: '3', emoji: '🔥', messageID: '55' }]);

  // Cancelar o sinal do contexto encerra coletores filtrados ativos sem vazar listeners.
  const abortedMsg = ctx.resources.collectors.awaitMessage('200', {
    timeMs: 60_000,
    filter: msg => msg.content === 'nunca',
  });
  const abortedRx = ctx.resources.collectors.awaitReaction('200', '55', '✅', 60_000, {
    filter: vote => vote.userID === '77',
  });
  cmdController.abort();
  await assert.rejects(abortedMsg, { code: 'EXECUTION_ABORTED' });
  await assert.rejects(abortedRx, { code: 'EXECUTION_ABORTED' });
  assert.equal(client.listenerCount(Events.MessageCreate), 0);
  assert.equal(client.listenerCount(Events.MessageReactionAdd), 0);
  assert.equal(client.listenerCount(Events.MessageReactionAddMany), 0);

  // Integração com createTestBot e mocks tipados em resources.collectors.
  const capturedFilters: Array<((vote: ReactionVote) => boolean) | undefined> = [];
  const fixture = createTestBot({
    resources: {
      collectors: {
        async awaitMessage(channelID, input) {
          const candidate: CollectedMessageInfo = mockMessage('aprovada', { channelID, authorID: '2', authorName: 'Mia' });
          return input.filter && !input.filter(candidate) ? null : candidate;
        },
        async awaitReaction(_channelID, messageIDOrInput, _emojis, _timeMs, userIDOrOptions, _signal, filter) {
          const resolvedFilter = typeof messageIDOrInput === 'object'
            ? messageIDOrInput.filter
            : typeof userIDOrOptions === 'object'
              ? userIDOrOptions.filter
              : filter;
          capturedFilters.push(resolvedFilter);
          const candidate: ReactionVote = { userID: '2', emoji: '✅', messageID: '10' };
          return resolvedFilter && !resolvedFilter(candidate) ? null : candidate;
        },
      },
    },
    commands: [defineCommand({
      name: 'coletar',
      async run(commandCtx) {
        const msg = await commandCtx.resources.collectors.awaitMessage(commandCtx.channelID, {
          timeMs: 1_000,
          filter: item => item.authorName === 'Mia' && !item.authorBot,
        });
        const vote = await commandCtx.resources.collectors.awaitReaction(commandCtx.channelID, {
          messageID: '10',
          emojis: '✅',
          timeMs: 1_000,
          filter: item => item.userID === '2',
        });
        await commandCtx.reply(`${msg?.authorName}:${vote?.emoji}`);
      },
    })],
  });
  t.after(() => fixture.destroy());

  assert.equal(await fixture.send('!coletar'), 'success');
  assert.equal(fixture.messages.at(-1)?.payload.content, 'Mia:✅');
  assert.equal(capturedFilters.length, 1);
  assert.equal(typeof capturedFilters[0], 'function');
  assert.deepEqual(fixture.errors, []);
});
