import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { arch, cpus, platform } from 'node:os';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareReports } from './compare.mjs';

const config = { iterations: 10_000, samples: 9, concurrency: 1, catalogSize: 1000, payloadSize: 4096, stateKeys: 2000, json: false };
let packageRoot = fileURLToPath(new URL('../', import.meta.url)), baselinePath;
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (key === '--json') { config.json = true; continue; }
  if (key === '--package-root' || key === '--baseline') {
    const path = process.argv[++i]; if (!path || path.startsWith('--')) throw new Error(`Informe ${key} <caminho>.`);
    if (key === '--package-root') packageRoot = resolve(path); else baselinePath = path;
    continue;
  }
  const name = { '--catalog-size': 'catalogSize', '--payload-size': 'payloadSize', '--state-keys': 'stateKeys' }[key] ?? key.slice(2);
  const max = { iterations: 1_000_000, samples: 50, catalogSize: 10_000, payloadSize: 99_000, stateKeys: 10_000 }[name];
  const value = Number(process.argv[++i]);
  if (!max || !Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`Opção inválida: ${key}.`);
  config[name] = value;
}
const source = pathToFileURL(resolve(packageRoot, 'dist/'));
source.pathname += source.pathname.endsWith('/') ? '' : '/';
const { Yuzuha, CommandContext, MemoryStore } = await import(new URL('index.js', source));
const { MockTransport, mockMessage } = await import(new URL('testing.js', source));
const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
const results = [], bots = [];
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
async function measure(name, operation, iterations = config.iterations, units = 1) {
  const run = async count => { for (let i = 0; i < count; i++) await operation(); };
  await run(Math.min(iterations, 200)); global.gc?.();
  const before = process.memoryUsage(), samples = [];
  for (let sample = 0; sample < config.samples; sample++) {
    const start = performance.now(); await run(iterations); samples.push(performance.now() - start);
  }
  global.gc?.(); const after = process.memoryUsage();
  results.push({ name, iterations, unitsPerOperation: units, operations: iterations * units * config.samples, concurrency: 1,
    medianMs: percentile(samples, 0.5), p95Ms: percentile(samples, 0.95), samplesMs: samples,
    operationsPerSecond: iterations * units * config.samples / (samples.reduce((sum, value) => sum + value, 0) / 1000),
    heapDeltaBytes: after.heapUsed - before.heapUsed, rssDeltaBytes: after.rss - before.rss });
}
function bot() {
  const value = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false, http: false }); bots.push(value); return value;
}
try {
  const dispatch = bot(); dispatch.command({ name: 'bench', run() {} });
  for (const [name, content, authorBot] of [
    ['ordinary', 'a normal message', false], ['unknown', '!doesNotExist', false], ['bot', '!bench', true],
  ]) {
    const message = mockMessage(content, { authorBot });
    await measure(`dispatch/ignored-${name}`, async () => { assert.equal(await dispatch.handle(message), 'ignored'); });
  }
  const payload = 'x'.repeat(config.payloadSize);
  for (const [name, input] of [['long-input', payload], ['quoted-long-input', `"${payload}"`], ['apostrophe-long-input', `${payload}'suffix`]]) {
    const long = `!bench ${input}`;
    await measure(`dispatch/${name}`, async () => {
      assert.equal(await dispatch.handle(mockMessage(long)), 'success');
    }, Math.max(1, Math.floor(config.iterations / 10)));
  }
  await measure('catalog/register', async () => {
    const registered = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false, http: false });
    try {
      for (let i = 0; i < config.catalogSize; i++) registered.command({ name: `item${i}`, run() {} });
      assert.equal(registered.listCommands().length, config.catalogSize);
    } finally { await registered.destroy(); }
  }, 1, config.catalogSize);
  const store = new MemoryStore(), ctx = new CommandContext({ store, command: { name: 'state' },
    message: mockMessage(''), transport: new MockTransport(), cooldown: () => 0 });
  await ctx.data.transaction(data => {
    for (let i = 0; i < config.stateKeys; i++) data.guild.set(`item${i}`, { count: i, tags: ['one', 'two'] });
  });
  const expected = { count: config.stateKeys - 1, tags: ['one', 'two'] };
  await measure('store/read-large-state', async () => {
    assert.deepEqual(await ctx.data.guild.get(`item${config.stateKeys - 1}`), expected);
  }, Math.max(1, Math.floor(config.iterations / 10)));
  const report = { suite: 'performance', version: manifest.version, date: new Date().toISOString(), node: process.versions.node,
    platform: platform(), arch: arch(), cpu: cpus()[0]?.model, gc: typeof global.gc === 'function', config, results };
  if (baselinePath) report.comparison = compareReports(report, JSON.parse(await readFile(baselinePath, 'utf8')));
  console.log(config.json ? JSON.stringify(report, null, 2) : [
    `Yuzuha ${report.version} · Node ${report.node} · ${report.platform}/${report.arch}`,
    ...results.map(row => `${row.name}: ${row.operationsPerSecond.toFixed(0)} ops/s; mediana ${row.medianMs.toFixed(2)}ms`),
    ...(report.comparison ?? []).map(row => `${row.name}: ${row.status === 'new' ? 'novo' : `${row.throughputChangePercent.toFixed(1)}% ante baseline`}`),
  ].join('\n'));
} finally { await Promise.all(bots.map(value => value.destroy())); }
