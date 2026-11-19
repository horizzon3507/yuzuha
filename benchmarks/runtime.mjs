import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { arch, cpus, platform } from 'node:os';
import { CommandContext, MemoryStore } from '../dist/index.js';
import { Runtime, registerBuiltins } from '../dist/functions.js';
import { MockTransport, mockMessage } from '../dist/testing.js';

const iterations = 200, warmup = 50, samples = 7;
const runtime = registerBuiltins(new Runtime());
const ctx = new CommandContext({ message: mockMessage('!bench'), command: { name: 'bench' },
  transport: new MockTransport(), store: new MemoryStore(), cooldown: () => 0 });
const object = { payload: 'x'.repeat(8192) };
runtime.register({ name: 'benchObject', category: 'bench', description: '', usage: '$benchObject', minArgs: 0, maxArgs: 0,
  execute: () => object });
const cases = [
  ['scalar', '$authorID', ctx.message.authorID],
  ['condition-short', '$if[true;yes;no]', 'yes'],
  ['condition-long', `$if[${'x'.repeat(4096)};yes;no]`, 'yes'],
  ['condition-comparison', '$if[2>=1;yes;no]', 'yes'],
  ['loop', '$repeat[20;x]', 'x'.repeat(20)],
  ['callback', '$arrayReduce[$range[1;20];0;$math[$loopAccumulator;+;$loopValue]]', 210],
  ['large-object', 'prefix$benchObject', `prefix${JSON.stringify(object)}`],
];
const results = [];
for (const [name, source, expected] of cases) {
  const program = runtime.compile(source);
  const run = async count => { for (let i = 0; i < count; i++) assert.deepEqual(await runtime.execute(program, ctx), expected); };
  await run(warmup); global.gc?.();
  const samplesMs = [];
  for (let sample = 0; sample < samples; sample++) {
    const start = performance.now(); await run(iterations); samplesMs.push(performance.now() - start);
  }
  results.push({ name, iterations, medianMs: [...samplesMs].sort((a, b) => a - b)[Math.floor(samples / 2)], samplesMs });
}
console.log(JSON.stringify({ suite: 'runtime', node: process.versions.node, platform: platform(), arch: arch(),
  cpu: cpus()[0]?.model, iterations, warmup, samples, results }, null, 2));
