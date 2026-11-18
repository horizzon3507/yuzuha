import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Client, Events, MessageCollector, ReactionCollector } from '@fluxerjs/core';
import { createCollectorsResources } from '../src/infrastructure/fluxer/resources/collectors.js';
import type { CollectReactionsInput } from '../src/ports/resources/collectors.js';
import { YuzuhaError } from '../src/errors.js';

async function drain<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of stream) items.push(item);
  return items;
}

function fakeMessage(id: string, channelId = '200', authorID = '1', content = `msg ${id}`) {
  return { id, channelId, author: { id: authorID }, content };
}

function reactionAdd(messageId: string, channelId: string, userID: string, emoji: string) {
  return {
    reaction: { messageId, channelId, emoji: { name: emoji }, emojiIdentifier: emoji },
    user: { id: userID }, userId: userID, messageId, channelId,
  };
}

test('collectMessages yields messages in order and stops at max', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  const emitter = client as unknown as EventEmitter;
  const work = drain(resources.collectMessages('200', { max: 2 }));
  const first = fakeMessage('1');
  emitter.emit(Events.MessageCreate, first);
  emitter.emit(Events.MessageCreate, fakeMessage('2'));
  emitter.emit(Events.MessageCreate, fakeMessage('3'));
  const items = await work;
  assert.deepEqual(items.map(m => m.id), ['1', '2']);
  assert.deepEqual(items[0], {
    id: '1', channelID: '200', guildID: undefined, authorID: '1',
    authorName: '', authorBot: false, content: 'msg 1', mentions: [], raw: first,
  });
  assert.equal(client.listenerCount(Events.MessageCreate), 0);
});

test('collectMessages filters author and content, then ends on timeMs', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  const emitter = client as unknown as EventEmitter;
  const work = drain(resources.collectMessages('200', { userID: '7', contains: 'oi', timeMs: 25 }));
  emitter.emit(Events.MessageCreate, fakeMessage('1', '200', '7', 'nada'));
  emitter.emit(Events.MessageCreate, fakeMessage('2', '200', '8', 'oi'));
  emitter.emit(Events.MessageCreate, fakeMessage('3', '999', '7', 'oi'));
  emitter.emit(Events.MessageCreate, fakeMessage('4', '200', '7', 'oi tudo'));
  const items = await work;
  assert.deepEqual(items.map(m => m.id), ['4']);
  assert.equal(items[0]!.authorID, '7');
});

test('collectMessages requires a bound: timeMs, max or signal', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  for (const input of [{}, { timeMs: 0 }, { max: -3 }]) {
    assert.throws(() => resources.collectMessages('200', input),
      (e: unknown) => e instanceof YuzuhaError && e.code === 'COLLECTOR_BOUNDS');
  }
  assert.throws(() => resources.collectReactions('200', { messageID: '10' }),
    (e: unknown) => e instanceof YuzuhaError && e.code === 'COLLECTOR_BOUNDS');
  assert.equal(client.listenerCount(Events.MessageCreate), 0);
  assert.equal(client.listenerCount(Events.MessageReactionAdd), 0);
});

test('collectReactions requires messageID at runtime', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  assert.throws(() => resources.collectReactions('200', { max: 1 } as CollectReactionsInput),
    (e: unknown) => e instanceof YuzuhaError && e.code === 'COLLECTOR_MESSAGE');
});

test('aborting the signal ends the stream after queued items and removes listeners', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  const emitter = client as unknown as EventEmitter;
  const controller = new AbortController();
  const work = drain(resources.collectMessages('200', { max: 5, signal: controller.signal }));
  emitter.emit(Events.MessageCreate, fakeMessage('1'));
  emitter.emit(Events.MessageCreate, fakeMessage('2'));
  controller.abort();
  assert.deepEqual((await work).map(m => m.id), ['1', '2']);
  assert.equal(client.listenerCount(Events.MessageCreate), 0);
});

test('a signal alone bounds the stream and a pre-aborted signal yields nothing', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  const emitter = client as unknown as EventEmitter;
  const controller = new AbortController();
  const work = drain(resources.collectMessages('200', { signal: controller.signal }));
  emitter.emit(Events.MessageCreate, fakeMessage('1'));
  controller.abort();
  assert.deepEqual((await work).map(m => m.id), ['1']);
  const preAborted = new AbortController(); preAborted.abort();
  assert.deepEqual(await drain(resources.collectMessages('200', { signal: preAborted.signal })), []);
  assert.equal(client.listenerCount(Events.MessageCreate), 0);
});

