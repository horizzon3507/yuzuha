import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { arch, cpus, platform, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

export const DEFAULT_ENTRIES = 10_000;
export const MIN_ENTRIES = 100;
export const MAX_ENTRIES = 100_000;
export const DEFAULT_ITERATIONS = 100;
export const MIN_ITERATIONS = 1;
export const MAX_ITERATIONS = 10_000;

const GUILD_ID = '100';
const ACTOR_ID = '1';
const QUERY_LIMIT = 50;
const WARMUP_CAP = 5;
const FIXED_CLOCK_MS = 1_700_000_000_000;

function parseBoundedInteger(flag, raw, min, max) {
  if (raw === undefined || raw.startsWith('--')) {
    throw new Error(`Informe ${flag} <inteiro>.`);
  }
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${flag} deve ser um inteiro entre ${min} e ${max}.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${flag} deve ser um inteiro entre ${min} e ${max}.`);
  }
  return value;
}

export function parseStoreBenchmarkArgs(argv) {
  let entries = DEFAULT_ENTRIES;
  let iterations = DEFAULT_ITERATIONS;
  let json = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--entries') {
      entries = parseBoundedInteger('--entries', argv[++index], MIN_ENTRIES, MAX_ENTRIES);
      continue;
    }
    if (arg === '--iterations') {
      iterations = parseBoundedInteger('--iterations', argv[++index], MIN_ITERATIONS, MAX_ITERATIONS);
      continue;
    }
    throw new Error(`Opção desconhecida: ${arg}`);
  }

  return { entries, iterations, json };
}

function validateBenchmarkOptions(options = {}) {
  const entries = options.entries ?? DEFAULT_ENTRIES;
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  if (!Number.isSafeInteger(entries) || entries < MIN_ENTRIES || entries > MAX_ENTRIES) {
    throw new Error(`entries deve ser um inteiro entre ${MIN_ENTRIES} e ${MAX_ENTRIES}.`);
  }
  if (!Number.isSafeInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new Error(`iterations deve ser um inteiro entre ${MIN_ITERATIONS} e ${MAX_ITERATIONS}.`);
  }
  return { entries, iterations };
}

async function loadDefaultDeps() {
  try {
    const [indexMod, storeMod, variablesMod] = await Promise.all([
      import(new URL('../dist/index.js', import.meta.url).href),
      import(new URL('../dist/store.js', import.meta.url).href),
      import(new URL('../dist/services/variables.js', import.meta.url).href),
    ]);
    return {
      MemoryStore: indexMod.MemoryStore,
      JsonStore: indexMod.JsonStore,
      SQLiteStore: indexMod.SQLiteStore,
      variableKey: storeMod.variableKey,
      VariableService: variablesMod.VariableService,
    };
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    try {
      const [indexMod, storeMod, variablesMod] = await Promise.all([
        import(new URL('../src/index.ts', import.meta.url).href),
        import(new URL('../src/store.ts', import.meta.url).href),
        import(new URL('../src/services/variables.ts', import.meta.url).href),
      ]);
      return {
        MemoryStore: indexMod.MemoryStore,
        JsonStore: indexMod.JsonStore,
        SQLiteStore: indexMod.SQLiteStore,
        variableKey: storeMod.variableKey,
        VariableService: variablesMod.VariableService,
      };
    } catch {
      throw new Error('Build não encontrado em dist/. Execute "npm run build" ou rode via tsx.', { cause: error });
    }
  }
}

async function measureFileBytes(filePath) {
  let total = 0;
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      total += (await stat(`${filePath}${suffix}`)).size;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return total;
}

function buildResult({ name, store, operation, entries, iterations, totalMs, fileBytes }) {
  const safeMs = Math.max(totalMs, 1e-6);
  return {
    name,
    store,
    operation,
    entries,
    iterations,
    totalMs,
    opsPerSec: iterations / (safeMs / 1000),
    avgUsPerOp: (safeMs * 1000) / iterations,
    fileBytes,
  };
}

function readStateVariable(state, key, now) {
  const expiry = state.variableExpirations?.[key];
  return Object.hasOwn(state.variables, key) && (expiry === undefined || expiry > now)
    ? state.variables[key]
    : undefined;
}

async function benchmarkSingleStore({ kind, createStore, filePath, entries, iterations, names, keys, VariableService }) {
  const clock = () => FIXED_CLOCK_MS;
  const expected = Array.from({ length: entries }, (_, index) => index);
  const warmup = Math.min(iterations, WARMUP_CAP);
  const batchSize = Math.min(2500, Math.max(50, Math.ceil(entries / 4)));
  const bucketCount = Math.max(1, Math.floor(entries / 100));
  const readStride = Math.max(1, Math.floor(entries / Math.max(1, iterations)));

  let store;
  let closed = false;
  let updateTotalMs;
  let readTotalMs;
  let queryTotalMs;
  let readVariableMode;

  try {
    store = createStore();
    const service = new VariableService(store, { guildID: GUILD_ID, authorID: ACTOR_ID }, clock);

    for (let batchStart = 0; batchStart < entries; batchStart += batchSize) {
      const batchEnd = Math.min(entries, batchStart + batchSize);
      await service.transaction(data => {
        for (let index = batchStart; index < batchEnd; index++) {
          data.guild.set(names[index], index);
        }
      });
    }

    let writeCursor = 0;
    const writeStep = async () => {
      const step = writeCursor++;
      const idx = step % entries;
      const nextValue = entries + step;
      await service.set('guild', names[idx], nextValue);
      expected[idx] = nextValue;
    };
    for (let w = 0; w < warmup; w++) await writeStep();
    const updateStart = performance.now();
    for (let i = 0; i < iterations; i++) await writeStep();
    updateTotalMs = performance.now() - updateStart;

    const hasReadVariable = typeof store.readVariable === 'function';
    readVariableMode = hasReadVariable ? 'readVariable' : 'read';
    const readPoint = hasReadVariable
      ? key => store.readVariable(key, clock)
      : key => store.read(state => readStateVariable(state, key, clock()));

    let readCursor = 0;
    const readStep = async () => {
      const idx = (readCursor++ * readStride) % entries;
      const value = await readPoint(keys[idx]);
      assert.equal(value, expected[idx]);
    };
    for (let w = 0; w < warmup; w++) await readStep();
    const readStart = performance.now();
    for (let i = 0; i < iterations; i++) await readStep();
    readTotalMs = performance.now() - readStart;

    let queryCursor = 0;
    const queryStep = async () => {
      const bucket = queryCursor++ % bucketCount;
      const prefix = `k:${String(bucket).padStart(3, '0')}`;
      const page = await service.query('guild', { prefix, limit: QUERY_LIMIT });
      assert.equal(page.entries.length, QUERY_LIMIT);
    };
    for (let w = 0; w < warmup; w++) await queryStep();
    const queryStart = performance.now();
    for (let i = 0; i < iterations; i++) await queryStep();
    queryTotalMs = performance.now() - queryStart;

    await store.close?.();
    closed = true;
  } finally {
    if (store && !closed) {
      await store.close?.();
    }
  }

  const fileBytes = filePath ? await measureFileBytes(filePath) : null;
  return {
    fileBytes,
    readVariableMode,
    results: [
      buildResult({ name: `${kind}.updateSingle`, store: kind, operation: 'updateSingle', entries, iterations, totalMs: updateTotalMs, fileBytes }),
      buildResult({ name: `${kind}.readVariable`, store: kind, operation: 'readVariable', entries, iterations, totalMs: readTotalMs, fileBytes }),
      buildResult({ name: `${kind}.queryPrefix`, store: kind, operation: 'queryPrefix', entries, iterations, totalMs: queryTotalMs, fileBytes }),
    ],
  };
}

export async function runStoreBenchmark(options = {}, providedDeps) {
  const { entries, iterations } = validateBenchmarkOptions(options);
  const deps = providedDeps ?? await loadDefaultDeps();
  const { MemoryStore, JsonStore, SQLiteStore, variableKey, VariableService } = deps;

  const names = Array.from({ length: entries }, (_, index) => `k:${String(index).padStart(5, '0')}`);
  const keys = names.map(name => variableKey('guild', GUILD_ID, name));

  const tempDir = await mkdtemp(join(tmpdir(), 'yuzuha-store-bench-'));
  try {
    const jsonPath = join(tempDir, 'state.json');
    const sqlitePath = join(tempDir, 'state.sqlite');

    const memory = await benchmarkSingleStore({
      kind: 'memory',
      createStore: () => new MemoryStore(),
      filePath: null,
      entries,
      iterations,
      names,
      keys,
      VariableService,
    });
    global.gc?.();

    const json = await benchmarkSingleStore({
      kind: 'json',
      createStore: () => new JsonStore(jsonPath),
      filePath: jsonPath,
      entries,
      iterations,
      names,
      keys,
      VariableService,
    });
    global.gc?.();

    const sqlite = await benchmarkSingleStore({
      kind: 'sqlite',
      createStore: () => new SQLiteStore(sqlitePath),
      filePath: sqlitePath,
      entries,
      iterations,
      names,
      keys,
      VariableService,
    });

    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    return {
      suite: 'store-throughput',
      version: manifest.version,
      date: new Date().toISOString(),
      node: process.versions.node,
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model,
      entries,
      iterations,
      config: { entries, iterations },
      stores: {
        memory: { fileBytes: memory.fileBytes, readMode: memory.readVariableMode },
        json: { fileBytes: json.fileBytes, readMode: json.readVariableMode },
        sqlite: { fileBytes: sqlite.fileBytes, readMode: sqlite.readVariableMode },
      },
      results: [...memory.results, ...json.results, ...sqlite.results],
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function formatStoreBenchmarkReport(report) {
  const rows = report.results.map(row => ({
    name: row.name,
    opsPerSec: row.opsPerSec.toFixed(1),
    totalMs: row.totalMs.toFixed(2),
    avgUsPerOp: row.avgUsPerOp.toFixed(2),
    fileBytes: row.fileBytes === null ? '-' : String(row.fileBytes),
  }));
  const col1 = Math.max('Cenário'.length, ...rows.map(row => row.name.length));
  const col2 = Math.max('ops/s'.length, ...rows.map(row => row.opsPerSec.length));
  const col3 = Math.max('totalMs'.length, ...rows.map(row => row.totalMs.length));
  const col4 = Math.max('avgUs/op'.length, ...rows.map(row => row.avgUsPerOp.length));
  const col5 = Math.max('fileBytes'.length, ...rows.map(row => row.fileBytes.length));
  const header = `${'Cenário'.padEnd(col1)}  ${'ops/s'.padStart(col2)}  ${'totalMs'.padStart(col3)}  ${'avgUs/op'.padStart(col4)}  ${'fileBytes'.padStart(col5)}`;
  const separator = '-'.repeat(header.length);
  return [
    `Yuzuha ${report.version} · Node ${report.node} · ${report.platform}/${report.arch}`,
    `entries=${report.entries}, iterations=${report.iterations}`,
    '',
    header,
    separator,
    ...rows.map(row =>
      `${row.name.padEnd(col1)}  ${row.opsPerSec.padStart(col2)}  ${row.totalMs.padStart(col3)}  ${row.avgUsPerOp.padStart(col4)}  ${row.fileBytes.padStart(col5)}`),
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const cliOptions = parseStoreBenchmarkArgs(process.argv.slice(2));
    const report = await runStoreBenchmark({
      entries: cliOptions.entries,
      iterations: cliOptions.iterations,
    });
    console.log(cliOptions.json ? JSON.stringify(report, null, 2) : formatStoreBenchmarkReport(report));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
