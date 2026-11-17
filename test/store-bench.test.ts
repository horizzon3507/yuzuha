import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { JsonStore, MemoryStore, SQLiteStore } from '../src/index.js';
import { variableKey } from '../src/store.js';
import { VariableService } from '../src/services/variables.js';

const exec = promisify(execFile);
const benchmarkPath = fileURLToPath(new URL('../benchmarks/store-throughput.mjs', import.meta.url));
const tsxLoader = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;

interface StoreScenarioResult {
  name: string;
  store: 'memory' | 'json' | 'sqlite';
  operation: 'updateSingle' | 'readVariable' | 'queryPrefix';
  entries: number;
  iterations: number;
  totalMs: number;
  opsPerSec: number;
  avgUsPerOp: number;
  fileBytes: number | null;
}

interface StoreBenchmarkReport {
  suite: string;
  version: string;
  date: string;
  node: string;
  platform: string;
  arch: string;
  entries: number;
  iterations: number;
  config: { entries: number; iterations: number };
  stores: {
    memory: { fileBytes: number | null; readMode: string };
    json: { fileBytes: number | null; readMode: string };
    sqlite: { fileBytes: number | null; readMode: string };
  };
  results: StoreScenarioResult[];
}

interface StoreBenchmarkModule {
  parseStoreBenchmarkArgs: (argv: string[]) => { entries: number; iterations: number; json: boolean };
  runStoreBenchmark: (
    options?: { entries?: number; iterations?: number },
    deps?: Partial<{
      MemoryStore: typeof MemoryStore;
      JsonStore: typeof JsonStore;
      SQLiteStore: typeof SQLiteStore;
      VariableService: typeof VariableService;
      variableKey: typeof variableKey;
    }>,
  ) => Promise<StoreBenchmarkReport>;
  formatStoreBenchmarkReport: (report: StoreBenchmarkReport) => string;
}

const bench = await import(new URL('../benchmarks/store-throughput.mjs', import.meta.url).href) as StoreBenchmarkModule;

const EXPECTED_SCENARIOS = [
  'memory.updateSingle',
  'memory.readVariable',
  'memory.queryPrefix',
  'json.updateSingle',
  'json.readVariable',
  'json.queryPrefix',
  'sqlite.updateSingle',
  'sqlite.readVariable',
  'sqlite.queryPrefix',
];

function assertValidReport(report: StoreBenchmarkReport, entries: number, iterations: number): void {
  assert.equal(report.suite, 'store-throughput');
  assert.equal(report.entries, entries);
  assert.equal(report.iterations, iterations);
  assert.deepEqual(report.config, { entries, iterations });
  assert.equal(report.node, process.versions.node);
  assert.equal(typeof report.version, 'string');
  assert.ok(report.version.length > 0);
  assert.deepEqual(report.results.map(row => row.name), EXPECTED_SCENARIOS);

  for (const row of report.results) {
    assert.equal(row.entries, entries);
    assert.equal(row.iterations, iterations);
    assert.ok(Number.isFinite(row.totalMs) && row.totalMs > 0, `${row.name}.totalMs`);
    assert.ok(Number.isFinite(row.opsPerSec) && row.opsPerSec > 0, `${row.name}.opsPerSec`);
    assert.ok(Number.isFinite(row.avgUsPerOp) && row.avgUsPerOp > 0, `${row.name}.avgUsPerOp`);
    if (row.store === 'memory') {
      assert.equal(row.fileBytes, null);
    } else {
      assert.ok(Number.isSafeInteger(row.fileBytes) && (row.fileBytes ?? 0) > 0, `${row.name}.fileBytes`);
      assert.equal(row.fileBytes, report.stores[row.store].fileBytes);
    }
  }

  assert.equal(report.stores.memory.fileBytes, null);
  assert.ok(['read', 'readVariable'].includes(report.stores.sqlite.readMode));
}

test('runStoreBenchmark measures all store scenarios quickly and validates output metrics', async () => {
  const report = await bench.runStoreBenchmark(
    { entries: 200, iterations: 20 },
    { MemoryStore, JsonStore, SQLiteStore, VariableService, variableKey },
  );
  assertValidReport(report, 200, 20);

  const table = bench.formatStoreBenchmarkReport(report);
  assert.match(table, /entries=200, iterations=20/);
  for (const name of EXPECTED_SCENARIOS) {
    assert.ok(table.includes(name), `Tabela sem cenário ${name}`);
  }
});

test('runStoreBenchmark uses readVariable when available on SQLiteStore and rejects invalid options', async () => {
  class SQLiteWithReadVariable extends SQLiteStore {
    override readVariable(key: string, now: () => number) {
      return this.read(state => {
        const expiry = state.variableExpirations?.[key];
        return Object.hasOwn(state.variables, key) && (expiry === undefined || expiry > now())
          ? state.variables[key]
          : undefined;
      });
    }
  }

  const report = await bench.runStoreBenchmark(
    { entries: 100, iterations: 5 },
    { MemoryStore, JsonStore, SQLiteStore: SQLiteWithReadVariable, VariableService, variableKey },
  );
  assertValidReport(report, 100, 5);
  assert.equal(report.stores.sqlite.readMode, 'readVariable');

  for (const bad of [{ entries: 99 }, { entries: 100_001 }, { entries: 100.5 }, { iterations: 0 }, { iterations: 10_001 }]) {
    await assert.rejects(() => bench.runStoreBenchmark(bad), /entries|iterations/);
  }
});

test('parseStoreBenchmarkArgs validates flags and CLI --json runs cleanly in a temp cwd', async () => {
  assert.deepEqual(bench.parseStoreBenchmarkArgs([]), { entries: 10_000, iterations: 100, json: false });
  assert.deepEqual(bench.parseStoreBenchmarkArgs(['--entries', '50000', '--iterations', '25', '--json']), {
    entries: 50_000,
    iterations: 25,
    json: true,
  });

  for (const argv of [
    ['--unknown'],
    ['positional'],
    ['--entries'],
    ['--entries', '--json'],
    ['--entries', '99'],
    ['--entries', '100001'],
    ['--entries', '100.5'],
    ['--iterations', '0'],
    ['--iterations', '10001'],
  ]) {
    assert.throws(() => bench.parseStoreBenchmarkArgs(argv));
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'yuzuha-store-bench-cli-'));
  try {
    const { stdout } = await exec(
      process.execPath,
      ['--import', tsxLoader, benchmarkPath, '--entries', '120', '--iterations', '10', '--json'],
      { cwd: tempDir, timeout: 30_000 },
    );
    const report = JSON.parse(stdout) as StoreBenchmarkReport;
    assertValidReport(report, 120, 10);
    assert.deepEqual(await readdir(tempDir), []);

    await assert.rejects(
      exec(process.execPath, ['--import', tsxLoader, benchmarkPath, '--unknown-flag'], { cwd: tempDir, timeout: 30_000 }),
      error => (error as { code?: number }).code === 1 && /Opção desconhecida/.test((error as { stderr?: string }).stderr ?? ''),
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
