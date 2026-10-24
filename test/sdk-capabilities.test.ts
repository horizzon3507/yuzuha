import test from 'node:test';
import assert from 'node:assert/strict';
import * as sdk from '@fluxerjs/core';
import { Yuzuha, MemoryStore } from '../src/index.js';

test('fixed SDK exposes shards/cluster but no interactive components or application-command events', () => {
  for (const name of ['ButtonBuilder', 'SelectMenuBuilder', 'ModalBuilder', 'ApplicationCommand', 'Interaction']) {
    assert.equal(name in sdk, false, name);
  }
  assert.equal('InteractionCreate' in sdk.Events, false);
  assert.equal(typeof sdk.ClientCluster, 'function');
  assert.equal(sdk.Events.ShardReady, 'shardReady');
});

test('Yuzuha preserves native shard configuration and injected client identity without login', async () => {
  const bot = new Yuzuha({ clientOptions: { shardCount: 4, shardIds: [0, 1] }, store: new MemoryStore(), scheduler: false });
  try {
    assert.equal(bot.client.options.shardCount, 4);
    assert.deepEqual(bot.client.options.shardIds, [0, 1]);
  } finally { await bot.destroy(); }
  const client = new sdk.Client({ shardCount: 2, shardIds: [1] });
  const injected = new Yuzuha({ client, store: new MemoryStore(), scheduler: false });
  try { assert.equal(injected.client, client); }
  finally { await injected.destroy(); }
});
