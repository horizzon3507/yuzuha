import test from 'node:test';
import assert from 'node:assert/strict';

const { compareReports } = await import(new URL('../benchmarks/compare.mjs', import.meta.url).href);
const report = () => ({ node: '26.8.2', platform: 'linux', arch: 'x64', cpu: 'fixture',
  config: { iterations: 100, samples: 7, concurrency: 16, catalogSize: 1000, payloadSize: 4096, soakRounds: 5 },
  results: [{ name: 'dispatch/native', operationsPerSecond: 100, heapDeltaBytes: 200 }] });

test('benchmark comparisons distinguish regressions, improvements and new workloads', () => {
  const current = report(), baseline = report();
  current.results[0]!.operationsPerSecond = 80;
  current.results[0]!.heapDeltaBytes = 250;
  current.results.push({ name: 'new', operationsPerSecond: 10, heapDeltaBytes: 0 });
  const rows = compareReports(current, baseline);
  assert.equal(rows[0].status, 'compared');
  assert.ok(Math.abs(rows[0].regressionPercent - 20) < 1e-9);
  assert.equal(rows[0].heapChangeBytes, 50);
  assert.deepEqual(rows[1], { name: 'new', status: 'new' });
  current.results[0]!.operationsPerSecond = 120;
  assert.equal(compareReports(current, baseline)[0].regressionPercent, 0);
});

test('benchmark comparisons refuse incompatible machines, runtimes, settings and corrupt measurements', () => {
  const baseline = report();
  for (const change of [{ platform: 'darwin' }, { arch: 'arm64' }, { cpu: 'other' }, { node: '24.0.0' }, { node: '26.8.3' }]) {
    assert.throws(() => compareReports({ ...report(), ...change }, baseline), /incompatível/);
  }
  const current = report(); current.config.catalogSize++;
  assert.throws(() => compareReports(current, baseline), /catalogSize/);
  baseline.results[0]!.operationsPerSecond = 0;
  assert.throws(() => compareReports(report(), baseline), /inválida/);
});

test('benchmark comparisons reject different suites, GC settings and per-scenario units', () => {
  assert.throws(() => compareReports({ ...report(), suite: 'performance' }, report()), /suíte/);
  assert.throws(() => compareReports({ ...report(), gc: false }, { ...report(), gc: true }), /GC/);
  const baseline = report(), current = report();
  Object.assign(baseline.results[0]!, { unitsPerOperation: 1000 });
  Object.assign(current.results[0]!, { unitsPerOperation: 100 });
  assert.throws(() => compareReports(current, baseline), /unitsPerOperation/);
  for (const name of ['queueSize', 'pageSize', 'fanout', 'warmup']) {
    const old = report(), next = report(); Object.assign(old.config, { [name]: 32 }); Object.assign(next.config, { [name]: 64 });
    assert.throws(() => compareReports(next, old), new RegExp(name));
  }
});

test('older baselines compare common scenarios while new workloads remain unscored', () => {
  const baseline = { ...report(), config: { iterations: 100, samples: 7, concurrency: 16 } };
  const current = report(); current.results.push({ name: 'dispatch/large-catalog', operationsPerSecond: 50, heapDeltaBytes: 0 });
  assert.deepEqual(compareReports(current, baseline).map((row: { status: string }) => row.status), ['compared', 'new']);
});
