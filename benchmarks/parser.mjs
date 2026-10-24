import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modules = { current: new URL('../dist/scripting/parser.js', import.meta.url) };
for (let index = 2; index < process.argv.length; index += 2) {
  const key = { '--parser-module': 'current', '--baseline-module': 'baseline' }[process.argv[index]];
  const value = process.argv[index + 1];
  if (!key || !value || value.startsWith('--')) throw new Error('Uso: node benchmarks/parser.mjs [--parser-module caminho] [--baseline-module caminho]');
  modules[key] = pathToFileURL(resolve(value));
}
const implementations = {};
for (const [label, url] of Object.entries(modules)) implementations[label] = {
  parse: (await import(url)).parse,
  sourceHash: createHash('sha256').update(await readFile(url)).digest('hex'),
};
const iterations = 20_000, warmup = 2000, samples = 9, differentialCases = 20_000;
const cases = {
  plain: 'a'.repeat(8000),
  interpolated: `prefix ${'abc '.repeat(100)}$name suffix ${'xyz '.repeat(100)}`,
  short: '$reply[Olá $username!]',
  dense: '$f[a;b;$g[c]]'.repeat(20),
};
const outcome = (parse, source) => {
  try { return parse(source); }
  catch (error) { return { code: error.code, offset: error.offset, message: error.message }; }
};
if (implementations.baseline) {
  const alphabet = ['a', '$', '[', ']', ';', '\\', 'é', '\n', '1'];
  for (let seed = 0; seed < differentialCases; seed++) {
    let state = seed + 1, source = '';
    for (let index = 0; index < 50; index++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      source += alphabet[state % alphabet.length];
    }
    assert.deepEqual(outcome(implementations.current.parse, source), outcome(implementations.baseline.parse, source), source);
  }
}
const results = [];
for (const [name, source] of Object.entries(cases)) {
  if (implementations.baseline) assert.deepEqual(implementations.current.parse(source), implementations.baseline.parse(source));
  const times = Object.fromEntries(Object.keys(implementations).map(label => [label, []]));
  for (let sample = 0; sample < samples; sample++) {
    const entries = Object.entries(implementations);
    if (sample % 2) entries.reverse();
    for (const [label, { parse }] of entries) {
      for (let index = 0; index < warmup; index++) parse(source);
      const start = performance.now();
      for (let index = 0; index < iterations; index++) parse(source);
      times[label].push(performance.now() - start);
    }
  }
  for (const [implementation, samplesMs] of Object.entries(times)) {
    const sorted = [...samplesMs].sort((a, b) => a - b);
    results.push({ name, implementation, characters: source.length, iterations, medianMs: sorted[Math.floor(samples / 2)], samplesMs });
  }
}
console.log(JSON.stringify({ suite: 'parser', date: new Date().toISOString(), node: process.versions.node,
  platform: platform(), arch: arch(), cpu: cpus()[0]?.model, warmup, samples,
  differentialCases: implementations.baseline ? differentialCases : 0,
  modules: Object.fromEntries(Object.entries(implementations).map(([label, entry]) => [label, { path: modules[label].href, sourceHash: entry.sourceHash }])),
  results }, null, 2));
