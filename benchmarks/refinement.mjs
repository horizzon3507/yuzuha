import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { arch, cpus, platform } from 'node:os';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compareReports } from './compare.mjs';
import { createHash } from 'node:crypto';

const config = { iterations: 10_000, samples: 7, warmup: 2000, queueSize: 5000, pageSize: 25, fanout: 32, concurrency: 1, json: false };
let packageRoot = fileURLToPath(new URL('../', import.meta.url)), baselinePath;
for (let index = 2; index < process.argv.length; index++) {
  const key = process.argv[index];
  if (key === '--json') { config.json = true; continue; }
  if (key === '--package-root' || key === '--baseline') {
    const value = process.argv[++index]; if (!value || value.startsWith('--')) throw new Error(`Informe ${key} <caminho>.`);
    if (key === '--package-root') packageRoot = resolve(value); else baselinePath = value;
    continue;
  }
  const name = { '--queue-size': 'queueSize', '--page-size': 'pageSize' }[key] ?? key.slice(2);
  const max = { iterations: 1_000_000, samples: 50, warmup: 100_000, queueSize: 100_000, pageSize: 1000, fanout: 128 }[name];
  const value = Number(process.argv[++index]);
  if (!max || !Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`Opção inválida: ${key}.`);
  config[name] = value;
}
if (config.pageSize > config.queueSize) throw new Error('pageSize deve caber na fila.');
const source = pathToFileURL(resolve(packageRoot, 'dist') + '/');
const { Yuzuha, MemoryStore } = await import(new URL('index.js', source));
const { MusicManager, LavalinkNode } = await import(new URL('music.js', source));
const { MockTransport, MockMusicBackend, mockMessage, mockTrack } = await import(new URL('testing.js', source));
const { parseFlags } = await import(new URL('commands/arguments.js', source));
const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
const sourceHashes = {};
for (const path of ['commands/arguments.js', 'domain/track-queue.js', 'domain/music-state.js', 'services/music.js', 'services/music-player.js', 'infrastructure/lavalink/node.js', 'infrastructure/lavalink/protocol.js']) {
  try { sourceHashes[path] = createHash('sha256').update(await readFile(new URL(path, source))).digest('hex'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; sourceHashes[path] = null; }
}
const results = [];
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
async function measure(name, operation, iterations = config.iterations, metrics) {
  const run = async count => { for (let index = 0; index < count; index++) await operation(); };
  await run(Math.min(iterations, config.warmup)); global.gc?.();
  const before = process.memoryUsage(), samples = [], initial = metrics?.();
  for (let sample = 0; sample < config.samples; sample++) {
    const start = performance.now(); await run(iterations); samples.push(performance.now() - start);
  }
  global.gc?.(); const after = process.memoryUsage(), operations = iterations * config.samples;
  results.push({ name, iterations, operations, unitsPerOperation: 1, concurrency: 1,
    medianMs: percentile(samples, 0.5), p95Ms: percentile(samples, 0.95), samplesMs: samples,
    operationsPerSecond: operations / (samples.reduce((sum, value) => sum + value, 0) / 1000),
    heapDeltaBytes: after.heapUsed - before.heapUsed, rssDeltaBytes: after.rss - before.rss,
    ...(metrics ? { backendRequests: metrics() - initial, backendRequestsPerOperation: (metrics() - initial) / operations } : {}),
  });
}
const flags = [
  { name: 'count', type: 'integer', min: 1, max: 20 }, { name: 'verbose', type: 'boolean', aliases: ['v'] },
  { name: 'speed', type: 'number', defaultValue: 1 }, { name: 'timeout', type: 'duration' },
  { name: 'label', type: 'string' }, { name: 'owner', type: 'user' }, { name: 'format', defaultValue: 'opus', choices: ['opus', 'webm'] },
];
const tokens = ['tune', '--count', '3', '-v', '--speed=1.25', '--timeout', '2s', '--label=lofi mix', '--owner', '12345678901234567'];
const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), scheduler: false, http: false });
const manager = new MusicManager({ nodes: [new MockMusicBackend()], queueLimit: config.queueSize });
let backendRequests = 0;
const node = new LavalinkNode({ url: 'http://localhost:2333', password: 'offline', userID: '123', cache: false, reconnect: false,
  maxPendingRequests: config.fanout, socketFactory() { throw new Error('Benchmark offline não conecta ao gateway.'); },
  fetch: async () => {
    backendRequests++; await new Promise(resolve => setImmediate(resolve));
    return Response.json({ loadType: 'track', data: mockTrack('result') });
  },
});
try {
  await measure('arguments/typed-flags', () => {
    const result = parseFlags(flags, tokens); assert.equal(result.flags.get('count'), 3); assert.equal(result.flags.get('format'), 'opus');
  });
  bot.command({ name: 'bench', flags, run(ctx) { assert.equal(ctx.flags.get('count'), 3); assert.equal(ctx.flags.get('label'), 'lofi mix'); } });
  await measure('dispatch/typed-flags', async () => {
    assert.equal(await bot.handle(mockMessage('!bench tune --count 3 -v --speed=1.25 --timeout 2s --label="lofi mix" --owner 12345678901234567')), 'success');
  });
  const player = manager.createPlayer('100'); player.enqueue(Array.from({ length: config.queueSize }, (_, index) => mockTrack(String(index))));
  const start = Math.min(Math.floor(config.queueSize / 2), config.queueSize - config.pageSize);
  await measure('music/queue-page', () => {
    const page = typeof player.queuePage === 'function' ? player.queuePage(start, config.pageSize) : player.queue.slice(start, start + config.pageSize);
    assert.equal(page.length, config.pageSize); assert.equal(page[0].encoded, String(start));
  }, Math.max(1, Math.floor(config.iterations / 100)));
  let batch = 0;
  await measure('music/signaled-search-fanout', async () => {
    const identifier = `scsearch:batch${++batch}`;
    const results = await Promise.all(Array.from({ length: config.fanout }, () => node.loadTracks(identifier, new AbortController().signal)));
    assert.equal(results.length, config.fanout); assert.equal(results[0].loadType, 'track');
  }, Math.max(1, Math.floor(config.iterations / 100)), () => backendRequests);
  const report = { suite: 'refinement', version: manifest.version, date: new Date().toISOString(), node: process.versions.node,
    platform: platform(), arch: arch(), cpu: cpus()[0]?.model, gc: typeof global.gc === 'function', sourceHashes, config, results };
  if (baselinePath) report.comparison = compareReports(report, JSON.parse(await readFile(baselinePath, 'utf8')));
  console.log(config.json ? JSON.stringify(report, null, 2) : [
    `Yuzuha ${report.version} · Node ${report.node} · ${report.platform}/${report.arch}`,
    ...results.map(row => `${row.name}: ${row.operationsPerSecond.toFixed(0)} ops/s; mediana ${row.medianMs.toFixed(2)}ms${row.backendRequests === undefined ? '' : `; ${row.backendRequestsPerOperation} requisições simuladas/lote`}`),
    ...(report.comparison ?? []).map(row => `${row.name}: ${row.status === 'new' ? 'novo' : `${row.throughputChangePercent.toFixed(1)}% ante baseline`}`),
  ].join('\n'));
} finally { await bot.destroy(); await manager.close(); await node.close(); }
