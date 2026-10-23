export function compareReports(current, baseline) {
  for (const field of ['platform', 'arch', 'cpu']) {
    if (current[field] !== baseline[field]) throw new Error(`Baseline incompatível: ${field}.`);
  }
  if (current.node !== baseline.node) throw new Error('Baseline incompatível: versão exata do Node.');
  if (current.suite !== baseline.suite) throw new Error('Baseline incompatível: suíte.');
  if (baseline.gc !== undefined && current.gc !== baseline.gc) throw new Error('Baseline incompatível: GC explícito.');
  for (const field of ['iterations', 'samples', 'concurrency']) {
    if (current.config[field] !== baseline.config?.[field]) throw new Error(`Baseline incompatível: ${field}.`);
  }
  for (const field of ['catalogSize', 'payloadSize', 'soakRounds', 'stateKeys', 'queueSize', 'pageSize', 'fanout', 'warmup']) {
    if (baseline.config?.[field] !== undefined && current.config[field] !== baseline.config[field]) throw new Error(`Baseline incompatível: ${field}.`);
  }
  if (!Array.isArray(baseline.results)) throw new Error('Baseline sem resultados.');
  return current.results.map(row => {
    const previous = baseline.results.find(item => item.name === row.name);
    if (!previous) return { name: row.name, status: 'new' };
    for (const field of ['iterations', 'unitsPerOperation']) {
      if (previous[field] !== undefined && row[field] !== previous[field]) throw new Error(`Baseline incompatível: ${row.name}.${field}.`);
    }
    if (!(row.operationsPerSecond > 0) || !Number.isFinite(row.operationsPerSecond)) throw new Error(`Medição atual inválida: ${row.name}.`);
    if (!(previous.operationsPerSecond > 0) || !Number.isFinite(previous.operationsPerSecond)) throw new Error(`Baseline inválida: ${row.name}.`);
    const throughputChangePercent = (row.operationsPerSecond / previous.operationsPerSecond - 1) * 100;
    return { name: row.name, status: 'compared', throughputChangePercent,
      regressionPercent: Math.max(0, -throughputChangePercent), heapChangeBytes: row.heapDeltaBytes - previous.heapDeltaBytes };
  });
}
