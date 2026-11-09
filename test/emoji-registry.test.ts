import test from 'node:test';
import assert from 'node:assert/strict';
import { Yuzuha } from '../src/framework/bot.js';
import { YuzuhaError } from '../src/shared/errors.js';
import { CommandContext } from '../src/commands/context.js';
import { MemoryStore } from '../src/infrastructure/storage/memory.js';
import { createTestBot, MockTransport, mockMessage, mockResources } from '../src/testing.js';
import type { CommandContextLike } from '../src/commands/context-like.js';

test('ctx.emoji expõe a mesma referência configurada no bot sem client nativo', async () => {
  let seen: Record<string, string> | undefined;
  let same = false;
  const emoji = { ok: '<:ok:1>', no: '<:no:2>' };
  const fixture = createTestBot({ prefix: '!', emoji,
    commands: [{ name: 'e', run: async ctx => {
      seen = ctx.emoji;
      same = ctx.emoji === fixture.bot.emoji;
      await ctx.send(ctx.emoji['ok']!);
    } }] });
  try {
    await fixture.send('!e');
    assert.equal(fixture.bot.emoji, emoji);
    assert.equal(seen, emoji);
    assert.equal(same, true);
    assert.deepEqual(fixture.messages[0]!.payload, { content: '<:ok:1>' });
  } finally { await fixture.destroy(); }
});

test('emoji é um mapa vivo: mutações via bot.emoji aparecem no contexto', async () => {
  const reads: (string | undefined)[] = [];
  const fixture = createTestBot({ prefix: '!',
    commands: [{ name: 'e', run: async ctx => { reads.push(ctx.emoji['ok']); } }] });
  try {
    await fixture.send('!e');
    fixture.bot.emoji['ok'] = '<:ok:9>';
    await fixture.send('!e');
    assert.deepEqual(reads, [undefined, '<:ok:9>']);
    assert.equal(fixture.bot.emoji['ok'], '<:ok:9>');
  } finally { await fixture.destroy(); }
});

test('ctx.emoji funciona sem client nativo em contexto direto', () => {
  const ctx = new CommandContext({ message: mockMessage('!x'), command: { name: 'x' },
    store: new MemoryStore(), transport: new MockTransport(), cooldown: () => 0,
    resources: mockResources(), emoji: { ok: '✅' } });
  assert.equal(ctx.emoji['ok'], '✅');
  const bare = new CommandContext({ message: mockMessage('!x'), command: { name: 'x' },
    store: new MemoryStore(), transport: new MockTransport(), cooldown: () => 0, resources: mockResources() });
  assert.deepEqual(bare.emoji, {});
  const like: CommandContextLike = bare;
  assert.equal(like.emoji['ok'], undefined);
});

test('YuzuhaOptions.emoji rejeita mapas malformados', () => {
  for (const emoji of ['mapa', ['a'], { '': 'x' }, { ok: '' }, { ok: 1 }, { ok: null }]) {
    assert.throws(() => new Yuzuha({ emoji: emoji as never }), { code: 'EMOJI_OPTIONS' });
  }
  assert.doesNotThrow(() => new Yuzuha({ emoji: { ok: '✅' } }));
  const bot = new Yuzuha();
  assert.deepEqual(bot.emoji, {});
});
