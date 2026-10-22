export function compareReports(current, baseline) {
  for (const field of ['platform', 'arch', 'cpu']) {
    if (current[field] !== baseline[field]) throw new Error(`Baseline incompatível: ${field}.`);
  }
  if (current.node.split('.')[0] !== baseline.node?.split('.')[0]) throw new Error('Baseline incompatível: versão principal do Node.');
  for (const field of ['iterations', 'samples', 'concurrency']) {
    if (current.config[field] !== baseline.config?.[field]) throw new Error(`Baseline incompatível: ${field}.`);
  }
  for (const field of ['catalogSize', 'payloadSize', 'soakRounds']) {
    if (baseline.config?.[field] !== undefined && current.config[field] !== baseline.config[field]) throw new Error(`Baseline incompatível: ${field}.`);
  }
  if (!Array.isArray(baseline.results)) throw new Error('Baseline sem resultados.');
  return current.results.map(row => {
    const previous = baseline.results.find(item => item.name === row.name);
    if (!previous) return { name: row.name, status: 'new' };
    if (!(previous.operationsPerSecond > 0) || !Number.isFinite(previous.operationsPerSecond)) throw new Error(`Baseline inválida: ${row.name}.`);
    const throughputChangePercent = (row.operationsPerSecond / previous.operationsPerSecond - 1) * 100;
    return { name: row.name, status: 'compared', throughputChangePercent,
      regressionPercent: Math.max(0, -throughputChangePercent), heapChangeBytes: row.heapDeltaBytes - previous.heapDeltaBytes };
  });
}
