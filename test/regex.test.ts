import test from 'node:test';
import assert from 'node:assert/strict';
import { runRegex } from '../src/scripting/regex.js';
import { CommandContext, MemoryStore, ScriptError } from '../src/index.js';
import { Runtime, registerBuiltins } from '../src/functions.js';
import { MockTransport, mockMessage } from '../src/testing.js';

test('regex worker supports flags, captures, named groups and zero-length Unicode matches', async () => {
  assert.equal(await runRegex({ operation: 'test', text: 'YUZUHA', pattern: '^yuzuha$', flags: 'i', timeoutMs: 2000 }), true);
  assert.deepEqual(await runRegex({ operation: 'match', text: 'Yuzuha 17 Yuzuha 18', pattern: 'Yuzuha (?<version>\\d+)', flags: 'g', timeoutMs: 2000 }), [
    { value: 'Yuzuha 17', index: 0, captures: ['17'], groups: { version: '17' } },
    { value: 'Yuzuha 18', index: 10, captures: ['18'], groups: { version: '18' } },
  ]);
  const matches = await runRegex({ operation: 'match', text: '😀', pattern: '', flags: 'gu', timeoutMs: 2000 });
  assert.deepEqual(matches, [
    { value: '', index: 0, captures: [], groups: null },
    { value: '', index: 2, captures: [], groups: null },
  ]);
});

test('regex replacement preserves JavaScript capture substitution semantics within output limits', async () => {
  for (const replacement of ['$2-$1', '$10', '$01', '$99', '$$', '$&', '$`', "$'", '$<name>', 'literal']) {
    const text = 'ab ab';
    const pattern = '(?<name>a)(b)';
    assert.equal(await runRegex({ operation: 'replace', text, pattern, flags: 'g', replacement, timeoutMs: 2000 }),
      text.replace(new RegExp(pattern, 'g'), replacement), replacement);
  }
  await assert.rejects(runRegex({ operation: 'replace', text: 'a'.repeat(1000), pattern: 'a', flags: 'g', replacement: 'x'.repeat(1000), timeoutMs: 2000 }),
    (e: unknown) => e instanceof Error && 'code' in e && e.code === 'OUTPUT_LIMIT');
});

test('invalid patterns and flags are rejected, and match/output budgets are enforced', async () => {
  await assert.rejects(runRegex({ operation: 'test', text: '', pattern: '(', timeoutMs: 2000 }), /inválido/);
  for (const flags of ['gg', 'z', 'y']) await assert.rejects(runRegex({ operation: 'test', text: '', pattern: '', flags }), /Flags/);
  await assert.rejects(runRegex({ operation: 'match', text: 'a'.repeat(1001), pattern: 'a', flags: 'g', timeoutMs: 2000 }), /1000 correspondências/);
  await assert.rejects(runRegex({ operation: 'test', text: '', pattern: 'a'.repeat(513) }), /limites/);
});

test('catastrophic regex terminates by deadline while the main thread remains responsive', async () => {
  let ticked = false;
  const timer = setTimeout(() => { ticked = true; }, 10);
  try {
    await assert.rejects(runRegex({ operation: 'test', text: 'a'.repeat(15000) + '!', pattern: '(a+)+$', timeoutMs: 150 }), /prazo/);
    assert.equal(ticked, true);
  } finally { clearTimeout(timer); }
  assert.equal(await runRegex({ operation: 'test', text: 'ok', pattern: 'ok', timeoutMs: 2000 }), true);
});

test('workers honor cancellation and cap concurrent jobs without leaking capacity', async () => {
  const controller = new AbortController();
  const pending = runRegex({ operation: 'test', text: 'a'.repeat(10000) + '!', pattern: '(a+)+$', timeoutMs: 2000, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /cancelada/);
  const jobs = Array.from({ length: 4 }, () => runRegex({ operation: 'test', text: 'a', pattern: 'a', timeoutMs: 2000 }));
  await assert.rejects(runRegex({ operation: 'test', text: '', pattern: '' }), /simultâneas/);
  assert.deepEqual(await Promise.all(jobs), [true, true, true, true]);
});

test('script regex keeps timeout limits outside try and does not reinterpret replacement data', async () => {
  const ctx = new CommandContext({ message: mockMessage('!regex'), command: { name: 'regex' },
    transport: new MockTransport(), store: new MemoryStore(), cooldown: () => 0 });
  const runtime = registerBuiltins(new Runtime());
  const run = (code: string) => runtime.execute(runtime.compile(code), ctx);
  assert.equal(await run('$regexTest[Yuzuha;yuzuha;i;2000]'), true);
  assert.equal(await run('$regexReplace[Yuzuha 17;Yuzuha (.+);Versão $1;;2000]'), 'Versão 17');
  ctx.vars.set('replacement', '$ban[2;motivo]');
  assert.equal(await run('$regexReplace[x;x;$get[replacement];;2000]'), '$ban[2;motivo]');
  ctx.vars.set('hostile', 'a'.repeat(15000) + '!');
  await assert.rejects(run('$try[$regexTest[$get[hostile];(a+)+$;;30];ignorado]'),
    (e: unknown) => e instanceof ScriptError && e.code === 'EXECUTION_LIMIT');
});
