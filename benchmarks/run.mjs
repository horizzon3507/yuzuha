import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { arch, cpus, platform } from 'node:os';
import { readFile } from 'node:fs/promises';
import { CommandContext, MemoryStore, Yuzuha } from '../dist/index.js';
import { registerBuiltins, Runtime } from '../dist/functions.js';
import { MockTransport, mockMessage } from '../dist/testing.js';
import { compareReports } from './compare.mjs';

const config = { iterations: 1000, samples: 7, concurrency: 16, catalogSize: 1000, payloadSize: 4096, soakRounds: 5, json: false };
let baselinePath, maxRegression;
for (let index = 2; index < process.argv.length; index++) {
  const key = process.argv[index];
  if (key === '--json') { config.json = true; continue; }
  if (key === '--baseline') {
    baselinePath = process.argv[++index];
    if (!baselinePath || baselinePath.startsWith('--')) throw new Error('Informe --baseline <arquivo.json>.');
    continue;
  }
  if (key === '--max-regression') {
    maxRegression = Number(process.argv[++index]);
    if (!Number.isFinite(maxRegression) || maxRegression < 0 || maxRegression > 100) throw new Error('--max-regression deve estar entre 0 e 100.');
    continue;
  }
  const name = { '--catalog-size': 'catalogSize', '--payload-size': 'payloadSize', '--soak-rounds': 'soakRounds' }[key] ?? key?.slice(2);
  if (!['iterations', 'samples', 'concurrency', 'catalogSize', 'payloadSize', 'soakRounds'].includes(name)) throw new Error(`Opção desconhecida: ${key}`);
  const value = Number(process.argv[++index]);
  const max = { iterations: 1_000_000, samples: 50, concurrency: 128, catalogSize: 10_000, payloadSize: 99_000, soakRounds: 1000 }[name];
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`${key} deve estar entre 1 e ${max}.`);
  config[name] = value;
}
if (maxRegression !== undefined && !baselinePath) throw new Error('--max-regression precisa de --baseline.');
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
const results = [];
async function measure(name, operation, concurrency = 1) {
  const run = async count => {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, count) }, async () => {
      while (next++ < count) await operation();
    }));
  };
  await run(Math.min(config.iterations, 200));
  global.gc?.();
  const before = process.memoryUsage(), samples = [];
  for (let sample = 0; sample < config.samples; sample++) {
    const start = performance.now();
    await run(config.iterations);
    samples.push(performance.now() - start);
  }
  global.gc?.();
  const after = process.memoryUsage();
  results.push({ name, operations: config.iterations * config.samples, concurrency,
    medianMs: percentile(samples, 0.5), p95Ms: percentile(samples, 0.95),
    operationsPerSecond: config.iterations * config.samples / (samples.reduce((sum, value) => sum + value, 0) / 1000),
    heapDeltaBytes: after.heapUsed - before.heapUsed, rssDeltaBytes: after.rss - before.rss, samplesMs: samples });
}
const bots = [];
try {
  for (const scripted of [false, true]) {
    for (const concurrency of new Set([1, config.concurrency])) {
    const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false, http: false });
    bots.push(bot);
    bot.command(scripted ? { name: 'bench', code: '$let[x;$math[2;*;3]]' } : { name: 'bench', run() {} });
    const name = scripted ? 'dispatch/functions' : 'dispatch/native';
    await measure(concurrency > 1 ? `${name}-concurrent` : name, async () => {
      assert.equal(await bot.handle(mockMessage('!bench')), 'success');
    }, concurrency);
    }
  }
  const runtime = registerBuiltins(new Runtime());
  const source = '$arrayReduce[$range[1;10];0;$math[$loopAccumulator;+;$loopValue]]';
  const program = runtime.compile(source);
  const ctx = new CommandContext({ message: mockMessage('!bench'), command: { name: 'bench', code: '' },
    transport: new MockTransport(), store: new MemoryStore(), cooldown: () => 0 });
  await measure('runtime/compile', () => { runtime.compile(source); });
  await measure('runtime/evaluate', async () => { assert.equal(await runtime.execute(program, ctx), 55); });
  await measure('store/transaction-concurrent', async () => {
    await ctx.data.transaction(tx => {
      tx.guild.update('a', value => Number(value) + 1, 0);
      tx.guild.update('b', value => Number(value) + 1, 0);
    });
  }, config.concurrency);
  const expected = Math.min(config.iterations, 200) + config.iterations * config.samples;
  assert.equal(await ctx.data.guild.get('a'), expected);
  assert.equal(await ctx.data.guild.get('b'), expected);
  const catalog = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false, http: false });
  bots.push(catalog);
  for (let index = 0; index < config.catalogSize; index++) catalog.command({ name: `item${index}`, run() {} });
  await measure('dispatch/large-catalog', async () => {
    assert.equal(await catalog.handle(mockMessage(`!item${config.catalogSize - 1}`)), 'success');
  });
  const payload = 'x'.repeat(config.payloadSize);
  const payloadProgram = runtime.compile(`$let[payload;${payload}]`);
  await measure('runtime/large-payload', async () => {
    assert.equal(await runtime.execute(payloadProgram, ctx), '');
    assert.equal(ctx.vars.get('payload').length, config.payloadSize);
  });
  const memory = [];
  for (let round = 0; round <= config.soakRounds; round++) {
    if (round > 0) for (let index = 0; index < config.iterations; index++) {
      assert.equal(await catalog.handle(mockMessage(`!item${config.catalogSize - 1} ${payload}`)), 'success');
    }
    global.gc?.();
    const usage = process.memoryUsage();
    memory.push({ round, operations: round * config.iterations, heapUsed: usage.heapUsed, rss: usage.rss });
  }
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const report = { version: manifest.version, date: new Date().toISOString(), node: process.versions.node,
    platform: platform(), arch: arch(), cpu: cpus()[0]?.model, gc: typeof global.gc === 'function', config, results,
    memory: { samples: memory, heapGrowthBytes: memory.at(-1).heapUsed - memory[0].heapUsed,
      rssGrowthBytes: memory.at(-1).rss - memory[0].rss } };
  if (baselinePath) {
    report.comparison = compareReports(report, JSON.parse(await readFile(baselinePath, 'utf8')));
    if (maxRegression !== undefined && report.comparison.some(row => row.regressionPercent > maxRegression)) process.exitCode = 1;
  }
  console.log(config.json ? JSON.stringify(report, null, 2) : [
    `Yuzuha ${report.version} · Node ${report.node} · ${report.platform}/${report.arch}`,
    `${config.iterations} operações/amostra, ${config.samples} amostras; GC explícito: ${report.gc}`,
    ...results.map(row => `${row.name}: ${row.operationsPerSecond.toFixed(0)} ops/s; mediana ${row.medianMs.toFixed(2)}ms; p95 ${row.p95Ms.toFixed(2)}ms; heap ${row.heapDeltaBytes} bytes`),
    `Memória após ${config.soakRounds * config.iterations} operações: heap ${report.memory.heapGrowthBytes} bytes; RSS ${report.memory.rssGrowthBytes} bytes`,
    ...(report.comparison ?? []).map(row => `${row.name}: ${row.status === 'new' ? 'novo cenário' : `${row.throughputChangePercent.toFixed(1)}% ops/s ante baseline`}`),
  ].join('\n'));
} finally { await Promise.all(bots.map(bot => bot.destroy())); }