test('breaking out of the loop stops the collector and removes listeners', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  const emitter = client as unknown as EventEmitter;
  const first = (async () => {
    for await (const message of resources.collectMessages('200', { timeMs: 60_000 })) return message.id;
    return undefined;
  })();
  emitter.emit(Events.MessageCreate, fakeMessage('9'));
  assert.equal(await first, '9');
  assert.equal(client.listenerCount(Events.MessageCreate), 0);
});

test('collectReactions yields matching votes and stops at max', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  const emitter = client as unknown as EventEmitter;
  const work = drain(resources.collectReactions('200', { messageID: '10', emojis: ['✅'], userID: '2', max: 1 }));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '2', '❌'));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '8', '✅'));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('11', '200', '2', '✅'));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '2', '✅'));
  const votes = await work;
  assert.deepEqual(votes, [{ userID: '2', emoji: '✅', messageID: '10' }]);
  assert.equal(client.listenerCount(Events.MessageReactionAdd), 0);
  assert.equal(client.listenerCount(Events.MessageReactionAddMany), 0);
});

test('collectReactions handles messageReactionAddMany and ends on timeMs', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  const emitter = client as unknown as EventEmitter;
  const work = drain(resources.collectReactions('200', { messageID: '10', timeMs: 25 }));
  emitter.emit(Events.MessageReactionAddMany, {
    channelId: '200', messageId: '10', guildId: null,
    reactions: [
      { userId: '3', emoji: { name: '🔥' } },
      { userId: '4', emoji: { name: '✅' } },
    ],
  });
  const votes = await work;
  assert.deepEqual(votes, [
    { userID: '3', emoji: '🔥', messageID: '10' },
    { userID: '4', emoji: '✅', messageID: '10' },
  ]);
});

test('aborting ends a reaction stream and removes both reaction listeners', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  const emitter = client as unknown as EventEmitter;
  const controller = new AbortController();
  const work = drain(resources.collectReactions('200', { messageID: '10', signal: controller.signal }));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '2', '✅'));
  controller.abort();
  assert.deepEqual(await work, [{ userID: '2', emoji: '✅', messageID: '10' }]);
  assert.equal(client.listenerCount(Events.MessageReactionAdd), 0);
  assert.equal(client.listenerCount(Events.MessageReactionAddMany), 0);
});

test('collectors validate maxBuffer as a positive safe integer', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  for (const maxBuffer of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => resources.collectMessages('200', { max: 1, maxBuffer }),
      (e: unknown) => e instanceof YuzuhaError && e.code === 'COLLECTOR_BOUNDS');
    assert.throws(() => resources.collectReactions('200', { messageID: '10', max: 1, maxBuffer }),
      (e: unknown) => e instanceof YuzuhaError && e.code === 'COLLECTOR_BOUNDS');
  }
  assert.equal(client.listenerCount(Events.MessageCreate), 0);
  assert.equal(client.listenerCount(Events.MessageReactionAdd), 0);
});

test('collectMessages applies O(1) maxBuffer drop-oldest backpressure across wraparound and resize', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  const emitter = client as unknown as EventEmitter;

  // Burst past small maxBuffer before draining keeps only the newest items in order.
  const burst = drain(resources.collectMessages('200', { max: 5, maxBuffer: 2 }));
  for (const id of ['1', '2', '3', '4', '5']) emitter.emit(Events.MessageCreate, fakeMessage(id));
  assert.deepEqual((await burst).map(m => m.id), ['4', '5']);
  assert.equal(client.listenerCount(Events.MessageCreate), 0);

  // Interleaved consume and wraparound drops oldest unread item while keeping FIFO order.
  const controller = new AbortController();
  const iter = resources.collectMessages('200', { maxBuffer: 3, signal: controller.signal })[Symbol.asyncIterator]();
  const first = iter.next();
  emitter.emit(Events.MessageCreate, fakeMessage('a'));
  emitter.emit(Events.MessageCreate, fakeMessage('b'));
  assert.equal((await first).value?.id, 'a');
  emitter.emit(Events.MessageCreate, fakeMessage('c'));
  emitter.emit(Events.MessageCreate, fakeMessage('d'));
  emitter.emit(Events.MessageCreate, fakeMessage('e'));
  controller.abort();
  const rest: string[] = [];
  for (;;) {
    const step = await iter.next();
    if (step.done) break;
    rest.push(step.value.id);
  }
  assert.deepEqual(rest, ['c', 'd', 'e']);
  assert.equal(client.listenerCount(Events.MessageCreate), 0);

  // Crossing the 64-slot initial ring grows smoothly up to maxBuffer and drops oldest above it.
  const larger = drain(resources.collectMessages('200', { max: 105, maxBuffer: 100 }));
  for (let i = 1; i <= 105; i++) emitter.emit(Events.MessageCreate, fakeMessage(String(i)));
  const largeItems = await larger;
  assert.equal(largeItems.length, 100);
  assert.equal(largeItems[0]!.id, '6');
  assert.equal(largeItems.at(-1)!.id, '105');
});

