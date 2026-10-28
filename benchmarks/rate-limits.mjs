import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { arch, cpus, platform } from 'node:os';
import { performance } from 'node:perf_hooks';
import { RateLimits } from '../dist/framework/rate-limits.js';
import { YuzuhaError } from '../dist/errors.js';

// Baseline: src/framework/rate-limits.ts at a227759f726420471ade044a3cf9600a6359a668, with TypeScript types removed.
class BaselineRateLimits {
  now;
  seen = new Map();
  seenKeys = [];
  seenExpirations = [];
  seenCursor = 0;
  cooldowns = new Map();
  nextSweep = 0;

  constructor(now = Date.now) { this.now = now; }

  sweep(time) {
    if (time < this.nextSweep) return;
    for (const [key, until] of this.cooldowns) if (until <= time) this.cooldowns.delete(key);
    this.nextSweep = time + 1000;
  }

  duplicate(channelID, messageID) {
    const time = this.now();
    this.sweep(time);
    const key = `${channelID.length}:${channelID}${messageID}`;
    if ((this.seen.get(key) ?? 0) > time) return true;
    const previous = this.seenKeys[this.seenCursor];
    if (previous !== undefined && this.seen.get(previous) === this.seenExpirations[this.seenCursor]) this.seen.delete(previous);
    const until = time + 60_000;
    this.seen.set(key, until);
    this.seenKeys[this.seenCursor] = key; this.seenExpirations[this.seenCursor] = until;
    this.seenCursor = (this.seenCursor + 1) % 10_000;
    return false;
  }

  cooldown(key, duration) {
    const time = this.now();
    this.sweep(time);
    const remaining = (this.cooldowns.get(key) ?? 0) - time;
    if (remaining > 0) return remaining;
    if (this.cooldowns.size >= 100_000) throw new YuzuhaError('COOLDOWN_CAPACITY', 'Capacidade de cooldown excedida.');
    this.cooldowns.set(key, time + duration);
    return 0;
  }
}

const config = { samples: 7, normalIterations: 50_000, loadedIterations: 1000, entries: 25_000,
  warmup: 2000, normalClockStepMs: 0, loadedClockStepMs: 1000, cooldownMs: 1_000_000_000_000 };
let json = false;
for (let index = 2; index < process.argv.length; index++) {
  const option = process.argv[index];
  if (option === '--json') { json = true; continue; }
  const name = { '--samples': 'samples', '--normal-iterations': 'normalIterations', '--loaded-iterations': 'loadedIterations', '--entries': 'entries' }[option];
  const value = Number(process.argv[++index]);
  const max = { samples: 50, normalIterations: 90_000, loadedIterations: 100_000, entries: 100_000 }[name];
  if (!max || !Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`Opção inválida: ${option}.`);
  config[name] = value;
}

const scenarios = [
  { name: 'duplicate/same-tick', operation: 'duplicate', loaded: false },
  { name: 'cooldown/new-same-tick', operation: 'new', loaded: false },
  { name: 'cooldown/active-same-tick', operation: 'active', loaded: false },
  { name: 'duplicate/loaded-clock-steps', operation: 'duplicate', loaded: true },
  { name: 'cooldown/loaded-clock-steps', operation: 'active', loaded: true },
];

function fixture(Implementation, scenario, iterations) {
  let now = 0;
  const limits = new Implementation(() => now);
  const step = scenario.loaded ? config.loadedClockStepMs : config.normalClockStepMs;
  if (scenario.loaded) for (let index = 0; index < config.entries; index++) limits.cooldown(String(index), config.cooldownMs);
  else if (scenario.operation === 'active') limits.cooldown('0', config.cooldownMs);
  const outputs = new Array(iterations);
  return {
    run() {
      for (let index = 0; index < iterations; index++) {
        now += step;
        outputs[index] = scenario.operation === 'duplicate' ? limits.duplicate('channel', String(index))
          : limits.cooldown(scenario.operation === 'active' ? '0' : String(index), config.cooldownMs);
      }
    },
    validate() {
      for (let index = 0; index < iterations; index++) {
        const expected = scenario.operation === 'duplicate' ? false
          : scenario.operation === 'active' ? config.cooldownMs - step * (index + 1) : 0;
        assert.equal(outputs[index], expected);
      }
      return outputs;
    },
  };
}

const median = values => [...values].sort((a, b) => a - b)[Math.ceil(values.length / 2) - 1];
const summarize = (samplesMs, iterations) => ({ samplesMs, medianMs: median(samplesMs),
  operationsPerSecond: iterations * samplesMs.length / (samplesMs.reduce((sum, value) => sum + value, 0) / 1000) });
const implementations = [['baseline', BaselineRateLimits], ['current', RateLimits]];
const results = [];
for (const scenario of scenarios) {
  const iterations = scenario.loaded ? config.loadedIterations : config.normalIterations;
  for (const [, Implementation] of implementations) {
    const warmup = fixture(Implementation, scenario, Math.min(config.warmup, iterations));
    warmup.run(); warmup.validate();
  }
  const samples = { baseline: [], current: [] };
  for (let sample = 0; sample < config.samples; sample++) {
    const outputs = {};
    for (const [name, Implementation] of sample % 2 ? [...implementations].reverse() : implementations) {
      const trial = fixture(Implementation, scenario, iterations);
      global.gc?.();
      const start = performance.now();
      trial.run();
      samples[name].push(performance.now() - start);
      outputs[name] = trial.validate();
    }
    assert.deepEqual(outputs.current, outputs.baseline);
  }
  const baseline = summarize(samples.baseline, iterations), current = summarize(samples.current, iterations);
  results.push({ name: scenario.name, iterations, entries: scenario.loaded ? config.entries : scenario.operation === 'active' ? 1 : 0,
    clockStepMs: scenario.loaded ? config.loadedClockStepMs : config.normalClockStepMs, baseline, current,
    medianChangePercent: (current.medianMs / baseline.medianMs - 1) * 100 });
}
const hash = input => createHash('sha256').update(input).digest('hex');
const report = { suite: 'rate-limits', date: new Date().toISOString(), node: process.versions.node, platform: platform(), arch: arch(),
  cpu: cpus()[0]?.model, gc: typeof global.gc === 'function', baselineCommit: 'a227759f726420471ade044a3cf9600a6359a668',
  sourceHashes: { baselineImplementation: hash(BaselineRateLimits.toString()), currentDist: hash(await readFile(new URL('../dist/framework/rate-limits.js', import.meta.url))),
    benchmark: hash(await readFile(new URL(import.meta.url))) }, config,
  scope: 'Local synthetic workloads; advancing the fake clock simulates sweep boundaries, not wall-clock throughput of a bot.', results };
console.log(json ? JSON.stringify(report, null, 2) : [
  `RateLimits · Node ${report.node} · ${report.cpu} · ${report.platform}/${report.arch}`,
  report.scope,
  ...results.map(row => `${row.name}: ${row.baseline.medianMs.toFixed(3)} -> ${row.current.medianMs.toFixed(3)} ms; ${row.iterations} operations; clock +${row.clockStepMs} ms/operation`),
].join('\n'));