test('collectReactions applies maxBuffer drop-oldest backpressure and stops cleanly on abort', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  const emitter = client as unknown as EventEmitter;
  const controller = new AbortController();
  const work = drain(resources.collectReactions('200', { messageID: '10', maxBuffer: 2, signal: controller.signal }));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '1', '🔥'));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '2', '✅'));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '3', '⭐'));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '4', '🎉'));
  controller.abort();
  assert.deepEqual(await work, [
    { userID: '3', emoji: '⭐', messageID: '10' },
    { userID: '4', emoji: '🎉', messageID: '10' },
  ]);
  assert.equal(client.listenerCount(Events.MessageReactionAdd), 0);
  assert.equal(client.listenerCount(Events.MessageReactionAddMany), 0);
});

test('collectMessages and collectReactions keep SDK collector.collected empty during max and signal streams', async t => {
  const client = new Client(); t.after(() => client.destroy());
  const resources = createCollectorsResources(client);
  const emitter = client as unknown as EventEmitter;

  const msgCollectSizes: number[] = [];
  const msgEndSizes: number[] = [];
  const origMsgEmit = MessageCollector.prototype.emit;
  t.after(() => { MessageCollector.prototype.emit = origMsgEmit; });
  MessageCollector.prototype.emit = function (this: MessageCollector, event: string, ...args: unknown[]) {
    const result = Reflect.apply(origMsgEmit, this, [event, ...args]) as boolean;
    if (event === 'collect') msgCollectSizes.push(this.collected.size);
    if (event === 'end') msgEndSizes.push(this.collected.size);
    return result;
  } as typeof origMsgEmit;

  const rxCollectSizes: number[] = [];
  const rxEndSizes: number[] = [];
  const origRxEmit = ReactionCollector.prototype.emit;
  t.after(() => { ReactionCollector.prototype.emit = origRxEmit; });
  ReactionCollector.prototype.emit = function (this: ReactionCollector, event: string, ...args: unknown[]) {
    const result = Reflect.apply(origRxEmit, this, [event, ...args]) as boolean;
    if (event === 'collect') rxCollectSizes.push(this.collected.size);
    if (event === 'end') rxEndSizes.push(this.collected.size);
    return result;
  } as typeof origRxEmit;

  // max-bounded message stream
  const maxMsgs = drain(resources.collectMessages('200', { max: 3 }));
  emitter.emit(Events.MessageCreate, fakeMessage('1'));
  emitter.emit(Events.MessageCreate, fakeMessage('2'));
  emitter.emit(Events.MessageCreate, fakeMessage('3'));
  emitter.emit(Events.MessageCreate, fakeMessage('4'));
  assert.deepEqual((await maxMsgs).map(m => m.id), ['1', '2', '3']);

  // signal-bounded message stream
  const msgAbort = new AbortController();
  const sigMsgs = drain(resources.collectMessages('200', { signal: msgAbort.signal }));
  emitter.emit(Events.MessageCreate, fakeMessage('10'));
  emitter.emit(Events.MessageCreate, fakeMessage('11'));
  msgAbort.abort();
  assert.deepEqual((await sigMsgs).map(m => m.id), ['10', '11']);

  assert.deepEqual(msgCollectSizes, [0, 0, 0, 0, 0]);
  assert.deepEqual(msgEndSizes, [0, 0]);

  // max-bounded reaction stream
  const maxRx = drain(resources.collectReactions('200', { messageID: '10', max: 2 }));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '1', '🔥'));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '2', '✅'));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '3', '⭐'));
  assert.equal((await maxRx).length, 2);

  // signal-bounded reaction stream
  const rxAbort = new AbortController();
  const sigRx = drain(resources.collectReactions('200', { messageID: '10', signal: rxAbort.signal }));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '1', '🔥'));
  emitter.emit(Events.MessageReactionAdd, reactionAdd('10', '200', '1', '🔥'));
  rxAbort.abort();
  assert.equal((await sigRx).length, 2);

  assert.deepEqual(rxCollectSizes, [0, 0, 0, 0]);
  assert.deepEqual(rxEndSizes, [0, 0]);
  assert.equal(client.listenerCount(Events.MessageCreate), 0);
  assert.equal(client.listenerCount(Events.MessageReactionAdd), 0);
  assert.equal(client.listenerCount(Events.MessageReactionAddMany), 0);
});
